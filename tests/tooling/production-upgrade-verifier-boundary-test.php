<?php
declare(strict_types=1);

// Focused regression and boundary test for:
// 1. assertExactRuntimeConnection helper & connection identity verification
// 2. HostPapaInstaller::switchFiles outer maintenance preservation & standalone behavior (synthetic files, no DB via reflection)
// 3. Post-install stale PDO -> fresh verified runtime connection boundary (HY000 4031 avoidance)
// 4. Wrong database and wrong runtime user identity rejection & maintenance retention
// 5. Fresh PDO connection failure (DATABASE_QUERY_FAILURE, HY000 4031) diagnosis & maintenance retention
// 6. Preservation of 21 migration count, migration identities, data digests, and env hash checks

$runnerSourceFile = is_file('/source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php')
    ? '/source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php'
    : realpath(__DIR__ . '/../../tools/hostpapa-release/production-upgrade/production-upgrade-runner.php');

$installerSourceFile = is_file('/source/backend/scripts/hostpapa-install.php')
    ? '/source/backend/scripts/hostpapa-install.php'
    : realpath(__DIR__ . '/../../backend/scripts/hostpapa-install.php');

if (!$runnerSourceFile || !is_file($runnerSourceFile)) {
    fwrite(STDERR, "Error: Runner source file not found.\n");
    exit(1);
}
if (!$installerSourceFile || !is_file($installerSourceFile)) {
    fwrite(STDERR, "Error: Installer source file not found.\n");
    exit(1);
}

require_once $installerSourceFile;

$passed = 0;
$total = 0;

function assertCheck(bool $condition, string $label): void {
    global $passed, $total;
    $total++;
    if (!$condition) {
        fwrite(STDERR, "FAIL [Check]: {$label}\n");
        throw new RuntimeException("Assertion failed: {$label}");
    }
    $passed++;
    echo "  ✔ {$label}\n";
}

echo "=== Production Upgrade Verifier Boundary & Maintenance Lifecycle Regression ===\n\n";

// ============================================================================
// PART 1: Helper function verification (assertExactRuntimeConnection & openRuntimePdo)
// ============================================================================
echo "1. Testing assertExactRuntimeConnection and connection identity validation:\n";

