<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Mvp\Reservations\Exceptions\ReservationAuthorityUnavailableException;

final class FailClosedReservationOfferingAuthority implements ReservationOfferingAuthority
{
    public function resolve(string $serviceId): array
    {
        throw new ReservationAuthorityUnavailableException(
            'Reservation offering authority is not configured (fail-closed integration boundary).'
        );
    }
}
