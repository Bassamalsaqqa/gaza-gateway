<?php

declare(strict_types=1);

namespace App\Mvp\Reservations\Exceptions;

use RuntimeException;

final class ReservationValidationException extends RuntimeException
{
    public function __construct(string $message = 'Invalid reservation command.')
    {
        parent::__construct($message);
    }
}
