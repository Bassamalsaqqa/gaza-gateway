<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// ----------------------------------------------------------------------
// Gaza Gateway — HostPapa H0 Capability Canary CLI Runner
// ----------------------------------------------------------------------
// Executes non-destructive capability checks in an isolated environment.
// Can be invoked locally via CLI, in offline mode, or on cPanel via Cron.
// ----------------------------------------------------------------------

require_once __DIR__ . '/src/CanaryException.php';
require_once __DIR__ . '/src/Sanitizer.php';
require_once __DIR__ . '/src/ConfigValidator.php';
require_once __DIR__ . '/src/RuntimeProber.php';
require_once __DIR__ . '/src/DatabaseProber.php';
require_once __DIR__ . '/src/SmtpProber.php';
require_once __DIR__ . '/src/GitStageProber.php';
require_once __DIR__ . '/src/ApiRoutingCanary.php';

use HostPapaCanary\CanaryException;
use HostPapaCanary\ConfigValidator;
use HostPapaCanary\DatabaseProber;
use HostPapaCanary\GitStageProber;
use HostPapaCanary\ApiRoutingCanary;
use HostPapaCanary\RuntimeProber;
use HostPapaCanary\Sanitizer;
use HostPapaCanary\SecurityException;
use HostPapaCanary\SmtpProber;

// Parse CLI arguments
$options = getopt('', ['config:', 'skip-db', 'output-dir:', 'format:', 'help']);

if (isset($options['help'])) {
    echo <<<HELP
HostPapa H0 Capability Canary Runner
Usage: php canary_runner.php [options]

Options:
  --config=<file>       Path to canary_config.php configuration file
  --skip-db             Skip database probes (offline PHP/platform probe only)
  --output-dir=<dir>    Directory for private sanitized reports (must be outside webroot)
  --format=<fmt>        Output format: json, markdown, or both (default: both)
  --help                Show this help message

HELP;
    exit(0);
}

$skipDb = isset($options['skip-db']);
$configFile = (string)($options['config'] ?? (__DIR__ . '/canary_config.php'));
$format = (string)($options['format'] ?? 'both');

$sanitizer = new Sanitizer();
$config = [];

if (file_exists($configFile)) {
    /** @var array<string, mixed> $loadedConfig */
    $loadedConfig = require $configFile;
    if (is_array($loadedConfig)) {
        $config = $loadedConfig;
    }
} elseif (!$skipDb) {
    // No config file provided and not explicitly skipping DB -> default to offline / skip-db
    $skipDb = true;
}

// ----------------------------------------------------------------------
// Output Directory Safety Resolution
// ----------------------------------------------------------------------
// Must be private, outside webroot, free of path traversal, with 0700 permissions.
$customOutputDir = (string)($options['output-dir'] ?? ($config['CANARY_OUTPUT_DIR'] ?? ''));

if ($customOutputDir === '') {
    $home = getenv('HOME') ?: sys_get_temp_dir();
    $outputDir = rtrim($home, '/\\') . '/canary-artifacts';
} else {
    // Reject path traversal tokens
    if (str_contains($customOutputDir, '..')) {
        fprintf(STDERR, "Execution refused: output-dir contains path traversal sequence ('..').\n");
        exit(1);
    }
    $outputDir = $customOutputDir;
}

// Normalize and verify path does NOT lie inside public_html or webroot
$normalizedOutput = str_replace('\\', '/', $outputDir);
if (!preg_match('#^(?:[A-Za-z]:/|/)#', $normalizedOutput)) {
    fprintf(STDERR, "Execution refused: output-dir must be absolute.\n");
    exit(1);
}
if (preg_match('#/(?:public_html|www|htdocs)(?:/|$)#i', $normalizedOutput)) {
    fprintf(STDERR, "Execution refused: output-dir must strictly reside outside public_html/webroot.\n");
    exit(1);
}

// Reject symlink ancestors before creating or writing a report directory.
$cursor = $outputDir;
while (true) {
    if (is_link($cursor)) {
        fprintf(STDERR, "Execution refused: output-dir has a symbolic-link ancestor.\n");
        exit(1);
    }
    $parent = dirname($cursor);
    if ($parent === $cursor) break;
    $cursor = $parent;
}
// Disallow symlinks
if (is_link($outputDir)) {
    fprintf(STDERR, "Execution refused: output-dir must not be a symbolic link.\n");
    exit(1);
}

