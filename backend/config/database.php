<?php

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);

// In staging or production, fail closed: never silently fall back to local dev database, host, or credentials
$defaultHost = $isLocalOrTesting ? '127.0.0.1' : null;
$defaultDatabase = $isLocalOrTesting ? 'gaza_gateway_dev' : null;
$defaultUsername = $isLocalOrTesting ? 'gaza_app_user' : null;
$defaultPassword = $isLocalOrTesting ? 'gaza_app_local_pass' : null;
$defaultSocket = env('DB_SOCKET', '');

// Helper for strict positive integer validation without loose string casting
$validateStrictPositiveInt = function ($val, int $min, int $max): ?int {
    if ($val === null || $val === '') {
        return null;
    }
    if (is_int($val)) {
        return ($val >= $min && $val <= $max) ? $val : null;
    }
    if (is_string($val)) {
        $trimmed = trim($val);
        if (!preg_match('/^[0-9]+$/', $trimmed)) {
            return null; // Malformed input like '3oops' or '-1'
        }
        $intVal = filter_var($trimmed, FILTER_VALIDATE_INT);
        if ($intVal !== false && $intVal >= $min && $intVal <= $max) {
            return (int) $intVal;
        }
    }
    return null;
};

// Canonical PDO option builder that binds actual MySQL session init commands
$resolvePdoConfig = function (?string $url, $envConnectTimeout, $envStatementTimeout, $envLockTimeout) use ($validateStrictPositiveInt) {
    $urlQuery = [];
    if (!empty($url)) {
        $parsedQueryString = parse_url($url, PHP_URL_QUERY);
        if ($parsedQueryString) {
            parse_str($parsedQueryString, $urlQuery);
        }
    }

    $rawConnectTimeout = $urlQuery['connect_timeout'] ?? $envConnectTimeout;
    $validConnectTimeout = $validateStrictPositiveInt($rawConnectTimeout, 1, 5);
    $connectTimeout = $validConnectTimeout !== null ? $validConnectTimeout : $rawConnectTimeout;

    $rawStatementTimeout = $urlQuery['statement_timeout'] ?? $envStatementTimeout;
    $validStatementTimeout = $validateStrictPositiveInt($rawStatementTimeout, 100, 5000);
    $statementTimeout = $validStatementTimeout !== null ? $validStatementTimeout : $rawStatementTimeout;

    $rawLockTimeout = $urlQuery['lock_timeout'] ?? $envLockTimeout;
    $validLockTimeout = $validateStrictPositiveInt($rawLockTimeout, 100, 5000);
    $lockTimeout = $validLockTimeout !== null ? $validLockTimeout : $rawLockTimeout;

    $pdoOptions = [
        \PDO::ATTR_TIMEOUT => $connectTimeout,
        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
    ];

    $initParts = [];
    if (is_int($lockTimeout)) {
        $lockSec = (int) ceil($lockTimeout / 1000);
        if ($lockSec < 1) {
            $lockSec = 1;
        }
        $initParts[] = "SET SESSION innodb_lock_wait_timeout = {$lockSec}";
    }
    if (is_int($statementTimeout)) {
        $initParts[] = "SET SESSION max_execution_time = {$statementTimeout}";
    }
    if (!empty($initParts)) {
        $pdoOptions[\PDO::MYSQL_ATTR_INIT_COMMAND] = implode('; ', $initParts) . ';';
    }

    return [
        'options' => $pdoOptions,
        'statement_timeout' => (string) $statementTimeout,
        'lock_timeout' => (string) $lockTimeout,
    ];
};

$mysqlPdo = $resolvePdoConfig(
    env('DB_URL'),
    env('DB_CONNECT_TIMEOUT', 3),
    env('DB_STATEMENT_TIMEOUT', '3000'),
    env('DB_LOCK_TIMEOUT', '3000')
);

$testPdo = $resolvePdoConfig(
    env('DB_TEST_URL'),
    env('DB_CONNECT_TIMEOUT', 3),
    env('DB_STATEMENT_TIMEOUT', '3000'),
    env('DB_LOCK_TIMEOUT', '3000')
);

return [
    'default' => env('DB_CONNECTION', 'mysql'),

    'connections' => [
        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', $defaultHost),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', $defaultDatabase),
            'username' => env('DB_USERNAME', $defaultUsername),
            'password' => env('DB_PASSWORD', $defaultPassword),
            'unix_socket' => env('DB_SOCKET', $defaultSocket),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_0900_ai_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'timezone' => '+00:00',
            'isolation_level' => 'READ COMMITTED',
            'options' => $mysqlPdo['options'],
            'server_options' => [
                'statement_timeout' => $mysqlPdo['statement_timeout'],
                'lock_timeout' => $mysqlPdo['lock_timeout'],
            ],
        ],

        'mysql_test' => $isLocalOrTesting ? [
            'driver' => 'mysql',
            'url' => env('DB_TEST_URL'),
            'host' => env('DB_TEST_HOST', env('DB_HOST', '127.0.0.1')),
            'port' => env('DB_TEST_PORT', env('DB_PORT', '3306')),
            'database' => env('DB_TEST_DATABASE', 'gaza_gateway_mysql_test'),
            'username' => env('DB_TEST_USERNAME', env('DB_USERNAME', 'gaza_app_user')),
            'password' => env('DB_TEST_PASSWORD', env('DB_PASSWORD', 'gaza_app_local_pass')),
            'unix_socket' => env('DB_TEST_SOCKET', env('DB_SOCKET', '')),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_0900_ai_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'timezone' => '+00:00',
            'isolation_level' => 'READ COMMITTED',
            'options' => $testPdo['options'],
            'server_options' => [
                'statement_timeout' => $testPdo['statement_timeout'],
                'lock_timeout' => $testPdo['lock_timeout'],
            ],
        ] : null,
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],
];
