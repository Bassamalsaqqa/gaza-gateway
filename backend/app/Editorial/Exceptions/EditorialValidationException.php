<?php

declare(strict_types=1);

namespace App\Editorial\Exceptions;

use RuntimeException;

final class EditorialValidationException extends RuntimeException
{
    public function __construct(
        string $message = 'Invalid content document structure.',
        public readonly ?array $fields = null
    ) {
        parent::__construct($message);
    }
}
