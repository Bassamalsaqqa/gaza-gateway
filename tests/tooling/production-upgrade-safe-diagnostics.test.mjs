import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const RUNNER_SRC_PATH = path.join(root, 'tools/hostpapa-release/production-upgrade/production-upgrade-runner.php');

const ANCHOR_1 = "$preflightCheckpoint = 'kit_manifest';";
const ANCHOR_2 = "$preflightCheckpoint = 'active_release_and_schema';";

// 1. Verify that the two injection anchors exist in the actual runner exactly once
const originalRunnerCode = fs.readFileSync(RUNNER_SRC_PATH, 'utf8');
assert.equal(originalRunnerCode.split(ANCHOR_1).length - 1, 1, 'ANCHOR_1 must occur exactly once in production-upgrade-runner.php');
assert.equal(originalRunnerCode.split(ANCHOR_2).length - 1, 1, 'ANCHOR_2 must occur exactly once in production-upgrade-runner.php');

// 2. Prepare test copy with exact two-point injection
const testRunnerCode = originalRunnerCode
  .replace(ANCHOR_1, `if (getenv('DIAGNOSTIC_TEST_CASE')) {
    require_once '/home/gaza5045/test-fixtures.php';
    goto diagnostic_test_entry;
}
$preflightCheckpoint = 'kit_manifest';`)
  .replace(ANCHOR_2, `diagnostic_test_entry:
$preflightCheckpoint = 'active_release_and_schema';`);

