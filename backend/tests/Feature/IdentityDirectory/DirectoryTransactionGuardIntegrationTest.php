<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityDirectory;

use App\Identity\Directory\DirectoryErrorCode;
use App\Identity\Directory\DirectoryMutationPlan;
use App\Identity\Directory\DirectoryTransactionGuard;
use App\Identity\Directory\StaffEligibilityPredicate;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityDirectory\DirectoryTestFixture;
use Tests\TestCase;

final class DirectoryTransactionGuardIntegrationTest extends TestCase
{
    private DirectoryTestFixture $fixture;
    private DirectoryTransactionGuard $guard;

    protected function setUp(): void
    {
        parent::setUp();
        $encrypter = $this->app->make(Encrypter::class);
        $this->fixture = new DirectoryTestFixture(DB::connection(), $encrypter);
        $this->fixture->cleanTestData();
        $this->fixture->ensureSentinelExists();
        $this->guard = new DirectoryTransactionGuard(DB::connection());
    }

    protected function tearDown(): void
    {
        $this->fixture->cleanTestData();
        parent::tearDown();
    }

    public function test_unapproved_transition_from_suspended_is_rejected_atomically(): void
    {
        $admin = $this->fixture->createStaff();
        $session = $this->fixture->createStaffSession($admin['id']);
        $target = $this->fixture->createStaff(['status' => 'suspended']);
        $result = $this->guard->executeAsStaff($admin['id'], $session['sessionId'],
            DirectoryMutationPlan::changeStatus($target['id'], 'deactivated'));
        $this->assertFalse($result->success);
        $this->assertSame(DirectoryErrorCode::PLAN_INVALID, $result->errorCode);
        $this->assertSame('suspended', DB::table('staff_users')->where('id', $target['id'])->value('status'));
    }

    public function test_callback_cannot_escape_the_transaction_or_demote_last_admin(): void
    {
        $admin = $this->fixture->createStaff();
        $session = $this->fixture->createStaffSession($admin['id']);
        $called = false;
        try {
            $this->guard->executeAsStaff($admin['id'], $session['sessionId'],
                function ($db) use (&$called, $admin): void {
                    $called = true;
                    $db->table('staff_users')->where('id', $admin['id'])->update(['role' => 'editor']);
                    $db->commit();
                });
            $this->fail('An arbitrary callback must be rejected.');
        } catch (\TypeError) {
            $this->assertFalse($called);
        }
        $this->assertSame('admin', DB::table('staff_users')->where('id', $admin['id'])->value('role'));
        $this->assertSame(1, (new StaffEligibilityPredicate(DB::connection()))->countEligibleAdmins(DB::connection()));
    }

    public function test_single_remaining_eligible_admin_cannot_be_demoted(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        $plan = DirectoryMutationPlan::demoteRole($admin['id'], 'editor');
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $res->errorCode);
        $this->assertSame(0, $res->eligibleAdminCount);

