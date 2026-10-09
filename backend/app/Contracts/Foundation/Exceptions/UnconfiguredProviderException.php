<?php

declare(strict_types=1);

namespace App\Contracts\Foundation\Exceptions;

use RuntimeException;

/**
 * Thrown when an unconfigured deployment provider adapter is invoked.
 */
class UnconfiguredProviderException extends RuntimeException
{
}
