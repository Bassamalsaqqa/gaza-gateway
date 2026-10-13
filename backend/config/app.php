<?php

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);

$defaultAllowedHosts = match ($appEnv) {
    'local', 'testing' => '127.0.0.1,localhost,127.0.0.1:18084,localhost:18084',
    'staging' => 'staging.gazaairport.com',
    'production' => 'www.gazaairport.com,gazaairport.com',
    default => '',
};
$rawHosts = env('APP_ALLOWED_HOSTS', $defaultAllowedHosts);
$parsedHosts = array_values(array_filter(array_map('trim', explode(',', (string) $rawHosts))));

// Packaged releases carry a hash-verified immutable pin. Shared secrets/configuration
// survive upgrades and rollbacks, so APP_COMMIT alone cannot attest installed code.
$sourcePin = dirname(__DIR__, 2) . '/SOURCE_COMMIT.txt';
$sourceCommit = env('APP_COMMIT', 'unreleased-local');
if (file_exists($sourcePin) || is_link($sourcePin)) {
    if (is_link($sourcePin) || !is_file($sourcePin) || filesize($sourcePin) !== 41) {
        throw new RuntimeException('Invalid release source pin.');
    }
    $pin = file_get_contents($sourcePin);
    if (!is_string($pin) || preg_match('/^[a-f0-9]{40}\\n$/D', $pin) !== 1) {
        throw new RuntimeException('Invalid release source pin.');
    }
    $sourceCommit = substr($pin, 0, 40);
}

$defaultAppUrl = match ($appEnv) {
    'local', 'testing' => 'http://127.0.0.1:18084',
    'staging' => 'https://staging.gazaairport.com',
    'production' => 'https://www.gazaairport.com',
    default => '',
};

return [
    'name' => env('APP_NAME', 'Gaza Gateway'),
    'env' => $appEnv,
    'debug' => $isLocalOrTesting ? (bool) env('APP_DEBUG', false) : false,
    'url' => env('APP_URL', $defaultAppUrl),
    'timezone' => 'UTC',
    'locale' => 'en',
    'fallback_locale' => 'en',
    'faker_locale' => 'en_US',
    'cipher' => 'AES-256-CBC',
    'key' => env('APP_KEY'),
    'previous_keys' => [
        ...array_filter(
            explode(',', env('APP_PREVIOUS_KEYS', ''))
        ),
    ],

    // Injected trusted versioning information (local dirty/unknown builds labelled honestly)
    'version' => env('APP_VERSION', '1.0.0-foundation'),
    'commit' => $sourceCommit,
    'schema_version' => (int) env('APP_SCHEMA_VERSION', 1),

    // Strict host allowlist (entries preserved without stripping so ConfigurationValidator validates them strictly)
    'allowed_hosts' => $parsedHosts,
];
