<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class UnauthorizedPassengerException extends PassengerProfileException
{
    public function __construct(string $message = 'Authenticated passenger session required.', string $errorCode = 'unauthorized')
    {
        parent::__construct($message, $errorCode, 401);
    }
}
