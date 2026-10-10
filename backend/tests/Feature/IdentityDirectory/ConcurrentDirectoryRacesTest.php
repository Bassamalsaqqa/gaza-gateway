<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityDirectory;

use App\Identity\Directory\DirectoryErrorCode;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\Fixtures\IdentityDirectory\DirectoryTestFixture;
use Tests\TestCase;

final class ConcurrentDirectoryRacesTest extends TestCase
{
    private DirectoryTestFixture $fixture;
    private string $tempBarrierDir;

    protected function setUp(): void
    {
        parent::setUp();
        $currentDb = DB::selectOne('SELECT current_database() AS db')->db;
        $this->assertSame('gaza_gateway_test', $currentDb, 'Concurrency test must run against live gaza_gateway_test database');

        $encrypter = $this->app->make(Encrypter::class);
        $this->fixture = new DirectoryTestFixture(DB::connection(), $encrypter);
        $this->fixture->cleanTestData();
        $this->fixture->ensureSentinelExists();

        $this->tempBarrierDir = sys_get_temp_dir() . '/gza_dir_race_' . bin2hex(random_bytes(6));
        if (!is_dir($this->tempBarrierDir)) {
            mkdir($this->tempBarrierDir, 0700, true);
        }
    }

    protected function tearDown(): void
    {
        $this->fixture->cleanTestData();
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
            throw new \RuntimeException('Owned child did not exit within cleanup deadline.');
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
     * safe numeric assertion messages, and cleanup in finally.
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

        $scriptPath = base_path('scripts/probe-identity-directory.php');
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
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql_test',
        ];

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

            fwrite($pipes1[0], json_encode($payload1, JSON_THROW_ON_ERROR));
            fclose($pipes1[0]);
            unset($pipes1[0]);

            fwrite($pipes2[0], json_encode($payload2, JSON_THROW_ON_ERROR));
            fclose($pipes2[0]);
            unset($pipes2[0]);

            $deadline = microtime(true) + 10.0;
            $bothReady = false;
            while (microtime(true) < $deadline) {
                if (file_exists($readyFile1) && file_exists($readyFile2)) {
                    $bothReady = true;
                    break;
                }
                usleep(10000); // 10ms
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

            // Release barrier: both processes race simultaneously into PostgreSQL
            flock($barrierFp, LOCK_UN);
            fclose($barrierFp);
            $barrierFp = null;

            stream_set_blocking($pipes1[1], false);
            stream_set_blocking($pipes1[2], false);
            stream_set_blocking($pipes2[1], false);
            stream_set_blocking($pipes2[2], false);

            $out1 = '';
            $err1 = '';
            $out2 = '';
            $err2 = '';
            $maxBufferSize = 65536; // 64 KiB
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

                usleep(10000);
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

            $this->assertSame(0, $exit1, sprintf('Process 1 exited with code %d (err_bytes=%d)', $exit1, strlen($err1)));
            $this->assertSame(0, $exit2, sprintf('Process 2 exited with code %d (err_bytes=%d)', $exit2, strlen($err2)));

            $res1 = json_decode($out1, true);
            $res2 = json_decode($out2, true);

            $this->assertIsArray($res1, 'Process 1 produced invalid JSON');
            $this->assertIsArray($res2, 'Process 2 produced invalid JSON');

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
     * Helper to run a real child process racing against a parent-held PostgreSQL row lock.
     * Observes pg_stat_activity with wait_event_type = 'Lock' before invoking onBlockedCallback.
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

        $pdo->beginTransaction();
        $acquireParentLock($pdo);
        $parentBackendPid = (int) $pdo->query('SELECT pg_backend_pid()')->fetchColumn();

        $scriptPath = base_path('scripts/probe-identity-directory.php');
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

            $readyDeadline = microtime(true) + 8.0;
            $isReady = false;
            while (microtime(true) < $readyDeadline) {
                if (file_exists($readyFile)) {
                    $isReady = true;
                    break;
                }
                usleep(10000);
            }
            $this->assertTrue($isReady, 'Child must signal readiness before lock contention check');

            // Observe child blocked in pg_stat_activity with wait_event_type = 'Lock'
            $blockedDeadline = microtime(true) + 8.0;
            $observedBlocked = false;
            $childPid = (int) file_get_contents($readyFile);

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
                ", [$childPid, $parentBackendPid]);

                if (!empty($statRows)) {
                    $observedBlocked = true;
                    break;
                }
                usleep(10000);
            }

            $this->assertTrue($observedBlocked, 'Child process must be observed blocked on PostgreSQL row lock in pg_stat_activity');

            // Invoke callback while child is confirmed blocked
            $onBlockedCallback();

            // Release parent lock so child unblocks and derives fresh post-lock state
            $pdo->rollBack();

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
                usleep(10000);
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

