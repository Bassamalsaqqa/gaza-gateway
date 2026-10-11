<?php

declare(strict_types=1);

namespace App\Identity\Staff;

final class StaffAuthenticationException extends \RuntimeException
{
    public function __construct()
    {
        parent::__construct('Staff authentication is not valid.');
    }
}
