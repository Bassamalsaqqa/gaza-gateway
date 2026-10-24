<?php
declare(strict_types=1);

// Owner-invoked, private CLI upgrade runner for HostPapa production.
// Reuses the existing verified installer with an inherited lock.
// Never upload into public_html. No credentials or secrets in this file.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
ini_set('display_errors', '0');
umask(0077);

$isLocalTest = (bool)getenv('HOSTPAPA_LOCAL_TEST_ROOT');
if ($isLocalTest) {
    $home = (string)getenv('HOSTPAPA_LOCAL_TEST_ROOT');
    if (!is_dir($home)) throw new RuntimeException('Local synthetic root does not exist.');
} else {
    $envHome = getenv('HOME');
    if (!$envHome || !is_dir($envHome)) throw new RuntimeException('Private HOME is required.');
    if ($envHome !== '/home/gaza5045') throw new RuntimeException('Production requires HOME to be /home/gaza5045.');
    $home = '/home/gaza5045';
}
$home = rtrim($home, '/\\');

$kitRoot = $home . '/gaza-upgrade-package';
$appRoot = $home . '/gaza-gateway';
$webroot = $home . '/public_html';
$livePackageRoot = $home . '/gaza-live-package';

// Hard-pinned installed baseline (from 7a8f0fa clean deployment)
const INSTALLED_SOURCE_SHA = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
const INSTALLED_RELEASE_ID = 'rel_20261013T082656_7a8f0fa_clean';
const INSTALLED_MANIFEST_SHA = 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf';
const INSTALLED_MIGRATIONS = 19;

const TARGET_MIGRATIONS = 21;
const EXPECTED_DB_NAME = 'gaza5045_gateway_live';
const EXPECTED_DDL_USER = 'gaza5045_liveadmin';
const EXPECTED_RUNTIME_USER = 'gaza5045_liveruntime';

const ALLOWED_REASON_CODES = [
    'BASELINE_POINTER_MISMATCH',
    'BASELINE_MIGRATION_INVENTORY_COUNT_MISMATCH',
    'LEDGER_IDENTITIES_MISMATCH',
    'INITIAL_COUNT_MISMATCH',
    'TARGET_SOURCE_MISMATCH',
    'TARGET_MANIFEST_MISMATCH',
    'TARGET_INVENTORY_MISMATCH',
    'TARGET_SCHEMA_MISMATCH',
    'TARGET_MAINTENANCE_ACTIVE',
    'DATABASE_QUERY_FAILURE',
    'DEADLINE_EXCEEDED',
    'DEADLINE_UNAVAILABLE',
    'UNEXPECTED_ERROR',
];

class UpgradeDiagnosticException extends RuntimeException {
    public function __construct(
        private readonly string $reasonCode,
        ?Throwable $previous = null,
    ) {
        parent::__construct($reasonCode, 0, $previous);
    }

    public function getReasonCode(): string {
        return $this->reasonCode;
    }
}


function safePath(string $path, string $home): void {
    if (($path !== $home && !str_starts_with($path, $home . '/')) || preg_match('#[\\\\\x00-\x1f]|(?:^|/)\.{1,2}(?:/|$)#', $path)) {
        throw new RuntimeException('Unsafe path rejected.');
    }
    for ($cursor = $path; $cursor !== '/' && $cursor !== ''; $cursor = dirname($cursor)) {
        if (is_link($cursor)) throw new RuntimeException('Symlink path rejected.');
    }
}

function privatePath(string $path, string $home): void {
    safePath($path, $home);
    if (preg_match('#/(?:public_html|public)(?:/|$)#i', $path)) {
        throw new RuntimeException('Private path inside webroot rejected.');
    }
}

function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'DOH', 'DXB', 'IST', 'JED', 'RUH'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        if (!in_array($row['code'], $codes, true) || (int)$row['block_minutes'] > 600) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}

function beginRollbackReferenceBarrier(PDO $pdo): void {
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 10');
    $pdo->beginTransaction();
    // Same order as the cross-domain schedule mutation coordinator.
    foreach ([
        ['reference_revision_control', 'fleet'],
        ['network_revision_control', 'network'],
        ['schedule_revision_control', 'schedules'],
    ] as [$table, $domain]) {
        $statement = $pdo->prepare("SELECT domain FROM {$table} WHERE domain = ? FOR UPDATE");
        $statement->execute([$domain]);
        if ($statement->fetch(PDO::FETCH_ASSOC) === false) {
            throw new RuntimeException('Missing rollback reference control sentinel.');
        }
    }
}

function assertRollbackMigrationLedger(PDO $pdo, array $expected): void {
    $actual = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
    sort($actual, SORT_STRING);
    sort($expected, SORT_STRING);
    if ($actual !== $expected) {
        throw new RuntimeException('Rollback requires the exact candidate migration ledger.');
    }
}

function tableExists(PDO $pdo, string $table): bool {
    if (!preg_match('/^[A-Za-z0-9_]+$/D', $table)) return false;
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        return (bool)$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='$table'")->fetchColumn();
    }
    return (bool)$pdo->query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$table'")->fetchColumn();
}

function getTableColumns(PDO $pdo, string $table): array {
    if (!preg_match('/^[A-Za-z0-9_]+$/D', $table)) throw new RuntimeException('Invalid table name.');
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        $colRows = $pdo->query("PRAGMA table_info(`$table`)")->fetchAll(PDO::FETCH_ASSOC);
        $cols = [];
        foreach ($colRows as $c) {
            $cols[] = (string)$c['name'];
        }
        return $cols;
    }
    $colRows = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
    $cols = [];
    foreach ($colRows as $col) {
        $colName = (string)($col['Field'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_]+$/D', $colName)) throw new RuntimeException('Invalid column name.');
        $cols[] = $colName;
    }
    return $cols;
}

function captureBaselineProjections(PDO $pdo): array {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    } else {
        $tables = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
    }
    $tables = array_values(array_filter($tables, static fn(string $table): bool => !in_array($table, ['migrations', 'cache', 'cache_locks'], true)
        && !str_contains($table, 'heartbeat')));

    $projections = [];
    foreach ($tables as $table) {
        $projections[$table] = getTableColumns($pdo, $table);
    }
    return $projections;
}

function captureBaselineRowCounts(PDO $pdo, array $tables): array {
    $counts = [];
    foreach ($tables as $table) {
        if (!preg_match('/^[A-Za-z0-9_]+$/D', $table)) throw new RuntimeException('Invalid preservation table.');
        $counts[$table] = (int)$pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    }
    return $counts;
}

function preservationDigests(PDO $pdo, ?array $projections = null): array {
    // Preserve durable application records, including credentials/settings ciphertext,
    // without emitting them. Cache/lease/heartbeat bookkeeping is intentionally mutable.
    if ($projections === null) {
        $projections = captureBaselineProjections($pdo);
    }
    if (isset($projections[0]) && is_string($projections[0])) {
        $tableList = $projections;
        $projections = [];
        foreach ($tableList as $tbl) {
            $projections[$tbl] = getTableColumns($pdo, $tbl);
        }
    }
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $digests = [];
    foreach ($projections as $table => $columns) {
        if (!preg_match('/^[A-Za-z0-9_]+$/D', $table)) throw new RuntimeException('Invalid preservation table.');
        if ($driver === 'sqlite') {
            $colRows = $pdo->query("PRAGMA table_info(`$table`)")->fetchAll(PDO::FETCH_ASSOC);
            $pkCols = [];
            foreach ($colRows as $col) {
                if ((int)$col['pk'] > 0) {
                    $pkCols[(int)$col['pk']] = '`' . $col['name'] . '`';
                }
            }
            ksort($pkCols);
            $pkColumns = array_values($pkCols);
            if (!$pkColumns) throw new RuntimeException('Preservation table lacks deterministic primary-key ordering.');
        } else {
            $pk = $pdo->query("SHOW KEYS FROM `$table` WHERE Key_name='PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
            usort($pk, static fn(array $a, array $b): int => (int)$a['Seq_in_index'] <=> (int)$b['Seq_in_index']);
            if (!$pk) throw new RuntimeException('Preservation table lacks deterministic primary-key ordering.');
            $pkColumns = array_map(static function (array $row): string {
                if (!preg_match('/^[A-Za-z0-9_]+$/D', $row['Column_name'])) throw new RuntimeException('Invalid primary key.');
                return '`'.$row['Column_name'].'`';
            }, $pk);
        }
        $colSql = implode(', ', array_map(static fn(string $c): string => '`'.$c.'`', $columns));
        $rows = $pdo->query("SELECT $colSql FROM `$table` ORDER BY ".implode(',', $pkColumns));
        $hash = hash_init('sha256');
        while ($row = $rows->fetch(PDO::FETCH_ASSOC)) hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR)."\n");
        $digests[$table] = hash_final($hash);
    }
    return $digests;
}

