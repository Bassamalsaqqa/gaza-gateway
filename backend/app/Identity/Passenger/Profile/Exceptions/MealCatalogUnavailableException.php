<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class MealCatalogUnavailableException extends PassengerProfileException
{
    public function __construct(
        string $message = 'Authoritative commercial catalog context is required to validate changed meal preference.'
    ) {
        parent::__construct($message, 'service_unavailable', 503);
    }
}
