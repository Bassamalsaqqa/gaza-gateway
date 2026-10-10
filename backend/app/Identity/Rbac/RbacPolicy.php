<?php

declare(strict_types=1);

namespace App\Identity\Rbac;

use App\Identity\Sessions\StaffSessionContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

final class RbacPolicy
{
    public const STEP_UP_MAX_AGE_SECONDS = 300; // 5 minutes

    public const ROLES = [
        'admin',
        'editor',
        'viewer',
    ];

    public const PERMISSIONS = [
        'admin' => [
            'ops.view',
            'ops.edit',
            'content.view',
            'content.edit',
            'commercial.view',
            'commercial.edit',
            'engagement.view',
            'engagement.edit',
            'admin.manage',
            'dashboard.view',
        ],
        'editor' => [
            'dashboard.view',
            'content.view',
            'content.edit',
        ],
        'viewer' => [
            'dashboard.view',
            'ops.view',
            'content.view',
            'commercial.view',
            'engagement.view',
        ],
    ];

    public function __construct(
        private readonly ?ConnectionInterface $db = null,
    ) {
    }

    /**
     * Check if a given role is granted a specific permission.
     * Denies unknown roles and unknown permissions.
     */
    public function hasPermission(string $role, string $permission): bool
    {
        $allowed = self::PERMISSIONS[$role] ?? null;
        if ($allowed === null) {
            return false;
        }

        return in_array($permission, $allowed, true);
    }

    /**
     * Get all canonical permissions granted to a role.
     */
    public function getPermissionsForRole(string $role): array
    {
        return self::PERMISSIONS[$role] ?? [];
    }

    /**
     * Determine if a role is a recognized canonical role.
     */
    public function isValidRole(string $role): bool
    {
        return in_array($role, self::ROLES, true);
    }

    /**
     * Verify whether a staff session satisfies recent step-up authentication.
     * Enforces durable database authority:
     * - Requires database connection (never authorizes detached DTO without DB)
     * - Current durable session exists, unrevoked, unexpired, matches session ID and staff ID
     * - Current durable principal exists, active, verified email, usable Argon2id password, matching epoch
     * - Current confirmed and unrevoked MFA credential
     * - Same-session timestamp within bounds: 0 <= age <= 300 seconds (never future)
     */
    public function hasRecentStepUp(StaffSessionContext $session, ?CarbonImmutable $now = null): bool
    {
        if ($this->db === null) {
            return false;
        }

        if (!$session->isFull() ||
            $session->staffId === null ||
            $session->mfaVersion === null ||
            $session->mfaVerifiedAt === null ||
            $session->credentialEpoch === null
        ) {
            return false;
        }

        $now = $now ?? CarbonImmutable::now();

        // Must not be in the future (reject future instants)
        if ($session->mfaVerifiedAt->greaterThan($now)) {
            return false;
        }

        // Must be under 300 seconds (exact boundary age >= 300 is expired)
        if ($now->greaterThanOrEqualTo($session->mfaVerifiedAt->addSeconds(self::STEP_UP_MAX_AGE_SECONDS))) {
            return false;
        }

        // 1. Verify current durable session in database
        $dbSession = $this->db->table('staff_sessions')
            ->where('id', $session->sessionId)
            ->where('staff_id', $session->staffId)
            ->first();

        if (!$dbSession || $dbSession->revoked_at !== null || $dbSession->auth_level !== 'full') {
            return false;
        }

        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($dbSession->absolute_expires_at))) {
            return false;
        }

        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($dbSession->idle_expires_at))) {
            return false;
        }

        if ((int) $dbSession->mfa_version !== $session->mfaVersion) {
            return false;
        }

        if ($dbSession->mfa_verified_at === null) {
            return false;
        }

        if (!CarbonImmutable::parse($dbSession->mfa_verified_at)->equalTo($session->mfaVerifiedAt)) {
            return false;
        }

        if ((int) $dbSession->credential_epoch !== $session->credentialEpoch) {
            return false;
        }

        // 2. Verify current durable principal in database
        $staff = $this->db->table('staff_users')
            ->where('id', $session->staffId)
            ->first();

        if (!$staff || $staff->status !== 'active' || $staff->email_verified_at === null) {
            return false;
        }

        if (!\App\Identity\Password\Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)) {
            return false;
        }

        if ($session->role !== null && $staff->role !== $session->role) {
            return false;
        }

        if ((int) $staff->credential_epoch !== $session->credentialEpoch) {
            return false;
        }

        if ((int) $staff->mfa_version !== $session->mfaVersion) {
            return false;
        }

        // 3. Verify current confirmed unrevoked MFA credential
        $mfa = $this->db->table('staff_mfa_credentials')
            ->where('staff_id', $session->staffId)
            ->where('version', $session->mfaVersion)
            ->first();

        if (!$mfa || $mfa->confirmed_at === null || $mfa->revoked_at !== null) {
            return false;
        }

        return true;
    }
}
