<?php

declare(strict_types=1);

namespace App\Identity\Directory;

use App\Identity\Password\Argon2idPasswordHasher;
use Illuminate\Database\ConnectionInterface;

/**
 * Strict staff administrator eligibility predicate.
 *
 * An eligible administrator MUST strictly satisfy all of the following:
 * 1. role === 'admin' (viewer and editor roles do NOT count)
 * 2. status === 'active' (invited, pending_enrollment, suspended, deactivated do NOT count)
 * 3. email_verified_at !== null (unverified emails do NOT count)
 * 4. password_hash is a canonical bounded native Argon2id hash (unusable, missing, or malformed hashes do NOT count)
 * 5. Either MFA has never been confirmed, or mfa_version is >= 1
 * 6. If enrolled, the current MFA credential (staff_id, version) is confirmed (confirmed_at !== null)
 * 7. If enrolled, the current MFA credential (staff_id, version) is NOT revoked (revoked_at === null)
 */
final class StaffEligibilityPredicate
{
    public function __construct(
        private readonly ?ConnectionInterface $db = null,
    ) {
    }

    /**
     * Exact evaluation of admin eligibility predicate against raw attribute values.
     */
    public function isEligibleAdminAttributes(
        string $role,
        string $status,
        ?string $emailVerifiedAt,
        ?string $passwordHash,
        ?int $mfaVersion,
        ?string $mfaConfirmedAt,
        ?string $mfaRevokedAt,
    ): bool {
        if ($role !== 'admin') {
            return false;
        }

        if ($status !== 'active') {
            return false;
        }

        if ($emailVerifiedAt === null) {
            return false;
        }

        if (!Argon2idPasswordHasher::isValidStoredHashStructure($passwordHash)) {
            return false;
        }

        if ($mfaVersion === null) {
            return $mfaConfirmedAt === null && $mfaRevokedAt === null;
        }
        if ($mfaVersion < 1) { return false; }

        if ($mfaConfirmedAt === null) {
            return false;
        }

        if ($mfaRevokedAt !== null) {
            return false;
        }

        return true;
    }

    /**
     * Count total eligible administrators satisfying the predicate in the database.
     * Evaluated under the caller's active database transaction / locks.
     */
    public function countEligibleAdmins(?ConnectionInterface $connection = null): int
    {
        $db = $connection ?? $this->db;
        if ($db === null) {
            throw new \InvalidArgumentException('Database connection required to count eligible administrators.');
        }

        // Query active admin candidates joining confirmed, unrevoked MFA credentials
        $candidates = $db->table('staff_users as su')
            ->leftJoin('staff_mfa_credentials as smc', function ($join) {
                $join->on('smc.staff_id', '=', 'su.id')
                    ->on('smc.version', '=', 'su.mfa_version');
            })
            ->where('su.role', '=', 'admin')
            ->where('su.status', '=', 'active')
            ->whereNotNull('su.email_verified_at')
            ->whereNotNull('su.password_hash')
            ->where(function ($query) {
                $query->where(function ($password) {
                    $password->whereNull('su.mfa_version')->whereNotExists(function ($history) {
                        $history->selectRaw('1')->from('staff_mfa_credentials as history')
                            ->whereColumn('history.staff_id', 'su.id')->whereNotNull('history.confirmed_at');
                    });
                })->orWhere(function ($mfa) {
                    $mfa->whereNotNull('su.mfa_version')->whereNotNull('smc.confirmed_at')->whereNull('smc.revoked_at');
                });
            })
            ->select(['su.id', 'su.password_hash'])
            ->get();

        $count = 0;
        foreach ($candidates as $candidate) {
            if (Argon2idPasswordHasher::isValidStoredHashStructure($candidate->password_hash)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Check if a specific staff user ID is currently an eligible administrator in the database.
     */
    public function isStaffUserEligibleAdmin(string $staffId, ?ConnectionInterface $connection = null): bool
    {
        $db = $connection ?? $this->db;
        if ($db === null) {
            throw new \InvalidArgumentException('Database connection required to check staff user eligibility.');
        }

        $row = $db->table('staff_users as su')
            ->leftJoin('staff_mfa_credentials as smc', function ($join) {
                $join->on('smc.staff_id', '=', 'su.id')
                    ->on('smc.version', '=', 'su.mfa_version');
            })
            ->where('su.id', $staffId)
            ->select([
                'su.role',
                'su.status',
                'su.email_verified_at',
                'su.password_hash',
                'su.mfa_version',
                'smc.confirmed_at as mfa_confirmed_at',
                'smc.revoked_at as mfa_revoked_at',
            ])
            ->first();

        if (!$row || ($row->mfa_version === null && $db->table('staff_mfa_credentials')->where('staff_id', $staffId)->whereNotNull('confirmed_at')->exists())) {
            return false;
        }

        return $this->isEligibleAdminAttributes(
            role: (string) $row->role,
            status: (string) $row->status,
            emailVerifiedAt: $row->email_verified_at !== null ? (string) $row->email_verified_at : null,
            passwordHash: $row->password_hash !== null ? (string) $row->password_hash : null,
            mfaVersion: $row->mfa_version !== null ? (int) $row->mfa_version : null,
            mfaConfirmedAt: $row->mfa_confirmed_at !== null ? (string) $row->mfa_confirmed_at : null,
            mfaRevokedAt: $row->mfa_revoked_at !== null ? (string) $row->mfa_revoked_at : null,
        );
    }
}
