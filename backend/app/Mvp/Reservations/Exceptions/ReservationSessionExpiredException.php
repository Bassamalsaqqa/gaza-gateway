<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationSessionExpiredException extends RuntimeException
{
    public function __construct(string $message = 'Session expired while waiting for authority lock.')
    {
        parent::__construct($message);
    }
}
