<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityDirectory;

use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Strict testing fixture helper for creating isolated, disposable staff directory records
 * conforming precisely to PostgreSQL 17 foreign key and check constraints.
 *
 * Guarded against execution outside of the testing environment and gaza_gateway_test database.
 */
final class DirectoryTestFixture
{
    public const VALID_ARGON2ID_HASH = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
    ) {
        $this->assertSafeTestDatabase();
    }

    private function assertSafeTestDatabase(): void
    {
        $dbName = $this->db->getDatabaseName();
        if (getenv('APP_ENV') !== 'testing' || config('app.env') !== 'testing'
            || $this->db->getName() !== 'pgsql_test' || $dbName !== 'gaza_gateway_test'
            || $this->db->selectOne('SELECT current_database() AS name')->name !== 'gaza_gateway_test'
        ) {
            throw new \RuntimeException('DirectoryTestFixture requires the intended disposable testing database.');
        }
    }

    /**
     * Ensure the singleton staff_directory_control row (id=1) exists.
     */
    public function ensureSentinelExists(?string $mutatedByStaffId = null): void
    {
        $this->assertSafeTestDatabase();
        $exists = $this->db->table('staff_directory_control')->where('id', 1)->exists();
        if (!$exists) {
            $this->db->table('staff_directory_control')->insert([
                'id' => 1,
                'last_mutated_at' => CarbonImmutable::now()->toIso8601String(),
                'mutated_by_staff_id' => $mutatedByStaffId,
            ]);
        }
    }

    /**
     * Create a staff user respecting circular constraints and check constraints.
     *
     * @param array{
     *   id?: string,
     *   username?: string,
     *   email?: string,
     *   role?: string,
     *   status?: string,
     *   email_verified_at?: ?string,
     *   password_hash?: ?string,
     *   credential_epoch?: int,
     *   mfa_version?: ?int,
     *   mfa_confirmed?: bool,
     *   mfa_revoked?: bool
     * } $overrides
     * @return array{id: string, staff: object, mfa: ?object}
     */
    public function createStaff(array $overrides = []): array
    {
        $this->assertSafeTestDatabase();

        $staffId = $overrides['id'] ?? (string) Str::uuid();
        $username = $overrides['username'] ?? ('staff_' . bin2hex(random_bytes(4)));
        $email = $overrides['email'] ?? ($username . '@gazaairport.ps');
        $role = $overrides['role'] ?? 'admin';
        $status = $overrides['status'] ?? 'active';
        $epoch = $overrides['credential_epoch'] ?? 1;
        $now = CarbonImmutable::now();

        $emailVerifiedAt = array_key_exists('email_verified_at', $overrides)
            ? $overrides['email_verified_at']
            : ($status === 'active' ? $now->toIso8601String() : null);

        $passwordHash = array_key_exists('password_hash', $overrides)
            ? $overrides['password_hash']
            : ($status === 'active' ? self::VALID_ARGON2ID_HASH : null);

        $mfaVersion = array_key_exists('mfa_version', $overrides)
            ? $overrides['mfa_version']
            : ($status === 'active' ? 1 : null);

        $mfaConfirmed = $overrides['mfa_confirmed'] ?? true;
        $mfaRevoked = $overrides['mfa_revoked'] ?? false;

        // Step 1: Insert staff_user initially as invited without mfa_version to satisfy circular FK
        $this->db->table('staff_users')->insert([
            'id' => $staffId,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Test Staff ' . substr($staffId, 0, 4),
            'full_name_ar' => 'موظف تجريبي ' . substr($staffId, 0, 4),
            'password_hash' => $passwordHash,
            'role' => $role,
            'status' => 'invited',
            'email_verified_at' => $emailVerifiedAt,
            'credential_epoch' => $epoch,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        $mfaRow = null;
        if ($mfaVersion !== null) {
            // Step 2: Insert staff_mfa_credentials
            $this->db->table('staff_mfa_credentials')->insert([
                'staff_id' => $staffId,
                'version' => $mfaVersion,
                'encrypted_secret' => 'test-encrypted-secret-' . bin2hex(random_bytes(8)),
                'confirmed_at' => $mfaConfirmed ? $now->toIso8601String() : null,
                'revoked_at' => $mfaRevoked ? $now->toIso8601String() : null,
            ]);

            $mfaRow = $this->db->table('staff_mfa_credentials')
                ->where('staff_id', $staffId)
                ->where('version', $mfaVersion)
                ->first();
        }

        // Step 3: Update staff_user with desired status and mfa_version
        $this->db->table('staff_users')
            ->where('id', $staffId)
            ->update([
                'status' => $status,
                'mfa_version' => $mfaVersion,
            ]);

        $staffRow = $this->db->table('staff_users')->where('id', $staffId)->first();

        return [
            'id' => $staffId,
            'staff' => $staffRow,
            'mfa' => $mfaRow,
        ];
    }

    /**
     * Create an authenticated full session for a staff user.
     *
     * @param array{
     *   session_id?: string,
     *   auth_level?: string,
     *   credential_epoch?: ?int,
     *   mfa_version?: ?int,
     *   mfa_verified_at?: ?string,
     *   revoked_at?: ?string,
     *   absolute_ttl?: int,
     *   idle_ttl?: int,
     *   now_offset_seconds?: int
     * } $overrides
     * @return array{sessionId: string, token: string, csrfToken: string}
     */
    public function createStaffSession(string $staffId, array $overrides = []): array
    {
        $this->assertSafeTestDatabase();

        $sessionId = $overrides['session_id'] ?? (string) Str::uuid();
        $authLevel = $overrides['auth_level'] ?? 'full';
        $token = OpaqueToken::generate('staff', 'full_session');
        $csrfToken = OpaqueToken::generate('staff', 'csrf')->getSecretToken();

        $offsetSeconds = $overrides['now_offset_seconds'] ?? 0;
        $now = CarbonImmutable::now()->addSeconds($offsetSeconds);

        $absTtl = $overrides['absolute_ttl'] ?? 28800; // 8 hours
        $idleTtl = $overrides['idle_ttl'] ?? 3600;     // 1 hour

        $absExpiry = $now->addSeconds($absTtl);
        $idleExpiry = $now->addSeconds($idleTtl);

        $staffRow = $this->db->table('staff_users')->where('id', $staffId)->first();
        $epoch = array_key_exists('credential_epoch', $overrides)
            ? $overrides['credential_epoch']
            : (int) ($staffRow->credential_epoch ?? 1);

        $mfaVersion = array_key_exists('mfa_version', $overrides)
            ? $overrides['mfa_version']
            : (int) ($staffRow->mfa_version ?? 1);

        $mfaVerifiedAt = array_key_exists('mfa_verified_at', $overrides)
            ? $overrides['mfa_verified_at']
            : $now->subSeconds(10)->toIso8601String();

        $revokedAt = $overrides['revoked_at'] ?? null;

        $payload = ['csrf_token' => $csrfToken];
        $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        $this->db->table('staff_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'staff_id' => $staffId,
            'auth_level' => $authLevel,
            'credential_epoch' => $epoch,
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $absExpiry->toIso8601String(),
            'idle_expires_at' => $idleExpiry->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => $revokedAt,
            'mfa_version' => $mfaVersion,
            'mfa_verified_at' => $mfaVerifiedAt,
        ]);

        return [
            'sessionId' => $sessionId,
            'token' => $token->getSecretToken(),
            'csrfToken' => $csrfToken,
        ];
    }

    /**
     * Clean all staff test data in correct reverse dependency order.
     */
    public function cleanTestData(): void
    {
        $this->assertSafeTestDatabase();

        $this->db->table('staff_sessions')->delete();
        $this->db->table('staff_pending_auth')->delete();
        $this->db->table('staff_invitations')->delete();
        $this->db->table('staff_password_resets')->delete();
        $this->db->table('staff_mfa_replacements')->delete();
        $this->db->table('staff_mfa_recovery_codes')->delete();
        $this->db->table('staff_mfa_counter_consumptions')->delete();

        // Remove circular FK reference before deleting credentials
        $this->db->table('staff_users')->update(['status' => 'invited', 'mfa_version' => null]);
        $this->db->table('staff_directory_control')->where('id', 1)->update(['mutated_by_staff_id' => null]);

        $this->db->table('staff_mfa_credentials')->delete();
        $this->db->table('staff_users')->delete();
    }
}
