<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Fleet\SeatLayoutDto;
use App\Reference\Schedules\Exceptions\OfferingAvailabilityException;
use App\Reference\Schedules\Exceptions\OfferingNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Pure dated offering read projection independent of HTTP.
 * Resolves stable `svc1-<base64url>-<date>` identifiers into OfferingDto snapshots.
 */
final class OfferingResolver
{
    /**
     * Callable independent of HTTP, usable as OfferingResolver::resolve($id).
     */
    public static function resolve(string $id): OfferingDto
    {
        return app(self::class)->resolveId($id);
    }

    public function tryResolve(string $id): ?OfferingDto
    {
        try {
            return $this->resolveId($id);
        } catch (OfferingAvailabilityException | OfferingNotFoundException) {
            return null;
        }
    }

    public function resolveId(string $id): OfferingDto
    {
        $parsed = ScheduleIdentityCodec::decodeDatedOfferingId($id);
        if ($parsed === null) {
            throw new OfferingNotFoundException("Malformed or invalid dated offering ID: {$id}");
        }

        return $this->resolveScheduleOnDate($parsed['scheduleId'], $parsed['date'], $id);
    }

    /** Reads all authority and revisions from one database MVCC snapshot.
     * An existing W2 transaction retains its ordered authority locks instead.
     */
    public static function consistentRead(callable $read): mixed
    {
        if (DB::transactionLevel() > 0) return $read();
        if (DB::connection()->getDriverName() === 'mysql') {
            // Set characteristics for the next transaction before BEGIN. Session defaults stay unchanged.
            DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            return DB::transaction($read);
        }
        return DB::transaction(function () use ($read): mixed {
            DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
            return $read();
        });
    }

    public function resolveScheduleOnDate(string $scheduleId, string $date, ?string $expectedId = null): OfferingDto
    {
        return self::consistentRead(fn(): OfferingDto => $this->projectScheduleOnDate($scheduleId, $date, $expectedId));
    }