        // Verify database rolled back: admin is still active admin
        $adminDb = DB::table('staff_users')->where('id', $admin['id'])->first();
        $this->assertNotNull($adminDb);
        $this->assertSame('admin', $adminDb->role);
        $this->assertSame('active', $adminDb->status);
    }

    public function test_single_remaining_eligible_admin_cannot_be_suspended(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        $plan = DirectoryMutationPlan::changeStatus($admin['id'], 'suspended');
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $res->errorCode);

        $adminDb = DB::table('staff_users')->where('id', $admin['id'])->first();
        $this->assertNotNull($adminDb);
        $this->assertSame('active', $adminDb->status);
    }

    public function test_single_remaining_eligible_admin_cannot_have_mfa_revoked(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        $plan = DirectoryMutationPlan::revokeMfa($admin['id'], 1);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $res->errorCode);

        $mfaDb = DB::table('staff_mfa_credentials')
            ->where('staff_id', $admin['id'])
            ->where('version', 1)
            ->first();
        $this->assertNotNull($mfaDb);
        $this->assertNull($mfaDb->revoked_at);
    }

    public function test_single_remaining_eligible_admin_cannot_have_password_invalidated(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        $plan = DirectoryMutationPlan::invalidatePassword($admin['id']);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $res->errorCode);

        $adminDb = DB::table('staff_users')->where('id', $admin['id'])->first();
        $this->assertNotNull($adminDb);
        $this->assertSame(DirectoryTestFixture::VALID_ARGON2ID_HASH, $adminDb->password_hash);
    }

    public function test_logged_out_admin_with_zero_sessions_remains_eligible_admin(): void
    {
        // Admin 1 has a live session and mutates Admin 1
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);

        // Admin 2 is fully configured (active, verified, valid Argon hash, confirmed MFA), but HAS ZERO sessions in staff_sessions
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sessionCount = DB::table('staff_sessions')->where('staff_id', $admin2['id'])->count();
        $this->assertSame(0, $sessionCount, 'Admin 2 must have zero live sessions in staff_sessions');

        // Admin 1 demotes Admin 1! Because Admin 2 is configured, post-change eligible count is 1.
        $plan = DirectoryMutationPlan::demoteRole($admin1['id'], 'editor');
        $res = $this->guard->executeAsStaff($admin1['id'], $sess1['sessionId'], $plan);

        $this->assertTrue($res->success);
        $this->assertSame(1, $res->eligibleAdminCount);

        // Verify Admin 2 alone satisfies eligibility predicate
        $predicate = new StaffEligibilityPredicate(DB::connection());
        $this->assertTrue($predicate->isStaffUserEligibleAdmin($admin2['id']));
    }

    public function test_multiple_eligible_admins_permit_demoting_one_leaving_at_least_one(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);

        $plan = DirectoryMutationPlan::demoteRole($admin2['id'], 'editor');
        $res = $this->guard->executeAsStaff($admin1['id'], $sess1['sessionId'], $plan);

        $this->assertTrue($res->success);
        $this->assertSame(1, $res->eligibleAdminCount);

        // Verify admin2 was demoted and admin1 remains admin
        $admin2Db = DB::table('staff_users')->where('id', $admin2['id'])->first();
        $this->assertSame('editor', $admin2Db->role);

        $sentinel = DB::table('staff_directory_control')->where('id', 1)->first();
        $this->assertSame($admin1['id'], $sentinel->mutated_by_staff_id);
    }

    public function test_offline_system_execution_updates_sentinel_with_null_actor(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);

        $plan = DirectoryMutationPlan::demoteRole($admin2['id'], 'viewer');
        $res = $this->guard->executeAsOfflineSystem($plan);

        $this->assertTrue($res->success);
        $this->assertSame(1, $res->eligibleAdminCount);

        $sentinel = DB::table('staff_directory_control')->where('id', 1)->first();
        $this->assertNull($sentinel->mutated_by_staff_id);
    }

    public function test_active_outer_transaction_is_rejected_cleanly_without_aborting_outer_transaction(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        DB::beginTransaction();
        try {
            $plan = DirectoryMutationPlan::demoteRole($admin['id'], 'editor');
            $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

            $this->assertFalse($res->success);
            $this->assertSame(DirectoryErrorCode::TRANSACTION_ACTIVE, $res->errorCode);
            $this->assertSame(1, DB::transactionLevel(), 'Outer transaction must remain open and not be rolled back');
        } finally {
            DB::rollBack();
        }
    }

    public function test_target_not_found_fails_with_target_not_found(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        $plan = DirectoryMutationPlan::noop((string) Str::uuid());
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::TARGET_NOT_FOUND, $res->errorCode);
    }

    public function test_actor_validation_fails_when_actor_is_not_active(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id']);

        // Suspend admin1 directly
        DB::table('staff_users')->where('id', $admin1['id'])->update(['status' => 'suspended']);

        $plan = DirectoryMutationPlan::noop($admin2['id']);
        $res = $this->guard->executeAsStaff($admin1['id'], $sess1['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::ACTOR_NOT_ACTIVE, $res->errorCode);
    }

    public function test_actor_validation_fails_on_epoch_mismatch(): void
    {
        $admin1 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active', 'credential_epoch' => 1]);
        $admin2 = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess1 = $this->fixture->createStaffSession($admin1['id'], ['credential_epoch' => 1]);

        // Increment admin1 epoch to 2
        DB::table('staff_users')->where('id', $admin1['id'])->update(['credential_epoch' => 2]);

        $plan = DirectoryMutationPlan::noop($admin2['id']);
        $res = $this->guard->executeAsStaff($admin1['id'], $sess1['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::STALE_ACTOR, $res->errorCode);
    }

    public function test_actor_validation_fails_when_actor_lacks_admin_manage_permission(): void
    {
        $editor = $this->fixture->createStaff(['role' => 'editor', 'status' => 'active']);
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($editor['id']);

        $plan = DirectoryMutationPlan::noop($admin['id']);
        $res = $this->guard->executeAsStaff($editor['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::INSUFFICIENT_PERMISSIONS, $res->errorCode);
    }

    public function test_actor_validation_fails_when_session_is_revoked(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id'], [
            'revoked_at' => CarbonImmutable::now()->subMinute()->toIso8601String(),
        ]);

        $plan = DirectoryMutationPlan::noop($admin['id']);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::SESSION_REVOKED, $res->errorCode);
    }

    public function test_actor_validation_fails_when_step_up_has_expired(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $now = CarbonImmutable::now();
        // 301 seconds ago (exact boundary >= 300s is expired)
        $expiredStepUp = $now->subSeconds(301)->toIso8601String();
        $sess = $this->fixture->createStaffSession($admin['id'], [
            'mfa_verified_at' => $expiredStepUp,
        ]);

        $plan = DirectoryMutationPlan::noop($admin['id']);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::STEP_UP_EXPIRED, $res->errorCode);
    }

    public function test_actor_validation_fails_when_step_up_is_in_future(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $now = CarbonImmutable::now();
        $futureStepUp = $now->addMinutes(5)->toIso8601String();
        $sess = $this->fixture->createStaffSession($admin['id'], [
            'mfa_verified_at' => $futureStepUp,
        ]);

        $plan = DirectoryMutationPlan::noop($admin['id']);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::STEP_UP_FUTURE, $res->errorCode);
    }

    public function test_sentinel_missing_fails_closed_without_recreating_row(): void
    {
        $admin = $this->fixture->createStaff(['role' => 'admin', 'status' => 'active']);
        $sess = $this->fixture->createStaffSession($admin['id']);

        // Delete sentinel row id=1
        DB::table('staff_directory_control')->where('id', 1)->delete();

        $plan = DirectoryMutationPlan::noop($admin['id']);
        $res = $this->guard->executeAsStaff($admin['id'], $sess['sessionId'], $plan);

        $this->assertFalse($res->success);
        $this->assertSame(DirectoryErrorCode::SENTINEL_MISSING, $res->errorCode);

        // Verify sentinel was NOT silently recreated
        $count = DB::table('staff_directory_control')->where('id', 1)->count();
        $this->assertSame(0, $count);
    }
}
