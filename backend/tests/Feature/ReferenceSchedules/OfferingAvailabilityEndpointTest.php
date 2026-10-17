<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceSchedules;

use App\Reference\Fleet\FleetCoordinator;
use App\Reference\Schedules\OfferingAvailabilityHelper;
use App\Reference\Schedules\OfferingResolver;
use App\Reference\Schedules\ScheduleIdentityCodec;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class OfferingAvailabilityEndpointTest extends TestCase
{
    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1' || getenv('REFERENCE_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Availability tests require the disposable reservation gate.');
        }
        parent::setUp();
        DB::beginTransaction();
        $this->seedPrerequisites();
    }

    protected function tearDown(): void
    {
        if (DB::transactionLevel() > 0) DB::rollBack();
        parent::tearDown();
    }

    private function seedPrerequisites(): void
    {
        if (!DB::table('airports')->where('code', 'GZA')->exists()) {
            DB::table('airports')->insert([
                'code' => 'GZA',
                'airport_name_en' => 'Gaza International Airport',
                'airport_name_ar' => 'مطار غزة الدولي',
                'city_en' => 'Gaza',
                'city_ar' => 'غزة',
                'country_en' => 'Palestine',
                'country_ar' => 'فلسطين',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 20,
                'active' => true,
            ]);
        }

        if (!DB::table('airports')->where('code', 'AMM')->exists()) {
            DB::table('airports')->insert([
                'code' => 'AMM',
                'airport_name_en' => 'Queen Alia International Airport',
                'airport_name_ar' => 'مطار الملكة علياء الدولي',
                'city_en' => 'Amman',
                'city_ar' => 'عمان',
                'country_en' => 'Jordan',
                'country_ar' => 'الأردن',
                'timezone' => 'Asia/Amman',
                'block_minutes' => 55,
                'active' => true,
            ]);
        }

        if (!DB::table('airports')->where('code', 'CAI')->exists()) {
            DB::table('airports')->insert([
                'code' => 'CAI',
                'airport_name_en' => 'Cairo International Airport',
                'airport_name_ar' => 'مطار القاهرة الدولي',
                'city_en' => 'Cairo',
                'city_ar' => 'القاهرة',
                'country_en' => 'Egypt',
                'country_ar' => 'مصر',
                'timezone' => 'Africa/Cairo',
                'block_minutes' => 70,
                'active' => true,
            ]);
        }

        if (!DB::table('aircraft')->where('id', 'a320neo')->exists()) {
            $defaultLayout = FleetCoordinator::defaultLayout();
            DB::table('aircraft')->insert([
                'id' => 'a320neo',
                'model' => 'Airbus A320neo',
                'registration_normalized' => 'SU-GZA',
                'active' => true,
                'rows' => $defaultLayout['rows'],
                'letters_json' => json_encode($defaultLayout['letters'], JSON_THROW_ON_ERROR),
                'aisle_after' => $defaultLayout['aisleAfter'],
                'zones_json' => json_encode($defaultLayout['zones'], JSON_THROW_ON_ERROR),
                'extra_legroom_rows_json' => json_encode($defaultLayout['extraLegroomRows'], JSON_THROW_ON_ERROR),
                'unavailable_json' => json_encode($defaultLayout['unavailable'], JSON_THROW_ON_ERROR),
            ]);

        }
    }

    private function httpGet(string $path): TestResponse
    {
        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ACCEPT' => 'application/json',
            'REMOTE_ADDR' => '127.0.0.1',
        ];
        return $this->call('GET', 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], $server);
    }

    public function test_availability_validates_required_parameters_and_bounds(): void
    {
        // Missing origin
        $r = $this->httpGet('/offerings/availability?destination=AMM&date=2026-10-20');
        $r->assertStatus(422);

        // Missing destination
        $r = $this->httpGet('/offerings/availability?origin=GZA&date=2026-10-20');
        $r->assertStatus(422);

        // Invalid origin format
        $r = $this->httpGet('/offerings/availability?origin=GZ&destination=AMM&date=2026-10-20');
        $r->assertStatus(422);

        // Origin and destination identical
        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=GZA&date=2026-10-20');
        $r->assertStatus(422);

        // Neither origin nor destination is GZA
        $r = $this->httpGet('/offerings/availability?origin=AMM&destination=CAI&date=2026-10-20');
        $r->assertStatus(422);

        // Invalid date
        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date=not-a-date');
        $r->assertStatus(422);

        // Days out of bounds (< 1)
        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date=2026-10-20&days=0');
        $r->assertStatus(422);

        // Days out of bounds (> 60)
        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date=2026-10-20&days=61');
        $r->assertStatus(422);

        // Days invalid format
        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date=2026-10-20&days=foo');
        $r->assertStatus(422);
    }

    public function test_availability_returns_sparse_weekly_dates_and_route_filtered(): void
    {
        $date = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        // Insert schedule running Sun (0) and Wed (3)
        DB::table('schedules')->insert([
            'id' => 'sch-avail-01',
            'number' => 'PS 204',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 3], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Airbus A320neo',
            'aircraft_id' => 'a320neo',
            'from_date' => $date->format('Y-m-d'),
            'until_date' => $date->modify('+60 days')->format('Y-m-d'),
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date->format('Y-m-d').'&days=14');
        $r->assertStatus(200);

        $json = $r->json();
        $this->assertTrue($json['success']);
        $this->assertSame('GZA', $json['data']['origin']);
        $this->assertSame('AMM', $json['data']['destination']);
        $this->assertIsArray($json['data']['offerings']);
        $this->assertIsArray($json['data']['availableDates']);
        $this->assertNotEmpty($json['data']['offerings']);

        // Check each returned offering belongs to GZA -> AMM
        foreach ($json['data']['offerings'] as $offering) {
            $this->assertSame('GZA', $offering['originCode']);
            $this->assertSame('AMM', $offering['destinationCode']);
            $this->assertSame('PS 204', $offering['number']);
        }
    }

    public function test_availability_helper_excludes_past_departures_relative_to_clock(): void
    {
        DB::table('schedules')->insert([
            'id' => 'sch-past-01',
            'number' => 'PS 204',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 1, 2, 3, 4, 5, 6], JSON_THROW_ON_ERROR),
            'depart_time' => '08:00',
            'arrive_time' => '08:55',
            'aircraft' => 'Airbus A320neo',
            'aircraft_id' => 'a320neo',
            'from_date' => '2026-10-01',
            'until_date' => '2026-10-31',
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $helper = app(OfferingAvailabilityHelper::class);

        // If clock is at 2026-10-20 12:00:00 UTC (after the 08:00 flight)
        $simulatedNow = new DateTimeImmutable('2026-10-20T12:00:00Z');
        $res = $helper->getAvailability('GZA', 'AMM', '2026-10-20', 7, $simulatedNow);

        // 2026-10-20 08:00 has already departed, so 2026-10-20 must not be in availableDates!
        $this->assertNotContains('2026-10-20', $res['availableDates']);
        // But tomorrow 2026-10-21 should be in availableDates!
        $this->assertContains('2026-10-21', $res['availableDates']);
    }

    public function test_availability_helper_handles_disabled_schedules_and_airports(): void
    {
        DB::table('schedules')->insert([
            'id' => 'sch-inactive-01',
            'number' => 'PS 999',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 1, 2, 3, 4, 5, 6], JSON_THROW_ON_ERROR),
            'depart_time' => '14:00',
            'arrive_time' => '14:55',
            'aircraft' => 'Airbus A320neo',
            'aircraft_id' => 'a320neo',
            'from_date' => '2026-10-01',
            'until_date' => '2026-10-31',
            'active' => false, // Inactive!
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $helper = app(OfferingAvailabilityHelper::class);
        $simulatedNow = new DateTimeImmutable('2026-10-15T00:00:00Z');
        $res = $helper->getAvailability('GZA', 'AMM', '2026-10-20', 7, $simulatedNow);

        $numbers = array_column($res['offerings'], 'number');
        $this->assertNotContains('PS 999', $numbers);
    }

    public function test_availability_response_days_is_integer_and_offerings_satisfy_wire_contract(): void
    {
        $date = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        DB::table('schedules')->insert([
            'id' => 'sch-wire-01',
            'number' => 'PS 204',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 1, 2, 3, 4, 5, 6], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Airbus A320neo',
            'aircraft_id' => 'a320neo',
            'from_date' => $date->format('Y-m-d'),
            'until_date' => $date->modify('+60 days')->format('Y-m-d'),
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $r = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date->format('Y-m-d').'&days=28');
        $r->assertStatus(200);

        $json = $r->json();
        $this->assertTrue($json['success']);
        $this->assertIsInt($json['data']['days']);
        $this->assertSame(28, $json['data']['days']);
        $this->assertNotEmpty($json['data']['offerings']);

        $first = $json['data']['offerings'][0];
        $this->assertIsString($first['id']);
        $this->assertSame('sch-wire-01', $first['scheduleId']);
        $this->assertSame('GZA', $first['originCode']);
        $this->assertSame('AMM', $first['destinationCode']);
        $this->assertIsString($first['departAt']);
        $this->assertIsString($first['arriveAt']);
        $this->assertSame('commemorative', $first['classification']);
        $this->assertSame(0, $first['priceMinor']);

        // Assert capacity fields on envelope and offerings
        $this->assertArrayHasKey('partySize', $json['data']);
        $this->assertSame(1, $json['data']['partySize']);
        $this->assertArrayHasKey('scheduledDates', $json['data']);
        $this->assertArrayHasKey('bookableDates', $json['data']);
        $this->assertSame('snapshot_not_guaranteed', $json['data']['capacitySemantics']);
        $this->assertArrayHasKey('seatsRemaining', $first);
        $this->assertArrayHasKey('totalCapacity', $first);
        $this->assertArrayHasKey('bookable', $first);
        $this->assertTrue($first['bookable']);
    }

    private function ensureTestUser(): string
    {
        $existing = DB::table('users')->where('email', 'passenger@example.com')->value('id');
        if ($existing !== null) {
            return (string) $existing;
        }
        $userId = '00000000-0000-4000-8000-000000000001';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => 'passenger@example.com',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$fake$hash',
            'status' => 'active',
            'credential_epoch' => 1,
            'created_at' => DB::raw('(UTC_TIMESTAMP(6))'),
            'updated_at' => DB::raw('(UTC_TIMESTAMP(6))'),
        ]);
        return $userId;
    }

    private function createClaim(string $serviceId, string $seatCode): string
    {
        $userId = $this->ensureTestUser();
        $resId = (string) \Illuminate\Support\Str::uuid();
        $passId = (string) \Illuminate\Support\Str::uuid();
        $ref = 'GZA-' . strtoupper(substr(md5($resId), 0, 6));

        DB::table('mvp_reservations')->insert([
            'id' => $resId,
            'reference' => $ref,
            'owner_user_id' => $userId,
            'service_id' => $serviceId,
            'status' => 'confirmed',
            'contact_email' => 'passenger@example.com',
            'contact_phone' => '+970599000000',
            'passenger_count' => 1,
            'flight_snapshot' => json_encode(['flight' => 'PS 204'], JSON_THROW_ON_ERROR),
            'ticket_snapshot' => json_encode(['ticket' => 'confirmed'], JSON_THROW_ON_ERROR),
            'created_at' => DB::raw('(UTC_TIMESTAMP(6))'),
            'updated_at' => DB::raw('(UTC_TIMESTAMP(6))'),
        ]);

        DB::table('mvp_reservation_passengers')->insert([
            'id' => $passId,
            'reservation_id' => $resId,
            'passenger_client_id' => 'p1',
            'type' => 'adult',
            'first_name' => 'Ahmad',
            'last_name' => 'Gaza',
            'dob' => '1990-01-01',
            'nationality' => 'Palestine',
            'document' => 'P12345678',
            'seat_code' => $seatCode,
            'created_at' => DB::raw('(UTC_TIMESTAMP(6))'),
        ]);

        DB::table('mvp_reservation_seat_claims')->insert([
            'service_id' => $serviceId,
            'seat_code' => $seatCode,
            'reservation_id' => $resId,
            'passenger_id' => $passId,
            'claimed_at' => DB::raw('(UTC_TIMESTAMP(6))'),
        ]);

        return $resId;
    }

    private function materializeService(string $serviceId, ?array $layoutSnapshot = null): void
    {
        $resolved = OfferingResolver::resolve($serviceId)->toArray();
        $layout = $layoutSnapshot ?? $resolved['layout'];

        DB::table('mvp_services')->insert([
            'id' => $serviceId,
            'schedule_id' => $resolved['scheduleId'],
            'service_date' => $resolved['date'],
            'flight_number' => $resolved['number'],
            'direction' => $resolved['direction'],
            'origin_code' => $resolved['originCode'],
            'destination_code' => $resolved['destinationCode'],
            'depart_time' => $resolved['departTime'],
            'arrive_time' => $resolved['arriveTime'],
            'duration_minutes' => $resolved['durationMinutes'],
            'aircraft_id' => $resolved['aircraftId'],
            'aircraft_snapshot' => json_encode([
                'model' => $resolved['aircraft'],
                'timing' => array_intersect_key($resolved, array_flip(['originTimezone', 'destinationTimezone', 'departAt', 'arriveAt', 'arrivalDate'])),
            ], JSON_THROW_ON_ERROR),
            'layout_snapshot' => json_encode($layout, JSON_THROW_ON_ERROR),
            'reference_revisions' => json_encode($resolved['revisions'], JSON_THROW_ON_ERROR),
            'classification' => $resolved['classification'] ?? 'commemorative',
            'price_minor' => 0,
            'created_at' => DB::raw('(UTC_TIMESTAMP(6))'),
            'updated_at' => DB::raw('(UTC_TIMESTAMP(6))'),
        ]);
    }

    public function test_availability_computes_capacity_with_static_blocked_seats(): void
    {
        // Aircraft with 2 rows, letters ['A', 'B'] (4 seats total), but '1A' unavailable -> 3 bookable seats
        $customLayout = [
            'aircraftId' => 'ac-blocked',
            'rows' => 2,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]],
            'extraLegroomRows' => [],
            'unavailable' => ['1A'],
        ];

        DB::table('aircraft')->insert([
            'id' => 'ac-blocked',
            'model' => 'Boeing 737-Custom',
            'registration_normalized' => 'SU-BLK',
            'active' => true,
            'rows' => 2,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode(['1A'], JSON_THROW_ON_ERROR),
        ]);

        $date = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        DB::table('schedules')->insert([
            'id' => 'sch-blocked-01',
            'number' => 'PS 300',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 1, 2, 3, 4, 5, 6], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Boeing 737-Custom',
            'aircraft_id' => 'ac-blocked',
            'from_date' => $date->format('Y-m-d'),
            'until_date' => $date->format('Y-m-d'),
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date->format('Y-m-d'), 1);

        $this->assertCount(1, $res['offerings']);
        $offering = $res['offerings'][0];
        $this->assertSame(3, $offering['totalCapacity']);
        $this->assertSame(3, $offering['seatsRemaining']);
        $this->assertTrue($offering['bookable']);
    }

    public function test_availability_fully_booked_partial_and_distinguishes_scheduled_from_bookable_dates(): void
    {
        $date1Obj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date2Obj = new DateTimeImmutable('+16 days', new DateTimeZone('UTC'));
        $date1 = $date1Obj->format('Y-m-d');
        $date2 = $date2Obj->format('Y-m-d');

        // Small 2-row x 2-letter layout = 4 seats ('1A', '1B', '2A', '2B')
        $smallLayout = [
            'aircraftId' => 'ac-mini',
            'rows' => 2,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]],
            'extraLegroomRows' => [],
            'unavailable' => [],
        ];

        DB::table('aircraft')->insert([
            'id' => 'ac-mini',
            'model' => 'ATR 42',
            'registration_normalized' => 'SU-MINI',
            'active' => true,
            'rows' => 2,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $scheduleId = 'sch-mini-01';
        $w1 = (int) $date1Obj->format('w');
        $w2 = (int) $date2Obj->format('w');

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 400',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([$w1, $w2], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'ATR 42',
            'aircraft_id' => 'ac-mini',
            'from_date' => $date1,
            'until_date' => $date2,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $service1Id = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date1);
        $service2Id = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date2);
        $this->materializeService($service1Id);
        $this->materializeService($service2Id);

        // Date 1: Claim 1 seat out of 4 -> 3 seats remaining (partial, bookable)
        $this->createClaim($service1Id, '1A');

        // Date 2: Claim all 4 seats ('1A', '1B', '2A', '2B') -> 0 seats remaining (fully booked)
        $this->createClaim($service2Id, '1A');
        $this->createClaim($service2Id, '1B');
        $this->createClaim($service2Id, '2A');
        $this->createClaim($service2Id, '2B');

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date1, 7);

        // scheduledDates contains both date1 and date2
        $this->assertContains($date1, $res['scheduledDates']);
        $this->assertContains($date2, $res['scheduledDates']);

        // bookableDates (and availableDates) contains date1, but NOT date2!
        $this->assertContains($date1, $res['bookableDates']);
        $this->assertNotContains($date2, $res['bookableDates']);
        $this->assertSame($res['bookableDates'], $res['availableDates']);

        // Check offerings capacity
        $offering1 = collect($res['offerings'])->firstWhere('date', $date1);
        $offering2 = collect($res['offerings'])->firstWhere('date', $date2);

        $this->assertNotNull($offering1);
        $this->assertNotNull($offering2);

        $this->assertSame(4, $offering1['totalCapacity']);
        $this->assertSame(3, $offering1['seatsRemaining']);
        $this->assertTrue($offering1['bookable']);

        $this->assertSame(4, $offering2['totalCapacity']);
        $this->assertSame(0, $offering2['seatsRemaining']);
        $this->assertFalse($offering2['bookable']);
    }

    public function test_availability_rejects_mismatched_frozen_service_snapshot_as_unbookable(): void
    {
        $dateObj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date = $dateObj->format('Y-m-d');
        $scheduleId = 'sch-frozen-01';

        // Current fleet aircraft has 10 rows (20 seats)
        DB::table('aircraft')->insert([
            'id' => 'ac-mutable',
            'model' => 'Embraer 190',
            'registration_normalized' => 'SU-EMB',
            'active' => true,
            'rows' => 10,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 10]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 500',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([(int) $dateObj->format('w')], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Embraer 190',
            'aircraft_id' => 'ac-mutable',
            'from_date' => $date,
            'until_date' => $date,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $serviceId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);

        // Materialized service snapshot has 3 rows (mismatched with current fleet 10 rows)
        $frozenSnapshot = [
            'aircraftId' => 'ac-mutable',
            'rows' => 3,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 3]],
            'extraLegroomRows' => [],
            'unavailable' => [],
        ];
        $this->materializeService($serviceId, $frozenSnapshot);

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date, 1);

        $offering = $res['offerings'][0];
        // Snapshot mismatch must mark offering unbookable and not overwrite current DTO layout!
        $this->assertFalse($offering['bookable']);
        $this->assertSame(10, $offering['layout']['rows']);
        $this->assertContains($date, $res['scheduledDates']);
        $this->assertNotContains($date, $res['bookableDates']);
    }

    public function test_availability_honors_matching_materialized_service_snapshot_and_claims(): void
    {
        $dateObj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date = $dateObj->format('Y-m-d');
        $scheduleId = 'sch-match-01';

        $layout = [
            'aircraftId' => 'ac-match',
            'rows' => 2,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]],
            'extraLegroomRows' => [],
            'unavailable' => [],
        ];

        DB::table('aircraft')->insert([
            'id' => 'ac-match',
            'model' => 'Embraer 190',
            'registration_normalized' => 'SU-MAT',
            'active' => true,
            'rows' => 2,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 555',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([(int) $dateObj->format('w')], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Embraer 190',
            'aircraft_id' => 'ac-match',
            'from_date' => $date,
            'until_date' => $date,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $serviceId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);
        $this->materializeService($serviceId);
        $this->createClaim($serviceId, '1A');

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date, 1);

        $offering = $res['offerings'][0];
        $this->assertTrue($offering['bookable']);
        $this->assertSame(4, $offering['totalCapacity']);
        $this->assertSame(3, $offering['seatsRemaining']);
        $this->assertContains($date, $res['bookableDates']);
    }

    public function test_availability_fails_closed_on_corrupt_geometry_or_invalid_claims(): void
    {
        $dateObj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date = $dateObj->format('Y-m-d');
        $scheduleId = 'sch-corrupt-01';

        // Valid aircraft in fleet
        DB::table('aircraft')->insert([
            'id' => 'ac-corrupt',
            'model' => 'Embraer 190',
            'registration_normalized' => 'SU-COR',
            'active' => true,
            'rows' => 2,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 777',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([(int) $dateObj->format('w')], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Embraer 190',
            'aircraft_id' => 'ac-corrupt',
            'from_date' => $date,
            'until_date' => $date,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $serviceId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);

        // Materialized service snapshot has corrupt unavailable seat outside geometry ('99Z')
        $corruptLayout = [
            'aircraftId' => 'ac-corrupt',
            'rows' => 2,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 2]],
            'extraLegroomRows' => [],
            'unavailable' => ['99Z'], // Corrupt unavailable seat outside geometry!
        ];
        $this->materializeService($serviceId, $corruptLayout);

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date, 1);

        $offering = $res['offerings'][0];
        // Corrupt snapshot fails closed: totalCapacity 4 (current geometry), seatsRemaining 0, not bookable!
        $this->assertSame(4, $offering['totalCapacity']);
        $this->assertSame(0, $offering['seatsRemaining']);
        $this->assertFalse($offering['bookable']);
        $this->assertNotContains($date, $res['bookableDates']);
    }

    public function test_availability_releases_seats_immediately_when_reservation_cancelled(): void
    {
        $dateObj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date = $dateObj->format('Y-m-d');
        $scheduleId = 'sch-cancel-01';

        $layout = [
            'aircraftId' => 'ac-cancel',
            'rows' => 1,
            'letters' => ['A', 'B'],
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 1]],
            'extraLegroomRows' => [],
            'unavailable' => ['1B'], // 1 bookable seat ('1A')
        ];

        DB::table('aircraft')->insert([
            'id' => 'ac-cancel',
            'model' => 'Cancel Jet',
            'registration_normalized' => 'SU-CNC',
            'active' => true,
            'rows' => 1,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 1]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode(['1B'], JSON_THROW_ON_ERROR),
        ]);

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 600',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([(int) $dateObj->format('w')], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Cancel Jet',
            'aircraft_id' => 'ac-cancel',
            'from_date' => $date,
            'until_date' => $date,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $serviceId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);
        $this->materializeService($serviceId);

        // Claim the only seat -> 0 remaining
        $resId = $this->createClaim($serviceId, '1A');

        $helper = app(OfferingAvailabilityHelper::class);
        $before = $helper->getAvailability('GZA', 'AMM', $date, 1);
        $this->assertSame(0, $before['offerings'][0]['seatsRemaining']);
        $this->assertFalse($before['offerings'][0]['bookable']);
        $this->assertNotContains($date, $before['bookableDates']);

        // Cancel reservation by deleting seat claim
        DB::table('mvp_reservation_seat_claims')->where('reservation_id', $resId)->delete();

        // Immediately available without stale capacity!
        $after = $helper->getAvailability('GZA', 'AMM', $date, 1);
        $this->assertSame(1, $after['offerings'][0]['seatsRemaining']);
        $this->assertTrue($after['offerings'][0]['bookable']);
        $this->assertContains($date, $after['bookableDates']);
    }

    public function test_availability_party_size_filtering_and_bounds(): void
    {
        $dateObj = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        $date = $dateObj->format('Y-m-d');
        $scheduleId = 'sch-party-01';

        $layout = [
            'aircraftId' => 'ac-party',
            'rows' => 1,
            'letters' => ['A', 'B'], // 2 seats total
            'aisleAfter' => 1,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 1]],
            'extraLegroomRows' => [],
            'unavailable' => [],
        ];

        DB::table('aircraft')->insert([
            'id' => 'ac-party',
            'model' => 'Party Jet',
            'registration_normalized' => 'SU-PRT',
            'active' => true,
            'rows' => 1,
            'letters_json' => json_encode(['A', 'B'], JSON_THROW_ON_ERROR),
            'aisle_after' => 1,
            'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 1]], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        DB::table('schedules')->insert([
            'id' => $scheduleId,
            'number' => 'PS 700',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([(int) $dateObj->format('w')], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Party Jet',
            'aircraft_id' => 'ac-party',
            'from_date' => $date,
            'until_date' => $date,
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        $serviceId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);
        $this->materializeService($serviceId);

        // 2 seats available:
        // Query partySize = 2 -> bookable: true
        $r1 = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date.'&days=1&partySize=2');
        $r1->assertStatus(200);
        $this->assertTrue($r1->json('data.offerings.0.bookable'));
        $this->assertContains($date, $r1->json('data.bookableDates'));

        // Query partySize = 3 -> bookable: false (insufficient capacity for party of 3)
        $r2 = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date.'&days=1&partySize=3');
        $r2->assertStatus(200);
        $this->assertFalse($r2->json('data.offerings.0.bookable'));
        $this->assertNotContains($date, $r2->json('data.bookableDates'));

        // Query partySize = 0 -> 422
        $r3 = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date.'&days=1&partySize=0');
        $r3->assertStatus(422);

        // Query partySize = 10 -> 422
        $r4 = $this->httpGet('/offerings/availability?origin=GZA&destination=AMM&date='.$date.'&days=1&partySize=10');
        $r4->assertStatus(422);
    }

    public function test_availability_queries_are_bounded_with_no_n_plus_one(): void
    {
        $date = new DateTimeImmutable('+14 days', new DateTimeZone('UTC'));
        DB::table('schedules')->insert([
            'id' => 'sch-query-01',
            'number' => 'PS 800',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => json_encode([0, 1, 2, 3, 4, 5, 6], JSON_THROW_ON_ERROR),
            'depart_time' => '10:00',
            'arrive_time' => '10:55',
            'aircraft' => 'Airbus A320neo',
            'aircraft_id' => 'a320neo',
            'from_date' => $date->format('Y-m-d'),
            'until_date' => $date->modify('+28 days')->format('Y-m-d'),
            'active' => true,
            'exceptions_json' => json_encode([], JSON_THROW_ON_ERROR),
        ]);

        DB::flushQueryLog();
        DB::enableQueryLog();

        $helper = app(OfferingAvailabilityHelper::class);
        $res = $helper->getAvailability('GZA', 'AMM', $date->format('Y-m-d'), 28);

        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        // 28 days with daily flights (28+ offerings) must be resolved in bounded constant queries!
        $this->assertNotEmpty($res['offerings']);
        $this->assertGreaterThanOrEqual(28, count($res['offerings']));
        $this->assertLessThanOrEqual(12, count($queries), 'Query count must not scale with offerings or days (O(1) batch execution).');
    }
}
