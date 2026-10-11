<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Network\NetworkCoordinator;
use App\Reference\Schedules\Exceptions\ScheduleValidationException;
use Illuminate\Support\Facades\DB;

final class ScheduleValidator
{
    private const FORBIDDEN_FIELDS = [
        'price', 'priceMinor', 'price_minor', 'fare', 'fares',
        'status', 'gate', 'terminal', 'seatsLeft', 'seats_left', 'capacity',
    ];

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function validateCreate(array $input): array
    {
        $this->assertNoForbiddenFields($input);

        $allowedKeys = [
            'id', 'number', 'direction', 'destination', 'days',
            'departTime', 'arriveTime', 'aircraft', 'aircraftId',
            'from', 'until', 'active', 'exceptions',
        ];
        foreach (array_keys($input) as $key) {
            if (!in_array($key, $allowedKeys, true)) {
                throw new ScheduleValidationException("Unknown property: {$key}");
            }
        }

        if (!isset($input['id']) || !is_string($input['id'])) {
            throw new ScheduleValidationException('Schedule ID is required.');
        }
        try {
            ScheduleIdentityCodec::assertValidId($input['id']);
        } catch (\Throwable $e) {
            throw new ScheduleValidationException($e->getMessage());
        }

        if (!isset($input['number']) || !is_string($input['number']) || !preg_match('/^[A-Z]{2}\s?[0-9]{1,4}$/', $input['number'])) {
            throw new ScheduleValidationException('Invalid flight number.');
        }

        if (!isset($input['direction']) || !in_array($input['direction'], ['out', 'in'], true)) {
            throw new ScheduleValidationException("Direction must be 'out' or 'in'.");
        }

        if (!isset($input['destination']) || !is_string($input['destination'])
            || !in_array($input['destination'], NetworkCoordinator::DESTINATION_CODES, true)) {
            throw new ScheduleValidationException('Invalid destination airport code.');
        }

        $days = $this->validateDays($input['days'] ?? null);
        $departTime = $this->validateTime($input['departTime'] ?? null, 'departTime');
        $arriveTime = $this->validateTime($input['arriveTime'] ?? null, 'arriveTime');

        if (!isset($input['aircraft']) || !is_string($input['aircraft']) || trim($input['aircraft']) === '' || strlen($input['aircraft']) > 120) {
            throw new ScheduleValidationException('Invalid aircraft model name.');
        }
        $aircraft = trim($input['aircraft']);

        $aircraftId = null;
        if (array_key_exists('aircraftId', $input) && $input['aircraftId'] !== null) {
            if (!is_string($input['aircraftId']) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $input['aircraftId'])) {
                throw new ScheduleValidationException('Invalid aircraft ID.');
            }
            $aircraftId = $input['aircraftId'];
        }

        $from = $this->validateDate($input['from'] ?? null, 'from');
        $until = $this->validateDate($input['until'] ?? null, 'until');
        if ($from > $until) {
            throw new ScheduleValidationException('Schedule start date must be on or before end date.');
        }

        if (!isset($input['active']) || !is_bool($input['active'])) {
            throw new ScheduleValidationException('Active flag must be a boolean.');
        }
        $active = $input['active'];

        $exceptions = $this->validateExceptions($input['exceptions'] ?? [], $from, $until, $days);

        $validated = [
            'id' => $input['id'],
            'number' => $input['number'],
            'direction' => $input['direction'],
            'destination' => $input['destination'],
            'days' => $days,
            'departTime' => $departTime,
            'arriveTime' => $arriveTime,
            'aircraft' => $aircraft,
            'aircraftId' => $aircraftId,
            'from' => $from,
            'until' => $until,
            'active' => $active,
            'exceptions' => $exceptions,
        ];

        if ($active) {
            $this->assertActivePrerequisites($validated);
        }

