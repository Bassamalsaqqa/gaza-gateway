<?php

declare(strict_types=1);

namespace App\Identity\Directory\Exceptions;

use App\Identity\Directory\DirectoryErrorCode;

final class LastAdminConflictException extends DirectoryGuardException
{
    public readonly int $eligibleAdminCount;

    public function __construct(
        int $eligibleAdminCount = 0,
        ?\Throwable $previous = null,
    ) {
        $this->eligibleAdminCount = max(0, $eligibleAdminCount);
        parent::__construct(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $previous);
    }
}