function validateAdditiveMetadataDefaults(PDO $pdo): void {
    if (!tableExists($pdo, 'archive_contributions')) {
        return;
    }
    $cols = getTableColumns($pdo, 'archive_contributions');
    if (!in_array('chapter', $cols, true)) {
        return;
    }
    $invalidCount = (int)$pdo->query("
        SELECT COUNT(*) FROM archive_contributions
        WHERE chapter IS NOT NULL
           OR approximate_date IS NOT NULL
           OR location IS NOT NULL
           OR credit IS NOT NULL
           OR rights_status <> 'unknown'
           OR source_note IS NOT NULL
           OR reference_url IS NOT NULL
    ")->fetchColumn();

    if ($invalidCount > 0) {
        throw new RuntimeException("Preexisting archive_contributions rows have unexpected non-default metadata ({$invalidCount} invalid rows).");
    }
}

function validateNewAnalyticsTables(PDO $pdo): void {
    $emptyTables = ['analytics_sessions', 'analytics_events', 'analytics_monthly_reports'];
    foreach ($emptyTables as $table) {
        if (tableExists($pdo, $table)) {
            $cnt = (int)$pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
            if ($cnt !== 0) {
                throw new RuntimeException("Expected new analytics table {$table} to be empty, found {$cnt} rows.");
            }
        }
    }
    if (tableExists($pdo, 'analytics_report_settings')) {
        $cnt = (int)$pdo->query("SELECT COUNT(*) FROM `analytics_report_settings`")->fetchColumn();
        if ($cnt !== 1) {
            throw new RuntimeException("Expected analytics_report_settings to have exactly 1 default row, found {$cnt} rows.");
        }
        $row = $pdo->query("SELECT id, revision, enabled, recipient_email, updated_by FROM `analytics_report_settings` WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['id'] !== 1 || (int)$row['revision'] !== 1 || (int)$row['enabled'] !== 0 || (string)$row['recipient_email'] !== 'notifications@gazaairport.com' || (string)$row['updated_by'] !== '00000000-0000-0000-0000-000000000000') {
            throw new RuntimeException("Seeded analytics_report_settings row values do not match expected defaults.");
        }
    }
}

function privateInput(string $path, string $home, int $limit = 65536, bool $mutate = false): string {
    privatePath($path, $home);
    if (!is_file($path) || filesize($path) > $limit) throw new RuntimeException('Private file invalid.');
    if (DIRECTORY_SEPARATOR === '/') {
        $perms = fileperms($path) & 0777;
        if ($perms !== 0600) {
            if ($mutate) {
                if (!chmod($path, 0600)) throw new RuntimeException('Failed to set private file permissions.');
            } else {
                throw new RuntimeException('Private file permissions must be 0600.');
            }
        }
        if (function_exists('posix_geteuid') && fileowner($path) !== posix_geteuid()) {
            throw new RuntimeException('Private file ownership invalid.');
        }
    }
    $bytes = file_get_contents($path);
    if ($bytes === false) throw new RuntimeException('Private file read failed.');
    return $bytes;
}

function parseDotenv(string $content): array {
    $vars = [];
    $lines = preg_split('/\r\n|\r|\n/', $content);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!preg_match('/^([A-Za-z0-9_]+)\s*=\s*(.*)$/', $line, $m)) continue;
        $key = $m[1];
        $val = trim($m[2]);
        if (str_starts_with($val, '"') && str_ends_with($val, '"') && strlen($val) >= 2) {
            $val = substr($val, 1, -1);
            $val = strtr($val, ['\\n' => "\n", '\\r' => "\r", '\\"' => '"', '\\\\' => '\\']);
        } elseif (str_starts_with($val, "'") && str_ends_with($val, "'") && strlen($val) >= 2) {
            $val = substr($val, 1, -1);
        } else {
            $parts = explode('#', $val, 2);
            $val = trim($parts[0]);
        }
        $vars[$key] = $val;
    }
    return $vars;
}

function quoteCnf(string $val): string {
    return '"' . strtr($val, [
        '\\' => '\\\\',
        '"' => '\\"',
        "\n" => '\\n',
        "\r" => '\\r',
    ]) . '"';
}

function runBounded(array $args, int $seconds, bool $discardStdout = false, array $env = []): array {
    $procEnv = array_merge($_ENV, getenv(), $env);
    $process = proc_open($args, [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes, null, $procEnv);
    if (!is_resource($process)) throw new RuntimeException('Subprocess spawn failed.');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = ''; $err = ''; $exit = -1;
    $deadline = microtime(true) + $seconds;
    try {
        do {
            $chunk = stream_get_contents($pipes[1]);
            if ($chunk !== false && $chunk !== '') {
                if (!$discardStdout && strlen($out) < 65536) {
                    $out .= substr($chunk, 0, 65536 - strlen($out));
                }
            }
            $errChunk = stream_get_contents($pipes[2]);
            if ($errChunk !== false && $errChunk !== '') {
                if (strlen($err) < 16384) {
                    $err .= substr($errChunk, 0, 16384 - strlen($err));
                }
            }
            $status = proc_get_status($process);
            if (!$status['running']) {
                $exit = $status['exitcode'];
                break;
            }
            usleep(25000);
        } while (microtime(true) < $deadline);
    } finally {
        $status = proc_get_status($process);
        if ($status['running']) {
            proc_terminate($process, 9);
        }
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);
    }
    if ($exit !== 0) {
        throw new RuntimeException('Subprocess exited with nonzero code.');
    }
    return ['stdout' => $out, 'stderr' => $err];
}

function runBoundedDump(array $args, string $destFile, int $seconds): void {
    $outHandle = fopen($destFile, 'wb');
    if (!$outHandle) throw new RuntimeException('Failed to open dump destination file.');
    $process = proc_open($args, [
        0 => ['pipe', 'r'],
        1 => $outHandle,
        2 => ['pipe', 'w'],
    ], $pipes, null, array_merge($_ENV, getenv()));
    if (!is_resource($process)) {
        fclose($outHandle);
        throw new RuntimeException('mysqldump spawn failed.');
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[2], false);
    $err = ''; $exit = -1;
    $deadline = microtime(true) + $seconds;
    try {
        do {
            $chunk = stream_get_contents($pipes[2]);
            if ($chunk !== false && $chunk !== '') {
                if (strlen($err) < 16384) $err .= substr($chunk, 0, 16384 - strlen($err));
            }
            $status = proc_get_status($process);
            if (!$status['running']) {
                $exit = $status['exitcode'];
                break;
            }
            usleep(25000);
        } while (microtime(true) < $deadline);
    } finally {
        $status = proc_get_status($process);
        if ($status['running']) proc_terminate($process, 9);
        fclose($pipes[2]);
        fclose($outHandle);
        proc_close($process);
    }
    if ($exit !== 0) {
        throw new RuntimeException('mysqldump exited with code ' . $exit);
    }
}

function makeMaintenancePayload(): string {
    return "<?php http_response_code(503); header('Content-Type: application/json'); header('Cache-Control: no-store'); echo json_encode(['success'=>false,'error'=>['code'=>'service_unavailable','message'=>'Maintenance in progress.'],'meta'=>['requestId'=>sprintf('%s-%s-4%s-8%s-%s',bin2hex(random_bytes(4)),bin2hex(random_bytes(2)),substr(bin2hex(random_bytes(2)),1),substr(bin2hex(random_bytes(2)),1),bin2hex(random_bytes(6))),'timestamp'=>gmdate('Y-m-d\\TH:i:s\\Z')]]); exit;\n";
}

function digestDerivedRoutes(PDO $pdo): ?string {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        $hasRoutes = (bool)$pdo->query("SELECT 1 FROM sqlite_master WHERE type='view' AND name='routes'")->fetchColumn();
    } else {
        $hasRoutes = (bool)$pdo->query("SELECT 1 FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='routes'")->fetchColumn();
    }
    if (!$hasRoutes) {
        return null;
    }
    $rows = $pdo->query('SELECT id, origin_code, destination_code, direction, block_minutes, active FROM routes ORDER BY id ASC');
    $hash = hash_init('sha256');
    while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
        hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR) . "\n");
    }
    return hash_final($hash);
}

$activePhase = 'preflight';
$activeCheckpoint = 'initialization';

function setPhaseBudget(string $phase, int $seconds, string $checkpoint = ''): void {
    global $activePhase, $activeCheckpoint;
    if (!function_exists('pcntl_alarm') || !function_exists('pcntl_signal') || !function_exists('pcntl_async_signals')) {
        throw new UpgradeDiagnosticException('DEADLINE_UNAVAILABLE');
    }
    $activePhase = $phase;
    $activeCheckpoint = $checkpoint ?: $phase;
    if (function_exists('pcntl_alarm')) {
        pcntl_alarm($seconds);
    }
}