            $this->assertSame(0, $exitCode, sprintf('Child process exited with code %d (err_bytes=%d)', $exitCode, strlen($err)));

            $res = json_decode($out, true);
            $this->assertIsArray($res, 'Child process produced invalid JSON');

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
     * Prove that two competing demotions at an exclusive barrier serialize on sentinel id=1,
     * producing EXACTLY ONE success and leaving post-change >= 1 eligible admin in PostgreSQL.
     */
    public function test_concurrent_competing_demotions_at_barrier_leaves_exactly_one_success_and_at_least_one_eligible_admin(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);
        $sess2 = $this->fixture->createStaffSession($admin2['id']);

        [$res1, $res2] = $this->runTwoProcessRace(
            'demote',
            [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin1['id'],
            ],
            'demote',
            [
                'actor_staff_id' => $admin2['id'],
                'actor_session_id' => $sess2['sessionId'],
                'target_staff_id' => $admin2['id'],
            ]
        );

        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in demoting an admin');

        $failure = $res1['success'] ? $res2 : $res1;
        $this->assertFalse($failure['success']);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $failure['error_code']);

        // Verify database: post-change eligible admin count must be >= 1 (exactly 1)
        $eligibleAdmins = DB::table('staff_users')
            ->where('role', 'admin')
            ->where('status', 'active')
            ->get();
        $this->assertCount(1, $eligibleAdmins, 'Post-change directory must retain at least one eligible admin');
    }

    /**
     * Prove that two competing suspensions at an exclusive barrier serialize on sentinel id=1,
     * producing EXACTLY ONE success and leaving post-change >= 1 eligible admin in PostgreSQL.
     */
    public function test_concurrent_competing_suspensions_at_barrier_leaves_exactly_one_success(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);
        $sess2 = $this->fixture->createStaffSession($admin2['id']);

        [$res1, $res2] = $this->runTwoProcessRace(
            'suspend',
            [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin1['id'],
            ],
            'suspend',
            [
                'actor_staff_id' => $admin2['id'],
                'actor_session_id' => $sess2['sessionId'],
                'target_staff_id' => $admin2['id'],
            ]
        );

        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in suspending an admin');

        $failure = $res1['success'] ? $res2 : $res1;
        $this->assertFalse($failure['success']);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $failure['error_code']);

        $activeAdmins = DB::table('staff_users')
            ->where('role', 'admin')
            ->where('status', 'active')
            ->get();
        $this->assertCount(1, $activeAdmins, 'Post-change directory must retain at least one active admin');
    }

    /**
     * Prove that two competing password invalidations at an exclusive barrier serialize on sentinel id=1,
     * producing EXACTLY ONE success and leaving post-change >= 1 eligible admin in PostgreSQL.
     */
    public function test_concurrent_competing_password_invalidation_at_barrier_leaves_exactly_one_success(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);
        $sess2 = $this->fixture->createStaffSession($admin2['id']);

        [$res1, $res2] = $this->runTwoProcessRace(
            'password-unusable',
            [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin1['id'],
            ],
            'password-unusable',
            [
                'actor_staff_id' => $admin2['id'],
                'actor_session_id' => $sess2['sessionId'],
                'target_staff_id' => $admin2['id'],
            ]
        );

        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in invalidating password');

        $failure = $res1['success'] ? $res2 : $res1;
        $this->assertFalse($failure['success']);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $failure['error_code']);

        // Database must retain at least 1 admin with valid hash
        $predicate = new \App\Identity\Directory\StaffEligibilityPredicate(DB::connection());
        $this->assertSame(1, $predicate->countEligibleAdmins(), 'Post-change directory must retain at least one admin with usable password');
    }

    /**
     * Prove that two competing MFA revocations at an exclusive barrier serialize on sentinel id=1,
     * producing EXACTLY ONE success and leaving post-change >= 1 eligible admin in PostgreSQL.
     */
    public function test_concurrent_competing_mfa_revocations_at_barrier_leaves_exactly_one_success(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);
        $sess2 = $this->fixture->createStaffSession($admin2['id']);

        [$res1, $res2] = $this->runTwoProcessRace(
            'mfa-revoke',
            [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin1['id'],
                'mfa_version' => 1,
            ],
            'mfa-revoke',
            [
                'actor_staff_id' => $admin2['id'],
                'actor_session_id' => $sess2['sessionId'],
                'target_staff_id' => $admin2['id'],
                'mfa_version' => 1,
            ]
        );

        $successCount = ($res1['success'] ? 1 : 0) + ($res2['success'] ? 1 : 0);
        $this->assertSame(1, $successCount, 'Exactly one process must succeed in revoking MFA');

        $failure = $res1['success'] ? $res2 : $res1;
        $this->assertFalse($failure['success']);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $failure['error_code']);

        // Database must retain at least 1 admin with confirmed unrevoked MFA
        $predicate = new \App\Identity\Directory\StaffEligibilityPredicate(DB::connection());
        $this->assertSame(1, $predicate->countEligibleAdmins(), 'Post-change directory must retain at least one admin with unrevoked MFA');
    }

    /**
     * Prove that a child blocked on PostgreSQL sentinel lock wait fails and rolls back
     * when its actor session is revoked while waiting. Stale actor may NOT commit.
     */
    public function test_child_blocked_on_pg_lock_wait_fails_and_rolls_back_when_session_revoked_while_waiting(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);

        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) time());

        $res = $this->runChildWithParentLockWait(
            mode: 'demote',
            payload: [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin2['id'],
            ],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) {
                // Parent locks sentinel id=1 FOR UPDATE
                $stmt = $pdo->prepare('SELECT id FROM staff_directory_control WHERE id = 1 FOR UPDATE');
                $stmt->execute();
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($sess1) {
                // While child is observed blocked on lock wait, revoke child session in database!
                DB::table('staff_sessions')
                    ->where('id', $sess1['sessionId'])
                    ->update(['revoked_at' => CarbonImmutable::now()->toIso8601String()]);
            }
        );

        $this->assertFalse($res['success'], 'Child must fail after its session was revoked while waiting on lock');
        $this->assertSame(DirectoryErrorCode::SESSION_REVOKED, $res['error_code']);

        // Verify target admin2 was NOT demoted
        $admin2Db = DB::table('staff_users')->where('id', $admin2['id'])->first();
        $this->assertSame('admin', $admin2Db->role, 'Directory state must remain unchanged');

        @unlink($clockFile);
    }

    /**
     * Prove that a child blocked on PostgreSQL sentinel lock wait fails and rolls back
     * when its actor's step-up expires while waiting.
     */
    public function test_child_blocked_on_pg_lock_wait_fails_and_rolls_back_when_step_up_expires_while_waiting(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);

        $t0 = 1700000000;
        $sess1 = $this->fixture->createStaffSession($admin1['id'], [
            'mfa_verified_at' => CarbonImmutable::createFromTimestamp($t0)->toIso8601String(),
        ]);

        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) ($t0 + 10)); // Initial clock: step-up age = 10s (fresh)

        $res = $this->runChildWithParentLockWait(
            mode: 'demote',
            payload: [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin2['id'],
            ],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) {
                $stmt = $pdo->prepare('SELECT id FROM staff_directory_control WHERE id = 1 FOR UPDATE');
                $stmt->execute();
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($clockFile, $t0) {
                // While child is observed blocked, advance clock by 301 seconds past step-up window!
                file_put_contents($clockFile, (string) ($t0 + 301));
            }
        );

        $this->assertFalse($res['success'], 'Child must fail when step-up expires while waiting on lock');
        $this->assertSame(DirectoryErrorCode::STEP_UP_EXPIRED, $res['error_code']);

        $admin2Db = DB::table('staff_users')->where('id', $admin2['id'])->first();
        $this->assertSame('admin', $admin2Db->role, 'Directory state must remain unchanged');

        @unlink($clockFile);
    }

    /**
     * Prove that a child blocked on PostgreSQL sentinel lock wait fails and rolls back
     * when actor credential epoch increments while waiting.
     */
    public function test_child_blocked_on_pg_lock_wait_fails_and_rolls_back_when_epoch_increments_while_waiting(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active', 'credential_epoch' => 1]);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id'], ['credential_epoch' => 1]);

        $clockFile = $this->tempBarrierDir . '/clock_' . uniqid() . '.txt';
        file_put_contents($clockFile, (string) time());

        $res = $this->runChildWithParentLockWait(
            mode: 'demote',
            payload: [
                'actor_staff_id' => $admin1['id'],
                'actor_session_id' => $sess1['sessionId'],
                'target_staff_id' => $admin2['id'],
            ],
            clockFile: $clockFile,
            acquireParentLock: function (PDO $pdo) {
                $stmt = $pdo->prepare('SELECT id FROM staff_directory_control WHERE id = 1 FOR UPDATE');
                $stmt->execute();
                $stmt->fetch(PDO::FETCH_ASSOC);
            },
            onBlockedCallback: function () use ($admin1) {
                // While child is blocked, increment actor credential epoch in database!
                DB::table('staff_users')
                    ->where('id', $admin1['id'])
                    ->update(['credential_epoch' => 2]);
            }
        );

        $this->assertFalse($res['success'], 'Child must fail when actor credential epoch increments while waiting on lock');
        $this->assertSame(DirectoryErrorCode::STALE_ACTOR, $res['error_code']);

        $admin2Db = DB::table('staff_users')->where('id', $admin2['id'])->first();
        $this->assertSame('admin', $admin2Db->role, 'Directory state must remain unchanged');

        @unlink($clockFile);
    }
}
