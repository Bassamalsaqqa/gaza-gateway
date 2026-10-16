<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Password\Argon2idPasswordHasher;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

final class GuestReservationMigrationTest extends TestCase
{
    private function getMigration(): object
    {
        return require database_path('migrations/2026_10_16_000001_guest_reservations.php');
    }

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Migration preservation tests require the disposable reservation gate.');
        }
        parent::setUp();
    }

    private function ensurePrerequisites(): array
    {
        foreach (['GZA', 'AMM'] as $code) {
            DB::table('airports')->updateOrInsert(['code' => $code], [
                'airport_name_en' => 'Synthetic '.$code,
                'airport_name_ar' => 'Synthetic '.$code,
                'city_en' => 'Synthetic '.$code,
                'city_ar' => 'Synthetic '.$code,
                'country_en' => 'Synthetic country',
                'country_ar' => 'Synthetic country',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 60,
                'active' => true,
            ]);
        }

        if (!DB::table('aircraft')->where('id', 'ac-b738-1')->exists()) {
            DB::table('aircraft')->insert([
                'id' => 'ac-b738-1',
                'model' => 'Boeing 737-800',
                'registration_normalized' => 'T-MVPG',
                'active' => true,
                'rows' => 28,
                'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F'], JSON_THROW_ON_ERROR),
                'aisle_after' => 3,
                'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
                'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
                'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
            ]);
        }

        DB::table('schedules')->updateOrInsert(['id' => 'curated-flight'], [
            'number' => 'PS100',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'aircraft' => 'Boeing 737-800',
            'aircraft_id' => 'ac-b738-1',
            'from_date' => '2026-01-01',
            'until_date' => '2027-12-31',
            'active' => true,
            'exceptions_json' => '[]',
        ]);

        $serviceId = 'svc1-'.rtrim(strtr(base64_encode('curated-flight'), '+/', '-_'), '=').'-2026-12-25';
        if (!DB::table('mvp_services')->where('id', $serviceId)->exists()) {
            DB::table('mvp_services')->insert([
                'id' => $serviceId,
                'schedule_id' => 'curated-flight',
                'service_date' => '2026-12-25',
                'flight_number' => 'PS100',
                'direction' => 'out',
                'origin_code' => 'GZA',
                'destination_code' => 'AMM',
                'depart_time' => '08:00',
                'arrive_time' => '09:00',
                'duration_minutes' => 60,
                'aircraft_id' => 'ac-b738-1',
                'aircraft_snapshot' => json_encode(['model' => 'Boeing 737-800'], JSON_THROW_ON_ERROR),
                'layout_snapshot' => json_encode(['rows' => 28], JSON_THROW_ON_ERROR),
                'reference_revisions' => json_encode(['fleet' => 1, 'network' => 1, 'schedules' => 1], JSON_THROW_ON_ERROR),
                'classification' => 'commemorative',
                'price_minor' => 0,
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);
        }

        return ['serviceId' => $serviceId];
    }

    public function test_migration_down_refuses_when_guest_reservations_exist(): void
    {
        $prereq = $this->ensurePrerequisites();
        $serviceId = $prereq['serviceId'];

        $resId = (string) Str::uuid();
        $ref = 'GZA-MIG1';

        // Insert a synthetic guest reservation with owner_user_id = NULL
        DB::table('mvp_reservations')->insert([
            'id' => $resId,
            'reference' => $ref,
            'owner_user_id' => null,
            'service_id' => $serviceId,
            'status' => 'confirmed',
            'contact_email' => 'guest-mig@example.test',
            'contact_phone' => '+970599111222',
            'passenger_count' => 1,
            'flight_snapshot' => json_encode(['flightNumber' => 'PS100'], JSON_THROW_ON_ERROR),
            'ticket_snapshot' => json_encode(['tickets' => []], JSON_THROW_ON_ERROR),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $migration = $this->getMigration();

        try {
            $migration->down();
            $this->fail('Expected \RuntimeException refusing rollback when guest reservations exist.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Refusing to rollback guest reservations migration', $e->getMessage());
            $this->assertStringContainsString('1 guest reservation(s) exist', $e->getMessage());
        } finally {
            // Clean up test reservation so database remains consistent
            DB::table('mvp_reservations')->where('id', $resId)->delete();
        }
    }

    public function test_clean_roundtrip_preserves_account_records_and_restores_triggers_and_fks(): void
    {
        $prereq = $this->ensurePrerequisites();
        $serviceId = $prereq['serviceId'];

        // Clean any existing guest reservations
        DB::table('mvp_reservations')->whereNull('owner_user_id')->delete();

        // Seed a valid authenticated passenger and reservation (owner_user_id NOT NULL)
        $userId = (string) Str::uuid();
        $hash = app(Argon2idPasswordHasher::class)->hash('Synthetic-mig-pass-2026', 'passenger');
        DB::table('users')->insert([
            'id' => $userId,
            'email' => 'account-mig@example.test',
            'password_hash' => $hash,
            'status' => 'active',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $resId = (string) Str::uuid();
        $ref = 'GZA-MIG2';
        DB::table('mvp_reservations')->insert([
            'id' => $resId,
            'reference' => $ref,
            'owner_user_id' => $userId,
            'service_id' => $serviceId,
            'status' => 'confirmed',
            'contact_email' => 'account-mig@example.test',
            'contact_phone' => '+970599111333',
            'passenger_count' => 1,
            'flight_snapshot' => json_encode(['flightNumber' => 'PS100'], JSON_THROW_ON_ERROR),
            'ticket_snapshot' => json_encode(['tickets' => []], JSON_THROW_ON_ERROR),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $migration = $this->getMigration();

        // 1. Rollback migration
        $migration->down();

        // Verify guest tables dropped
        $this->assertFalse(Schema::hasTable('mvp_guest_mail_outbox'));
        $this->assertFalse(Schema::hasTable('mvp_guest_access_grants'));
        $this->assertFalse(Schema::hasTable('mvp_guest_access_challenges'));
        $this->assertFalse(Schema::hasTable('mvp_guest_reservation_submissions'));
        $this->assertFalse(Schema::hasTable('mvp_guest_email_grants'));
        $this->assertFalse(Schema::hasTable('mvp_guest_email_challenges'));

        // Verify account reservation preserved
        $row = DB::table('mvp_reservations')->where('id', $resId)->first();
        $this->assertNotNull($row);
        $this->assertSame($userId, $row->owner_user_id);

        // Verify restored original immutability trigger: mutating snapshot triggers SQLSTATE 45000
        try {
            DB::table('mvp_reservations')->where('id', $resId)->update(['reference' => 'GZA-MUTATED']);
            $this->fail('Expected QueryException from restored immutability trigger');
        } catch (QueryException $e) {
            $this->assertStringContainsString('mvp_reservations core snapshots are immutable', $e->getMessage());
        }

        // 2. Re-apply migration (UP)
        $migration->up();

        // Verify guest tables re-created
        $this->assertTrue(Schema::hasTable('mvp_guest_mail_outbox'));
        $this->assertTrue(Schema::hasTable('mvp_guest_access_grants'));
        $this->assertTrue(Schema::hasTable('mvp_guest_access_challenges'));
        $this->assertTrue(Schema::hasTable('mvp_guest_reservation_submissions'));
        $this->assertTrue(Schema::hasTable('mvp_guest_email_grants'));
        $this->assertTrue(Schema::hasTable('mvp_guest_email_challenges'));

        // Verify account reservation still intact
        $rowAfter = DB::table('mvp_reservations')->where('id', $resId)->first();
        $this->assertNotNull($rowAfter);
        $this->assertSame($userId, $rowAfter->owner_user_id);

        // Clean up
        DB::table('mvp_reservations')->where('id', $resId)->delete();
        DB::table('users')->where('id', $userId)->delete();
    }
}
