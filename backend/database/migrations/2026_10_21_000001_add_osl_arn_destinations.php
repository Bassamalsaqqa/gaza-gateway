<?php

declare(strict_types=1);

use App\Reference\Network\AirportDto;
use App\Reference\Network\RouteDto;
use App\Reference\Schedules\ScheduleDto;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const BASELINE = [
        'GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH',
        'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA',
        'MAD', 'BOM', 'KUL', 'JFK', 'YYZ',
    ];

    private const EXPANDED_WITH_NORDIC = [
        'GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH',
        'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA',
        'MAD', 'BOM', 'KUL', 'JFK', 'YYZ',
        'OSL', 'ARN',
    ];

    public function up(): void
    {
        // 1. Expand CHECK constraint safely on airports table (standalone MySQL DDL)
        $this->replaceChecks(self::EXPANDED_WITH_NORDIC, 1440);

        // 2. Transactionally atomic DML: preserve existing rows, resolve active equipment, record canonical reference revisions
        DB::transaction(function (): void {
            $airportsAdded = false;

            if (Schema::hasTable('airports')) {
                if (!DB::table('airports')->where('code', 'OSL')->exists()) {
                    DB::table('airports')->insert([
                        'code' => 'OSL',
                        'airport_name_en' => 'Oslo Airport, Gardermoen',
                        'airport_name_ar' => 'مطار أوسلو، غاردرموين',
                        'city_en' => 'Oslo',
                        'city_ar' => 'أوسلو',
                        'country_en' => 'Norway',
                        'country_ar' => 'النرويج',
                        'timezone' => 'Europe/Oslo',
                        'block_minutes' => 310,
                        'active' => true,
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
                    $airportsAdded = true;
                }

                if (!DB::table('airports')->where('code', 'ARN')->exists()) {
                    DB::table('airports')->insert([
                        'code' => 'ARN',
                        'airport_name_en' => 'Stockholm Arlanda Airport',
                        'airport_name_ar' => 'مطار ستوكهولم أرلاندا',
                        'city_en' => 'Stockholm',
                        'city_ar' => 'ستوكهولم',
                        'country_en' => 'Sweden',
                        'country_ar' => 'السويد',
                        'timezone' => 'Europe/Stockholm',
                        'block_minutes' => 290,
                        'active' => true,
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
                    $airportsAdded = true;
                }
            }

            $schedulesAdded = false;

            if (Schema::hasTable('schedules')) {
                $existingSchedule = DB::table('schedules')
                    ->where('id', 'like', 'memorial-b01-%')
                    ->orderBy('from_date')
                    ->first();
                $fromDate = $existingSchedule?->from_date ?? '2026-10-19';
                $untilDate = $existingSchedule?->until_date ?? '2027-10-19';

                // Resolve real active equipment; handle actual fresh installation fixture path honestly
                $a321Id = $this->resolveActiveAircraftId('a321neo', 'Airbus A321neo', 'PS-GZB', 33, ['33B', '33E']);
                $a320Id = $this->resolveActiveAircraftId('a320neo', 'Airbus A320neo', 'PS-GZA', 28, []);

                $nordicSchedules = [
                    [
                        'id' => 'memorial-b01-osl-out',
                        'number' => 'PS 241',
                        'direction' => 'out',
                        'destination' => 'OSL',
                        'days_json' => json_encode([1, 4]),
                        'depart_time' => '08:15',
                        'arrive_time' => '12:25',
                        'aircraft' => 'Airbus A321neo',
                        'aircraft_id' => $a321Id,
                        'from_date' => $fromDate,
                        'until_date' => $untilDate,
                        'active' => true,
                        'exceptions_json' => json_encode([]),
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ],
                    [
                        'id' => 'memorial-b01-osl-in',
                        'number' => 'PS 242',
                        'direction' => 'in',
                        'destination' => 'OSL',
                        'days_json' => json_encode([1, 4]),
                        'depart_time' => '14:00',
                        'arrive_time' => '20:10',
                        'aircraft' => 'Airbus A321neo',
                        'aircraft_id' => $a321Id,
                        'from_date' => $fromDate,
                        'until_date' => $untilDate,
                        'active' => true,
                        'exceptions_json' => json_encode([]),
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ],
                    [
                        'id' => 'memorial-b01-arn-out',
                        'number' => 'PS 243',
                        'direction' => 'out',
                        'destination' => 'ARN',
                        'days_json' => json_encode([2, 5]),
                        'depart_time' => '08:30',
                        'arrive_time' => '12:20',
                        'aircraft' => 'Airbus A320neo',
                        'aircraft_id' => $a320Id,
                        'from_date' => $fromDate,
                        'until_date' => $untilDate,
                        'active' => true,
                        'exceptions_json' => json_encode([]),
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ],
                    [
                        'id' => 'memorial-b01-arn-in',
                        'number' => 'PS 244',
                        'direction' => 'in',
                        'destination' => 'ARN',
                        'days_json' => json_encode([2, 5]),
                        'depart_time' => '14:00',
                        'arrive_time' => '19:50',
                        'aircraft' => 'Airbus A320neo',
                        'aircraft_id' => $a320Id,
                        'from_date' => $fromDate,
                        'until_date' => $untilDate,
                        'active' => true,
                        'exceptions_json' => json_encode([]),
                        'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ],
                ];

                foreach ($nordicSchedules as $sched) {
                    if (!DB::table('schedules')->where('id', $sched['id'])->exists()) {
                        DB::table('schedules')->insert($sched);
                        $schedulesAdded = true;
                    }
                }
            }

            // Reference revision append: canonical snapshots matching NetworkCoordinator / ScheduleCoordinator
            if ($airportsAdded && Schema::hasTable('network_revision_control') && Schema::hasTable('network_revisions')) {
                $netControl = DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
                $newNetRev = (int) ($netControl?->revision ?? 0) + 1;

                $allAirports = DB::table('airports')->orderBy('code')->get()
                    ->map(static fn(object $row): array => AirportDto::fromRow($row)->toArray())
                    ->all();
                $allRoutes = DB::table('routes')->orderBy('destination_code')->orderBy('direction')->get()
                    ->map(static fn(object $row): array => RouteDto::fromRow($row)->toArray())
                    ->all();

                $netSnapshot = [
                    'airports' => $allAirports,
                    'routes' => $allRoutes,
                ];
                $netBytes = json_encode($netSnapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

                DB::table('network_revision_control')->updateOrInsert(['domain' => 'network'], ['revision' => $newNetRev]);
                DB::table('network_revisions')->insert([
                    'domain' => 'network',
                    'revision' => $newNetRev,
                    'snapshot_json' => $netBytes,
                    'snapshot_bytes' => $netBytes,
                    'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
            }

            if ($schedulesAdded && Schema::hasTable('schedule_revision_control') && Schema::hasTable('schedule_revisions')) {
                $schedControl = DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();
                $newSchedRev = (int) ($schedControl?->revision ?? 0) + 1;

                $allSchedules = DB::table('schedules')->orderBy('id', 'asc')->get()
                    ->map(static fn(object $row): array => ScheduleDto::fromRow($row)->toArray())
                    ->all();

                $schedSnapshot = [
                    'revision' => $newSchedRev,
                    'schedules' => $allSchedules,
                ];
                $schedBytes = json_encode($schedSnapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

                DB::table('schedule_revision_control')->updateOrInsert(['domain' => 'schedules'], ['revision' => $newSchedRev]);
                DB::table('schedule_revisions')->insert([
                    'domain' => 'schedules',
                    'revision' => $newSchedRev,
                    'snapshot_json' => $schedBytes,
                    'snapshot_bytes' => $schedBytes,
                    'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException(
            'Network contraction refused: destructive down migration is disabled; release rollback must use guarded database backups. No rows were changed.'
        );
    }

    private function resolveActiveAircraftId(
        string $aircraftId,
        string $model,
        string $registration,
        int $rows,
        array $unavailable
    ): string {
        if (!Schema::hasTable('aircraft')) {
            throw new RuntimeException("Aircraft table is required for bookable schedules; [{$aircraftId}] cannot be resolved.");
        }

        $row = DB::table('aircraft')->where('id', $aircraftId)->first();
        if ($row !== null) {
            if (!$row->active) {
                throw new RuntimeException("Aircraft [{$aircraftId}] exists but is inactive; cannot assign to bookable schedules.");
            }
            if ($row->model !== $model) {
                throw new RuntimeException("Aircraft [{$aircraftId}] model [{$row->model}] does not match expected [{$model}].");
            }
            return $aircraftId;
        }

        // Honest canonical fixture path for fresh installations
        $zones = [
            ['id' => 'business', 'firstRow' => 1, 'lastRow' => 4],
            ['id' => 'premium', 'firstRow' => 5, 'lastRow' => 10],
            ['id' => 'economy', 'firstRow' => 11, 'lastRow' => $rows],
        ];

        DB::table('aircraft')->insert([
            'id' => $aircraftId,
            'model' => $model,
            'registration_normalized' => $registration,
            'active' => true,
            'rows' => $rows,
            'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F'], JSON_THROW_ON_ERROR),
            'aisle_after' => 3,
            'zones_json' => json_encode($zones, JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode([5, 11, 12], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode($unavailable, JSON_THROW_ON_ERROR),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        return $aircraftId;
    }

    private function replaceChecks(array $codes, int $maximum): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        $checks = DB::select('SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
            FROM information_schema.TABLE_CONSTRAINTS tc
            JOIN information_schema.CHECK_CONSTRAINTS cc
              ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.TABLE_NAME = ? AND tc.CONSTRAINT_TYPE = ?',
            [DB::getDatabaseName(), 'airports', 'CHECK']);
        $codeChecks = [];
        $minuteChecks = [];
        $allCodesPresent = true;
        foreach ($checks as $check) {
            $clause = strtolower(str_replace('`', '', $check->CHECK_CLAUSE));
            if (preg_match('/\bcode\b\s+in\s*\(/', $clause)) {
                $codeChecks[] = $check->CONSTRAINT_NAME;
                foreach ($codes as $code) {
                    if (!str_contains($clause, strtolower($code))) {
                        $allCodesPresent = false;
                    }
                }
            }
            if (preg_match('/\bblock_minutes\b/', $clause)) {
                $minuteChecks[] = $check->CONSTRAINT_NAME;
            }
        }
        if ($allCodesPresent && count($codeChecks) === 1 && count($minuteChecks) === 1) {
            return;
        }
        if (count($codeChecks) !== 1 || count($minuteChecks) !== 1) {
            throw new RuntimeException('Expected airport constraints were not found; no changes applied.');
        }
        foreach ([$codeChecks[0], $minuteChecks[0]] as $name) {
            if (!preg_match('/^[A-Za-z0-9_]+$/D', $name)) {
                throw new RuntimeException('Unexpected constraint identifier.');
            }
        }
        $allowed = "'" . implode("','", $codes) . "'";
        DB::statement("ALTER TABLE airports
            DROP CHECK `{$codeChecks[0]}`, DROP CHECK `{$minuteChecks[0]}`,
            ADD CONSTRAINT chk_airports_code CHECK (code IN ({$allowed})),
            ADD CONSTRAINT chk_airports_block_minutes CHECK (block_minutes BETWEEN 20 AND {$maximum})");
    }
};
