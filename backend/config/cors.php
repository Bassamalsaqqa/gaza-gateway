<?php

$appEnv = env('APP_ENV', 'production');

$defaultOrigins = match ($appEnv) {
    'production' => 'https://www.gazaairport.com,https://gazaairport.com',
    'staging' => 'https://staging.gazaairport.com',
    'local', 'testing' => 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:18084',
    default => '',
};
$rawOrigins = env('CORS_ALLOWED_ORIGINS', $defaultOrigins);
$parsedOrigins = array_values(array_filter(array_map('trim', explode(',', (string) $rawOrigins))));

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Origins preserved without stripping so ConfigurationValidator validates them strictly
    'allowed_origins' => $parsedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
        'X-Requested-With',
        'X-Request-Id',
        'X-CSRF-TOKEN',
        'X-Booking-Token',
        'X-Booking-Receipt',
        'Idempotency-Key',
        'If-Match',
    ],

    'exposed_headers' => [
        'X-Request-Id',
        'ETag',
        'Idempotency-Replay',
        'Retry-After',
        'Content-Length',
        'Content-Type',
    ],

    'max_age' => 86400,

    'supports_credentials' => true,
];
