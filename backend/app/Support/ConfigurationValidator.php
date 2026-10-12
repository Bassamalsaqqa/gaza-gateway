<?php

namespace App\Support;

use Illuminate\Support\ConfigurationUrlParser;

class ConfigurationValidator
{
    /**
     * Supported application environment profiles.
     */
    public const SUPPORTED_ENVIRONMENTS = ['local', 'testing', 'staging', 'production'];

    /**
     * Accepted production API host and frontend origins.
     * HostPapa shared hosting: same-origin www.gazaairport.com and approved apex gazaairport.com.
     */
    public const ACCEPTED_PRODUCTION_API_HOST = 'www.gazaairport.com';
    public const ACCEPTED_PRODUCTION_APP_URL = 'https://www.gazaairport.com';
    public const ACCEPTED_PRODUCTION_HOSTS = [
        'www.gazaairport.com',
        'gazaairport.com',
    ];
    public const ACCEPTED_PRODUCTION_APP_URLS = [
        'https://www.gazaairport.com',
        'https://gazaairport.com',
    ];
    public const ACCEPTED_PRODUCTION_FRONTEND_ORIGINS = [
        'https://www.gazaairport.com',
        'https://gazaairport.com',
    ];

    /**
     * Accepted staging API host and frontend origins.
     */
    public const ACCEPTED_STAGING_API_HOST = 'staging.gazaairport.com';
    public const ACCEPTED_STAGING_APP_URL = 'https://staging.gazaairport.com';
    public const ACCEPTED_STAGING_HOSTS = [
        'staging.gazaairport.com',
    ];
    public const ACCEPTED_STAGING_APP_URLS = [
        'https://staging.gazaairport.com',
    ];
    public const ACCEPTED_STAGING_FRONTEND_ORIGINS = [
        'https://staging.gazaairport.com',
    ];

