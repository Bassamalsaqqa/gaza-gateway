<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Base exception for all HostPapa Canary failures.
 */
class CanaryException extends \Exception
{
}

/**
 * Thrown when a security or isolation constraint is violated.
 */
class SecurityException extends CanaryException
{
}

/**
 * Thrown when target database fails safety or naming verification.
 */
class DatabaseGuardException extends SecurityException
{
}

/**
 * Thrown when a specific probe fails.
 */
class ProbeFailedException extends CanaryException
{
}
