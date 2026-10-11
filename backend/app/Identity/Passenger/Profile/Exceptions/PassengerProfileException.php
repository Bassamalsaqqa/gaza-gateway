<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

use Exception;

class PassengerProfileException extends Exception
{
    public function __construct(
        string $message,
        protected readonly string $errorCode = 'internal_error',
        protected readonly int $statusCode = 500,
        ?Exception $previous = null,
    ) {
        parent::__construct($message, $statusCode, $previous);
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