    /**
     * Validate the resolved application configuration.
     * Sanitizes all error messages so credentials, keys, and DSNs are never reflected or logged.
     *
     * @param  array<string, mixed>  $config
     * @throws \RuntimeException
     */
    public static function validate(array $config, string $env): void
    {
        // 1. Environment profile check
        if (!in_array($env, self::SUPPORTED_ENVIRONMENTS, true)) {
            throw new \RuntimeException("Configuration error: Invalid or unsupported environment profile.");
        }

        $isDeployment = in_array($env, ['staging', 'production'], true);
        $isLocal = $env === 'local';
        $isTesting = $env === 'testing';

        // 2. Strict APP_KEY validation
        $key = (string) ($config['app']['key'] ?? '');
        $cipher = (string) ($config['app']['cipher'] ?? 'AES-256-CBC');
        $expectedKeyLength = match (strtoupper($cipher)) {
            'AES-128-CBC', 'AES-128-GCM' => 16,
            default => 32,
        };

        $isLocalSetupConsole = $isLocal && app()->runningInConsole() && self::isKeySetupCommand();

        if ($key === '') {
            if (!$isLocalSetupConsole) {
                throw new \RuntimeException("Configuration error: [app.key] is missing or empty.");
            }
        } else {
            $isValidKey = false;
            if (str_starts_with($key, 'base64:')) {
                $encoded = substr($key, 7);
                $decoded = base64_decode($encoded, true);
                if ($decoded !== false && strlen($decoded) === $expectedKeyLength) {
                    $isValidKey = true;
                }
            } elseif (strlen($key) === $expectedKeyLength) {
                $isValidKey = true;
            }

            if (!$isValidKey && !$isLocalSetupConsole) {
                throw new \RuntimeException("Configuration error: [app.key] has invalid length, encoding, or format.");
            }
        }

        // 3. Debug mode guard
        $debug = (bool) ($config['app']['debug'] ?? false);
        if ($isDeployment && $debug) {
            throw new \RuntimeException("Configuration error: [app.debug] must be false in deployment.");
        }

        // 4. Host authority and APP_URL validation
        $allowedHosts = (array) ($config['app']['allowed_hosts'] ?? []);
        $appUrl = trim((string) ($config['app']['url'] ?? ''));

        if ($env === 'production') {
            self::validateProductionHosts($allowedHosts);
            self::validateProductionAppUrl($appUrl);
        } elseif ($env === 'staging') {
            if (empty($allowedHosts)) {
                throw new \RuntimeException("Configuration error: [app.allowed_hosts] cannot be empty in staging.");
            }
            foreach ($allowedHosts as $host) {
                $hostStr = strtolower(trim((string) $host));
                if (!in_array($hostStr, self::ACCEPTED_STAGING_HOSTS, true)) {
                    throw new \RuntimeException("Configuration error: [app.allowed_hosts] contains unauthorized host in staging.");
                }
            }
            if (!in_array($appUrl, self::ACCEPTED_STAGING_APP_URLS, true)) {
                throw new \RuntimeException("Configuration error: [app.url] must match accepted staging API URL.");
            }
        } else {
            if (empty($allowedHosts)) {
                throw new \RuntimeException("Configuration error: [app.allowed_hosts] cannot be empty.");
            }
            if ($appUrl === '') {
                throw new \RuntimeException("Configuration error: [app.url] cannot be empty.");
            }
        }

        // 5. CORS origin validation
        $allowedOrigins = (array) ($config['cors']['allowed_origins'] ?? []);
        self::validateAllowedOrigins($allowedOrigins, $env);

        // 6. Database connection configuration with ConfigurationUrlParser
        $defaultConn = (string) ($config['database']['default'] ?? '');
        if ($isDeployment && $defaultConn !== 'mysql') {
            throw new \RuntimeException("Configuration error: [database.default] must be 'mysql' in deployment.");
        }
        if ($isTesting && $defaultConn !== 'mysql_test') {
            throw new \RuntimeException("Configuration error: [database.default] must be 'mysql_test' in testing.");
        }

        $connConfig = (array) ($config['database']['connections'][$defaultConn] ?? []);
        if (empty($connConfig)) {
            throw new \RuntimeException("Configuration error: Missing connection configuration for [{$defaultConn}].");
        }

        try {
            $parser = new ConfigurationUrlParser();
            $effectiveConn = $parser->parseConfiguration($connConfig);
        } catch (\Throwable) {
            throw new \RuntimeException("Configuration error: Invalid or malformed database configuration URL.");
        }

        $effectiveDriver = (string) ($effectiveConn['driver'] ?? '');
        if ($effectiveDriver !== 'mysql') {
            throw new \RuntimeException("Configuration error: Effective database driver must be 'mysql'.");
        }

        if ($isDeployment) {
            $socket = trim((string) ($effectiveConn['unix_socket'] ?? ''));
            $host = trim((string) ($effectiveConn['host'] ?? ''));

            if ($socket === '' && $host === '') {
                throw new \RuntimeException("Configuration error: Database host or unix socket cannot be empty in deployment.");
            }

            if ($host !== '') {
                // HostPapa shared-only ADR: Database runs on loopback localhost or local unix socket. Remote DB hosts are disallowed.
                $hostLower = strtolower($host);
                if (!in_array($hostLower, ['localhost', '127.0.0.1'], true)) {
                    throw new \RuntimeException("Configuration error: Database host must be loopback localhost/socket in shared-hosting deployment; remote DB host is disallowed.");
                }

                $port = trim((string) ($effectiveConn['port'] ?? ''));
                if ($port === '') {
                    throw new \RuntimeException("Configuration error: Database port cannot be empty in deployment.");
                }
            }

            $database = trim((string) ($effectiveConn['database'] ?? ''));
            if ($database === '' || in_array($database, ['gaza_gateway_dev', 'gaza_gateway_mysql_test', 'gaza_gateway_test', 'CHANGE_ME', 'placeholder'], true)) {
                throw new \RuntimeException("Configuration error: Database name cannot be empty, local/test, or placeholder in deployment.");
            }

            $username = trim((string) ($effectiveConn['username'] ?? ''));
            if ($username === '' || in_array($username, ['gaza_app_user', 'postgres', 'root', 'CHANGE_ME', 'placeholder'], true)) {
                throw new \RuntimeException("Configuration error: Database username cannot use dev/superuser defaults or placeholders in deployment.");
            }

            $password = (string) ($effectiveConn['password'] ?? '');
            if ($password === '' || in_array($password, ['gaza_app_local_pass', 'CHANGE_ME', 'placeholder'], true)) {
                throw new \RuntimeException("Configuration error: Database password cannot use dev defaults or placeholders in deployment.");
            }

            // Strict mode enforcement
            $strict = $effectiveConn['strict'] ?? null;
            if ($strict !== true) {
                throw new \RuntimeException("Configuration error: Database strict mode must be enabled in deployment.");
            }

            // UTC timezone enforcement
            $timezone = trim((string) ($effectiveConn['timezone'] ?? ''));
            if ($timezone !== '+00:00' && $timezone !== 'UTC') {
                throw new \RuntimeException("Configuration error: Database timezone must be '+00:00' (UTC) in deployment.");
            }

            // READ COMMITTED transaction isolation level enforcement
            $isolationLevel = strtoupper(trim((string) ($effectiveConn['isolation_level'] ?? '')));
            if ($isolationLevel !== 'READ COMMITTED') {
                throw new \RuntimeException("Configuration error: Database isolation_level must be 'READ COMMITTED' in deployment.");
            }

            // Database connection and query timeout deadline validation in deployment
            self::validateTimeouts($effectiveConn, true);
        } else {
            // Validate timeouts if explicitly configured or overridden in non-deployment
            self::validateTimeouts($effectiveConn, false);
        }

        if ($isTesting) {
            $database = trim((string) ($effectiveConn['database'] ?? ''));
            if ($database !== 'gaza_gateway_mysql_test') {
                throw new \RuntimeException("Configuration error: Testing database must be 'gaza_gateway_mysql_test'.");
            }
        }

        // 7. Queue and Cache driver and infrastructure validation
        self::validateQueueAndCache($config);
    }

