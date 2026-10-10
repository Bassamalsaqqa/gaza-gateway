<?php

declare(strict_types=1);

namespace App\Identity\Directory;

/**
 * Closed finite error codes and fixed internal messages for staff directory operations.
 *
 * Guarantees that arbitrary caller-supplied strings or credential sentinels
 * can never be reflected in error codes or error messages.
 */
final class DirectoryErrorCode
{
    public const LAST_ADMIN_CONFLICT = 'last_admin_conflict';
    public const SENTINEL_MISSING = 'sentinel_missing';
    public const ACTOR_NOT_FOUND = 'actor_not_found';
    public const ACTOR_NOT_ACTIVE = 'actor_not_active';
    public const ACTOR_UNVERIFIED = 'actor_unverified';
    public const PASSWORD_UNUSABLE = 'password_unusable';
    public const STALE_ACTOR = 'stale_actor';
    public const MFA_VERSION_MISMATCH = 'mfa_version_mismatch';
    public const INSUFFICIENT_PERMISSIONS = 'insufficient_permissions';
    public const MFA_UNCONFIRMED = 'mfa_unconfirmed';
    public const MFA_REVOKED = 'mfa_revoked';
    public const SESSION_NOT_FOUND = 'session_not_found';
    public const SESSION_REVOKED = 'session_revoked';
    public const SESSION_INVALID = 'session_invalid';
    public const SESSION_MISMATCH = 'session_mismatch';
    public const SESSION_EXPIRED = 'session_expired';
    public const SESSION_IDLE_EXPIRED = 'session_idle_expired';
    public const STEP_UP_REQUIRED = 'step_up_required';
    public const STEP_UP_FUTURE = 'step_up_future';
    public const STEP_UP_EXPIRED = 'step_up_expired';
    public const MUTATION_FAILED = 'mutation_failed';
    public const CONTEXT_FORBIDDEN = 'context_forbidden';
    public const TRANSACTION_ACTIVE = 'transaction_active';
    public const PLAN_INVALID = 'plan_invalid';
    public const TARGET_NOT_FOUND = 'target_not_found';
    public const UNKNOWN_ERROR = 'unknown_error';

    private const MESSAGES = [
        self::LAST_ADMIN_CONFLICT => 'Directory mutation rejected: at least one eligible administrator must remain active and fully configured.',
        self::SENTINEL_MISSING => 'Staff directory sentinel row (id=1) is missing or unconfigured.',
        self::ACTOR_NOT_FOUND => 'Actor principal does not exist.',
        self::ACTOR_NOT_ACTIVE => 'Actor principal is not active.',
        self::ACTOR_UNVERIFIED => 'Actor principal email is not verified.',
        self::PASSWORD_UNUSABLE => 'Actor password hash is missing, malformed, or unusable.',
        self::STALE_ACTOR => 'Actor credential epoch mismatch.',
        self::MFA_VERSION_MISMATCH => 'Actor MFA version mismatch.',
        self::INSUFFICIENT_PERMISSIONS => 'Actor lacks required admin.manage permission.',
        self::MFA_UNCONFIRMED => 'Actor MFA credential is not confirmed.',
        self::MFA_REVOKED => 'Actor MFA credential has been revoked.',
        self::SESSION_NOT_FOUND => 'Actor session does not exist.',
        self::SESSION_REVOKED => 'Actor session has been revoked.',
        self::SESSION_INVALID => 'Actor session auth level is not full.',
        self::SESSION_MISMATCH => 'Actor session principal mismatch.',
        self::SESSION_EXPIRED => 'Actor session has reached its absolute expiration deadline.',
        self::SESSION_IDLE_EXPIRED => 'Actor session has expired due to idleness.',
        self::STEP_UP_REQUIRED => 'Actor session lacks MFA verification timestamp.',
        self::STEP_UP_FUTURE => 'Actor MFA verification timestamp is in the future.',
        self::STEP_UP_EXPIRED => 'Actor recent step-up authentication has expired.',
        self::MUTATION_FAILED => 'Directory mutation failed.',
        self::CONTEXT_FORBIDDEN => 'Offline system directory execution is forbidden in HTTP request contexts.',
        self::TRANSACTION_ACTIVE => 'Active outer transaction detected. DirectoryTransactionGuard requires exclusive transaction ownership.',
        self::PLAN_INVALID => 'Directory mutation plan is invalid or unsupported.',
        self::TARGET_NOT_FOUND => 'Target staff member does not exist in directory.',
        self::UNKNOWN_ERROR => 'An unknown directory error occurred.',
    ];

    public static function isValid(string $code): bool
    {
        return array_key_exists($code, self::MESSAGES);
    }

    public static function canonicalCode(string $code): string
    {
        return self::isValid($code) ? $code : self::UNKNOWN_ERROR;
    }

    public static function messageFor(string $code): string
    {
        return self::MESSAGES[$code] ?? self::MESSAGES[self::UNKNOWN_ERROR];
    }
}
