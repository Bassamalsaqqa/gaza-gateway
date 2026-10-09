<?php

declare(strict_types=1);

namespace App\Contracts\Storage\Exceptions;

use InvalidArgumentException;

/**
 * Thrown when an object payload exceeds maximum size bounds or fails structural integrity.
 */
class StoragePayloadException extends InvalidArgumentException
{
}
