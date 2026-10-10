<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\RateLimiting\WindowDriftException;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AnonymousBootstrapAdmissionFeatureTest extends TestCase
{
    private AnonymousBootstrapAdmission $admission;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admission = app(AnonymousBootstrapAdmission::class);
        $this->admission->resetTestLimits();

        DB::table('security_rate_limits')->delete();
        DB::table('passenger_sessions')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->delete();
    }

    protected function tearDown(): void
    {
        $this->admission->resetTestLimits();

        DB::table('security_rate_limits')->delete();
        DB::table('passenger_sessions')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->delete();

        parent::tearDown();
    }

    private function withHttps(array $server = []): self
    {
        return $this->withServerVariables(array_merge([
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'REMOTE_ADDR' => '198.51.100.10',
        ], $server));
    }

    public function testPassengerRealmPerIpBudgetEnforcesExactLimitAndDeniesOnEleventh(): void
    {
        $ip = '198.51.100.22';

        // 10 successful absent-cookie admissions
        for ($i = 1; $i <= 10; $i++) {
            $response = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/auth/csrf');
            $response->assertStatus(200);
            $response->assertJsonStructure(['csrfToken']);
            $this->assertCount(1, $response->json());
            $this->assertNotNull($response->headers->getCookies());
        }

        $sessionCount = DB::table('passenger_sessions')->where('auth_level', 'anonymous')->count();
        $this->assertSame(10, $sessionCount, 'Exactly 10 sessions must be created.');

        $sourceKeyDigest = hash('sha256', "bootstrap:ip:{$ip}");
        $ipRow = DB::table('security_rate_limits')
            ->where('realm', 'passenger')
            ->where('operation_id', 'bootstrap')
            ->where('budget_id', 'source_ip')
            ->where('key_digest', $sourceKeyDigest)
            ->first();
        $this->assertNotNull($ipRow);
        $this->assertSame(10, (int) $ipRow->count);

        // 11th request from same IP must be denied with 429 and positive Retry-After
        $denied = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/auth/csrf');
        $denied->assertStatus(429);
        $denied->assertHeader('Retry-After');
        $retryAfter = (int) $denied->headers->get('Retry-After');
        $this->assertGreaterThan(0, $retryAfter);
        $this->assertLessThanOrEqual(300, $retryAfter);

        $this->assertFalse($denied->json('success'));
        $this->assertSame('rate_limited', $denied->json('error.code'));

        // No new session created on denial
        $this->assertSame(10, DB::table('passenger_sessions')->count());
        // No cookies returned on denial
        $setCookies = $denied->headers->getCookies();
        $this->assertEmpty($setCookies, 'Denial must not return session cookies.');
    }

    public function testStaffRealmPerIpBudgetEnforcesExactLimitAndDeniesOnEleventh(): void
    {
        $ip = '198.51.100.33';

        for ($i = 1; $i <= 10; $i++) {
            $response = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/staff/csrf');
            $response->assertStatus(200);
            $response->assertJsonStructure(['csrfToken']);
        }

        $this->assertSame(10, DB::table('staff_sessions')->where('auth_level', 'anonymous')->count());

        $denied = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/staff/csrf');
        $denied->assertStatus(429);
        $denied->assertHeader('Retry-After');
        $this->assertGreaterThan(0, (int) $denied->headers->get('Retry-After'));
        $this->assertSame(10, DB::table('staff_sessions')->count());
        $this->assertEmpty($denied->headers->getCookies());
    }

    public function testValidCookieReuseDoesNotChargeBudgetOrInsertSession(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        $ip = '198.51.100.44';

        // Repeated valid re-bootstrap calls
        for ($i = 1; $i <= 5; $i++) {
            $response = $this->withHttps(['REMOTE_ADDR' => $ip])
                ->withUnencryptedCookie(CookieSecurity::COOKIE_PASSENGER, $receipt->getRawToken())
                ->get('/api/v1/auth/csrf');

            $response->assertStatus(200);
            $this->assertSame($receipt->getCsrfToken(), $response->json('csrfToken'));
        }

        // Only the initial session created by trusted fixture exists
        $this->assertSame(1, DB::table('passenger_sessions')->count());

        // Zero rate limit rows created for bootstrap
        $rateLimitRows = DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->count();
        $this->assertSame(0, $rateLimitRows, 'Valid cookie reuse must not consume bootstrap rate limits.');
    }

    public function testGlobalExhaustionPreventsPerSourceKeyGrowth(): void
    {
        // Set bounded global limit of 3 for testing
        $this->admission->setTestLimits(ipLimit: 10, globalLimit: 3, retainedCap: 100);

        // 3 distinct IPs admit successfully
        for ($i = 1; $i <= 3; $i++) {
            $ip = "198.51.100.{$i}";
            $res = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/auth/csrf');
            $res->assertStatus(200);
        }

        $this->assertSame(3, DB::table('passenger_sessions')->count());

        // 4th distinct IP attempts bootstrap: global limit is exhausted
        $newIp = '198.51.100.99';
        $denied = $this->withHttps(['REMOTE_ADDR' => $newIp])->get('/api/v1/auth/csrf');
        $denied->assertStatus(429);
        $this->assertGreaterThan(0, (int) $denied->headers->get('Retry-After'));

        // CRITICAL INVARIANT: New IP must NOT have a per-source row created in security_rate_limits
        $newIpDigest = hash('sha256', "bootstrap:ip:{$newIp}");
        $newIpRow = DB::table('security_rate_limits')
            ->where('key_digest', $newIpDigest)
            ->first();
        $this->assertNull($newIpRow, 'Global exhaustion must NOT create per-source bucket rows for new IPs.');

        // Total sessions remain exactly 3
        $this->assertSame(3, DB::table('passenger_sessions')->count());
    }

    public function testHardRetainedRowCapPreventsExceedingConfiguredCap(): void
    {
        // Set bounded cap of 2 retained rows
        $this->admission->setTestLimits(ipLimit: 10, globalLimit: 10, retainedCap: 2);

        // Admit 2 sessions from different IPs
        $res1 = $this->withHttps(['REMOTE_ADDR' => '198.51.100.1'])->get('/api/v1/auth/csrf');
        $res1->assertStatus(200);

        $res2 = $this->withHttps(['REMOTE_ADDR' => '198.51.100.2'])->get('/api/v1/auth/csrf');
        $res2->assertStatus(200);

        $this->assertSame(2, DB::table('passenger_sessions')->count());

        // 3rd attempt must be denied due to retained capacity
        $res3 = $this->withHttps(['REMOTE_ADDR' => '198.51.100.3'])->get('/api/v1/auth/csrf');
        $res3->assertStatus(429);
        $res3->assertHeader('Retry-After');
        $this->assertEmpty($res3->headers->getCookies());

        $this->assertSame(2, DB::table('passenger_sessions')->count(), 'Cap must strictly prevent 3rd session creation.');
    }

    public function testSpoofedForwardedHeadersDoNotBypassBudget(): void
    {
        $realPeer = '198.51.100.50';

        // Make 10 requests with random spoofed headers from same transport peer
        for ($i = 1; $i <= 10; $i++) {
            $spoofedIp = "203.0.113.{$i}";
            $response = $this->withHttps(['REMOTE_ADDR' => $realPeer])
                ->withHeaders([
                    'X-Forwarded-For' => $spoofedIp,
                    'Forwarded' => "for={$spoofedIp}",
                    'X-Real-IP' => $spoofedIp,
                    'Client-IP' => $spoofedIp,
                ])
                ->get('/api/v1/auth/csrf');
            $response->assertStatus(200);
        }

        // 11th request with yet another spoofed header must be denied based on transport peer
        $denied = $this->withHttps(['REMOTE_ADDR' => $realPeer])
            ->withHeaders([
                'X-Forwarded-For' => '8.8.8.8',
            ])
            ->get('/api/v1/auth/csrf');

        $denied->assertStatus(429);

        // Verify only 1 source IP bucket exists in DB for the real peer
        $realPeerDigest = hash('sha256', "bootstrap:ip:{$realPeer}");
        $realPeerRow = DB::table('security_rate_limits')
            ->where('budget_id', 'source_ip')
            ->where('key_digest', $realPeerDigest)
            ->first();
        $this->assertNotNull($realPeerRow);
        $this->assertSame(10, (int) $realPeerRow->count);

        $totalSourceBuckets = DB::table('security_rate_limits')
            ->where('budget_id', 'source_ip')
            ->count();
        $this->assertSame(1, $totalSourceBuckets, 'Spoofed headers must not create separate buckets.');
    }

    public function testEquivalentIpv6RepresentationsShareExactSameBucket(): void
    {
        $expandedIpv6 = '2001:0db8:0000:0000:0000:0000:0000:0001';
        $compressedIpv6 = '2001:db8::1';

        $this->admission->setTestLimits(ipLimit: 2, globalLimit: 10, retainedCap: 100);

        // Request 1 with expanded IPv6
        $res1 = $this->withHttps(['REMOTE_ADDR' => $expandedIpv6])->get('/api/v1/auth/csrf');
        $res1->assertStatus(200);

        // Request 2 with compressed IPv6
        $res2 = $this->withHttps(['REMOTE_ADDR' => $compressedIpv6])->get('/api/v1/auth/csrf');
        $res2->assertStatus(200);

        // Request 3 with mixed-case compressed IPv6 -> must be denied (limit 2 reached)
        $mixedCaseIpv6 = '2001:DB8::1';
        $res3 = $this->withHttps(['REMOTE_ADDR' => $mixedCaseIpv6])->get('/api/v1/auth/csrf');
        $res3->assertStatus(429);

        // Verify only 1 bucket row exists with count = 2
        $canonicalIp = inet_ntop(inet_pton($compressedIpv6));
        $keyDigest = hash('sha256', "bootstrap:ip:{$canonicalIp}");
        $row = DB::table('security_rate_limits')
            ->where('budget_id', 'source_ip')
            ->where('key_digest', $keyDigest)
            ->first();

        $this->assertNotNull($row);
        $this->assertSame(2, (int) $row->count);
    }

    public function testInvalidSourceIpFailsClosedWithoutDatabaseWrites(): void
    {
        $response = $this->withHttps(['REMOTE_ADDR' => 'not-an-ip-address'])
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(429);
        $this->assertSame(0, DB::table('passenger_sessions')->count());
        $this->assertSame(0, DB::table('security_rate_limits')->count());
    }

    public function testAtomicRollbackWhenSessionInsertionFails(): void
    {
        $ip = '198.51.100.60';

        // Intentionally trigger a unique constraint collision or simulate insertion failure
        // by listening on DB query and throwing exception
        $listenerInvoked = false;
        DB::listen(function ($query) use (&$listenerInvoked) {
            if (str_contains($query->sql, 'insert into "passenger_sessions"') || str_contains($query->sql, 'INSERT INTO passenger_sessions')) {
                $listenerInvoked = true;
                throw new \RuntimeException('Simulated fault after counter write before session insert commit.');
            }
        });

        $response = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/auth/csrf');
        $response->assertStatus(503);
        $this->assertSame('service_unavailable', $response->json('error.code'));
        $this->assertEmpty($response->headers->getCookies());

        // Verify strict atomic rollback: zero committed rate limit increments
        $globalRow = DB::table('security_rate_limits')->where('budget_id', 'global')->first();
        if ($globalRow !== null) {
            $this->assertSame(0, (int) $globalRow->count);
        }
        $this->assertSame(0, DB::table('passenger_sessions')->count());
    }

    public function testWindowDriftDuringLockAcquisitionRetriesAndChargesFreshWindow(): void
    {
        $ip = '198.51.100.70';
        $startClock = CarbonImmutable::parse('2030-01-01 00:04:59'); // 1 second before 5-minute window ends

        $clock = $startClock;
        $this->admission->setClock(function () use (&$clock) {
            return $clock;
        });

        // Advance clock across window boundary upon FOR UPDATE query
        $hasAdvanced = false;
        DB::listen(function ($query) use (&$clock, &$hasAdvanced) {
            if (!$hasAdvanced && str_contains($query->sql, 'FOR UPDATE') && str_contains($query->sql, 'security_rate_limits')) {
                $hasAdvanced = true;
                $clock = CarbonImmutable::parse('2030-01-01 00:05:01'); // crossed boundary
            }
        });

        $response = $this->withHttps(['REMOTE_ADDR' => $ip])->get('/api/v1/auth/csrf');
        $response->assertStatus(200);

        // Verify the FRESH window (00:05:00) was charged, NOT the expired window (00:00:00)
        $newWindowRow = DB::table('security_rate_limits')
            ->where('budget_id', 'global')
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:05:00')->toIso8601String())
            ->first();
        $this->assertNotNull($newWindowRow, 'Fresh window must be charged after drift retry.');
        $this->assertSame(1, (int) $newWindowRow->count);

        $expiredWindowRow = DB::table('security_rate_limits')
            ->where('budget_id', 'global')
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:00:00')->toIso8601String())
            ->first();
        if ($expiredWindowRow !== null) {
            $this->assertSame(0, (int) $expiredWindowRow->count);
        }
    }

    public function testConfiguredWindowCannotWeakenFixedFiveMinutePolicy(): void
    {
        foreach ([1, 60, 301, '300'] as $window) {
            config(['identity.bootstrap.window_seconds' => $window]);
            $response = $this->withHttps()->get('/api/v1/auth/csrf');
            $response->assertStatus(503);
            $this->assertEmpty($response->headers->getCookies());
            $this->assertSame(0, DB::table('passenger_sessions')->count());
            $this->assertSame(0, DB::table('security_rate_limits')->count());
        }
    }

    public function testDatabaseUnavailableProducesCanonical503WithoutSetCookie(): void
    {
        // Inject a failing DB connection or query listener throwing PDOException
        DB::listen(function ($query) {
            if (str_contains($query->sql, 'pg_advisory_xact_lock')) {
                throw new \Illuminate\Database\QueryException(
                    'pgsql',
                    'SELECT pg_advisory_xact_lock(1)',
                    [],
                    new \PDOException('Connection to server lost')
                );
            }
        });

        $response = $this->withHttps()->get('/api/v1/auth/csrf');
        $response->assertStatus(503);
        $this->assertSame('service_unavailable', $response->json('error.code'));
        $this->assertFalse($response->json('success'));
        $this->assertEmpty($response->headers->getCookies(), '503 must not return Set-Cookie.');
    }
}
