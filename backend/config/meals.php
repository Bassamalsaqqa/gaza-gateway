<?php

declare(strict_types=1);

// Local engineering only. Remote exposure is a separately reviewed gate.
return [
    'enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true),
];
