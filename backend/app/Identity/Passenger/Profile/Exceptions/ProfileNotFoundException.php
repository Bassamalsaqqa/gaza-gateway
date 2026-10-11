<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class ProfileNotFoundException extends PassengerProfileException
{
    public function __construct(string $message = 'Passenger profile record is missing.')
    {
        // Safe internal error for integrity failure, never implicit credential-bearing user creation
        parent::__construct($message, 'internal_error', 500);
    }
}
