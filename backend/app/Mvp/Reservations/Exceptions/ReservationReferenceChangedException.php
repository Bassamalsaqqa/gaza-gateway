<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationReferenceChangedException extends RuntimeException
{
    public function __construct(string $message = 'Offering reference changed since service materialization.')
    {
        parent::__construct($message);
    }
}
