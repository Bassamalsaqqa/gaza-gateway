<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityStaff;

use App\Identity\Audit\AuditWriter;
use App\Identity\Mfa\{RecoveryCode, TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\{StaffAuthCoordinator, StaffAuthenticationException};
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class StaffAuthenticationTest extends TestCase
{
    private array $owners = [];
    private static ?string $hash = null;
    private const string PASSWORD = 'Synthetic-staff-password-2026';

    protected function setUp(): void
    {
        parent::setUp();
        config(['cors.allowed_origins' => ['https://127.0.0.1:5173']]);
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        foreach ($this->owners as $id) {
            // Retain append-only audits and their principals. Revoke only our owned session residue.
            DB::table('staff_pending_auth')->where('staff_id', $id)->where('state', 'issued')
                ->update(['state' => 'revoked', 'revoked_at' => DB::raw('clock_timestamp()')]);
            DB::table('staff_sessions')->where('staff_id', $id)->whereNull('revoked_at')
                ->update(['revoked_at' => DB::raw('clock_timestamp()')]);
        }
        parent::tearDown();
    }

    private function staff(): object
    {
        $this->assertDisposableDatabaseTarget();
        $id = (string) Str::uuid();
        $this->owners[] = $id;
        self::$hash ??= $this->app->make(Argon2idPasswordHasher::class)->hash(self::PASSWORD, 'staff');
        $secret = TotpSecret::generate();
        DB::table('staff_users')->insert(['id' => $id, 'username' => 'test-' . $id, 'email' => $id . '@example.invalid',
            'full_name_en' => 'Synthetic Staff', 'full_name_ar' => 'موظف تجريبي', 'password_hash' => self::$hash,
            'role' => 'viewer', 'status' => 'pending_enrollment', 'credential_epoch' => 1,
            'email_verified_at' => DB::raw('clock_timestamp()'), 'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()')]);
        DB::table('staff_mfa_credentials')->insert(['staff_id' => $id, 'version' => 1,
            'encrypted_secret' => $this->app->make(Encrypter::class)->encrypt($secret->revealBase32Secret()),
            'confirmed_at' => DB::raw('clock_timestamp()')]);
        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        return (object) ['id' => $id, 'username' => 'test-' . $id, 'secret' => $secret];
    }

    private function anonymous(): array
    {
        $receipt = $this->app->make(StaffSessionStore::class)->issueAnonymous();
        return ['cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken(), 'id' => $receipt->sessionId];
    }

    private function request(string $method, string $path, array $session, ?array $body = null, ?string $pending = null): TestResponse
    {
        $this->flushHeaders();
        $cookie = 'gza_staff_session=' . $session['cookie'] . ($pending !== null ? '; gza_staff_pending=' . $pending : '');
        return $this->call($method, 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], [
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173', 'HTTP_COOKIE' => $cookie,
            'HTTP_X_CSRF_TOKEN' => $session['csrf'], 'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json', 'REMOTE_ADDR' => '192.0.2.' . random_int(1, 190),
        ], $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR));
    }

    private function pending(object $staff, array $session): array
    {
        $response = $this->request('POST', '/staff/login', $session, ['username' => $staff->username, 'password' => self::PASSWORD]);
        $response->assertStatus(200);
        return ['cookie' => $this->cookie($response, 'gza_staff_pending'), 'id' => $response->headers->get('X-Staff-Challenge-Id'), 'response' => $response];
    }

    private function cookie(TestResponse $response, string $name): string
    {
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $name) {
                $this->assertTrue($cookie->isSecure()); $this->assertTrue($cookie->isHttpOnly());
                $this->assertSame('/api/v1', $cookie->getPath()); $this->assertNull($cookie->getDomain());
                return $cookie->getValue();
            }
        }
        $this->fail('Expected realm cookie missing.');
    }

    private function code(object $staff): string
    {
        $now = strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now);
        return (new TotpService())->hotp($staff->secret, intdiv($now, 30));
    }

    public function test_eight_operation_http_chain_and_contract_captures(): void
    {
        $staff = $this->staff(); $anonymous = $this->anonymous(); $captures = [];
        $record = function (string $operation, TestResponse $response) use (&$captures): void {
            $response->assertStatus(200);
            $captures[] = ['operationId' => $operation, 'status' => 200,
                'contentType' => $response->headers->get('Content-Type'), 'rawResponseBody' => $response->getContent()];
        };
        $pending = $this->pending($staff, $anonymous); $record('postStaffLogin', $pending['response']);
        $this->assertStringContainsString('X-Staff-Challenge-Id', $pending['response']->headers->get('Access-Control-Expose-Headers'));
        $this->request('GET', '/staff/me', $anonymous, null, $pending['cookie'])->assertStatus(401);
        $record('postStaffMfaChallenge', $this->request('POST', '/staff/mfa/challenge', $anonymous,
            ['staffSessionChallengeId' => $pending['id']], $pending['cookie']));
        $verify = $this->request('POST', '/staff/mfa/verify', $anonymous, ['totpCode' => $this->code($staff)], $pending['cookie']);
        $record('postStaffMfaVerify', $verify);
        $cookie = $this->cookie($verify, 'gza_staff_session');
        $context = $this->app->make(StaffSessionStore::class)->read($cookie);
        $full = ['cookie' => $cookie, 'csrf' => $context->getCsrfToken(), 'id' => $context->sessionId];
        $record('getStaffMe', $this->request('GET', '/staff/me', $full));
        $record('getStaffSessions', $this->request('GET', '/staff/sessions', $full));
        // Recovery code provides a distinct fresh factor: the login TOTP may not be replayed for step-up.
        $this->request('POST', '/staff/step-up', $full, ['totpCode' => $this->code($staff)])->assertStatus(401);
        $recovery = RecoveryCode::generate();
        DB::table('staff_mfa_recovery_codes')->insert(['id' => (string) Str::uuid(), 'staff_id' => $staff->id,
            'mfa_version' => 1, 'code_digest' => $recovery->getDigest()]);
        $record('postStaffStepUp', $this->request('POST', '/staff/step-up', $full, ['recoveryCode' => $recovery->revealPlaintextForEnrollmentOnly()]));
        $this->request('POST', '/staff/step-up', $full, ['recoveryCode' => $recovery->revealPlaintextForEnrollmentOnly()])->assertStatus(401);
        $other = $this->app->make(StaffSessionStore::class)->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $record('deleteStaffSession', $this->request('DELETE', '/staff/sessions/' . $other->sessionId, $full));
        $record('postStaffLogout', $this->request('POST', '/staff/logout', $full));
        $this->request('GET', '/staff/me', $full)->assertStatus(401);
        $this->assertSame('consumed', DB::table('staff_pending_auth')->where('id', $pending['id'])->value('state'));
        $this->persistCaptures($captures);
    }

    public function test_five_failed_factors_commit_attempts_without_extending_deadline(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->pending($staff, $session);
        $expires = DB::table('staff_pending_auth')->where('id', $pending['id'])->value('expires_at');
        $badCode = RecoveryCode::generate()->revealPlaintextForEnrollmentOnly();
        for ($i = 0; $i < 5; $i++) {
            $this->request('POST', '/staff/mfa/verify', $session, ['recoveryCode' => $badCode], $pending['cookie'])->assertStatus(401);
        }
        $row = DB::table('staff_pending_auth')->where('id', $pending['id'])->first();
        $this->assertSame(5, $row->failed_attempts); $this->assertSame('exhausted', $row->state); $this->assertSame($expires, $row->expires_at);
        $this->assertSame(0, DB::table('staff_sessions')->where('staff_id', $staff->id)->count());
    }

    public function test_action_rechecks_pending_mfa_version_and_session_csrf(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->pending($staff, $session);
        $context = $this->app->make(StaffSessionStore::class)->read($session['cookie']);
        $db = DB::connection(); $row = $db->table('staff_sessions')->where('id', $session['id'])->first();
        $payload = json_decode($this->app->make(Encrypter::class)->decrypt($row->encrypted_payload), true);
        $payload['pending_login']['mfaVersion'] = 2;
        $db->table('staff_sessions')->where('id', $session['id'])->update(['encrypted_payload' => $this->app->make(Encrypter::class)->encrypt(json_encode($payload))]);
        try {
            $this->app->make(StaffAuthCoordinator::class)->pending('postStaffMfaVerify', ['totpCode' => $this->code($staff)],
                $context, $session['cookie'], $session['csrf'], $pending['cookie'], '192.0.2.198', 'test', (string) Str::uuid());
            $this->fail('Stale MFA authority was accepted.');
        } catch (StaffAuthenticationException) { $this->assertTrue(true); }
        $payload['pending_login']['mfaVersion'] = 1; $payload['csrf_token'] = str_repeat('x', 43);
        $db->table('staff_sessions')->where('id', $session['id'])->update(['encrypted_payload' => $this->app->make(Encrypter::class)->encrypt(json_encode($payload))]);
        $this->expectException(StaffAuthenticationException::class);
        $this->app->make(StaffAuthCoordinator::class)->pending('postStaffMfaVerify', ['totpCode' => $this->code($staff)],
            $context, $session['cookie'], $session['csrf'], $pending['cookie'], '192.0.2.198', 'test', (string) Str::uuid());
    }

    public function test_replayed_pending_factor_has_one_winner_across_real_processes(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->pending($staff, $session);
        $input = ['cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'pending' => $pending['cookie'],
            'totp' => $this->code($staff), 'requestId' => (string) Str::uuid()];
        $this->runRace([$input, $input]);
        $this->assertSame(1, DB::table('staff_sessions')->where('staff_id', $staff->id)->where('auth_level', 'full')->count());
    }

    public function test_distinct_pending_challenges_cannot_reuse_one_totp_concurrently(): void
    {
        $staff = $this->staff(); $first = $this->anonymous(); $second = $this->anonymous();
        $firstPending = $this->pending($staff, $first); $secondPending = $this->pending($staff, $second);
        $code = $this->code($staff);
        $inputs = [];
        foreach ([[$first, $firstPending], [$second, $secondPending]] as [$session, $pending]) {
            $inputs[] = ['cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'pending' => $pending['cookie'],
                'totp' => $code, 'requestId' => (string) Str::uuid()];
        }
        $this->runRace($inputs);
        $this->assertSame(1, DB::table('staff_sessions')->where('staff_id', $staff->id)->where('auth_level', 'full')->count());
    }

    public function test_audit_failure_rolls_back_factor_consumption_and_session_rotation(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->pending($staff, $session);
        $context = $this->app->make(StaffSessionStore::class)->read($session['cookie']);
        $audit = $this->createMock(AuditWriter::class);
        $audit->expects($this->once())->method('record')->willThrowException(new \RuntimeException('synthetic-safe-failure'));
        $coordinator = new StaffAuthCoordinator(DB::connection(), $this->app->make(Encrypter::class),
            $this->app->make(Argon2idPasswordHasher::class), $this->app->make(StaffSessionStore::class),
            $this->app->make(\App\Identity\RateLimiting\DurableRateLimiter::class), $audit, $this->app->make(\App\Identity\Rbac\RbacPolicy::class));
        try {
            $coordinator->pending('postStaffMfaVerify', ['totpCode' => $this->code($staff)], $context,
                $session['cookie'], $session['csrf'], $pending['cookie'], '192.0.2.196', 'test', (string) Str::uuid());
            $this->fail('Audit failure did not fail the action.');
        } catch (\RuntimeException $error) { $this->assertSame('synthetic-safe-failure', $error->getMessage()); }
        $this->assertSame('issued', DB::table('staff_pending_auth')->where('id', $pending['id'])->value('state'));
        $this->assertNull(DB::table('staff_sessions')->where('id', $session['id'])->value('revoked_at'));
        $this->assertSame(0, DB::table('staff_mfa_counter_consumptions')->where('staff_id', $staff->id)->count());
        $this->assertSame(0, DB::table('staff_sessions')->where('staff_id', $staff->id)->count());
    }

    public function test_full_action_rechecks_epoch_csrf_and_owner_before_any_effect(): void
    {
        $staff = $this->staff(); $foreign = $this->staff();
        $store = $this->app->make(StaffSessionStore::class);
        $receipt = $store->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $foreignReceipt = $store->issueFull($foreign->id, 1, 1, new \DateTimeImmutable());
        $context = $store->read($receipt->getRawToken());
        $coordinator = $this->app->make(StaffAuthCoordinator::class);
        foreach (['foreign', 'csrf', 'epoch'] as $probe) {
            if ($probe === 'epoch') { DB::table('staff_users')->where('id', $staff->id)->update(['credential_epoch' => 2]); }
            try {
                $coordinator->full('deleteStaffSession', [], $context, $receipt->getRawToken(),
                    $probe === 'csrf' ? str_repeat('x', 43) : $receipt->getCsrfToken(),
                    $probe === 'foreign' ? $foreignReceipt->sessionId : $receipt->sessionId, '192.0.2.195', (string) Str::uuid());
                $this->fail('Invalid current authority was accepted.');
            } catch (StaffAuthenticationException) { $this->assertTrue(true); }
        }
        $this->assertNull(DB::table('staff_sessions')->where('id', $foreignReceipt->sessionId)->value('revoked_at'));
        $this->assertNull(DB::table('staff_sessions')->where('id', $receipt->sessionId)->value('revoked_at'));
        $this->assertSame(0, DB::table('audit_events')->where('staff_id', $staff->id)->count());
    }

    private function runRace(array $inputs): void
    {
        $processes = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pipes = []; $process = proc_open([PHP_BINARY, base_path('tests/Fixtures/IdentityStaff/verify-pending-worker.php')],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path());
                if (!is_resource($process)) { throw new \RuntimeException('Staff race process unavailable.'); }
                stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
                $processes[] = [$process, $pipes];
                $bytes = json_encode($inputs[$i], JSON_THROW_ON_ERROR) . "\n";
                if (fwrite($pipes[0], $bytes) !== strlen($bytes) || !fflush($pipes[0])) { throw new \RuntimeException('Staff race input failed.'); }
            }
            foreach ($processes as [$process, $pipes]) { $this->assertSame('READY', $this->line($process, $pipes[1])); }
            foreach ($processes as [$process, $pipes]) { fwrite($pipes[0], "GO\n"); fflush($pipes[0]); }
            $outcomes = [];
            foreach ($processes as [$process, $pipes]) { $outcomes[] = $this->line($process, $pipes[1]); }
            sort($outcomes); $this->assertSame(['ACCEPTED', 'DENIED'], $outcomes);
        } finally {
            foreach ($processes as [$process, $pipes]) {
                foreach ($pipes as $pipe) { if (is_resource($pipe)) { fclose($pipe); } }
                $deadline = microtime(true) + 2;
                while (proc_get_status($process)['running'] && microtime(true) < $deadline) { usleep(10000); }
                if (proc_get_status($process)['running']) { proc_terminate($process); usleep(100000); }
                if (proc_get_status($process)['running']) { proc_terminate($process, 9); usleep(100000); }
                if (proc_get_status($process)['running']) { throw new \RuntimeException('Staff race child could not be terminated.'); }
                proc_close($process);
            }
        }
    }

    private function line($process, $pipe): string
    {
        $deadline = microtime(true) + 10; $buffer = '';
        do {
            $part = fread($pipe, 1024);
            if ($part !== false) { $buffer .= $part; }
            if (strlen($buffer) > 4096) { throw new \RuntimeException('Staff race output limit exceeded.'); }
            if (str_contains($buffer, "\n")) { return trim(explode("\n", $buffer, 2)[0]); }
            if (!proc_get_status($process)['running']) { break; }
            usleep(10000);
        } while (microtime(true) < $deadline);
        throw new \RuntimeException('Staff race deadline or child failure.');
    }

    public function test_historical_session_row_locks_do_not_block_current_or_pending_actions(): void
    {
        $staff = $this->staff();
        $receipt = $this->app->make(StaffSessionStore::class)->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $current = ['cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken(), 'id' => $receipt->sessionId];
        $secondReceipt = $this->app->make(StaffSessionStore::class)->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $second = ['cookie' => $secondReceipt->getRawToken(), 'csrf' => $secondReceipt->getCsrfToken(), 'id' => $secondReceipt->sessionId];
        $anon = $this->anonymous(); $pending = $this->pending($staff, $anon);
        $base = (array) DB::table('staff_sessions')->where('id', $current['id'])->first(); $historical = [];
        for ($i = 0; $i < 300; $i++) {
            $row = $base; $row['id'] = (string) Str::uuid(); $row['lookup_digest'] = hash('sha256', random_bytes(32));
            $row['issued_at'] = now()->subDays(2); $row['last_seen_at'] = now()->subDays(2);
            $row['absolute_expires_at'] = now()->subDay(); $row['idle_expires_at'] = now()->subDay();
            $row['revoked_at'] = $i % 2 === 0 ? now()->subDay() : null; $historical[] = $row;
        }
        DB::table('staff_sessions')->insert($historical);
        config(['database.connections.staff_history_blocker' => config('database.connections.pgsql_test')]);
        $blocker = DB::connection('staff_history_blocker');
        $this->assertSame('pgsql', $blocker->getDriverName());
        $this->assertSame('gaza_gateway_test', $blocker->getDatabaseName());
        $this->assertSame('gaza_gateway_test', $blocker->selectOne('SELECT current_database() AS db')->db);
        $blocker->beginTransaction();
        try {
            $blocker->table('staff_sessions')->whereIn('id', array_column($historical, 'id'))->orderBy('id')->lockForUpdate()->get();
            $this->request('GET', '/staff/me', $current)->assertStatus(200);
            $this->request('GET', '/staff/sessions', $current)->assertStatus(200)->assertJsonCount(2, 'data');
            $inputs = [];
            foreach ([$current, $second] as $session) {
                $inputs[] = ['operation' => 'getStaffMe', 'input' => [], 'cookie' => $session['cookie'],
                    'csrf' => $session['csrf'], 'requestId' => (string) Str::uuid()];
            }
            $this->assertSame(['ACCEPTED', 'ACCEPTED'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run($inputs));
            $this->request('POST', '/staff/mfa/challenge', $anon, ['staffSessionChallengeId' => $pending['id']], $pending['cookie'])->assertStatus(200);
            $this->request('POST', '/staff/mfa/verify', $anon, ['totpCode' => $this->code($staff)], $pending['cookie'])->assertStatus(200);
            $recovery = RecoveryCode::generate();
            DB::table('staff_mfa_recovery_codes')->insert(['id' => (string) Str::uuid(), 'staff_id' => $staff->id,
                'mfa_version' => 1, 'code_digest' => $recovery->getDigest()]);
            $this->request('POST', '/staff/step-up', $current, ['recoveryCode' => $recovery->revealPlaintextForEnrollmentOnly()])->assertStatus(200);
            $this->request('POST', '/staff/logout', $second)->assertStatus(200);
        } finally { $blocker->rollBack(); DB::purge('staff_history_blocker'); }
        $this->assertSame(300, DB::table('staff_sessions')->whereIn('id', array_column($historical, 'id'))->count());
    }

    public function test_session_listing_overflow_is_explicit_and_does_not_affect_current_me(): void
    {
        $staff = $this->staff(); $receipt = $this->app->make(StaffSessionStore::class)->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $current = ['cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken(), 'id' => $receipt->sessionId];
        $base = (array) DB::table('staff_sessions')->where('id', $receipt->sessionId)->first(); $rows = [];
        for ($i = 0; $i < StaffAuthCoordinator::SESSION_LIST_LIMIT; $i++) {
            $row = $base; $row['id'] = (string) Str::uuid(); $row['lookup_digest'] = hash('sha256', random_bytes(32)); $rows[] = $row;
        }
        DB::table('staff_sessions')->insert($rows);
        $this->request('GET', '/staff/sessions', $current)->assertStatus(503)->assertJsonPath('success', false);
        $this->request('GET', '/staff/me', $current)->assertStatus(200);
    }

    private function persistCaptures(array $captures): void
    {
        $parent = storage_path('app/private');
        if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0700, true))) { throw new \RuntimeException('Capture parent unavailable.'); }
        $dir = $parent . '/staff-auth-captures-' . Str::uuid(); $mask = umask(0077);
        try {
            if (!mkdir($dir, 0700)) { throw new \RuntimeException('Capture directory unavailable.'); }
            foreach (['.exclusive_marker' => (string) Str::uuid(), 'captures.json' => json_encode($captures, JSON_THROW_ON_ERROR)] as $name => $bytes) {
                $file = fopen($dir . '/' . $name, 'x');
                if ($file === false) { throw new \RuntimeException('Capture creation failed.'); }
                try { if (fwrite($file, $bytes) !== strlen($bytes) || !fflush($file)) { throw new \RuntimeException('Capture write failed.'); } }
                finally { fclose($file); }
                if (!chmod($dir . '/' . $name, 0600)) { throw new \RuntimeException('Capture permission failed.'); }
            }
            fwrite(STDOUT, "\nSTAFF_AUTH_CAPTURES=" . $dir . "\n");
        } finally { umask($mask); }
    }
}
