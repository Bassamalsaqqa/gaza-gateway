<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Fleet\SeatLayoutDto;
use App\Reference\Schedules\Exceptions\ScheduleValidationException;
use App\Support\DatabaseClock;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;

final class OfferingAvailabilityHelper
{
    /**
     * Resolves available offerings over a bounded calendar range for a route without N+1 queries.
     *
     * @return array{
     *   origin: string,
     *   destination: string,
     *   date: string,
     *   days: int,
     *   rangeStart: string,
     *   rangeEnd: string,
     *   offerings: list<array<string, mixed>>,
     *   availableDates: list<string>
     * }
     */
    public function getAvailability(
        string $origin,
        string $destination,
        string $date,
        int $days = 28,
        ?DateTimeImmutable $clockNow = null
    ): array {
        if (!preg_match('/^[A-Z]{3}$/', $origin) || !preg_match('/^[A-Z]{3}$/', $destination)) {
            throw new ScheduleValidationException('Origin and destination must be 3-letter IATA codes.');
        }

        if ($origin === $destination) {
            throw new ScheduleValidationException('Origin and destination cannot be identical.');
        }

        $isOut = $origin === 'GZA';
        $isIn = $destination === 'GZA';

        if (!$isOut && !$isIn) {
            throw new ScheduleValidationException('Route must have Gaza (GZA) as either origin or destination.');
        }

        if ($isOut && $isIn) {
            throw new ScheduleValidationException('Route cannot start and end at GZA.');
        }

        if (!ScheduleIdentityCodec::isValidISODate($date)) {
            throw new ScheduleValidationException("Invalid ISO calendar date: {$date}");
        }

        if ($days < 1 || $days > 60) {
            throw new ScheduleValidationException('Days parameter must be between 1 and 60.');
        }

        $direction = $isOut ? 'out' : 'in';
        $otherCode = $isOut ? $destination : $origin;

        return OfferingResolver::consistentRead(function () use (
            $origin,
            $destination,
            $date,
            $days,
            $direction,
            $otherCode,
            $isOut,
            $clockNow
        ): array {
            $gza = DB::table('airports')->where('code', 'GZA')->first();
            if ($gza === null || !$gza->active) {
                return $this->emptyEnvelope($origin, $destination, $date, $days, $date, $date);
            }

            $dest = DB::table('airports')->where('code', $otherCode)->first();
            if ($dest === null || !$dest->active) {
                return $this->emptyEnvelope($origin, $destination, $date, $days, $date, $date);
            }

            $originAirport = $isOut ? $gza : $dest;
            $destAirport = $isOut ? $dest : $gza;
            $originTz = (string) $originAirport->timezone;
            $destTz = (string) $destAirport->timezone;
            $durationMinutes = (int) $dest->block_minutes;

            $nowUtc = $clockNow ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $todayLocal = $nowUtc->setTimezone(new DateTimeZone($originTz))->format('Y-m-d');

            $effectiveDate = $date < $todayLocal ? $todayLocal : $date;

            $daysBetween = (int) (new DateTimeImmutable($todayLocal))->diff(new DateTimeImmutable($effectiveDate))->format('%r%a');
            $lookback = $daysBetween > 0 ? min(7, $daysBetween) : 0;

            $rangeStartObj = (new DateTimeImmutable($effectiveDate))->sub(new DateInterval('P' . $lookback . 'D'));
            $rangeStart = $rangeStartObj->format('Y-m-d');
            if ($rangeStart < $todayLocal) {
                $rangeStart = $todayLocal;
                $rangeStartObj = new DateTimeImmutable($todayLocal);
            }

            $lookbackActual = (int) $rangeStartObj->diff(new DateTimeImmutable($effectiveDate))->format('%a');
            $totalDays = min(60, $lookbackActual + $days);
            $rangeEnd = $rangeStartObj->add(new DateInterval('P' . ($totalDays - 1) . 'D'))->format('Y-m-d');

            $schedules = DB::table('schedules')
                ->where('active', true)
                ->where('direction', $direction)
                ->where('destination', $otherCode)
                ->where('from_date', '<=', $rangeEnd)
                ->where('until_date', '>=', $rangeStart)
                ->get();

            if ($schedules->isEmpty()) {
                return $this->emptyEnvelope($origin, $destination, $date, $days, $rangeStart, $rangeEnd);
            }

            $aircraftRows = DB::table('aircraft')->where('active', true)->get()->keyBy('id');
            $layoutRows = DB::table('seat_layouts')->get()->keyBy('aircraft_id');

            $fleetRev = (int) (DB::table('reference_revision_control')->where('domain', 'fleet')->value('revision') ?? 0);
            $networkRev = (int) (DB::table('network_revision_control')->where('domain', 'network')->value('revision') ?? 0);
            $schedulesRev = (int) (DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision') ?? 0);
            $revisions = [
                'fleet' => $fleetRev,
                'network' => $networkRev,
                'schedules' => $schedulesRev,
            ];

            $results = [];
            $currentObj = new DateTimeImmutable($rangeStart);
            $endObj = new DateTimeImmutable($rangeEnd);

            while ($currentObj <= $endObj) {
                $currDate = $currentObj->format('Y-m-d');
                $weekday = ScheduleIdentityCodec::getUTCCalendarWeekday($currDate);

                foreach ($schedules as $row) {
                    $fromDate = substr((string) $row->from_date, 0, 10);
                    $untilDate = substr((string) $row->until_date, 0, 10);
                    if ($currDate < $fromDate || $currDate > $untilDate) {
                        continue;
                    }

                    $exceptions = json_decode((string) $row->exceptions_json, true, 512, JSON_THROW_ON_ERROR);
                    $dateExceptions = array_filter(
                        $exceptions,
                        static fn(array $e): bool => ($e['date'] ?? '') === $currDate && isset($e['effect']) && is_array($e['effect'])
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
                        continue;
                    }

                    $operatingDays = json_decode((string) $row->days_json, true, 512, JSON_THROW_ON_ERROR);
                    $isOperatingDay = in_array($weekday, $operatingDays, true);

                    if (!$isOperatingDay && $extraEx === null) {
                        continue;
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
                        continue;
                    }

                    $acRow = $aircraftRows->get($aircraftId);
                    if ($acRow === null || !$acRow->active || $acRow->model !== $aircraft) {
                        continue;
                    }

                    $layoutRow = $layoutRows->get($aircraftId);
                    if ($layoutRow === null) {
                        continue;
                    }

                    $layout = SeatLayoutDto::fromRow($layoutRow)->toArray();

                    try {
                        $timing = OfferingLocalTime::project(
                            $currDate,
                            $departTime,
                            $originTz,
                            $destTz,
                            $durationMinutes
                        );
                    } catch (\InvalidArgumentException) {
                        continue;
                    }

                    $arriveTime = $timing['arriveTime'];
                    unset($timing['arriveTime']);

                    // Future departure check
                    $departure = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $timing['departAt']);
                    if ($departure === false || $departure <= $nowUtc) {
                        continue;
                    }

                    $offeringId = ScheduleIdentityCodec::encodeDatedOfferingId((string) $row->id, $currDate);

                    $dto = new OfferingDto(
                        id: $offeringId,
                        scheduleId: (string) $row->id,
                        date: $currDate,
                        number: (string) $row->number,
                        direction: (string) $row->direction,
                        originCode: $origin,
                        destinationCode: $destination,
                        departTime: $departTime,
                        arriveTime: $arriveTime,
                        durationMinutes: $durationMinutes,
                        aircraftId: $aircraftId,
                        aircraft: $aircraft,
                        layout: $layout,
                        revisions: $revisions,
                        classification: 'commemorative',
                        priceMinor: 0,
                        timing: $timing,
                    );

                    $results[] = $dto;
                }

                $currentObj = $currentObj->add(new DateInterval('P1D'));
            }

            usort(
                $results,
                static fn(OfferingDto $a, OfferingDto $b): int =>
                    strcmp((string) ($a->timing['departAt'] ?? $a->departTime), (string) ($b->timing['departAt'] ?? $b->departTime))
                    ?: strcmp($a->number, $b->number)
                    ?: strcmp($a->id, $b->id)
            );

            $offerings = array_map(static fn(OfferingDto $dto): array => $dto->toArray(), $results);
            $availableDates = array_values(array_unique(array_map(static fn(OfferingDto $dto): string => $dto->date, $results)));

            return [
                'origin' => $origin,
                'destination' => $destination,
                'date' => $date,
                'days' => $days,
                'rangeStart' => $rangeStart,
                'rangeEnd' => $rangeEnd,
                'offerings' => $offerings,
                'availableDates' => $availableDates,
            ];
        });
    }

    /**
     * @return array{
     *   origin: string,
     *   destination: string,
     *   date: string,
     *   days: int,
     *   rangeStart: string,
     *   rangeEnd: string,
     *   offerings: list<never>,
     *   availableDates: list<never>
     * }
     */
    private function emptyEnvelope(
        string $origin,
        string $destination,
        string $date,
        int $days,
        string $rangeStart,
        string $rangeEnd
    ): array {
        return [
            'origin' => $origin,
            'destination' => $destination,
            'date' => $date,
            'days' => $days,
            'rangeStart' => $rangeStart,
            'rangeEnd' => $rangeEnd,
            'offerings' => [],
            'availableDates' => [],
        ];
    }
}
