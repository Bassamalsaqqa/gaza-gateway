<?php

declare(strict_types=1);

return [
    'enabled' => filter_var(env('ANALYTICS_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
    'retention_days' => 90,
];
