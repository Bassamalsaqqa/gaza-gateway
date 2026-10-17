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
     *   partySize: int,
     *   rangeStart: string,
     *   rangeEnd: string,
     *   offerings: list<array<string, mixed>>,
     *   scheduledDates: list<string>,
     *   bookableDates: list<string>,
     *   availableDates: list<string>,
     *   capacitySemantics: string,
     *   capacityNotice: string
     * }
     */
    public function getAvailability(
        string $origin,
        string $destination,
        string $date,
        int $days = 28,
        ?DateTimeImmutable $clockNow = null,
        int $partySize = 1
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

        if ($partySize < 1 || $partySize > 9) {
            throw new ScheduleValidationException('Party size must be between 1 and 9.');
        }

        $direction = $isOut ? 'out' : 'in';
        $otherCode = $isOut ? $destination : $origin;

        return OfferingResolver::consistentRead(function () use (
            $origin,
            $destination,
            $date,
            $days,
            $partySize,
            $direction,
            $otherCode,
            $isOut,
            $clockNow
        ): array {
            $gza = DB::table('airports')->where('code', 'GZA')->first();
            if ($gza === null || !$gza->active) {
                return $this->emptyEnvelope($origin, $destination, $date, $days, $date, $date, $partySize);
            }

            $dest = DB::table('airports')->where('code', $otherCode)->first();
            if ($dest === null || !$dest->active) {
                return $this->emptyEnvelope($origin, $destination, $date, $days, $date, $date, $partySize);
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
                return $this->emptyEnvelope($origin, $destination, $date, $days, $rangeStart, $rangeEnd, $partySize);
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

            $offeringIds = array_map(static fn(OfferingDto $dto): string => $dto->id, $results);

            // 1. Batch query materialized services in mvp_services (authoritative frozen layout & revisions)
            $serviceRows = DB::table('mvp_services')
                ->whereIn('id', $offeringIds)
                ->get()
                ->keyBy('id');

            // 2. Batch query occupied seat claims in mvp_reservation_seat_claims
            $claimedSeatsByService = [];
            if ($serviceRows->isNotEmpty()) {
                $claimRows = DB::table('mvp_reservation_seat_claims')
                    ->whereIn('service_id', $serviceRows->keys()->all())
                    ->select('service_id', 'seat_code')
                    ->get();
                foreach ($claimRows as $claim) {
                    $claimedSeatsByService[(string) $claim->service_id][(string) $claim->seat_code] = true;
                }
            }

            // 3. Compute bounded authoritative capacity and snapshot integrity for each offering
            $offerings = [];
            foreach ($results as $dto) {
                $isMaterialized = $serviceRows->has($dto->id);
                $serviceRow = $isMaterialized ? $serviceRows->get($dto->id) : null;

                $isCompatible = true;
                $authoritativeLayout = $dto->layout;
                $authoritativeRevisions = $dto->revisions;

                if ($isMaterialized && $serviceRow !== null) {
                    $offeringArray = $dto->toArray();
                    $currentTiming = array_intersect_key($offeringArray, array_flip(['originTimezone', 'destinationTimezone', 'departAt', 'arriveAt', 'arrivalDate']));

                    try {
                        $frozenLayout = json_decode((string) $serviceRow->layout_snapshot, true, 512, JSON_THROW_ON_ERROR);
                        $frozenAircraft = json_decode((string) $serviceRow->aircraft_snapshot, true, 512, JSON_THROW_ON_ERROR);
                        $frozenRevisions = json_decode((string) $serviceRow->reference_revisions, true, 512, JSON_THROW_ON_ERROR);

                        // Match ReservationCoordinator lines 257-265 integrity predicate
                        if ((string) $serviceRow->aircraft_id !== (string) $dto->aircraftId
                            || $frozenLayout != $dto->layout
                            || (string) $serviceRow->flight_number !== (string) $dto->number
                            || (string) $serviceRow->depart_time !== (string) $dto->departTime
                            || (string) $serviceRow->arrive_time !== (string) $dto->arriveTime
                            || (int) $serviceRow->duration_minutes !== (int) $dto->durationMinutes
                            || ($frozenAircraft['model'] ?? null) !== $dto->aircraft
                            || (isset($frozenAircraft['timing']) && $frozenAircraft['timing'] != $currentTiming)
                        ) {
                            $isCompatible = false;
                        } else {
                            $authoritativeLayout = $frozenLayout;
                            $authoritativeRevisions = $frozenRevisions;
                        }
                    } catch (\Throwable) {
                        $isCompatible = false;
                    }
                }

                // If incompatible: do not overwrite current DTO layout/revisions with frozen mixed-data; mark unbookable
                $capacity = $this->calculateCapacity(
                    $isCompatible ? $authoritativeLayout : $dto->layout,
                    $claimedSeatsByService[$dto->id] ?? [],
                    $partySize
                );

                if (!$isCompatible) {
                    $capacity['bookable'] = false;
                    $capacity['seatsRemaining'] = 0;
                }

                $item = $dto->toArray();
                if ($isMaterialized && $isCompatible) {
                    $item['layout'] = $authoritativeLayout;
                    $item['revisions'] = $authoritativeRevisions;
                }
                $item['totalCapacity'] = $capacity['totalCapacity'];
                $item['seatsRemaining'] = $capacity['seatsRemaining'];
                $item['bookable'] = $capacity['bookable'];

                $offerings[] = $item;
            }

            // 4. Distinguish scheduled dates from bookable dates
            $scheduledDates = array_values(array_unique(array_map(static fn(array $o): string => $o['date'], $offerings)));
            sort($scheduledDates);

            $bookableDates = array_values(array_unique(array_map(
                static fn(array $o): string => $o['date'],
                array_filter($offerings, static fn(array $o): bool => $o['bookable'] === true)
            )));
            sort($bookableDates);

            // Backward compatibility: availableDates reflects truly bookable dates
            $availableDates = $bookableDates;

            return [
                'origin' => $origin,
                'destination' => $destination,
                'date' => $date,
                'days' => $days,
                'partySize' => $partySize,
                'rangeStart' => $rangeStart,
                'rangeEnd' => $rangeEnd,
                'offerings' => $offerings,
                'scheduledDates' => $scheduledDates,
                'bookableDates' => $bookableDates,
                'availableDates' => $availableDates,
                'capacitySemantics' => 'snapshot_not_guaranteed',
                'capacityNotice' => 'Advisory seat availability snapshot; booking completion locks definitive seats.',
            ];
        });
    }

    /**
     * @param array<string, bool> $occupiedSeatMap
     * @return array{totalCapacity: int, seatsRemaining: int, bookable: bool}
     */
    private function calculateCapacity(mixed $layout, array $occupiedSeatMap, int $partySize): array
    {
        $failClosed = [
            'totalCapacity' => 0,
            'seatsRemaining' => 0,
            'bookable' => false,
        ];

        if (!is_array($layout)) {
            return $failClosed;
        }

        $rows = $layout['rows'] ?? null;
        $letters = $layout['letters'] ?? null;
        if (!is_int($rows) || $rows < 1 || $rows > 60 || !is_array($letters) || !array_is_list($letters)
            || count($letters) < 2 || count($letters) > 10) {
            return $failClosed;
        }

        $validSeatCodes = [];
        $seenLetters = [];
        foreach ($letters as $letter) {
            if (!is_string($letter) || !preg_match('/^[A-Z]$/D', $letter) || isset($seenLetters[$letter])) {
                return $failClosed;
            }
            $seenLetters[$letter] = true;
            for ($r = 1; $r <= $rows; $r++) {
                $validSeatCodes["{$r}{$letter}"] = true;
            }
        }

        $unavailableList = $layout['unavailable'] ?? [];
        if (!is_array($unavailableList) || !array_is_list($unavailableList)) {
            return $failClosed;
        }

        $unavailableLookup = [];
        foreach ($unavailableList as $uSeat) {
            if (!is_string($uSeat)) {
                return $failClosed;
            }
            $uSeat = strtoupper(trim($uSeat));
            // Invalid unavailable seat format or seat outside geometry fails closed
            if (!isset($validSeatCodes[$uSeat]) || isset($unavailableLookup[$uSeat])) {
                return $failClosed;
            }
            $unavailableLookup[$uSeat] = true;
        }

        $bookablePhysicalSeats = count($validSeatCodes) - count($unavailableLookup);
        if ($bookablePhysicalSeats < 0) {
            return $failClosed;
        }

        // Validate occupied claims: claims outside valid geometry or on unavailable seats fail closed
        foreach ($occupiedSeatMap as $seatCode => $_) {
            if (!isset($validSeatCodes[$seatCode]) || isset($unavailableLookup[$seatCode])) {
                return $failClosed;
            }
        }

        $occupiedCount = count($occupiedSeatMap);
        $seatsRemaining = max(0, $bookablePhysicalSeats - $occupiedCount);
        $bookable = $seatsRemaining >= $partySize;

        return [
            'totalCapacity' => $bookablePhysicalSeats,
            'seatsRemaining' => $seatsRemaining,
            'bookable' => $bookable,
        ];
    }

    /**
     * @return array{
     *   origin: string,
     *   destination: string,
     *   date: string,
     *   days: int,
     *   partySize: int,
     *   rangeStart: string,
     *   rangeEnd: string,
     *   offerings: list<never>,
     *   scheduledDates: list<never>,
     *   bookableDates: list<never>,
     *   availableDates: list<never>,
     *   capacitySemantics: string,
     *   capacityNotice: string
     * }
     */
    private function emptyEnvelope(
        string $origin,
        string $destination,
        string $date,
        int $days,
        string $rangeStart,
        string $rangeEnd,
        int $partySize = 1
    ): array {
        return [
            'origin' => $origin,
            'destination' => $destination,
            'date' => $date,
            'days' => $days,
            'partySize' => $partySize,
            'rangeStart' => $rangeStart,
            'rangeEnd' => $rangeEnd,
            'offerings' => [],
            'scheduledDates' => [],
            'bookableDates' => [],
            'availableDates' => [],
            'capacitySemantics' => 'snapshot_not_guaranteed',
            'capacityNotice' => 'Advisory seat availability snapshot; booking completion locks definitive seats.',
        ];
    }
}
