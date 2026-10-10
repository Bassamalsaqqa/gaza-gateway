<?php

declare(strict_types=1);

namespace App\Identity\Directory;

/**
 * Closed, typed mutation plan for staff directory operations.
 *
 * Replaces arbitrary callables and raw database connections with a strictly finite,
 * validated intent representation. Target IDs and locked rows are derived directly
 * from the plan; user-selected SQL or unsupported mutation fields are rejected before writes.
 */
final class DirectoryMutationPlan
{
    public const INTENT_DEMOTE_ROLE = 'demote_role';
    public const INTENT_CHANGE_STATUS = 'change_status';
    public const INTENT_REVOKE_MFA = 'revoke_mfa';
    public const INTENT_INVALIDATE_PASSWORD = 'invalidate_password';
    public const INTENT_NOOP = 'noop';

    public const ALLOWED_DEMOTION_ROLES = [
        'editor',
        'viewer',
    ];

    public const ALLOWED_STATUSES = [
        'suspended',
        'deactivated',
    ];

    private function __construct(
        public readonly string $intent,
        public readonly string $targetStaffId,
        public readonly ?string $newRole = null,
        public readonly ?string $newStatus = null,
        public readonly ?int $mfaVersion = null,
    ) {
    }

    public static function demoteRole(string $targetStaffId, string $newRole): self
    {
        self::assertUuid($targetStaffId);
        if (!in_array($newRole, self::ALLOWED_DEMOTION_ROLES, true)) {
            throw new \InvalidArgumentException('Invalid demotion role.');
        }

        return new self(self::INTENT_DEMOTE_ROLE, $targetStaffId, newRole: $newRole);
    }

    public static function changeStatus(string $targetStaffId, string $newStatus): self
    {
        self::assertUuid($targetStaffId);
        if (!in_array($newStatus, self::ALLOWED_STATUSES, true)) {
            throw new \InvalidArgumentException('Invalid staff status.');
        }

        return new self(self::INTENT_CHANGE_STATUS, $targetStaffId, newStatus: $newStatus);
    }

    public static function revokeMfa(string $targetStaffId, int $mfaVersion): self
    {
        self::assertUuid($targetStaffId);
        if ($mfaVersion < 1) {
            throw new \InvalidArgumentException('Invalid MFA version.');
        }

        return new self(self::INTENT_REVOKE_MFA, $targetStaffId, mfaVersion: $mfaVersion);
    }

    public static function invalidatePassword(string $targetStaffId): self
    {
        self::assertUuid($targetStaffId);
        return new self(self::INTENT_INVALIDATE_PASSWORD, $targetStaffId);
    }

    public static function noop(string $targetStaffId): self
    {
        self::assertUuid($targetStaffId);
        return new self(self::INTENT_NOOP, $targetStaffId);
    }

    private static function assertUuid(string $id): void
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
            throw new \InvalidArgumentException('Target staff ID must be a valid UUID string.');
        }
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of DirectoryMutationPlan is prohibited.');
    }
}
