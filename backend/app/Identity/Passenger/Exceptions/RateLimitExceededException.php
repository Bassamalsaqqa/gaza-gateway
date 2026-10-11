<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Exceptions;

use App\Identity\Exceptions\IdentityException;

final class RateLimitExceededException extends IdentityException
{
    public function __construct(
        public readonly int $retryAfterSeconds,
        string $message = 'Too many requests. Please try again later.'
    ) {
        parent::__construct($message);
    }
}
