<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Enforces strict non-destructive isolation invariants on canary configuration.
 *
 * Implements:
 * - Exact allowlisted regexes and bounded lengths for SQL identifiers.
 * - Non-coercive grammar and type checks on DSN parameters (host, port, user, db).
 * - Exact disposable database binding and explicit owner consent token.
 * - Total rejection of backticks, semicolons, newlines, quotes, or dangerous tokens.
 * - Permanent prohibition of DROP DATABASE.
 */
class ConfigValidator
{
    /**
     * Strict regex for safe MySQL table prefix.
     * Must start with 'canary_h0_tmp_', contain ONLY alphanumeric and underscores,
     * and be length-bounded (14 to 32 characters total).
     */
    public const TABLE_PREFIX_REGEX = '/^canary_h0_tmp_[a-zA-Z0-9_]{0,18}$/';

    /**
     * Strict regex for safe MySQL identifier (database name, username).
     */
    public const DB_NAME_REGEX = '/^[a-zA-Z0-9_]{3,64}$/';
    public const DB_USER_REGEX = '/^[a-zA-Z0-9_]{1,32}$/';
    public const DB_HOST_REGEX = '/^[a-zA-Z0-9][a-zA-Z0-9.\-_]{0,253}$/';

    /**
     * Forbidden production database indicators (case-insensitive).
     */
    private const FORBIDDEN_PROD_PATTERN = '/(gazaairport|gaza_gateway|gazagateway|production|prod|live|main|master)/i';

    /**
     * Required disposable naming convention regex.
     * Database name MUST explicitly start or end with a disposable marker.
     */
    private const REQUIRED_DISPOSABLE_PATTERN = '/^(test_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+_test|[a-zA-Z0-9_]+_canary|[a-zA-Z0-9_]+_disposable)$/i';

    /**
     * Validate the entire canary configuration array.
     *
     * @param array<string, mixed> $config
     * @param bool $requireDb
     * @throws SecurityException
     * @throws DatabaseGuardException
     */
    public static function validate(array $config, bool $requireDb = true): void
    {
        // 1. Explicit owner authorization flag
        if (!isset($config['CANARY_EXECUTION_AUTHORIZED']) || $config['CANARY_EXECUTION_AUTHORIZED'] !== true) {
            throw new SecurityException(
                "Execution refused: 'CANARY_EXECUTION_AUTHORIZED' must be set to boolean true to authorize canary run."
            );
        }

        // 2. Table prefix safety: strict allowlisted regex and bounded length
        $prefix = (string)($config['CANARY_TABLE_PREFIX'] ?? 'canary_h0_tmp_');
        self::validateTablePrefix($prefix);

        // 3. Database validation (if database testing is enabled)
        if ($requireDb) {
            self::validateDatabaseConfig($config);
        }

        // 4. Forbidden DROP DATABASE command
        if (!empty($config['CLEANUP_DROP_DATABASE'])) {
            throw new DatabaseGuardException(
                "SAFETY REFUSAL: 'CLEANUP_DROP_DATABASE' is strictly prohibited. The canary only cleans up tables starting with 'canary_h0_tmp_'."
            );
        }

        // 5. Outbound SMTP sending guard
        if (!empty($config['SMTP_ALLOW_SEND']) && ($config['SMTP_ALLOW_SEND'] === true)) {
            $ownerAuth = $config['OWNER_AUTHORIZED_EXTERNAL_SEND'] ?? false;
            $recipient = $config['SMTP_AUTHORIZED_RECIPIENT'] ?? '';
            if ($ownerAuth !== true || empty($recipient)) {
                throw new SecurityException(
                    "SAFETY REFUSAL: Outbound SMTP message sending requires explicit OWNER_AUTHORIZED_EXTERNAL_SEND=true "
                    . "and a designated SMTP_AUTHORIZED_RECIPIENT address. Socket inspection only is permitted."
                );
            }
        }
    }

