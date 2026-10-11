<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use InvalidArgumentException;

/**
 * Reversible URL-safe base64 encoding and identity codecs:
 * - Schedule route key: `sch1-<canonical base64url exact UTF8 ID>`
 * - Dated Offering ID: `svc1-<canonical base64url exact ID>-YYYY-MM-DD`
 */
final class ScheduleIdentityCodec
{
    public const SCHEDULE_ROUTE_PREFIX = 'sch1-';
    public const OFFERING_ID_PREFIX = 'svc1-';

    /**
     * Asserts that $id is a valid exact UTF-8 ID:
     * - Preserves exact UTF-8 ID (no trim, no case transform)
     * - Rejects NUL byte
     * - Rejects unpaired surrogates / invalid UTF-8
     * - Enforces 1 <= UTF-16 code units <= 160
     */
    public static function assertValidId(string $id): void
    {
        if ($id === '') {
            throw new InvalidArgumentException('Schedule ID cannot be empty.');
        }
        if (str_contains($id, "\0")) {
            throw new InvalidArgumentException('Schedule ID cannot contain NUL byte.');
        }
        if (!mb_check_encoding($id, 'UTF-8') || preg_match('//u', $id) !== 1) {
            throw new InvalidArgumentException('Schedule ID must be valid UTF-8.');
        }
        $utf16 = mb_convert_encoding($id, 'UTF-16BE', 'UTF-8');
        $codeUnits = (int) (strlen($utf16) / 2);
        if ($codeUnits < 1 || $codeUnits > 160) {
            throw new InvalidArgumentException(sprintf('Schedule ID must be 1..160 UTF-16 code units (got %d).', $codeUnits));
        }
    }

    public static function toBase64Url(string $str): string
    {
        self::assertValidId($str);
        return rtrim(strtr(base64_encode($str), '+/', '-_'), '=');
    }

    public static function fromBase64Url(string $base64url): ?string
    {
        if ($base64url === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $base64url)) {
            return null;
        }
        $remainder = strlen($base64url) % 4;
        $padded = $remainder === 0 ? $base64url : $base64url . str_repeat('=', 4 - $remainder);
        $decoded = base64_decode(strtr($padded, '-_', '+/'), true);
        if ($decoded === false) {
            return null;
        }
        // Strict canonical check: re-encoding must match the original base64url exactly
        if (rtrim(strtr(base64_encode($decoded), '+/', '-_'), '=') !== $base64url) {
            return null;
        }
        try {
            self::assertValidId($decoded);
            return $decoded;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function encodeScheduleKey(string $id): string
    {
        return self::SCHEDULE_ROUTE_PREFIX . self::toBase64Url($id);
    }

    public static function decodeScheduleKey(string $key): ?string
    {
        if (!str_starts_with($key, self::SCHEDULE_ROUTE_PREFIX)) {
            return null;
        }
        $encoded = substr($key, strlen(self::SCHEDULE_ROUTE_PREFIX));
        return self::fromBase64Url($encoded);
    }

    public static function encodeDatedOfferingId(string $scheduleId, string $date): string
    {
        if (!self::isValidISODate($date)) {
            throw new InvalidArgumentException("Invalid ISO calendar date: {$date}");
        }
        return self::OFFERING_ID_PREFIX . self::toBase64Url($scheduleId) . '-' . $date;
    }

    /**
     * @return array{scheduleId: string, date: string}|null
     */
    public static function decodeDatedOfferingId(string $id): ?array
    {
        if (!str_starts_with($id, self::OFFERING_ID_PREFIX)) {
            return null;
        }
        if (strlen($id) < strlen(self::OFFERING_ID_PREFIX) + 1 + 11) {
            return null;
        }
        $date = substr($id, -10);
        $sep = $id[strlen($id) - 11];
        if ($sep !== '-' || !self::isValidISODate($date)) {
            return null;
        }
        $encodedScheduleId = substr($id, strlen(self::OFFERING_ID_PREFIX), -11);
        $scheduleId = self::fromBase64Url($encodedScheduleId);
        if ($scheduleId === null) {
            return null;
        }
        return [
            'scheduleId' => $scheduleId,
            'date' => $date,
        ];
    }

    public static function isValidISODate(string $date): bool
    {
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $date)) {
            return false;
        }
        $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $date, new \DateTimeZone('UTC'));
        return $dt !== false && $dt->format('Y-m-d') === $date;
    }

    public static function getUTCCalendarWeekday(string $date): int
    {
        $dt = new \DateTimeImmutable("{$date}T00:00:00Z", new \DateTimeZone('UTC'));
        return (int) $dt->format('w'); // 0 (Sun) .. 6 (Sat)
    }
}
