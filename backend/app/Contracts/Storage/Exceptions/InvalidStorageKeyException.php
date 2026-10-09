<?php

declare(strict_types=1);

namespace App\Contracts\Storage\Exceptions;

use InvalidArgumentException;

/**
 * Thrown when an object key violates the strict opaque key grammar or traversal rules.
 */
class InvalidStorageKeyException extends InvalidArgumentException
{
}
