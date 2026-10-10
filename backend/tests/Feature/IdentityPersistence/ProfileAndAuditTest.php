<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;
use Tests\TestCase;

class ProfileAndAuditTest extends TestCase
{
    public function test_passenger_profiles_constraints_and_title_allowlist(): void
    {
        $userId = PersistenceTestFactory::createUser();

        // 1. Valid profile with allowed title succeeds
        DB::statement('
            INSERT INTO passenger_profiles (
                user_id, title, first_name, last_name, phone, seat_preference, meal_preference, newsletter
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $userId,
            'Dr',
            'Sami',
            'Al-Kurd',
            '+970599000111',
            'window',
            'standard',
            true,
        ]);
        $this->assertDatabaseHas('passenger_profiles', ['user_id' => $userId, 'title' => 'Dr']);

        // 2. Unapproved title rejected
        $user2 = PersistenceTestFactory::createUser();
        try {
            DB::statement('
                INSERT INTO passenger_profiles (
                    user_id, title, first_name, last_name, phone, seat_preference, meal_preference, newsletter
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ', [
                $user2,
                'Prof', // Not in ('Mr','Mrs','Ms','Dr')
                'Nader',
                'Salem',
                '+970599000222',
                'aisle',
                'standard',
                false,
            ]);
            $this->fail('Expected unapproved title to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_passenger_profiles_title', $e->getMessage());
        }

        // 3. Unapproved seat preference rejected
        $user3 = PersistenceTestFactory::createUser();
        try {
            DB::statement('
                INSERT INTO passenger_profiles (
                    user_id, title, first_name, last_name, phone, seat_preference, meal_preference, newsletter
                )
                VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
            ', [
                $user3,
                'Nader',
                'Salem',
                '+970599000222',
                'cockpit',
                'standard',
                false,
            ]);
            $this->fail('Expected unapproved seat preference to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_passenger_profiles_seat_pref', $e->getMessage());
        }

