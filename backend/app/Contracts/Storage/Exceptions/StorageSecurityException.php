<?php

declare(strict_types=1);

namespace App\Contracts\Storage\Exceptions;

use RuntimeException;

/**
 * Thrown when storage roots, symlink escapes, or directory traversal attacks are detected.
 */
class StorageSecurityException extends RuntimeException
{
}
