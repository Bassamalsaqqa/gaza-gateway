<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\AnonymousSessionCleanup;
use App\Identity\Sessions\PassengerSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDO;
use Tests\Fixtures\IdentityProtocol\BootstrapProcessHarness;
use Tests\TestCase;

final class AnonymousBootstrapConcurrencyTest extends TestCase
{
    use BootstrapProcessHarness;

    private string $tempBarrierDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('gaza_gateway_test', DB::selectOne('SELECT current_database() AS db')->db);
        DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->where('auth_level', 'anonymous')->delete();
        DB::table('passenger_sessions')->where('auth_level', 'anonymous')->delete();
        $this->tempBarrierDir = sys_get_temp_dir() . '/gza_bootstrap_' . bin2hex(random_bytes(12));
        $this->assertTrue(mkdir($this->tempBarrierDir, 0700));
    }

    protected function tearDown(): void
    {
        DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->delete();
        DB::table('staff_sessions')->where('auth_level', 'anonymous')->delete();
        DB::table('passenger_sessions')->where('auth_level', 'anonymous')->delete();
        foreach (glob($this->tempBarrierDir . '/*') ?: [] as $file) {
            if (is_file($file) && !is_link($file)) {
                unlink($file);
            }
        }
        rmdir($this->tempBarrierDir);
        parent::tearDown();
    }

    private function admissionRace(string $realm, array $limits, bool $sameIp): void
    {
        $payload = array_merge(['realm' => $realm, 'ip' => '198.51.100.80'], $limits);
        [$one, $two] = $this->runTwoProcessRace('bootstrap-admit', $payload, 'bootstrap-admit',
            array_merge($payload, ['ip' => $sameIp ? $payload['ip'] : '198.51.100.81']));
        $this->assertArrayHasKey('allowed', $one);
        $this->assertArrayHasKey('allowed', $two);
        $this->assertSame(1, (int) $one['allowed'] + (int) $two['allowed']);
        $table = $realm === 'passenger' ? 'passenger_sessions' : 'staff_sessions';
        $this->assertSame(1, DB::table($table)->where('auth_level', 'anonymous')->count());
        $this->assertSame(1, (int) DB::table('security_rate_limits')->where('realm', $realm)
            ->where('operation_id', 'bootstrap')->where('budget_id', 'global')->sum('count'));
    }

    public function testPassengerAndStaffLastIpSlotCannotBeOverspent(): void
    {
        foreach (['passenger', 'staff'] as $realm) {
            $this->admissionRace($realm, ['ip_limit' => 1], true);
        }
    }

    public function testPassengerAndStaffGlobalLastSlotCannotBeOverspent(): void
    {
        foreach (['passenger', 'staff'] as $realm) {
            $this->admissionRace($realm, ['global_limit' => 1], false);
        }
    }

    public function testPassengerAndStaffRetainedCapCannotBeOverspent(): void
    {
        foreach (['passenger', 'staff'] as $realm) {
            $this->admissionRace($realm, ['retained_cap' => 1], false);
        }
    }

    public function testObservedPostgresLockWaitRetriesIntoFreshWindow(): void
    {
        $start = 1893456299; // 2030-01-01T00:04:59Z
        $window = (int) (floor($start / 300) * 300);
        $clockFile = $this->tempBarrierDir . '/clock.txt';
        file_put_contents($clockFile, (string) $start);
        $digest = hash('sha256', 'bootstrap:global:passenger');
        DB::table('security_rate_limits')->insert([
            'realm' => 'passenger', 'operation_id' => 'bootstrap', 'budget_id' => 'global',
            'key_digest' => $digest, 'window_start' => CarbonImmutable::createFromTimestamp($window),
            'window_end' => CarbonImmutable::createFromTimestamp($window + 300), 'count' => 0,
        ]);
        $result = $this->runChildWithParentLockWait('bootstrap-admit',
            ['realm' => 'passenger', 'ip' => '198.51.100.82'], $clockFile,
            function (PDO $pdo) use ($digest, $window): void {
                $stmt = $pdo->prepare("SELECT count FROM security_rate_limits WHERE realm = 'passenger'
                    AND operation_id = 'bootstrap' AND budget_id = 'global' AND key_digest = ?
                    AND window_start = ? FOR UPDATE");
                $stmt->execute([$digest, CarbonImmutable::createFromTimestamp($window)->toIso8601String()]);
            }, function () use ($clockFile, $window): void {
                file_put_contents($clockFile, (string) ($window + 301));
            });
        $this->assertTrue($result['allowed']);
        $this->assertSame(0, (int) DB::table('security_rate_limits')->where('budget_id', 'global')
            ->where('window_start', CarbonImmutable::createFromTimestamp($window))->value('count'));
        $this->assertSame(1, (int) DB::table('security_rate_limits')->where('budget_id', 'global')
            ->where('window_start', CarbonImmutable::createFromTimestamp($window + 300))->value('count'));
    }

    public function testCleanupRacingExpiredSessionReadNeverResurrectsAuthority(): void
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        $now = CarbonImmutable::now();
        DB::table('passenger_sessions')->where('id', $receipt->sessionId)->update([
            'issued_at' => $now->subHours(2), 'absolute_expires_at' => $now->subHour(),
            'idle_expires_at' => $now->subHour(), 'last_seen_at' => $now->subHour(),
        ]);
        [$cleanup, $read] = $this->runTwoProcessRace('bootstrap-cleanup', ['realm' => 'passenger'],
            'session-read', ['realm' => 'passenger', 'token' => $receipt->getRawToken()]);
        $this->assertFalse($read['success']);
        $this->assertSame(1, $cleanup['deleted']);
        $this->assertSame(0, DB::table('passenger_sessions')->count());
    }

    public function testCleanupSkipsLockedSessionThenPreservesCommittedUpgrade(): void
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        $userId = (string) Str::uuid();
        $now = CarbonImmutable::now();
        DB::table('users')->insert(['id' => $userId, 'email' => $userId . '@example.test',
            'password_hash' => 'synthetic-fixture', 'status' => 'active', 'email_verified_at' => $now,
            'credential_epoch' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('passenger_sessions')->where('id', $receipt->sessionId)->update(['revoked_at' => $now]);
        $config = config('database.connections.pgsql_test');
        $pdo = new PDO(sprintf('pgsql:host=%s;port=%s;dbname=%s', $config['host'], $config['port'], $config['database']),
            $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
            $stmt->execute([$userId]);
            $stmt = $pdo->prepare('SELECT id FROM passenger_sessions WHERE id = ? FOR UPDATE');
            $stmt->execute([$receipt->sessionId]);
            [$one, $two] = $this->runTwoProcessRace('bootstrap-cleanup', ['realm' => 'passenger'],
                'bootstrap-cleanup', ['realm' => 'passenger']);
            $this->assertSame(0, $one['deleted']);
            $this->assertSame(0, $two['deleted']);
            // Synthetic locked writer proves exclusion/revalidation; not a login implementation.
            $stmt = $pdo->prepare("UPDATE passenger_sessions SET user_id = ?, auth_level = 'full',
                credential_epoch = 1, revoked_at = NULL WHERE id = ?");
            $stmt->execute([$userId, $receipt->sessionId]);
            $pdo->commit();
            $this->assertSame(0, app(AnonymousSessionCleanup::class)->cleanRealmBatch('passenger'));
            $this->assertSame('full', DB::table('passenger_sessions')->where('id', $receipt->sessionId)->value('auth_level'));
        } finally {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            DB::table('passenger_sessions')->where('id', $receipt->sessionId)->delete();
            DB::table('users')->where('id', $userId)->delete();
        }
    }

    public function testRealPostgresBeforeAndAfterInsertFailuresRollBackEveryWrite(): void
    {
        foreach (['BEFORE', 'AFTER'] as $timing) {
            DB::statement("CREATE OR REPLACE FUNCTION pg_temp.bootstrap_fault() RETURNS trigger LANGUAGE plpgsql
                AS \$\$ BEGIN RAISE EXCEPTION 'synthetic_bootstrap_driver_sentinel'; END; \$\$");
            DB::statement("CREATE TRIGGER bootstrap_fault {$timing} INSERT ON passenger_sessions
                FOR EACH ROW EXECUTE FUNCTION pg_temp.bootstrap_fault()");
            try {
                $response = $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443,
                    'REMOTE_ADDR' => '198.51.100.85'])->get('/api/v1/auth/csrf');
                $response->assertStatus(503);
                $this->assertSame('service_unavailable', $response->json('error.code'));
                $this->assertEmpty($response->headers->getCookies());
                $this->assertStringNotContainsString('synthetic_bootstrap_driver_sentinel', $response->getContent());
                $this->assertSame(0, DB::table('passenger_sessions')->count());
                $this->assertSame(0, DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->count());
            } finally {
                DB::statement('DROP TRIGGER IF EXISTS bootstrap_fault ON passenger_sessions');
                DB::statement('DROP FUNCTION IF EXISTS pg_temp.bootstrap_fault()');
            }
        }
    }

    public function testActualConnectionRefusalReturns503WithoutCookie(): void
    {
        $config = config('database.connections.pgsql_test');
        $config['host'] = '127.0.0.1';
        $config['port'] = 1;
        $config['url'] = null;
        config(['database.connections.bootstrap_outage' => $config]);
        $db = DB::connection('bootstrap_outage');
        $this->app->instance(AnonymousBootstrapAdmission::class, new AnonymousBootstrapAdmission($db,
            app(Encrypter::class), new AnonymousSessionCleanup($db)));
        $response = $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443,
            'REMOTE_ADDR' => '198.51.100.86'])->get('/api/v1/auth/csrf');
        $response->assertStatus(503);
        $this->assertEmpty($response->headers->getCookies());
        $this->assertSame(0, DB::table('passenger_sessions')->count());
        DB::purge('bootstrap_outage');
    }

    public function testOuterTransactionAndFractionalCommandOptionsFailClosed(): void
    {
        DB::beginTransaction();
        try {
            $response = $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443,
                'REMOTE_ADDR' => '198.51.100.87'])->get('/api/v1/auth/csrf');
            $response->assertStatus(503);
            $this->assertEmpty($response->headers->getCookies());
            $this->assertSame(0, DB::table('security_rate_limits')->count());
        } finally { DB::rollBack(); }
        foreach (['--batches' => '1.5', '--batch-size' => '2e1', '--horizon' => '3600.5'] as $option => $value) {
            $this->assertSame(1, Artisan::call('identity:clean-anonymous', [$option => $value]));
        }
    }

    public function testMissingPeerNeverFallsBackToTrustedForwardedHeaders(): void
    {
        Request::setTrustedProxies(['127.0.0.1'], Request::HEADER_X_FORWARDED_FOR);
        try {
            $request = Request::create('/api/v1/auth/csrf', server: ['HTTP_X_FORWARDED_FOR' => '198.51.100.88']);
            $request->server->remove('REMOTE_ADDR');
            $this->assertNull(AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request));
            $this->assertFalse(app(AnonymousBootstrapAdmission::class)->admitAndIssueAnonymous('passenger', $request)->allowed);
            $this->assertSame(0, DB::table('security_rate_limits')->count());
            $mapped = Request::create('/', server: ['REMOTE_ADDR' => '::ffff:198.51.100.88']);
            $this->assertSame('198.51.100.88', AnonymousBootstrapAdmission::resolveCanonicalSourceIp($mapped));
        } finally { Request::setTrustedProxies([], 0); }
    }

    public function testAdmissionPrunesStaleBucketsAndCleanupFailureDoesNotMint(): void
    {
        $now = CarbonImmutable::now();
        DB::table('security_rate_limits')->insert(['realm' => 'passenger', 'operation_id' => 'bootstrap',
            'budget_id' => 'global', 'key_digest' => str_repeat('f', 64), 'window_start' => $now->subHours(3),
            'window_end' => $now->subHours(2), 'count' => 1]);
        $response = $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443,
            'REMOTE_ADDR' => '198.51.100.89'])->get('/api/v1/auth/csrf');
        $response->assertStatus(200);
        $this->assertFalse(DB::table('security_rate_limits')->where('key_digest', str_repeat('f', 64))->exists());
        DB::table('passenger_sessions')->delete();
        DB::table('security_rate_limits')->delete();
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        DB::table('passenger_sessions')->where('id', $receipt->sessionId)->update(['revoked_at' => $now]);
        DB::statement("CREATE OR REPLACE FUNCTION pg_temp.bootstrap_cleanup_fault() RETURNS trigger LANGUAGE plpgsql
            AS \$\$ BEGIN RAISE EXCEPTION 'synthetic_cleanup_driver_sentinel'; END; \$\$");
        DB::statement('CREATE TRIGGER bootstrap_cleanup_fault BEFORE DELETE ON passenger_sessions
            FOR EACH ROW EXECUTE FUNCTION pg_temp.bootstrap_cleanup_fault()');
        try {
            $response = $this->get('/api/v1/auth/csrf');
            $response->assertStatus(503);
            $this->assertEmpty($response->headers->getCookies());
            $this->assertStringNotContainsString('synthetic_cleanup_driver_sentinel', $response->getContent());
            $this->assertSame(1, DB::table('passenger_sessions')->count());
            $this->assertSame(0, DB::table('security_rate_limits')->count());
        } finally {
            DB::statement('DROP TRIGGER IF EXISTS bootstrap_cleanup_fault ON passenger_sessions');
            DB::statement('DROP FUNCTION IF EXISTS pg_temp.bootstrap_cleanup_fault()');
        }
    }

    public function testHostOriginAndTransportRejectionsNeverAllocateStorage(): void
    {
        $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443, 'REMOTE_ADDR' => '198.51.100.90']);
        $this->get('https://untrusted.invalid/api/v1/auth/csrf')->assertStatus(400);
        $this->withHeaders(['Origin' => 'https://untrusted.invalid'])->get('https://127.0.0.1:18090/api/v1/staff/csrf')->assertStatus(403);
        $this->flushHeaders();
        $this->get('http://127.0.0.1:18090/api/v1/auth/csrf')->assertStatus(403);
        $this->assertSame(0, DB::table('passenger_sessions')->count());
        $this->assertSame(0, DB::table('staff_sessions')->count());
        $this->assertSame(0, DB::table('security_rate_limits')->count());
        $this->withHeaders(['Origin' => config('cors.allowed_origins')[0]])
            ->get('https://127.0.0.1:18090/api/v1/auth/csrf')->assertStatus(200);
        $this->assertSame(1, DB::table('passenger_sessions')->count());
    }
}
