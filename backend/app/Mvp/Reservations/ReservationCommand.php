<?php
declare(strict_types=1);

namespace App\Mvp\Reservations;

use DateTimeImmutable;
use InvalidArgumentException;

/** Free one-way confirmation input. Ownership, availability and capacity are server facts. */
final class ReservationCommand
{
    public static function parse(array $input, bool $isGuest = false): array
    {
        self::keys($input, ['submissionId', 'serviceId', 'passengers', 'contact']);
        if (!is_string($input['submissionId'] ?? null)
            || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i', $input['submissionId']) !== 1) {
            throw new InvalidArgumentException('Invalid reservation command.');
        }
        $service = self::service($input['serviceId'] ?? null);
        $passengers = $input['passengers'] ?? null;
        if (!is_array($passengers) || !array_is_list($passengers) || count($passengers) < 1 || count($passengers) > 9) {
            throw new InvalidArgumentException('Invalid reservation command.');
        }
        $ids = []; $seats = []; $normalized = []; $adults = 0;
        foreach ($passengers as $passenger) {
            if (!is_array($passenger)) { throw new InvalidArgumentException('Invalid reservation command.'); }
            if ($isGuest) {
                self::keys($passenger, ['id', 'name', 'firstName', 'lastName', 'type', 'dob', 'nationality', 'document', 'seatCode', 'mealId']);
            } else {
                self::keys($passenger, ['id', 'type', 'firstName', 'lastName', 'dob', 'nationality', 'document', 'seatCode', 'mealId']);
            }
            $id = self::identifier($passenger['id'] ?? null);
            if (isset($ids[$id])) { throw new InvalidArgumentException('Invalid reservation command.'); }
            $ids[$id] = true;

            $type = $passenger['type'] ?? ($isGuest ? 'adult' : null);
            if (!in_array($type, ['adult', 'child'], true)) {
                throw new InvalidArgumentException('Invalid reservation command.');
            }

            if ($isGuest) {
                if (array_key_exists('name', $passenger) && array_key_exists('firstName', $passenger)) {
                    throw new InvalidArgumentException('Invalid reservation command.');
                }
                if (isset($passenger['name'])) {
                    $first = self::text($passenger['name'], 120, true);
                    $last = isset($passenger['lastName']) && $passenger['lastName'] !== null && $passenger['lastName'] !== ''
                        ? self::text($passenger['lastName'], 120, true)
                        : null;
                } elseif (isset($passenger['firstName'])) {
                    $first = self::text($passenger['firstName'], 120, true);
                    $last = isset($passenger['lastName']) && $passenger['lastName'] !== null && $passenger['lastName'] !== ''
                        ? self::text($passenger['lastName'], 120, true)
                        : null;
                } else {
                    throw new InvalidArgumentException('Invalid reservation command.');
                }

                $dob = null;
                if (isset($passenger['dob']) && $passenger['dob'] !== null && $passenger['dob'] !== '') {
                    $dob = self::date($passenger['dob']);
                    $age = (new DateTimeImmutable($dob))->diff(new DateTimeImmutable($service['date']));
                    if ($age->invert || $age->y > 120 || ($type === 'adult' ? $age->y < 12 : ($age->y < 2 || $age->y >= 12))) {
                        throw new InvalidArgumentException('Invalid reservation command.');
                    }
                }

                $nationality = null;
                if (isset($passenger['nationality']) && $passenger['nationality'] !== null && $passenger['nationality'] !== '') {
                    $nationality = self::text($passenger['nationality'], 120, true);
                }

                $document = null;
                if (isset($passenger['document']) && $passenger['document'] !== null && $passenger['document'] !== '') {
                    $document = self::text($passenger['document'], 120, true);
                }
            } else {
                $first = self::text($passenger['firstName'] ?? null, 120, false);
                $last = self::text($passenger['lastName'] ?? null, 120, false);
                if ($first === '' && $last === '') { throw new InvalidArgumentException('Invalid reservation command.'); }
                $dob = self::date($passenger['dob'] ?? null);
                $age = (new DateTimeImmutable($dob))->diff(new DateTimeImmutable($service['date']));
                if ($age->invert || $age->y > 120 || ($type === 'adult' ? $age->y < 12 : ($age->y < 2 || $age->y >= 12))) {
                    throw new InvalidArgumentException('Invalid reservation command.');
                }
                $nationality = self::text($passenger['nationality'] ?? null, 120);
                $document = self::text($passenger['document'] ?? null, 120);
            }

            if ($type === 'adult') { $adults++; }
            $seat = $passenger['seatCode'] ?? null;
            if (!is_string($seat) || preg_match('/\A(?:[1-9]|[1-5][0-9]|60)[A-Z]\z/', $seat) !== 1 || isset($seats[$seat])) {
                throw new InvalidArgumentException('Invalid reservation command.');
            }
            $seats[$seat] = true;
            $meal = $passenger['mealId'] ?? null;
            if ($meal !== null) { $meal = self::identifier($meal); }
            $normalized[] = [
                'id' => $id,
                'type' => $type,
                'firstName' => $first,
                'lastName' => $last,
                'dob' => $dob,
                'nationality' => $nationality,
                'document' => $document,
                'seatCode' => $seat,
                'mealId' => $meal,
            ];
        }
        if ($adults === 0) { throw new InvalidArgumentException('Invalid reservation command.'); }
        $contact = $input['contact'] ?? null;
        if (!is_array($contact)) { throw new InvalidArgumentException('Invalid reservation command.'); }
        self::keys($contact, ['email', 'phone']);
        $email = self::text($contact['email'] ?? null, 254);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { throw new InvalidArgumentException('Invalid reservation command.'); }
        if (isset($contact['phone']) && $contact['phone'] !== null && $contact['phone'] !== '') {
            $phone = self::text($contact['phone'], 32, false);
            if ($phone !== '' && preg_match('/\A\+?[0-9 ()-]{5,32}\z/', $phone) !== 1) { throw new InvalidArgumentException('Invalid reservation command.'); }
        } elseif (!$isGuest) {
            $phone = self::text($contact['phone'] ?? null, 32, false);
            if ($phone !== '' && preg_match('/\A\+?[0-9 ()-]{5,32}\z/', $phone) !== 1) { throw new InvalidArgumentException('Invalid reservation command.'); }
        } else {
            $phone = '';
        }
        return [
            'submissionId' => strtolower($input['submissionId']),
            'serviceId' => $input['serviceId'],
            'passengers' => $normalized,
            'contact' => ['email' => $email, 'phone' => $phone],
        ];
    }

