<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationNotFoundException extends RuntimeException
{
    public function __construct(string $message = 'Reservation not found.')
    {
        parent::__construct($message);
    }
}
