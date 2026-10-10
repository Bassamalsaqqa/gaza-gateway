<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Identity\RateLimiting\DurableRateLimiter;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DurableRateLimiterTest extends TestCase
{
    private DurableRateLimiter $limiter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->limiter = new DurableRateLimiter(DB::connection());
    }

    public function test_login_rate_limits_enforce_exact_budgets(): void
    {
        $now = CarbonImmutable::parse('2026-10-09 12:00:00');
        $this->limiter->setClock($now);
        $subject = 'user_login_rate_test_' . bin2hex(random_bytes(4));
        $ip = '198.51.100.' . mt_rand(1, 254);

        // Budget for login subject_ip is 5 requests per 60 seconds
        for ($i = 1; $i <= 5; $i++) {
            $result = $this->limiter->charge('passenger', 'login', [
                'subject' => $subject,
                'ip' => $ip,
            ], cost: 1);

            $this->assertTrue($result->allowed, "Charge {$i} should have been allowed");
            $this->assertSame(5 - $i, $result->remaining);
            $this->assertSame(0, $result->retryAfterSeconds);
        }

        // 6th attempt must be denied
        $denied = $this->limiter->charge('passenger', 'login', [
            'subject' => $subject,
            'ip' => $ip,
        ], cost: 1);

        $this->assertFalse($denied->allowed);
        $this->assertSame(0, $denied->remaining);
        $this->assertGreaterThan(0, $denied->retryAfterSeconds);
        $this->assertLessThanOrEqual(60, $denied->retryAfterSeconds);
    }

    public function test_atomic_multi_budget_charge_rolls_back_if_one_budget_denies(): void
    {
        $now = CarbonImmutable::parse('2026-10-09 13:00:00');
        $this->limiter->setClock($now);
        $subject1 = 'user_sub1_' . bin2hex(random_bytes(4));
        $ip = '203.0.113.' . mt_rand(1, 254);

        // 1. Exhaust subject1 budget (5 charges)
        for ($i = 1; $i <= 5; $i++) {
            $this->limiter->charge('passenger', 'login', [
                'subject' => $subject1,
                'ip' => $ip,
            ], cost: 1);
        }

        // Check current count for ip budget in database
        $ipKeyDigest = DurableRateLimiter::digestOfCanonicalKey(['ip' => $ip]);
        $ipRowBefore = DB::table('security_rate_limits')
            ->where('budget_id', 'ip')
            ->where('key_digest', $ipKeyDigest)
            ->first();
        $this->assertNotNull($ipRowBefore);
        $this->assertSame(5, (int) $ipRowBefore->count);

        // 2. Attempt 6th charge with subject1 (subject budget denied)
        $result = $this->limiter->charge('passenger', 'login', [
            'subject' => $subject1,
            'ip' => $ip,
        ], cost: 1);
        $this->assertFalse($result->allowed);

        // 3. Verify ip budget count was NOT incremented on failure (strict atomic rollback)
        $ipRowAfter = DB::table('security_rate_limits')
            ->where('budget_id', 'ip')
            ->where('key_digest', $ipKeyDigest)
            ->first();
        $this->assertSame(5, (int) $ipRowAfter->count);
    }

    public function test_unknown_realm_or_operation_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown rate limit realm.');
        $this->limiter->charge('unauthorized_realm', 'login', ['ip' => '1.2.3.4', 'subject' => 'test']);
    }

    public function test_unknown_operation_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Operation not permitted for realm.');
        $this->limiter->charge('passenger', 'unknown_operation', ['ip' => '1.2.3.4', 'subject' => 'test']);
    }

    public function test_invalid_cost_bounds_rejected(): void
    {
        try {
            $this->limiter->charge('passenger', 'login', ['ip' => '1.2.3.4', 'subject' => 'test'], cost: 0);
            $this->fail('Cost 0 should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid rate limit cost.', $e->getMessage());
        }

        try {
            $this->limiter->charge('passenger', 'login', ['ip' => '1.2.3.4', 'subject' => 'test'], cost: 1001);
            $this->fail('Cost 1001 should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid rate limit cost.', $e->getMessage());
        }
    }

    public function test_missing_or_unexpected_keys_rejected(): void
    {
        // Missing required key
        try {
            $this->limiter->charge('passenger', 'login', ['ip' => '1.2.3.4']);
            $this->fail('Missing subject should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Missing required rate limit key.', $e->getMessage());
        }

        // Unexpected extra key
        try {
            $this->limiter->charge('passenger', 'login', [
                'subject' => 'valid-subject',
                'ip' => '1.2.3.4',
                'malicious_extra_key' => 'attacker_value',
            ]);
            $this->fail('Unexpected extra key should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Unexpected rate limit key.', $e->getMessage());
        }
    }

    public function test_conflicting_key_aliases_rejected(): void
    {
        try {
            $this->limiter->charge('passenger', 'login', [
                'subject' => 'valid-user',
                'subject_digest' => str_repeat('a', 64),
                'ip' => '1.2.3.4',
            ]);
            $this->fail('Conflicting subject aliases should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Conflicting rate limit keys.', $e->getMessage());
        }
    }

    public function test_invalid_key_formats_rejected(): void
    {
        // Invalid IP
        try {
            $this->limiter->charge('passenger', 'login', [
                'subject' => 'valid-user',
                'ip' => 'not-an-ip-address',
            ]);
            $this->fail('Invalid IP should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid rate limit key format.', $e->getMessage());
        }

        // Uppercase digest (ambiguous hash case)
        try {
            $this->limiter->charge('passenger', 'login', [
                'subject_digest' => str_repeat('A', 64),
                'ip' => '1.2.3.4',
            ]);
            $this->fail('Uppercase digest should be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid rate limit key format.', $e->getMessage());
        }
    }

    public function test_rate_window_clock_wait_boundary_does_not_charge_expired_window(): void
    {
        $subject = 'user_drift_' . bin2hex(random_bytes(4));
        $ip = '198.51.100.99';

        $startClock = CarbonImmutable::parse('2030-01-01 00:00:59');
        $this->limiter->setClock($startClock);

        // First charge at 00:00:59 charges the 00:00:00-00:01:00 window
        $res1 = $this->limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
        $this->assertTrue($res1->allowed);

        // Advance clock across boundary to 00:01:01
        $advancedClock = CarbonImmutable::parse('2030-01-01 00:01:01');
        $this->limiter->setClock($advancedClock);

        // Second charge at 00:01:01 must charge the 00:01:00-00:02:00 window, NOT the old window
        $res2 = $this->limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
        $this->assertTrue($res2->allowed);

        $subjectKeyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'subject_digest' => hash('sha256', $subject),
            'ip' => $ip,
        ]);

        $oldWindow = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:00:00')->toIso8601String())
            ->first();
        $this->assertNotNull($oldWindow);
        $this->assertSame(1, (int) $oldWindow->count);

        $newWindow = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:01:00')->toIso8601String())
            ->first();
        $this->assertNotNull($newWindow);
        $this->assertSame(1, (int) $newWindow->count);
    }

    public function test_lock_wait_window_drift_retries_and_does_not_charge_expired_window(): void
    {
        $subject = 'user_listener_drift_' . bin2hex(random_bytes(4));
        $ip = '198.51.100.88';

        $clock = CarbonImmutable::parse('2030-01-01 00:00:59');
        $this->limiter->setClock(function () use (&$clock) {
            return $clock;
        });

        // Set DB query listener to advance clock across boundary upon the first FOR UPDATE query
        $hasAdvanced = false;
        DB::listen(function ($query) use (&$clock, &$hasAdvanced) {
            if (!$hasAdvanced && str_contains($query->sql, 'FOR UPDATE') && str_contains($query->sql, 'security_rate_limits')) {
                $hasAdvanced = true;
                $clock = CarbonImmutable::parse('2030-01-01 00:01:01');
            }
        });

        $res = $this->limiter->charge('passenger', 'login', ['subject' => $subject, 'ip' => $ip]);
        $this->assertTrue($res->allowed);

        $subjectKeyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'subject_digest' => hash('sha256', $subject),
            'ip' => $ip,
        ]);

        $expiredWindowRow = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:00:00')->toIso8601String())
            ->first();
        if ($expiredWindowRow !== null) {
            $this->assertSame(0, (int) $expiredWindowRow->count, 'Expired window must NOT be charged');
        }

        $newWindowRow = DB::table('security_rate_limits')
            ->where('budget_id', 'subject_ip')
            ->where('key_digest', $subjectKeyDigest)
            ->where('window_start', CarbonImmutable::parse('2030-01-01 00:01:00')->toIso8601String())
            ->first();
        $this->assertNotNull($newWindowRow);
        $this->assertSame(1, (int) $newWindowRow->count, 'Fresh window must be charged after drift retry');
    }

    public function test_rate_limit_result_serialization_is_sanitized(): void
    {
        $subject = 'user_sanitized_' . bin2hex(random_bytes(4));
        $ip = '192.0.2.1';
        $result = $this->limiter->charge('passenger', 'login', [
            'subject' => $subject,
            'ip' => $ip,
        ]);

        $json = json_encode($result, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($subject, $json);
        $this->assertStringNotContainsString($ip, $json);

        $array = $result->jsonSerialize();
        $this->assertArrayHasKey('allowed', $array);
        $this->assertArrayHasKey('remaining', $array);
        $this->assertArrayHasKey('retry_after_seconds', $array);
    }

    public function test_clock_injection_rejects_mismatched_runtime_environment(): void
    {
        $previous = config('app.env');
        try {
            config(['app.env' => 'production']);
            $this->expectException(\LogicException::class);
            $this->limiter->setClock(CarbonImmutable::now());
        } finally {
            config(['app.env' => $previous]);
        }
    }

    public function test_key_adapter_canonicalizes_equivalent_ipv6_spellings_and_uuid_casing_to_share_bucket(): void
    {
        $rawStaffId = (string) Str::uuid();
        $upperStaffId = strtoupper($rawStaffId);
        $lowerStaffId = strtolower($rawStaffId);

        $rawSessionId = (string) Str::uuid();
        $upperSessionId = strtoupper($rawSessionId);
        $lowerSessionId = strtolower($rawSessionId);

        $ipv6Expanded = '2001:0db8:0000:0000:0000:0000:0000:0001';
        $ipv6Compressed = '2001:db8::1';

        // Charge 1 with uppercase UUIDs and expanded IPv6
        $res1 = $this->limiter->charge('staff', 'stepUp', [
            'staff_id' => $upperStaffId,
            'session_id' => $upperSessionId,
            'ip' => $ipv6Expanded,
        ]);
        $this->assertTrue($res1->allowed);

        // Charge 2 with camelCase aliases, lowercase UUIDs, and compressed IPv6
        $res2 = $this->limiter->charge('staff', 'stepUp', [
            'staffId' => $lowerStaffId,
            'sessionId' => $lowerSessionId,
            'ip' => $ipv6Compressed,
        ]);
        $this->assertTrue($res2->allowed);

        // Verify database: exactly 1 row exists with count = 2 for staff_session_ip budget
        $canonicalIp = inet_ntop(inet_pton($ipv6Compressed));
        $keyDigest = DurableRateLimiter::digestOfCanonicalKey([
            'ip' => $canonicalIp,
            'session_id' => $lowerSessionId,
            'staff_id' => $lowerStaffId,
        ]);

        $row = DB::table('security_rate_limits')
            ->where('budget_id', 'staff_session_ip')
            ->where('key_digest', $keyDigest)
            ->first();
        $this->assertNotNull($row);
        $this->assertSame(2, (int) $row->count, 'Equivalent UUID casing and IPv6 spellings must share exact same bucket count = 2');
    }
}
