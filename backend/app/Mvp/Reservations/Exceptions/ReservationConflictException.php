<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationConflictException extends RuntimeException
{
    public function __construct(string $message = 'Reservation conflict.')
    {
        parent::__construct($message);
    }
}
