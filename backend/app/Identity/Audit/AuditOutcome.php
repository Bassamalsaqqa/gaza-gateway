<?php

declare(strict_types=1);

namespace App\Identity\Audit;

enum AuditOutcome: string
{
    case Success = 'success';
    case Failure = 'failure';
    case Denied = 'denied';
}
