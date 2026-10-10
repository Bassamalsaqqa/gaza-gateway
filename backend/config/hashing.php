<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Default Hash Driver
    |--------------------------------------------------------------------------
    |
    | Production password hashing strictly uses Argon2id with bounded parameters.
    |
    */
    'driver' => 'argon2id',

    'argon' => [
        'memory' => 65536,
        'threads' => 1,
        'time' => 4,
        'verify' => true,
    ],
];