function handleDeadlineExceeded(): void {
    if (function_exists('pcntl_alarm')) {
        pcntl_alarm(0);
    }
    global $stage, $activePhase, $activeCheckpoint;
    $phaseName = $activePhase ?? $stage ?? 'runner';
    $checkpoint = $activeCheckpoint ?? 'unknown';
    throw new UpgradeDiagnosticException('DEADLINE_EXCEEDED', new RuntimeException("Runner deadline exceeded during phase {$phaseName} (checkpoint: {$checkpoint}); inspect private receipt."));
}

function assertExactRuntimeConnection(PDO $pdo, string $expectedDb, string $expectedUser): void {
    $identity = $pdo->query('SELECT DATABASE() AS db, CURRENT_USER() AS user')->fetch(PDO::FETCH_ASSOC);
    $currentDb = (string)($identity['db'] ?? '');
    $currentUser = (string)($identity['user'] ?? '');
    if ($currentDb !== $expectedDb) {
        throw new RuntimeException('Connected database does not match expected database.');
    }
    $username = strtok($currentUser, '@');
    if ($username !== $expectedUser) {
        throw new RuntimeException('Connected user does not match expected user.');
    }
}

function openRuntimePdo(string $dsn, string $user, string $password): PDO {
    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
}

$invocationId = bin2hex(random_bytes(8));
$startTime = gmdate('Y-m-d\TH:i:s\Z');
$phpVersion = PHP_VERSION;
$runnerHash = hash_file('sha256', __FILE__);
$upgradeManifestHash = null;

$modeRaw = $argv[1] ?? '';
$mode = in_array($modeRaw, ['--check', '--upgrade', '--rollback'], true) ? $modeRaw : 'unknown';

$stage = 'preflight';
$preflightCheckpoint = 'startup';
$preflightSubstep = null;
$ownsKitLock = false;
$kitLock = null;
$installerLock = null;
$targetReleaseId = null;
$targetSourceSha = null;
$targetManifestSha = null;
$maintenanceSet = false;
$cronLeaseOwner = null;
$maintenancePath = $appRoot . '/shared/storage/framework/maintenance.php';