        // 4. Empty account names are allowed on passenger_profiles (per UpdatePassengerProfileRequest and LocalPassengerRepository)
        $user4 = PersistenceTestFactory::createUser();
        DB::statement('
            INSERT INTO passenger_profiles (
                user_id, title, first_name, last_name, phone, seat_preference, meal_preference, newsletter
            )
            VALUES (?, NULL, \'\', \'\', \'\', NULL, NULL, false)
        ', [
            $user4,
        ]);
        $this->assertDatabaseHas('passenger_profiles', [
            'user_id' => $user4,
            'first_name' => '',
            'last_name' => '',
            'phone' => '',
        ]);
    }

    public function test_saved_travelers_single_name_and_owner_scoped_uniqueness(): void
    {
        $owner1 = PersistenceTestFactory::createUser();
        $owner2 = PersistenceTestFactory::createUser();

        // 1. Single-name traveler (only first name) succeeds
        $traveler1 = (string) Str::uuid();
        DB::statement('
            INSERT INTO saved_travelers (
                id, owner_user_id, external_id, first_name, last_name, dob, nationality, encrypted_document
            )
            VALUES (?, ?, ?, ?, \'\', ?, ?, ?)
        ', [
            $traveler1,
            $owner1,
            'trv-001',
            'Layla',
            '1995-02-10',
            'Palestinian',
            'enc_doc_cipher',
        ]);
        $this->assertDatabaseHas('saved_travelers', ['id' => $traveler1, 'first_name' => 'Layla']);

        // 2. Single-name traveler (only last name) succeeds
        $traveler2 = (string) Str::uuid();
        DB::statement('
            INSERT INTO saved_travelers (
                id, owner_user_id, external_id, first_name, last_name, dob, nationality, encrypted_document
            )
            VALUES (?, ?, ?, \'\', ?, NULL, ?, NULL)
        ', [
            $traveler2,
            $owner1,
            'trv-002',
            'Al-Ghefari',
            'Palestinian',
        ]);
        $this->assertDatabaseHas('saved_travelers', ['id' => $traveler2, 'last_name' => 'Al-Ghefari']);

        // 3. Both names empty rejected (saved_travelers requires at least one trimmed name)
        try {
            DB::statement('
                INSERT INTO saved_travelers (
                    id, owner_user_id, external_id, first_name, last_name, dob, nationality, encrypted_document
                )
                VALUES (?, ?, ?, \'\', \'\', NULL, NULL, NULL)
            ', [
                (string) Str::uuid(),
                $owner1,
                'trv-003',
            ]);
            $this->fail('Expected both names empty to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_saved_travelers_name', $e->getMessage());
        }

        // 4. Duplicate external_id for same owner rejected
        try {
            DB::statement('
                INSERT INTO saved_travelers (
                    id, owner_user_id, external_id, first_name, last_name, dob, nationality, encrypted_document
                )
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
            ', [
                (string) Str::uuid(),
                $owner1,
                'trv-001', // Already used by owner1!
                'Another',
                'Person',
            ]);
            $this->fail('Expected duplicate external_id for same owner to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uq_saved_travelers_owner_external', $e->getMessage());
        }

        // 5. Same external_id for different owner succeeds (owner-scoped uniqueness)
        $travelerDifferentOwner = (string) Str::uuid();
        DB::statement('
            INSERT INTO saved_travelers (
                id, owner_user_id, external_id, first_name, last_name, dob, nationality, encrypted_document
            )
            VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
        ', [
            $travelerDifferentOwner,
            $owner2,
            'trv-001', // Same external_id, different owner!
            'Companion',
            'Two',
        ]);
        $this->assertDatabaseHas('saved_travelers', ['id' => $travelerDifferentOwner, 'owner_user_id' => $owner2]);
    }

    public function test_audit_events_authentic_actions_realm_and_target_constraints(): void
    {
        $passenger = PersistenceTestFactory::createUser();
        $staff = PersistenceTestFactory::createStaffUser();
        $requestId = (string) Str::uuid();

        // 1. Valid passenger actor audit event with authentic OpenAPI operation succeeds
        $auditId1 = (string) Str::uuid();
        DB::statement('
            INSERT INTO audit_events (
                id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                request_id, target_type, target_id, metadata, occurred_at
            )
            VALUES (?, ?, ?, ?, ?, NULL, false, ?, ?, ?, ?::jsonb, ?)
        ', [
            $auditId1,
            'passenger',
            'postPassengerLogin',
            'success',
            $passenger,
            $requestId,
            'user',
            $passenger,
            json_encode(['attempt_count' => 1, 'success' => true]),
            now()->toIso8601String(),
        ]);
        $this->assertDatabaseHas('audit_events', ['id' => $auditId1]);

        // 2. Valid staff actor audit event with authentic OpenAPI operation succeeds
        $auditId2 = (string) Str::uuid();
        DB::statement('
            INSERT INTO audit_events (
                id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                request_id, target_type, target_id, metadata, occurred_at
            )
            VALUES (?, ?, ?, ?, NULL, ?, false, ?, ?, ?, ?::jsonb, ?)
        ', [
            $auditId2,
            'staff',
            'postStaffLogin',
            'success',
            $staff,
            $requestId,
            'staff_user',
            $staff,
            json_encode(['status' => 'active']),
            now()->toIso8601String(),
        ]);
        $this->assertDatabaseHas('audit_events', ['id' => $auditId2]);

        // 3. Valid system actor audit event with documented internal event and system target "none"
        $auditId3 = (string) Str::uuid();
        DB::statement('
            INSERT INTO audit_events (
                id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                request_id, target_type, target_id, metadata, occurred_at
            )
            VALUES (?, ?, ?, ?, NULL, NULL, true, ?, ?, ?, ?::jsonb, ?)
        ', [
            $auditId3,
            'system',
            'auth.login_denied_unknown_subject',
            'denied',
            $requestId,
            'system',
            'none',
            json_encode(['reason_code' => 'unknown_subject']),
            now()->toIso8601String(),
        ]);
        $this->assertDatabaseHas('audit_events', ['id' => $auditId3]);

        // 4. Realm consistency: passenger realm with staff actor rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postStaffLogin\', \'failure\', NULL, ?, false, ?, \'staff_user\', ?, \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $staff,
                $requestId,
                $staff,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected passenger realm with staff actor to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_actor', $e->getMessage());
        }

        // 5. Realm consistency: staff realm with passenger actor rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'staff\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected staff realm with passenger actor to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_actor', $e->getMessage());
        }

        // 6. Realm consistency: system realm with non-system actor rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'system\', \'auth.session_revoked\', \'failure\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected system realm with passenger actor to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_actor', $e->getMessage());
        }

        // 7. Obsolete / invented action rejected by chk_audit_events_action
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postAuthLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected obsolete postAuthLogin action to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_action', $e->getMessage());
        }

        // 8. Invalid target_type rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'credit_card\', ?, \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected unapproved target_type to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_target_type', $e->getMessage());
        }

        // 9. Target ID with non-UUID text on domain target rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', \'not-a-valid-uuid\', \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected non-UUID target_id to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_target_id', $e->getMessage());
        }

        // 10. System target with arbitrary text rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'system\', \'auth.rate_limit_exceeded\', \'denied\', NULL, NULL, true, ?, \'system\', \'arbitrary_target\', \'{}\'::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $requestId,
                now()->toIso8601String(),
            ]);
            $this->fail('Expected non-none target_id on system target to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_target_id', $e->getMessage());
        }
    }

    public function test_audit_events_metadata_negative_sentinels_and_pii_guards(): void
    {
        $passenger = PersistenceTestFactory::createUser();
        $requestId = (string) Str::uuid();

        // 1. PII keys rejected
        $piiKeys = ['email', 'password', 'token', 'secret', 'otp'];
        foreach ($piiKeys as $piiKey) {
            try {
                DB::statement('
                    INSERT INTO audit_events (
                        id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                        request_id, target_type, target_id, metadata, occurred_at
                    )
                    VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, ?::jsonb, ?)
                ', [
                    (string) Str::uuid(),
                    $passenger,
                    $requestId,
                    $passenger,
                    json_encode([$piiKey => 'sensitive_val']),
                    now()->toIso8601String(),
                ]);
                $this->fail("Expected PII key {$piiKey} to be rejected");
            } catch (QueryException $e) {
                $this->assertTrue(
                    str_contains($e->getMessage(), 'chk_audit_events_metadata_no_pii') ||
                    str_contains($e->getMessage(), 'chk_audit_events_metadata_keys')
                );
            }
        }

        // 2. Negative sentinels under EVERY allowed key:
        $negativeSentinels = [
            'attempt_count' => -1,
            'failed_attempts' => -1,
            'count' => -5,
            'version' => -1,
            'epoch' => -10,
            'revoked' => 'true', // string instead of boolean
            'consumed' => 'false', // string instead of boolean
            'is_new' => 1, // integer instead of boolean
            'success' => 'yes', // string instead of boolean
            'reason_code' => 'arbitrary_unapproved_reason',
            'status' => 'arbitrary_unapproved_status',
            'error_code' => 'ERR_ARBITRARY_CODE',
            'code' => 'ARBITRARY_CODE',
        ];

        foreach ($negativeSentinels as $key => $invalidValue) {
            try {
                DB::statement('
                    INSERT INTO audit_events (
                        id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                        request_id, target_type, target_id, metadata, occurred_at
                    )
                    VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, ?::jsonb, ?)
                ', [
                    (string) Str::uuid(),
                    $passenger,
                    $requestId,
                    $passenger,
                    json_encode([$key => $invalidValue]),
                    now()->toIso8601String(),
                ]);
                $this->fail("Expected negative sentinel for key {$key} to be rejected");
            } catch (QueryException $e) {
                $this->assertStringContainsString('chk_audit_events_metadata_values', $e->getMessage());
            }
        }

        // 3. String value where integer expected (tests CASE type safety)
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, ?::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                json_encode(['attempt_count' => 'string_number']),
                now()->toIso8601String(),
            ]);
            $this->fail('Expected string in numeric metadata key to be rejected by check constraint');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_metadata_values', $e->getMessage());
        }

        // 4. JSON null value rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, ?::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                '{"attempt_count": null}',
                now()->toIso8601String(),
            ]);
            $this->fail('Expected JSON null in metadata to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_metadata_values', $e->getMessage());
        }

        // 5. Nested object rejected
        try {
            DB::statement('
                INSERT INTO audit_events (
                    id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                    request_id, target_type, target_id, metadata, occurred_at
                )
                VALUES (?, \'passenger\', \'postPassengerLogin\', \'failure\', ?, NULL, false, ?, \'user\', ?, ?::jsonb, ?)
            ', [
                (string) Str::uuid(),
                $passenger,
                $requestId,
                $passenger,
                json_encode(['status' => ['nested' => 'value']]),
                now()->toIso8601String(),
            ]);
            $this->fail('Expected nested object in metadata to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_audit_events_metadata_values', $e->getMessage());
        }
    }

    public function test_audit_events_database_immutability_enforcement(): void
    {
        $passenger = PersistenceTestFactory::createUser();
        $auditId = (string) Str::uuid();

        DB::statement('
            INSERT INTO audit_events (
                id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                request_id, target_type, target_id, metadata, occurred_at
            )
            VALUES (?, ?, ?, ?, ?, NULL, false, ?, ?, ?, ?::jsonb, ?)
        ', [
            $auditId,
            'passenger',
            'postPassengerLogin',
            'success',
            $passenger,
            (string) Str::uuid(),
            'user',
            $passenger,
            json_encode(['success' => true]),
            now()->toIso8601String(),
        ]);

        // 1. UPDATE rejected by trigger
        try {
            DB::statement("UPDATE audit_events SET outcome = 'failure' WHERE id = ?", [$auditId]);
            $this->fail('Expected UPDATE on audit_events to be blocked by trigger');
        } catch (QueryException $e) {
            $this->assertStringContainsString('audit_events is append-only', $e->getMessage());
        }

        // 2. DELETE rejected by trigger
        try {
            DB::statement("DELETE FROM audit_events WHERE id = ?", [$auditId]);
            $this->fail('Expected DELETE on audit_events to be blocked by trigger');
        } catch (QueryException $e) {
            $this->assertStringContainsString('audit_events is append-only', $e->getMessage());
        }

        // 3. TRUNCATE rejected by trigger
        try {
            DB::statement('TRUNCATE TABLE audit_events');
            $this->fail('Expected TRUNCATE on audit_events to be blocked by trigger');
        } catch (QueryException $e) {
            $this->assertStringContainsString('audit_events is append-only', $e->getMessage());
        }
    }
}
