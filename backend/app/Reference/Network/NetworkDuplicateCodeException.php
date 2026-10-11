<?php

declare(strict_types=1);

namespace App\Reference\Network;

use RuntimeException;

final class NetworkDuplicateCodeException extends RuntimeException
{
    public function __construct(string $message = 'Network airport code already exists.')
    {
        parent::__construct($message);
    }
}
