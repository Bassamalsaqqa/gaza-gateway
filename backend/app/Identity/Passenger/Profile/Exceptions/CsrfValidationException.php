<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class CsrfValidationException extends PassengerProfileException
{
    public function __construct(string $message = 'CSRF validation failed.', string $errorCode = 'csrf_invalid')
    {
        parent::__construct($message, $errorCode, 403);
    }
}