    /**
     * Validate queue and cache drivers, stores, connections, tables, and locks.
     * Enforces single database-backed infrastructure; rejects in-memory, sync, or cross-connection overrides.
     *
     * @param  array<string, mixed>  $config
     * @throws \RuntimeException
     */
    public static function validateQueueAndCache(array $config): void
    {
        $defaultConn = (string) ($config['database']['default'] ?? 'mysql');

        // Queue validation
        $queueDefault = (string) ($config['queue']['default'] ?? '');
        if ($queueDefault === '') {
            throw new \RuntimeException("Configuration error: [queue.default] must be configured.");
        }

        $queueConnConfig = (array) ($config['queue']['connections'][$queueDefault] ?? []);
        $actualQueueDriver = (string) ($queueConnConfig['driver'] ?? '');
        if ($actualQueueDriver !== 'database') {
            throw new \RuntimeException("Configuration error: Effective queue driver must be 'database', got [{$actualQueueDriver}].");
        }

        $queueTable = (string) ($queueConnConfig['table'] ?? '');
        if ($queueTable !== 'jobs') {
            throw new \RuntimeException("Configuration error: Queue table must be 'jobs', got [{$queueTable}].");
        }

        $queueName = (string) ($queueConnConfig['queue'] ?? '');
        if ($queueName !== 'default') {
            throw new \RuntimeException("Configuration error: Queue name must be 'default', got [{$queueName}].");
        }

        $queueDbConn = $queueConnConfig['connection'] ?? null;
        if ($queueDbConn !== null && $queueDbConn !== $defaultConn) {
            throw new \RuntimeException("Configuration error: Unsupported cross-connection for queue.");
        }

        // Cache validation
        $cacheDefault = (string) ($config['cache']['default'] ?? '');
        if ($cacheDefault === '') {
            throw new \RuntimeException("Configuration error: [cache.default] must be configured.");
        }

        $cacheStoreConfig = (array) ($config['cache']['stores'][$cacheDefault] ?? []);
        $actualCacheDriver = (string) ($cacheStoreConfig['driver'] ?? '');
        if ($actualCacheDriver !== 'database') {
            throw new \RuntimeException("Configuration error: Effective cache driver must be 'database', got [{$actualCacheDriver}].");
        }

        $cacheTable = (string) ($cacheStoreConfig['table'] ?? '');
        if ($cacheTable !== 'cache') {
            throw new \RuntimeException("Configuration error: Cache table must be 'cache', got [{$cacheTable}].");
        }

        $lockTable = (string) ($cacheStoreConfig['lock_table'] ?? '');
        if ($lockTable !== 'cache_locks') {
            throw new \RuntimeException("Configuration error: Cache lock table must be 'cache_locks', got [{$lockTable}].");
        }

        $cacheDbConn = $cacheStoreConfig['connection'] ?? null;
        if ($cacheDbConn !== null && $cacheDbConn !== $defaultConn) {
            throw new \RuntimeException("Configuration error: Unsupported cross-connection for cache.");
        }

        $lockDbConn = $cacheStoreConfig['lock_connection'] ?? null;
        if ($lockDbConn !== null && $lockDbConn !== $defaultConn) {
            throw new \RuntimeException("Configuration error: Unsupported cross-connection for cache lock.");
        }
    }