if (!is_dir($outputDir)) {
    if (!@mkdir($outputDir, 0700, true)) {
        fprintf(STDERR, "Could not create private output directory: %s\n", $sanitizer->sanitizeString($outputDir));
        exit(1);
    }
}
// Existing directories and their permissions are never modified.
$runOutput = rtrim($outputDir, '/\\').'/run-'.bin2hex(random_bytes(12));
if (!@mkdir($runOutput,0700)) {
    fprintf(STDERR, "Could not allocate exclusive private output.\n");
    exit(1);
}
$outputDir = $runOutput;

$timestampUtc = gmdate('Y-m-d\TH:i:s\Z');
$runId = 'h0_' . date('Ymd_His') . '_' . substr(bin2hex(random_bytes(3)), 0, 6);

echo "===================================================================\n";
echo "Gaza Gateway — HostPapa H0 Capability Canary\n";
echo "Run ID: {$runId} | Timestamp: {$timestampUtc}\n";
echo "===================================================================\n";

$canaryResults = [
    'metadata' => [
        'run_id' => $runId,
        'timestamp_utc' => $timestampUtc,
        'environment' => 'HostPapa Shared Hosting Capability Canary',
        'execution_mode' => $skipDb ? 'OFFLINE_RUNTIME_ONLY' : 'FULL_WITH_DISPOSABLE_DB',
        'architecture_contract' => 'HostPapa Shared cPanel Only (No External DB/Hosts/Daemons)',
    ],
    'verdict' => 'PENDING',
    'probes' => [],
];

$exitCode = 0;

try {
    // 1. Validate configuration if database is requested
    if (!$skipDb) {
        ConfigValidator::validate($config, true);
    } elseif (!empty($config)) {
        ConfigValidator::validate($config, false);
    }

    // 2. Probe PHP Runtime & Platform
    echo "[1/5] Probing PHP Runtime and Platform Extensions...\n";
    $runtimeProber = new RuntimeProber($sanitizer);
    $runtimeResults = $runtimeProber->probe();
    $canaryResults['probes']['php_runtime'] = $runtimeResults;
    echo "      PHP Version: " . $runtimeResults['php_version']['version'] . " (" . $runtimeResults['php_version']['status'] . ")\n";
    echo "      Extensions:  " . $runtimeResults['extensions']['summary'] . "\n";
    echo "      Argon2id:    " . $runtimeResults['argon2id']['status'] . "\n";

    // 3. Probe Database (if configured and authorized)
    echo "[2/5] Probing MySQL 8.4 / InnoDB Capabilities...\n";
    if ($skipDb) {
        $canaryResults['probes']['mysql_capabilities'] = [
            'status' => 'UNVERIFIED',
            'summary' => 'Database probe skipped (offline mode). Requires owner cPanel configuration.',
        ];
        echo "      Status: UNVERIFIED (Awaiting owner execution on disposable database)\n";
    } else {
        $dbProber = new DatabaseProber($config, $sanitizer);
        $dbResults = $dbProber->probe();
        $canaryResults['probes']['mysql_capabilities'] = $dbResults;
        echo "      Status: " . $dbResults['overall_status'] . "\n";
        if (isset($dbResults['checks']['check_constraints_enforced']['status'])) {
            echo "      CHECK Constraints: " . $dbResults['checks']['check_constraints_enforced']['status'] . "\n";
            echo "      Concurrency/Locks: " . $dbResults['checks']['multi_connection_concurrency']['status'] . "\n";
            echo "      Cleanup:           " . $dbResults['cleanup']['status'] . "\n";
        }
        if ($dbResults['overall_status'] !== 'PASS' || ($dbResults['cleanup']['status'] ?? '') !== 'PASS') {
            $exitCode = 1;
        }
    }

    // 4. Probe SMTP Socket Preparation
    echo "[3/5] Probing SMTP Preparation...\n";
    $smtpProber = new SmtpProber($config, $sanitizer);
    $smtpResults = $smtpProber->probe();
    $canaryResults['probes']['smtp_preparation'] = $smtpResults;
    echo "      Status: " . $smtpResults['status'] . "\n";
    echo "      Safety: " . ($smtpResults['can_send_emails'] ? 'WARNING: Sends enabled' : 'PASS: No real sends') . "\n";

    // 5. Probe Private Git Staging Outside Webroot
    echo "[4/5] Probing Private Staging Capability...\n";
    $gitStageProber = new GitStageProber($config, $sanitizer);
    $gitStageResults = $gitStageProber->probe();
    $canaryResults['probes']['git_staging'] = $gitStageResults;
    echo "      Status: " . $gitStageResults['status'] . "\n";

    // 6. Probe Isolated API Routing
    echo "[5/5] Probing Isolated API Routing Configuration...\n";
    $apiProber = new ApiRoutingCanary();
    $apiResults = $apiProber->probe();
    $canaryResults['probes']['api_routing'] = $apiResults;
    echo "      Status: " . $apiResults['preparation_status'] . " (Operational: " . $apiResults['status'] . ")\n";

    // Overall verdict calculation
    $hasFailure = false;
    $hasUnverified = false;

    foreach ($canaryResults['probes'] as $probe) {
        $status = $probe['status'] ?? ($probe['overall_status'] ?? '');
        if ($status === 'FAIL') {
            $hasFailure = true;
        } elseif ($status === 'UNVERIFIED' || $status === 'PREPARED_OFFLINE') {
            $hasUnverified = true;
        }
    }

    if ($hasFailure) {
        $canaryResults['verdict'] = 'FAIL';
        $exitCode = 1;
    } elseif ($hasUnverified) {
        $canaryResults['verdict'] = 'UNVERIFIED_PENDING_OWNER_EVIDENCE';
    } else {
        $canaryResults['verdict'] = 'PASS';
    }

} catch (\Throwable $e) {
    $canaryResults['verdict'] = 'FAIL';
    $canaryResults['fatal_error'] = $sanitizer->sanitizeString($e->getMessage());
    echo "\nFATAL CANARY ERROR: " . $canaryResults['fatal_error'] . "\n";
    $exitCode = 1;
}

