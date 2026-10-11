<?php

declare(strict_types=1);

namespace App\Identity\Booking;

final class BookingAccessException extends \RuntimeException
{
    public function __construct(public readonly int $status = 401, public readonly string $errorCode = 'unauthorized')
    {
        parent::__construct('Booking authority is not valid.');
    }
}