    public static function parseGuest(array $input): array
    {
        return self::parse($input, isGuest: true);
    }

    public static function service(mixed $id): array
    {
        if (!is_string($id) || preg_match('/\Asvc1-([A-Za-z0-9_-]+)-(\d{4}-\d{2}-\d{2})\z/', $id, $match) !== 1) {
            throw new InvalidArgumentException('Invalid reservation command.');
        }
        $encoded = $match[1];
        $schedule = base64_decode(strtr($encoded, '-_', '+/').str_repeat('=', (4 - strlen($encoded) % 4) % 4), true);
        if ($schedule === false || !mb_check_encoding($schedule, 'UTF-8') || $schedule === '' || str_contains($schedule, "\0")
            || strlen(mb_convert_encoding($schedule, 'UTF-16LE', 'UTF-8')) / 2 > 160
            || rtrim(strtr(base64_encode($schedule), '+/', '-_'), '=') !== $encoded) {
            throw new InvalidArgumentException('Invalid reservation command.');
        }
        return ['scheduleId' => $schedule, 'date' => self::date($match[2])];
    }

    private static function date(mixed $value): string
    {
        if (!is_string($value) || preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $value) !== 1) { throw new InvalidArgumentException('Invalid reservation command.'); }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($date === false || $date->format('Y-m-d') !== $value || (int) substr($value, 0, 4) < 1) { throw new InvalidArgumentException('Invalid reservation command.'); }
        return $value;
    }

    private static function identifier(mixed $value): string
    {
        if (!is_string($value) || preg_match('/\A[A-Za-z0-9_-]{1,64}\z/', $value) !== 1) { throw new InvalidArgumentException('Invalid reservation command.'); }
        return $value;
    }

    private static function text(mixed $value, int $max, bool $required = true): string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || preg_match('/[\x00-\x1f\x7f]/', $value)) { throw new InvalidArgumentException('Invalid reservation command.'); }
        $value = trim($value);
        if (($required && $value === '') || mb_strlen($value) > $max) { throw new InvalidArgumentException('Invalid reservation command.'); }
        return $value;
    }

    private static function keys(array $value, array $allowed): void
    {
        if (array_diff(array_keys($value), $allowed)) { throw new InvalidArgumentException('Invalid reservation command.'); }
    }
}
