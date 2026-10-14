<?php

declare(strict_types=1);

namespace App\Reference\Network;

use App\Support\DatabaseClock;
use App\Support\ReferenceWriteBarrier;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;
use OverflowException;

/** Reference network authority: airports, destinations, and derived bidirectional routes. */
final class NetworkCoordinator
{
    public const ACCEPTED_CODES = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];
    public const DESTINATION_CODES = ['AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];

    public function __construct(private readonly NetworkValidator $validator) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function airports(bool $activeOnly = false): array
    {
        $query = DB::table('airports')->orderBy('code');
        if ($activeOnly) {
            $query->where('active', true);
        }
        return $query->get()
            ->map(static fn(object $row): array => AirportDto::fromRow($row)->toArray())
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function airport(string $code): array
    {
        $code = $this->validator->code($code);
        $row = DB::table('airports')->where('code', $code)->first();
        if ($row === null) {
            throw new NetworkNotFoundException();
        }
        return AirportDto::fromRow($row)->toArray();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function destinations(bool $activeOnly = false): array
    {
        $query = DB::table('airports')->where('code', '<>', 'GZA')->orderBy('code');
        if ($activeOnly) {
            $query->where('active', true);
        }
        return $query->get()
            ->map(static fn(object $row): array => AirportDto::fromRow($row)->toArray())
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function routes(bool $activeOnly = true): array
    {
        $query = DB::table('routes')->orderBy('destination_code')->orderBy('direction');
        if ($activeOnly) {
            $query->where('active', true);
        }
        return $query->get()
            ->map(static fn(object $row): array => RouteDto::fromRow($row)->toArray())
            ->all();
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $input, Closure $authorize, bool $receipt = false): array
    {
        $airport = $this->validator->airport($input, false);
        $code = $airport['code'];

        return $this->mutate('airport.create', $code, $authorize, function () use ($airport, $code): array {
            if (DB::table('airports')->where('code', $code)->exists()) {
                throw new NetworkDuplicateCodeException();
            }
            DB::table('airports')->insert([
                'code' => $code,
                'airport_name_en' => $airport['airportName']['en'],
                'airport_name_ar' => $airport['airportName']['ar'],
                'city_en' => $airport['city']['en'],
                'city_ar' => $airport['city']['ar'],
                'country_en' => $airport['country']['en'],
                'country_ar' => $airport['country']['ar'],
                'timezone' => $airport['timezone'],
                'block_minutes' => $airport['blockMinutes'],
                'active' => $airport['active'],
                'created_at' => DatabaseClock::now(),
                'updated_at' => DatabaseClock::now(),
            ]);
            return [$airport, true];
        }, $receipt);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function patch(string $code, array $input, Closure $authorize, bool $receipt = false): array
    {
        $code = $this->validator->code($code);
        $patch = $this->validator->airport($input, true);

        return $this->mutate('airport.patch', $code, $authorize, function () use ($code, $patch): array {
            $row = DB::table('airports')->where('code', $code)->lockForUpdate()->first();
            if ($row === null) {
                throw new NetworkNotFoundException();
            }
            $before = AirportDto::fromRow($row)->toArray();
            $after = array_replace($before, $patch);
            if ($after === $before) {
                return [$before, false];
            }

            $update = [
                'updated_at' => DatabaseClock::now(),
            ];
            if (isset($patch['airportName'])) {
                $update['airport_name_en'] = $after['airportName']['en'];
                $update['airport_name_ar'] = $after['airportName']['ar'];
            }
            if (isset($patch['city'])) {
                $update['city_en'] = $after['city']['en'];
                $update['city_ar'] = $after['city']['ar'];
            }
            if (isset($patch['country'])) {
                $update['country_en'] = $after['country']['en'];
                $update['country_ar'] = $after['country']['ar'];
            }
            if (isset($patch['timezone'])) {
                $update['timezone'] = $after['timezone'];
            }
            if (isset($patch['blockMinutes'])) {
                $update['block_minutes'] = $after['blockMinutes'];
            }
            if (isset($patch['active'])) {
                $update['active'] = $after['active'];
            }

            DB::table('airports')->where('code', $code)->update($update);
            return [$after, true];
        }, $receipt);
    }

    private function mutate(string $action, string $code, Closure $authorize, Closure $write, bool $receipt = false): array
    {
        return DB::transaction(function () use ($action, $code, $authorize, $write, $receipt): array {
            // Establish principal/session ownership before waiting for the domain lock.
            $authorize();
            $control = DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            if ($control === null) {
                throw new LogicException('Missing network reference control.');
            }

            // Fresh maintenance & release pointer revalidation under lock: reject in-flight admitted writers
            ReferenceWriteBarrier::guard();

            // Fresh wall clock / persisted authority after waiting; no detached role authorization.
            $actor = $authorize();
            [$result, $changed] = $write();
            if (!$changed) {
                return $receipt ? ['airport' => $result, 'changed' => false, 'revision' => (int) $control->revision] : $result;
            }

            $revision = (int) $control->revision + 1;
            if ($revision > 9007199254740991) {
                throw new OverflowException('Network reference revision exhausted.');
            }

            $snapshot = [
                'airports' => $this->airports(false),
                'routes' => $this->routes(false),
            ];
            $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            DB::table('network_revision_control')->where('domain', 'network')->update(['revision' => $revision]);
            DB::table('network_revisions')->insert([
                'domain' => 'network',
                'revision' => $revision,
                'snapshot_json' => $bytes,
                'snapshot_bytes' => $bytes,
                'created_at' => DatabaseClock::now(),
            ]);
            DB::table('network_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'domain' => 'network',
                'revision' => $revision,
                'staff_id' => $actor->getStaffId(),
                'action' => $action,
                'outcome' => 'success',
                'airport_code' => $code,
                'created_at' => DatabaseClock::now(),
            ]);

            return $receipt ? ['airport' => $result, 'changed' => true, 'revision' => $revision] : $result;
        });
    }
}
