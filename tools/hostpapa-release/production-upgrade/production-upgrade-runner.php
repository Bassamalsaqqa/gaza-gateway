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

function preservationDigests(PDO $pdo, ?array $tables = null): array {
    // Preserve durable application records, including credentials/settings ciphertext,
    // without emitting them. Cache/lease/heartbeat bookkeeping is intentionally mutable.
    if ($tables === null) {
        $tables = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='gaza5045_gateway_live' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
        $tables = array_values(array_filter($tables, static fn(string $table): bool => !in_array($table, ['migrations', 'cache', 'cache_locks'], true)
            && !str_contains($table, 'heartbeat')));
    }
    $digests = [];
    foreach ($tables as $table) {
        if (!preg_match('/^[A-Za-z0-9_]+$/D', $table)) throw new RuntimeException('Invalid preservation table.');
        $pk = $pdo->query("SHOW KEYS FROM `$table` WHERE Key_name='PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
        usort($pk, static fn(array $a, array $b): int => (int)$a['Seq_in_index'] <=> (int)$b['Seq_in_index']);
        if (!$pk) throw new RuntimeException('Preservation table lacks deterministic primary-key ordering.');
        $columns = array_map(static function (array $row): string {
            if (!preg_match('/^[A-Za-z0-9_]+$/D', $row['Column_name'])) throw new RuntimeException('Invalid primary key.');
            return '`'.$row['Column_name'].'`';
        }, $pk);
        $rows = $pdo->query("SELECT * FROM `$table` ORDER BY ".implode(',', $columns));
        $hash = hash_init('sha256');
        while ($row = $rows->fetch(PDO::FETCH_ASSOC)) hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR).'\n');
        $digests[$table] = hash_final($hash);
    }
    return $digests;
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

