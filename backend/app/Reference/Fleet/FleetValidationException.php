<?php

declare(strict_types=1);

namespace App\Reference\Fleet;

final class FleetValidationException extends \RuntimeException
{
    public function __construct() { parent::__construct('Invalid fleet command.'); }
}
