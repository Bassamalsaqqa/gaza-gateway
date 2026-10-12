<?php

declare(strict_types=1);

namespace HostPapaCanary;

use PDO;
use PDOException;

/**
 * Probes MySQL 8.4 / InnoDB database capabilities on an explicitly designated
 * disposable test database using unique isolated prefixed tables.
 *
 * Checks:
 * - MySQL version and InnoDB storage engine
 * - utf8mb4 collation and character set
 * - DDL (CREATE, ALTER, DROP on canary-prefixed tables only)
 * - CHECK constraints enforcement (verifies non-ignoring behaviour)
 * - Foreign Keys with CASCADE and RESTRICT
 * - JSON column storage and native functions (JSON_EXTRACT, JSON_UNQUOTE, JSON_CONTAINS)
 * - Fractional seconds timestamps (DATETIME(6)) and UTC consistency
 * - Triggers (INSERT trigger on isolated table)
 * - Concurrency: True multi-connection row locking (SELECT ... FOR UPDATE)
 * - Concurrency: SKIP LOCKED tested across independent second connection
 * - Finite lock wait timeout tested across independent connection
 * - Transactional rollback (verifies atomicity)
 * - Scoped non-destructive cleanup (rolls back open transactions, drops only canary_h0_tmp_* tables, failure fails receipt)
 */
class DatabaseProber
{
    private array $config;
    private Sanitizer $sanitizer;
    private string $tablePrefix;
    private ?PDO $pdo = null;
    private ?PDO $pdo2 = null;

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(array $config, Sanitizer $sanitizer)
    {
        $this->config = $config;
        $this->sanitizer = $sanitizer;

        $runSuffix = date('YmdHis') . '_' . substr(bin2hex(random_bytes(3)), 0, 6);
        $this->tablePrefix = 'canary_h0_tmp_' . $runSuffix . '_';
    }

    /**
     * Run all MySQL capability probes.
     *
     * @return array<string, mixed>
     * @throws DatabaseGuardException
     * @throws SecurityException
     */
    public function probe(): array
    {
        // Enforce database configuration safety
        ConfigValidator::validateDatabaseConfig($this->config);

        $results = [
            'probe' => 'mysql_capabilities',
            'overall_status' => 'PENDING',
            'database_target' => $this->config['CANARY_DATABASE'],
            'table_prefix' => $this->tablePrefix,
            'checks' => [],
            'resource_quotas' => [
                'statement_timeout_status' => 'UNTESTED_HOST_LEVEL',
                'cpu_lve_quota_status' => 'UNTESTED_HOST_LEVEL',
                'notes' => 'Host statement/CPU quotas (e.g. CloudLinux LVE limits) are untested and require owner host benchmarking.',
            ],
            'cleanup' => 'NOT_RUN',
        ];

        try {
            $this->pdo = $this->createConnection();
            $results['checks']['connection'] = ['status' => 'PASS', 'details' => 'Connected via pdo_mysql'];

            $versionInfo = $this->probeVersionAndEngine();
            $results['checks']['version_and_engine'] = $versionInfo;

            $ddlInfo = $this->probeDdlAndCollation();
            $results['checks']['ddl_utf8mb4'] = $ddlInfo;

            $checkInfo = $this->probeCheckConstraints();
            $results['checks']['check_constraints_enforced'] = $checkInfo;

            $fkInfo = $this->probeForeignKeys();
            $results['checks']['foreign_keys_cascade_restrict'] = $fkInfo;

            $jsonInfo = $this->probeJsonCapabilities();
            $results['checks']['json_functions'] = $jsonInfo;

            $timestampInfo = $this->probeTimestampPrecision();
            $results['checks']['fractional_timestamps'] = $timestampInfo;

            $triggerInfo = $this->probeTriggers();
            $results['checks']['triggers'] = $triggerInfo;

            // Probe concurrency using a second independent connection
            $lockInfo = $this->probeMultiConnectionConcurrency();
            $results['checks']['multi_connection_concurrency'] = $lockInfo;

            $rollbackInfo = $this->probeTransactionalRollback();
            $results['checks']['transactional_rollback'] = $rollbackInfo;

            // Determine overall status
            $allPassed = true;
            foreach ($results['checks'] as $check) {
                if (($check['status'] ?? '') !== 'PASS') {
                    $allPassed = false;
                    break;
                }
            }
            $results['overall_status'] = $allPassed ? 'PASS' : 'FAIL';

        } catch (\Throwable $e) {
            $results['overall_status'] = 'FAIL';
            $results['error'] = $this->sanitizer->sanitizeString($e->getMessage());
        } finally {
            // Perform scoped cleanup; any failure marks receipt as FAIL
            $cleanupResult = $this->scopedCleanup();
            $results['cleanup'] = $cleanupResult;
            if (($cleanupResult['status'] ?? '') !== 'PASS') {
                $results['overall_status'] = 'FAIL';
            }
            $this->disconnect();
        }

        return $results;
    }

