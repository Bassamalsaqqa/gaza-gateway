<?php

declare(strict_types=1);

namespace App\Identity\Contracts\Exceptions;

use RuntimeException;

/**
 * Thrown when an identity command schema artifact is missing, corrupted,
 * contains unsupported keywords, or has cyclic references.
 */
final class InvalidCommandSchemaException extends RuntimeException
{
}