try {
    if (PHP_VERSION_ID < 80400) throw new RuntimeException('PHP 8.4+ CLI required.');
    if (!in_array($mode, ['--check', '--upgrade', '--rollback'], true)) {
        throw new RuntimeException('Usage: production-upgrade-runner.php --check|--upgrade|--rollback');
    }

    // Step 0: Explicit owner GO required for --upgrade. Fail closed immediately before any preflight or attempt marker.
    if ($mode === '--upgrade') {
        $hasOwnerGo = in_array('--confirm-upgrade', $argv, true) || in_array('--owner-go', $argv, true);
        if (!$hasOwnerGo) {
            fwrite(STDERR, "FAIL: upgrade runner stopped at preflight; no credential details printed. Explicit final owner GO required (--confirm-upgrade or --owner-go). (invocation: {$invocationId})\n");
            exit(1);
        }
    }

    safePath(__FILE__, $home);
    safePath($kitRoot, $home);
    safePath($appRoot, $home);
    safePath($webroot, $home);
    safePath($livePackageRoot, $home);

    if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal') && function_exists('pcntl_alarm')) {
        pcntl_async_signals(true);
        pcntl_signal(SIGALRM, 'handleDeadlineExceeded');
        setPhaseBudget('preflight', 180, 'preflight_start');
    }


    // Acquire kit lock EX NB
    $kitLockPath = $kitRoot . '/production-upgrade.lock';
    safePath($kitLockPath, $home);
    if (!is_dir(dirname($kitLockPath))) mkdir(dirname($kitLockPath), 0700, true);
    $kitLock = fopen($kitLockPath, 'c');
    if (!$kitLock || !flock($kitLock, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException('Another upgrade runner is currently active.');
    }
    $ownsKitLock = true;
    chmod($kitLockPath, 0600);

    // Inside kit lock: check attempt marker
    $attemptPath = $kitRoot . '/production-upgrade-attempted';
    safePath($attemptPath, $home);
    if ($mode === '--upgrade' && is_file($attemptPath)) {
        echo "SKIP: upgrade already attempted; inspect production-upgrade-result.json and remove temporary cron. (invocation: {$invocationId})\n";
        return;
    }

    $preflightCheckpoint = 'kit_manifest';
    $preflightSubstep = null;
    $preflightSubstep = 'read_manifest';
    // 1. Read CLOSED upgrade kit manifest
    $upgradeManifestFile = $kitRoot . '/upgrade-manifest.json';
    privatePath($upgradeManifestFile, $home);
    if (!is_file($upgradeManifestFile) || filesize($upgradeManifestFile) > 65536) throw new RuntimeException('Invalid non-secret upgrade manifest.');
    $upgradeManifestRaw = file_get_contents($upgradeManifestFile);
    $upgradeManifestHash = hash('sha256', $upgradeManifestRaw);
    $upgradeManifest = json_decode($upgradeManifestRaw, true, 32, JSON_THROW_ON_ERROR);

    $targetRelease = $upgradeManifest['target_release'] ?? [];
    $targetReleaseId = (string)($targetRelease['release_id'] ?? '');
    $targetSourceSha = (string)($targetRelease['source_sha'] ?? '');
    $targetManifestSha = (string)($targetRelease['manifest_sha256'] ?? '');
    $targetMigrationCount = (int)($targetRelease['migration_count'] ?? 0);

    if (!preg_match('/^[A-Za-z0-9_]{1,128}$/D', $targetReleaseId)
        || !preg_match('/^[a-f0-9]{40}$/D', $targetSourceSha)
        || !preg_match('/^[a-f0-9]{64}$/D', $targetManifestSha)
        || $targetMigrationCount !== TARGET_MIGRATIONS) {
        throw new RuntimeException('Upgrade manifest target binding invalid.');
    }

    // Verify exact hash of runner itself against closed manifest
    $expectedRunnerHash = (string)($upgradeManifest['runner']['sha256'] ?? '');
    if ($expectedRunnerHash === '' || hash_file('sha256', __FILE__) !== $expectedRunnerHash) {
        throw new RuntimeException('Runner integrity verification failed against upgrade manifest.');
    }

    // Candidate package in kit
    $candidatePkgDir = $kitRoot . '/release';
    safePath($candidatePkgDir, $home);
    $candidateManifestPath = $candidatePkgDir . '/release-manifest.json';
    safePath($candidateManifestPath, $home);
    if (!is_file($candidateManifestPath) || hash_file('sha256', $candidateManifestPath) !== $targetManifestSha) {
        throw new RuntimeException('Candidate release manifest hash mismatch.');
    }

    $installerPath = $candidatePkgDir . '/installer/hostpapa-install.php';
    safePath($installerPath, $home);
    if (!is_file($installerPath)) throw new RuntimeException('Candidate installer missing.');

    $candidateManifest = json_decode(file_get_contents($candidateManifestPath), true, 64, JSON_THROW_ON_ERROR);
    $expectedMigrationNames = [];
    foreach (array_keys($candidateManifest['private_files'] ?? []) as $file) {
        if (preg_match('#^backend/database/migrations/([a-zA-Z0-9_]+)\\.php$#D', $file, $m)) $expectedMigrationNames[] = $m[1];
    }
    sort($expectedMigrationNames, SORT_STRING);
    if (count($expectedMigrationNames) !== TARGET_MIGRATIONS) throw new RuntimeException('Candidate migration inventory mismatch.');

    // Verify exact hash of installer against closed manifest BEFORE require
    $expectedInstallerHash = (string)($upgradeManifest['installer']['sha256'] ?? '');
    if ($expectedInstallerHash === '' || hash_file('sha256', $installerPath) !== $expectedInstallerHash) {
        throw new RuntimeException('Candidate installer integrity verification failed against upgrade manifest.');
    }

    $preflightCheckpoint = 'candidate_inventory';
    $preflightSubstep = null;
    // Candidate verifier must execute in ALL modes (including --check) before reading live credentials
    runBounded([PHP_BINARY, '-d', 'display_errors=0', $installerPath, '--action=verify', '--package-dir=' . $candidatePkgDir], 90);

    $preflightCheckpoint = 'ddl_approval';
    $preflightSubstep = null;
    // 2. Read and validate DDL credentials from existing private live approval
    $liveApprovalFile = $livePackageRoot . '/live-approval.json';
    $liveApprovalRaw = privateInput($liveApprovalFile, $home, 32768, false);
    $liveApproval = json_decode($liveApprovalRaw, true, 32, JSON_THROW_ON_ERROR);
    $db = $liveApproval['database'] ?? null;
    if (!is_array($db)
        || ($db['database'] ?? '') !== EXPECTED_DB_NAME
        || ($db['username'] ?? '') !== EXPECTED_DDL_USER
        || !is_string($db['password'] ?? null) || $db['password'] === ''
        || !in_array($db['host'] ?? '', ['127.0.0.1', 'localhost'], true)) {
        throw new RuntimeException('DDL credentials binding invalid.');
    }
    $ddlHost = (string)$db['host'];
    $ddlPort = (int)($db['port'] ?? 3306);
    $ddlDatabase = (string)$db['database'];
    $ddlUsername = (string)$db['username'];
    $ddlPassword = (string)$db['password'];

    $preflightCheckpoint = 'runtime_configuration';
    $preflightSubstep = null;
    // 3. Read and validate runtime credentials from shared/config/.env (read-only, no writing or chmod)
    $sharedConfigEnv = $appRoot . '/shared/config/.env';
    $runtimeEnvPath = null;
    if (is_file($sharedConfigEnv)) {
        $runtimeEnvPath = $sharedConfigEnv;
    } elseif (is_file($appRoot . '/shared/.env')) {
        $runtimeEnvPath = $appRoot . '/shared/.env';
    } else {
        throw new RuntimeException('Shared runtime environment file missing.');
    }
    $runtimeEnv = privateInput($runtimeEnvPath, $home, 16384, false);
    // Use the installed locked dotenv parser without booting Laravel or mutating state.
    require_once $appRoot . '/releases/' . INSTALLED_RELEASE_ID . '/backend/vendor/autoload.php';
    $envVars = \Dotenv\Dotenv::parse($runtimeEnv);
    if (($envVars['APP_ENV'] ?? '') !== 'production'
        || ($envVars['DB_DATABASE'] ?? '') !== EXPECTED_DB_NAME
        || ($envVars['DB_USERNAME'] ?? '') !== EXPECTED_RUNTIME_USER
        || !isset($envVars['DB_PASSWORD']) || trim($envVars['DB_PASSWORD']) === '') {
        throw new RuntimeException('Shared runtime environment credentials invalid.');
    }
    $runtimePassword = (string)$envVars['DB_PASSWORD'];

    $preflightCheckpoint = 'backup_tools';
    $preflightSubstep = null;
    // 4. Check host backup binaries availability (tar and mysqldump)
    $mysqldumpBin = getenv('HOSTPAPA_MYSQLDUMP_BIN') ?: 'mysqldump';
    $tarBin = getenv('HOSTPAPA_TAR_BIN') ?: 'tar';
    $preflightSubstep = 'check_tar';
    runBounded([$tarBin, '--version'], 5);
    $preflightSubstep = 'check_mysqldump';
    runBounded([$mysqldumpBin, '--version'], 5);

    $preflightCheckpoint = 'installed_inventory';
    $preflightSubstep = null;
    // 5. Check active release pointer and baseline state
    $pointerPath = $appRoot . '/current-release.txt';
    safePath($pointerPath, $home);
    if (!is_file($pointerPath)) throw new RuntimeException('Missing active release pointer.');
    $activePointer = trim(file_get_contents($pointerPath));

    // Baseline installed release directory
    $installedReleaseDir = $appRoot . '/releases/' . INSTALLED_RELEASE_ID;
    safePath($installedReleaseDir, $home);
    $installedManifestPath = $installedReleaseDir . '/release-manifest.json';
    safePath($installedManifestPath, $home);
    if (!is_file($installedManifestPath) || hash_file('sha256', $installedManifestPath) !== INSTALLED_MANIFEST_SHA) {
        throw new RuntimeException('Installed release manifest mismatch with baseline.');
    }
    $installedManifest = json_decode(file_get_contents($installedManifestPath), true, 64, JSON_THROW_ON_ERROR);
    if (($installedManifest['source_sha'] ?? '') !== INSTALLED_SOURCE_SHA
        || ($installedManifest['release_id'] ?? '') !== INSTALLED_RELEASE_ID) {
        throw new RuntimeException('Installed release identity mismatch with baseline.');
    }
    // Verify immutable private files of baseline release
    $preflightSubstep = 'verify_baseline_files';
    foreach ($installedManifest['private_files'] ?? [] as $relName => $entry) {
        $pfile = $installedReleaseDir . '/' . $relName;
        safePath($pfile, $home);
        if (!is_file($pfile) || hash_file('sha256', $pfile) !== $entry['sha256']) {
            throw new RuntimeException("Installed baseline private file corrupt: {$relName}");
        }
    }
    // Optional installed SOURCE_COMMIT.txt if present must match
    $optionalSourceCommit = $installedReleaseDir . '/SOURCE_COMMIT.txt';
    if (is_file($optionalSourceCommit)) {
        safePath($optionalSourceCommit, $home);
        if (trim(file_get_contents($optionalSourceCommit)) !== INSTALLED_SOURCE_SHA) {
            throw new RuntimeException('Installed SOURCE_COMMIT.txt mismatch with baseline.');
        }
    }

    $preflightCheckpoint = 'database_connectivity';
    $preflightSubstep = null;
    // Open connections after baseline hashing; later target/backup scans can still incur idle time.
    $dsn = "mysql:host={$ddlHost};port={$ddlPort};dbname={$ddlDatabase};charset=utf8mb4";
    $preflightSubstep = 'connect_ddl';
    try {
        $pdo = new PDO($dsn, $ddlUsername, $ddlPassword, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5,
        ]);
    } catch (PDOException $e) {
        throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
    }
    $preflightSubstep = 'connect_runtime';
    try {
        $runtimePdo = new PDO('mysql:host='.($envVars['DB_HOST'] ?? '127.0.0.1').';port='.($envVars['DB_PORT'] ?? '3306').';dbname='.EXPECTED_DB_NAME.';charset=utf8mb4', $envVars['DB_USERNAME'], $envVars['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
        if ($runtimePdo->query('SELECT DATABASE()')->fetchColumn() !== EXPECTED_DB_NAME) throw new RuntimeException('Runtime database connectivity mismatch.');
        $selectedDb = $pdo->query('SELECT DATABASE() AS name')->fetch()['name'] ?? '';
        if ($selectedDb !== EXPECTED_DB_NAME) throw new RuntimeException('Database name mismatch.');
        $currentMigrations = (int)($pdo->query('SELECT COUNT(*) AS cnt FROM migrations')->fetch()['cnt'] ?? -1);
    } catch (PDOException $e) {
        throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
    }

    // Also validate runtime user connectivity in read-only preflight
    $preflightSubstep = 'verify_runtime_user';
    try {
        $runtimeDsn = "mysql:host={$ddlHost};port={$ddlPort};dbname={$ddlDatabase};charset=utf8mb4";
        $runtimePdo = new PDO($runtimeDsn, EXPECTED_RUNTIME_USER, $runtimePassword, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $runtimeSelectedDb = $runtimePdo->query('SELECT DATABASE() AS name')->fetch()['name'] ?? '';
        if ($runtimeSelectedDb !== EXPECTED_DB_NAME) throw new RuntimeException('Runtime user connected to unexpected database.');
    } catch (PDOException $e) {
        throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
    }

    // -------------------------------------------------------------
    // MODE: --rollback
    // -------------------------------------------------------------
    if ($mode === '--rollback') {
        if (!in_array('--confirm-rollback', $argv, true)) {
            throw new RuntimeException('Rollback confirmation required: specify --confirm-rollback.');
        }
        // Rollback mode runs AFTER upgrade: requires TARGET pointer, target source, and 21 migrations currently
        if ($activePointer !== $targetReleaseId) {
            throw new RuntimeException("Rollback requires target pointer {$targetReleaseId}, found {$activePointer}.");
        }
        if ($currentMigrations !== TARGET_MIGRATIONS) {
            throw new RuntimeException("Rollback requires target " . TARGET_MIGRATIONS . " migrations in place, found {$currentMigrations}.");
        }
        // Require target backend pin: release/SOURCE_COMMIT.txt
        $targetBackendPin = $appRoot . '/releases/' . $targetReleaseId . '/SOURCE_COMMIT.txt';
        safePath($targetBackendPin, $home);
        if (!is_file($targetBackendPin) || trim(file_get_contents($targetBackendPin)) !== $targetSourceSha) {
            throw new RuntimeException('Target release backend source pin mismatch.');
        }
        // Require exact previous successful receipt and verified backup files
        $resultPath = $kitRoot . '/production-upgrade-result.json';
        safePath($resultPath, $home);
        if (!is_file($resultPath)) throw new RuntimeException('Missing upgrade result receipt.');
        $resultData = json_decode(file_get_contents($resultPath), true, 32, JSON_THROW_ON_ERROR);
        if (($resultData['outcome'] ?? '') !== 'DEPLOYED_OWNER_TESTING_PENDING') {
            throw new RuntimeException('Upgrade result outcome invalid for rollback.');
        }
        $backupDir = $appRoot . '/shared/backups/' . ($resultData['backups_retained'] ?? '');
        safePath($backupDir, $home);
        $backupReceiptFile = $backupDir . '/backup-receipt.json';
        safePath($backupReceiptFile, $home);
        if (!is_file($backupReceiptFile)) throw new RuntimeException('Missing backup receipt in retained backups.');
        $backupReceipt = json_decode(file_get_contents($backupReceiptFile), true, 32, JSON_THROW_ON_ERROR);
        $dbDump = $backupDir . '/' . ($backupReceipt['database_dump']['file'] ?? '');
        $pubTar = $backupDir . '/' . ($backupReceipt['public_tar']['file'] ?? '');
        $privTar = $backupDir . '/' . ($backupReceipt['private_tar']['file'] ?? '');
        safePath($dbDump, $home); safePath($pubTar, $home); safePath($privTar, $home);
        if (!is_file($dbDump) || hash_file('sha256', $dbDump) !== ($backupReceipt['database_dump']['sha256'] ?? '')
            || !is_file($pubTar) || hash_file('sha256', $pubTar) !== ($backupReceipt['public_tar']['sha256'] ?? '')
            || !is_file($privTar) || hash_file('sha256', $privTar) !== ($backupReceipt['private_tar']['sha256'] ?? '')) {
            throw new RuntimeException('Retained backup file hash verification failed.');
        }

        // Issue #10: Guard acquisition FIRST before compatibility assertion or mutation
        $stage = 'rollback_guards';
        setPhaseBudget('rollback', 300, 'rollback_start');

        // 1. Acquire installer lock EX NB
        $installerLockPath = $appRoot . '/shared/installer.lock';
        safePath($installerLockPath, $home);
        if (!is_dir(dirname($installerLockPath))) mkdir(dirname($installerLockPath), 0700, true);
        $installerLock = fopen($installerLockPath, 'c');
        if (!$installerLock || !flock($installerLock, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException('Installer lock active; cannot rollback.');
        }
        chmod($installerLockPath, 0600);

        // 2. Exclude cron via real Cache::lock on target active release
        $leaseToken = bin2hex(random_bytes(16));
        $leaseScript = <<<'PHP'
set_time_limit(30);
try {
    $release = $argv[1]; $token = $argv[2];
    require $release . '/backend/vendor/autoload.php';
    $app = require $release . '/backend/bootstrap/app.php';
    $shared = dirname(dirname($release)) . '/shared';
    $app->useStoragePath($shared . '/storage');
    $app->useEnvironmentPath($shared . '/config');
    $app->loadEnvironmentFrom('.env');
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    $lock = \Illuminate\Support\Facades\Cache::lock('shared_hosting:cron:lease', 2700, $token);
    if (!$lock->get()) exit(5);
    echo "LEASE_OK";
} catch (\Throwable) { exit(6); }
PHP;
        $leaseRes = runBounded([PHP_BINARY, '-d', 'display_errors=0', '-r', $leaseScript, $appRoot . '/releases/' . $targetReleaseId, $leaseToken], 25);
        if (trim($leaseRes['stdout']) !== 'LEASE_OK') {
            throw new RuntimeException('Failed to acquire cron exclusion lease on active release.');
        }
        $cronLeaseOwner = $leaseToken;

        // 3. Establish canonical maintenance mode; refuse pre-existing maintenance.php and down
        safePath($maintenancePath, $home);
        $frameworkDir = dirname($maintenancePath);
        safePath($frameworkDir, $home);
        if (!is_dir($frameworkDir)) {
            mkdir($frameworkDir, 0700, true);
        }
        $legacyDownPath = $frameworkDir . '/down';
        safePath($legacyDownPath, $home);
        if (is_file($maintenancePath) || is_file($legacyDownPath)) {
            throw new RuntimeException('Pre-existing maintenance mode active (maintenance.php or down); rollback refused.');
        }

        // Exclusive maintenance creation with checked write and chmod
        $maintHandle = @fopen($maintenancePath, 'x');
        if (!$maintHandle) {
            throw new RuntimeException('Failed to exclusively create maintenance mode file; file may already exist or cannot be opened.');
        }
        $maintPayload = makeMaintenancePayload();
        $writtenBytes = fwrite($maintHandle, $maintPayload);
        fclose($maintHandle);
        if ($writtenBytes !== strlen($maintPayload)) {
            @unlink($maintenancePath);
            throw new RuntimeException('Incomplete write of maintenance payload.');
        }
        if (!chmod($maintenancePath, 0600)) {
            @unlink($maintenancePath);
            throw new RuntimeException('Failed to set permissions on maintenance file.');
        }
        $maintenanceSet = true;

        // 4. Stage: rollback_serialization (InnoDB domain barrier)
        $stage = 'rollback_serialization';
        beginRollbackReferenceBarrier($pdo);

        // 5. Stage: rollback_compatibility (revalidation under barrier immediately before pointer/public changes)
        $stage = 'rollback_compatibility';

        // Re-read active pointer from disk
        $currentPointerNow = trim((string)file_get_contents($pointerPath));
        if ($currentPointerNow !== $targetReleaseId) {
            throw new RuntimeException("Active pointer changed unexpectedly to {$currentPointerNow}; rollback refused.");
        }

        // Re-read backend source pin
        if (!is_file($targetBackendPin) || trim(file_get_contents($targetBackendPin)) !== $targetSourceSha) {
            throw new RuntimeException('Target release backend source pin mismatch during barrier verification.');
        }

        assertRollbackMigrationLedger($pdo, $expectedMigrationNames);

        // Verify compatibility predicate: reference airports and destination limits
        assertRollbackCompatible($pdo);

        // 6. Stage: rollback_execute (HOLD barrier across verified HostPapaInstaller using inherited filelock)
        $stage = 'rollback_execute';

        $rollbackApproval = [
            'schema_version' => '1.0',
            'action' => 'rollback',
            'release_id' => INSTALLED_RELEASE_ID,
            'source_sha' => INSTALLED_SOURCE_SHA,
            'manifest_sha256' => INSTALLED_MANIFEST_SHA,
            'environment' => 'production',
            'target_webroot' => $webroot,
            'app_dir' => $appRoot,
            'database' => [
                'host' => $ddlHost,
                'port' => $ddlPort,
                'database' => $ddlDatabase,
                'username' => $ddlUsername,
                'password' => $ddlPassword,
            ],
            'runtime_env_file' => is_file($sharedConfigEnv) ? $sharedConfigEnv : $runtimeEnvPath,
        ];
        $rollbackApprovalPath = $kitRoot . '/rollback-approval.json';
        safePath($rollbackApprovalPath, $home);
        file_put_contents($rollbackApprovalPath, json_encode($rollbackApproval, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
        chmod($rollbackApprovalPath, 0600);

        require_once $installerPath;
        $inst = new HostPapaInstaller([
            $installerPath,
            '--action=rollback',
            '--approval-file=' . $rollbackApprovalPath,
            '--confirm-rollback',
        ]);
        if ((new ReflectionMethod(HostPapaInstaller::class, 'run'))->getNumberOfParameters() < 2) {
            throw new RuntimeException('Bundled installer cannot preserve outer maintenance ownership.');
        }
        $inst->run($installerLock, true);

        // Post-rollback pointer verification
        $postRollbackPointer = trim((string)file_get_contents($pointerPath));
        if ($postRollbackPointer !== INSTALLED_RELEASE_ID) {
            throw new RuntimeException("Rollback failed to restore pointer to " . INSTALLED_RELEASE_ID . "; found {$postRollbackPointer}");
        }

        // Commit barrier transaction BEFORE removing maintenance
        $pdo->commit();

        // Remove maintenance mode created by this runner
        if ($maintenanceSet) {
            if (is_file($maintenancePath)) {
                if (!unlink($maintenancePath)) {
                    throw new RuntimeException('Failed to remove maintenance mode file after rollback completion; maintenance remains active.');
                }
                $maintenanceSet = false;
            }
        }

        echo "PASS: guarded code and static rollback complete. Additive database migrations are preserved and not automatically reverted.\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // A read-only check is valid after a completed upgrade, too. Verify actual
    // installed bytes/schema instead of rejecting the new state as an old-baseline failure.
    $preflightCheckpoint = 'active_release_and_schema';
    if ($mode === '--check' && $activePointer === $targetReleaseId) {
        $preflightSubstep = 'target_source';
        $installedTarget = $appRoot . '/releases/' . $targetReleaseId;
        safePath($installedTarget, $home);
        if (!is_file($installedTarget . '/SOURCE_COMMIT.txt')
            || trim(file_get_contents($installedTarget . '/SOURCE_COMMIT.txt')) !== $targetSourceSha) {
            throw new UpgradeDiagnosticException('TARGET_SOURCE_MISMATCH');
        }
        $preflightSubstep = 'target_manifest';
        if (!is_file($installedTarget . '/release-manifest.json')
            || hash_file('sha256', $installedTarget . '/release-manifest.json') !== $targetManifestSha) {
            throw new UpgradeDiagnosticException('TARGET_MANIFEST_MISMATCH');
        }
        $preflightSubstep = 'target_inventory';
        foreach (['private_files' => $installedTarget, 'public_files' => $webroot] as $section => $base) {
            foreach ($candidateManifest[$section] ?? [] as $relative => $entry) {
                $file = $base . '/' . $relative;
                safePath($file, $home);
                if (!is_file($file) || hash_file('sha256', $file) !== $entry['sha256']) {
                    throw new UpgradeDiagnosticException('TARGET_INVENTORY_MISMATCH');
                }
            }
        }
        $preflightSubstep = 'target_ledger_query';
        try {
            $actualNames = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {
            throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
        }
        $preflightSubstep = 'target_ledger_compare';
        if ($expectedMigrationNames !== $actualNames) {
            throw new UpgradeDiagnosticException('TARGET_SCHEMA_MISMATCH');
        }
        $preflightSubstep = 'target_maintenance';
        if (is_file($maintenancePath)) {
            throw new UpgradeDiagnosticException('TARGET_MAINTENANCE_ACTIVE');
        }
        echo "PASS: already-installed target source, private/public bytes and 21 migration identities verified; no upgrade or evidence rewrite.\n";
        echo "invocation: {$invocationId}\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // Baseline checks for --check and --upgrade: active pointer must be 7a8f0fa baseline
    $preflightSubstep = 'baseline_pointer';
    if ($activePointer !== INSTALLED_RELEASE_ID) {
        throw new UpgradeDiagnosticException('BASELINE_POINTER_MISMATCH');
    }
    $preflightSubstep = 'baseline_inventory';
    $oldNames = [];
    foreach (array_keys($installedManifest['private_files'] ?? []) as $file) {
        if (preg_match('#^backend/database/migrations/([a-zA-Z0-9_]+)\\.php$#D', $file, $m)) $oldNames[] = $m[1];
    }
    sort($oldNames, SORT_STRING);
    if (count($oldNames) !== INSTALLED_MIGRATIONS) {
        throw new UpgradeDiagnosticException('BASELINE_MIGRATION_INVENTORY_COUNT_MISMATCH');
    }
    $preflightSubstep = 'baseline_ledger_query';
    try {
        $actualNames = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) {
        throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
    }
    $preflightSubstep = 'baseline_ledger_compare';
    if ($oldNames !== $actualNames) {
        throw new UpgradeDiagnosticException('LEDGER_IDENTITIES_MISMATCH');
    }
    $preflightSubstep = 'baseline_count_compare';
    if ($currentMigrations !== INSTALLED_MIGRATIONS) {
        throw new UpgradeDiagnosticException('INITIAL_COUNT_MISMATCH');
    }

    // -------------------------------------------------------------
    // MODE: --check
    // -------------------------------------------------------------
    if ($mode === '--check') {
        echo "PASS: verified baseline source 7a8f0fa, active release rel_20261013T082656_7a8f0fa_clean, 19 migrations, and upgrade candidate package.\n";
        echo "invocation: {$invocationId}\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // -------------------------------------------------------------
    // MODE: --upgrade
    // -------------------------------------------------------------
    $stage = 'acquire_locks';
    setPhaseBudget('locks', 60, 'acquire_locks');
    // Acquire installer lock EX NB
    $installerLockPath = $appRoot . '/shared/installer.lock';
    safePath($installerLockPath, $home);
    if (!is_dir(dirname($installerLockPath))) mkdir(dirname($installerLockPath), 0700, true);
    $installerLock = fopen($installerLockPath, 'c');
    if (!$installerLock || !flock($installerLock, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException('Another installer is active.');
    }
    chmod($installerLockPath, 0600);

    // Create attempt marker immediately
    $attempt = fopen($attemptPath, 'x');
    if (!$attempt) throw new RuntimeException('Could not record upgrade attempt marker.');
    fwrite($attempt, gmdate('c') . "\n");
    fclose($attempt);

    // Acquire persistent cron lease on old real app: FAIL CLOSED!
    $stage = 'cron_lease';
    setPhaseBudget('cron_lease', 60, 'cron_lease');
    $leaseToken = bin2hex(random_bytes(16));
    $leaseScript = <<<'PHP'
set_time_limit(30);
try {
    $release = $argv[1]; $token = $argv[2];
    require $release . '/backend/vendor/autoload.php';
    $app = require $release . '/backend/bootstrap/app.php';
    $shared = dirname(dirname($release)) . '/shared';
    $app->useStoragePath($shared . '/storage');
    $app->useEnvironmentPath($shared . '/config');
    $app->loadEnvironmentFrom('.env');
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    $lock = \Illuminate\Support\Facades\Cache::lock('shared_hosting:cron:lease', 2700, $token);
    if (!$lock->get()) exit(5);
    echo "LEASE_OK";
} catch (\Throwable) { exit(6); }
PHP;
    $leaseRes = runBounded([PHP_BINARY, '-d', 'display_errors=0', '-r', $leaseScript, $installedReleaseDir, $leaseToken], 25);
    if (trim($leaseRes['stdout']) !== 'LEASE_OK') {
        throw new RuntimeException('Failed to acquire cron exclusion lease on old application; cannot proceed.');
    }
    $cronLeaseOwner = $leaseToken;

    // Establish canonical maintenance mode BEFORE taking backups; refuse pre-existing maintenance.php and down
    $stage = 'maintenance';
    setPhaseBudget('maintenance', 180, 'maintenance_enable');
    safePath($maintenancePath, $home);
    $frameworkDir = dirname($maintenancePath);
    safePath($frameworkDir, $home);
    if (!is_dir($frameworkDir)) {
        mkdir($frameworkDir, 0700, true);
    }
    $legacyDownPath = $frameworkDir . '/down';
    safePath($legacyDownPath, $home);
    if (is_file($maintenancePath) || is_file($legacyDownPath)) {
        throw new RuntimeException('Pre-existing maintenance mode active (maintenance.php or down); upgrade refused.');
    }

    // Exclusive maintenance creation with checked write and chmod
    $maintHandle = @fopen($maintenancePath, 'x');
    if (!$maintHandle) {
        throw new RuntimeException('Failed to exclusively create maintenance mode file; file may already exist or cannot be opened.');
    }
    $maintPayload = makeMaintenancePayload();
    $writtenBytes = fwrite($maintHandle, $maintPayload);
    fclose($maintHandle);
    if ($writtenBytes !== strlen($maintPayload)) {
        @unlink($maintenancePath);
        throw new RuntimeException('Incomplete write of maintenance payload.');
    }
    if (!chmod($maintenancePath, 0600)) {
        @unlink($maintenancePath);
        throw new RuntimeException('Failed to set permissions on maintenance file.');
    }
    $maintenanceSet = true;
    usleep(500000); // 500ms request drain

    // Re-check installed baseline under maintenance & lock before mutation
    if (trim(file_get_contents($pointerPath)) !== INSTALLED_RELEASE_ID ||
        hash_file('sha256', $installedManifestPath) !== INSTALLED_MANIFEST_SHA) {
        throw new RuntimeException('State mismatch detected under maintenance lock.');
    }

    $stage = 'critical_baseline';
    $baselineProjections = captureBaselineProjections($pdo);
    $tableHashesBefore = preservationDigests($pdo, $baselineProjections);
    $baselineCountsBefore = captureBaselineRowCounts($pdo, array_keys($baselineProjections));
    $routesHashBefore = digestDerivedRoutes($pdo);
    $runtimeEnvHash = hash_file('sha256', $runtimeEnvPath);

    // Ensure shared/config/.env exists for the installer
    if (!is_file($sharedConfigEnv)) {
        if (!is_dir(dirname($sharedConfigEnv))) mkdir(dirname($sharedConfigEnv), 0700, true);
        file_put_contents($sharedConfigEnv, $runtimeEnv, LOCK_EX);
        chmod($sharedConfigEnv, 0600);
    }

    // Verified Private Backups during maintenance
    $stage = 'backup_database';
    setPhaseBudget('backup', 900, 'backup_start');
    $backupRunId = gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $backupDir = $appRoot . '/shared/backups/upgrade_' . $backupRunId;
    safePath($backupDir, $home);
    if (!is_dir($backupDir)) mkdir($backupDir, 0700, true);

    // 1. Consistent MySQL dump with mode 0600 client defaults file and escaped password
    $cnfPath = $kitRoot . '/.my_' . bin2hex(random_bytes(6)) . '.cnf';
    safePath($cnfPath, $home);
    $quotedPass = quoteCnf($ddlPassword);
    $cnfContent = "[client]\nhost={$ddlHost}\nport={$ddlPort}\nuser={$ddlUsername}\npassword={$quotedPass}\n";
    file_put_contents($cnfPath, $cnfContent, LOCK_EX);
    chmod($cnfPath, 0600);
    $dbDumpPath = $backupDir . '/preupgrade-database.sql';
    safePath($dbDumpPath, $home);
    try {
        $dumpArgs = [
            $mysqldumpBin,
            '--defaults-extra-file=' . $cnfPath,
            '--no-tablespaces',
            '--set-gtid-purged=OFF',
            '--single-transaction',
            '--triggers',
            '--routines',
            '--events',
            $ddlDatabase,
        ];
        runBoundedDump($dumpArgs, $dbDumpPath, 120);
    } finally {
        if (is_file($cnfPath)) unlink($cnfPath);
    }
    if (!is_file($dbDumpPath) || filesize($dbDumpPath) < 1024) {
        throw new RuntimeException('Database dump failed or output too small.');
    }
    // Verify dump content complete footer
    $dumpSize = filesize($dbDumpPath);
    $readLen = min(4096, $dumpSize);
    $f = fopen($dbDumpPath, 'rb');
    fseek($f, $dumpSize - $readLen);
    $tail = fread($f, $readLen);
    fclose($f);
    if (!str_contains($tail, 'Dump completed on') && !str_contains($tail, 'CREATE TABLE')) {
        throw new RuntimeException('Database dump complete footer verification failed.');
    }
    chmod($dbDumpPath, 0600);

    // 2. Public webroot backup & tar integrity verification
    $stage = 'backup_public';
    $publicBackupPath = $backupDir . '/preupgrade-public.tar.gz';
    safePath($publicBackupPath, $home);
    runBounded([$tarBin, '-czf', $publicBackupPath, '-C', $webroot, '.'], 180);
    if (!is_file($publicBackupPath) || filesize($publicBackupPath) < 1024) {
        throw new RuntimeException('Public webroot backup failed or too small.');
    }
    runBounded([$tarBin, '-tzf', $publicBackupPath], 60, true);
    chmod($publicBackupPath, 0600);

    // 3. Private state backup & tar integrity verification
    $stage = 'backup_private';
    $privateBackupPath = $backupDir . '/preupgrade-private-state.tar.gz';
    safePath($privateBackupPath, $home);
    $privateEntries = ['current-release.txt', 'shared/config', 'shared/storage', 'releases/' . INSTALLED_RELEASE_ID];
    // The original 7a8 installer placed its pointer-following CLI only inside the
    // immutable release. Batch 01 adds the stable app/bin wrapper for later use.
    if (is_dir($appRoot . '/bin')) $privateEntries[] = 'bin';
    runBounded([$tarBin, '-czf', $privateBackupPath, '--exclude=shared/storage/logs', '--exclude=shared/storage/framework/cache',
        '-C', $appRoot, ...$privateEntries], 300);
    if (!is_file($privateBackupPath) || filesize($privateBackupPath) < 1024) {
        throw new RuntimeException('Private state backup failed or too small.');
    }
    runBounded([$tarBin, '-tzf', $privateBackupPath], 60, true);
    chmod($privateBackupPath, 0600);

    // 4. Save backup receipt
    $backupReceipt = [
        'created_at' => gmdate('c'),
        'database_dump' => [
            'file' => basename($dbDumpPath),
            'sha256' => hash_file('sha256', $dbDumpPath),
            'size' => filesize($dbDumpPath),
        ],
        'public_tar' => [
            'file' => basename($publicBackupPath),
            'sha256' => hash_file('sha256', $publicBackupPath),
            'size' => filesize($publicBackupPath),
        ],
        'private_tar' => [
            'file' => basename($privateBackupPath),
            'sha256' => hash_file('sha256', $privateBackupPath),
            'size' => filesize($privateBackupPath),
        ],
    ];
    file_put_contents($backupDir . '/backup-receipt.json', json_encode($backupReceipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
    chmod($backupDir . '/backup-receipt.json', 0600);

    // Generate new Install Approval privately
    $stage = 'generate_approval';
    $upgradeApproval = [
        'schema_version' => '1.0',
        'action' => 'install',
        'release_id' => $targetReleaseId,
        'source_sha' => $targetSourceSha,
        'manifest_sha256' => $targetManifestSha,
        'environment' => 'production',
        'target_webroot' => $webroot,
        'app_dir' => $appRoot,
        'database' => [
            'host' => $ddlHost,
            'port' => $ddlPort,
            'database' => $ddlDatabase,
            'username' => $ddlUsername,
            'password' => $ddlPassword,
        ],
        'runtime_env_file' => $sharedConfigEnv,
    ];
    $approvalPath = $kitRoot . '/upgrade-approval.json';
    safePath($approvalPath, $home);
    file_put_contents($approvalPath, json_encode($upgradeApproval, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
    chmod($approvalPath, 0600);

    // Execute verified installer in-process with inherited lock
    $stage = 'install';
    setPhaseBudget('install', 900, 'installer_start');
    require_once $installerPath;
    $installerInstance = new HostPapaInstaller([
        $installerPath,
        '--action=install',
        '--package-dir=' . $candidatePkgDir,
        '--approval-file=' . $approvalPath,
    ]);
    if ((new ReflectionMethod(HostPapaInstaller::class, 'run'))->getNumberOfParameters() < 2) {
        throw new RuntimeException('Bundled installer cannot preserve outer maintenance ownership.');
    }
    $installerInstance->run($installerLock, true);

    // Post-install verification
    $stage = 'post_verify';
    setPhaseBudget('post_verify', 300, 'post_verify_start');

    if (trim(file_get_contents($pointerPath)) !== $targetReleaseId) {
        throw new RuntimeException('Pointer update verification failed.');
    }
    // Verify required new source path is release/SOURCE_COMMIT.txt
    $newSourceFile = $appRoot . '/releases/' . $targetReleaseId . '/SOURCE_COMMIT.txt';
    safePath($newSourceFile, $home);
    if (!is_file($newSourceFile) || trim(file_get_contents($newSourceFile)) !== $targetSourceSha) {
        throw new RuntimeException('New release backend source commit verification failed.');
    }

    // Open a fresh identity-verified runtime PDO at final comparison boundary.
    // Discard stale preflight PDO from before >3 minute backup/copy;
    // never silently retry or reconnect inside mutating or transactional steps.
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        throw new RuntimeException('Final verification cannot replace a connection with an active transaction.');
    }
    $pdo = null;
    $runtimeHost = (string)($envVars['DB_HOST'] ?? $ddlHost);
    $runtimePort = (int)($envVars['DB_PORT'] ?? $ddlPort);
    $verifyDsn = "mysql:host={$runtimeHost};port={$runtimePort};dbname=" . EXPECTED_DB_NAME . ";charset=utf8mb4";
    try {
        $verifyPdo = openRuntimePdo($verifyDsn, EXPECTED_RUNTIME_USER, $runtimePassword);
        assertExactRuntimeConnection($verifyPdo, EXPECTED_DB_NAME, EXPECTED_RUNTIME_USER);
        $pdo = $verifyPdo;
    } catch (PDOException $e) {
        throw new UpgradeDiagnosticException('DATABASE_QUERY_FAILURE', $e);
    }

    // Verify exact migration names in database
    $appliedMigrations = $pdo->query('SELECT migration FROM migrations ORDER BY id ASC')->fetchAll(PDO::FETCH_COLUMN);
    if (count($appliedMigrations) !== TARGET_MIGRATIONS) {
        throw new RuntimeException("Expected 21 migrations after upgrade, found " . count($appliedMigrations));
    }
    foreach ($expectedMigrationNames as $expectedName) {
        if (!in_array($expectedName, $appliedMigrations, true)) {
            throw new RuntimeException("Missing expected applied migration: {$expectedName}");
        }
    }

    $afterDigests = preservationDigests($pdo, $baselineProjections);
    $afterCounts = captureBaselineRowCounts($pdo, array_keys($baselineProjections));
    $routesHashAfter = digestDerivedRoutes($pdo);
    if ($tableHashesBefore !== $afterDigests) {
        throw new RuntimeException('Existing database records changed during upgrade; maintenance retained.');
    }
    if ($baselineCountsBefore !== $afterCounts) {
        throw new RuntimeException('Existing database row counts changed during upgrade; maintenance retained.');
    }
    if ($routesHashBefore !== null && $routesHashBefore !== $routesHashAfter) {
        throw new RuntimeException('Derived routes changed during upgrade; maintenance retained.');
    }
    if (hash_file('sha256', $runtimeEnvPath) !== $runtimeEnvHash) {
        throw new RuntimeException('Shared configuration changed during upgrade; maintenance retained.');
    }

    validateAdditiveMetadataDefaults($pdo);
    validateNewAnalyticsTables($pdo);

    // Fully verified success: remove maintenance mode
    if (is_file($maintenancePath)) {
        if (!unlink($maintenancePath)) throw new RuntimeException('Maintenance removal failed.');
        $maintenanceSet = false;
    }

    // Record success receipt
    $receipt = [
        'outcome' => 'DEPLOYED_OWNER_TESTING_PENDING',
        'source_sha' => $targetSourceSha,
        'release_id' => $targetReleaseId,
        'manifest_sha256' => $targetManifestSha,
        'previous_release_id' => INSTALLED_RELEASE_ID,
        'database' => EXPECTED_DB_NAME,
        'completed_at' => gmdate('c'),
        'migrations_count' => count($appliedMigrations),
        'backups_retained' => basename($backupDir),
        'mailbox_delivery' => 'NOT_CERTIFIED',
        'acceptance_tests' => 'OWNER_PENDING',
    ];
    $resultPath = $kitRoot . '/production-upgrade-result.json';
    safePath($resultPath, $home);
    file_put_contents($resultPath, json_encode($receipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    chmod($resultPath, 0600);
    // Retain a separate durable success attestation; later checks cannot replace it.
    $successPath = $kitRoot . '/production-upgrade-success.json';
    safePath($successPath, $home);
    file_put_contents($successPath, json_encode($receipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    chmod($successPath, 0600);

    echo "PASS: release installed, migrations verified at 21, previous bytes and consistent database dump retained.\n";
    if (function_exists('pcntl_alarm')) pcntl_alarm(0);
} catch (Throwable $e) {
    if (function_exists('pcntl_alarm')) {
        pcntl_alarm(0);
    }
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        try { $pdo->rollBack(); } catch (\Throwable) {}
    }

    $errorClass = 'Throwable';
    $allowedClasses = [
        UpgradeDiagnosticException::class => 'UpgradeDiagnosticException',
        PDOException::class => 'PDOException',
        RuntimeException::class => 'RuntimeException',
        InvalidArgumentException::class => 'InvalidArgumentException',
        TypeError::class => 'TypeError',
        Error::class => 'Error',
        Exception::class => 'Exception',
    ];
    foreach ($allowedClasses as $cls => $name) {
        if ($e instanceof $cls) {
            $errorClass = $name;
            break;
        }
    }

    $reasonCode = 'UNEXPECTED_ERROR';
    $sqlstate = null;
    $driverCode = null;

    $underlying = $e;
    if ($e instanceof UpgradeDiagnosticException) {
        $candidateCode = $e->getReasonCode();
        if (in_array($candidateCode, ALLOWED_REASON_CODES, true)) {
            $reasonCode = $candidateCode;
        }
        if ($e->getPrevious() !== null) {
            $underlying = $e->getPrevious();
        }
    }

    if ($underlying instanceof PDOException) {
        if ($reasonCode === 'UNEXPECTED_ERROR') {
            $reasonCode = 'DATABASE_QUERY_FAILURE';
        }
        $errorClass = 'PDOException';
        $rawCode = (string)$underlying->getCode();
        if (is_array($underlying->errorInfo) && isset($underlying->errorInfo[0]) && is_string($underlying->errorInfo[0])) {
            $rawCode = $underlying->errorInfo[0];
        }
        if (preg_match('/^[A-Z0-9]{5}$/D', $rawCode)) {
            $sqlstate = $rawCode;
        }
        if (is_array($underlying->errorInfo) && isset($underlying->errorInfo[1])) {
            $rawDriver = $underlying->errorInfo[1];
            if (is_int($rawDriver)) {
                if ($rawDriver >= 0 && $rawDriver <= 2147483647) {
                    $driverCode = $rawDriver;
                }
            } elseif (is_string($rawDriver) && preg_match('/^[0-9]{1,10}$/D', $rawDriver)) {
                $intVal = (int)$rawDriver;
                if ($intVal >= 0 && $intVal <= 2147483647 && (string)$intVal === $rawDriver) {
                    $driverCode = $intVal;
                }
            }
        }
    }

    if ($ownsKitLock && is_dir($kitRoot)) {
        try {
            $failureReceipt = [
                'outcome' => 'FAIL',
                'invocation_id' => $invocationId,
                'mode' => $mode,
                'start_time' => $startTime,
                'time' => gmdate('c'),
                'php_version' => $phpVersion,
                'runner_hash' => $runnerHash,
                'upgrade_manifest_hash' => $upgradeManifestHash,
                'stage' => $stage,
                'preflight_checkpoint' => $stage === 'preflight' ? $preflightCheckpoint : null,
                'preflight_substep' => $stage === 'preflight' ? $preflightSubstep : null,
                'failure_checkpoint' => $activeCheckpoint ?? ($stage === 'preflight' ? $preflightCheckpoint : $stage),
                'reason_code' => $reasonCode,
                'recovery_disposition' => 'STOP_FOR_REVIEWED_FORWARD_COMPLETION',
                'guarded_recovery_note' => 'Partial DDL or timeout requires reviewed forward completion; automatic dump import, rollback, or blind retry is forbidden.',
                'sqlstate' => $sqlstate,
                'driver_code' => $driverCode,
                'error_class' => $errorClass,
                'source_sha' => isset($targetSourceSha) && is_string($targetSourceSha)
                    && preg_match('/^[a-f0-9]{40}$/D', $targetSourceSha) === 1 ? $targetSourceSha : null,
                'message' => 'Upgrade or rollback stopped; inspect private configuration, backup logs and retained backups before retry.',
                'maintenance_retained' => $maintenanceSet,
                'maintenance_observed' => is_file($maintenancePath),
            ];
            // Observational failures must not destroy installation/rollback evidence.
            // Retain every invocation and use a separate last-failure report.
            $failureBytes = json_encode($failureReceipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
            $eventPath = $kitRoot . '/production-upgrade-failure-' . gmdate('Ymd_His') . '_' . $invocationId . '.json';
            @file_put_contents($eventPath, $failureBytes, LOCK_EX);
            @chmod($eventPath, 0600);
            @file_put_contents($kitRoot . '/production-upgrade-last-failure.json', $failureBytes, LOCK_EX);
            @chmod($kitRoot . '/production-upgrade-last-failure.json', 0600);
        } catch (\Throwable) {
            // Diagnostic writes must never clobber success evidence or prevent finally cleanup.
        }
    }
    // If failure occurred pre-migration before backups, safe to clear maintenance; otherwise retain it!
    if ($stage === 'maintenance' && $maintenanceSet && is_file($maintenancePath)) {
        @unlink($maintenancePath);
    }
    fwrite(STDERR, "FAIL: upgrade runner stopped at " . $stage . " [" . $reasonCode . "] (invocation: " . $invocationId . "); no credential details printed. Do not remove the attempt marker or retry blindly.\n");
    $failed = true;
} finally {
    // Release cron lease if acquired
    if ($cronLeaseOwner !== null) {
        $relRelease = is_file($pointerPath) ? trim((string)@file_get_contents($pointerPath)) : INSTALLED_RELEASE_ID;
        $relReleaseDir = $appRoot . '/releases/' . $relRelease;
        if (is_dir($relReleaseDir)) {
            $unleaseScript = <<<'PHP'
try {
    $release = $argv[1]; $token = $argv[2];
    require $release . '/backend/vendor/autoload.php';
    $app = require $release . '/backend/bootstrap/app.php';
    $shared = dirname(dirname($release)) . '/shared';
    $app->useStoragePath($shared . '/storage');
    $app->useEnvironmentPath($shared . '/config');
    $app->loadEnvironmentFrom('.env');
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    $lock = \Illuminate\Support\Facades\Cache::restoreLock('shared_hosting:cron:lease', $token);
    $lock->release();
} catch (\Throwable) {}
PHP;
            @runBounded([PHP_BINARY, '-d', 'display_errors=0', '-r', $unleaseScript, $relReleaseDir, $cronLeaseOwner], 10);
        }
    }
    if (is_resource($installerLock)) {
        flock($installerLock, LOCK_UN);
        fclose($installerLock);
    }
    if (is_resource($kitLock)) {
        flock($kitLock, LOCK_UN);
        fclose($kitLock);
    }
}

if ($failed ?? false) exit(1);