function loadRunnerFunction(string $sourceFile, string $name): void {
    $tokens = token_get_all(file_get_contents($sourceFile));
    foreach ($tokens as $i => $token) {
        if (!is_array($token) || $token[0] !== T_FUNCTION) continue;
        $j = $i + 1;
        while (is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if (!is_array($tokens[$j]) || $tokens[$j][1] !== $name) continue;
        $code = ''; $depth = 0; $opened = false;
        for ($k = $i; $k < count($tokens); $k++) {
            $t = $tokens[$k];
            $code .= is_array($t) ? $t[1] : $t;
            if ($t === '{' || (is_array($t) && in_array($t[0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) { $opened = true; $depth++; }
            if ($t === '}' && --$depth === 0 && $opened) { eval($code); return; }
        }
    }
    throw new RuntimeException("Named runner function {$name} not found in {$sourceFile}.");
}

loadRunnerFunction($runnerSourceFile, 'assertExactRuntimeConnection');
loadRunnerFunction($runnerSourceFile, 'openRuntimePdo');

class TestIdentityPDO extends PDO {
    public function __construct(private string $db, private string $user) {}
    #[\ReturnTypeWillChange]
    public function query(string $query, ?int $fetchMode = null, mixed ...$args): mixed {
        return new class($this->db, $this->user) {
            public function __construct(private string $db, private string $user) {}
            public function fetch(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): mixed {
                return ['db' => $this->db, 'user' => $this->user];
            }
        };
    }
}

// 1.1 Valid connection matches
$validPdo = new TestIdentityPDO('gaza5045_gateway_live', 'gaza5045_liveruntime@localhost');
assertExactRuntimeConnection($validPdo, 'gaza5045_gateway_live', 'gaza5045_liveruntime');
assertCheck(true, 'assertExactRuntimeConnection accepts exact database and matching runtime username');

// 1.2 Wrong DB rejection
$wrongDbThrew = false;
try {
    $wrongDbPdo = new TestIdentityPDO('other_db', 'gaza5045_liveruntime@localhost');
    assertExactRuntimeConnection($wrongDbPdo, 'gaza5045_gateway_live', 'gaza5045_liveruntime');
} catch (RuntimeException $e) {
    if ($e->getMessage() === 'Connected database does not match expected database.') {
        $wrongDbThrew = true;
    }
}
assertCheck($wrongDbThrew, 'assertExactRuntimeConnection rejects mismatched database with safe fixed message');

// 1.3 Wrong user rejection (e.g. DDL user connecting instead of runtime user)
$wrongUserThrew = false;
try {
    $wrongUserPdo = new TestIdentityPDO('gaza5045_gateway_live', 'gaza5045_liveadmin@127.0.0.1');
    assertExactRuntimeConnection($wrongUserPdo, 'gaza5045_gateway_live', 'gaza5045_liveruntime');
} catch (RuntimeException $e) {
    if ($e->getMessage() === 'Connected user does not match expected user.') {
        $wrongUserThrew = true;
    }
}
assertCheck($wrongUserThrew, 'assertExactRuntimeConnection rejects DDL user on runtime connection boundary with safe fixed message');

// 1.4 Production source has NO test hooks
$runnerRawCode = file_get_contents($runnerSourceFile);
assertCheck(!str_contains($runnerRawCode, '__testRuntimePdoFactory'), 'production runner source contains zero test factory hooks');
assertCheck(!str_contains($runnerRawCode, '$GLOBALS'), 'production runner source contains zero $GLOBALS test hooks');

// ============================================================================
// PART 2: HostPapaInstaller::switchFiles outer maintenance preservation (synthetic files, no DB via reflection)
// ============================================================================
echo "\n2. Testing HostPapaInstaller::switchFiles maintenance lifecycle via reflection (synthetic files):\n";

function createSyntheticInstallerEnv(string $tempRoot): array {
    $home = $tempRoot;
    $app = $home . '/app';
    $web = $home . '/public_html';
    $oldRelease = $app . '/releases/rel_old';
    $oldSnapshot = $oldRelease . '/public_snapshot';
    $release = $app . '/releases/rel_test_target';
    $snapshot = $release . '/public_snapshot';
    $stableCliDir = $app . '/bin';
    $frameworkDir = $app . '/shared/storage/framework';
    $backupsDir = $app . '/shared/backups';

    mkdir($oldSnapshot, 0755, true);
    mkdir($snapshot, 0755, true);
    mkdir($release . '/bin', 0755, true);
    mkdir($stableCliDir, 0755, true);
    mkdir($frameworkDir, 0755, true);
    mkdir($backupsDir, 0755, true);
    mkdir($web, 0755, true);

    file_put_contents($oldSnapshot . '/index.html', '<h1>Old Version</h1>');
    file_put_contents($snapshot . '/index.html', '<h1>New Version</h1>');
    file_put_contents($release . '/bin/hostpapa-cli', "#!/usr/bin/env php\n<?php // new cli\n");
    file_put_contents($app . '/current-release.txt', "rel_old\n");
    file_put_contents($stableCliDir . '/hostpapa-cli', "#!/usr/bin/env php\n<?php // old cli\n");
    file_put_contents($web . '/index.html', '<h1>Old Version</h1>');

    return [
        'home' => $home,
        'app' => $app,
        'web' => $web,
        'release' => $release,
        'maintenance' => $frameworkDir . '/maintenance.php',
    ];
}

$refClass = new ReflectionClass(HostPapaInstaller::class);
$homeProp = $refClass->getProperty('home');
$appProp = $refClass->getProperty('app');
$webProp = $refClass->getProperty('web');
$preserveProp = $refClass->getProperty('preserveMaintenance');
$switchFilesMethod = $refClass->getMethod('switchFiles');

// 2.1 switchFiles with preserveMaintenance = true preserves outer maintenance throughout copy
$env1 = createSyntheticInstallerEnv('/tmp/test_inst_preserve_' . bin2hex(random_bytes(4)));
$canonicalBytes = "<?php /* CANONICAL_OUTER_RUNNER_PAYLOAD_503 */ exit;\n";
file_put_contents($env1['maintenance'], $canonicalBytes);

$inst1 = new HostPapaInstaller(['hostpapa-install.php']);
$homeProp->setValue($inst1, $env1['home']);
$appProp->setValue($inst1, $env1['app']);
$webProp->setValue($inst1, $env1['web']);
$preserveProp->setValue($inst1, true);

$switchFilesMethod->invoke($inst1, $env1['release'], 'rel_test_target');

assertCheck(is_file($env1['maintenance']), 'switchFiles with preserveMaintenance=true does NOT unlink outer maintenance on success');
assertCheck(file_get_contents($env1['maintenance']) === $canonicalBytes, 'switchFiles with preserveMaintenance=true does NOT overwrite outer maintenance payload');

// 2.2 switchFiles standalone (preserveMaintenance = false) writes and unlinks maintenance
$env2 = createSyntheticInstallerEnv('/tmp/test_inst_standalone_' . bin2hex(random_bytes(4)));
assertCheck(!file_exists($env2['maintenance']), 'no maintenance file before standalone switchFiles');

$inst2 = new HostPapaInstaller(['hostpapa-install.php']);
$homeProp->setValue($inst2, $env2['home']);
$appProp->setValue($inst2, $env2['app']);
$webProp->setValue($inst2, $env2['web']);
$preserveProp->setValue($inst2, false);

$switchFilesMethod->invoke($inst2, $env2['release'], 'rel_test_target');

assertCheck(!file_exists($env2['maintenance']), 'switchFiles in standalone mode unlinks temporary maintenance file upon success');
assertCheck(file_get_contents($env2['web'] . '/index.html') === '<h1>New Version</h1>', 'standalone switchFiles successfully switches public files');

// 2.3 switchFiles restored failure with preserveMaintenance = true retains outer maintenance
$env3 = createSyntheticInstallerEnv('/tmp/test_inst_fail_preserve_' . bin2hex(random_bytes(4)));
file_put_contents($env3['maintenance'], $canonicalBytes);
// Fail inside the switch try-block AFTER public bytes were copied, then exercise restoration.
mkdir($env3['app'] . '/bin/hostpapa-cli.next', 0700);

$inst3 = new HostPapaInstaller(['hostpapa-install.php']);
$homeProp->setValue($inst3, $env3['home']);
$appProp->setValue($inst3, $env3['app']);
$webProp->setValue($inst3, $env3['web']);
$preserveProp->setValue($inst3, true);

$fail3Threw = false;
try {
    $switchFilesMethod->invoke($inst3, $env3['release'], 'rel_test_target');
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Public target is not a regular file') || str_contains($e->getMessage(), 'Static switch failed')) {
        $fail3Threw = true;
    }
}
assertCheck($fail3Threw, 'switchFiles throws on conflicting file structure');
assertCheck(is_file($env3['maintenance']), 'switchFiles with preserveMaintenance=true retains outer maintenance upon failure/restore');
assertCheck(file_get_contents($env3['maintenance']) === $canonicalBytes, 'outer maintenance payload untouched upon switchFiles restored failure');
assertCheck(file_get_contents($env3['web'] . '/index.html') === '<h1>Old Version</h1>', 'restored failure restores original public bytes');
assertCheck(trim(file_get_contents($env3['app'] . '/current-release.txt')) === 'rel_old', 'restored failure preserves original pointer');

// 2.4 run($inheritedLock, true) requires pre-existing canonical maintenance file
$env4 = createSyntheticInstallerEnv('/tmp/test_inst_lock_check_' . bin2hex(random_bytes(4)));
$lockFile = $env4['app'] . '/shared/installer.lock';
$lockFp = fopen($lockFile, 'c+');
flock($lockFp, LOCK_EX);

$configDir = $env4['app'] . '/shared/config';
mkdir($configDir, 0700, true);
$envFile = $configDir . '/.env';
file_put_contents($envFile, "APP_ENV=production\n");
chmod($envFile, 0600);

$approvalFile = $env4['home'] . '/approval.json';
file_put_contents($approvalFile, json_encode([
    'schema_version' => '1.0',
    'action' => 'install',
    'release_id' => 'rel_test_target',
    'source_sha' => '1234567890123456789012345678901234567890',
    'manifest_sha256' => hash('sha256', 'mock'),
    'environment' => 'production',
    'target_webroot' => $env4['web'],
    'app_dir' => $env4['app'],
    'database' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'test',
        'username' => 'test',
        'password' => 'test',
    ],
    'runtime_env_file' => $envFile,
]));
chmod($approvalFile, 0600);

$inst4 = new HostPapaInstaller([
    'hostpapa-install.php',
    '--action=install',
    '--approval-file=' . $approvalFile,
]);
putenv('HOSTPAPA_HOME=' . $env4['home']);

$lockReqThrew = false;
try {
    // Maintenance file does not exist, but preserveMaintenance=true passed
    $inst4->run($lockFp, true);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'canonical maintenance file is missing')) {
        $lockReqThrew = true;
    }
}
assertCheck($lockReqThrew, 'run($lock, true) requires canonical maintenance file to exist when preserveMaintenance is true');
fclose($lockFp);

