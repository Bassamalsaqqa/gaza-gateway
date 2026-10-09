<?php

declare(strict_types=1);

namespace App\Identity\Mfa\Exceptions;

use RuntimeException;

/**
 * Base exception for all MFA-related validation and processing errors.
 * Ensures error messages never reflect raw secrets, OTPs, or recovery codes.
 */
class MfaException extends RuntimeException
{
}
