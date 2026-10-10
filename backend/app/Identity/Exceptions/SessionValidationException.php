<?php

declare(strict_types=1);

namespace App\Identity\Exceptions;

final class SessionValidationException extends IdentityException
{
    public readonly string $errorCode;

    public function __construct(
        string $message,
        public readonly string $reasonCode,
        ?\Throwable $previous = null,
    ) {
        $this->errorCode = $reasonCode;
        parent::__construct($message, 0, $previous);
    }
}
