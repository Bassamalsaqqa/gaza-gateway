<?php

declare(strict_types=1);

namespace Tests\MySqlMvpInvariants;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\MySqlIdentityFoundation\MySqlTestCase;

final class DirectSqlInvariantsTest extends MySqlTestCase
{
    private function db(): \Illuminate\Database\ConnectionInterface
    {
        return DB::connection('mysql_test');
    }

    private function generateUuid(): string
    {
        return (string) Str::uuid();
    }

    /**
     * Test UUID grammar enforcement: strict canonical lowercase hyphenated UUID required.
     */
    public function testUuidGrammarEnforced(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'uuid_test_' . Str::random(8) . '@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // 1. Valid canonical UUID succeeds
        $validResId = $this->generateUuid();
        $serviceId = 'srv-test-' . Str::random(8);
        $this->createSyntheticService($serviceId);

        $this->db()->table('mvp_reservations')->insert([
            'id' => $validResId,
            'reference' => 'GZA-' . strtoupper(Str::random(4)),
            'owner_user_id' => $userId,
            'service_id' => $serviceId,
            'status' => 'confirmed',
            'contact_email' => 'passenger@example.test',
            'contact_phone' => '+970599000000',
            'passenger_count' => 1,
            'flight_snapshot' => json_encode(['test' => true]),
            'ticket_snapshot' => json_encode(['test' => true]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertDatabaseHas('mvp_reservations', ['id' => $validResId], 'mysql_test');

        // 2. Uppercase hex UUID fails regex check chk_mvp_res_id
        $uppercaseUuid = strtoupper($this->generateUuid());
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $uppercaseUuid,
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'confirmed',
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Uppercase UUID must be rejected by chk_mvp_res_id.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 3. Non-hex characters fail regex check
        $nonHexUuid = 'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $nonHexUuid,
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'confirmed',
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Non-hex UUID must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 4. UUID without hyphens fails
        $noHyphenUuid = str_replace('-', '', $this->generateUuid());
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $noHyphenUuid,
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'confirmed',
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Un-hyphenated UUID must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test case-sensitive enum checks under binary collation (utf8mb4_0900_bin).
     */
    public function testCaseSensitiveEnumsUnderBinCollation(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'enum_test_' . Str::random(8) . '@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $serviceId = 'srv-enum-' . Str::random(8);
        $this->createSyntheticService($serviceId);

        // Uppercase 'CONFIRMED' fails check constraint
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $this->generateUuid(),
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'CONFIRMED',
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Uppercase enum status CONFIRMED must be rejected under binary collation.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Uppercase 'ACTIVE' in users status fails check constraint
        try {
            $this->db()->table('users')->insert([
                'id' => $this->generateUuid(),
                'email' => 'enum_test_' . Str::random(8) . '@example.com',
                'password_hash' => 'hash_val',
                'status' => 'ACTIVE',
                'credential_epoch' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Uppercase enum ACTIVE must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test nullable check semantics (e.g. cancelled_at required if status = cancelled, prohibited if confirmed).
     */
    public function testNullableCheckSemantics(): void
    {
        $userId = $this->generateUuid();
        $this->db()->table('users')->insert([
            'id' => $userId,
            'email' => 'null_chk_' . Str::random(8) . '@example.com',
            'password_hash' => 'hash_val',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $serviceId = 'srv-null-' . Str::random(8);
        $this->createSyntheticService($serviceId);

        // Case 1: status is cancelled but cancelled_at is null -> MUST FAIL
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $this->generateUuid(),
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'cancelled',
                'cancelled_at' => null,
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Cancelled reservation with NULL cancelled_at must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Case 2: status is confirmed but cancelled_at is non-null -> MUST FAIL
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $this->generateUuid(),
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'confirmed',
                'cancelled_at' => now(),
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Confirmed reservation with non-null cancelled_at must be rejected.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Case 3: status is cancelled with valid cancelled_at -> SUCCEEDS
        $cancelledId = $this->generateUuid();
        $this->db()->table('mvp_reservations')->insert([
            'id' => $cancelledId,
            'reference' => 'GZA-' . strtoupper(Str::random(4)),
            'owner_user_id' => $userId,
            'service_id' => $serviceId,
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'contact_email' => 'passenger@example.test',
            'contact_phone' => '+970599000000',
            'passenger_count' => 1,
            'flight_snapshot' => json_encode(['test' => true]),
            'ticket_snapshot' => json_encode(['test' => true]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertDatabaseHas('mvp_reservations', ['id' => $cancelledId], 'mysql_test');
    }

    /**
     * Test immediate foreign key violations.
     */
    public function testImmediateForeignKeyViolations(): void
    {
        // 1. Non-existent owner_user_id
        try {
            $this->db()->table('mvp_reservations')->insert([
                'id' => $this->generateUuid(),
                'reference' => 'GZA-' . strtoupper(Str::random(4)),
                'owner_user_id' => $this->generateUuid(), // non-existent
                'service_id' => 'srv-test',
                'status' => 'confirmed',
                'contact_email' => 'passenger@example.test',
                'contact_phone' => '+970599000000',
                'passenger_count' => 1,
                'flight_snapshot' => json_encode(['test' => true]),
                'ticket_snapshot' => json_encode(['test' => true]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Non-existent owner FK must be rejected with 1452.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 2. Non-existent timezone in airports
        try {
            $this->db()->table('airports')->insert([
                'code' => 'XYZ',
                'airport_name_en' => 'Test Airport',
                'airport_name_ar' => 'مطار تجريبي',
                'city_en' => 'Test City',
                'city_ar' => 'مدينة تجريبية',
                'country_en' => 'Test Country',
                'country_ar' => 'بلد تجريبي',
                'timezone' => 'Invalid/Nonexistent_Timezone',
                'block_minutes' => 60,
                'active' => true,
            ]);
            $this->fail('Invalid timezone FK must be rejected with 1452.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test aircraft geometry validation triggers, generated capacity, and seat_layouts view.
     */
    public function testAircraftGeometryValidationTriggersAndCapacity(): void
    {
        $aircraftId = 'ac-geom-' . Str::random(6);

        // 1. Valid aircraft insert
        $this->db()->table('aircraft')->insert([
            'id' => $aircraftId,
            'model' => 'Boeing 737-800',
            'registration_normalized' => 'SU-GZA',
            'active' => true,
            'rows' => 10,
            'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F']),
            'aisle_after' => 3,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 10]]),
            'extra_legroom_rows_json' => json_encode([]),
            'unavailable_json' => json_encode([]),
        ]);

        $row = $this->db()->table('aircraft')->where('id', $aircraftId)->first();
        $this->assertNotNull($row);
        $this->assertSame(60, (int) $row->capacity); // 10 rows * 6 letters

        // Read compatibility view seat_layouts
        $viewRow = $this->db()->table('seat_layouts')->where('aircraft_id', $aircraftId)->first();
        $this->assertNotNull($viewRow);
        $this->assertSame(10, (int) $viewRow->rows);
        $this->assertSame(60, (int) $viewRow->capacity);

        // 2. Invalid geometry: duplicate seat letters
        try {
            $this->db()->table('aircraft')->insert([
                'id' => 'ac-bad-letters-' . Str::random(4),
                'model' => 'Boeing 737-800',
                'registration_normalized' => 'SU-BAD',
                'active' => true,
                'rows' => 10,
                'letters_json' => json_encode(['A', 'A', 'B', 'C', 'D', 'E']), // Duplicate A
                'aisle_after' => 3,
                'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 10]]),
                'extra_legroom_rows_json' => json_encode([]),
                'unavailable_json' => json_encode([]),
            ]);
            $this->fail('Duplicate letters in aircraft geometry must be rejected by trigger.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 3. Invalid geometry: zone lastRow > rows
        try {
            $this->db()->table('aircraft')->insert([
                'id' => 'ac-bad-zone-' . Str::random(4),
                'model' => 'Boeing 737-800',
                'registration_normalized' => 'SU-BAD2',
                'active' => true,
                'rows' => 10,
                'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F']),
                'aisle_after' => 3,
                'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 15]]), // 15 > 10
                'extra_legroom_rows_json' => json_encode([]),
                'unavailable_json' => json_encode([]),
            ]);
            $this->fail('Zone exceeding total aircraft rows must be rejected by trigger.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test schedule UTF-16 code units bound (OCTET_LENGTH(CONVERT(id USING utf16))/2 <= 160).
     */
    public function testScheduleUtf16CodeUnitsBound(): void
    {
        $aircraftId = 'ac-sched-' . Str::random(6);
        $this->db()->table('aircraft')->insert([
            'id' => $aircraftId,
            'model' => 'Boeing 737-800',
            'registration_normalized' => 'SU-SCH',
            'active' => true,
            'rows' => 28,
            'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F']),
            'aisle_after' => 3,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]]),
            'extra_legroom_rows_json' => json_encode([]),
            'unavailable_json' => json_encode([]),
        ]);

        $this->ensureAirport('AMM', 'Asia/Amman');

        // 1. Valid 160 ASCII characters schedule ID
        $ascii160Id = str_repeat('x', 160);
        $this->db()->table('schedules')->insert([
            'id' => $ascii160Id,
            'number' => 'PS101',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'aircraft' => 'Boeing 737-800',
            'aircraft_id' => $aircraftId,
            'from_date' => '2026-01-01',
            'until_date' => '2027-12-31',
            'active' => true,
            'exceptions_json' => '[]',
        ]);
        $this->assertDatabaseHas('schedules', ['id' => $ascii160Id], 'mysql_test');

        // 2. Astral Unicode character (U+1F600, grinning face) takes 2 UTF-16 code units.
        // 80 astral chars = 160 UTF-16 code units -> SUCCEEDS
        $astralChar = "\u{1F600}";
        $astral80Id = str_repeat($astralChar, 80);
        $this->db()->table('schedules')->insert([
            'id' => $astral80Id,
            'number' => 'PS102',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'aircraft' => 'Boeing 737-800',
            'aircraft_id' => $aircraftId,
            'from_date' => '2026-01-01',
            'until_date' => '2027-12-31',
            'active' => true,
            'exceptions_json' => '[]',
        ]);
        $this->assertDatabaseHas('schedules', ['id' => $astral80Id], 'mysql_test');

        // 81 astral chars = 162 UTF-16 code units -> FAILS CHECK constraint
        $astral81Id = str_repeat($astralChar, 81);
        try {
            $this->db()->table('schedules')->insert([
                'id' => $astral81Id,
                'number' => 'PS103',
                'direction' => 'out',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '08:00',
                'arrive_time' => '09:00',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => $aircraftId,
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);
            $this->fail('Schedule ID exceeding 160 UTF-16 code units must be rejected by check constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test airport IANA timezone FK validation.
     */
    public function testAirportIanaTimezoneForeignKey(): void
    {
        // Valid IANA timezone passes
        $this->db()->table('airports')->updateOrInsert(['code' => 'GZA'], [
            'airport_name_en' => 'Gaza Airport',
            'airport_name_ar' => 'مطار غزة',
            'city_en' => 'Gaza',
            'city_ar' => 'غزة',
            'country_en' => 'Palestine',
            'country_ar' => 'فلسطين',
            'timezone' => 'Asia/Gaza',
            'block_minutes' => 60,
            'active' => true,
        ]);
        $this->assertDatabaseHas('airports', ['code' => 'GZA', 'timezone' => 'Asia/Gaza'], 'mysql_test');

        // Invalid IANA timezone fails FK constraint
        try {
            $this->db()->table('airports')->insert([
                'code' => 'BAD',
                'airport_name_en' => 'Bad Zone Airport',
                'airport_name_ar' => 'مطار سيء',
                'city_en' => 'Bad City',
                'city_ar' => 'مدينة سيئة',
                'country_en' => 'Bad Country',
                'country_ar' => 'بلد سيء',
                'timezone' => 'Nonexistent/Fake_Zone',
                'block_minutes' => 60,
                'active' => true,
            ]);
            $this->fail('Nonexistent IANA timezone must fail FK constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Direct INSERT into reference_iana_timezones fails BEFORE INSERT trigger
        try {
            $this->db()->table('reference_iana_timezones')->insert(['name' => 'Invented/Timezone']);
            $this->fail('Direct insert into reference_iana_timezones must fail immutable trigger.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test staff invitation nullable invited_by_staff_id FK and check constraints.
     */
    public function testStaffInvitationNullableInviterForeignKey(): void
    {
        $staffId = $this->generateUuid();
        $this->db()->table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_inv_test_' . Str::random(6),
            'email' => 'invitee_' . Str::random(6) . '@example.test',
            'full_name_en' => 'Invitee User',
            'full_name_ar' => 'مستخدم مدعو',
            'role' => 'viewer',
            'status' => 'invited',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $inviterId = $this->generateUuid();
        $this->db()->table('staff_users')->insert([
            'id' => $inviterId,
            'username' => 'staff_inviter_' . Str::random(6),
            'email' => 'inviter_' . Str::random(6) . '@example.test',
            'full_name_en' => 'Inviter User',
            'full_name_ar' => 'الموجه للدعوة',
            'role' => 'admin',
            'status' => 'invited',
            'credential_epoch' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // 1. System bootstrap / null inviter succeeds
        $inv1Id = $this->generateUuid();
        $this->db()->table('staff_invitations')->insert([
            'id' => $inv1Id,
            'token_digest' => hash('sha256', Str::random(32)),
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'invited_by_staff_id' => null,
            'purpose' => 'staff_invitation',
            'credential_epoch' => 1,
            'email_snapshot' => 'invitee@example.test',
        ]);
        $this->assertDatabaseHas('staff_invitations', ['id' => $inv1Id, 'invited_by_staff_id' => null], 'mysql_test');

        // 2. Real directory inviter succeeds
        $inv2Id = $this->generateUuid();
        $this->db()->table('staff_invitations')->insert([
            'id' => $inv2Id,
            'token_digest' => hash('sha256', Str::random(32)),
            'state' => 'issued',
            'issued_at' => now(),
            'expires_at' => now()->addHour(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'invited_by_staff_id' => $inviterId,
            'purpose' => 'staff_invitation',
            'credential_epoch' => 1,
            'email_snapshot' => 'invitee@example.test',
        ]);
        $this->assertDatabaseHas('staff_invitations', ['id' => $inv2Id, 'invited_by_staff_id' => $inviterId], 'mysql_test');

        // 3. Invalid inviter UUID fails check constraint
        try {
            $this->db()->table('staff_invitations')->insert([
                'id' => $this->generateUuid(),
                'token_digest' => hash('sha256', Str::random(32)),
                'state' => 'issued',
                'issued_at' => now(),
                'expires_at' => now()->addHour(),
                'consumed_at' => null,
                'revoked_at' => null,
                'staff_id' => $staffId,
                'invited_by_staff_id' => 'not-a-valid-uuid',
                'purpose' => 'staff_invitation',
                'credential_epoch' => 1,
                'email_snapshot' => 'invitee@example.test',
            ]);
            $this->fail('Invalid inviter UUID format must fail check constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // 4. Non-existent inviter UUID fails FK constraint
        try {
            $this->db()->table('staff_invitations')->insert([
                'id' => $this->generateUuid(),
                'token_digest' => hash('sha256', Str::random(32)),
                'state' => 'issued',
                'issued_at' => now(),
                'expires_at' => now()->addHour(),
                'consumed_at' => null,
                'revoked_at' => null,
                'staff_id' => $staffId,
                'invited_by_staff_id' => $this->generateUuid(), // non-existent
                'purpose' => 'staff_invitation',
                'credential_epoch' => 1,
                'email_snapshot' => 'invitee@example.test',
            ]);
            $this->fail('Non-existent inviter UUID must fail FK constraint.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test immutable triggers on editorial revisions and snapshots.
     */
    public function testSnapshotImmutabilityTriggers(): void
    {
        $docSlug = 'travel';
        $this->db()->table('editorial_documents')->updateOrInsert(
            ['slug' => $docSlug],
            [
                'kind' => $docSlug,
                'status' => 'draft',
                'current_revision' => 0,
                'published_revision' => null,
                'draft_revision' => null,
                'tombstoned' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $snapBytes = '{"title":"Test Snapshot"}';
        $snapJson = json_encode(['title' => 'Test Snapshot'], JSON_THROW_ON_ERROR);
        $this->db()->table('editorial_revisions')->insert([
            'slug' => $docSlug,
            'revision' => 9991,
            'snapshot_json' => $snapJson,
            'snapshot_bytes' => $snapBytes,
            'snapshot_hash' => hash('sha256', $snapBytes),
            'created_at' => now(),
        ]);

        // Attempt UPDATE on editorial_revisions -> MUST FAIL
        try {
            $this->db()->table('editorial_revisions')->where('slug', $docSlug)->where('revision', 9991)->update(['snapshot_bytes' => '{"mutated":true}']);
            $this->fail('UPDATE on editorial_revisions must fail with immutable trigger.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }

        // Attempt DELETE on editorial_revisions -> MUST FAIL
        try {
            $this->db()->table('editorial_revisions')->where('slug', $docSlug)->where('revision', 9991)->delete();
            $this->fail('DELETE on editorial_revisions must fail with immutable trigger.');
        } catch (QueryException $e) {
            $this->assertTrue(true);
        }
    }

    /**
     * Test raw snapshot SHA-256 digest versus JSON storage normalization.
     */
    public function testRawSnapshotSha256DigestVersusJsonStorage(): void
    {
        $raw1 = '{"key":"value","b":2}';
        $raw2 = '{"b":2,"key":"value"}'; // Different byte order/spacing -> different SHA256

        $sha1 = hash('sha256', $raw1);
        $sha2 = hash('sha256', $raw2);

        $this->assertNotSame($sha1, $sha2, 'Raw bytes SHA256 must distinguish key ordering differences.');

        $docSlug = 'home';
        $this->db()->table('editorial_documents')->updateOrInsert(
            ['slug' => $docSlug],
            [
                'kind' => $docSlug,
                'status' => 'draft',
                'current_revision' => 0,
                'published_revision' => null,
                'draft_revision' => null,
                'tombstoned' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $this->db()->table('editorial_revisions')->insert([
            'slug' => $docSlug,
            'revision' => 8881,
            'snapshot_json' => $raw1,
            'snapshot_bytes' => $raw1,
            'snapshot_hash' => '0000000000000000000000000000000000000000000000000000000000000000',
            'created_at' => now(),
        ]);

        $row = $this->db()->table('editorial_revisions')->where('slug', $docSlug)->where('revision', 8881)->first();
        $this->assertSame($raw1, $row->snapshot_bytes);
        // Computed trigger hash matches raw SHA256
        $this->assertSame($sha1, $row->snapshot_hash);
    }

    private function createSyntheticService(string $serviceId): void
    {
        $aircraftId = 'ac-syn-' . Str::random(6);
        $this->db()->table('aircraft')->insert([
            'id' => $aircraftId,
            'model' => 'Boeing 737-800',
            'registration_normalized' => 'SU-' . strtoupper(Str::random(5)),
            'active' => true,
            'rows' => 10,
            'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F']),
            'aisle_after' => 3,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 10]]),
            'extra_legroom_rows_json' => json_encode([]),
            'unavailable_json' => json_encode([]),
        ]);

        $this->ensureAirport('GZA', 'Asia/Gaza');
        $this->ensureAirport('AMM', 'Asia/Amman');

        $schedId = 'sched-syn-' . Str::random(6);
        $this->db()->table('schedules')->insert([
            'id' => $schedId,
            'number' => 'PS100',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'aircraft' => 'Boeing 737-800',
            'aircraft_id' => $aircraftId,
            'from_date' => '2026-01-01',
            'until_date' => '2027-12-31',
            'active' => true,
            'exceptions_json' => '[]',
        ]);

        $this->db()->table('mvp_services')->insert([
            'id' => $serviceId,
            'schedule_id' => $schedId,
            'service_date' => '2026-11-01',
            'flight_number' => 'PS100',
            'direction' => 'out',
            'origin_code' => 'GZA',
            'destination_code' => 'AMM',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'duration_minutes' => 60,
            'aircraft_id' => $aircraftId,
            'aircraft_snapshot' => json_encode(['model' => 'Boeing 737-800']),
            'layout_snapshot' => json_encode(['rows' => 10]),
            'reference_revisions' => json_encode([]),
            'classification' => 'commemorative',
            'price_minor' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function ensureAirport(string $code, string $timezone): void
    {
        $this->db()->table('airports')->updateOrInsert(['code' => $code], [
            'airport_name_en' => 'Airport ' . $code,
            'airport_name_ar' => 'مطار ' . $code,
            'city_en' => 'City ' . $code,
            'city_ar' => 'مدينة ' . $code,
            'country_en' => 'Country',
            'country_ar' => 'بلد',
            'timezone' => $timezone,
            'block_minutes' => 60,
            'active' => true,
        ]);
    }
}
