<?php
declare(strict_types=1);

namespace App\Reference\Fleet;

use App\Support\DatabaseClock;
use App\Support\ReferenceWriteBarrier;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Reference geometry only: no availability, occupancy, booked snapshot or shrink certification. */
final class FleetCoordinator
{
    public function __construct(private readonly FleetValidator $validator) {}

    public function aircraft(): array
    {
        return DB::table('aircraft')->orderBy('id')->get()
            ->map(static fn(object $row): array => AircraftDto::fromRow($row)->toArray())->all();
    }

    public function layout(string $id): array
    {
        $this->validator->aircraftId($id);
        $row = DB::table('seat_layouts')->where('aircraft_id', $id)->first();
        if ($row === null) { throw new FleetNotFoundException(); }
        return SeatLayoutDto::fromRow($row)->toArray();
    }

    public function create(array $input, Closure $authorize): array
    {
        $this->validator->keys($input, ['aircraft', 'initialLayout']);
        if (!isset($input['aircraft']) || !is_array($input['aircraft'])) { throw new FleetValidationException(); }
        $aircraft = $this->validator->aircraft($input['aircraft']);
        $aircraft['id'] ??= (string) Str::uuid();
        $layout = array_key_exists('initialLayout', $input)
            ? $this->validator->layout($input['initialLayout']) : self::defaultLayout();
        return $this->mutate('aircraft.create', $aircraft['id'], $authorize, function () use ($aircraft, $layout): array {
            if (DB::table('aircraft')->where('id', $aircraft['id'])->exists()) {
                throw new FleetDuplicateRegistrationException();
            }
            $this->assertRegistrationFree($aircraft['registration']);
            $layoutColumns = [
                'rows' => $layout['rows'],
                'letters_json' => json_encode($layout['letters'], JSON_THROW_ON_ERROR),
                'aisle_after' => $layout['aisleAfter'],
                'zones_json' => json_encode($layout['zones'], JSON_THROW_ON_ERROR),
                'extra_legroom_rows_json' => json_encode($layout['extraLegroomRows'], JSON_THROW_ON_ERROR),
                'unavailable_json' => json_encode($layout['unavailable'], JSON_THROW_ON_ERROR),
                'created_at' => DatabaseClock::now(),
                'updated_at' => DatabaseClock::now(),
            ];
            DB::table('aircraft')->insert(array_merge([
                'id' => $aircraft['id'],
                'model' => $aircraft['model'],
                'registration_normalized' => $aircraft['registration'],
                'active' => $aircraft['active'],
            ], $layoutColumns));
            return [$aircraft, true];
        });
    }

    /** One SQL statement binds the revision and immutable snapshot to a single MVCC view. */
    public function snapshot(): array
    {
        $row = DB::table('reference_revision_control AS control')
            ->leftJoin('reference_revisions AS history', function ($join): void {
                $join->on('history.domain', '=', 'control.domain')->on('history.revision', '=', 'control.revision');
            })->where('control.domain', 'fleet')->select('control.revision', 'history.snapshot_bytes')->first();
        if ($row === null) { throw new \LogicException('Missing reference control.'); }
        if ((int) $row->revision === 0) { return ['revision' => 0, 'aircraft' => [], 'layouts' => (object) []]; }
        if ($row->snapshot_bytes === null) { throw new \LogicException('Missing reference snapshot.'); }
        $snapshot = json_decode($row->snapshot_bytes, false, 64, JSON_THROW_ON_ERROR);
        return ['revision' => (int) $row->revision, 'aircraft' => $snapshot->aircraft, 'layouts' => $snapshot->layouts];
    }

    public function patch(string $id, array $input, Closure $authorize, bool $receipt = false): array
    {
        $this->validator->aircraftId($id);
        $patch = $this->validator->aircraft($input, true);
        return $this->mutate('aircraft.patch', $id, $authorize, function () use ($id, $patch): array {
            $row = DB::table('aircraft')->where('id', $id)->lockForUpdate()->first();
            if ($row === null) { throw new FleetNotFoundException(); }
            $before = AircraftDto::fromRow($row)->toArray();
            $after = array_replace($before, $patch);
            if ($after === $before) { return [$before, false]; }
            $this->assertRegistrationFree($after['registration'], $id);
            DB::table('aircraft')->where('id', $id)->update([
                'model' => $after['model'],
                'registration_normalized' => $after['registration'],
                'active' => $after['active'],
                'updated_at' => DatabaseClock::now(),
            ]);
            return [$after, true];
        }, $receipt ? 'aircraft' : null);
    }

