<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Schedules\Exceptions\ScheduleDuplicateException;
use App\Reference\Schedules\Exceptions\ScheduleNotFoundException;
use App\Reference\Schedules\Exceptions\ScheduleValidationException;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;
use OverflowException;

/**
 * Curated Recurring Schedules reference authority coordinator.
 * Implements strict global lock order and atomic revision snapshot/audit writes.
 */
final class ScheduleCoordinator
{
    public function __construct(
        private readonly ScheduleValidator $validator,
        private readonly OfferingResolver $resolver,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function schedules(bool $activeOnly = false): array
    {
        $query = DB::table('schedules')->orderBy('id', 'asc');
        if ($activeOnly) {
            $query->where('active', true);
        }
        return $query->get()
            ->map(static fn(object $row): array => ScheduleDto::fromRow($row)->toArray())
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function schedule(string $id): array
    {
        $row = DB::table('schedules')->where('id', $id)->first();
        if ($row === null) {
            throw new ScheduleNotFoundException("Schedule not found: {$id}");
        }
        return ScheduleDto::fromRow($row)->toArray();
    }

    /**
     * Projects active recurring schedules onto target date.
     *
     * @return list<array<string, mixed>>
     */
    public function offerings(string $date, ?string $origin = null, ?string $destination = null, ?string $direction = null): array
    {
        return OfferingResolver::consistentRead(fn(): array => $this->projectOfferings($date, $origin, $destination, $direction));
    }

    private function projectOfferings(
        string $date,
        ?string $origin = null,
        ?string $destination = null,
        ?string $direction = null
    ): array {
        if (!ScheduleIdentityCodec::isValidISODate($date)) {
            throw new ScheduleValidationException("Invalid ISO calendar date: {$date}");
        }

        $query = DB::table('schedules')
            ->where('active', true)
            ->where('from_date', '<=', $date)
            ->where('until_date', '>=', $date);

        if ($direction !== null) {
            $query->where('direction', $direction);
        }

        $rows = $query->get();
        $results = [];

        foreach ($rows as $row) {
            $offering = $this->resolver->tryResolve(
                ScheduleIdentityCodec::encodeDatedOfferingId((string) $row->id, $date)
            );
            if ($offering === null) {
                continue;
            }

            if ($origin !== null && $offering->originCode !== $origin) {
                continue;
            }
            if ($destination !== null && $offering->destinationCode !== $destination) {
                continue;
            }

            $results[] = $offering;
        }

        usort(
            $results,
            static fn(OfferingDto $a, OfferingDto $b): int =>
                strcmp($a->departTime, $b->departTime)
                ?: strcmp($a->number, $b->number)
                ?: strcmp($a->id, $b->id)
        );

        return array_map(static fn(OfferingDto $dto): array => $dto->toArray(), $results);
    }

    /**
     * @param array<string, mixed> $input
     * @return array{schedule: array<string, mixed>, changed: bool, revision: int}
     */
    public function create(array $input, Closure $authorize): array
    {
        $id = $input['id'] ?? null;
        if (!is_string($id)) throw new ScheduleValidationException('Schedule ID is required');
        try { ScheduleIdentityCodec::assertValidId($id); }
        catch (\InvalidArgumentException) { throw new ScheduleValidationException('Invalid schedule ID'); }

        return $this->mutate('schedule.create', $id, $authorize, function () use ($input, $id): array {
            $validated = $this->validator->validateCreate($input);
            if (DB::table('schedules')->where('id', $id)->exists()) {
                throw new ScheduleDuplicateException("Schedule with ID '{$id}' already exists.");
            }

            DB::table('schedules')->insert([
                'id' => $id,
                'number' => $validated['number'],
                'direction' => $validated['direction'],
                'destination' => $validated['destination'],
                'days_json' => json_encode($validated['days'], JSON_THROW_ON_ERROR),
                'depart_time' => $validated['departTime'],
                'arrive_time' => $validated['arriveTime'],
                'aircraft' => $validated['aircraft'],
                'aircraft_id' => $validated['aircraftId'],
                'from_date' => $validated['from'],
                'until_date' => $validated['until'],
                'active' => $validated['active'],
                'exceptions_json' => json_encode($validated['exceptions'], JSON_THROW_ON_ERROR),
                'created_at' => DB::raw('clock_timestamp()'),
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            return [$validated, true];
        });
    }

    /**
     * @param array<string, mixed> $input
     * @return array{schedule: array<string, mixed>, changed: bool, revision: int}
     */
    public function patch(string $key, array $input, Closure $authorize): array
    {
        $id = ScheduleIdentityCodec::decodeScheduleKey($key);
        if ($id === null) {
            throw new ScheduleNotFoundException("Invalid or unrecognized schedule key: {$key}");
        }

        return $this->mutate('schedule.patch', $id, $authorize, function () use ($id, $input): array {
            $row = DB::table('schedules')->where('id', $id)->lockForUpdate()->first();
            if ($row === null) {
                throw new ScheduleNotFoundException("Schedule not found: {$id}");
            }

            $before = ScheduleDto::fromRow($row)->toArray();
            ['patch' => $patch, 'merged' => $after] = $this->validator->validatePatch($input, $before);

            if ($after === $before) {
                return [$before, false];
            }

            $update = [
                'updated_at' => DB::raw('clock_timestamp()'),
            ];

            if (array_key_exists('number', $patch)) {
                $update['number'] = $after['number'];
            }
            if (array_key_exists('days', $patch)) {
                $update['days_json'] = json_encode($after['days'], JSON_THROW_ON_ERROR);
            }
            if (array_key_exists('departTime', $patch)) {
                $update['depart_time'] = $after['departTime'];
            }
            if (array_key_exists('arriveTime', $patch)) {
                $update['arrive_time'] = $after['arriveTime'];
            }
            if (array_key_exists('aircraft', $patch)) {
                $update['aircraft'] = $after['aircraft'];
            }
            if (array_key_exists('aircraftId', $patch)) {
                $update['aircraft_id'] = $after['aircraftId'];
            }
            if (array_key_exists('from', $patch)) {
                $update['from_date'] = $after['from'];
            }
            if (array_key_exists('until', $patch)) {
                $update['until_date'] = $after['until'];
            }
            if (array_key_exists('active', $patch)) {
                $update['active'] = $after['active'];
            }
            if (array_key_exists('exceptions', $patch)) {
                $update['exceptions_json'] = json_encode($after['exceptions'], JSON_THROW_ON_ERROR);
            }

            DB::table('schedules')->where('id', $id)->update($update);

            return [$after, true];
        });
    }

    /**
     * Canonical global lock order:
     * principal/session -> fleet control -> network control -> schedule control -> sortedIDs
     */
    private function mutate(string $action, string $scheduleId, Closure $authorize, Closure $write): array
    {
        return DB::transaction(function () use ($action, $scheduleId, $authorize, $write): array {
            // 1. Establish principal/session ownership before waiting for locks
            $authorize();

            // 2. Fleet control lock
            DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();

            // 3. Network control lock
            DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();

            // 4. Schedule control lock
            $control = DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();
            if ($control === null) {
                throw new LogicException('Missing schedule reference control.');
            }

            // 5. Schedule sorted IDs row lock
            if ($scheduleId !== '') {
                DB::table('schedules')->where('id', $scheduleId)->lockForUpdate()->first();
            }

            // 6. Fresh authorization revalidation AFTER acquiring locks
            $actor = $authorize();

            // 7. Execute write
            [$result, $changed] = $write();

            if (!$changed) {
                return [
                    'schedule' => $result,
                    'changed' => false,
                    'revision' => (int) $control->revision,
                ];
            }

            $revision = (int) $control->revision + 1;
            if ($revision > 9007199254740991) {
                throw new OverflowException('Schedule reference revision exhausted.');
            }

            $allSchedules = DB::table('schedules')
                ->orderBy('id', 'asc')
                ->get()
                ->map(static fn(object $row): array => ScheduleDto::fromRow($row)->toArray())
                ->all();

            $snapshot = [
                'revision' => $revision,
                'schedules' => $allSchedules,
            ];
            $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            DB::table('schedule_revision_control')->where('domain', 'schedules')->update(['revision' => $revision]);
            DB::table('schedule_revisions')->insert([
                'domain' => 'schedules',
                'revision' => $revision,
                'snapshot_json' => $bytes,
                'snapshot_bytes' => $bytes,
            ]);
            DB::table('schedule_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'domain' => 'schedules',
                'revision' => $revision,
                'staff_id' => $actor->getStaffId(),
                'action' => $action,
                'outcome' => 'success',
                'schedule_id' => $scheduleId,
            ]);

            return [
                'schedule' => $result,
                'changed' => true,
                'revision' => $revision,
            ];
        });
    }
}