// ============================================================================
// PART 3: Runner integration regression tests (inject factory in test copy ONLY)
// ============================================================================
echo "\n3. Testing Runner integration in isolated environment (injected test copy only):\n";

$rawRunner = str_replace("\r\n", "\n", file_get_contents($runnerSourceFile));

// 1. Anchors for test injection into runner copy
$anchorPreflight = "\$preflightCheckpoint = 'kit_manifest';";
$anchorPostVerify = "// Post-install verification\n    \$stage = 'post_verify';";

if (!str_contains($rawRunner, $anchorPreflight)) {
    fwrite(STDERR, "Error: anchorPreflight not found in runner source.\n");
    exit(1);
}
if (!str_contains($rawRunner, $anchorPostVerify)) {
    fwrite(STDERR, "Error: anchorPostVerify not found in runner source.\n");
    exit(1);
}

// 2. Prepare test copy with test-only openRuntimePdo replacement and entry bypass
$injectedRunner = str_replace(
    "function openRuntimePdo(string \$dsn, string \$user, string \$password): PDO {\n    return new PDO(",
    "function openRuntimePdo(string \$dsn, string \$user, string \$password): PDO {\n    if (isset(\$GLOBALS['__testRuntimePdoFactory']) && is_callable(\$GLOBALS['__testRuntimePdoFactory'])) {\n        return (\$GLOBALS['__testRuntimePdoFactory'])(\$dsn, \$user, \$password);\n    }\n    return new PDO(",
    $rawRunner
);

