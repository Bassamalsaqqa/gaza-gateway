<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use DateTimeImmutable;
use DateTimeInterface;

final class ReservationDepartureBoundary
{
    public static function assertFuture(mixed $departAt, DateTimeInterface $now): void
    {
        // Only the server-resolved, offset-bearing timestamp is authority. Never
        // guess a timezone from a ticket date, server locale or client input.
        if (!is_string($departAt) || !preg_match('/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)\z/', $departAt)) {
            throw new ReservationValidationException('Authoritative departure instant is unavailable.');
        }
        $departure = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $departAt);
        $errors = DateTimeImmutable::getLastErrors();
        if ($departure === false || ($errors !== false && ($errors['warning_count'] || $errors['error_count']))) {
            throw new ReservationValidationException('Authoritative departure instant is invalid.');
        }
        if ($departure <= $now) {
            throw new ReservationValidationException('Offering departure must be in the future.');
        }
    }
}
