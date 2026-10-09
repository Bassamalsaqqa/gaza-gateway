<?php

declare(strict_types=1);

namespace App\Identity\Mfa\Exceptions;

use Throwable;

/**
 * Thrown when a supplied OTP code or time counter parameter is malformed or invalid.
 */
class InvalidOtpException extends MfaException
{
    public function __construct(string $message = 'Invalid OTP code.', int $code = 0, ?Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}
