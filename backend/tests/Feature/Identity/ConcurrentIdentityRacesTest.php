<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDO;
use PDOException;
use Tests\TestCase;

final class ConcurrentIdentityRacesTest extends TestCase
{
    private string $tempBarrierDir;

    protected function setUp(): void
    {
        parent::setUp();
        $currentDb = DB::selectOne('SELECT current_database() AS db')->db;
        $this->assertSame('gaza_gateway_test', $currentDb, 'Concurrency test must run against live gaza_gateway_test database');
        $this->tempBarrierDir = sys_get_temp_dir() . '/gza_race_' . bin2hex(random_bytes(6));
        if (!is_dir($this->tempBarrierDir)) {
            mkdir($this->tempBarrierDir, 0700, true);
        }
    }

    protected function tearDown(): void
    {
        if (is_dir($this->tempBarrierDir)) {
            $files = glob($this->tempBarrierDir . '/*');
            if ($files) {
                foreach ($files as $f) {
                    if (is_file($f)) {
                        @unlink($f);
                    }
                }
            }
            @rmdir($this->tempBarrierDir);
        }
        parent::tearDown();
    }

    /** Close only after observing exit; terminate then kill owned children on timeout. */
    private function closeOwnedChild(&$process): int
    {
        if (!is_resource($process)) {
            return -1;
        }
        $status = proc_get_status($process);
        if ($status['running']) {
            @proc_terminate($process);
            $deadline = microtime(true) + 0.3;
            do {
                usleep(10000);
                $status = proc_get_status($process);
            } while ($status['running'] && microtime(true) < $deadline);
        }
        if ($status['running']) {
            @proc_terminate($process, 9);
            $deadline = microtime(true) + 2.0;
            do {
                usleep(10000);
                $status = proc_get_status($process);
            } while ($status['running'] && microtime(true) < $deadline);
        }
        if ($status['running']) {
            throw new \RuntimeException('Owned child did not exit within the cleanup deadline.');
        }
        $observedExit = $status['exitcode'];
        $closedExit = proc_close($process);
        $process = null;
        return $closedExit >= 0 ? $closedExit : $observedExit;
    }