// Sanitize entire payload before writing
$sanitizedResults = $sanitizer->sanitizeArray($canaryResults);

// Write outputs to private artifact directory with restricted 0600 permissions
$jsonPath = $outputDir . "/canary_report_{$runId}.json";
$mdPath = $outputDir . "/canary_report_{$runId}.md";

if ($format === 'json' || $format === 'both') {
    file_put_contents($jsonPath, json_encode($sanitizedResults, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    @chmod($jsonPath, 0600);
}

if ($format === 'markdown' || $format === 'both') {
    $md = "# Gaza Gateway — HostPapa H0 Capability Canary Report\n\n";
    $md .= "- **Run ID:** `{$runId}`\n";
    $md .= "- **Timestamp:** `{$timestampUtc}`\n";
    $md .= "- **Verdict:** **" . ($sanitizedResults['verdict'] ?? 'UNKNOWN') . "**\n";
    $md .= "- **Architecture Guardrail Preserved:** **YES** (HostPapa shared-only)\n\n";
    $md .= "## Probe Results\n\n";

    foreach ($sanitizedResults['probes'] as $probeName => $probeData) {
        $status = $probeData['status'] ?? ($probeData['overall_status'] ?? 'N/A');
        $md .= "### Probe: `{$probeName}` — Status: `{$status}`\n\n";
        $md .= "```json\n" . json_encode($probeData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n```\n\n";
    }

    file_put_contents($mdPath, $md);
    @chmod($mdPath, 0600);
}

echo "\n===================================================================\n";
echo "OVERALL VERDICT: " . $sanitizedResults['verdict'] . "\n";
echo "Reports written to private path:\n";
if (file_exists($jsonPath)) {
    echo "  JSON:     " . $sanitizer->sanitizeString($jsonPath) . "\n";
}
if (file_exists($mdPath)) {
    echo "  Markdown: " . $sanitizer->sanitizeString($mdPath) . "\n";
}
echo "===================================================================\n";

exit($exitCode);
