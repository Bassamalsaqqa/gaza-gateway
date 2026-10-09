<?php

declare(strict_types=1);

namespace App\Contracts\Mail\Exceptions;

use InvalidArgumentException;

/**
 * Thrown when mail message data fails structural or security bounds.
 */
class InvalidMailMessageException extends InvalidArgumentException
{
}
