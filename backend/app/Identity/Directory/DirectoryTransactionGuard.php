<?php

declare(strict_types=1);

namespace App\Identity\Directory;

use App\Identity\Directory\Exceptions\DirectoryGuardException;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Rbac\RbacPolicy;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

/**
 * Shared staff directory transaction authority.
 *
 * Enforces strict, bounded transaction locking hierarchy:
 * 1. staff_directory_control (id = 1) FOR UPDATE
 * 2. staff_users (all rows sorted UUID ASC) FOR UPDATE
 * 3. affected staff_sessions / staff_mfa_credentials FOR UPDATE
 * 4. validates actual actor current state, live session, permission, and step-up AFTER locks
 * 5. executes closed, typed DirectoryMutationPlan (no arbitrary callables or raw DB authority)
 * 6. verifies post-change directory preserves >= 1 eligible admin within same transaction
 * 7. rejects < 1 with fixed last_admin_conflict and rolls back
 * 8. updates staff_directory_control sentinel and commits
 */
final class DirectoryTransactionGuard
{
    public const SENTINEL_ID = 1;
    public const STEP_UP_MAX_AGE_SECONDS = 300; // 5 minutes

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly ?RbacPolicy $rbacPolicy = null,
        private readonly ?StaffEligibilityPredicate $eligibilityPredicate = null,
    ) {
    }

    /**
     * Execute a directory-affecting mutation initiated by an authenticated staff actor.
     *
     * @param string $actorStaffId
     * @param string $actorSessionId
     * @param DirectoryMutationPlan $plan
     * @return DirectoryMutationResult
     */
    public function executeAsStaff(
        string $actorStaffId,
        string $actorSessionId,
        DirectoryMutationPlan $plan,
    ): DirectoryMutationResult {
        return $this->runWithinGuard(
            actorStaffId: $actorStaffId,
            actorSessionId: $actorSessionId,
            plan: $plan,
            isOfflineSystem: false,
        );
    }

    /**
     * Execute a directory-affecting mutation initiated by an authenticated staff actor,
     * throwing on any guard denial or conflict.
     *
     * @throws LastAdminConflictException
     * @throws DirectoryGuardException
     */
    public function executeAsStaffOrThrow(
        string $actorStaffId,
        string $actorSessionId,
        DirectoryMutationPlan $plan,
    ): DirectoryMutationResult {
        $result = $this->executeAsStaff($actorStaffId, $actorSessionId, $plan);

        if (!$result->success) {
            if ($result->errorCode === DirectoryErrorCode::LAST_ADMIN_CONFLICT) {
                throw new LastAdminConflictException(
                    eligibleAdminCount: $result->eligibleAdminCount
                );
            }

            throw new DirectoryGuardException(
                errorCode: $result->errorCode ?? DirectoryErrorCode::MUTATION_FAILED
            );
        }

        return $result;
    }

    /**
     * Execute a directory-affecting mutation via trusted offline system authority.
     * Strictly restricted to non-HTTP environments (CLI scripts / testing fixtures).
     * No caller-supplied header or boolean bypass is permitted.
     *
     * @param DirectoryMutationPlan $plan
     * @return DirectoryMutationResult
     */
    public function executeAsOfflineSystem(
        DirectoryMutationPlan $plan,
    ): DirectoryMutationResult {
        // Enforce non-HTTP context guard
        if (isset($_SERVER['REQUEST_METHOD'])
            || !in_array(php_sapi_name(), ['cli', 'phpdbg'], true)
            || (function_exists('app') && app()->bound('request') && !app()->runningInConsole())
        ) {
            return DirectoryMutationResult::failure(
                DirectoryErrorCode::CONTEXT_FORBIDDEN
            );
        }

        return $this->runWithinGuard(
            actorStaffId: null,
            actorSessionId: null,
            plan: $plan,
            isOfflineSystem: true,
        );
    }

    /**
     * Execute a directory-affecting mutation via trusted offline system authority,
     * throwing on any guard denial or conflict.
     *
     * @throws LastAdminConflictException
     * @throws DirectoryGuardException
     */
    public function executeAsOfflineSystemOrThrow(
        DirectoryMutationPlan $plan,
    ): DirectoryMutationResult {
        $result = $this->executeAsOfflineSystem($plan);

        if (!$result->success) {
            if ($result->errorCode === DirectoryErrorCode::LAST_ADMIN_CONFLICT) {
                throw new LastAdminConflictException(
                    eligibleAdminCount: $result->eligibleAdminCount
                );
            }

            throw new DirectoryGuardException(
                errorCode: $result->errorCode ?? DirectoryErrorCode::MUTATION_FAILED
            );
        }

        return $result;
    }

    /**
     * Core guarded execution running under deterministic transaction locks.
     */
    private function runWithinGuard(
        ?string $actorStaffId,
        ?string $actorSessionId,
        DirectoryMutationPlan $plan,
        bool $isOfflineSystem,
    ): DirectoryMutationResult {
        // Reject pre-existing transaction ownership cleanly before writes (never roll back caller's transaction)
        if ($this->db->transactionLevel() > 0) {
            return DirectoryMutationResult::failure(
                DirectoryErrorCode::TRANSACTION_ACTIVE
            );
        }

        $rbac = $this->rbacPolicy ?? new RbacPolicy($this->db);
        $predicate = $this->eligibilityPredicate ?? new StaffEligibilityPredicate($this->db);

        try {
            $this->db->beginTransaction();
            // Step 1: Acquire directory sentinel id=1 FOR UPDATE
            // Fails closed if sentinel row is absent. Never silently creates/repairs state.
            $sentinel = $this->db->table('staff_directory_control')
                ->where('id', self::SENTINEL_ID)
                ->lockForUpdate()
                ->first();

            if (!$sentinel) {
                $this->db->rollBack();
                return DirectoryMutationResult::failure(
                    DirectoryErrorCode::SENTINEL_MISSING
                );
            }

            // Step 2: Acquire all staff_users sorted UUID ASC FOR UPDATE
            // Locks the directory in deterministic ascending order to obtain an honest post-change count
            $this->db->table('staff_users')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id');

            // Verify target staff member exists in the locked directory
            $targetStaffId = $plan->targetStaffId;
            $target = $this->db->table('staff_users')->where('id', $targetStaffId)->first();
            if (!$target) {
                $this->db->rollBack();
                return DirectoryMutationResult::failure(
                    DirectoryErrorCode::TARGET_NOT_FOUND
                );
            }

            if ($plan->intent === DirectoryMutationPlan::INTENT_CHANGE_STATUS
                && $target->status !== $plan->newStatus
                && !(($target->status === 'active' && in_array($plan->newStatus, ['suspended', 'deactivated'], true))
                    || ($target->status === 'pending_enrollment' && $plan->newStatus === 'deactivated'))
            ) {
                $this->db->rollBack();
                return DirectoryMutationResult::failure(DirectoryErrorCode::PLAN_INVALID);
            }

            // Step 3: Lock affected credential rows in deterministic order
            $allAffectedStaff = [$targetStaffId];
            if ($actorStaffId !== null && !in_array($actorStaffId, $allAffectedStaff, true)) {
                $allAffectedStaff[] = $actorStaffId;
            }
            $uniqueStaffIds = array_values(array_unique($allAffectedStaff));
            sort($uniqueStaffIds);
            $this->db->table('staff_mfa_credentials')
                ->whereIn('staff_id', $uniqueStaffIds)
                ->orderBy('staff_id', 'asc')
                ->orderBy('version', 'asc')
                ->lockForUpdate()
                ->get(['staff_id', 'version']);

            // Step 4: Revalidate actor authority AFTER acquiring locks (fresh database truth)
            if (!$isOfflineSystem) {
                $actorCheck = $this->validateActorUnderLocks($actorStaffId, $actorSessionId, $rbac);
                if (!$actorCheck['valid']) {
                    $this->db->rollBack();
                    return DirectoryMutationResult::failure(
                        $actorCheck['error_code']
                    );
                }
            }

            // Step 5: Execute closed typed mutation plan directly (guard owns all database writes)
            $this->executePlanMutation($plan);

            // Step 6: Count proposed post-change directory within same sentinel transaction
            $postChangeEligibleAdmins = $predicate->countEligibleAdmins($this->db);

            // Reject < 1 eligible admin with fixed last_admin_conflict and rollback
            if ($postChangeEligibleAdmins < 1) {
                $this->db->rollBack();
                return DirectoryMutationResult::failure(
                    DirectoryErrorCode::LAST_ADMIN_CONFLICT,
                    $postChangeEligibleAdmins
                );
            }

            // Step 7: Update directory sentinel
            $now = CarbonImmutable::now();
            $this->db->table('staff_directory_control')
                ->where('id', self::SENTINEL_ID)
                ->update([
                    'last_mutated_at' => $now->toIso8601String(),
                    'mutated_by_staff_id' => $isOfflineSystem ? null : $actorStaffId,
                ]);

            $this->db->commit();

            return DirectoryMutationResult::success(
                eligibleAdminCount: $postChangeEligibleAdmins,
                mutatedAt: $now
            );
        } catch (\Throwable) {
            if ($this->db->transactionLevel() > 0) {
                try {
                    $this->db->rollBack();
                } catch (\Throwable) {
                }
            }
            return DirectoryMutationResult::failure(
                DirectoryErrorCode::MUTATION_FAILED
            );
        }
    }

    /**
     * Execute the verified closed mutation plan directly under active locks.
     */
    private function executePlanMutation(DirectoryMutationPlan $plan): void
    {
        switch ($plan->intent) {
            case DirectoryMutationPlan::INTENT_DEMOTE_ROLE:
                $this->db->table('staff_users')
                    ->where('id', $plan->targetStaffId)
                    ->update(['role' => $plan->newRole]);
                break;

            case DirectoryMutationPlan::INTENT_CHANGE_STATUS:
                $this->db->table('staff_users')
                    ->where('id', $plan->targetStaffId)
                    ->update(['status' => $plan->newStatus]);
                break;

            case DirectoryMutationPlan::INTENT_REVOKE_MFA:
                $this->db->table('staff_mfa_credentials')
                    ->where('staff_id', $plan->targetStaffId)
                    ->where('version', $plan->mfaVersion)
                    ->update(['revoked_at' => CarbonImmutable::now()->toIso8601String()]);
                break;

            case DirectoryMutationPlan::INTENT_INVALIDATE_PASSWORD:
                $this->db->table('staff_users')
                    ->where('id', $plan->targetStaffId)
                    ->update(['password_hash' => '$invalid$argon2id$corrupted_hash']);
                break;

            case DirectoryMutationPlan::INTENT_NOOP:
                // Strictly testing actor authorization & eligibility invariants without mutating target state
                break;

            default:
                throw new \InvalidArgumentException('Unsupported mutation plan intent.');
        }
    }

    /**
     * Strict actor validation evaluated freshly AFTER locks are acquired.
     * Enforces:
     * - Live unrevoked unexpired full session matching actor principal
     * - Active principal with verified email, usable native Argon2id hash
     * - Exact credential epoch match
     * - Exact MFA version match
     * - Confirmed unrevoked MFA credential
     * - Permission admin.manage
     * - Recent step-up MFA timestamp: not in future, age < 300s
     */
    private function validateActorUnderLocks(
        string $actorStaffId,
        string $actorSessionId,
        RbacPolicy $rbac,
    ): array {
        // 1. Lock and inspect actor session
        $session = $this->db->table('staff_sessions')
            ->where('id', $actorSessionId)
            ->lockForUpdate()
            ->first();

        if (!$session) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_NOT_FOUND,
            ];
        }

        if ($session->revoked_at !== null) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_REVOKED,
            ];
        }

        if ($session->auth_level !== 'full') {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_INVALID,
            ];
        }

        if ($session->staff_id !== $actorStaffId) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_MISMATCH,
            ];
        }

        $now = CarbonImmutable::now();

        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_EXPIRED,
            ];
        }

        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::SESSION_IDLE_EXPIRED,
            ];
        }

        // 2. Inspect actor principal row (already locked by staff_users lock)
        $staff = $this->db->table('staff_users')
            ->where('id', $actorStaffId)
            ->first();

        if (!$staff) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::ACTOR_NOT_FOUND,
            ];
        }

        if ($staff->status !== 'active') {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::ACTOR_NOT_ACTIVE,
            ];
        }

        if ($staff->email_verified_at === null) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::ACTOR_UNVERIFIED,
            ];
        }

        if (!Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::PASSWORD_UNUSABLE,
            ];
        }

        if ((int) $staff->credential_epoch !== (int) $session->credential_epoch) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::STALE_ACTOR,
            ];
        }

        if ((int) $staff->mfa_version !== (int) $session->mfa_version) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::MFA_VERSION_MISMATCH,
            ];
        }

        // 3. Permission check: admin.manage
        if (!$rbac->hasPermission($staff->role, 'admin.manage')) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::INSUFFICIENT_PERMISSIONS,
            ];
        }

        // 4. Inspect current MFA credential
        $mfa = $this->db->table('staff_mfa_credentials')
            ->where('staff_id', $actorStaffId)
            ->where('version', $staff->mfa_version)
            ->first();

        if (!$mfa || $mfa->confirmed_at === null) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::MFA_UNCONFIRMED,
            ];
        }

        if ($mfa->revoked_at !== null) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::MFA_REVOKED,
            ];
        }

        // 5. Recent step-up MFA timestamp validation
        if ($session->mfa_verified_at === null) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::STEP_UP_REQUIRED,
            ];
        }

        $mfaVerifiedAt = CarbonImmutable::parse($session->mfa_verified_at);

        if ($mfaVerifiedAt->greaterThan($now)) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::STEP_UP_FUTURE,
            ];
        }

        // Exact boundary age >= 300 seconds is expired
        if ($now->greaterThanOrEqualTo($mfaVerifiedAt->addSeconds(self::STEP_UP_MAX_AGE_SECONDS))) {
            return [
                'valid' => false,
                'error_code' => DirectoryErrorCode::STEP_UP_EXPIRED,
            ];
        }

        return ['valid' => true];
    }
}
