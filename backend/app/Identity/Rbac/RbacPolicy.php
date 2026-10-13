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
     * - Explicit password assurance for never-enrolled staff, else current confirmed unrevoked MFA
     * - Exact persisted same-session proof with 0 <= age < 300 seconds (never future)
     */
    public function hasRecentStepUp(StaffSessionContext $session, ?CarbonImmutable $now = null): bool
    {
        if ($this->db === null) {
            return false;
        }

        if (!$session->isFull() || $session->getStaffId() === null || $session->credentialEpoch === null) { return false; }
        $now ??= CarbonImmutable::now();
        $row = $this->db->table('staff_sessions')->where('id', $session->sessionId)->where('staff_id', $session->getStaffId())->first();
        $staff = $this->db->table('staff_users')->where('id', $session->getStaffId())->first();
        if (!$row || !$staff || ($session->role !== null && $staff->role !== $session->role)
            || (int) $row->credential_epoch !== $session->credentialEpoch
            || $row->assurance !== $session->assurance
            || ($row->mfa_version === null ? null : (int) $row->mfa_version) !== $session->mfaVersion
            || ($row->assurance === 'password' && $session->mfaVerifiedAt !== null)) { return false; }
        $persisted = $row->assurance === 'password' ? $row->password_verified_at : $row->mfa_verified_at;
        $observed = $row->assurance === 'password' ? $session->passwordVerifiedAt : $session->mfaVerifiedAt;
        if ($persisted === null || $observed === null || !CarbonImmutable::parse($persisted)->equalTo($observed)) { return false; }
        return (new \App\Identity\Sessions\StaffSessionAuthority($this->db))->valid($staff, $row, $now, true);
    }
}
