<?php

declare(strict_types=1);

namespace App\Identity\Directory\Exceptions;

use App\Identity\Directory\DirectoryErrorCode;

class DirectoryGuardException extends \RuntimeException
{
    public readonly string $errorCode;

    public function __construct(
        string $errorCode,
        ?\Throwable $previous = null,
    ) {
        $canonicalCode = DirectoryErrorCode::canonicalCode($errorCode);
        $this->errorCode = $canonicalCode;
        parent::__construct(DirectoryErrorCode::messageFor($canonicalCode), 0, $previous);
    }
}
