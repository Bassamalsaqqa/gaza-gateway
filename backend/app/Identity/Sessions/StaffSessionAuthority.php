<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use App\Identity\Password\Argon2idPasswordHasher;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

/** Evaluate persisted authority under the caller's principal/session locks. */
final class StaffSessionAuthority
{
    public function __construct(private readonly ConnectionInterface $db) {}

    public function valid(object $staff, object $session, CarbonImmutable $now, bool $recent = false): bool
    {
        if ($staff->status !== 'active' || $staff->email_verified_at === null
            || !in_array($staff->role, ['admin', 'editor', 'viewer'], true)
            || !Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)
            || $session->auth_level !== 'full' || $session->staff_id !== $staff->id
            || $session->revoked_at !== null || $session->credential_epoch === null
            || (int) $session->credential_epoch !== (int) $staff->credential_epoch
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) { return false; }
        if ($session->assurance === 'password') {
            // No fallback for a broken, revoked or previously enrolled MFA account.
            if ($staff->mfa_version !== null || $session->mfa_version !== null || $session->mfa_verified_at !== null
                || $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)->whereNotNull('confirmed_at')->exists()) { return false; }
            $verified = $session->password_verified_at;
        } elseif ($session->assurance === 'mfa') {
            if ($staff->mfa_version === null || $session->mfa_version === null
                || (int) $staff->mfa_version !== (int) $session->mfa_version) { return false; }
            $credential = $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)
                ->where('version', $staff->mfa_version)->first();
            if (!$credential || $credential->confirmed_at === null || $credential->revoked_at !== null) { return false; }
            $verified = $session->mfa_verified_at;
        } else { return false; }
        if ($verified === null) { return false; }
        $at = CarbonImmutable::parse($verified);
        return !$at->greaterThan($now) && (!$recent || $now->lessThan($at->addSeconds(300)));
    }
}