    /**
     * Validate PostgreSQL connection and query timeout configuration.
     * Enforces bounded settings on the actual parameters consumed by the driver:
     * - options[\PDO::ATTR_TIMEOUT] for connect_timeout (1..5s)
     * - server_options.statement_timeout (100..5000ms)
     * - server_options.lock_timeout (100..5000ms)
     * Rejects contradictory or unbounded top-level / URL overrides.
     * Sanitizes all error messages so credentials, DSNs, and URLs are never reflected or logged.
     *
     * @param  array<string, mixed>  $effectiveConn
     * @throws \RuntimeException
     */
    public static function validateTimeouts(array $effectiveConn, bool $isDeployment): void
    {
        // 1. Inspect actual driver-consumed connect timeout in options[\PDO::ATTR_TIMEOUT]
        $driverConnectTimeout = $effectiveConn['options'][\PDO::ATTR_TIMEOUT] ?? null;
        if ($driverConnectTimeout !== null) {
            if (!is_int($driverConnectTimeout) && (!is_string($driverConnectTimeout) || !preg_match('/^[0-9]+$/', trim($driverConnectTimeout)))) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
            $intConnect = (int) $driverConnectTimeout;
            if ($intConnect < 1 || $intConnect > 5) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
        } elseif ($isDeployment) {
            throw new \RuntimeException("Configuration error: Database connect timeout must be configured in deployment.");
        }

        // Check top-level aliases / URL query overrides for connect_timeout
        if (isset($effectiveConn['connect_timeout'])) {
            $aliasConnect = $effectiveConn['connect_timeout'];
            if (!is_int($aliasConnect) && (!is_string($aliasConnect) || !preg_match('/^[0-9]+$/', trim($aliasConnect)))) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
            $intAliasConnect = (int) $aliasConnect;
            if ($intAliasConnect < 1 || $intAliasConnect > 5) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
            if ($driverConnectTimeout !== null && $intAliasConnect !== (int) $driverConnectTimeout) {
                throw new \RuntimeException("Configuration error: Contradictory database connect timeout configuration.");
            }
        }

        // 2. In MySQL, statement and lock timeouts are executed at connection initiation via PDO::MYSQL_ATTR_INIT_COMMAND.
        // Legacy server_options bag is NOT consumed by the MySQL PDO driver.
        // Inspect options[\PDO::MYSQL_ATTR_INIT_COMMAND] for actual active driver-consumed timeouts.
        $initCommand = (string) ($effectiveConn['options'][\PDO::MYSQL_ATTR_INIT_COMMAND] ?? '');

        // Extract active innodb_lock_wait_timeout (seconds)
        $lockSec = null;
        if (preg_match('/innodb_lock_wait_timeout\s*=\s*([0-9]+)/i', $initCommand, $matchesLock)) {
            $lockSec = (int) $matchesLock[1];
        }

        // Extract active max_execution_time (milliseconds; note: covers SELECT queries only in MySQL)
        $stmtMs = null;
        if (preg_match('/max_execution_time\s*=\s*([0-9]+)/i', $initCommand, $matchesStmt)) {
            $stmtMs = (int) $matchesStmt[1];
        }

        if ($isDeployment) {
            if ($lockSec === null) {
                throw new \RuntimeException("Configuration error: Database lock timeout must be configured in deployment.");
            }
            if ($stmtMs === null) {
                throw new \RuntimeException("Configuration error: Database statement timeout must be configured in deployment.");
            }
        }

        if ($lockSec !== null && ($lockSec < 1 || $lockSec > 5)) {
            throw new \RuntimeException("Configuration error: Invalid or unbounded database lock timeout.");
        }

        if ($stmtMs !== null && ($stmtMs < 100 || $stmtMs > 5000)) {
            throw new \RuntimeException("Configuration error: Invalid or unbounded database statement timeout.");
        }

        // Check top-level aliases / URL query overrides for statement_timeout and lock_timeout
        if (isset($effectiveConn['statement_timeout'])) {
            $aliasStmt = $effectiveConn['statement_timeout'];
            if (!is_int($aliasStmt) && (!is_string($aliasStmt) || !preg_match('/^[0-9]+$/', trim($aliasStmt)))) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database statement timeout.");
            }
            $intAliasStmt = (int) $aliasStmt;
            if ($intAliasStmt < 100 || $intAliasStmt > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database statement timeout.");
            }
            if ($stmtMs !== null && $intAliasStmt !== $stmtMs) {
                throw new \RuntimeException("Configuration error: Contradictory database statement timeout configuration.");
            }
        }

