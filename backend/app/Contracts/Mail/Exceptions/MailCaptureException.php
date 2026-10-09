<?php

declare(strict_types=1);

namespace App\Contracts\Mail\Exceptions;

use RuntimeException;

/**
 * Thrown when local mail capture I/O fails.
 */
class MailCaptureException extends RuntimeException
{
}
