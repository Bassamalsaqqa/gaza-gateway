<?php

declare(strict_types=1);

namespace App\Identity\Mfa\Exceptions;

use Throwable;

/**
 * Thrown when a recovery code is malformed, invalid, or violates strict canonical bounds.
 */
class InvalidRecoveryCodeException extends MfaException
{
    public function __construct(string $message = 'Invalid recovery code.', int $code = 0, ?Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
