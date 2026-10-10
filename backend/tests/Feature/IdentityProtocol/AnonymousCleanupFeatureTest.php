<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use App\Identity\Sessions\AnonymousSessionCleanup;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AnonymousCleanupFeatureTest extends TestCase
{
    private AnonymousSessionCleanup $cleanup;

    private array $createdStaffIds = [];
    private array $createdUserIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->cleanup = app(AnonymousSessionCleanup::class);
        $this->cleanupTables();
    }

    protected function tearDown(): void
    {
        $this->cleanupTables();

        parent::tearDown();
    }

    private function cleanupTables(): void
    {
        DB::table('security_rate_limits')->delete();

        foreach ($this->createdStaffIds as $id) {
            DB::table('staff_pending_auth')->where('staff_id', $id)->delete();
            DB::table('staff_sessions')->where('staff_id', $id)->delete();
            DB::table('staff_users')->where('id', $id)->update(['status' => 'invited', 'mfa_version' => null]);
            DB::table('staff_mfa_credentials')->where('staff_id', $id)->delete();
            DB::table('staff_users')->where('id', $id)->delete();
        }
        $this->createdStaffIds = [];

        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->where('auth_level', 'anonymous')->delete();

        foreach ($this->createdUserIds as $id) {
            DB::table('passenger_sessions')->where('user_id', $id)->delete();
            DB::table('users')->where('id', $id)->delete();
        }
        $this->createdUserIds = [];

        DB::table('passenger_sessions')->where('auth_level', 'anonymous')->delete();
    }

    private function createStaffUser(string $staffId): void
    {
        $this->createdStaffIds[] = $staffId;
        $now = CarbonImmutable::now();

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_' . bin2hex(random_bytes(4)),
            'email' => 'staff_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff Test',
            'full_name_ar' => 'موظف تجريبي',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$fake$fake',
            'role' => 'editor',
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
            'encrypted_secret' => 'fake_secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);
    }

    public function testCleanupPurgesExpiredAndRevokedAnonymousSessions(): void
    {
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $receipt1 = $pStore->issueAnonymous();
        $receipt2 = $pStore->issueAnonymous();
        $receipt3 = $pStore->issueAnonymous();

        $now = CarbonImmutable::now();

        // Expire receipt1 absolutely (issued 60m ago, expired 30m ago)
        DB::table('passenger_sessions')->where('id', $receipt1->sessionId)->update([
            'issued_at' => $now->subMinutes(60)->toIso8601String(),
            'absolute_expires_at' => $now->subMinutes(30)->toIso8601String(),
            'idle_expires_at' => $now->subMinutes(30)->toIso8601String(),
            'last_seen_at' => $now->subMinutes(30)->toIso8601String(),
        ]);

        // Revoke receipt2
        $pStore->revoke($receipt2->getRawToken());

        // receipt3 remains active and unexpired

        $this->assertSame(3, DB::table('passenger_sessions')->count());

        $deleted = $this->cleanup->cleanRealmBatch('passenger', 100);
        $this->assertSame(2, $deleted, 'Should purge exactly the 2 expired/revoked anonymous sessions.');

        $this->assertSame(1, DB::table('passenger_sessions')->count());
        $surviving = DB::table('passenger_sessions')->first();
        $this->assertSame($receipt3->sessionId, $surviving->id, 'Active session must survive.');
    }

    public function testCleanupPreservesFullAuthenticatedSessionsEvenIfExpired(): void
    {
        $userId = (string) Str::uuid();
        $this->createdUserIds[] = $userId;
        $now = CarbonImmutable::now();

        // Create user in users table
        DB::table('users')->insert([
            'id' => $userId,
            'email' => 'passenger_' . bin2hex(random_bytes(4)) . '@example.com',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$fake$fake',
            'status' => 'active',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        $fullSessionId = (string) Str::uuid();
        DB::table('passenger_sessions')->insert([
            'id' => $fullSessionId,
            'lookup_digest' => str_repeat('a', 64),
            'user_id' => $userId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => 'fake_payload',
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(), // expired
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
            'revoked_at' => null,
        ]);

        // Also add one expired anonymous session
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $anonReceipt = $pStore->issueAnonymous();
        DB::table('passenger_sessions')->where('id', $anonReceipt->sessionId)->update([
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(),
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
        ]);

        $this->assertSame(2, DB::table('passenger_sessions')->count());

        $deleted = $this->cleanup->cleanRealmBatch('passenger', 100);
        $this->assertSame(1, $deleted, 'Must only delete the anonymous session.');

        $this->assertSame(1, DB::table('passenger_sessions')->count());
        $surviving = DB::table('passenger_sessions')->first();
        $this->assertSame($fullSessionId, $surviving->id, 'Full session must NEVER be deleted by anonymous cleanup.');
    }

    public function testCleanupPreservesStaffSessionsWithLivePendingAuthReferences(): void
    {
        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $anonReceipt = $sStore->issueAnonymous();
        $sessionId = $anonReceipt->sessionId;

        $staffId = (string) Str::uuid();
        $this->createStaffUser($staffId);

        $now = CarbonImmutable::now();

        // Attach live staff_pending_auth referencing this session (issued, expires in 5 min)
        $pendingId = (string) Str::uuid();
        DB::table('staff_pending_auth')->insert([
            'id' => $pendingId,
            'token_digest' => str_repeat('b', 64),
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addMinutes(5)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $sessionId,
            'purpose' => 'login_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 0,
            'encrypted_staged_secret' => null,
        ]);

        // Even if session is expired, it has a live pending auth record referencing it
        DB::table('staff_sessions')->where('id', $sessionId)->update([
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(),
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
        ]);

        $deleted = $this->cleanup->cleanRealmBatch('staff', 100);
        $this->assertSame(0, $deleted, 'Session referenced by live staff_pending_auth must NOT be deleted.');
        $this->assertSame(1, DB::table('staff_sessions')->count());
    }

    public function testCleanupPrunesTerminalPendingAuthAndDeletesExpiredStaffSession(): void
    {
        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $anonReceipt = $sStore->issueAnonymous();
        $sessionId = $anonReceipt->sessionId;

        $staffId = (string) Str::uuid();
        $this->createStaffUser($staffId);

        $now = CarbonImmutable::now();

        // Attach terminal staff_pending_auth (revoked state)
        $pendingId = (string) Str::uuid();
        DB::table('staff_pending_auth')->insert([
            'id' => $pendingId,
            'token_digest' => str_repeat('c', 64),
            'state' => 'revoked',
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'expires_at' => $now->subHour()->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => $now->subHour()->toIso8601String(),
            'staff_id' => $staffId,
            'bound_session_id' => $sessionId,
            'purpose' => 'login_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 0,
            'encrypted_staged_secret' => null,
        ]);

        // Expire session
        DB::table('staff_sessions')->where('id', $sessionId)->update([
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(),
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
        ]);

        $deleted = $this->cleanup->cleanRealmBatch('staff', 100);
        $this->assertSame(1, $deleted, 'Stale/terminal pending auth must be pruned and session deleted.');
        $this->assertSame(0, DB::table('staff_sessions')->count());
        $this->assertSame(0, DB::table('staff_pending_auth')->count());
    }

    public function testCleanupRespectsStrictBatchSize(): void
    {
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $now = CarbonImmutable::now();

        // Create 5 expired anonymous sessions
        for ($i = 0; $i < 5; $i++) {
            $r = $pStore->issueAnonymous();
            DB::table('passenger_sessions')->where('id', $r->sessionId)->update([
                'issued_at' => $now->subHours(2)->toIso8601String(),
                'absolute_expires_at' => $now->subHour()->toIso8601String(),
                'idle_expires_at' => $now->subHour()->toIso8601String(),
                'last_seen_at' => $now->subHour()->toIso8601String(),
            ]);
        }

        $this->assertSame(5, DB::table('passenger_sessions')->count());

        // Batch size of 2 should delete only 2 rows
        $batch1 = $this->cleanup->cleanRealmBatch('passenger', 2);
        $this->assertSame(2, $batch1);
        $this->assertSame(3, DB::table('passenger_sessions')->count());

        // Next batch of 2
        $batch2 = $this->cleanup->cleanRealmBatch('passenger', 2);
        $this->assertSame(2, $batch2);
        $this->assertSame(1, DB::table('passenger_sessions')->count());

        // Next batch of 2 deletes the remaining 1
        $batch3 = $this->cleanup->cleanRealmBatch('passenger', 2);
        $this->assertSame(1, $batch3);
        $this->assertSame(0, DB::table('passenger_sessions')->count());
    }

    public function testStaleBootstrapRateBucketPruning(): void
    {
        $now = CarbonImmutable::now();
        $staleWindowStart = $now->subHours(2);
        $staleWindowEnd = $staleWindowStart->addSeconds(300);

        $freshWindowStart = $now->subMinutes(5);
        $freshWindowEnd = $freshWindowStart->addSeconds(300);

        // Stale bootstrap rate limit bucket (ended 1 hour 55 minutes ago, beyond 1h horizon)
        DB::table('security_rate_limits')->insert([
            'realm' => 'passenger',
            'operation_id' => 'bootstrap',
            'budget_id' => 'global',
            'key_digest' => str_repeat('1', 64),
            'window_start' => $staleWindowStart->toIso8601String(),
            'window_end' => $staleWindowEnd->toIso8601String(),
            'count' => 15,
        ]);

        // Fresh bootstrap rate limit bucket (ended just now, inside 1h horizon)
        DB::table('security_rate_limits')->insert([
            'realm' => 'passenger',
            'operation_id' => 'bootstrap',
            'budget_id' => 'global',
            'key_digest' => str_repeat('2', 64),
            'window_start' => $freshWindowStart->toIso8601String(),
            'window_end' => $freshWindowEnd->toIso8601String(),
            'count' => 5,
        ]);

        // Non-bootstrap operation rate limit bucket (should not be touched by bootstrap cleaner)
        DB::table('security_rate_limits')->insert([
            'realm' => 'passenger',
            'operation_id' => 'login',
            'budget_id' => 'ip',
            'key_digest' => str_repeat('3', 64),
            'window_start' => $staleWindowStart->toIso8601String(),
            'window_end' => $staleWindowEnd->toIso8601String(),
            'count' => 10,
        ]);

        $this->assertSame(3, DB::table('security_rate_limits')->count());

        $pruned = $this->cleanup->cleanBootstrapRateBuckets(batchSize: 100, safeHorizonSeconds: 3600);
        $this->assertSame(1, $pruned, 'Must prune only the stale bootstrap rate bucket.');

        $this->assertSame(2, DB::table('security_rate_limits')->count());
        $remaining = DB::table('security_rate_limits')->pluck('key_digest')->toArray();
        $this->assertContains(str_repeat('2', 64), $remaining, 'Fresh bucket must survive.');
        $this->assertContains(str_repeat('3', 64), $remaining, 'Non-bootstrap bucket must survive.');
    }

    public function testCleanupArtisanCommandRunsAndOutputsSummary(): void
    {
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $r1 = $pStore->issueAnonymous();
        $now = CarbonImmutable::now();
        DB::table('passenger_sessions')->where('id', $r1->sessionId)->update([
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(),
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
        ]);

        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $r2 = $sStore->issueAnonymous();
        DB::table('staff_sessions')->where('id', $r2->sessionId)->update([
            'issued_at' => $now->subHours(2)->toIso8601String(),
            'absolute_expires_at' => $now->subHour()->toIso8601String(),
            'idle_expires_at' => $now->subHour()->toIso8601String(),
            'last_seen_at' => $now->subHour()->toIso8601String(),
        ]);

        $exitCode = Artisan::call('identity:clean-anonymous', [
            '--batches' => 5,
            '--batch-size' => 50,
        ]);

        $this->assertSame(0, $exitCode);
        $output = Artisan::output();
        $this->assertStringContainsString('Passenger Anonymous Sessions', $output);
        $this->assertStringContainsString('Staff Anonymous Sessions', $output);
        $this->assertStringContainsString('cleanup completed successfully', $output);

        $this->assertSame(0, DB::table('passenger_sessions')->count());
        $this->assertSame(0, DB::table('staff_sessions')->count());
    }

    public function testCleanupServiceEnforcesInputValidationBounds(): void
    {
        // Batch size bounds (1..100)
        $this->expectException(\InvalidArgumentException::class);
        $this->cleanup->cleanRealmBatch('passenger', 0);
    }

    public function testCleanupServiceRejectsBatchAbove100(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->cleanup->cleanRealmBatch('passenger', 101);
    }

    public function testCleanupServiceRejectsSafeHorizonBelow3600(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->cleanup->cleanBootstrapRateBuckets(batchSize: 50, safeHorizonSeconds: 3599);
    }

    public function testCleanupServiceRejectsMaxBatchesAbove10(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->cleanup->runCleanup(maxBatchesPerRealm: 11, batchSize: 50, safeHorizonSeconds: 3600);
    }

    public function testCleanupArtisanCommandRejectsInvalidOptionsSafely(): void
    {
        // Batches out of range
        $exitCode = Artisan::call('identity:clean-anonymous', ['--batches' => 15]);
        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Option --batches must be an integer between 1 and 10', Artisan::output());

        // Batch size out of range
        $exitCode = Artisan::call('identity:clean-anonymous', ['--batch-size' => 150]);
        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Option --batch-size must be an integer between 1 and 100', Artisan::output());

        // Horizon out of range
        $exitCode = Artisan::call('identity:clean-anonymous', ['--horizon' => 1800]);
        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Option --horizon must be an integer >= 3600', Artisan::output());
    }

    public function testCleanupIsIdempotent(): void
    {
        $summary1 = $this->cleanup->runCleanup();
        $this->assertSame(0, $summary1['passenger_sessions']);
        $this->assertSame(0, $summary1['staff_sessions']);
        $this->assertSame(0, $summary1['rate_limit_buckets']);

        $summary2 = $this->cleanup->runCleanup();
        $this->assertSame(0, $summary2['passenger_sessions']);
        $this->assertSame(0, $summary2['staff_sessions']);
        $this->assertSame(0, $summary2['rate_limit_buckets']);
    }
}
