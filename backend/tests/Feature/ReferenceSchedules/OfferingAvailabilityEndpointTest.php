<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceSchedules;

use App\Reference\Fleet\FleetCoordinator;
use App\Reference\Schedules\OfferingAvailabilityHelper;
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
    }
}
