<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityDirectory;

use App\Identity\Directory\StaffEligibilityPredicate;
use PHPUnit\Framework\TestCase;

final class StaffEligibilityPredicateTest extends TestCase
{
    private StaffEligibilityPredicate $predicate;

    private const VALID_HASH = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
    private const VALID_DATE = '2026-10-10T08:00:00+00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->predicate = new StaffEligibilityPredicate();
    }

    public function test_fully_valid_admin_is_eligible(): void
    {
        $this->assertTrue(
            $this->predicate->isEligibleAdminAttributes(
                role: 'admin',
                status: 'active',
                emailVerifiedAt: self::VALID_DATE,
                passwordHash: self::VALID_HASH,
                mfaVersion: 1,
                mfaConfirmedAt: self::VALID_DATE,
                mfaRevokedAt: null,
            )
        );
    }

    public function test_non_admin_roles_are_ineligible(): void
    {
        foreach (['editor', 'viewer', 'superadmin', 'guest', ''] as $role) {
            $this->assertFalse(
                $this->predicate->isEligibleAdminAttributes(
                    role: $role,
                    status: 'active',
                    emailVerifiedAt: self::VALID_DATE,
                    passwordHash: self::VALID_HASH,
                    mfaVersion: 1,
                    mfaConfirmedAt: self::VALID_DATE,
                    mfaRevokedAt: null,
                ),
                "Role '{$role}' must not be an eligible admin"
            );
        }
    }

    public function test_non_active_statuses_are_ineligible(): void
    {
        foreach (['invited', 'pending_enrollment', 'suspended', 'deactivated', 'unknown'] as $status) {
            $this->assertFalse(
                $this->predicate->isEligibleAdminAttributes(
                    role: 'admin',
                    status: $status,
                    emailVerifiedAt: self::VALID_DATE,
                    passwordHash: self::VALID_HASH,
                    mfaVersion: 1,
                    mfaConfirmedAt: self::VALID_DATE,
                    mfaRevokedAt: null,
                ),
                "Status '{$status}' must not be an eligible admin"
            );
        }
    }

    public function test_unverified_email_is_ineligible(): void
    {
        $this->assertFalse(
            $this->predicate->isEligibleAdminAttributes(
                role: 'admin',
                status: 'active',
                emailVerifiedAt: null,
                passwordHash: self::VALID_HASH,
                mfaVersion: 1,
                mfaConfirmedAt: self::VALID_DATE,
                mfaRevokedAt: null,
            )
        );
    }

    public function test_unusable_or_malformed_password_hashes_are_ineligible(): void
    {
        $invalidHashes = [
            null,
            '',
            'plain-text-password',
            '$2y$12$someBcryptHashWhichIsNotArgon2id',
            '$argon2i$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo', // argon2i, not argon2id
            '$argon2id$v=19$m=512,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo', // memory < 1024
            '$argon2id$v=19$m=65536,t=0,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo', // t < 1
            '$argon2id$v=19$m=65536,t=4,p=1$shortsalt$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo', // salt invalid length
        ];

        foreach ($invalidHashes as $hash) {
            $this->assertFalse(
                $this->predicate->isEligibleAdminAttributes(
                    role: 'admin',
                    status: 'active',
                    emailVerifiedAt: self::VALID_DATE,
                    passwordHash: $hash,
                    mfaVersion: 1,
                    mfaConfirmedAt: self::VALID_DATE,
                    mfaRevokedAt: null,
                )
            );
        }
    }

    public function test_null_or_invalid_mfa_version_is_ineligible(): void
    {
        foreach ([null, 0, -1] as $mfaVer) {
            $this->assertFalse(
                $this->predicate->isEligibleAdminAttributes(
                    role: 'admin',
                    status: 'active',
                    emailVerifiedAt: self::VALID_DATE,
                    passwordHash: self::VALID_HASH,
                    mfaVersion: $mfaVer,
                    mfaConfirmedAt: self::VALID_DATE,
                    mfaRevokedAt: null,
                )
            );
        }
    }

    public function test_unconfirmed_mfa_is_ineligible(): void
    {
        $this->assertFalse(
            $this->predicate->isEligibleAdminAttributes(
                role: 'admin',
                status: 'active',
                emailVerifiedAt: self::VALID_DATE,
                passwordHash: self::VALID_HASH,
                mfaVersion: 1,
                mfaConfirmedAt: null,
                mfaRevokedAt: null,
            )
        );
    }

    public function test_revoked_mfa_is_ineligible(): void
    {
        $this->assertFalse(
            $this->predicate->isEligibleAdminAttributes(
                role: 'admin',
                status: 'active',
                emailVerifiedAt: self::VALID_DATE,
                passwordHash: self::VALID_HASH,
                mfaVersion: 1,
                mfaConfirmedAt: self::VALID_DATE,
                mfaRevokedAt: self::VALID_DATE,
            )
        );
    }
}
