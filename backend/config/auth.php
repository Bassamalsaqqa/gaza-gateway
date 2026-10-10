<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | Gaza Gateway uses bounded separate realm guards backed by accepted
    | PostgreSQL identity session stores (PassengerSessionStore & StaffSessionStore).
    |
    */

    'defaults' => [
        'guard' => 'passenger',
        'passwords' => 'users',
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Supported guards:
    | - passenger / web: resolves gza_session cookie via PassengerSessionStore
    | - staff: resolves gza_staff_session cookie via StaffSessionStore & RbacPolicy
    |
    */

    'guards' => [
        'passenger' => [
            'driver' => 'passenger_session',
            'provider' => 'passengers',
        ],
        'web' => [
            'driver' => 'passenger_session',
            'provider' => 'passengers',
        ],
        'staff' => [
            'driver' => 'staff_session',
            'provider' => 'staff_users',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | Custom session store adapters to reviewed PostgreSQL tables.
    |
    */

    'providers' => [
        'passengers' => [
            'driver' => 'passenger_store',
        ],
        'staff_users' => [
            'driver' => 'staff_store',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | Configuration matching user_password_resets and staff_password_resets.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'passengers',
            'table' => 'user_password_resets',
            'expire' => 30,
            'throttle' => 60,
        ],
        'staff_users' => [
            'provider' => 'staff_users',
            'table' => 'staff_password_resets',
            'expire' => 30,
            'throttle' => 60,
        ],
    ],
];