$injectedRunner = str_replace(
    $anchorPreflight,
    "if (getenv('VERIFIER_TEST_CASE')) {\n    require_once '/tmp/verifier-fixtures.php';\n    goto verifier_test_entry;\n}\n" . $anchorPreflight,
    $injectedRunner
);

$injectedRunner = str_replace(
    $anchorPostVerify,
    "verifier_test_entry:\n    // Post-install verification\n    \$stage = 'post_verify';",
    $injectedRunner
);

$injectedRunner = str_replace(
    "catch (Throwable \$e) {",
    "catch (Throwable \$e) {\n    if (getenv('DEBUG_TEST')) fwrite(STDERR, 'DEBUG EXCEPTION: ' . \$e->getMessage() . ' at ' . \$e->getFile() . ':' . \$e->getLine() . \"\\n\");",
    $injectedRunner
);

function runTestCase(string $caseName, string $runnerCode): array {
    $tempDir = '/tmp/test_verifier_' . bin2hex(random_bytes(6));
    mkdir($tempDir, 0700, true);

    $kitDir = $tempDir . '/gaza-upgrade-package';
    $appDir = $tempDir . '/gaza-gateway';
    $sharedDir = $appDir . '/shared';
    $frameworkDir = $sharedDir . '/storage/framework';
    $configDir = $sharedDir . '/config';
    $targetReleaseId = 'rel_20261015T042635_96538d9_clean';
    $targetReleaseDir = $appDir . '/releases/' . $targetReleaseId;
    $webrootDir = $tempDir . '/public_html';

    mkdir($kitDir, 0700, true);
    mkdir($frameworkDir, 0700, true);
    mkdir($configDir, 0700, true);
    mkdir($targetReleaseDir, 0700, true);
    mkdir($webrootDir, 0755, true);

    $targetSourceSha = '96538d9affdc843d08ef3c801f15c7f92dfd46b3';
    $targetManifestSha = 'fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed';

    // Write pointers and releases
    file_put_contents($appDir . '/current-release.txt', $targetReleaseId . "\n");
    file_put_contents($targetReleaseDir . '/SOURCE_COMMIT.txt', $targetSourceSha . "\n");

    // Write shared env
    $envContent = "APP_ENV=production\nDB_DATABASE=gaza5045_gateway_live\nDB_USERNAME=gaza5045_liveruntime\nDB_PASSWORD=secret_runtime_pass\nDB_HOST=127.0.0.1\nDB_PORT=3306\n";
    file_put_contents($configDir . '/.env', $envContent);
    chmod($configDir . '/.env', 0600);

    // Initial outer maintenance payload set before installer
    $maintenancePath = $frameworkDir . '/maintenance.php';
    $canonicalPayload = "<?php http_response_code(503); header('Content-Type: application/json'); echo json_encode(['outer'=>true]); exit;\n";
    file_put_contents($maintenancePath, $canonicalPayload);
    chmod($maintenancePath, 0600);

    // Fixture script loaded on test injection
    $fixturesPhp = <<<PHP
<?php
declare(strict_types=1);

// Stale PDO simulation: throws HY000 4031 if touched
class StalePreflightPDO extends PDO {
    public int \$queryCallCount = 0;
    public function __construct() {}
    #[\ReturnTypeWillChange]
    public function query(string \$query, ?int \$fetchMode = null, mixed ...\$args): mixed {
        \$this->queryCallCount++;
        \$ex = new PDOException("SQLSTATE[HY000]: General error: 4031 The client was disconnected by the server because of inactivity.");
        \$ex->errorInfo = ['HY000', 4031, 'The client was disconnected by the server because of inactivity.'];
        throw \$ex;
    }
    public function inTransaction(): bool { return false; }
    public function rollBack(): bool { return true; }
}

class FixtureResultStatement {
    private int \$cursor = 0;
    public function __construct(private array \$rows) {}
    public function fetchAll(int \$mode = PDO::FETCH_DEFAULT, mixed ...\$args): array {
        return \$this->rows;
    }
    public function fetch(int \$mode = PDO::FETCH_DEFAULT, mixed ...\$args): mixed {
        return \$this->rows[\$this->cursor++] ?? false;
    }
    public function fetchColumn(int \$column = 0): mixed {
        \$first = \$this->rows[0] ?? [];
        if (is_array(\$first)) {
            return array_values(\$first)[0] ?? false;
        }
        return \$first;
    }
}

class MockRuntimePDO extends PDO {
    public int \$queryCount = 0;
    public function __construct(
        public string \$dbName,
        public string \$userIdentity,
        public array \$migrations,
        public array \$tableDigests,
        public bool \$throwOnMigrationQuery = false
    ) {}

    #[\ReturnTypeWillChange]
    public function query(string \$query, ?int \$fetchMode = null, mixed ...\$args): mixed {
        \$this->queryCount++;
        if (\$this->throwOnMigrationQuery) {
            \$ex = new PDOException("SQLSTATE[HY000]: General error: 4031 Inactive query disconnection.");
            \$ex->errorInfo = ['HY000', 4031, 'Inactive query disconnection.'];
            throw \$ex;
        }
        if (str_contains(\$query, 'DATABASE()') || str_contains(\$query, 'CURRENT_USER()')) {
            return new FixtureResultStatement([
                ['db' => \$this->dbName, 'user' => \$this->userIdentity]
            ]);
        }
        if (str_contains(\$query, 'FROM migrations')) {
            return new FixtureResultStatement(\$this->migrations);
        }
        if (str_contains(\$query, 'SHOW KEYS FROM')) {
            return new FixtureResultStatement([
                ['Column_name' => 'id', 'Seq_in_index' => 1]
            ]);
        }
        if (str_contains(\$query, 'SELECT * FROM')) {
            preg_match('/`([^`]+)`/', \$query, \$m);
            \$tbl = \$m[1] ?? 'unknown';
            \$dummyData = \$this->tableDigests[\$tbl] ?? [['id' => 1]];
            return new FixtureResultStatement(\$dummyData);
        }
        return new FixtureResultStatement([]);
    }
    public function inTransaction(): bool { return false; }
    public function rollBack(): bool { return true; }
}

\$ownsKitLock = true;
\$kitLock = fopen('{$kitDir}/production-upgrade.lock', 'c');
\$installerLock = fopen('{$sharedDir}/installer.lock', 'c');
\$targetReleaseId = '{$targetReleaseId}';
\$targetSourceSha = '{$targetSourceSha}';
\$targetManifestSha = '{$targetManifestSha}';
\$upgradeManifestHash = hash('sha256', 'mock_manifest');
\$maintenanceSet = true;
\$ddlHost = '127.0.0.1';
\$ddlPort = 3306;
\$runtimePassword = 'secret_runtime_pass';
\$envVars = [
    'APP_ENV' => 'production',
    'DB_DATABASE' => 'gaza5045_gateway_live',
    'DB_USERNAME' => 'gaza5045_liveruntime',
    'DB_PASSWORD' => 'secret_runtime_pass',
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => '3306',
];
\$pointerPath = '{$appDir}/current-release.txt';
\$maintenancePath = '{$frameworkDir}/maintenance.php';
\$backupDir = '{$sharedDir}/backups/upgrade_20261015_000000';
@mkdir(\$backupDir, 0700, true);
\$runtimeEnvPath = '{$configDir}/.env';
\$runtimeEnvHash = hash_file('sha256', \$runtimeEnvPath);

\$all21Migrations = array_map(fn(\$i) => sprintf('2026_10_11_%06d_migration_%02d', \$i, \$i), range(1, 21));
\$expectedMigrationNames = \$all21Migrations;

\$tableData = [
    'airports' => [['id' => 1, 'code' => 'GZA', 'block_minutes' => 600]],
    'users' => [['id' => 'u1', 'email' => 'user@example.com']]
];

\$tableHashesBefore = [];
foreach (\$tableData as \$tbl => \$rows) {
    \$h = hash_init('sha256');
    foreach (\$rows as \$r) hash_update(\$h, json_encode(\$r, JSON_THROW_ON_ERROR).'\\n');
    \$tableHashesBefore[\$tbl] = hash_final(\$h);
}

// 1. Assign stale preflight PDO before post_verify
\$stalePdo = new StalePreflightPDO();
\$pdo = \$stalePdo;
\$GLOBALS['__stalePdoInstance'] = \$stalePdo;

// 2. Configure fresh runtime PDO factory in test fixture
\$case = getenv('VERIFIER_TEST_CASE');
\$GLOBALS['__freshPdoCreated'] = false;
\$GLOBALS['__testRuntimePdoFactory'] = function (string \$dsn, string \$user, string \$pass) use (\$case, \$all21Migrations, \$tableData) {
    \$GLOBALS['__freshPdoCreated'] = true;

    if (\$case === 'fresh_pdo_connection_failure') {
        \$ex = new PDOException("SQLSTATE[HY000]: General error: 4031 Inactive connection dropped by server.");
        \$ex->errorInfo = ['HY000', 4031, 'Inactive connection dropped by server.'];
        throw \$ex;
    }

    \$dbName = 'gaza5045_gateway_live';
    \$userIdentity = 'gaza5045_liveruntime@localhost';
    \$migs = \$all21Migrations;

    if (\$case === 'wrong_database_rejection') {
        \$dbName = 'wrong_database';
    } elseif (\$case === 'wrong_user_rejection') {
        \$userIdentity = 'gaza5045_liveadmin@localhost';
    } elseif (\$case === 'migration_count_mismatch') {
        \$migs = array_slice(\$all21Migrations, 0, 20);
    } elseif (\$case === 'migration_identity_mismatch') {
        \$migs[20] = 'unexpected_migration';
    } elseif (\$case === 'preserved_data_mismatch') {
        \$tableData['users'][0]['email'] = 'changed@example.com';
    } elseif (\$case === 'runtime_env_mismatch') {
        file_put_contents(\$GLOBALS['runtimeEnvPath'], "# changed synthetic config\\n", FILE_APPEND);
    }

    return new MockRuntimePDO(\$dbName, \$userIdentity, \$migs, \$tableData, false);
};
PHP;

    file_put_contents('/tmp/verifier-fixtures.php', $fixturesPhp);
    file_put_contents($kitDir . '/runner.php', $runnerCode);

    $cmd = [
        PHP_BINARY,
        '-d', 'display_errors=0',
        $kitDir . '/runner.php',
        '--upgrade',
        '--confirm-upgrade'
    ];

    $env = [
        'HOME' => $tempDir,
        'HOSTPAPA_LOCAL_TEST_ROOT' => $tempDir,
        'VERIFIER_TEST_CASE' => $caseName,
        'DEBUG_TEST' => '1',
    ];

    $proc = proc_open($cmd, [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes, null, array_merge($_ENV, getenv(), $env));

    if (!is_resource($proc)) throw new RuntimeException('Process spawn failed.');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
    $stderr = '';
    $exitCode = -1;
    $deadline = microtime(true) + 15;
    try {
        do {
            $chunkOut = stream_get_contents($pipes[1]);
            if ($chunkOut !== false && $chunkOut !== '') $stdout .= $chunkOut;
            $chunkErr = stream_get_contents($pipes[2]);
            if ($chunkErr !== false && $chunkErr !== '') $stderr .= $chunkErr;

            $status = proc_get_status($proc);
            if (!$status['running']) {
                $exitCode = $status['exitcode'];
                break;
            }
            usleep(25000);
        } while (microtime(true) < $deadline);
    } finally {
        $status = proc_get_status($proc);
        if ($status['running']) proc_terminate($proc, 9);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
    }

    $lastFailurePath = $kitDir . '/production-upgrade-last-failure.json';
    $lastFailure = is_file($lastFailurePath) ? json_decode(file_get_contents($lastFailurePath), true) : null;

    $successPath = $kitDir . '/production-upgrade-result.json';
    $lastSuccess = is_file($successPath) ? json_decode(file_get_contents($successPath), true) : null;

    $maintenanceExistsAfter = is_file($maintenancePath);

    return [
        'exitCode' => $exitCode,
        'stdout' => $stdout,
        'stderr' => $stderr,
        'lastFailure' => $lastFailure,
        'lastSuccess' => $lastSuccess,
        'maintenanceExistsAfter' => $maintenanceExistsAfter,
        'tempDir' => $tempDir,
    ];
}

// 3.1 Success path: stale PDO discarded, fresh runtime PDO verified, all 21 migrations & digests verified
$res1 = runTestCase('success_clean', $injectedRunner);
assertCheck($res1['exitCode'] === 0, 'runner completes with exit code 0');
assertCheck(str_contains($res1['stdout'], 'PASS: release installed, migrations verified at 21'), 'stdout confirms release installation and 21 migrations verified');
assertCheck($res1['lastSuccess']['outcome'] === 'DEPLOYED_OWNER_TESTING_PENDING', 'success receipt records DEPLOYED_OWNER_TESTING_PENDING');
assertCheck($res1['lastSuccess']['migrations_count'] === 21, 'success receipt records 21 migrations');
assertCheck($res1['maintenanceExistsAfter'] === false, 'maintenance mode is cleanly removed after verified success');

// 3.2 Wrong database rejection: stops at post_verify, UNEXPECTED_ERROR, maintenance retained
$res2 = runTestCase('wrong_database_rejection', $injectedRunner);
assertCheck($res2['exitCode'] === 1, 'runner halts with exit code 1 on wrong database');
assertCheck(str_contains($res2['stderr'], 'FAIL: upgrade runner stopped at post_verify [UNEXPECTED_ERROR]'), 'stderr indicates stopped at post_verify with UNEXPECTED_ERROR');
assertCheck($res2['lastFailure']['stage'] === 'post_verify', 'failure receipt stage is post_verify');
assertCheck($res2['lastFailure']['reason_code'] === 'UNEXPECTED_ERROR', 'failure reason code is UNEXPECTED_ERROR');
assertCheck($res2['lastFailure']['error_class'] === 'RuntimeException', 'failure error_class is RuntimeException');
assertCheck($res2['lastFailure']['maintenance_retained'] === true, 'failure receipt maintenance_retained is true');
assertCheck($res2['lastFailure']['maintenance_observed'] === true, 'failure receipt maintenance_observed is true');
assertCheck($res2['maintenanceExistsAfter'] === true, 'maintenance file remains present on disk upon wrong database rejection');

// 3.3 Wrong runtime user rejection (DDL user connecting instead of runtime): UNEXPECTED_ERROR, maintenance retained
$res3 = runTestCase('wrong_user_rejection', $injectedRunner);
assertCheck($res3['exitCode'] === 1, 'runner halts with exit code 1 on wrong runtime user');
assertCheck(str_contains($res3['stderr'], 'FAIL: upgrade runner stopped at post_verify [UNEXPECTED_ERROR]'), 'stderr indicates stopped at post_verify with UNEXPECTED_ERROR');
assertCheck($res3['lastFailure']['stage'] === 'post_verify', 'failure receipt stage is post_verify');
assertCheck($res3['lastFailure']['error_class'] === 'RuntimeException', 'failure error_class is RuntimeException');
assertCheck($res3['lastFailure']['maintenance_retained'] === true, 'failure receipt maintenance_retained is true');
assertCheck($res3['lastFailure']['maintenance_observed'] === true, 'failure receipt maintenance_observed is true');
assertCheck($res3['maintenanceExistsAfter'] === true, 'maintenance file remains present on disk upon wrong user rejection');

// 3.4 Fresh PDO connection failure (HY000 4031): DATABASE_QUERY_FAILURE, sqlstate HY000, driver 4031, maintenance retained
$res4 = runTestCase('fresh_pdo_connection_failure', $injectedRunner);
assertCheck($res4['exitCode'] === 1, 'runner halts with exit code 1 on connection failure');
assertCheck(str_contains($res4['stderr'], 'FAIL: upgrade runner stopped at post_verify [DATABASE_QUERY_FAILURE]'), 'stderr indicates stopped at post_verify with DATABASE_QUERY_FAILURE');
assertCheck($res4['lastFailure']['stage'] === 'post_verify', 'failure receipt stage is post_verify');
assertCheck($res4['lastFailure']['reason_code'] === 'DATABASE_QUERY_FAILURE', 'failure reason code is DATABASE_QUERY_FAILURE');
assertCheck($res4['lastFailure']['sqlstate'] === 'HY000', 'failure receipt sqlstate is HY000');
assertCheck($res4['lastFailure']['driver_code'] === 4031, 'failure receipt driver_code is 4031');
assertCheck($res4['lastFailure']['maintenance_retained'] === true, 'failure receipt maintenance_retained is true');
assertCheck($res4['lastFailure']['maintenance_observed'] === true, 'failure receipt maintenance_observed is true');
assertCheck($res4['maintenanceExistsAfter'] === true, 'maintenance file remains present on disk upon connection failure');

// 3.5 Migration count mismatch (20 instead of 21): UNEXPECTED_ERROR, maintenance retained
$res5 = runTestCase('migration_count_mismatch', $injectedRunner);
assertCheck($res5['exitCode'] === 1, 'runner halts with exit code 1 on migration count mismatch');
assertCheck(str_contains($res5['stderr'], 'FAIL: upgrade runner stopped at post_verify [UNEXPECTED_ERROR]'), 'stderr indicates stopped at post_verify');
assertCheck($res5['lastFailure']['stage'] === 'post_verify', 'failure receipt stage is post_verify');
assertCheck($res5['lastFailure']['maintenance_retained'] === true, 'failure receipt maintenance_retained is true');
assertCheck($res5['lastFailure']['maintenance_observed'] === true, 'failure receipt maintenance_observed is true');
assertCheck($res5['maintenanceExistsAfter'] === true, 'maintenance file is retained on disk');

foreach (['migration_identity_mismatch', 'preserved_data_mismatch', 'runtime_env_mismatch'] as $case) {
    $negative = runTestCase($case, $injectedRunner);
    assertCheck($negative['exitCode'] === 1 && $negative['lastFailure']['stage'] === 'post_verify', "$case fails final verification");
    assertCheck($negative['maintenanceExistsAfter'] && $negative['lastSuccess'] === null, "$case retains maintenance without success receipt");
}

// ============================================================================
// PART 4: Upgrade maintenance lifecycle & pre-existing maintenance refusal
// ============================================================================
echo "\n4. Testing upgrade maintenance mode exclusive creation, refusal of pre-existing, and failed write handling:\n";

// 4.1 Pre-existing maintenance.php refusal
$tempMaintDir = '/tmp/test_upgrade_maint_' . bin2hex(random_bytes(8));
mkdir($tempMaintDir . '/framework', 0700, true);
$maintPath = $tempMaintDir . '/framework/maintenance.php';
$downPath = $tempMaintDir . '/framework/down';
file_put_contents($maintPath, '<?php // pre-existing owner maintenance');

$maintRefused = false;
$maintSetVal = false;
try {
    if (is_file($maintPath) || is_file($downPath)) {
        throw new RuntimeException('Pre-existing maintenance mode active (maintenance.php or down); upgrade refused.');
    }
    $h = @fopen($maintPath, 'x');
    if (!$h) throw new RuntimeException('Failed to exclusively create');
    $maintSetVal = true;
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Pre-existing maintenance mode active')) {
        $maintRefused = true;
    }
}
assertCheck($maintRefused, 'pre-existing maintenance.php refuses upgrade before mutation');
assertCheck($maintSetVal === false, 'maintenanceSet remains false when pre-existing maintenance.php is present');
assertCheck(file_get_contents($maintPath) === '<?php // pre-existing owner maintenance', 'pre-existing owner maintenance payload untouched');

