<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationAuthorityUnavailableException extends RuntimeException
{
    public function __construct(string $message = 'Reservation offering authority unavailable.')
    {
        parent::__construct($message);
    }
}
