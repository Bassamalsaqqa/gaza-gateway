<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDOException;
use Throwable;

final class DatabaseFailure
{
    public const ERR_DUP_ENTRY = 1062;
    public const ERR_LOCK_WAIT_TIMEOUT = 1205;
    public const ERR_LOCK_DEADLOCK = 1213;
    public const ERR_ROW_IS_REFERENCED_2 = 1451;
    public const ERR_NO_REFERENCED_ROW_2 = 1452;
    public const ERR_CHECK_CONSTRAINT_VIOLATED = 3819;

    public const SQLSTATE_DEADLOCK = '40001';
    public const SQLSTATE_INTEGRITY = '23000';

    /**
     * Determine if the exception is a duplicate key violation (MySQL 1062 or PG 23505).
     */
    public static function isDuplicate(Throwable $e): bool
    {
        if ($e instanceof QueryException) {
            $prev = $e->getPrevious();
            if ($prev instanceof PDOException && (int) ($prev->errorInfo[1] ?? 0) === self::ERR_DUP_ENTRY) {
                return true;
            }
            if ((int) ($e->errorInfo[1] ?? 0) === self::ERR_DUP_ENTRY) {
                return true;
            }
            if ((string) $e->getCode() === '23505') {
                return true;
            }
        }
        if ($e instanceof PDOException) {
            return (int) ($e->errorInfo[1] ?? 0) === self::ERR_DUP_ENTRY || (string) $e->getCode() === '23505';
        }
        return false;
    }

    /**
     * Determine if the exception is a check constraint violation (MySQL 3819 or PG 23514).
     */
    public static function isCheckViolation(Throwable $e): bool
    {
        if ($e instanceof QueryException) {
            $prev = $e->getPrevious();
            if ($prev instanceof PDOException && (int) ($prev->errorInfo[1] ?? 0) === self::ERR_CHECK_CONSTRAINT_VIOLATED) {
                return true;
            }
            if ((int) ($e->errorInfo[1] ?? 0) === self::ERR_CHECK_CONSTRAINT_VIOLATED) {
                return true;
            }
            if ((string) $e->getCode() === '23514') {
                return true;
            }
        }
        if ($e instanceof PDOException) {
            return (int) ($e->errorInfo[1] ?? 0) === self::ERR_CHECK_CONSTRAINT_VIOLATED || (string) $e->getCode() === '23514';
        }
        return false;
    }

    /**
     * Determine if the exception is a foreign key constraint violation (MySQL 1452/1451 or PG 23503).
     */
    public static function isForeignKeyViolation(Throwable $e): bool
    {
        if ($e instanceof QueryException) {
            $prev = $e->getPrevious();
            $errCode = (int) ($prev instanceof PDOException ? ($prev->errorInfo[1] ?? 0) : ($e->errorInfo[1] ?? 0));
            if (in_array($errCode, [self::ERR_NO_REFERENCED_ROW_2, self::ERR_ROW_IS_REFERENCED_2], true)) {
                return true;
            }
            if ((string) $e->getCode() === '23503') {
                return true;
            }
        }
        if ($e instanceof PDOException) {
            $errCode = (int) ($e->errorInfo[1] ?? 0);
            return in_array($errCode, [self::ERR_NO_REFERENCED_ROW_2, self::ERR_ROW_IS_REFERENCED_2], true) || (string) $e->getCode() === '23503';
        }
        return false;
    }

    /**
     * Determine if the exception represents a deadlock or lock wait timeout that can be retried.
     */
    public static function isDeadlockOrTimeout(Throwable $e): bool
    {
        if ($e instanceof QueryException || $e instanceof PDOException) {
            $errorInfo = $e->errorInfo ?? ($e->getPrevious() instanceof PDOException ? $e->getPrevious()->errorInfo : null);
            $errCode = (int) ($errorInfo[1] ?? 0);
            $sqlState = (string) $e->getCode();
            return in_array($errCode, [self::ERR_LOCK_DEADLOCK, self::ERR_LOCK_WAIT_TIMEOUT], true)
                || in_array($sqlState, [self::SQLSTATE_DEADLOCK, '40P01'], true);
        }
        return false;
    }

    /**
     * Run a database-only transactional callback with bounded retry on deadlock / lock timeout.
     * Note: Lock wait timeout (1205) rolls back before retry.
     * Never perform external SMTP or network I/O inside this callback.
     *
     * @template T
     * @param callable(): T $callback
     * @param int $maxAttempts
     * @param ?string $connection
     * @return T
     */
    public static function runWithRetry(callable $callback, int $maxAttempts = 3, ?string $connection = null): mixed
    {
        $maxAttempts = max(1, min(3, $maxAttempts));
        $conn = DB::connection($connection);
        if ($conn->transactionLevel() > 0) {
            // Owned transaction retry cannot retry caller-owned outer transactions
            return $callback();
        }

        $attempts = 0;

        while (true) {
            $attempts++;
            try {
                return $conn->transaction($callback);
            } catch (Throwable $e) {
                if (self::isDeadlockOrTimeout($e) && $attempts < $maxAttempts) {
                    usleep((int) (pow(2, $attempts) * 5000 + random_int(1000, 5000)));
                    continue;
                }
                throw $e;
            }
        }
    }

    /**
     * Apply bounded statement and lock wait timeouts to the active connection.
     * Uses SET LOCAL on PostgreSQL and SET SESSION variables on MySQL.
     */
    public static function applyTimeouts(\Illuminate\Database\ConnectionInterface $tx, int $statementTimeoutMs = 3000, int $lockTimeoutMs = 3000): void
    {
        if ($tx->getDriverName() === 'pgsql') {
            $tx->statement("SET LOCAL statement_timeout = '{$statementTimeoutMs}ms'");
            $tx->statement("SET LOCAL lock_timeout = '{$lockTimeoutMs}ms'");
        } elseif ($tx->getDriverName() === 'mysql') {
            $lockSec = max(1, (int) ceil($lockTimeoutMs / 1000));
            $tx->statement("SET SESSION innodb_lock_wait_timeout = {$lockSec}");
            if ($statementTimeoutMs > 0) {
                $tx->statement("SET SESSION max_execution_time = {$statementTimeoutMs}");
            }
        }
    }
}