$stage = 'preflight';
$preflightCheckpoint = 'startup';
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
    $mode = $argv[1] ?? '';
    if (!in_array($mode, ['--check', '--upgrade', '--rollback'], true)) {
        throw new RuntimeException('Usage: production-upgrade-runner.php --check|--upgrade|--rollback');
    }

    // Step 0: Explicit owner GO required for --upgrade. Fail closed immediately before any preflight or attempt marker.
    if ($mode === '--upgrade') {
        $hasOwnerGo = in_array('--confirm-upgrade', $argv, true) || in_array('--owner-go', $argv, true);
        if (!$hasOwnerGo) {
            fwrite(STDERR, "FAIL: upgrade runner stopped at preflight; no credential details printed. Explicit final owner GO required (--confirm-upgrade or --owner-go).\n");
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
        pcntl_signal(SIGALRM, static function (): void {
            fwrite(STDERR, "FAIL: runner deadline exceeded (390s); inspect private receipt.\n");
            exit(1);
        });
        pcntl_alarm(390);
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
        echo "SKIP: upgrade already attempted; inspect production-upgrade-result.json and remove temporary cron.\n";
        return;
    }

    $preflightCheckpoint = 'kit_manifest';
    // 1. Read CLOSED upgrade kit manifest
    $upgradeManifestFile = $kitRoot . '/upgrade-manifest.json';
    privatePath($upgradeManifestFile, $home);
    if (!is_file($upgradeManifestFile) || filesize($upgradeManifestFile) > 65536) throw new RuntimeException('Invalid non-secret upgrade manifest.');
    $upgradeManifestRaw = file_get_contents($upgradeManifestFile);
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
    // Candidate verifier must execute in ALL modes (including --check) before reading live credentials
    runBounded([PHP_BINARY, '-d', 'display_errors=0', $installerPath, '--action=verify', '--package-dir=' . $candidatePkgDir], 90);

    $preflightCheckpoint = 'ddl_approval';
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
    // 4. Check host backup binaries availability (tar and mysqldump)
    $mysqldumpBin = getenv('HOSTPAPA_MYSQLDUMP_BIN') ?: 'mysqldump';
    $tarBin = getenv('HOSTPAPA_TAR_BIN') ?: 'tar';
    runBounded([$tarBin, '--version'], 5);
    runBounded([$mysqldumpBin, '--version'], 5);

    $preflightCheckpoint = 'database_connectivity';
    // 5. Connect with DDL user to check database name and migrations
    $dsn = "mysql:host={$ddlHost};port={$ddlPort};dbname={$ddlDatabase};charset=utf8mb4";
    $pdo = new PDO($dsn, $ddlUsername, $ddlPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $runtimePdo = new PDO('mysql:host='.($envVars['DB_HOST'] ?? '127.0.0.1').';port='.($envVars['DB_PORT'] ?? '3306').';dbname='.EXPECTED_DB_NAME.';charset=utf8mb4', $envVars['DB_USERNAME'], $envVars['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
    if ($runtimePdo->query('SELECT DATABASE()')->fetchColumn() !== EXPECTED_DB_NAME) throw new RuntimeException('Runtime database connectivity mismatch.');
    $selectedDb = $pdo->query('SELECT DATABASE() AS name')->fetch()['name'] ?? '';
    if ($selectedDb !== EXPECTED_DB_NAME) throw new RuntimeException('Database name mismatch.');
    $currentMigrations = (int)($pdo->query('SELECT COUNT(*) AS cnt FROM migrations')->fetch()['cnt'] ?? -1);

    // Also validate runtime user connectivity in read-only preflight
    $runtimeDsn = "mysql:host={$ddlHost};port={$ddlPort};dbname={$ddlDatabase};charset=utf8mb4";
    $runtimePdo = new PDO($runtimeDsn, EXPECTED_RUNTIME_USER, $runtimePassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $runtimeSelectedDb = $runtimePdo->query('SELECT DATABASE() AS name')->fetch()['name'] ?? '';
    if ($runtimeSelectedDb !== EXPECTED_DB_NAME) throw new RuntimeException('Runtime user connected to unexpected database.');

    $preflightCheckpoint = 'installed_inventory';
    // 6. Check active release pointer and baseline state
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
            throw new RuntimeException("Rollback requires target 21 migrations in place, found {$currentMigrations}.");
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

        // Old seven-destination code must not be restored over expanded authority.
        assertRollbackCompatible($pdo);

        // Acquire installer lock for rollback
        $installerLockPath = $appRoot . '/shared/installer.lock';
        safePath($installerLockPath, $home);
        $installerLock = fopen($installerLockPath, 'c');
        if (!$installerLock || !flock($installerLock, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException('Installer lock active; cannot rollback.');
        }
        chmod($installerLockPath, 0600);

        // Exclude cron via Cache::lock on target active release
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
    $lock = \Illuminate\Support\Facades\Cache::lock('shared_hosting:cron:lease', 450, $token);
    if (!$lock->get()) exit(5);
    echo "LEASE_OK";
} catch (\Throwable) { exit(6); }
PHP;
        $leaseRes = runBounded([PHP_BINARY, '-d', 'display_errors=0', '-r', $leaseScript, $appRoot . '/releases/' . $targetReleaseId, $leaseToken], 25);
        if (trim($leaseRes['stdout']) !== 'LEASE_OK') {
            throw new RuntimeException('Failed to acquire cron exclusion lease on active release.');
        }
        $cronLeaseOwner = $leaseToken;

        // Enter maintenance mode
        safePath($maintenancePath, $home);
        file_put_contents($maintenancePath, makeMaintenancePayload(), LOCK_EX);
        chmod($maintenancePath, 0600);
        $maintenanceSet = true;
        // Maintenance rejects new HTTP requests; a single-transaction dump records a consistent DB snapshot.
    // Preservation digests below detect any remaining in-flight mutation during upgrade.

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
        $inst->run($installerLock);

        if (is_file($maintenancePath)) {
            @unlink($maintenancePath);
            $maintenanceSet = false;
        }

        echo "PASS: guarded code and static rollback complete. Additive database migrations are preserved and not automatically reverted.\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // A read-only check is valid after a completed upgrade, too. Verify actual
    // installed bytes/schema instead of rejecting the new state as an old-baseline failure.
    $preflightCheckpoint = 'active_release_and_schema';
    if ($mode === '--check' && $activePointer === $targetReleaseId) {
        $installedTarget = $appRoot . '/releases/' . $targetReleaseId;
        safePath($installedTarget, $home);
        if (!is_file($installedTarget . '/SOURCE_COMMIT.txt')
            || trim(file_get_contents($installedTarget . '/SOURCE_COMMIT.txt')) !== $targetSourceSha
            || !is_file($installedTarget . '/release-manifest.json')
            || hash_file('sha256', $installedTarget . '/release-manifest.json') !== $targetManifestSha) {
            throw new RuntimeException('Installed target source or manifest mismatch.');
        }
        foreach (['private_files' => $installedTarget, 'public_files' => $webroot] as $section => $base) {
            foreach ($candidateManifest[$section] ?? [] as $relative => $entry) {
                $file = $base . '/' . $relative;
                safePath($file, $home);
                if (!is_file($file) || hash_file('sha256', $file) !== $entry['sha256']) {
                    throw new RuntimeException('Installed target inventory mismatch.');
                }
            }
        }
        $actualNames = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
        if ($expectedMigrationNames !== $actualNames || is_file($maintenancePath)) {
            throw new RuntimeException('Installed target schema or maintenance state requires investigation.');
        }
        echo "PASS: already-installed target source, private/public bytes and 21 migration identities verified; no upgrade or evidence rewrite.\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // Baseline checks for --check and --upgrade: active pointer must be 7a8f0fa baseline
    if ($activePointer !== INSTALLED_RELEASE_ID) {
        throw new RuntimeException("Active release pointer mismatch: expected " . INSTALLED_RELEASE_ID . ", got {$activePointer}");
    }
    $oldNames = [];
    foreach (array_keys($installedManifest['private_files'] ?? []) as $file) {
        if (preg_match('#^backend/database/migrations/([a-zA-Z0-9_]+)\\.php$#D', $file, $m)) $oldNames[] = $m[1];
    }
    sort($oldNames, SORT_STRING);
    $actualNames = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
    if (count($oldNames) !== INSTALLED_MIGRATIONS || $oldNames !== $actualNames) throw new RuntimeException('Installed migration identities differ from immutable baseline.');
    if ($currentMigrations !== INSTALLED_MIGRATIONS) {
        throw new RuntimeException("Current migrations count ({$currentMigrations}) does not match expected 19 baseline.");
    }

    // -------------------------------------------------------------
    // MODE: --check
    // -------------------------------------------------------------
    if ($mode === '--check') {
        echo "PASS: verified baseline source 7a8f0fa, active release rel_20261013T082656_7a8f0fa_clean, 19 migrations, and upgrade candidate package.\n";
        if (function_exists('pcntl_alarm')) pcntl_alarm(0);
        return;
    }

    // -------------------------------------------------------------
    // MODE: --upgrade
    // -------------------------------------------------------------
    $stage = 'acquire_locks';
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
    $lock = \Illuminate\Support\Facades\Cache::lock('shared_hosting:cron:lease', 450, $token);
    if (!$lock->get()) exit(5);
    echo "LEASE_OK";
} catch (\Throwable) { exit(6); }
PHP;
    $leaseRes = runBounded([PHP_BINARY, '-d', 'display_errors=0', '-r', $leaseScript, $installedReleaseDir, $leaseToken], 25);
    if (trim($leaseRes['stdout']) !== 'LEASE_OK') {
        throw new RuntimeException('Failed to acquire cron exclusion lease on old application; cannot proceed.');
    }
    $cronLeaseOwner = $leaseToken;

    // Establish maintenance mode BEFORE taking backups
    $stage = 'maintenance';
    safePath($maintenancePath, $home);
    if (!is_dir(dirname($maintenancePath))) mkdir(dirname($maintenancePath), 0700, true);
    file_put_contents($maintenancePath, makeMaintenancePayload(), LOCK_EX);
    chmod($maintenancePath, 0600);
    $maintenanceSet = true;
    usleep(500000); // 500ms request drain

    // Re-check installed baseline under maintenance & lock before mutation
    if (trim(file_get_contents($pointerPath)) !== INSTALLED_RELEASE_ID ||
        hash_file('sha256', $installedManifestPath) !== INSTALLED_MANIFEST_SHA) {
        throw new RuntimeException('State mismatch detected under maintenance lock.');
    }

    $stage = 'critical_baseline';
    $tableHashesBefore = preservationDigests($pdo);
    $runtimeEnvHash = hash_file('sha256', $runtimeEnvPath);

    // Ensure shared/config/.env exists for the installer
    if (!is_file($sharedConfigEnv)) {
        if (!is_dir(dirname($sharedConfigEnv))) mkdir(dirname($sharedConfigEnv), 0700, true);
        file_put_contents($sharedConfigEnv, $runtimeEnv, LOCK_EX);
        chmod($sharedConfigEnv, 0600);
    }

    // Verified Private Backups during maintenance
    $stage = 'backup_database';
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
    runBounded([$tarBin, '-czf', $publicBackupPath, '-C', $webroot, '.'], 120);
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
        '-C', $appRoot, ...$privateEntries], 120);
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
    require_once $installerPath;
    $installerInstance = new HostPapaInstaller([
        $installerPath,
        '--action=install',
        '--package-dir=' . $candidatePkgDir,
        '--approval-file=' . $approvalPath,
    ]);
    $installerInstance->run($installerLock);

    // Post-install verification
    $stage = 'post_verify';
    if (trim(file_get_contents($pointerPath)) !== $targetReleaseId) {
        throw new RuntimeException('Pointer update verification failed.');
    }
    // Verify required new source path is release/SOURCE_COMMIT.txt
    $newSourceFile = $appRoot . '/releases/' . $targetReleaseId . '/SOURCE_COMMIT.txt';
    safePath($newSourceFile, $home);
    if (!is_file($newSourceFile) || trim(file_get_contents($newSourceFile)) !== $targetSourceSha) {
        throw new RuntimeException('New release backend source commit verification failed.');
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

    $afterDigests = preservationDigests($pdo, array_keys($tableHashesBefore));
    if ($tableHashesBefore !== $afterDigests || hash_file('sha256', $runtimeEnvPath) !== $runtimeEnvHash) {
        throw new RuntimeException('Existing database records or shared configuration changed during upgrade; maintenance retained.');
    }

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
    if ($ownsKitLock && is_dir($kitRoot)) {
        $failureReceipt = [
            'outcome' => 'FAIL',
            'stage' => $stage,
            'preflight_checkpoint' => $stage === 'preflight' ? $preflightCheckpoint : null,
            'source_sha' => $targetSourceSha ?? null,
            'time' => gmdate('c'),
            'message' => 'Upgrade stopped; inspect private configuration, backup logs and retained backups before retry.',
            'maintenance_retained' => $maintenanceSet,
            'maintenance_observed' => is_file($maintenancePath),
        ];
        // Observational failures must not destroy installation/rollback evidence.
        // Retain every invocation and use a separate last-failure report.
        $failureBytes = json_encode($failureReceipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
        $eventPath = $kitRoot . '/production-upgrade-failure-' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.json';
        @file_put_contents($eventPath, $failureBytes, LOCK_EX);
        @chmod($eventPath, 0600);
        @file_put_contents($kitRoot . '/production-upgrade-last-failure.json', $failureBytes, LOCK_EX);
        @chmod($kitRoot . '/production-upgrade-last-failure.json', 0600);
    }
    // If failure occurred pre-migration before backups, safe to clear maintenance; otherwise retain it!
    if ($stage === 'maintenance' && $maintenanceSet && is_file($maintenancePath)) {
        @unlink($maintenancePath);
    }
    fwrite(STDERR, "FAIL: upgrade runner stopped at " . $stage . "; no credential details printed. Do not remove the attempt marker or retry blindly.\n");
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