    public function putLayout(string $id, array $input, Closure $authorize, bool $receipt = false): array
    {
        $this->validator->aircraftId($id);
        $layout = $this->validator->layout($input);
        return $this->mutate('layout.put', $id, $authorize, function () use ($id, $layout): array {
            if (DB::table('aircraft')->where('id', $id)->lockForUpdate()->first() === null) {
                throw new FleetNotFoundException();
            }
            $row = DB::table('seat_layouts')->where('aircraft_id', $id)->first();
            $before = SeatLayoutDto::fromRow($row)->toArray();
            $after = ['aircraftId' => $id] + $layout;
            if ($before === $after) { return [$before, false]; }
            $this->writeLayout($id, $layout, false);
            return [$after, true];
        }, $receipt ? 'layout' : null);
    }

    private function mutate(string $action, string $id, Closure $authorize, Closure $write, ?string $receiptKind = null): array
    {
        return DB::transaction(function () use ($action, $id, $authorize, $write, $receiptKind): array {
            // Establish principal/session ownership before waiting for the domain lock.
            $authorize();
            $control = DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            if ($control === null) { throw new \LogicException('Missing reference control.'); }

            // Fresh maintenance & release pointer revalidation under lock: reject in-flight admitted writers
            ReferenceWriteBarrier::guard();

            // Fresh wall clock / persisted authority after waiting; no detached role authorization.
            $actor = $authorize();
            [$result, $changed] = $write();
            if (!$changed) { return $receiptKind === null ? $result :
                [$receiptKind => $result, 'changed' => false, 'revision' => (int) $control->revision]; }
            $revision = (int) $control->revision + 1;
            if ($revision > 9007199254740991) { throw new \OverflowException('Reference revision exhausted.'); }
            $snapshot = ['aircraft' => $this->aircraft(), 'layouts' => []];
            foreach ($snapshot['aircraft'] as $aircraft) {
                $snapshot['layouts'][$aircraft['id']] = $this->layout($aircraft['id']);
            }
            $snapshot['layouts'] = (object) $snapshot['layouts'];
            // Hash the exact compact UTF-8 bytes reconstructed with this documented encoding/order.
            $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            DB::table('reference_revision_control')->where('domain', 'fleet')->update(['revision' => $revision]);
            DB::table('reference_revisions')->insert([
                'domain' => 'fleet',
                'revision' => $revision,
                'snapshot_json' => $bytes,
                'snapshot_bytes' => $bytes,
                'created_at' => DatabaseClock::now(),
            ]);
            DB::table('reference_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'domain' => 'fleet',
                'revision' => $revision,
                'staff_id' => $actor->getStaffId(),
                'action' => $action,
                'outcome' => 'success',
                'aircraft_id' => $id,
                'created_at' => DatabaseClock::now(),
            ]);
            return $receiptKind === null ? $result : [$receiptKind => $result, 'changed' => true, 'revision' => $revision];
        });
    }

    private function assertRegistrationFree(string $registration, ?string $except = null): void
    {
        $query = DB::table('aircraft')->where('registration_normalized', $registration);
        if ($except !== null) { $query->where('id', '<>', $except); }
        if ($query->exists()) { throw new FleetDuplicateRegistrationException(); }
    }

    private function writeLayout(string $id, array $layout, bool $insert): void
    {
        $row = [
            'rows' => $layout['rows'],
            'aisle_after' => $layout['aisleAfter'],
            'letters_json' => json_encode($layout['letters'], JSON_THROW_ON_ERROR),
            'zones_json' => json_encode($layout['zones'], JSON_THROW_ON_ERROR),
            'extra_legroom_rows_json' => json_encode($layout['extraLegroomRows'], JSON_THROW_ON_ERROR),
            'unavailable_json' => json_encode($layout['unavailable'], JSON_THROW_ON_ERROR),
            'updated_at' => DatabaseClock::now(),
        ];
        DB::table('aircraft')->where('id', $id)->update($row);
    }

    public static function defaultLayout(): array
    {
        // src/lib/fleet/seed.ts::defaultNewAircraftLayout; fixture, never a real aircraft claim.
        return ['rows' => 28, 'letters' => ['A','B','C','D','E','F'], 'aisleAfter' => 3,
            'zones' => [['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], 'extraLegroomRows' => [], 'unavailable' => []];
    }
}
