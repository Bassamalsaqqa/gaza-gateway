<?php

declare(strict_types=1);

namespace App\Contracts\Storage\Exceptions;

use App\Contracts\Foundation\Exceptions\UnconfiguredProviderException;

/**
 * Thrown when an unconfigured private storage provider adapter is called.
 */
class UnconfiguredStorageProviderException extends UnconfiguredProviderException
{
}
