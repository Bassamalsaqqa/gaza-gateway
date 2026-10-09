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
     */
    public const ACCEPTED_PRODUCTION_API_HOST = 'api.gazaairport.com';
    public const ACCEPTED_PRODUCTION_APP_URL = 'https://api.gazaairport.com';
    public const ACCEPTED_PRODUCTION_FRONTEND_ORIGINS = [
        'https://www.gazaairport.com',
        'https://gazaairport.com',
    ];

    /**
     * Accepted staging API host and frontend origins.
     */
    public const ACCEPTED_STAGING_API_HOST = 'staging-api.gazaairport.com';
    public const ACCEPTED_STAGING_APP_URL = 'https://staging-api.gazaairport.com';
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
            if (empty($allowedHosts)) {
                throw new \RuntimeException("Configuration error: [app.allowed_hosts] cannot be empty in production.");
            }
            foreach ($allowedHosts as $host) {
                $hostStr = strtolower(trim((string) $host));
                if ($hostStr !== self::ACCEPTED_PRODUCTION_API_HOST) {
                    throw new \RuntimeException("Configuration error: [app.allowed_hosts] contains unauthorized host in production.");
                }
            }
            if ($appUrl !== self::ACCEPTED_PRODUCTION_APP_URL) {
                throw new \RuntimeException("Configuration error: [app.url] must match accepted production API URL.");
            }
        } elseif ($env === 'staging') {
            if (empty($allowedHosts)) {
                throw new \RuntimeException("Configuration error: [app.allowed_hosts] cannot be empty in staging.");
            }
            foreach ($allowedHosts as $host) {
                $hostStr = strtolower(trim((string) $host));
                if ($hostStr !== self::ACCEPTED_STAGING_API_HOST) {
                    throw new \RuntimeException("Configuration error: [app.allowed_hosts] contains unauthorized host in staging.");
                }
            }
            if ($appUrl !== self::ACCEPTED_STAGING_APP_URL) {
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
        if ($env === 'production') {
            if (empty($allowedOrigins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty in production.");
            }
            foreach ($allowedOrigins as $origin) {
                $originStr = trim((string) $origin);
                if (!in_array($originStr, self::ACCEPTED_PRODUCTION_FRONTEND_ORIGINS, true)) {
                    throw new \RuntimeException("Configuration error: [cors.allowed_origins] contains unauthorized origin in production.");
                }
            }
        } elseif ($env === 'staging') {
            if (empty($allowedOrigins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty in staging.");
            }
            foreach ($allowedOrigins as $origin) {
                $originStr = trim((string) $origin);
                if (!in_array($originStr, self::ACCEPTED_STAGING_FRONTEND_ORIGINS, true)) {
                    throw new \RuntimeException("Configuration error: [cors.allowed_origins] contains unauthorized origin in staging.");
                }
            }
        } else {
            if (empty($allowedOrigins)) {
                throw new \RuntimeException("Configuration error: [cors.allowed_origins] cannot be empty.");
            }
        }

        // 6. Database connection configuration with ConfigurationUrlParser
        $defaultConn = (string) ($config['database']['default'] ?? '');
        if ($isDeployment && $defaultConn !== 'pgsql') {
            throw new \RuntimeException("Configuration error: [database.default] must be 'pgsql' in deployment.");
        }
        if ($isTesting && $defaultConn !== 'pgsql_test') {
            throw new \RuntimeException("Configuration error: [database.default] must be 'pgsql_test' in testing.");
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
        if ($effectiveDriver !== 'pgsql') {
            throw new \RuntimeException("Configuration error: Effective database driver must be 'pgsql'.");
        }

        if ($isDeployment) {
            $host = trim((string) ($effectiveConn['host'] ?? ''));
            if ($host === '') {
                throw new \RuntimeException("Configuration error: Database host cannot be empty in deployment.");
            }
            if (in_array(strtolower($host), ['localhost', '127.0.0.1', 'postgres'], true)) {
                throw new \RuntimeException("Configuration error: Database host cannot target local or container host in deployment.");
            }

            $port = trim((string) ($effectiveConn['port'] ?? ''));
            if ($port === '') {
                throw new \RuntimeException("Configuration error: Database port cannot be empty in deployment.");
            }

            $database = trim((string) ($effectiveConn['database'] ?? ''));
            if ($database === '' || in_array($database, ['gaza_gateway_dev', 'gaza_gateway_test', 'CHANGE_ME', 'placeholder'], true)) {
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

            $sslMode = strtolower(trim((string) ($effectiveConn['sslmode'] ?? '')));
            if (!in_array($sslMode, ['require', 'verify-ca', 'verify-full'], true)) {
                throw new \RuntimeException("Configuration error: Database sslmode must be 'require', 'verify-ca', or 'verify-full' in deployment.");
            }

            // Database connection and query timeout deadline validation in deployment
            self::validateTimeouts($effectiveConn, true);
        } else {
            // Validate timeouts if explicitly configured or overridden in non-deployment
            self::validateTimeouts($effectiveConn, false);
        }

        if ($isTesting) {
            $database = trim((string) ($effectiveConn['database'] ?? ''));
            if ($database !== 'gaza_gateway_test') {
                throw new \RuntimeException("Configuration error: Testing database must be 'gaza_gateway_test'.");
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
        $defaultConn = (string) ($config['database']['default'] ?? 'pgsql');

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
            if (filter_var($driverConnectTimeout, FILTER_VALIDATE_INT) === false || (int) $driverConnectTimeout < 1 || (int) $driverConnectTimeout > 5) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
        } elseif ($isDeployment) {
            throw new \RuntimeException("Configuration error: Database connect timeout must be configured in deployment.");
        }

        // 2. Inspect actual driver-consumed statement timeout in server_options['statement_timeout']
        $driverStatementTimeout = $effectiveConn['server_options']['statement_timeout'] ?? null;
        if ($driverStatementTimeout !== null) {
            if (filter_var($driverStatementTimeout, FILTER_VALIDATE_INT) === false || (int) $driverStatementTimeout < 100 || (int) $driverStatementTimeout > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database statement timeout.");
            }
        } elseif ($isDeployment) {
            throw new \RuntimeException("Configuration error: Database statement timeout must be configured in deployment.");
        }

        // 3. Inspect actual driver-consumed lock timeout in server_options['lock_timeout']
        $driverLockTimeout = $effectiveConn['server_options']['lock_timeout'] ?? null;
        if ($driverLockTimeout !== null) {
            if (filter_var($driverLockTimeout, FILTER_VALIDATE_INT) === false || (int) $driverLockTimeout < 100 || (int) $driverLockTimeout > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database lock timeout.");
            }
        } elseif ($isDeployment) {
            throw new \RuntimeException("Configuration error: Database lock timeout must be configured in deployment.");
        }

        // 4. Inspect optional driver-consumed idle timeout in server_options
        $driverIdleTimeout = $effectiveConn['server_options']['idle_in_transaction_session_timeout'] ?? null;
        if ($driverIdleTimeout !== null) {
            if (filter_var($driverIdleTimeout, FILTER_VALIDATE_INT) === false || (int) $driverIdleTimeout < 100 || (int) $driverIdleTimeout > 60000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database idle timeout.");
            }
        }

        // 5. Inspect top-level aliases (such as those parsed from URL query parameters)
        // Reject non-integer, unbounded, or contradictory overrides
        if (isset($effectiveConn['connect_timeout'])) {
            $aliasConnect = $effectiveConn['connect_timeout'];
            if (filter_var($aliasConnect, FILTER_VALIDATE_INT) === false || (int) $aliasConnect < 1 || (int) $aliasConnect > 5) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database connect timeout.");
            }
            if ($driverConnectTimeout !== null && (int) $aliasConnect !== (int) $driverConnectTimeout) {
                throw new \RuntimeException("Configuration error: Contradictory database connect timeout configuration.");
            }
        }

        if (isset($effectiveConn['statement_timeout'])) {
            $aliasStatement = $effectiveConn['statement_timeout'];
            if (filter_var($aliasStatement, FILTER_VALIDATE_INT) === false || (int) $aliasStatement < 100 || (int) $aliasStatement > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database statement timeout.");
            }
            if ($driverStatementTimeout !== null && (int) $aliasStatement !== (int) $driverStatementTimeout) {
                throw new \RuntimeException("Configuration error: Contradictory database statement timeout configuration.");
            }
        }

        if (isset($effectiveConn['lock_timeout'])) {
            $aliasLock = $effectiveConn['lock_timeout'];
            if (filter_var($aliasLock, FILTER_VALIDATE_INT) === false || (int) $aliasLock < 100 || (int) $aliasLock > 5000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database lock timeout.");
            }
            if ($driverLockTimeout !== null && (int) $aliasLock !== (int) $driverLockTimeout) {
                throw new \RuntimeException("Configuration error: Contradictory database lock timeout configuration.");
            }
        }

        if (isset($effectiveConn['idle_in_transaction_session_timeout'])) {
            $aliasIdle = $effectiveConn['idle_in_transaction_session_timeout'];
            if (filter_var($aliasIdle, FILTER_VALIDATE_INT) === false || (int) $aliasIdle < 100 || (int) $aliasIdle > 60000) {
                throw new \RuntimeException("Configuration error: Invalid or unbounded database idle timeout.");
            }
            if ($driverIdleTimeout !== null && (int) $aliasIdle !== (int) $driverIdleTimeout) {
                throw new \RuntimeException("Configuration error: Contradictory database idle timeout configuration.");
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