        if (isset($effectiveConn['lock_timeout'])) {
            $aliasLock = $effectiveConn['lock_timeout'];
            if (!is_int($aliasLock) && (!is_string($aliasLock) || !preg_match('/^[0-9]+$/', trim($aliasLock)))) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database lock timeout.");
            }
            $intAliasLock = (int) $aliasLock;
            if ($intAliasLock < 100 || $intAliasLock > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database lock timeout.");
            }
            $expectedLockSec = (int) ceil($intAliasLock / 1000);
            if ($lockSec !== null && $expectedLockSec !== $lockSec) {
                throw new \RuntimeException("Configuration error: Contradictory database lock timeout configuration.");
            }
        }
    }

    /**
     * Validate production host allowlist.
     *
     * @param string|array<string> $hosts
     */
    public static function validateProductionHosts(string|array $hosts): void
    {
        $hostList = is_string($hosts) ? explode(',', $hosts) : $hosts;
        $hostList = array_values(array_filter(array_map('trim', $hostList)));
        if (empty($hostList)) {
            throw new \RuntimeException("Configuration error: [app.allowed_hosts] cannot be empty in production.");
        }
        foreach ($hostList as $host) {
            $hostStr = strtolower(trim((string) $host));
            if (!in_array($hostStr, self::ACCEPTED_PRODUCTION_HOSTS, true)) {
                throw new \RuntimeException("Configuration error: [app.allowed_hosts] contains unauthorized host in production.");
            }
        }
    }

    /**
     * Validate production APP_URL against accepted canonical and legacy endpoints.
     */
    public static function validateProductionAppUrl(string $url): void
    {
        $appUrl = trim($url);
        if (!in_array($appUrl, self::ACCEPTED_PRODUCTION_APP_URLS, true)) {
            throw new \RuntimeException("Configuration error: [app.url] must match accepted production API URL.");
        }
    }

    /**
     * Validate CORS origins against environment allowlist.
     *
     * @param array<string> $origins
     */
    public static function validateAllowedOrigins(array $origins, string $env): void
    {
        if ($env === 'production') {
            if (empty($origins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty in production.");
            }
            foreach ($origins as $origin) {
                $originStr = trim((string) $origin);
                if (!in_array($originStr, self::ACCEPTED_PRODUCTION_FRONTEND_ORIGINS, true)) {
                    throw new \RuntimeException("Configuration error: [cors.allowed_origins] contains unauthorized origin in production.");
                }
            }
        } elseif ($env === 'staging') {
            if (empty($origins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty in staging.");
            }
            foreach ($origins as $origin) {
                $originStr = trim((string) $origin);
                if (!in_array($originStr, self::ACCEPTED_STAGING_FRONTEND_ORIGINS, true)) {
                    throw new \RuntimeException("Configuration error: [cors.allowed_origins] contains unauthorized origin in staging.");
                }
            }
        } else {
            if (empty($origins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty.");
            }
        }
    }

    /**
     * Check if the current console invocation is an explicit key setup command.
     */
    private static function isKeySetupCommand(): bool
    {
        $argv = $_SERVER['argv'] ?? [];
        foreach ($argv as $arg) {
            $arg = trim((string) $arg);
            if ($arg === 'key:generate' || str_starts_with($arg, 'key:generate')) {
                return true;
            }
        }

        return false;
    }
}