    /**
     * Helper to run two real OS child processes racing across an exclusive file barrier.
     * Enforces private STDIN JSON communication, ready-file overlap handshakes,
     * non-blocking output collection with hard deadlines, bounded buffers,
     * safe numeric assertion messages, command arrays, and safe cleanup in finally.
     *
     * @return array{0: array, 1: array}
     */
    private function runTwoProcessRace(
        string $mode1,
        array $payload1,
        string $mode2,
        array $payload2
    ): array {
        $barrierFile = $this->tempBarrierDir . '/barrier_' . uniqid() . '.lock';
        $readyFile1 = $this->tempBarrierDir . '/ready1_' . uniqid() . '.lock';
        $readyFile2 = $this->tempBarrierDir . '/ready2_' . uniqid() . '.lock';

        $barrierFp = fopen($barrierFile, 'c+');
        $this->assertNotFalse($barrierFp);
        flock($barrierFp, LOCK_EX);

        $scriptPath = base_path('scripts/identity-concurrency-probe.php');
        $phpBinary = PHP_BINARY ?: 'php';
        $cmd1 = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode1,
            '--barrier-file=' . $barrierFile,
            '--ready-file=' . $readyFile1,
        ];
        $cmd2 = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode2,
            '--barrier-file=' . $barrierFile,
            '--ready-file=' . $readyFile2,
        ];

        $descriptors = [
            0 => ['pipe', 'r'], // STDIN (write payload)
            1 => ['pipe', 'w'], // STDOUT
            2 => ['pipe', 'w'], // STDERR
        ];

        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql_test',
        ];

        // Pass disposable test APP_KEY via private STDIN
        $appKey = config('app.key');
        $payload1['app_key'] = $appKey;
        $payload2['app_key'] = $appKey;

        $p1 = null;
        $p2 = null;
        $pipes1 = [];
        $pipes2 = [];

        try {
            $p1 = proc_open($cmd1, $descriptors, $pipes1, base_path(), $env);
            $p2 = proc_open($cmd2, $descriptors, $pipes2, base_path(), $env);

            $this->assertIsResource($p1);
            $this->assertIsResource($p2);

            // Write input JSON to child STDIN immediately and close STDIN pipes to prevent deadlocks
            fwrite($pipes1[0], json_encode($payload1, JSON_THROW_ON_ERROR));
            fclose($pipes1[0]);
            unset($pipes1[0]);

            fwrite($pipes2[0], json_encode($payload2, JSON_THROW_ON_ERROR));
            fclose($pipes2[0]);
            unset($pipes2[0]);

            // Wait for both child processes to signal readiness (overlap verification)
            $deadline = microtime(true) + 10.0; // 10 second startup deadline
            $bothReady = false;
            while (microtime(true) < $deadline) {
                if (file_exists($readyFile1) && file_exists($readyFile2)) {
                    $bothReady = true;
                    break;
                }
                usleep(10000); // 10ms poll
            }

            if (!$bothReady) {
                if (is_resource($p1)) {
                    @proc_terminate($p1);
                }
                if (is_resource($p2)) {
                    @proc_terminate($p2);
                }
                $this->fail('Startup timeout: child processes failed to signal readiness before barrier release');
            }

            // Release the barrier: both processes race simultaneously into PostgreSQL
            flock($barrierFp, LOCK_UN);
            fclose($barrierFp);
            $barrierFp = null;

            // Non-blocking collection with 12s deadline and bounded buffer ceiling (64 KiB)
            stream_set_blocking($pipes1[1], false);
            stream_set_blocking($pipes1[2], false);
            stream_set_blocking($pipes2[1], false);
            stream_set_blocking($pipes2[2], false);

            $out1 = '';
            $err1 = '';
            $out2 = '';
            $err2 = '';
            $maxBufferSize = 65536; // 64 KiB ceiling
            $readDeadline = microtime(true) + 12.0;
            $timedOut = false;

            while (microtime(true) < $readDeadline) {
                if (strlen($out1) < $maxBufferSize) {
                    $r1 = stream_get_contents($pipes1[1], $maxBufferSize - strlen($out1));
                    if ($r1 !== false && $r1 !== '') {
                        $out1 .= $r1;
                    }
                }
                if (strlen($err1) < $maxBufferSize) {
                    $e1 = stream_get_contents($pipes1[2], $maxBufferSize - strlen($err1));
                    if ($e1 !== false && $e1 !== '') {
                        $err1 .= $e1;
                    }
                }

                if (strlen($out2) < $maxBufferSize) {
                    $r2 = stream_get_contents($pipes2[1], $maxBufferSize - strlen($out2));
                    if ($r2 !== false && $r2 !== '') {
                        $out2 .= $r2;
                    }
                }
                if (strlen($err2) < $maxBufferSize) {
                    $e2 = stream_get_contents($pipes2[2], $maxBufferSize - strlen($err2));
                    if ($e2 !== false && $e2 !== '') {
                        $err2 .= $e2;
                    }
                }

                $status1 = proc_get_status($p1);
                $status2 = proc_get_status($p2);

                if (!$status1['running'] && !$status2['running']) {
                    // Drain any remaining output up to buffer ceiling
                    if (strlen($out1) < $maxBufferSize) {
                        $out1 .= (string) stream_get_contents($pipes1[1], $maxBufferSize - strlen($out1));
                    }
                    if (strlen($err1) < $maxBufferSize) {
                        $err1 .= (string) stream_get_contents($pipes1[2], $maxBufferSize - strlen($err1));
                    }
                    if (strlen($out2) < $maxBufferSize) {
                        $out2 .= (string) stream_get_contents($pipes2[1], $maxBufferSize - strlen($out2));
                    }
                    if (strlen($err2) < $maxBufferSize) {
                        $err2 .= (string) stream_get_contents($pipes2[2], $maxBufferSize - strlen($err2));
                    }
                    break;
                }

                usleep(10000); // 10ms
            }

            $status1 = proc_get_status($p1);
            $status2 = proc_get_status($p2);
            if ($status1['running'] || $status2['running']) {
                $timedOut = true;
                if ($status1['running']) {
                    @proc_terminate($p1);
                }
                if ($status2['running']) {
                    @proc_terminate($p2);
                }
            }

            if (isset($pipes1[1]) && is_resource($pipes1[1])) {
                fclose($pipes1[1]);
                unset($pipes1[1]);
            }
            if (isset($pipes1[2]) && is_resource($pipes1[2])) {
                fclose($pipes1[2]);
                unset($pipes1[2]);
            }
            if (isset($pipes2[1]) && is_resource($pipes2[1])) {
                fclose($pipes2[1]);
                unset($pipes2[1]);
            }
            if (isset($pipes2[2]) && is_resource($pipes2[2])) {
                fclose($pipes2[2]);
                unset($pipes2[2]);
            }

            $exit1 = $this->closeOwnedChild($p1);
            $p1 = null;
            $exit2 = $this->closeOwnedChild($p2);
            $p2 = null;

            if ($timedOut) {
                $this->fail(sprintf(
                    'Process race deadline exceeded (running1=%d, running2=%d, out1_bytes=%d, out2_bytes=%d)',
                    (int) $status1['running'],
                    (int) $status2['running'],
                    strlen($out1),
                    strlen($out2)
                ));
            }

            $this->assertSame(
                0,
                $exit1,
                sprintf('Process 1 exited with code %d (out_bytes=%d, err_bytes=%d)', $exit1, strlen($out1), strlen($err1))
            );
            $this->assertSame(
                0,
                $exit2,
                sprintf('Process 2 exited with code %d (out_bytes=%d, err_bytes=%d)', $exit2, strlen($out2), strlen($err2))
            );

            $res1 = json_decode($out1, true);
            $res2 = json_decode($out2, true);

            $this->assertIsArray(
                $res1,
                sprintf('Process 1 produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out1), strlen($err1))
            );
            $this->assertIsArray(
                $res2,
                sprintf('Process 2 produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out2), strlen($err2))
            );

            return [$res1, $res2];
        } finally {
            if ($barrierFp !== null && is_resource($barrierFp)) {
                @flock($barrierFp, LOCK_UN);
                @fclose($barrierFp);
            }
            foreach ([$pipes1, $pipes2] as $pipes) {
                foreach ($pipes as $p) {
                    if (is_resource($p)) {
                        @fclose($p);
                    }
                }
            }
            if ($p1 !== null && is_resource($p1)) {
                @proc_terminate($p1);
                $this->closeOwnedChild($p1);
            }
            if ($p2 !== null && is_resource($p2)) {
                @proc_terminate($p2);
                $this->closeOwnedChild($p2);
            }
            @unlink($barrierFile);
            @unlink($readyFile1);
            @unlink($readyFile2);
        }
    }

    /**
     * Prove rate limit race with two real operating system processes competing for the last budget slot.
     * Enforces: total accepted <= budget, count is exact, no overspend.
     */
    public function test_concurrent_process_race_on_rate_limiter_never_overspends(): void
    {
        $subject = 'race_user_' . bin2hex(random_bytes(6));
        $ip = '198.51.100.99';

        // Pre-charge 4 slots out of limit 5
        $limiter = new DurableRateLimiter(DB::connection());
        for ($i = 0; $i < 4; $i++) {
            $res = $limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
            $this->assertTrue($res->allowed);
        }

        // Only 1 slot remains before limit (5) is exceeded!
        [$res1, $res2] = $this->runTwoProcessRace(
            'rate-limit',
            ['realm' => 'passenger', 'operation' => 'login', 'subject' => $subject, 'ip' => $ip],
            'rate-limit',
            ['realm' => 'passenger', 'operation' => 'login', 'subject' => $subject, 'ip' => $ip]
        );

        // Exactly one process must be allowed, and one denied
        $allowedCount = ($res1['allowed'] ? 1 : 0) + ($res2['allowed'] ? 1 : 0);
        $this->assertSame(1, $allowedCount, 'Exactly one of the concurrent processes must succeed on the last budget slot');

        // Check database count: must be exactly 5 (never 6)
        $keyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'ip' => $ip,
            'subject_digest' => hash('sha256', $subject),
        ]);
        $dbRow = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $keyDigest)
            ->first();

        $this->assertNotNull($dbRow);
        $this->assertSame(5, (int) $dbRow->count, 'Database count must be exactly 5, proving no overspend in concurrency race');
    }

    /**
     * Prove atomic passenger session rotation race with two real operating system processes
     * competing to rotate the SAME session.
     * Enforces: exactly one successor session is created, the other process fails, and at most one active successor exists.
     */
    public function test_concurrent_passenger_session_rotation_race_guarantees_at_most_one_active_successor(): void
    {
        $userId = (string) Str::uuid();
        $email = 'race_rotate_pass_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $encrypter = $this->app->make(Encrypter::class);
        $store = new PassengerSessionStore(DB::connection(), $encrypter);
        $receipt = $store->issueFull($userId, 1);
        $token = $receipt->getRawToken();
        $oldSessionId = $receipt->sessionId;

        [$res1, $res2] = $this->runTwoProcessRace(
            'session-rotate',
            ['realm' => 'passenger', 'token' => $token],
            'session-rotate',
            ['realm' => 'passenger', 'token' => $token]
        );

        // Exactly one process succeeded, and the other failed
        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in rotating the old session');

        // Verify database state:
        // 1. Old session is revoked
        $oldRow = DB::table('passenger_sessions')->where('id', $oldSessionId)->first();
        $this->assertNotNull($oldRow);
        $this->assertNotNull($oldRow->revoked_at, 'Original session must be revoked');

        // 2. Exactly ONE active session exists for this user in the database
        $activeSessions = DB::table('passenger_sessions')
            ->where('user_id', $userId)
            ->whereNull('revoked_at')
            ->get();

        $this->assertCount(1, $activeSessions, 'At most one active successor session must exist in the database');
    }

    /**
     * Prove atomic staff session rotation race with two real operating system processes
     * competing to rotate the SAME staff session.
     */
    public function test_concurrent_staff_session_rotation_race_guarantees_at_most_one_active_successor(): void
    {
        $staffId = (string) Str::uuid();
        $now = CarbonImmutable::now();

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_race_' . bin2hex(random_bytes(4)),
            'email' => 'staff_race_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff Race',
            'full_name_ar' => 'سباق الموظفين',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        $encrypter = $this->app->make(Encrypter::class);
        $store = new StaffSessionStore(DB::connection(), $encrypter);
        $receipt = $store->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now->subSeconds(30),
        );
        $token = $receipt->getRawToken();
        $oldSessionId = $receipt->sessionId;

        [$res1, $res2] = $this->runTwoProcessRace(
            'session-rotate',
            ['realm' => 'staff', 'token' => $token],
            'session-rotate',
            ['realm' => 'staff', 'token' => $token]
        );

        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in rotating staff session');

        $oldRow = DB::table('staff_sessions')->where('id', $oldSessionId)->first();
        $this->assertNotNull($oldRow);
        $this->assertNotNull($oldRow->revoked_at, 'Original staff session must be revoked');

        $activeSessions = DB::table('staff_sessions')
            ->where('staff_id', $staffId)
            ->whereNull('revoked_at')
            ->get();

        $this->assertCount(1, $activeSessions, 'At most one active successor session must exist in the database');
    }

    /**
     * Prove that a concurrent race between rotate and revokePrincipal guarantees that NO
     * stale successor survives principal-wide revocation.
     */
    public function test_concurrent_session_rotation_vs_revoke_principal_leaves_zero_stale_successors(): void
    {
        $userId = (string) Str::uuid();
        $email = 'race_revokeprinc_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $encrypter = $this->app->make(Encrypter::class);
        $store = new PassengerSessionStore(DB::connection(), $encrypter);
        $receipt = $store->issueFull($userId, 1);
        $token = $receipt->getRawToken();

        [$resRotate, $resRevoke] = $this->runTwoProcessRace(
            'session-rotate',
            ['realm' => 'passenger', 'token' => $token],
            'revoke-principal',
            ['realm' => 'passenger', 'principal_id' => $userId]
        );

        // Verify: Either revokePrincipal won and rotation failed, OR rotation succeeded first and revokePrincipal revoked it too.
        // In all cases: If revokePrincipal executed after rotation, active count is 0. If revokePrincipal executed first, rotation failed and active count is 0.
        // Therefore active sessions for this user MUST be either 0 (revokePrincipal cleaned up or blocked rotate) or 1 (if rotate committed after revoke started, but our locks prevent that!).
        // Due to strict principal lock order (both lock users row first FOR UPDATE):
        // Whichever wins the lock on user row executes to completion!
        // If revokePrincipal wins user lock: it revokes old session. Then rotate acquires user lock, checks old session, sees it revoked, and FAILS! Active count = 0.
        // If rotate wins user lock: it creates rotated session. Then revokePrincipal acquires user lock, finds all active sessions (including the new one), and REVOKES THEM ALL! Active count = 0!
        // In BOTH interleavings: active sessions for this user is EXACTLY 0!
        $activeSessions = DB::table('passenger_sessions')
            ->where('user_id', $userId)
            ->whereNull('revoked_at')
            ->get();

        $this->assertCount(0, $activeSessions, 'No stale active session may survive a concurrent revokePrincipal race');
    }

    /**
     * Prove two distinct PDO database connections enforce row locks and prevent concurrent access
     * with real blocked lock contention throwing SQLSTATE 55P03 (lock_not_available) under lock_timeout.
     */
    public function test_two_distinct_pdo_connections_enforce_row_lock_contention(): void
    {
        $config = config('database.connections.pgsql_test');
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $config['host'], $config['port'], $config['database']);

        $pdo1 = new PDO($dsn, $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo2 = new PDO($dsn, $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        $sessionId = (string) Str::uuid();
        $lookupDigest = hash('sha256', 'pdo-contention-token-' . uniqid());

        // Insert test session
        $pdo1->prepare("
            INSERT INTO passenger_sessions (id, lookup_digest, user_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
            VALUES (?, ?, NULL, 'anonymous', NULL, 'enc', NOW(), NOW() + INTERVAL '1 hour', NOW() + INTERVAL '30 min', NOW())
        ")->execute([$sessionId, $lookupDigest]);

        // Connection 1 begins transaction and locks row FOR UPDATE
        $pdo1->beginTransaction();
        $stmt1 = $pdo1->prepare("SELECT id, revoked_at FROM passenger_sessions WHERE lookup_digest = ? FOR UPDATE");
        $stmt1->execute([$lookupDigest]);
        $row1 = $stmt1->fetch(PDO::FETCH_ASSOC);
        $this->assertNotNull($row1);

        // Connection 2 sets short lock_timeout (200ms) and attempts to acquire FOR UPDATE lock on the SAME row
        $pdo2->beginTransaction();
        $pdo2->exec("SET lock_timeout = '200ms'");

        $timedOut = false;
        try {
            $stmt2 = $pdo2->prepare("SELECT id, revoked_at FROM passenger_sessions WHERE lookup_digest = ? FOR UPDATE");
            $stmt2->execute([$lookupDigest]);
            $stmt2->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // PostgreSQL SQLSTATE 55P03 is lock_not_available
            if ($e->getCode() === '55P03' || str_contains($e->getMessage(), '55P03') || str_contains($e->getMessage(), 'canceling statement due to lock timeout')) {
                $timedOut = true;
            } else {
                throw $e;
            }
        } finally {
            $pdo2->rollBack();
            $pdo1->rollBack();
        }

        $this->assertTrue($timedOut, 'Connection 2 must be blocked by Connection 1 row lock and throw 55P03 lock timeout');
    }

    /**
     * Prove that concurrent session issue against credential epoch change serializes safely:
     * either issue completes before epoch increment (in which case the resulting session is
     * immediately stale and rejected on subsequent read), or issue observes the new epoch and fails.
     */
    public function test_concurrent_issue_full_vs_credential_epoch_change_serialized_outcome(): void
    {
        $userId = (string) Str::uuid();
        $email = 'race_epoch_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        [$resIssue, $resEpoch] = $this->runTwoProcessRace(
            'session-issue-full',
            ['realm' => 'passenger', 'principal_id' => $userId, 'epoch' => 1],
            'epoch-change',
            ['realm' => 'passenger', 'principal_id' => $userId, 'new_epoch' => 2]
        );

        // Epoch change must succeed
        $this->assertTrue($resEpoch['success'] ?? false, 'Epoch change process must succeed');
        $userCurrentEpoch = (int) DB::table('users')->where('id', $userId)->value('credential_epoch');
        $this->assertSame(2, $userCurrentEpoch, 'User must now be at credential epoch 2');

        if ($resIssue['success'] ?? false) {
            // If issue-full committed before epoch-change, the session was issued with epoch 1
            $this->assertArrayHasKey('token', $resIssue);
            $token = $resIssue['token'];

            $encrypter = $this->app->make(Encrypter::class);
            $store = new PassengerSessionStore(DB::connection(), $encrypter);
            $readResult = $store->read($token);

            $this->assertNull($readResult, 'Session issued under epoch 1 must be rejected and revoked when read against user epoch 2');

            $sessRow = DB::table('passenger_sessions')->where('id', $resIssue['session_id'])->first();
            $this->assertNotNull($sessRow);
            $this->assertNotNull($sessRow->revoked_at, 'Stale epoch session must be marked revoked in database');
        } else {
            // Otherwise, issue-full failed due to epoch mismatch during lock evaluation
            $this->assertFalse($resIssue['success']);
        }
    }

    /**
     * Prove that reading a session beyond its expiry window fails, marks the session revoked,
     * and never touches/renews last_seen_at.
     */
    public function test_concurrent_session_read_after_waiting_beyond_expiry_fails_and_never_renews(): void
    {
        $userId = (string) Str::uuid();
        $email = 'race_exp_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $encrypter = $this->app->make(Encrypter::class);
        $store = new PassengerSessionStore(DB::connection(), $encrypter);
        $receipt = $store->issueFull($userId, 1);
        $token = $receipt->getRawToken();
        $sessionId = $receipt->sessionId;

        // Force session into expired state in the past (preserving absolute_expires_at > issued_at constraint)
        $past = CarbonImmutable::now()->subMinutes(10);
        $issued = $past->subHours(2);
        DB::table('passenger_sessions')->where('id', $sessionId)->update([
            'issued_at' => $issued->toIso8601String(),
            'idle_expires_at' => $past->toIso8601String(),
            'absolute_expires_at' => $past->toIso8601String(),
            'last_seen_at' => $past->toIso8601String(),
        ]);

        // Race two concurrent processes reading the expired session
        [$resRead1, $resRead2] = $this->runTwoProcessRace(
            'session-read',
            ['realm' => 'passenger', 'token' => $token],
            'session-read',
            ['realm' => 'passenger', 'token' => $token]
        );

        $this->assertFalse($resRead1['success'], 'Read process 1 must report false on expired session');
        $this->assertFalse($resRead2['success'], 'Read process 2 must report false on expired session');

        // Verify database state: last_seen_at was NEVER touched forward on expired read
        $row = DB::table('passenger_sessions')->where('id', $sessionId)->first();
        $this->assertNotNull($row);
        $this->assertSame(
            $past->toIso8601String(),
            CarbonImmutable::parse($row->last_seen_at)->toIso8601String(),
            'last_seen_at must never be renewed on expired session read'
        );
    }

    /**
     * Prove that a concurrent race between staff session issue and MFA revocation guarantees
     * that no active session survives with revoked MFA credentials.
     */
    public function test_concurrent_staff_issue_full_vs_mfa_revocation_race(): void
    {
        $staffId = (string) Str::uuid();
        $now = CarbonImmutable::now();

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_mfarace_' . bin2hex(random_bytes(4)),
            'email' => 'staff_mfarace_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff MFA Race',
            'full_name_ar' => 'سباق المصادقة',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        [$resIssue, $resRevoke] = $this->runTwoProcessRace(
            'session-issue-full',
            ['realm' => 'staff', 'principal_id' => $staffId, 'epoch' => 1, 'mfa_version' => 1],
            'mfa-revoke',
            ['staff_id' => $staffId, 'mfa_version' => 1]
        );

        $this->assertTrue($resRevoke['success'] ?? false, 'MFA revocation process must succeed');

        $mfaCred = DB::table('staff_mfa_credentials')->where('staff_id', $staffId)->where('version', 1)->first();
        $this->assertNotNull($mfaCred);
        $this->assertNotNull($mfaCred->revoked_at, 'MFA credential must be marked revoked');

        if ($resIssue['success'] ?? false) {
            $this->assertArrayHasKey('token', $resIssue);
            $token = $resIssue['token'];

            $encrypter = $this->app->make(Encrypter::class);
            $store = new StaffSessionStore(DB::connection(), $encrypter);
            $readResult = $store->read($token);

            $this->assertNull($readResult, 'Staff session issued right before MFA revocation must be rejected on read');

            $sessRow = DB::table('staff_sessions')->where('id', $resIssue['session_id'])->first();
            $this->assertNotNull($sessRow);
            $this->assertNotNull($sessRow->revoked_at, 'Session with revoked MFA must be marked revoked in database');
        } else {
            $this->assertFalse($resIssue['success']);
        }
    }

    /**
     * Helper to run a real OS child process racing against a parent-held PostgreSQL row lock.
     * 1. Parent opens dedicated PDO connection and acquires FOR UPDATE row lock in an uncommitted transaction.
     * 2. Child starts, signals readiness via ready file, and blocks on PostgreSQL lock wait.
     * 3. Parent verifies child is observed blocked in pg_stat_activity with wait_event_type = 'Lock'.
     * 4. Callback is invoked while child is blocked (e.g. updating clock-file across expiry/window).
     * 5. Parent releases the lock (commit/rollback).
     * 6. Child acquires lock, completes execution, and exits.
     * 7. Parent reaps child and returns parsed JSON output.
     *
     * @return array
     */
    private function runChildWithParentLockWait(
        string $mode,
        array $payload,
        string $clockFile,
        \Closure $acquireParentLock,
        \Closure $onBlockedCallback
    ): array {
        $readyFile = $this->tempBarrierDir . '/ready_lockwait_' . uniqid() . '.lock';

        $config = config('database.connections.pgsql_test');
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $config['host'], $config['port'], $config['database']);
        $pdo = new PDO($dsn, $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        // 1. Parent acquires precise row lock in open transaction
        $pdo->beginTransaction();
        $acquireParentLock($pdo);
        $parentBackendPid = (int) $pdo->query('SELECT pg_backend_pid()')->fetchColumn();

        $scriptPath = base_path('scripts/identity-concurrency-probe.php');
        $phpBinary = PHP_BINARY ?: 'php';
        $cmd = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode,
            '--ready-file=' . $readyFile,
            '--clock-file=' . $clockFile,
        ];

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql_test',
        ];

        $payload['app_key'] = config('app.key');
        $payload['clock_file'] = $clockFile;

        $p = null;
        $pipes = [];

        try {
            $p = proc_open($cmd, $descriptors, $pipes, base_path(), $env);
            $this->assertIsResource($p);

            fwrite($pipes[0], json_encode($payload, JSON_THROW_ON_ERROR));
            fclose($pipes[0]);
            unset($pipes[0]);

            // Wait for child readiness
            $readyDeadline = microtime(true) + 8.0;
            $isReady = false;
            while (microtime(true) < $readyDeadline) {
                if (file_exists($readyFile)) {
                    $isReady = true;
                    break;
                }
                usleep(10000); // 10ms
            }
            $this->assertTrue($isReady, 'Child must signal readiness before lock contention check');

            // 2. Observe child blocked in pg_stat_activity with wait_event_type = 'Lock'
            $blockedDeadline = microtime(true) + 8.0;
            $observedBlocked = false;
            while (microtime(true) < $blockedDeadline) {
                $status = proc_get_status($p);
                if (!$status['running']) {
                    break;
                }
                $statRows = DB::select("
                    SELECT pid, wait_event_type, wait_event, state
                    FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock'
                      AND state = 'active'
                      AND pid = CAST(? AS integer)
                      AND CAST(? AS integer) = ANY(pg_blocking_pids(pid))
                ", [(int) file_get_contents($readyFile), $parentBackendPid]);
                if (!empty($statRows)) {
                    $observedBlocked = true;
                    break;
                }
                usleep(10000); // 10ms
            }

            $this->assertTrue($observedBlocked, 'Child process must be observed blocked on PostgreSQL row lock in pg_stat_activity');

            // 3. Invoke callback while child is confirmed blocked (e.g. advance clock file)
            $onBlockedCallback();

            // 4. Release parent lock so child unblocks and derives fresh post-lock state
            $pdo->rollBack();

            // 5. Collect child output with deadline and bounded buffer
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);

            $out = '';
            $err = '';
            $maxBufferSize = 65536;
            $readDeadline = microtime(true) + 10.0;
            $timedOut = false;

            while (microtime(true) < $readDeadline) {
                if (strlen($out) < $maxBufferSize) {
                    $r = stream_get_contents($pipes[1], $maxBufferSize - strlen($out));
                    if ($r !== false && $r !== '') {
                        $out .= $r;
                    }
                }
                if (strlen($err) < $maxBufferSize) {
                    $e = stream_get_contents($pipes[2], $maxBufferSize - strlen($err));
                    if ($e !== false && $e !== '') {
                        $err .= $e;
                    }
                }

                $status = proc_get_status($p);
                if (!$status['running']) {
                    if (strlen($out) < $maxBufferSize) {
                        $out .= (string) stream_get_contents($pipes[1], $maxBufferSize - strlen($out));
                    }
                    if (strlen($err) < $maxBufferSize) {
                        $err .= (string) stream_get_contents($pipes[2], $maxBufferSize - strlen($err));
                    }
                    break;
                }
                usleep(10000); // 10ms
            }

            $status = proc_get_status($p);
            if ($status['running']) {
                $timedOut = true;
                @proc_terminate($p);
            }

            if (isset($pipes[1]) && is_resource($pipes[1])) {
                fclose($pipes[1]);
                unset($pipes[1]);
            }
            if (isset($pipes[2]) && is_resource($pipes[2])) {
                fclose($pipes[2]);
                unset($pipes[2]);
            }

            $exitCode = $this->closeOwnedChild($p);
            $p = null;

            if ($timedOut) {
                $this->fail(sprintf('Child process timed out waiting for completion (out_bytes=%d)', strlen($out)));
            }

            $this->assertSame(
                0,
                $exitCode,
                sprintf('Child process exited with code %d (out_bytes=%d, err_bytes=%d)', $exitCode, strlen($out), strlen($err))
            );

            $res = json_decode($out, true);
            $this->assertIsArray(
                $res,
                sprintf('Child process produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out), strlen($err))
            );

            return $res;
        } finally {
            try {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
            } catch (\Throwable) {
            }
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    @fclose($pipe);
                }
            }
            if ($p !== null && is_resource($p)) {
                @proc_terminate($p);
                $this->closeOwnedChild($p);
            }
            @unlink($readyFile);
        }
    }

    /**
     * Prove that reading a passenger session after waiting on a PostgreSQL lock beyond expiry
     * evaluates fresh post-lock time, fails, and never touches or renews last_seen_at.
     */
    public function test_two_process_passenger_read_does_not_touch_or_renew_after_lock_wait_crosses_expiry(): void
    {
        $userId = (string) Str::uuid();
        $email = 'pass_lock_exp_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $t0 = 1700000000;
        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) $t0);

        $encrypter = $this->app->make(Encrypter::class);
        $token = \App\Identity\Tokens\OpaqueToken::generate('passenger', 'full_session');
        $csrfToken = \App\Identity\Tokens\OpaqueToken::generate('passenger', 'csrf')->getSecretToken();
        $sessionId = (string) Str::uuid();
        $issuedAt = CarbonImmutable::createFromTimestamp($t0);
        $absoluteExpiresAt = $issuedAt->addSeconds(86400);
        $idleExpiresAt = $issuedAt->addSeconds(1800);

        $payload = ['csrf_token' => $csrfToken];
        $encryptedPayload = $encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        DB::table('passenger_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'user_id' => $userId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $issuedAt->toIso8601String(),
            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
            'last_seen_at' => $issuedAt->toIso8601String(),
            'revoked_at' => null,
        ]);

        $res = $this->runChildWithParentLockWait(
            mode: 'session-read',
            payload: ['realm' => 'passenger', 'token' => $token->getSecretToken()],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) use ($userId) {
                $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
                $stmt->execute([$userId]);
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($clockFile, $t0) {
                file_put_contents($clockFile, (string) ($t0 + 1801));
            }
        );

        $this->assertFalse($res['success'], 'Read must fail after lock wait crossed idle expiry');

        $row = DB::table('passenger_sessions')->where('id', $sessionId)->first();
        $this->assertNotNull($row);
        $this->assertSame(
            $issuedAt->toIso8601String(),
            CarbonImmutable::parse($row->last_seen_at)->toIso8601String(),
            'last_seen_at must never be touched or renewed after lock wait crossed expiry'
        );
        @unlink($clockFile);
    }

    /**
     * Prove that reading a staff session after waiting on a PostgreSQL lock beyond expiry
     * evaluates fresh post-lock time, fails, and never touches or renews last_seen_at.
     */
    public function test_two_process_staff_read_does_not_touch_or_renew_after_lock_wait_crosses_expiry(): void
    {
        $staffId = (string) Str::uuid();
        $now = CarbonImmutable::now();

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_lock_exp_' . bin2hex(random_bytes(4)),
            'email' => 'staff_lock_exp_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff Lock Exp',
            'full_name_ar' => 'انتهاء صلاحية القفل',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        $t0 = 1700000000;
        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) $t0);

        $encrypter = $this->app->make(Encrypter::class);
        $token = \App\Identity\Tokens\OpaqueToken::generate('staff', 'full_session');
        $csrfToken = \App\Identity\Tokens\OpaqueToken::generate('staff', 'csrf')->getSecretToken();
        $sessionId = (string) Str::uuid();
        $issuedAt = CarbonImmutable::createFromTimestamp($t0);
        $absoluteExpiresAt = $issuedAt->addSeconds(28800);
        $idleExpiresAt = $issuedAt->addSeconds(900);

        $payload = ['csrf_token' => $csrfToken, 'mfa_verified_at' => $issuedAt->toIso8601String()];
        $encryptedPayload = $encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        DB::table('staff_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'staff_id' => $staffId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'mfa_version' => 1,
            'mfa_verified_at' => $issuedAt->toIso8601String(),
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $issuedAt->toIso8601String(),
            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
            'last_seen_at' => $issuedAt->toIso8601String(),
            'revoked_at' => null,
        ]);

        $res = $this->runChildWithParentLockWait(
            mode: 'session-read',
            payload: ['realm' => 'staff', 'token' => $token->getSecretToken()],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) use ($staffId) {
                $stmt = $pdo->prepare('SELECT id FROM staff_users WHERE id = ? FOR UPDATE');
                $stmt->execute([$staffId]);
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($clockFile, $t0) {
                file_put_contents($clockFile, (string) ($t0 + 901));
            }
        );

        $this->assertFalse($res['success'], 'Staff read must fail after lock wait crossed idle expiry');

        $row = DB::table('staff_sessions')->where('id', $sessionId)->first();
        $this->assertNotNull($row);
        $this->assertSame(
            $issuedAt->toIso8601String(),
            CarbonImmutable::parse($row->last_seen_at)->toIso8601String(),
            'staff last_seen_at must never be touched or renewed after lock wait crossed expiry'
        );
        @unlink($clockFile);
    }

    /**
     * Prove that staff session issuance evaluates proof age post-lock and rejects proof whose age
     * crosses >= 300s during lock wait contention.
     */
    public function test_two_process_staff_issuance_evaluates_post_lock_proof_age_and_rejects_expired_proof(): void
    {
        $staffId = (string) Str::uuid();
        $now = CarbonImmutable::now();

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_postlock_' . bin2hex(random_bytes(4)),
            'email' => 'staff_postlock_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff PostLock',
            'full_name_ar' => 'إثبات ما بعد القفل',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        $t0 = 1700000000;
        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        // At child start: proof verified at t0, clock is t0 + 10s (fresh, age 10s < 300s)
        file_put_contents($clockFile, (string) ($t0 + 10));

        $res = $this->runChildWithParentLockWait(
            mode: 'session-issue-full',
            payload: [
                'realm' => 'staff',
                'principal_id' => $staffId,
                'epoch' => 1,
                'mfa_version' => 1,
                'mfa_verified_at' => $t0,
            ],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) use ($staffId) {
                $stmt = $pdo->prepare('SELECT id FROM staff_users WHERE id = ? FOR UPDATE');
                $stmt->execute([$staffId]);
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($clockFile, $t0) {
                // While child is blocked, advance clock to t0 + 300 (age >= 300s boundary)
                file_put_contents($clockFile, (string) ($t0 + 300));
            }
        );

        $this->assertFalse($res['success'], 'Staff issuance must fail when proof age reaches >= 300s post-lock');
        $this->assertSame('mfa_expired_timestamp', $res['error_code'] ?? null);

        $sessionCount = DB::table('staff_sessions')->where('staff_id', $staffId)->count();
        $this->assertSame(0, $sessionCount, 'No staff session may be created when proof expires during lock wait');
        @unlink($clockFile);
    }

    /**
     * Prove that rate charge retries to the current window after waiting on a PostgreSQL lock
     * across a window boundary, never charging the expired window.
     */
    public function test_two_process_rate_charge_retries_to_current_window_after_lock_wait_across_boundary(): void
    {
        $subject = 'race_drift_' . bin2hex(random_bytes(4));
        $ip = '198.51.' . mt_rand(10, 200) . '.' . mt_rand(1, 250);

        $t0 = 1700000040;
        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) $t0);

        $subjectDigest = hash('sha256', $subject);
        $subjectKeyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'ip' => $ip,
            'subject_digest' => $subjectDigest,
        ]);
        $ipKeyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'ip' => $ip,
        ]);

        $subjectWindowStartTimestamp = (int) (floor($t0 / 60) * 60); // 1700000040
        $subjectWindowEndTimestamp = $subjectWindowStartTimestamp + 60; // 1700000100
        $ipWindowStartTimestamp = (int) (floor($t0 / 300) * 300); // 1699999800
        $ipWindowEndTimestamp = $ipWindowStartTimestamp + 300; // 1700000100

        $subjectWindow1Start = CarbonImmutable::createFromTimestamp($subjectWindowStartTimestamp);
        $subjectWindow1End = CarbonImmutable::createFromTimestamp($subjectWindowEndTimestamp);
        $subjectWindow2Start = CarbonImmutable::createFromTimestamp($subjectWindowEndTimestamp);

        // Pre-insert both targets. Target 1 (ip) is locked first lexicographically.
        DB::table('security_rate_limits')->insert([
            [
                'realm' => 'passenger',
                'operation_id' => 'login',
                'budget_id' => 'ip',
                'key_digest' => $ipKeyDigest,
                'window_start' => CarbonImmutable::createFromTimestamp($ipWindowStartTimestamp)->toIso8601String(),
                'window_end' => CarbonImmutable::createFromTimestamp($ipWindowEndTimestamp)->toIso8601String(),
                'count' => 0,
            ],
            [
                'realm' => 'passenger',
                'operation_id' => 'login',
                'budget_id' => 'subject_ip',
                'key_digest' => $subjectKeyDigest,
                'window_start' => $subjectWindow1Start->toIso8601String(),
                'window_end' => $subjectWindow1End->toIso8601String(),
                'count' => 0,
            ],
        ]);

        $res = $this->runChildWithParentLockWait(
            mode: 'rate-limit',
            payload: [
                'realm' => 'passenger',
                'operation_id' => 'login',
                'subject' => $subject,
                'ip' => $ip,
            ],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) use ($ipKeyDigest, $ipWindowStartTimestamp) {
                // Parent locks Target 1 (ip) which is the first target locked by child
                $stmt = $pdo->prepare('
                    SELECT count FROM security_rate_limits
                    WHERE realm = ? AND operation_id = ? AND budget_id = ? AND key_digest = ? AND window_start = ?
                    FOR UPDATE
                ');
                $stmt->execute([
                    'passenger',
                    'login',
                    'ip',
                    $ipKeyDigest,
                    CarbonImmutable::createFromTimestamp($ipWindowStartTimestamp)->toIso8601String(),
                ]);
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($clockFile, $subjectWindowEndTimestamp) {
                // Advance clock past the subject_ip (and ip) window boundary
                file_put_contents($clockFile, (string) ($subjectWindowEndTimestamp + 5));
            }
        );

        $this->assertTrue($res['allowed'], 'Rate charge must succeed by retrying to current window');

        // Verify Window 1 (expired): count must still be 0 (no charge on expired window)
        $row1 = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', $subjectWindow1Start->toIso8601String())
            ->first();
        $this->assertNotNull($row1);
        $this->assertSame(0, (int) $row1->count, 'Expired window must have count 0 (no past charge)');

        // Verify Window 2 (current): count must be 1 (fresh window charged)
        $row2 = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', $subjectWindow2Start->toIso8601String())
            ->first();
        $this->assertNotNull($row2);
        $this->assertSame(1, (int) $row2->count, 'Current window must be charged after lock wait drift retry');
        @unlink($clockFile);
    }

    /**
     * Prove that rate limit denial leaves zero increment on sibling budget and reports truthful RetryAfter.
     */
    public function test_rate_charge_denial_leaves_zero_increment_on_sibling_budget_and_reports_truthful_retry_after(): void
    {
        $subject = 'sibling_user_' . bin2hex(random_bytes(4));
        $ip = '198.51.' . mt_rand(10, 200) . '.' . mt_rand(1, 250);

        $limiter = new DurableRateLimiter(DB::connection());
        $now = CarbonImmutable::parse('2030-01-01 12:00:20');
        $limiter->setClock($now);

        // Fill subject_ip budget (limit 5) completely
        for ($i = 0; $i < 5; $i++) {
            $res = $limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
            $this->assertTrue($res->allowed);
        }

        // ip budget (sibling budget, limit 30) currently has count 5
        $ipDigest = DurableRateLimiter::digestOfCanonicalKey(['ip' => $ip]);
        $ipWindowStart = CarbonImmutable::createFromTimestamp((int) (floor($now->getTimestamp() / 300) * 300));
        $ipRowBefore = DB::table('security_rate_limits')
            ->where('budget_id', 'ip')
            ->where('key_digest', $ipDigest)
            ->where('window_start', $ipWindowStart->toIso8601String())
            ->first();
        $this->assertNotNull($ipRowBefore);
        $this->assertSame(5, (int) $ipRowBefore->count);

        // Attempt 6th charge: subject_ip denies
        $resDenied = $limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
        $this->assertFalse($resDenied->allowed);
        $this->assertSame(40, $resDenied->retryAfterSeconds);

        // Sibling budget 'ip' MUST NOT be incremented on denial
        $ipRowAfter = DB::table('security_rate_limits')
            ->where('budget_id', 'ip')
            ->where('key_digest', $ipDigest)
            ->where('window_start', $ipWindowStart->toIso8601String())
            ->first();
        $this->assertNotNull($ipRowAfter);
        $this->assertSame(5, (int) $ipRowAfter->count, 'Sibling budget count must NOT increment when another budget denies');
    }
}

