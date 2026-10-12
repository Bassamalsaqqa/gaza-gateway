<?php
declare(strict_types=1);

return [
    'enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true) && (bool) env('MVP_MAIL_ENABLED', false),
    'identity_smtp_enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true) && (bool) env('MVP_IDENTITY_SMTP_ENABLED', false),
    // Operator-owned exact allowlist: Admin configuration never grants arbitrary outbound access.
    'allowed_hosts' => array_values(array_filter(explode(',', (string) env('MVP_SMTP_ALLOWED_HOSTS', 'mailpit')))),
    'capture_path' => storage_path('app/private/booking_mail'),
    'capture_retention_hours' => 24,
];