        return $validated;
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $existing
     * @return array{patch: array<string, mixed>, merged: array<string, mixed>}
     */
    public function validatePatch(array $input, array $existing): array
    {
        $this->assertNoForbiddenFields($input);

        // Immutable fields check: route identity cannot be mutated
        if (array_key_exists('id', $input) && $input['id'] !== $existing['id']) {
            throw new ScheduleValidationException('Schedule ID is immutable.');
        }
        if (array_key_exists('destination', $input) && $input['destination'] !== $existing['destination']) {
            throw new ScheduleValidationException('Schedule destination route is immutable.');
        }
        if (array_key_exists('direction', $input) && $input['direction'] !== $existing['direction']) {
            throw new ScheduleValidationException('Schedule route direction is immutable.');
        }

        $patch = [];

        if (array_key_exists('number', $input)) {
            if (!is_string($input['number']) || !preg_match('/^[A-Z]{2}\s?[0-9]{1,4}$/', $input['number'])) {
                throw new ScheduleValidationException('Invalid flight number.');
            }
            $patch['number'] = $input['number'];
        }

        if (array_key_exists('days', $input)) {
            $patch['days'] = $this->validateDays($input['days']);
        }

        if (array_key_exists('departTime', $input)) {
            $patch['departTime'] = $this->validateTime($input['departTime'], 'departTime');
        }

        if (array_key_exists('arriveTime', $input)) {
            $patch['arriveTime'] = $this->validateTime($input['arriveTime'], 'arriveTime');
        }

        if (array_key_exists('aircraft', $input)) {
            if (!is_string($input['aircraft']) || trim($input['aircraft']) === '' || strlen($input['aircraft']) > 120) {
                throw new ScheduleValidationException('Invalid aircraft model name.');
            }
            $patch['aircraft'] = trim($input['aircraft']);
        }

        if (array_key_exists('aircraftId', $input)) {
            if ($input['aircraftId'] !== null && (!is_string($input['aircraftId']) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $input['aircraftId']))) {
                throw new ScheduleValidationException('Invalid aircraft ID.');
            }
            $patch['aircraftId'] = $input['aircraftId'];
        }

        if (array_key_exists('from', $input)) {
            $patch['from'] = $this->validateDate($input['from'], 'from');
        }

        if (array_key_exists('until', $input)) {
            $patch['until'] = $this->validateDate($input['until'], 'until');
        }

        if (array_key_exists('active', $input)) {
            if (!is_bool($input['active'])) {
                throw new ScheduleValidationException('Active flag must be a boolean.');
            }
            $patch['active'] = $input['active'];
        }

        $merged = array_replace($existing, $patch);

        if ($merged['from'] > $merged['until']) {
            throw new ScheduleValidationException('Schedule start date must be on or before end date.');
        }

        if (array_key_exists('exceptions', $input)) {
            $patch['exceptions'] = $this->validateExceptions($input['exceptions'], $merged['from'], $merged['until'], $merged['days']);
            $merged['exceptions'] = $patch['exceptions'];
        } else {
            // Re-validate existing exceptions against new date range and days if changed
            $this->validateExceptions($merged['exceptions'], $merged['from'], $merged['until'], $merged['days']);
        }

        if ($merged['active']) {
            $this->assertActivePrerequisites($merged);
        }