// 3. Write test-runner and test-fixtures into a temporary directory mounted into Docker
const fixtureDir = path.join(root, 'scratch/test-diagnostics-fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });
fs.writeFileSync(path.join(fixtureDir, 'runner.php'), testRunnerCode);

const fixturePhp = `<?php
declare(strict_types=1);

class FixtureStatement {
    public function __construct(private array $rows) {}
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
        return $this->rows;
    }
}

class FixturePDO extends PDO {
    private $handler;
    public function __construct(callable $handler) {
        $this->handler = $handler;
    }
    public function inTransaction(): bool {
        return false;
    }
    public function rollBack(): bool {
        return true;
    }
    public function commit(): bool {
        return true;
    }
    public function beginTransaction(): bool {
        return true;
    }
    #[\ReturnTypeWillChange]
    public function query(string $query, ?int $fetchMode = null, mixed ...$args): mixed {
        return ($this->handler)($query);
    }
}

$targetReleaseId = 'rel_20261014T120000_target';
$targetSourceSha = '1234567890abcdef1234567890abcdef12345678';
$targetManifestSha = '1111111111111111111111111111111111111111111111111111111111111111';
$targetMigrationCount = 21;
$upgradeManifestHash = '2222222222222222222222222222222222222222222222222222222222222222';

$baselineMigrationNames = array_map(fn($i) => sprintf('2026_10_11_%06d_mig', $i), range(1, 19));
$installedPrivateFiles = [];
foreach ($baselineMigrationNames as $name) {
    $installedPrivateFiles['backend/database/migrations/' . $name . '.php'] = ['sha256' => 'mock_sha'];
}
$installedManifest = [
    'source_sha' => INSTALLED_SOURCE_SHA,
    'release_id' => INSTALLED_RELEASE_ID,
    'private_files' => $installedPrivateFiles,
];

$candidateMigrationNames = array_map(fn($i) => sprintf('2026_10_11_%06d_mig', $i), range(1, 21));
$expectedMigrationNames = $candidateMigrationNames;
$candidateManifest = [
    'private_files' => [],
    'public_files' => [],
];

$activePointer = INSTALLED_RELEASE_ID;
$currentMigrations = 19;

$pdoRows = $baselineMigrationNames;
$pdoQueryHandler = function (string $query) use (&$pdoRows) {
    return new FixtureStatement($pdoRows);
};

$case = getenv('DIAGNOSTIC_TEST_CASE') ?: '';

switch ($case) {
    case 'baseline_pointer_mismatch':
        $activePointer = 'rel_corrupt_pointer_value_123';
        break;

    case 'migration_inventory_count_mismatch':
        $badFiles = [];
        for ($i = 1; $i <= 10; $i++) {
            $badFiles['backend/database/migrations/' . sprintf('2026_10_11_%06d_mig.php', $i)] = ['sha256' => 'mock'];
        }
        $installedManifest['private_files'] = $badFiles;
        break;

    case 'ledger_identity_mismatch':
        $pdoRows = array_map(fn($i) => sprintf('2026_10_11_%06d_other', $i), range(1, 19));
        break;

    case 'initial_count_mismatch':
        $currentMigrations = 18;
        break;

    case 'pdo_failure':
        $pdoQueryHandler = function (string $query) {
            $ex = new PDOException('SECRET_PDO_EXCEPTION_MESSAGE_SENTINEL_1111');
            $ex->errorInfo = ['HY000', 4031, 'SECRET_DRIVER_SENTINEL_MESSAGE_2222'];
            throw $ex;
        };
        break;

    case 'pdo_non_numeric_driver':
        $pdoQueryHandler = function (string $query) {
            $ex = new PDOException('SECRET_PDO_EX');
            $ex->errorInfo = ['HY000', '1e3', 'SECRET_DRIVER_MSG'];
            throw $ex;
        };
        break;

    case 'malformed_metadata':
        $targetSourceSha = 'PRIVATE_SOURCE_SENTINEL';
        $pdoQueryHandler = function (string $query) {
            $ex = new PDOException('PRIVATE_EXCEPTION_SENTINEL');
            $ex->errorInfo = ['PRIVATE_STATE_SENTINEL', 1.5, 'PRIVATE_DRIVER_SENTINEL'];
            throw $ex;
        };
        break;

    case 'unexpected_throwable':
        throw new RuntimeException('SECRET_UNEXPECTED_THROWABLE_SENTINEL_3333');

    case 'target_source_mismatch':
        $activePointer = $targetReleaseId;
        break;

    case 'target_maintenance_active':
        $activePointer = $targetReleaseId;
        @mkdir($appRoot . '/releases/' . $targetReleaseId, 0700, true);
        file_put_contents($appRoot . '/releases/' . $targetReleaseId . '/SOURCE_COMMIT.txt', $targetSourceSha);
        file_put_contents($appRoot . '/releases/' . $targetReleaseId . '/release-manifest.json', json_encode([
            'release_id' => $targetReleaseId,
            'source_sha' => $targetSourceSha,
            'private_files' => [],
            'public_files' => [],
        ]));
        $targetManifestSha = hash_file('sha256', $appRoot . '/releases/' . $targetReleaseId . '/release-manifest.json');
        $pdoRows = $expectedMigrationNames;
        @mkdir(dirname($maintenancePath), 0700, true);
        file_put_contents($maintenancePath, '<?php // maintenance');
        break;
}

$pdo = new FixturePDO($pdoQueryHandler);
`;
fs.writeFileSync(path.join(fixtureDir, 'test-fixtures.php'), fixturePhp);

function runCase(testCase, extraShellSetup = '', modeArg = '--check') {
  const script = `
set -e
mkdir -p /home/gaza5045/gaza-upgrade-package
mkdir -p /home/gaza5045/gaza-gateway
mkdir -p /home/gaza5045/public_html
mkdir -p /home/gaza5045/gaza-live-package

cp /fixtures/runner.php /home/gaza5045/gaza-upgrade-package/runner.php
cp /fixtures/test-fixtures.php /home/gaza5045/test-fixtures.php
${extraShellSetup}

set +e
php /home/gaza5045/gaza-upgrade-package/runner.php ${modeArg}
EXIT_CODE=$?

echo "---EXIT_CODE:$EXIT_CODE---"
if [ -f /home/gaza5045/gaza-upgrade-package/production-upgrade-last-failure.json ]; then
    echo "---RECEIPT_START---"
    cat /home/gaza5045/gaza-upgrade-package/production-upgrade-last-failure.json
    echo "---RECEIPT_END---"
fi
`;

  return spawnSync('docker', [
    'run', '--rm', '--pull=never', '--network=none',
    '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045',
    '-e', 'HOSTPAPA_HOME=/home/gaza5045',
    '-e', `DIAGNOSTIC_TEST_CASE=${testCase}`,
    '-v', `${fixtureDir}:/fixtures:ro`,
    'php:8.4-cli',
    'sh', '-c', script,
  ], { encoding: 'utf8', timeout: 30000 });
}

function parseOutput(res) {
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const exitMatch = stdout.match(/---EXIT_CODE:(\d+)---/);
  const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : res.status;

  let receipt = null;
  const receiptMatch = stdout.match(/---RECEIPT_START---([\s\S]*?)---RECEIPT_END---/);
  if (receiptMatch) {
    receipt = JSON.parse(receiptMatch[1].trim());
  }
  return { exitCode, receipt, stdout, stderr };
}

test('1. runner diagnoses BASELINE_POINTER_MISMATCH at active_release_and_schema with substep baseline_pointer', () => {
  const res = parseOutput(runCase('baseline_pointer_mismatch'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [BASELINE_POINTER_MISMATCH]'));
  assert.match(res.stderr, /\(invocation: [a-f0-9]{16}\)/);

  assert.ok(res.receipt);
  assert.equal(res.receipt.outcome, 'FAIL');
  assert.equal(res.receipt.stage, 'preflight');
  assert.equal(res.receipt.preflight_checkpoint, 'active_release_and_schema');
  assert.equal(res.receipt.preflight_substep, 'baseline_pointer');
  assert.equal(res.receipt.reason_code, 'BASELINE_POINTER_MISMATCH');
  assert.equal(res.receipt.mode, '--check');
  assert.match(res.receipt.invocation_id, /^[a-f0-9]{16}$/);
  assert.equal(res.receipt.error_class, 'UpgradeDiagnosticException');
  assert.equal(res.receipt.sqlstate, null);
  assert.equal(res.receipt.driver_code, null);
});

test('2. runner diagnoses BASELINE_MIGRATION_INVENTORY_COUNT_MISMATCH at substep baseline_inventory', () => {
  const res = parseOutput(runCase('migration_inventory_count_mismatch'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [BASELINE_MIGRATION_INVENTORY_COUNT_MISMATCH]'));
  assert.ok(res.receipt);
  assert.equal(res.receipt.reason_code, 'BASELINE_MIGRATION_INVENTORY_COUNT_MISMATCH');
  assert.equal(res.receipt.preflight_substep, 'baseline_inventory');
});

test('3. runner diagnoses LEDGER_IDENTITIES_MISMATCH at substep baseline_ledger_compare', () => {
  const res = parseOutput(runCase('ledger_identity_mismatch'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [LEDGER_IDENTITIES_MISMATCH]'));
  assert.ok(res.receipt);
  assert.equal(res.receipt.reason_code, 'LEDGER_IDENTITIES_MISMATCH');
  assert.equal(res.receipt.preflight_substep, 'baseline_ledger_compare');
});

test('4. runner diagnoses INITIAL_COUNT_MISMATCH at substep baseline_count_compare', () => {
  const res = parseOutput(runCase('initial_count_mismatch'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [INITIAL_COUNT_MISMATCH]'));
  assert.ok(res.receipt);
  assert.equal(res.receipt.reason_code, 'INITIAL_COUNT_MISMATCH');
  assert.equal(res.receipt.preflight_substep, 'baseline_count_compare');
});

test('5. runner captures PDO SQLSTATE HY000, driver 4031, DATABASE_QUERY_FAILURE and redacts errorInfo[2] sentinel', () => {
  const res = parseOutput(runCase('pdo_failure'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [DATABASE_QUERY_FAILURE]'));
  assert.ok(!res.stderr.includes('SECRET_PDO_EXCEPTION_MESSAGE_SENTINEL_1111'));
  assert.ok(!res.stderr.includes('SECRET_DRIVER_SENTINEL_MESSAGE_2222'));

  assert.ok(res.receipt);
  assert.equal(res.receipt.reason_code, 'DATABASE_QUERY_FAILURE');
  assert.equal(res.receipt.sqlstate, 'HY000');
  assert.equal(res.receipt.driver_code, 4031);
  assert.equal(res.receipt.error_class, 'PDOException');
  assert.equal(res.receipt.preflight_substep, 'baseline_ledger_query');

  const receiptStr = JSON.stringify(res.receipt);
  assert.ok(!receiptStr.includes('SECRET_PDO_EXCEPTION_MESSAGE_SENTINEL_1111'));
  assert.ok(!receiptStr.includes('SECRET_DRIVER_SENTINEL_MESSAGE_2222'));
});

test('6. runner rejects exponent driver code without numeric coercion', () => {
  const res = parseOutput(runCase('pdo_non_numeric_driver'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.receipt);
  assert.equal(res.receipt.sqlstate, 'HY000');
  assert.equal(res.receipt.driver_code, null, 'Driver code must be null when string is float/exponent');
});

test('runner excludes malformed source, SQLSTATE and floating driver metadata', () => {
  const res = parseOutput(runCase('malformed_metadata'));
  assert.equal(res.exitCode, 1);
  assert.equal(res.receipt.reason_code, 'DATABASE_QUERY_FAILURE');
  assert.equal(res.receipt.source_sha, null);
  assert.equal(res.receipt.sqlstate, null);
  assert.equal(res.receipt.driver_code, null);
  assert.ok(!`${res.stdout}${res.stderr}`.includes('PRIVATE_'));
});

test('7. runner diagnoses UNEXPECTED_ERROR with safe classname and redacts raw exception message', () => {
  const res = parseOutput(runCase('unexpected_throwable'));
  assert.equal(res.exitCode, 1);
  assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [UNEXPECTED_ERROR]'));
  assert.ok(!res.stderr.includes('SECRET_UNEXPECTED_THROWABLE_SENTINEL_3333'));

  assert.ok(res.receipt);
  assert.equal(res.receipt.reason_code, 'UNEXPECTED_ERROR');
  assert.equal(res.receipt.error_class, 'RuntimeException');
  assert.ok(!JSON.stringify(res.receipt).includes('SECRET_UNEXPECTED_THROWABLE_SENTINEL_3333'));
});

test('8. target active check diagnoses TARGET_MAINTENANCE_ACTIVE and TARGET_SOURCE_MISMATCH', () => {
  const resMaint = parseOutput(runCase('target_maintenance_active'));
  assert.equal(resMaint.exitCode, 1);
  assert.ok(resMaint.receipt);
  assert.equal(resMaint.receipt.reason_code, 'TARGET_MAINTENANCE_ACTIVE');
  assert.equal(resMaint.receipt.preflight_substep, 'target_maintenance');

  const resSource = parseOutput(runCase('target_source_mismatch'));
  assert.equal(resSource.exitCode, 1);
  assert.ok(resSource.receipt);
  assert.equal(resSource.receipt.reason_code, 'TARGET_SOURCE_MISMATCH');
  assert.equal(resSource.receipt.preflight_substep, 'target_source');
});

test('9. runner failure preserves durable result, success, attempt marker and existing maintenance unchanged', () => {
  const setup = `
mkdir -p /home/gaza5045/gaza-gateway/shared/storage/framework
echo '{"durable":"DURABLE_RESULT_SENTINEL"}' > /home/gaza5045/gaza-upgrade-package/production-upgrade-result.json
echo '{"durable":"DURABLE_SUCCESS_SENTINEL"}' > /home/gaza5045/gaza-upgrade-package/production-upgrade-success.json
echo 'DURABLE_ATTEMPT_SENTINEL' > /home/gaza5045/gaza-upgrade-package/production-upgrade-attempted
echo 'DURABLE_MAINTENANCE_SENTINEL' > /home/gaza5045/gaza-gateway/shared/storage/framework/maintenance.php
`;
  const res = runCase('baseline_pointer_mismatch', setup);
  const out = res.stdout;
  assert.equal(res.status, 0);

  // Check in container that files were preserved
  const verifyScript = `
cat /home/gaza5045/gaza-upgrade-package/production-upgrade-result.json
echo "---S1---"
cat /home/gaza5045/gaza-upgrade-package/production-upgrade-success.json
echo "---S2---"
cat /home/gaza5045/gaza-upgrade-package/production-upgrade-attempted
echo "---S3---"
cat /home/gaza5045/gaza-gateway/shared/storage/framework/maintenance.php
echo "---S4---"
stat -c "%a" /home/gaza5045/gaza-upgrade-package/production-upgrade-last-failure.json
`;
  const combined = setup + `\nphp /home/gaza5045/gaza-upgrade-package/runner.php --check || true\n` + verifyScript;
  const verifyRes = spawnSync('docker', [
    'run', '--rm', '--pull=never', '--network=none',
    '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045',
    '-e', 'HOSTPAPA_HOME=/home/gaza5045',
    '-e', 'DIAGNOSTIC_TEST_CASE=baseline_pointer_mismatch',
    '-v', `${fixtureDir}:/fixtures:ro`,
    'php:8.4-cli',
    'sh', '-c', `
mkdir -p /home/gaza5045/gaza-upgrade-package /home/gaza5045/gaza-gateway /home/gaza5045/public_html /home/gaza5045/gaza-live-package
cp /fixtures/runner.php /home/gaza5045/gaza-upgrade-package/runner.php
cp /fixtures/test-fixtures.php /home/gaza5045/test-fixtures.php
${combined}
`,
  ], { encoding: 'utf8' });

  const parts = verifyRes.stdout.split(/---S\d---/);
  assert.ok(parts[0].includes('DURABLE_RESULT_SENTINEL'), 'Result receipt preserved');
  assert.ok(parts[1].includes('DURABLE_SUCCESS_SENTINEL'), 'Success receipt preserved');
  assert.ok(parts[2].includes('DURABLE_ATTEMPT_SENTINEL'), 'Attempt marker preserved');
  assert.ok(parts[3].includes('DURABLE_MAINTENANCE_SENTINEL'), 'Maintenance mode preserved');
  assert.equal(parts[4].trim(), '600', 'Failure receipt has private 0600 permissions');
});

test('10. consecutive invocations generate distinct invocation IDs and preserve separate event receipts', () => {
  const multiScript = `
mkdir -p /home/gaza5045/gaza-upgrade-package /home/gaza5045/gaza-gateway /home/gaza5045/public_html /home/gaza5045/gaza-live-package
cp /fixtures/runner.php /home/gaza5045/gaza-upgrade-package/runner.php
cp /fixtures/test-fixtures.php /home/gaza5045/test-fixtures.php
php /home/gaza5045/gaza-upgrade-package/runner.php --check 2> /home/gaza5045/err1.txt || true
sleep 1
php /home/gaza5045/gaza-upgrade-package/runner.php --check 2> /home/gaza5045/err2.txt || true

cat /home/gaza5045/err1.txt
echo "---SPLIT---"
cat /home/gaza5045/err2.txt
echo "---SPLIT---"
ls -1 /home/gaza5045/gaza-upgrade-package/production-upgrade-failure-*.json | wc -l
`;

  const res = spawnSync('docker', [
    'run', '--rm', '--pull=never', '--network=none',
    '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045',
    '-e', 'HOSTPAPA_HOME=/home/gaza5045',
    '-e', 'DIAGNOSTIC_TEST_CASE=baseline_pointer_mismatch',
    '-v', `${fixtureDir}:/fixtures:ro`,
    'php:8.4-cli',
    'sh', '-c', multiScript,
  ], { encoding: 'utf8' });

  const parts = res.stdout.split('---SPLIT---');
  const m1 = parts[0].match(/\(invocation: ([a-f0-9]{16})\)/);
  const m2 = parts[1].match(/\(invocation: ([a-f0-9]{16})\)/);
  assert.ok(m1 && m2, 'Both invocations printed invocation IDs');
  assert.notEqual(m1[1], m2[1], 'Invocations must have distinct IDs');
  const count = parseInt(parts[2].trim(), 10);
  assert.ok(count >= 2, 'Separate event receipt files must be retained');
});

test('11. missing owner GO blocks before kit lock and writes zero failure receipts outside kit lock', () => {
  const goScript = `
mkdir -p /home/gaza5045/gaza-upgrade-package /home/gaza5045/gaza-gateway /home/gaza5045/public_html /home/gaza5045/gaza-live-package
cp /fixtures/runner.php /home/gaza5045/gaza-upgrade-package/runner.php
cp /fixtures/test-fixtures.php /home/gaza5045/test-fixtures.php
php /home/gaza5045/gaza-upgrade-package/runner.php --upgrade 2> /home/gaza5045/err_go.txt
EXIT_CODE=$?
echo "EXIT:$EXIT_CODE"
cat /home/gaza5045/err_go.txt
ls /home/gaza5045/gaza-upgrade-package/production-upgrade-*.json 2>/dev/null | wc -l
`;
  const res = spawnSync('docker', [
    'run', '--rm', '--pull=never', '--network=none',
    '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045',
    '-e', 'HOSTPAPA_HOME=/home/gaza5045',
    '-v', `${fixtureDir}:/fixtures:ro`,
    'php:8.4-cli',
    'sh', '-c', goScript,
  ], { encoding: 'utf8' });

  assert.ok(res.stdout.includes('EXIT:1'));
  assert.ok(res.stdout.includes('Explicit final owner GO required'));
  assert.match(res.stdout, /\(invocation: [a-f0-9]{16}\)/);
  // Zero receipts written because runner stopped at Step 0 before kit lock
  const lines = res.stdout.trim().split('\n');
  const receiptCount = parseInt(lines[lines.length - 1].trim(), 10);
  assert.equal(receiptCount, 0, 'No diagnostic writes outside already-owned kit lock');
});
