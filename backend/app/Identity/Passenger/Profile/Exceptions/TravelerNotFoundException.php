<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class TravelerNotFoundException extends PassengerProfileException
{
    public function __construct(string $message = 'Saved traveler not found.')
    {
        parent::__construct($message, 'not_found', 404);
    }
}
