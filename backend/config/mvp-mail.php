<?php
declare(strict_types=1);

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);
$parseStrictBool = static fn(mixed $v): bool => filter_var($v, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;

$sharedEnabled = $parseStrictBool(env('HOSTPAPA_SHARED_ENABLED', false));

// In deployment (production/staging), mail feature requires explicit HOSTPAPA_SHARED_ENABLED + feature opt-in.
// Defaults OFF/mock.
$mailEnabled = ($isLocalOrTesting || $sharedEnabled) && $parseStrictBool(env('MVP_MAIL_ENABLED', false));
$identitySmtpEnabled = ($isLocalOrTesting || $sharedEnabled) && $parseStrictBool(env('MVP_IDENTITY_SMTP_ENABLED', false));

// Operator-owned exact allowlist: Admin configuration never grants arbitrary outbound access.
// In production/staging, strictly 'mail.gazaairport.com' is allowed.
$defaultAllowedHosts = $isLocalOrTesting ? 'mailpit,mail.gazaairport.com' : 'mail.gazaairport.com';
$configuredHosts = array_values(array_filter(array_map('trim', explode(',', (string) env('MVP_SMTP_ALLOWED_HOSTS', $defaultAllowedHosts)))));

if (!$isLocalOrTesting) {
    if (empty($configuredHosts)) {
        throw new \RuntimeException('Configuration error: [mvp-mail.allowed_hosts] cannot be empty in deployment.');
    }
    foreach ($configuredHosts as $host) {
        $hostLower = strtolower($host);
        if ($hostLower !== 'mail.gazaairport.com') {
            throw new \RuntimeException("Configuration error: [mvp-mail.allowed_hosts] contains unauthorized host [{$hostLower}] in deployment. Only ['mail.gazaairport.com'] is permitted.");
        }
    }
    $configuredHosts = ['mail.gazaairport.com'];
}

return [
    'enabled' => $mailEnabled,
    'identity_smtp_enabled' => $identitySmtpEnabled,
    // Operator-owned exact allowlist: Admin configuration never grants arbitrary outbound access.
    'allowed_hosts' => $configuredHosts,
    'capture_path' => storage_path('app/private/booking_mail'),
    'capture_retention_hours' => 24,
    'operator_smtp' => [
        'host' => 'mail.gazaairport.com',
        'port' => 465, // implicit TLS
        'tls' => 'tls',
        'allowed_ports' => [465, 587], // 465 implicit TLS, 587 STARTTLS only with explicit approved config
    ],
];
