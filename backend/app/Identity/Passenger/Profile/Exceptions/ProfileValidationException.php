<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile\Exceptions;

final class ProfileValidationException extends PassengerProfileException
{
    /**
     * @param array<string, list<string>> $fields
     */
    public function __construct(
        string $message = 'The given data was invalid.',
        private readonly array $fields = [],
        string $errorCode = 'validation_error',
    ) {
        parent::__construct($message, $errorCode, 422);
    }

    /**
     * @return array<string, list<string>>
     */
    public function getFields(): array
    {
        return $this->fields;
    }
}
