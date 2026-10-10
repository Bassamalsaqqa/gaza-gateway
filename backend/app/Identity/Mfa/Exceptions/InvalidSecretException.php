<?php

declare(strict_types=1);

namespace App\Identity\Mfa\Exceptions;

use Throwable;

/**
 * Thrown when an MFA secret is invalid, malformed, non-canonical, or has insufficient entropy.
 */
class InvalidSecretException extends MfaException
{
    public function __construct(string $message = 'Invalid MFA secret.', int $code = 0, ?Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
