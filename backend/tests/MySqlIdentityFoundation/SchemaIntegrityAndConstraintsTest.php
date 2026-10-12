<?php

declare(strict_types=1);

namespace Tests\MySqlIdentityFoundation;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SchemaIntegrityAndConstraintsTest extends MySqlTestCase
{
    private function db(): \Illuminate\Database\ConnectionInterface
    {
        return DB::connection('mysql_test');
    }

    private function generateUuid(): string
    {
        return (string) Str::uuid();
    }

    private function generateHexDigest(): string
    {
        return hash('sha256', Str::random(32));
    }

    /**
     * Test direct invalid auth level constraint.
     */
    public function testDirectInvalidAuthLevelFails(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'auth_level_test@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);
        $this->db()->table('passenger_sessions')->insert([
            'id' => $this->generateUuid(),
            'lookup_digest' => $this->generateHexDigest(),
            'user_id' => $userId,
            'auth_level' => 'invalid_level',
            'credential_epoch' => 1,
            'encrypted_payload' => 'payload',
            'issued_at' => now(),
            'absolute_expires_at' => now()->addHour(),
            'idle_expires_at' => now()->addMinutes(30),
            'last_seen_at' => now(),
        ]);
    }

    /**
     * Test nullable epochs: full auth sessions require non-null, valid epoch (>= 1).
     */
    public function testNullableEpochsForFullSessionFails(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'epoch_test@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Case 1: credential_epoch is NULL for full auth_level
        try {
            $this->db()->table('passenger_sessions')->insert([
                'id' => $this->generateUuid(),
                'lookup_digest' => $this->generateHexDigest(),
                'user_id' => $userId,
                'auth_level' => 'full',
                'credential_epoch' => null,
                'encrypted_payload' => 'payload',
                'issued_at' => now(),
                'absolute_expires_at' => now()->addHour(),
                'idle_expires_at' => now()->addMinutes(30),
                'last_seen_at' => now(),
            ]);
            $this->fail('Full passenger session with NULL credential_epoch must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Case 2: credential_epoch < 1 for full auth_level
        try {
            $this->db()->table('passenger_sessions')->insert([
                'id' => $this->generateUuid(),
                'lookup_digest' => $this->generateHexDigest(),
                'user_id' => $userId,
                'auth_level' => 'full',
                'credential_epoch' => 0,
                'encrypted_payload' => 'payload',
                'issued_at' => now(),
                'absolute_expires_at' => now()->addHour(),
                'idle_expires_at' => now()->addMinutes(30),
                'last_seen_at' => now(),
            ]);
            $this->fail('Full passenger session with epoch < 1 must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Anonymous session with null credential_epoch must succeed
        $anonId = $this->generateUuid();
        $this->db()->table('passenger_sessions')->insert([
            'id' => $anonId,
            'lookup_digest' => $this->generateHexDigest(),
            'user_id' => null,
            'auth_level' => 'anonymous',
            'credential_epoch' => null,
            'encrypted_payload' => 'payload',
            'issued_at' => now(),
            'absolute_expires_at' => now()->addHour(),
            'idle_expires_at' => now()->addMinutes(30),
            'last_seen_at' => now(),
        ]);
        $this->assertDatabaseHas('passenger_sessions', ['id' => $anonId], 'mysql_test');
    }

    /**
     * Test revoked proof & state/consumed timestamp equivalence constraint.
     */
    public function testRevokedProofStateTimestampEquivalence(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'reset_proof_test@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // State is consumed but consumed_at is NULL -> MUST FAIL
        try {
            $this->db()->table('user_password_resets')->insert([
                'id' => $this->generateUuid(),
                'token_digest' => $this->generateHexDigest(),
                'state' => 'consumed',
                'issued_at' => now(),
                'expires_at' => now()->addHour(),
                'consumed_at' => null,
                'user_id' => $userId,
                'purpose' => 'passenger_password_reset',
                'credential_epoch' => 1,
                'email_snapshot' => 'reset_proof_test@example.com',
            ]);
            $this->fail('Consumed reset proof with null consumed_at must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // State is issued but consumed_at is NOT NULL -> MUST FAIL
        try {
            $this->db()->table('user_password_resets')->insert([
                'id' => $this->generateUuid(),
                'token_digest' => $this->generateHexDigest(),
                'state' => 'issued',
                'issued_at' => now(),
                'expires_at' => now()->addHour(),
                'consumed_at' => now(),
                'user_id' => $userId,
                'purpose' => 'passenger_password_reset',
                'credential_epoch' => 1,
                'email_snapshot' => 'reset_proof_test@example.com',
            ]);
            $this->fail('Issued reset proof with non-null consumed_at must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // State is consumed AND consumed_at is NOT NULL -> SUCCEEDS
        $validResetId = $this->generateUuid();
        $this->db()->table('user_password_resets')->insert([
            'id' => $validResetId,
            'token_digest' => $this->generateHexDigest(),
            'state' => 'consumed',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => now(),
            'user_id' => $userId,
            'purpose' => 'passenger_password_reset',
            'credential_epoch' => 1,
            'email_snapshot' => 'reset_proof_test@example.com',
        ]);
        $this->assertDatabaseHas('user_password_resets', ['id' => $validResetId], 'mysql_test');
    }

    /**
     * Test all-purpose foreign key enforcement.
     */
    public function testAllPurposeForeignKeysEnforced(): void
    {
        $nonExistentUserId = $this->generateUuid();

        $this->expectException(QueryException::class);
        $this->db()->table('passenger_sessions')->insert([
            'id' => $this->generateUuid(),
            'lookup_digest' => $this->generateHexDigest(),
            'user_id' => $nonExistentUserId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => 'payload',
            'issued_at' => now(),
            'absolute_expires_at' => now()->addHour(),
            'idle_expires_at' => now()->addMinutes(30),
            'last_seen_at' => now(),
        ]);
    }

    /**
     * Test counter version and circular foreign keys for staff MFA.
     */
    public function testCounterVersionAndCircularFk(): void
    {
        $staffId = $this->generateUuid();

        // Inserting staff_user with mfa_version=1 when credential doesn't exist must fail circular FK
        try {
            $this->db()->table('staff_users')->insert([
                'id' => $staffId,
                'username' => 'staff_circular_test',
                'email' => 'staff_circular@gazaairport.com',
                'full_name_en' => 'Staff Test',
                'full_name_ar' => 'اختبار الموظف',
                'role' => 'editor',
                'status' => 'invited',
                'credential_epoch' => 1,
                'mfa_version' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Staff user with non-existent mfa_version must fail FK constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Inserting staff_user with mfa_version=NULL succeeds
        $this->db()->table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_circular_test',
            'email' => 'staff_circular@gazaairport.com',
            'full_name_en' => 'Staff Test',
            'full_name_ar' => 'اختبار الموظف',
            'role' => 'editor',
            'status' => 'invited',
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Add MFA credential v1
        $this->db()->table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'secret_blob',
            'confirmed_at' => now(),
        ]);

        // Now updating staff_user to mfa_version=1 succeeds
        $this->db()->table('staff_users')->where('id', $staffId)->update(['mfa_version' => 1]);
        $this->assertDatabaseHas('staff_users', ['id' => $staffId, 'mfa_version' => 1], 'mysql_test');

        // Counter consumption referencing non-existent version 999 must fail FK
        try {
            $this->db()->table('staff_mfa_counter_consumptions')->insert([
                'staff_id' => $staffId,
                'mfa_version' => 999,
                'counter_step' => 1,
                'consumed_at' => now(),
            ]);
            $this->fail('Counter consumption with non-existent mfa_version must fail FK.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Counter consumption with valid v1 succeeds
        $this->db()->table('staff_mfa_counter_consumptions')->insert([
            'staff_id' => $staffId,
            'mfa_version' => 1,
            'counter_step' => 1,
            'consumed_at' => now(),
        ]);
        $this->assertDatabaseHas('staff_mfa_counter_consumptions', [
            'staff_id' => $staffId,
            'mfa_version' => 1,
            'counter_step' => 1,
        ], 'mysql_test');
    }

    /**
     * Test uniqueness and normalized email behavior.
     * Prevents case-insensitive duplicates while avoiding accent-insensitive collisions.
     */
    public function testUniquenessAndNormalizedEmailBehavior(): void
    {
        $user1Id = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $user1Id,
            'email' => 'pilot@gazaairport.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Case variation PILOT@GAZAAIRPORT.COM must be rejected as duplicate
        try {
            $this->db()->table('users')->insert([
                'id' => $this->generateUuid(),
                'email' => 'PILOT@GAZAAIRPORT.COM',
                'password_hash' => 'hash_val',
                'status' => 'active',
                'credential_epoch' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Case variation of email must be rejected by normalized_email unique constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 1. Verify NO PAD collation attribute in MySQL metadata
        $padAttr = $this->db()->selectOne("
            SELECT PAD_ATTRIBUTE
            FROM information_schema.COLLATIONS
            WHERE COLLATION_NAME = 'utf8mb4_0900_bin'
        ");
        $this->assertSame('NO PAD', $padAttr->PAD_ATTRIBUTE ?? null, 'utf8mb4_0900_bin collation must have NO PAD attribute.');

        // 2. Direct comparison proof: trailing spaces do NOT compare equal under utf8mb4_0900_bin
        $directCompare = $this->db()->selectOne("
            SELECT ('pilot@gazaairport.com' COLLATE utf8mb4_0900_bin) = ('pilot@gazaairport.com ' COLLATE utf8mb4_0900_bin) AS is_equal
        ");
        $this->assertSame(0, (int) ($directCompare->is_equal ?? 1), 'Trailing space string must NOT compare equal under utf8mb4_0900_bin.');

        // 3. Accent distinctness: café@gazaairport.com vs cafe@gazaairport.com
        // Must NOT collide under binary normalized email collation
        $cafe1Id = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $cafe1Id,
            'email' => 'café@gazaairport.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $cafe2Id = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $cafe2Id,
            'email' => 'cafe@gazaairport.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertDatabaseHas('users', ['id' => $cafe1Id], 'mysql_test');
        $this->assertDatabaseHas('users', ['id' => $cafe2Id], 'mysql_test');

        // 4. No silent trailing-space conflation:
        // Under utf8mb4_bin (PAD SPACE), trailing space would be collapsed and trigger duplicate collision.
        // Under utf8mb4_0900_bin (NO PAD), trailing space is distinct and preserved without conflation.
        $space1Id = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $space1Id,
            'email' => 'spaces@gazaairport.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $space2Id = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $space2Id,
            'email' => 'spaces@gazaairport.com ',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertDatabaseHas('users', ['id' => $space1Id], 'mysql_test');
        $this->assertDatabaseHas('users', ['id' => $space2Id], 'mysql_test');
    }

    /**
     * Test audit_events append-only immutability triggers (prevent update and delete).
     */
    public function testAuditEventsImmutabilityTriggers(): void
    {
        $auditId = $this->generateUuid();
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'audit_user@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->db()->table('audit_events')->insert([
            'id' => $auditId,
            'realm' => 'passenger',
            'action' => 'postPassengerLogin',
            'outcome' => 'success',
            'passenger_id' => $userId,
            'staff_id' => null,
            'is_system_actor' => false,
            'request_id' => $this->generateUuid(),
            'target_type' => 'user',
            'target_id' => $userId,
            'metadata' => json_encode(['count' => 1]),
            'occurred_at' => now(),
        ]);

        // UPDATE must be rejected by trigger
        try {
            $this->db()->table('audit_events')->where('id', $auditId)->update(['outcome' => 'failure']);
            $this->fail('UPDATE on audit_events must be prohibited by immutability trigger.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('updates prohibited', $e->getMessage());
        }

        // DELETE must be rejected by trigger
        try {
            $this->db()->table('audit_events')->where('id', $auditId)->delete();
            $this->fail('DELETE on audit_events must be prohibited by immutability trigger.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('deletes prohibited', $e->getMessage());
        }
    }

    /**
     * Test reset proof consumed uniqueness / replay.
     */
    public function testResetProofReplayUniqueness(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'replay_test@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $digest = $this->generateHexDigest();
        $this->db()->table('user_password_resets')->insert([
            'id' => $this->generateUuid(),
            'token_digest' => $digest,
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'user_id' => $userId,
            'purpose' => 'passenger_password_reset',
            'credential_epoch' => 1,
            'email_snapshot' => 'replay_test@example.com',
        ]);

        // Attempt duplicate token digest
        $this->expectException(QueryException::class);
        $this->db()->table('user_password_resets')->insert([
            'id' => $this->generateUuid(),
            'token_digest' => $digest,
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'user_id' => $userId,
            'purpose' => 'passenger_password_reset',
            'credential_epoch' => 1,
            'email_snapshot' => 'replay_test@example.com',
        ]);
    }

    /**
     * Test outbox proof ambiguity (exactly one non-null proof FK required).
     */
    public function testOutboxProofAmbiguityEnforced(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'outbox_test@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $verifId = $this->generateUuid();
        $this->db()->table('user_email_verifications')->insert([
            'id' => $verifId,
            'token_digest' => $this->generateHexDigest(),
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'user_id' => $userId,
            'purpose' => 'passenger_email_verification',
            'credential_epoch' => 1,
            'email_snapshot' => 'outbox_test@example.com',
        ]);

        $resetId = $this->generateUuid();
        $this->db()->table('user_password_resets')->insert([
            'id' => $resetId,
            'token_digest' => $this->generateHexDigest(),
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'user_id' => $userId,
            'purpose' => 'passenger_password_reset',
            'credential_epoch' => 1,
            'email_snapshot' => 'outbox_test@example.com',
        ]);

        // 0 proof FKs -> MUST FAIL
        try {
            $this->db()->table('security_dispatch_outbox')->insert([
                'id' => $this->generateUuid(),
                'user_verification_id' => null,
                'user_reset_id' => null,
                'staff_invitation_id' => null,
                'staff_reset_id' => null,
                'booking_challenge_id' => null,
                'encrypted_payload' => 'payload',
                'status' => 'queued',
                'expires_at' => now()->addHour(),
                'attempts' => 0,
            ]);
            $this->fail('Outbox with 0 proof FKs must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 2 proof FKs -> MUST FAIL
        try {
            $this->db()->table('security_dispatch_outbox')->insert([
                'id' => $this->generateUuid(),
                'user_verification_id' => $verifId,
                'user_reset_id' => $resetId,
                'staff_invitation_id' => null,
                'staff_reset_id' => null,
                'booking_challenge_id' => null,
                'encrypted_payload' => 'payload',
                'status' => 'queued',
                'expires_at' => now()->addHour(),
                'attempts' => 0,
            ]);
            $this->fail('Outbox with 2 proof FKs must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Exactly 1 proof FK -> SUCCEEDS
        $validOutboxId = $this->generateUuid();
        $this->db()->table('security_dispatch_outbox')->insert([
            'id' => $validOutboxId,
            'user_verification_id' => $verifId,
            'user_reset_id' => null,
            'staff_invitation_id' => null,
            'staff_reset_id' => null,
            'booking_challenge_id' => null,
            'encrypted_payload' => 'payload',
            'status' => 'queued',
            'expires_at' => now()->addHour(),
            'attempts' => 0,
        ]);
        $this->assertDatabaseHas('security_dispatch_outbox', ['id' => $validOutboxId], 'mysql_test');
    }

    /**
     * Test failed transaction rollback.
     */
    public function testFailedTransactionRollback(): void
    {
        $userId = $this->generateUuid();

        try {
            $this->db()->transaction(function () use ($userId) {
                $this->db()->table('users')->insert([
                    'id' => $userId,
                    'email' => 'tx_rollback@example.com',
                    'password_hash' => 'hash_val',
                    'status' => 'active',
                    'credential_epoch' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Cause an intentional error inside the transaction
                throw new \RuntimeException('Intentional failure to trigger rollback');
            });
        } catch (\RuntimeException $e) {
            // expected
        }

        $this->assertDatabaseMissing('users', ['id' => $userId], 'mysql_test');
    }
}
