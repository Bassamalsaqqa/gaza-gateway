<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class IdentityDatabaseCatalogAndConstraintsTest extends TestCase
{
    public const EXPECTED_15_TABLES = [
        'users',
        'staff_users',
        'staff_mfa_credentials',
        'passenger_sessions',
        'staff_sessions',
        'staff_pending_auth',
        'user_email_verifications',
        'user_password_resets',
        'staff_invitations',
        'staff_password_resets',
        'staff_mfa_replacements',
        'staff_mfa_counter_consumptions',
        'staff_mfa_recovery_codes',
        'staff_directory_control',
        'security_rate_limits',
    ];

    public function test_all_15_core_tables_exist_in_postgresql_catalog(): void
    {
        $tables = DB::table('information_schema.tables')
            ->where('table_schema', 'public')
            ->where('table_type', 'BASE TABLE')
            ->pluck('table_name')
            ->toArray();

        foreach (self::EXPECTED_15_TABLES as $expectedTable) {
            $this->assertContains(
                $expectedTable,
                $tables,
                "Expected core identity table [{$expectedTable}] to exist in PostgreSQL public schema."
            );
        }
    }

    public function test_staff_directory_control_singleton_seeded_and_guarded(): void
    {
        $rows = DB::table('staff_directory_control')->get();
        $this->assertCount(1, $rows);
        $this->assertSame(1, (int) $rows[0]->id);
        $this->assertNull($rows[0]->mutated_by_staff_id);
        $this->assertNotNull($rows[0]->last_mutated_at);

        // Attempting to insert id = 2 must fail check constraint
        $this->expectException(QueryException::class);
        DB::statement('
            INSERT INTO staff_directory_control (id, last_mutated_at, mutated_by_staff_id)
            VALUES (2, NOW(), NULL);
        ');
    }

    public function test_users_constraints_reject_invalid_inserts(): void
    {
        $validId = (string) Str::uuid();

        // 1. Invalid status
        try {
            DB::statement("
                INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
                VALUES ('{$validId}', 'test@example.com', 'hash', 'invalid_status', 1, NOW(), NOW());
            ");
            $this->fail('Should have failed chk_users_status constraint');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_users_status', $e->getMessage());
        }

        // 2. Invalid credential epoch (< 1)
        try {
            DB::statement("
                INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
                VALUES ('{$validId}', 'test@example.com', 'hash', 'unverified', 0, NOW(), NOW());
            ");
            $this->fail('Should have failed chk_users_credential_epoch constraint');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_users_credential_epoch', $e->getMessage());
        }

        // 3. Case-insensitive lower(email) unique index
        $uniqueMail = 'unique_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::statement("
            INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
            VALUES ('{$validId}', '{$uniqueMail}', 'hash', 'unverified', 1, NOW(), NOW());
        ");

        $secondId = (string) Str::uuid();
        $upperMail = strtoupper($uniqueMail);
        try {
            DB::statement("
                INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
                VALUES ('{$secondId}', '{$upperMail}', 'hash', 'unverified', 1, NOW(), NOW());
            ");
            $this->fail('Should have failed lower(email) unique constraint');
        } catch (QueryException $e) {
            $this->assertStringContainsString('users_lower_email_idx', $e->getMessage());
        }
    }

    public function test_staff_users_constraints_reject_invalid_inserts(): void
    {
        $staffId = (string) Str::uuid();
        $uname = 'staff_' . bin2hex(random_bytes(4));
        $umail = 'staff_' . bin2hex(random_bytes(4)) . '@example.com';

        // 1. Invalid role
        try {
            DB::statement("
                INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, role, status, credential_epoch, created_at, updated_at)
                VALUES ('{$staffId}', '{$uname}', '{$umail}', 'Staff One', 'موظف 1', 'superadmin', 'invited', 1, NOW(), NOW());
            ");
            $this->fail('Should have failed chk_staff_users_role');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_users_role', $e->getMessage());
        }

        // 2. Active status requires email_verified_at, password_hash, and mfa_version
        try {
            DB::statement("
                INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, role, status, credential_epoch, created_at, updated_at)
                VALUES ('{$staffId}', '{$uname}', '{$umail}', 'Staff One', 'موظف 1', 'admin', 'active', 1, NOW(), NOW());
            ");
            $this->fail('Should have failed chk_staff_users_active_requirements');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_users_active_requirements', $e->getMessage());
        }
    }

    public function test_passenger_sessions_enforce_nullability_and_full_session_epoch(): void
    {
        $sessId = (string) Str::uuid();

        // 1. Full session with NULL user_id must be rejected
        try {
            DB::statement("
                INSERT INTO passenger_sessions (id, lookup_digest, user_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
                VALUES ('{$sessId}', '{$this->randomDigest()}', NULL, 'full', 1, 'enc', NOW(), NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 hour', NOW());
            ");
            $this->fail('Should have failed chk_passenger_sessions_auth_user');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_passenger_sessions_auth_user', $e->getMessage());
        }

        // 2. Reviewer direction verification: Full session with NULL credential_epoch must be rejected
        $userId = (string) Str::uuid();
        $userMail = 'passenger_epoch_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::statement("
            INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
            VALUES ('{$userId}', '{$userMail}', 'hash', 'active', 1, NOW(), NOW());
        ");

        try {
            DB::statement("
                INSERT INTO passenger_sessions (id, lookup_digest, user_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
                VALUES ('{$sessId}', '{$this->randomDigest()}', '{$userId}', 'full', NULL, 'enc', NOW(), NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 hour', NOW());
            ");
            $this->fail('Should have rejected full session with NULL credential_epoch');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_passenger_sessions_full_epoch_not_null', $e->getMessage());
        }
    }

    public function test_staff_sessions_enforce_nullability_and_mfa_requirements(): void
    {
        $sessId = (string) Str::uuid();

        // 1. Full staff session with NULL staff_id must be rejected
        try {
            DB::statement("
                INSERT INTO staff_sessions (id, lookup_digest, staff_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
                VALUES ('{$sessId}', '{$this->randomDigest()}', NULL, 'full', 1, 'enc', NOW(), NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 hour', NOW());
            ");
            $this->fail('Should have failed chk_staff_sessions_auth_staff');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_sessions_auth_staff', $e->getMessage());
        }

        // 2. Full staff session with NULL credential_epoch must be rejected
        $staffId = (string) Str::uuid();
        $staffUname = 'staff_' . bin2hex(random_bytes(4));
        $staffEmail = 'staff_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::statement("
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, email_verified_at, credential_epoch, created_at, updated_at)
            VALUES ('{$staffId}', '{$staffUname}', '{$staffEmail}', 'Staff Epoch', 'موظف', 'hash', 'viewer', 'invited', NULL, 1, NOW(), NOW());
        ");

        try {
            DB::statement("
                INSERT INTO staff_sessions (id, lookup_digest, staff_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
                VALUES ('{$sessId}', '{$this->randomDigest()}', '{$staffId}', 'full', NULL, 'enc', NOW(), NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 hour', NOW());
            ");
            $this->fail('Should have failed chk_staff_sessions_full_epoch_not_null');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_sessions_full_epoch_not_null', $e->getMessage());
        }
    }

    public function test_proof_tables_enforce_consumed_state_equivalence(): void
    {
        $userId = (string) Str::uuid();
        DB::statement("
            INSERT INTO users (id, email, password_hash, status, credential_epoch, created_at, updated_at)
            VALUES ('{$userId}', 'consumed_test_" . bin2hex(random_bytes(4)) . "@example.com', 'hash', 'unverified', 1, NOW(), NOW());
        ");

        // 1. user_email_verifications
        // state='consumed' with consumed_at IS NULL must fail
        try {
            DB::statement("
                INSERT INTO user_email_verifications (id, token_digest, state, issued_at, expires_at, consumed_at, user_id, purpose, credential_epoch, email_snapshot)
                VALUES ('" . Str::uuid() . "', '{$this->randomDigest()}', 'consumed', NOW(), NOW() + INTERVAL '1 hour', NULL, '{$userId}', 'passenger_email_verification', 1, 'test@example.com');
            ");
            $this->fail('user_email_verifications should have failed chk_user_email_verif_consumed');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_user_email_verif_consumed', $e->getMessage());
        }

        // state='issued' with consumed_at IS NOT NULL must fail
        try {
            DB::statement("
                INSERT INTO user_email_verifications (id, token_digest, state, issued_at, expires_at, consumed_at, user_id, purpose, credential_epoch, email_snapshot)
                VALUES ('" . Str::uuid() . "', '{$this->randomDigest()}', 'issued', NOW(), NOW() + INTERVAL '1 hour', NOW(), '{$userId}', 'passenger_email_verification', 1, 'test@example.com');
            ");
            $this->fail('user_email_verifications should have failed chk_user_email_verif_consumed');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_user_email_verif_consumed', $e->getMessage());
        }

        // 2. user_password_resets
        try {
            DB::statement("
                INSERT INTO user_password_resets (id, token_digest, state, issued_at, expires_at, consumed_at, user_id, purpose, credential_epoch, email_snapshot)
                VALUES ('" . Str::uuid() . "', '{$this->randomDigest()}', 'consumed', NOW(), NOW() + INTERVAL '1 hour', NULL, '{$userId}', 'passenger_password_reset', 1, 'test@example.com');
            ");
            $this->fail('user_password_resets should have failed chk_user_password_resets_consumed');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_user_password_resets_consumed', $e->getMessage());
        }

        // 3. staff_users fixtures for staff tables
        $staffId = (string) Str::uuid();
        DB::statement("
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, credential_epoch, created_at, updated_at)
            VALUES ('{$staffId}', 'staff_cons_" . bin2hex(random_bytes(4)) . "', 'staff_cons_" . bin2hex(random_bytes(4)) . "@gazaairport.ps', 'Staff Cons', 'موظف', 'hash', 'viewer', 'invited', 1, NOW(), NOW());
        ");

        // staff_invitations
        try {
            DB::statement("
                INSERT INTO staff_invitations (id, token_digest, state, issued_at, expires_at, consumed_at, staff_id, purpose, credential_epoch, email_snapshot)
                VALUES ('" . Str::uuid() . "', '{$this->randomDigest()}', 'consumed', NOW(), NOW() + INTERVAL '1 hour', NULL, '{$staffId}', 'staff_invitation', 1, 'staff@example.com');
            ");
            $this->fail('staff_invitations should have failed chk_staff_invitations_consumed');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_invitations_consumed', $e->getMessage());
        }

        // staff_password_resets
        try {
            DB::statement("
                INSERT INTO staff_password_resets (id, token_digest, state, issued_at, expires_at, consumed_at, staff_id, purpose, credential_epoch, email_snapshot)
                VALUES ('" . Str::uuid() . "', '{$this->randomDigest()}', 'consumed', NOW(), NOW() + INTERVAL '1 hour', NULL, '{$staffId}', 'staff_password_reset', 1, 'staff@example.com');
            ");
            $this->fail('staff_password_resets should have failed chk_staff_password_resets_consumed');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_staff_password_resets_consumed', $e->getMessage());
        }
    }

    public function test_staff_mfa_composite_primary_key_and_unique_indexes(): void
    {
        $staffId = (string) Str::uuid();
        $email = 'staff_pk_' . bin2hex(random_bytes(4)) . '@gazaairport.ps';
        DB::statement("
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, credential_epoch, created_at, updated_at)
            VALUES ('{$staffId}', 'staff_pk_" . bin2hex(random_bytes(4)) . "', '{$email}', 'Staff PK', 'موظف', 'hash', 'viewer', 'invited', 1, NOW(), NOW());
        ");

        // 1. staff_users lower(email) unique index
        try {
            DB::statement("
                INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, credential_epoch, created_at, updated_at)
                VALUES ('" . Str::uuid() . "', 'staff_pk_" . bin2hex(random_bytes(4)) . "', '" . strtoupper($email) . "', 'Staff PK2', 'موظف', 'hash', 'viewer', 'invited', 1, NOW(), NOW());
            ");
            $this->fail('Should have failed staff_users lower(email) unique index');
        } catch (QueryException $e) {
            $this->assertStringContainsString('staff_users_lower_email_idx', $e->getMessage());
        }

        // 2. staff_mfa_credentials composite primary key (staff_id, version)
        DB::statement("
            INSERT INTO staff_mfa_credentials (staff_id, version, encrypted_secret, confirmed_at, revoked_at)
            VALUES ('{$staffId}', 1, 'enc_secret', NOW(), NULL);
        ");

        try {
            DB::statement("
                INSERT INTO staff_mfa_credentials (staff_id, version, encrypted_secret, confirmed_at, revoked_at)
                VALUES ('{$staffId}', 1, 'duplicate_secret', NOW(), NULL);
            ");
            $this->fail('Should have failed composite primary key on staff_mfa_credentials');
        } catch (QueryException $e) {
            $this->assertStringContainsString('staff_mfa_credentials_pkey', $e->getMessage());
        }

        // 3. staff_mfa_counter_consumptions composite primary key (staff_id, mfa_version, counter_step)
        DB::statement("
            INSERT INTO staff_mfa_counter_consumptions (staff_id, mfa_version, counter_step, consumed_at)
            VALUES ('{$staffId}', 1, 100, NOW());
        ");

        try {
            DB::statement("
                INSERT INTO staff_mfa_counter_consumptions (staff_id, mfa_version, counter_step, consumed_at)
                VALUES ('{$staffId}', 1, 100, NOW());
            ");
            $this->fail('Should have failed composite primary key on staff_mfa_counter_consumptions');
        } catch (QueryException $e) {
            $this->assertStringContainsString('staff_mfa_counter_consumptions_pkey', $e->getMessage());
        }

        // 4. staff_mfa_recovery_codes unique constraint (staff_id, mfa_version, code_digest)
        $codeDigest = $this->randomDigest();
        DB::statement("
            INSERT INTO staff_mfa_recovery_codes (id, staff_id, mfa_version, code_digest, consumed_at, revoked_at)
            VALUES ('" . Str::uuid() . "', '{$staffId}', 1, '{$codeDigest}', NULL, NULL);
        ");

        try {
            DB::statement("
                INSERT INTO staff_mfa_recovery_codes (id, staff_id, mfa_version, code_digest, consumed_at, revoked_at)
                VALUES ('" . Str::uuid() . "', '{$staffId}', 1, '{$codeDigest}', NULL, NULL);
            ");
            $this->fail('Should have failed uq_staff_mfa_recovery_codes unique constraint');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uq_staff_mfa_recovery_codes', $e->getMessage());
        }
    }

    public function test_staff_pending_auth_bound_session_foreign_key_on_delete_restrict(): void
    {
        $staffId = (string) Str::uuid();
        DB::statement("
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, credential_epoch, created_at, updated_at)
            VALUES ('{$staffId}', 'staff_fk_" . bin2hex(random_bytes(4)) . "', 'staff_fk_" . bin2hex(random_bytes(4)) . "@gazaairport.ps', 'Staff FK', 'موظف', 'hash', 'viewer', 'invited', 1, NOW(), NOW());
        ");

        $sessionId = (string) Str::uuid();
        DB::statement("
            INSERT INTO staff_sessions (id, lookup_digest, staff_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at)
            VALUES ('{$sessionId}', '{$this->randomDigest()}', NULL, 'anonymous', NULL, 'enc', NOW(), NOW() + INTERVAL '1 hour', NOW() + INTERVAL '30 min', NOW());
        ");

        $pendingId = (string) Str::uuid();
        DB::statement("
            INSERT INTO staff_pending_auth (id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at, staff_id, bound_session_id, purpose, credential_epoch, failed_attempts)
            VALUES ('{$pendingId}', '{$this->randomDigest()}', 'issued', NOW(), NOW() + INTERVAL '15 min', NULL, NULL, '{$staffId}', '{$sessionId}', 'login_mfa', 1, 0);
        ");

        // Attempting to delete the staff session must be RESTRICTED by foreign key fk_staff_pending_auth_bound_session
        try {
            DB::statement("DELETE FROM staff_sessions WHERE id = '{$sessionId}';");
            $this->fail('Should have failed fk_staff_pending_auth_bound_session ON DELETE RESTRICT');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_staff_pending_auth_bound_session', $e->getMessage());
        }
    }

    public function test_security_rate_limits_checks(): void
    {
        $keyDigest = $this->randomDigest();

        // 1. Negative count rejected
        try {
            DB::statement("
                INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
                VALUES ('passenger', 'login', 'ip', '{$keyDigest}', NOW(), NOW() + INTERVAL '1 minute', -1);
            ");
            $this->fail('Should have failed chk_security_rate_limits_count');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_rate_limits_count', $e->getMessage());
        }

        // 2. window_end <= window_start rejected
        try {
            DB::statement("
                INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
                VALUES ('passenger', 'login', 'ip', '{$keyDigest}', NOW(), NOW(), 0);
            ");
            $this->fail('Should have failed chk_security_rate_limits_window');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_rate_limits_window', $e->getMessage());
        }
    }

    private function randomDigest(): string
    {
        return hash('sha256', (string) microtime(true) . (string) random_bytes(16));
    }
}
