<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Mail Provider Seam Configuration
    |--------------------------------------------------------------------------
    |
    | 'driver': 'local' or 'unconfigured'
    | Note: 'local' is strictly restricted to 'local' and 'testing' environments.
    | Staging and production will ALWAYS bind unconfigured adapters regardless
    | of this configuration value to prevent accidental data capture in deployment.
    |
    */
    'mail' => [
        'driver' => env('FOUNDATION_MAIL_DRIVER', 'local'),
        'local_path' => env('FOUNDATION_MAIL_LOCAL_PATH', storage_path('app/private/mail_sink')),
        'max_recipient_length' => 254,
        'max_subject_length' => 255,
        'max_body_bytes' => 65536, // 64 KiB
        'file_mode' => 0600,
        'dir_mode' => 0700,
    ],

    /*
    |--------------------------------------------------------------------------
    | Private Object Storage Provider Seam Configuration
    |--------------------------------------------------------------------------
    |
    | 'driver': 'local' or 'unconfigured'
    | Note: 'local' is strictly restricted to 'local' and 'testing' environments.
    | Staging and production will ALWAYS bind unconfigured adapters regardless
    | of this configuration value to prevent accidental data storage in deployment.
    |
    */
    'storage' => [
        'driver' => env('FOUNDATION_STORAGE_DRIVER', 'local'),
        'local_root' => env('FOUNDATION_STORAGE_LOCAL_ROOT', storage_path('app/private/object_storage')),
        'max_key_length' => 128,
        'max_object_bytes' => 10485760, // 10 MiB
        'file_mode' => 0600,
        'dir_mode' => 0700,
    ],

];