    /**
     * Validate table prefix identifier strictly.
     *
     * @throws SecurityException
     */
    public static function validateTablePrefix(string $prefix): void
    {
        if (strlen($prefix) < 14 || strlen($prefix) > 32) {
            throw new SecurityException(
                sprintf("Table prefix '%s' length must be between 14 and 32 characters.", $prefix)
            );
        }

        if (!preg_match(self::TABLE_PREFIX_REGEX, $prefix)) {
            throw new SecurityException(
                sprintf(
                    "SAFETY REFUSAL: Table prefix '%s' is invalid. "
                    . "Must strictly start with 'canary_h0_tmp_' and contain only alphanumeric characters and underscores [a-zA-Z0-9_]. "
                    . "No backticks, quotes, semicolons, newlines, or spaces are allowed.",
                    $prefix
                )
            );
        }
    }

    /**
     * Validate database name and connection parameters.
     *
     * @param array<string, mixed> $config
     * @throws DatabaseGuardException
     * @throws SecurityException
     */
    public static function validateDatabaseConfig(array $config): void
    {
        // Validate host
        $host = $config['CANARY_DB_HOST'] ?? '127.0.0.1';
        if (!is_string($host) || !preg_match(self::DB_HOST_REGEX, $host)) {
            throw new SecurityException(
                sprintf("Invalid database host format: '%s'. Host must be a valid hostname or IP without special characters.", (string)$host)
            );
        }

        // Validate port
        $port = $config['CANARY_DB_PORT'] ?? 3306;
        if (!is_int($port) && (!is_string($port) || !ctype_digit($port))) {
            throw new SecurityException("Database port must be an integer between 1 and 65535.");
        }
        $portInt = (int)$port;
        if ($portInt < 1 || $portInt > 65535) {
            throw new SecurityException(sprintf("Database port out of range: %d.", $portInt));
        }

        // Validate user
        if (isset($config['CANARY_DB_USER'])) {
            $user = (string)$config['CANARY_DB_USER'];
            if ($user !== '' && !preg_match(self::DB_USER_REGEX, $user)) {
                throw new SecurityException(
                    sprintf("Invalid database user '%s'. Must be alphanumeric and underscore only, max 32 chars.", $user)
                );
            }
        }

        // Validate database name grammar and bounds
        if (!isset($config['CANARY_DATABASE']) || !is_string($config['CANARY_DATABASE'])) {
            throw new DatabaseGuardException(
                "Execution refused: 'CANARY_DATABASE' must be a non-empty string."
            );
        }

        $dbName = trim($config['CANARY_DATABASE']);

        if (!preg_match(self::DB_NAME_REGEX, $dbName)) {
            throw new DatabaseGuardException(
                sprintf(
                    "Invalid database name '%s'. Must be 3-64 alphanumeric/underscore characters without spaces or special tokens.",
                    $dbName
                )
            );
        }

        // Check against production patterns
        if (preg_match(self::FORBIDDEN_PROD_PATTERN, $dbName)) {
            throw new DatabaseGuardException(
                sprintf(
                    "SAFETY REFUSAL: Target database '%s' matches forbidden production keyword. "
                    . "The canary will NEVER run against production databases.",
                    $dbName
                )
            );
        }

        // Check for required disposable pattern
        if (!preg_match(self::REQUIRED_DISPOSABLE_PATTERN, $dbName)) {
            throw new DatabaseGuardException(
                sprintf(
                    "SAFETY REFUSAL: Database name '%s' lacks required disposable naming pattern. "
                    . "Must start with 'test_' or end with '_test', '_canary', or '_disposable'.",
                    $dbName
                )
            );
        }

        // Exact disposable DB binding consent check:
        // Owner must explicitly confirm the target disposable database name to prevent accidental execution
        $confirmedDb = (string)($config['CONFIRMED_DISPOSABLE_DATABASE_NAME'] ?? '');
        if ($confirmedDb === '' || $confirmedDb !== $dbName) {
            throw new DatabaseGuardException(
                sprintf(
                    "SAFETY REFUSAL: Owner consent mismatch. "
                    . "'CONFIRMED_DISPOSABLE_DATABASE_NAME' ('%s') must exactly match 'CANARY_DATABASE' ('%s').",
                    $confirmedDb,
                    $dbName
                )
            );
        }
    }
}
