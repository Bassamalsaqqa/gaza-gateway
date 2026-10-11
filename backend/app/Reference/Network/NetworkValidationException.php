<?php

declare(strict_types=1);

namespace App\Reference\Network;

use RuntimeException;

final class NetworkValidationException extends RuntimeException
{
    public function __construct(string $message = 'Invalid network command.')
    {
        parent::__construct($message);
    }
}
