<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Identity Configuration (Phase 13B Package 01)
    |--------------------------------------------------------------------------
    |
    | Self-contained runtime configuration matching accepted identity manifest.
    |
    */

    'passwords' => [
        'passenger' => [
            'min_codepoints' => 15,
            'max_codepoints' => 128,
        ],
        'staff' => [
            'min_codepoints' => 12,
            'max_codepoints' => 128,
        ],
        'max_bytes' => 4096,
        'argon2id' => [
            'memory_kib' => 65536,
            'time_cost' => 4,
            'threads' => 1,
        ],
    ],

    'sessions' => [
        'passenger' => [
            'absolute_ttl' => 604800, // 7 days in seconds
            'idle_ttl' => 86400,     // 24 hours in seconds
        ],
        'staff' => [
            'absolute_ttl' => 28800,  // 8 hours in seconds
            'idle_ttl' => 3600,       // 60 minutes in seconds
        ],
        'anonymous' => [
            'absolute_ttl' => 1800,   // 30 minutes in seconds
            'idle_ttl' => 1800,       // 30 minutes in seconds
        ],
        'pending' => [
            'absolute_ttl' => 300,    // 5 minutes in seconds
            'max_attempts' => 5,
        ],
        'step_up_ttl' => 300,        // 300 seconds
    ],

    'cookies' => [
        'passenger' => 'gza_session',
        'staff' => 'gza_staff_session',
        'pending' => 'gza_staff_pending',
        'path' => '/api/v1',
    ],

    'rbac' => [
        'roles' => ['admin', 'editor', 'viewer'],
        'permissions' => [
            'admin' => [
                'ops.view',
                'ops.edit',
                'content.view',
                'content.edit',
                'commercial.view',
                'commercial.edit',
                'engagement.view',
                'engagement.edit',
                'admin.manage',
                'dashboard.view',
            ],
            'editor' => [
                'dashboard.view',
                'content.view',
                'content.edit',
            ],
            'viewer' => [
                'dashboard.view',
                'ops.view',
                'content.view',
                'commercial.view',
                'engagement.view',
            ],
        ],
    ],

    'rate_limits' => [
        'login' => [
            'subject_ip' => ['limit' => 5, 'window' => 60],
            'ip' => ['limit' => 30, 'window' => 300],
        ],
        'dispatch' => [
            'subject_ip' => ['limit' => 3, 'window' => 900],
            'ip' => ['limit' => 20, 'window' => 3600],
        ],
        'challenge' => [
            'ref_session_ip' => ['limit' => 5, 'window' => 900],
            'ip' => ['limit' => 30, 'window' => 3600],
        ],
        'proof' => [
            'subject_ip' => ['limit' => 10, 'window' => 600],
        ],
        'step_up' => [
            'staff_session_ip' => ['limit' => 5, 'window' => 600],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Additive Bootstrap Resource Admission & Durable Cleanup (Phase 13B)
    |--------------------------------------------------------------------------
    |
    | Server-owned limits for anonymous bootstrap CSRF routes. Prevents unmetered
    | persistent anonymous session growth and key explosion under attack.
    |
    */
    'bootstrap' => [
        'ip_limit' => 10,
        'global_limit' => 300,
        'window_seconds' => 300,
        'retained_cap' => 10000,
        'cleanup_batch_size' => 100,
        'command_max_batches' => 10,
        'bucket_cleanup_horizon_seconds' => 3600,
    ],
];
