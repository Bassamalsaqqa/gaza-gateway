<?php

declare(strict_types=1);

namespace App\Identity\Staff;

final class StaffDirectoryException extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode)
    {
        parent::__construct('Staff directory operation could not be completed.');
    }
}