    private function projectScheduleOnDate(string $scheduleId, string $date, ?string $expectedId): OfferingDto
    {
        if (!ScheduleIdentityCodec::isValidISODate($date)) {
            throw new OfferingNotFoundException("Invalid ISO calendar date: {$date}");
        }

        $row = DB::table('schedules')->where('id', $scheduleId)->first();
        if ($row === null) {
            throw new OfferingNotFoundException("Schedule not found: {$scheduleId}");
        }

        if (!$row->active) {
            throw new OfferingAvailabilityException("Schedule is inactive: {$scheduleId}");
        }

        $fromDate = substr((string) $row->from_date, 0, 10);
        $untilDate = substr((string) $row->until_date, 0, 10);
        if ($date < $fromDate || $date > $untilDate) {
            throw new OfferingAvailabilityException("Date {$date} is out of schedule range [{$fromDate}, {$untilDate}]");
        }

        // Active network check: GZA base and destination airport must exist and be active
        $gza = DB::table('airports')->where('code', 'GZA')->first();
        if ($gza === null || !$gza->active) {
            throw new OfferingAvailabilityException("Base airport GZA is inactive or missing");
        }

        $dest = DB::table('airports')->where('code', $row->destination)->first();
        if ($dest === null || !$dest->active) {
            throw new OfferingAvailabilityException("Destination airport {$row->destination} is inactive or missing");
        }

        $exceptions = json_decode((string) $row->exceptions_json, true, 512, JSON_THROW_ON_ERROR);
        $dateExceptions = array_filter(
            $exceptions,
            static fn(array $e): bool => ($e['date'] ?? '') === $date && isset($e['effect']) && is_array($e['effect'])
        );

        $cancelledEx = null;
        $timeEx = null;
        $aircraftEx = null;
        $extraEx = null;

        foreach ($dateExceptions as $ex) {
            match ($ex['kind'] ?? '') {
                'cancelled' => $cancelledEx = $ex,
                'time' => $timeEx = $ex,
                'aircraft' => $aircraftEx = $ex,
                'extra' => $extraEx = $ex,
                default => null,
            };
        }

        if ($cancelledEx !== null && !empty($cancelledEx['effect']['cancelled'])) {
            throw new OfferingAvailabilityException("Offering on {$date} is cancelled by schedule exception");
        }

        $days = json_decode((string) $row->days_json, true, 512, JSON_THROW_ON_ERROR);
        $weekday = ScheduleIdentityCodec::getUTCCalendarWeekday($date);
        $isOperatingDay = in_array($weekday, $days, true);

        if (!$isOperatingDay && $extraEx === null) {
            throw new OfferingAvailabilityException("Schedule does not operate on weekday {$weekday} on {$date}");
        }

        $departTime = $timeEx['effect']['departTime']
            ?? $extraEx['effect']['departTime']
            ?? substr((string) $row->depart_time, 0, 5);
        $arriveTime = $timeEx['effect']['arriveTime']
            ?? $extraEx['effect']['arriveTime']
            ?? substr((string) $row->arrive_time, 0, 5);

        $aircraft = $aircraftEx['effect']['aircraft']
            ?? $extraEx['effect']['aircraft']
            ?? (string) $row->aircraft;
        $aircraftId = $aircraftEx['effect']['aircraftId']
            ?? $extraEx['effect']['aircraftId']
            ?? ($row->aircraft_id !== null ? (string) $row->aircraft_id : null);

        if ($aircraftId === null || $aircraftId === '') {
            throw new OfferingAvailabilityException("Active offering requires explicit aircraftId");
        }

        // Active equipment check: aircraft must exist, be active, model must match
        $acRow = DB::table('aircraft')->where('id', $aircraftId)->first();
        if ($acRow === null || !$acRow->active) {
            throw new OfferingAvailabilityException("Aircraft {$aircraftId} is missing or inactive");
        }
        if ($acRow->model !== $aircraft) {
            throw new OfferingAvailabilityException("Aircraft model '{$acRow->model}' does not match offering aircraft '{$aircraft}'");
        }

        $layoutRow = DB::table('seat_layouts')->where('aircraft_id', $aircraftId)->first();
        if ($layoutRow === null) {
            throw new OfferingAvailabilityException("Seat layout for aircraft {$aircraftId} is missing");
        }
        $layout = SeatLayoutDto::fromRow($layoutRow)->toArray();

        $isOut = $row->direction === 'out';
        $originCode = $isOut ? 'GZA' : (string) $row->destination;
        $destinationCode = $isOut ? (string) $row->destination : 'GZA';

        $durationMinutes = (int) $dest->block_minutes;
        try {
            $timing = OfferingLocalTime::project($date, $departTime,
                (string) ($isOut ? $gza->timezone : $dest->timezone),
                (string) ($isOut ? $dest->timezone : $gza->timezone), $durationMinutes);
        } catch (\InvalidArgumentException) {
            throw new OfferingAvailabilityException('Offering local departure time is not uniquely valid.');
        }
        // Schedule arrival is a nominal editorial clock. Dated reads derive authoritative local
        // arrival from elapsed block minutes, not an unrelated HH:mm template through DST changes.
        $arriveTime = $timing['arriveTime'];
        unset($timing['arriveTime']);

        $fleetRev = (int) (DB::table('reference_revision_control')->where('domain', 'fleet')->value('revision') ?? 0);
        $networkRev = (int) (DB::table('network_revision_control')->where('domain', 'network')->value('revision') ?? 0);
        $schedulesRev = (int) (DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision') ?? 0);

        $offeringId = ScheduleIdentityCodec::encodeDatedOfferingId($scheduleId, $date);
        if ($expectedId !== null && $offeringId !== $expectedId) {
            throw new OfferingNotFoundException("Offering ID mismatch");
        }

        return new OfferingDto(
            id: $offeringId,
            scheduleId: $scheduleId,
            date: $date,
            number: (string) $row->number,
            direction: (string) $row->direction,
            originCode: $originCode,
            destinationCode: $destinationCode,
            departTime: $departTime,
            arriveTime: $arriveTime,
            durationMinutes: $durationMinutes,
            aircraftId: $aircraftId,
            aircraft: $aircraft,
            layout: $layout,
            revisions: [
                'fleet' => $fleetRev,
                'network' => $networkRev,
                'schedules' => $schedulesRev,
            ],
            classification: 'commemorative',
            priceMinor: 0,
            timing: $timing,
        );
    }
}
