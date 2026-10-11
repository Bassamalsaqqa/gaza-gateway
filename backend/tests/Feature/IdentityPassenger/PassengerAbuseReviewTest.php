<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PassengerAbuseReviewTest extends TestCase
{
    private array $owners = [];

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        foreach ($this->owners as $id) {
            DB::table('users')->where('id', $id)->update(['status' => 'suspended', 'updated_at' => DB::raw('clock_timestamp()')]);
        }
        // Audits, counters, proof/outbox records retain their normal durable cleanup path.
        parent::tearDown();
    }

    public function test_rotating_tokens_and_emails_share_source_ceiling_and_stop_database_growth(): void
    {
        config(['cors.allowed_origins' => ['https://127.0.0.1:5173']]);
        $session = $this->app->make(PassengerSessionStore::class)->issueAnonymous();
        $ip = '2001:db8:' . bin2hex(random_bytes(2)) . ':' . bin2hex(random_bytes(2)) . '::1';
        $keys = []; $atCeiling = null;
        for ($i = 0; $i < 80; $i++) {
            $token = OpaqueToken::generate('passenger', 'proof')->getSecretToken();
            $email = Str::uuid() . '@example.invalid';
            $verify = $i % 2 === 0;
            $subject = $verify ? $token : $email;
            $keys[] = DurableRateLimiter::digestOfCanonicalKey(['ip' => $ip, 'subject_digest' => hash('sha256', $subject)]);
            $this->flushHeaders();
            $response = $this->call('POST', 'https://127.0.0.1:18090/api/v1/auth/' . ($verify ? 'email/verify' : 'password/reset'),
                [], [], [], ['HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090',
                    'HTTP_ORIGIN' => 'https://127.0.0.1:5173', 'HTTP_COOKIE' => 'gza_session=' . $session->getRawToken(),
                    'HTTP_X_CSRF_TOKEN' => $session->getCsrfToken(), 'CONTENT_TYPE' => 'application/json', 'REMOTE_ADDR' => $ip],
                json_encode($verify ? ['token' => $token] : ['email' => $email, 'token' => $token, 'password' => 'Synthetic-reset-password-2026'], JSON_THROW_ON_ERROR));
            $response->assertStatus($i < 60 ? 422 : 429);
            if ($i >= 60) { $this->assertGreaterThan(0, (int) $response->headers->get('Retry-After')); }
            if ($i === 59) { $atCeiling = DB::table('audit_events')->count(); }
        }
        $this->assertSame(60, DB::table('security_rate_limits')->where('realm', 'passenger')->where('operation_id', 'proof')
            ->where('budget_id', 'subject_ip')->whereIn('key_digest', $keys)->count());
        $ipDigest = DurableRateLimiter::digestOfCanonicalKey(['ip' => $ip]);
        $this->assertSame(60, DB::table('security_rate_limits')->where('realm', 'passenger')->where('operation_id', 'proof')
            ->where('budget_id', 'ip')->where('key_digest', $ipDigest)->value('count'));
        $this->assertSame($atCeiling, DB::table('audit_events')->count(), 'Denied admission must not amplify audit storage.');
    }

    public function test_registration_and_recovery_have_measured_common_work_on_both_classes(): void
    {
        $coordinator = $this->app->make(PassengerAuthCoordinator::class);
        $hash = $this->app->make(Argon2idPasswordHasher::class)->hash('Synthetic-password-2026', 'passenger');
        $measurements = ['register_existing' => [], 'register_new' => [], 'forgot_known' => [], 'forgot_unknown' => []];
        $ip = '2001:db8:' . bin2hex(random_bytes(2)) . ':' . bin2hex(random_bytes(2)) . '::2';
        for ($i = 0; $i < 4; $i++) {
            $id = (string) Str::uuid(); $email = $id . '@example.invalid'; $this->owners[] = $id;
            DB::table('users')->insert(['id' => $id, 'email' => $email, 'password_hash' => $hash, 'status' => 'active',
                'credential_epoch' => 1, 'email_verified_at' => DB::raw('clock_timestamp()'),
                'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()')]);
            $newEmail = Str::uuid() . '@example.invalid';
            $pairs = $i % 2 ? [['register_new', $newEmail], ['register_existing', $email]]
                : [['register_existing', $email], ['register_new', $newEmail]];
            $receipts = [];
            foreach ($pairs as [$label, $target]) {
                $start = hrtime(true);
                $receipts[] = $coordinator->register(['email' => $target, 'password' => 'Synthetic-password-2026',
                    'firstName' => 'Synthetic', 'lastName' => 'Fixture'], $ip, (string) Str::uuid());
                $measurements[$label][] = (hrtime(true) - $start) / 1e6;
            }
            $this->assertSame($receipts[0], $receipts[1]);
            $newId = DB::table('users')->where('email', $newEmail)->value('id');
            $this->owners[] = $newId;
            $receipts = [];
            $pairs = $i % 2 ? [['forgot_unknown', Str::uuid() . '@example.invalid'], ['forgot_known', $email]]
                : [['forgot_known', $email], ['forgot_unknown', Str::uuid() . '@example.invalid']];
            foreach ($pairs as [$label, $target]) {
                $start = hrtime(true);
                $receipts[] = $coordinator->passwordForgot(['email' => $target], $ip, (string) Str::uuid());
                $measurements[$label][] = (hrtime(true) - $start) / 1e6;
            }
            $this->assertSame($receipts[0], $receipts[1]);
        }
        $medians = [];
        foreach ($measurements as $name => $values) {
            sort($values); $medians[$name] = ($values[1] + $values[2]) / 2;
            $this->assertGreaterThan(50, $medians[$name], 'Native configured Argon2id work must occur on both classes.');
        }
        foreach ([['register_existing', 'register_new'], ['forgot_known', 'forgot_unknown']] as [$a, $b]) {
            $ratio = $medians[$a] / $medians[$b];
            $this->assertGreaterThan(0.5, $ratio); $this->assertLessThan(2.0, $ratio);
        }
        fwrite(STDOUT, "\nPASSENGER_TIMING_MEDIANS_MS=" . json_encode($medians, JSON_THROW_ON_ERROR) . "\n");
    }

    public function test_rate_cleanup_is_bounded_and_preserves_live_counters(): void
    {
        $limiter = $this->app->make(DurableRateLimiter::class); $digests = [];
        for ($i = 0; $i < 3; $i++) {
            $digest = bin2hex(random_bytes(32)); $digests[] = $digest;
            DB::table('security_rate_limits')->insert(['realm' => 'passenger', 'operation_id' => 'proof', 'budget_id' => 'subject_ip',
                'key_digest' => $digest, 'window_start' => '1900-01-01 00:00:00+00', 'window_end' => '1900-01-01 00:10:00+00', 'count' => 1]);
        }
        $ip = '2001:db8:' . bin2hex(random_bytes(2)) . '::3';
        $this->assertTrue($limiter->charge('passenger', 'proof', ['subject' => 'synthetic-cleanup', 'ip' => $ip])->allowed);
        $ipDigest = DurableRateLimiter::digestOfCanonicalKey(['ip' => $ip]);
        $this->assertSame(1, $limiter->pruneExpired(1));
        $this->assertSame(2, DB::table('security_rate_limits')->whereIn('key_digest', $digests)->count());
        $this->assertSame(1, DB::table('security_rate_limits')->where('key_digest', $ipDigest)->value('count'));
    }
}
