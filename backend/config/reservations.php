<?php

declare(strict_types=1);

return [
    'enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true) && (bool) env('RESERVATIONS_ENABLED', false),
    'authority' => env('RESERVATIONS_AUTHORITY', 'resolver'),
];
