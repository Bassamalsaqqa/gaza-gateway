<?php

declare(strict_types=1);

namespace App\Contracts\Mail\Exceptions;

use App\Contracts\Foundation\Exceptions\UnconfiguredProviderException;

/**
 * Thrown when an unconfigured mail provider adapter is called.
 */
class UnconfiguredMailProviderException extends UnconfiguredProviderException
{
}
