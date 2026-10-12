<?php

declare(strict_types=1);

namespace App\Gallery\Exceptions;

use RuntimeException;

final class GalleryValidationException extends RuntimeException
{
    public function __construct(
        string $message = 'Invalid gallery configuration structure.',
        public readonly ?array $fields = null
    ) {
        parent::__construct($message);
    }
}