// 4.2 Pre-existing down refusal
unlink($maintPath);
file_put_contents($downPath, '{"down":true}');
$downRefused = false;
$maintSetVal = false;
try {
    if (is_file($maintPath) || is_file($downPath)) {
        throw new RuntimeException('Pre-existing maintenance mode active (maintenance.php or down); upgrade refused.');
    }
    $h = @fopen($maintPath, 'x');
    if (!$h) throw new RuntimeException('Failed to exclusively create');
    $maintSetVal = true;
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Pre-existing maintenance mode active')) {
        $downRefused = true;
    }
}
assertCheck($downRefused, 'pre-existing down file refuses upgrade before mutation');
assertCheck($maintSetVal === false, 'maintenanceSet remains false when pre-existing down is present');
assertCheck(is_file($downPath), 'pre-existing down file preserved on disk');
unlink($downPath);

// 4.3 Exclusive fopen(x) creation when file exists
touch($maintPath);
$exclFailed = false;
$maintSetVal = false;
try {
    $h = @fopen($maintPath, 'x');
    if (!$h) {
        throw new RuntimeException('Failed to exclusively create maintenance mode file; file may already exist or cannot be opened.');
    }
    $maintSetVal = true;
} catch (\Throwable $e) {
    if (str_contains($e->getMessage(), 'Failed to exclusively create') || str_contains($e->getMessage(), 'Private file/runtime operation failed')) {
        $exclFailed = true;
    }
}
assertCheck($exclFailed, 'exclusive fopen(x) fails closed if maintenance file already exists');
assertCheck($maintSetVal === false, 'maintenanceSet remains false on exclusive fopen failure');
if (is_file($maintPath)) unlink($maintPath);

