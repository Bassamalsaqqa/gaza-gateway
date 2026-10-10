<?php

declare(strict_types=1);

namespace App\Identity\RateLimiting;

/**
 * Internal exception used to trigger whole-transaction retry on window drift under lock contention.
 */
final class WindowDriftException extends \RuntimeException
{
}
