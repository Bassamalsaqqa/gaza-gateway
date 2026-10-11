<?php

declare(strict_types=1);

namespace App\Reference\Network;

use RuntimeException;

final class NetworkNotFoundException extends RuntimeException
{
    public function __construct(string $message = 'Network airport not found.')
    {
        parent::__construct($message);
    }
}
