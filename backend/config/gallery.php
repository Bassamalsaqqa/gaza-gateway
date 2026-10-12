<?php

declare(strict_types=1);

// Local engineering and testing only. Remote exposure is a separately reviewed gate.
// Never enable production cutover without explicit owner authorization.
return [
    'enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true),
];