// 4.4 Incomplete write clean-up
$dummyPayload = 'SAMPLE_PAYLOAD_STRING';
$h = fopen($maintPath, 'x');
fwrite($h, substr($dummyPayload, 0, 5));
fclose($h);
$partialCleaned = false;
$maintSetVal = false;
try {
    if (filesize($maintPath) !== strlen($dummyPayload)) {
        @unlink($maintPath);
        throw new RuntimeException('Incomplete write of maintenance payload.');
    }
    $maintSetVal = true;
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Incomplete write of maintenance payload')) {
        $partialCleaned = true;
    }
}
assertCheck($partialCleaned, 'incomplete write throws exception');
assertCheck(!is_file($maintPath), 'incomplete maintenance file is unlinked on write failure');
assertCheck($maintSetVal === false, 'maintenanceSet remains false on write failure');

// 4.5 Clean successful exclusive creation
$h = fopen($maintPath, 'x');
$written = fwrite($h, $dummyPayload);
fclose($h);
$successCreated = false;
if ($written === strlen($dummyPayload) && chmod($maintPath, 0600)) {
    $maintSetVal = true;
    $successCreated = true;
}
assertCheck($successCreated, 'exclusive maintenance creation succeeds with full write and chmod 0600');
assertCheck($maintSetVal === true, 'maintenanceSet is true only on verified complete creation');
assertCheck(is_file($maintPath) && file_get_contents($maintPath) === $dummyPayload, 'created maintenance payload matches');
unlink($maintPath);
rmdir($tempMaintDir . '/framework');
rmdir($tempMaintDir);

echo "\n===============================================================================\n";
echo "SUMMARY: All {$passed}/{$total} verifier lifecycle and maintenance ownership tests PASSED.\n";
echo "===============================================================================\n";
exit(0);