    /**
     * Create an independent PDO connection to the designated disposable test database.
     */
    private function createConnection(): PDO
    {
        $host = (string)($this->config['CANARY_DB_HOST'] ?? '127.0.0.1');
        $port = (int)($this->config['CANARY_DB_PORT'] ?? 3306);
        $dbName = (string)$this->config['CANARY_DATABASE'];
        $user = (string)($this->config['CANARY_DB_USER'] ?? '');
        $pass = (string)($this->config['CANARY_DB_PASS'] ?? '');

        $this->sanitizer->addSecret($pass);
        $this->sanitizer->addSecret($user);

        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);

        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 5,
        ]);

        // Safety verification: Confirm connected database matches expected disposable database
        $stmt = $pdo->query('SELECT DATABASE() as current_db');
        $currentDb = (string)($stmt->fetch()['current_db'] ?? '');
        if (strtolower($currentDb) !== strtolower($dbName)) {
            throw new DatabaseGuardException(
                sprintf("Connected database '%s' does not match configured target '%s'.", $currentDb, $dbName)
            );
        }

        return $pdo;
    }

    private function disconnect(): void
    {
        $this->pdo2 = null;
        $this->pdo = null;
    }

    /**
     * Probe MySQL version and default storage engine.
     *
     * @return array<string, mixed>
     */
    private function probeVersionAndEngine(): array
    {
        $stmt = $this->pdo->query('SELECT VERSION() as v');
        $version = (string)($stmt->fetch()['v'] ?? 'unknown');

        $stmt = $this->pdo->query("SHOW VARIABLES LIKE 'default_storage_engine'");
        $engineRow = $stmt->fetch();
        $defaultEngine = (string)($engineRow['Value'] ?? 'unknown');

        $is84Plus = version_compare($version, '8.4.0', '>=');
        $is80Plus = version_compare($version, '8.0.0', '>=');

        return [
            'status' => $is80Plus ? 'PASS' : 'WARNING_BELOW_80',
            'version' => $version,
            'is_mysql_84' => $is84Plus,
            'is_mysql_80_or_higher' => $is80Plus,
            'default_storage_engine' => $defaultEngine,
            'notes' => $is84Plus ? 'MySQL 8.4+ verified' : ($is80Plus ? 'MySQL 8.0+ verified (target is 8.4)' : 'Below MySQL 8.0'),
        ];
    }

    /**
     * Probe DDL creation with InnoDB and utf8mb4.
     *
     * @return array<string, mixed>
     */
    private function probeDdlAndCollation(): array
    {
        $table = $this->tablePrefix . 'parent';

        $sql = "CREATE TABLE `{$table}` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `uuid` CHAR(36) NOT NULL,
            `reference_code` VARCHAR(64) NOT NULL,
            `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
            `metadata` JSON NULL,
            `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_uuid` (`uuid`),
            UNIQUE KEY `uniq_ref` (`reference_code`),
            CONSTRAINT `chk_status` CHECK (`status` IN ('draft', 'confirmed', 'cancelled'))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

        $this->pdo->exec($sql);

        // Verify table status
        $stmt = $this->pdo->prepare("SELECT ENGINE AS Engine, TABLE_COLLATION AS Collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tbl");
        $stmt->execute(['tbl' => $table]);
        $status = $stmt->fetch();

        $engine = (string)($status['Engine'] ?? '');
        $collation = (string)($status['Collation'] ?? '');

        $pass = (strcasecmp($engine, 'InnoDB') === 0) && (str_contains($collation, 'utf8mb4'));

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'table_created' => $table,
            'engine' => $engine,
            'collation' => $collation,
        ];
    }

    /**
     * Probe CHECK constraint enforcement (MySQL 8.0.16+ enforces CHECK; older versions ignore).
     *
     * @return array<string, mixed>
     */
    private function probeCheckConstraints(): array
    {
        $table = $this->tablePrefix . 'parent';

        // 1. Insert valid row (status='draft')
        $stmt = $this->pdo->prepare(
            "INSERT INTO `{$table}` (`uuid`, `reference_code`, `status`) VALUES (:u, :r, :s)"
        );
        $stmt->execute([
            'u' => '11111111-1111-4111-8111-111111111111',
            'r' => 'GZA-VALID-01',
            's' => 'draft',
        ]);

        // 2. Attempt to insert invalid row violating CHECK constraint
        $checkViolated = false;
        try {
            $stmt->execute([
                'u' => '22222222-2222-4222-8222-222222222222',
                'r' => 'GZA-INVALID-01',
                's' => 'illegal_status_not_in_check',
            ]);
        } catch (PDOException $e) {
            $checkViolated = true;
        }

        return [
            'status' => $checkViolated ? 'PASS' : 'FAIL',
            'check_enforced' => $checkViolated,
            'notes' => $checkViolated
                ? 'CHECK constraint violation prevented invalid insert.'
                : 'CHECK constraint was NOT enforced by server (silent data corruption risk).',
        ];
    }

    /**
     * Probe Foreign Keys with CASCADE and RESTRICT.
     *
     * @return array<string, mixed>
     */
    private function probeForeignKeys(): array
    {
        $parentTable = $this->tablePrefix . 'parent';
        $childTable = $this->tablePrefix . 'child';

        $sql = "CREATE TABLE `{$childTable}` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `parent_id` BIGINT UNSIGNED NOT NULL,
            `seat_number` VARCHAR(10) NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_parent_seat` (`parent_id`, `seat_number`),
            CONSTRAINT `fk_child_parent` FOREIGN KEY (`parent_id`) REFERENCES `{$parentTable}` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

        $this->pdo->exec($sql);

        // Fetch parent id
        $stmt = $this->pdo->query("SELECT `id` FROM `{$parentTable}` WHERE `reference_code` = 'GZA-VALID-01'");
        $parentId = (int)($stmt->fetch()['id'] ?? 0);

        // Insert valid child
        $stmt = $this->pdo->prepare("INSERT INTO `{$childTable}` (`parent_id`, `seat_number`) VALUES (:p, :s)");
        $stmt->execute(['p' => $parentId, 's' => '12A']);

        // Test FK RESTRICT on non-existent parent
        $restrictViolated = false;
        try {
            $stmt->execute(['p' => 99999999, 's' => '12B']);
        } catch (PDOException $e) {
            $restrictViolated = true;
        }

        // Test ON DELETE CASCADE
        $this->pdo->exec("DELETE FROM `{$parentTable}` WHERE `id` = {$parentId}");
        $stmt = $this->pdo->query("SELECT COUNT(*) as c FROM `{$childTable}` WHERE `parent_id` = {$parentId}");
        $childRemaining = (int)($stmt->fetch()['c'] ?? 1);
        $cascadeWorked = ($childRemaining === 0);

        $pass = $restrictViolated && $cascadeWorked;

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'restrict_enforced' => $restrictViolated,
            'cascade_enforced' => $cascadeWorked,
        ];
    }

    /**
     * Probe JSON columns, JSON_EXTRACT, JSON_UNQUOTE, and JSON_CONTAINS.
     *
     * @return array<string, mixed>
     */
    private function probeJsonCapabilities(): array
    {
        $table = $this->tablePrefix . 'parent';

        $testJson = json_encode([
            'seat' => '14C',
            'meal' => 'olive_bread',
            'tags' => ['window', 'quiet'],
        ], JSON_THROW_ON_ERROR);

        $stmt = $this->pdo->prepare(
            "INSERT INTO `{$table}` (`uuid`, `reference_code`, `status`, `metadata`) VALUES (:u, :r, :s, :m)"
        );
        $stmt->execute([
            'u' => '33333333-3333-4333-8333-333333333333',
            'r' => 'GZA-JSON-01',
            's' => 'confirmed',
            'm' => $testJson,
        ]);

        $query = "SELECT
            JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.seat')) as extracted_seat,
            JSON_CONTAINS(`metadata`, '\"quiet\"', '$.tags') as contains_tag
            FROM `{$table}` WHERE `reference_code` = 'GZA-JSON-01'";

        $stmt = $this->pdo->query($query);
        $row = $stmt->fetch();

        $seat = (string)($row['extracted_seat'] ?? '');
        $hasTag = (int)($row['contains_tag'] ?? 0);

        $pass = ($seat === '14C') && ($hasTag === 1);

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'extracted_value' => $seat,
            'json_contains_verified' => ($hasTag === 1),
        ];
    }

    /**
     * Probe timestamp precision with microseconds (DATETIME(6)) and UTC.
     *
     * @return array<string, mixed>
     */
    private function probeTimestampPrecision(): array
    {
        $table = $this->tablePrefix . 'parent';

        $stmt = $this->pdo->query(
            "SELECT `created_at`, UTC_TIMESTAMP(6) as utc_micro FROM `{$table}` WHERE `reference_code` = 'GZA-JSON-01'"
        );
        $row = $stmt->fetch();

        $createdAt = (string)($row['created_at'] ?? '');
        $utcMicro = (string)($row['utc_micro'] ?? '');

        $hasFractionalCreated = (bool)preg_match('/\.\d{3,6}$/', $createdAt);
        $hasFractionalUtc = (bool)preg_match('/\.\d{3,6}$/', $utcMicro);

        $pass = $hasFractionalCreated && $hasFractionalUtc;

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'created_at_sample' => $createdAt,
            'utc_timestamp_sample' => $utcMicro,
            'fractional_precision_verified' => $pass,
        ];
    }

    /**
     * Probe trigger creation and execution.
     *
     * @return array<string, mixed>
     */
    private function probeTriggers(): array
    {
        $parentTable = $this->tablePrefix . 'parent';
        $auditTable = $this->tablePrefix . 'audit';
        $triggerName = $this->tablePrefix . 'trg_insert';

        // Create audit table
        $sql = "CREATE TABLE `{$auditTable}` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `parent_id` BIGINT UNSIGNED NOT NULL,
            `action` VARCHAR(32) NOT NULL,
            `logged_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        $this->pdo->exec($sql);

        // Create trigger
        $triggerSql = "CREATE TRIGGER `{$triggerName}`
            AFTER INSERT ON `{$parentTable}`
            FOR EACH ROW
            BEGIN
                INSERT INTO `{$auditTable}` (`parent_id`, `action`) VALUES (NEW.id, 'CANARY_TRIGGER_FIRED');
            END;";
        $this->pdo->exec($triggerSql);

        // Insert new parent to fire trigger
        $stmt = $this->pdo->prepare(
            "INSERT INTO `{$parentTable}` (`uuid`, `reference_code`, `status`) VALUES (:u, :r, :s)"
        );
        $stmt->execute([
            'u' => '44444444-4444-4444-8444-444444444444',
            'r' => 'GZA-TRIGGER-01',
            's' => 'draft',
        ]);
        $newParentId = (int)$this->pdo->lastInsertId();

        // Verify audit row was inserted by trigger
        $stmt = $this->pdo->prepare("SELECT `action` FROM `{$auditTable}` WHERE `parent_id` = :pid");
        $stmt->execute(['pid' => $newParentId]);
        $action = (string)($stmt->fetch()['action'] ?? '');

        $pass = ($action === 'CANARY_TRIGGER_FIRED');

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'trigger_created' => $triggerName,
            'trigger_fired' => $pass,
        ];
    }

    /**
     * Probe multi-connection concurrency:
     * - Uses a SECOND independent PDO connection.
     * - Proves that Connection 1's lock causes Connection 2 to timeout on finite wait.
     * - Proves that Connection 2's SKIP LOCKED skips the locked row and retrieves only unlocked rows.
     *
     * @return array<string, mixed>
     */
    private function probeMultiConnectionConcurrency(): array
    {
        $table = $this->tablePrefix . 'parent';

        // Insert 2 rows with status='draft'
        $stmt = $this->pdo->prepare("INSERT INTO `{$table}` (`uuid`, `reference_code`, `status`) VALUES (:u, :r, 'draft')");
        $stmt->execute(['u' => '66666666-6666-4666-8666-666666666666', 'r' => 'GZA-CONCURRENCY-01']);
        $row1Id = (int)$this->pdo->lastInsertId();

        $stmt->execute(['u' => '77777777-7777-4777-8777-777777777777', 'r' => 'GZA-CONCURRENCY-02']);
        $row2Id = (int)$this->pdo->lastInsertId();

        // Establish second independent connection
        $this->pdo2 = $this->createConnection();

        $timeoutWorked = false;
        $skipLockedWorked = false;

        try {
            // Connection 1: Begin transaction and acquire row lock on row 1
            $this->pdo->beginTransaction();
            $lockStmt = $this->pdo->prepare("SELECT * FROM `{$table}` WHERE `id` = :id FOR UPDATE");
            $lockStmt->execute(['id' => $row1Id]);
            $lockedRow = $lockStmt->fetch();

            // Connection 2: Set 1-second timeout and attempt to select row 1 FOR UPDATE
            // Must time out, proving real row lock contention across independent connections
            $this->pdo2->exec("SET SESSION innodb_lock_wait_timeout = 1;");
            try {
                $blockStmt = $this->pdo2->prepare("SELECT * FROM `{$table}` WHERE `id` = :id FOR UPDATE");
                $blockStmt->execute(['id' => $row1Id]);
                // If it reached here without timing out, lock contention failed
                $timeoutWorked = false;
            } catch (PDOException $e) {
                // SQLSTATE HY000 with error 1205: Lock wait timeout exceeded
                $timeoutWorked = true;
            }

            // Connection 2: Test SELECT ... FOR UPDATE SKIP LOCKED
            // Must skip locked row 1 and return ONLY row 2
            $skipStmt = $this->pdo2->prepare(
                "SELECT `id`, `reference_code` FROM `{$table}` WHERE `id` IN (:r1, :r2) ORDER BY `id` ASC FOR UPDATE SKIP LOCKED"
            );
            $skipStmt->execute(['r1' => $row1Id, 'r2' => $row2Id]);
            $skippedRows = $skipStmt->fetchAll();

            if (count($skippedRows) === 1 && (int)$skippedRows[0]['id'] === $row2Id) {
                $skipLockedWorked = true;
            }

            // Connection 1 releases lock
            $this->pdo->rollBack();

            $pass = $timeoutWorked && $skipLockedWorked;

            return [
                'status' => $pass ? 'PASS' : 'FAIL',
                'multi_connection_verified' => true,
                'lock_timeout_exceeded_verified' => $timeoutWorked,
                'skip_locked_concurrent_skip_verified' => $skipLockedWorked,
                'notes' => $pass
                    ? 'True independent multi-connection concurrency verified (finite timeout + SKIP LOCKED).'
                    : 'Concurrency test failed: either lock timeout did not fire or SKIP LOCKED failed to skip locked row.',
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return [
                'status' => 'FAIL',
                'error' => $this->sanitizer->sanitizeString($e->getMessage()),
            ];
        } finally {
            $this->pdo2 = null;
        }
    }

    /**
     * Probe transactional rollback functionality.
     *
     * @return array<string, mixed>
     */
    private function probeTransactionalRollback(): array
    {
        $table = $this->tablePrefix . 'parent';

        $this->pdo->beginTransaction();
        $stmt = $this->pdo->prepare(
            "INSERT INTO `{$table}` (`uuid`, `reference_code`, `status`) VALUES (:u, :r, :s)"
        );
        $stmt->execute([
            'u' => '55555555-5555-4555-8555-555555555555',
            'r' => 'GZA-ROLLBACK-01',
            's' => 'draft',
        ]);
        $this->pdo->rollBack();

        // Verify the row does not exist
        $stmt = $this->pdo->query("SELECT COUNT(*) as c FROM `{$table}` WHERE `reference_code` = 'GZA-ROLLBACK-01'");
        $count = (int)($stmt->fetch()['c'] ?? 1);

        $pass = ($count === 0);

        return [
            'status' => $pass ? 'PASS' : 'FAIL',
            'rollback_effective' => $pass,
            'uncommitted_rows_retained' => $count,
        ];
    }

    /**
     * Perform strict, scoped cleanup of canary-prefixed tables only.
     * First rolls back any open transactions on all connections.
     * Drops each owned table individually; if even one fails, cleanup fails and receipt fails.
     * NEVER issues DROP DATABASE.
     *
     * @return array<string, mixed>
     */
    private function scopedCleanup(): array
    {
        $droppedTables = [];
        $failedTables = [];

        // 1. Explicitly roll back any open transactions on all active connections
        if ($this->pdo2 !== null) {
            try {
                if ($this->pdo2->inTransaction()) {
                    $this->pdo2->rollBack();
                }
            } catch (\Throwable) {
            }
        }

        if ($this->pdo !== null) {
            try {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
            } catch (\Throwable) {
            }
        }

        if ($this->pdo === null) {
            return ['status' => 'SKIPPED', 'reason' => 'No active PDO connection'];
        }

        try {
            // Find all tables matching the exact tablePrefix
            $stmt = $this->pdo->prepare("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LEFT(TABLE_NAME, :prefixLength) = :prefix");
            $stmt->execute(['prefixLength' => strlen($this->tablePrefix), 'prefix' => $this->tablePrefix]);
            $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);

            // Temporarily disable foreign key checks for clean table drops
            $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 0;');

            foreach ($tables as $tbl) {
                // Strict safety assertion: Table must start with 'canary_h0_tmp_' and contain safe characters only
                if (!preg_match('/^canary_h0_tmp_[a-zA-Z0-9_]+$/', $tbl)) {
                    continue;
                }

                try {
                    $this->pdo->exec("DROP TABLE IF EXISTS `{$tbl}`;");
                    $droppedTables[] = $tbl;
                } catch (\Throwable $e) {
                    $failedTables[$tbl] = $this->sanitizer->sanitizeString($e->getMessage());
                }
            }

            $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 1;');

            $cleanupPass = empty($failedTables);

            return [
                'status' => $cleanupPass ? 'PASS' : 'FAIL',
                'dropped_tables_count' => count($droppedTables),
                'dropped_tables' => $droppedTables,
                'failures' => $failedTables,
                'notes' => $cleanupPass
                    ? 'All owned canary tables dropped cleanly.'
                    : 'Cleanup failed for one or more tables; receipt marked FAIL.',
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'FAIL',
                'error' => $this->sanitizer->sanitizeString($e->getMessage()),
            ];
        }
    }
}
