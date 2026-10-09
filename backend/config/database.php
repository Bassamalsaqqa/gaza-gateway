<?php

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);

// In staging or production, fail closed: never silently fall back to local dev database, host, or credentials
$defaultHost = $isLocalOrTesting ? 'postgres' : null;
$defaultDatabase = $isLocalOrTesting ? 'gaza_gateway_dev' : null;
$defaultUsername = $isLocalOrTesting ? 'gaza_app_user' : null;
$defaultPassword = $isLocalOrTesting ? 'gaza_app_local_pass' : null;
$defaultSslMode = $isLocalOrTesting ? 'prefer' : 'require';

// Extract connection and query timeout configuration with URL query support
$dbUrl = env('DB_URL');
$urlQuery = [];
if (!empty($dbUrl)) {
    $parsedQueryString = parse_url($dbUrl, PHP_URL_QUERY);
    if ($parsedQueryString) {
        parse_str($parsedQueryString, $urlQuery);
    }
}

$connectTimeout = isset($urlQuery['connect_timeout'])
    ? $urlQuery['connect_timeout']
    : env('DB_CONNECT_TIMEOUT', 3);

$statementTimeout = isset($urlQuery['statement_timeout'])
    ? (string) $urlQuery['statement_timeout']
    : (string) env('DB_STATEMENT_TIMEOUT', '3000');

$lockTimeout = isset($urlQuery['lock_timeout'])
    ? (string) $urlQuery['lock_timeout']
    : (string) env('DB_LOCK_TIMEOUT', '3000');

$idleTimeout = isset($urlQuery['idle_in_transaction_session_timeout'])
    ? (string) $urlQuery['idle_in_transaction_session_timeout']
    : (string) env('DB_IDLE_TIMEOUT', '3000');

return [
    'default' => env('DB_CONNECTION', 'pgsql'),

    'connections' => [
        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', $defaultHost),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', $defaultDatabase),
            'username' => env('DB_USERNAME', $defaultUsername),
            'password' => env('DB_PASSWORD', $defaultPassword),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', $defaultSslMode),
            'options' => [
                \PDO::ATTR_TIMEOUT => $connectTimeout,
            ],
            'server_options' => [
                'statement_timeout' => $statementTimeout,
                'lock_timeout' => $lockTimeout,
                'idle_in_transaction_session_timeout' => $idleTimeout,
            ],
        ],

        'pgsql_test' => $isLocalOrTesting ? [
            'driver' => 'pgsql',
            'url' => env('DB_TEST_URL'),
            'host' => env('DB_HOST', 'postgres'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_TEST_DATABASE', 'gaza_gateway_test'),
            'username' => env('DB_USERNAME', 'gaza_app_user'),
            'password' => env('DB_PASSWORD', 'gaza_app_local_pass'),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => 'prefer',
            'options' => [
                \PDO::ATTR_TIMEOUT => $connectTimeout,
            ],
            'server_options' => [
                'statement_timeout' => $statementTimeout,
                'lock_timeout' => $lockTimeout,
                'idle_in_transaction_session_timeout' => $idleTimeout,
            ],
        ] : null,
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],
];