        return ['patch' => $patch, 'merged' => $merged];
    }

    private function assertActivePrerequisites(array $schedule): void
    {
        // GZA base airport must exist and be active
        $gza = DB::table('airports')->where('code', 'GZA')->first();
        if ($gza === null || !$gza->active) {
            throw new ScheduleValidationException('Base airport GZA is inactive or not configured.');
        }

        // Destination airport must exist and be active
        $dest = DB::table('airports')->where('code', $schedule['destination'])->first();
        if ($dest === null || !$dest->active) {
            throw new ScheduleValidationException("Destination airport {$schedule['destination']} is inactive or not configured.");
        }

        // If aircraftId is provided, aircraft must exist, be active, model must match
        if (isset($schedule['aircraftId']) && $schedule['aircraftId'] !== null) {
            $aircraft = DB::table('aircraft')->where('id', $schedule['aircraftId'])->first();
            if ($aircraft === null || !$aircraft->active) {
                throw new ScheduleValidationException("Assigned aircraft {$schedule['aircraftId']} is inactive or does not exist.");
            }
            if ($aircraft->model !== $schedule['aircraft']) {
                throw new ScheduleValidationException("Assigned aircraft model '{$aircraft->model}' does not match schedule aircraft '{$schedule['aircraft']}'.");
            }
        }
    }

    private function validateDays(mixed $days): array
    {
        if (!is_array($days) || !array_is_list($days) || count($days) < 1 || count($days) > 7) {
            throw new ScheduleValidationException('Days must be a non-empty array of up to 7 weekdays.');
        }
        $seen = [];
        foreach ($days as $day) {
            if (!is_int($day) || $day < 0 || $day > 6) {
                throw new ScheduleValidationException('Each day must be an integer between 0 (Sun) and 6 (Sat).');
            }
            if (isset($seen[$day])) {
                throw new ScheduleValidationException('Duplicate operating weekday in schedule.');
            }
            $seen[$day] = true;
        }
        $result = array_keys($seen);
        sort($result);
        return $result;
    }

    private function validateTime(mixed $val, string $fieldName): string
    {
        if (!is_string($val) || !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $val)) {
            throw new ScheduleValidationException("Invalid time format for {$fieldName}; expected HH:mm.");
        }
        return $val;
    }

    private function validateDate(mixed $val, string $fieldName): string
    {
        if (!is_string($val) || !ScheduleIdentityCodec::isValidISODate($val)) {
            throw new ScheduleValidationException("Invalid calendar date for {$fieldName}; expected YYYY-MM-DD.");
        }
        return $val;
    }

    private function validateExceptions(mixed $exceptions, string $from, string $until, array $scheduleDays): array
    {
        if (!is_array($exceptions) || !array_is_list($exceptions)) {
            throw new ScheduleValidationException('Exceptions must be an array.');
        }
        if (count($exceptions) > 100) {
            throw new ScheduleValidationException('Schedule cannot have more than 100 exceptions.');
        }

        $seenIds = [];
        $validatedList = [];
        $opsByDate = [];

        foreach ($exceptions as $ex) {
            if (!is_array($ex)) {
                throw new ScheduleValidationException('Each exception must be an object.');
            }
            if (array_diff(array_keys($ex), ['id', 'date', 'kind', 'detail', 'effect']) !== []) throw new ScheduleValidationException('Unknown exception field');
            $id = $ex['id'] ?? null;
            if (!is_string($id) || $id === '' || strlen($id) > 160 || str_contains($id, "\0")) {
                throw new ScheduleValidationException('Invalid exception ID.');
            }
            if (isset($seenIds[$id])) {
                throw new ScheduleValidationException("Duplicate exception ID: {$id}");
            }
            $seenIds[$id] = true;

            $date = $this->validateDate($ex['date'] ?? null, 'exception date');
            $kind = $ex['kind'] ?? null;
            if (!in_array($kind, ['cancelled', 'time', 'aircraft', 'extra'], true)) {
                throw new ScheduleValidationException("Invalid exception kind: {$kind}");
            }

            $detail = $ex['detail'] ?? '';
            if (!is_string($detail) || strlen($detail) > 500) {
                throw new ScheduleValidationException('Exception detail must be a string up to 500 characters.');
            }

            $item = [
                'id' => $id,
                'date' => $date,
                'kind' => $kind,
                'detail' => $detail,
            ];

            if (array_key_exists('effect', $ex) && $ex['effect'] !== null) {
                $effect = $ex['effect'];
                if (!is_array($effect)) {
                    throw new ScheduleValidationException('Exception effect must be an object.');
                }

                $allowedEffect = match ($kind) { 'cancelled' => ['cancelled'], 'time' => ['departTime', 'arriveTime'], 'aircraft' => ['aircraftId', 'aircraft'], 'extra' => ['departTime', 'arriveTime', 'aircraftId', 'aircraft'] };
                if (array_diff(array_keys($effect), $allowedEffect) !== []) throw new ScheduleValidationException('Unknown exception effect field');
                // Date range check
                if ($date < $from || $date > $until) {
                    throw new ScheduleValidationException("Exception date {$date} must fall within schedule active date range [{$from}, {$until}].");
                }

                $weekday = ScheduleIdentityCodec::getUTCCalendarWeekday($date);
                $isOperatingDay = in_array($weekday, $scheduleDays, true);

                if ($kind === 'extra') {
                    if ($isOperatingDay) {
                        throw new ScheduleValidationException("Extra flight exceptions can only be scheduled on non-operating weekdays ({$date}).");
                    }
                    $validatedEffect = [];
                    if (isset($effect['departTime'])) {
                        $validatedEffect['departTime'] = $this->validateTime($effect['departTime'], 'effect.departTime');
                    }
                    if (isset($effect['arriveTime'])) {
                        $validatedEffect['arriveTime'] = $this->validateTime($effect['arriveTime'], 'effect.arriveTime');
                    }
                    $hasAcId = isset($effect['aircraftId']) && $effect['aircraftId'] !== null;
                    $hasAc = isset($effect['aircraft']) && $effect['aircraft'] !== null;
                    if ($hasAcId !== $hasAc) {
                        throw new ScheduleValidationException('Equipment identity and model must be supplied together in extra effect.');
                    }
                    if ($hasAcId) {
                        if (!is_string($effect['aircraftId']) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $effect['aircraftId'])) {
                            throw new ScheduleValidationException('Invalid aircraftId in extra effect.');
                        }
                        if (!is_string($effect['aircraft']) || trim($effect['aircraft']) === '' || strlen($effect['aircraft']) > 120) {
                            throw new ScheduleValidationException('Invalid aircraft in extra effect.');
                        }
                        $validatedEffect['aircraftId'] = $effect['aircraftId'];
                        $validatedEffect['aircraft'] = trim($effect['aircraft']);
                    }
                    $item['effect'] = $validatedEffect;
                } elseif ($kind === 'cancelled') {
                    if (!$isOperatingDay) {
                        throw new ScheduleValidationException("Operational cancellation can only be applied on scheduled operating days ({$date}).");
                    }
                    if (($effect['cancelled'] ?? null) !== true) {
                        throw new ScheduleValidationException("Cancelled effect requires 'cancelled: true'.");
                    }
                    $item['effect'] = ['cancelled' => true];
                } elseif ($kind === 'time') {
                    if (!$isOperatingDay) {
                        throw new ScheduleValidationException("Operational time adjustment can only be applied on scheduled operating days ({$date}).");
                    }
                    $item['effect'] = [
                        'departTime' => $this->validateTime($effect['departTime'] ?? null, 'effect.departTime'),
                        'arriveTime' => $this->validateTime($effect['arriveTime'] ?? null, 'effect.arriveTime'),
                    ];
                } elseif ($kind === 'aircraft') {
                    if (!$isOperatingDay) {
                        throw new ScheduleValidationException("Operational aircraft adjustment can only be applied on scheduled operating days ({$date}).");
                    }
                    if (!isset($effect['aircraftId']) || !is_string($effect['aircraftId']) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $effect['aircraftId'])) {
                        throw new ScheduleValidationException('Invalid aircraftId in aircraft effect.');
                    }
                    if (!isset($effect['aircraft']) || !is_string($effect['aircraft']) || trim($effect['aircraft']) === '' || strlen($effect['aircraft']) > 120) {
                        throw new ScheduleValidationException('Invalid aircraft in aircraft effect.');
                    }
                    $item['effect'] = [
                        'aircraftId' => $effect['aircraftId'],
                        'aircraft' => trim($effect['aircraft']),
                    ];
                }

                $opsByDate[$date] ??= [];
                $opsByDate[$date][] = $kind;
            }

            $validatedList[] = $item;
        }

        // Check coexistence per date
        foreach ($opsByDate as $date => $kinds) {
            if (count($kinds) <= 1) {
                continue;
            }
            if (in_array('cancelled', $kinds, true) || in_array('extra', $kinds, true)) {
                throw new ScheduleValidationException("Operational cancellation or extra cannot coexist with other operational effects on date {$date}.");
            }
            $timeCount = count(array_filter($kinds, static fn($k) => $k === 'time'));
            $acCount = count(array_filter($kinds, static fn($k) => $k === 'aircraft'));
            if ($timeCount > 1 || $acCount > 1 || count($kinds) > 2) {
                throw new ScheduleValidationException("At most one time adjustment and one aircraft adjustment may coexist on date {$date}.");
            }
        }

        return $validatedList;
    }

    private function assertNoForbiddenFields(array $input): void
    {
        foreach (self::FORBIDDEN_FIELDS as $forbidden) {
            if (array_key_exists($forbidden, $input)) {
                throw new ScheduleValidationException("Forbidden field '{$forbidden}' is not permitted in reference schedule.");
            }
        }
    }
}
