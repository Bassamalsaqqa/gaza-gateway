<?php
declare(strict_types=1);

// Owner-invoked, private CLI helper for the already-built 7a8f0fa release.
// Never upload into public_html. No credentials or invitation tokens in this file.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
ini_set('display_errors', '0');
umask(0077);
const KIT_ROOT = '/home/gaza5045/gaza-live-package';
const APP_ROOT = '/home/gaza5045/gaza-gateway';
const RELEASE_ID = 'rel_20261013T082656_7a8f0fa_clean';
const SOURCE_SHA = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
const MANIFEST_SHA = 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf';

function safePath(string $path): void {
    if (!str_starts_with($path, '/home/gaza5045/') || preg_match('#[\\\\\x00-\x1f]|(?:^|/)\.{1,2}(?:/|$)#', $path)) throw new RuntimeException();
    for ($cursor = $path; $cursor !== '/'; $cursor = dirname($cursor)) {
        if (is_link($cursor)) throw new RuntimeException();
    }
}
function privateInput(string $name): string {
    $path = KIT_ROOT . '/' . $name;
    safePath($path);
    if (!is_file($path) || filesize($path) > 32768 || !chmod($path, 0600)) throw new RuntimeException();
    if (function_exists('posix_geteuid') && fileowner($path) !== posix_geteuid()) throw new RuntimeException();
    $bytes = file_get_contents($path);
    if ($bytes === false) throw new RuntimeException();
    return $bytes;
}
function runBounded(array $args, int $seconds): void {
    $process = proc_open([PHP_BINARY, '-d', 'display_errors=0', ...$args],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException();
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $output = ''; $errors = ''; $exit = -1; $deadline = microtime(true) + $seconds;
    try {
        do {
            $output .= stream_get_contents($pipes[1]) ?: '';
            $errors .= stream_get_contents($pipes[2]) ?: '';
            if (strlen($output) + strlen($errors) > 65536) break;
            $state = proc_get_status($process);
            if (!$state['running']) { $exit = $state['exitcode']; break; }
            usleep(50000);
        } while (microtime(true) < $deadline);
    } finally {
        if (proc_get_status($process)['running']) proc_terminate($process, 9);
        fclose($pipes[1]); fclose($pipes[2]); proc_close($process);
    }
    // Child output is intentionally withheld; even a broken dependency cannot leak secrets.
    if ($exit !== 0) throw new RuntimeException();
}

$stage = 'preflight'; $attempt = null; $lock = null; $ownsLock = false;
try {
    if (PHP_VERSION_ID < 80400 || ($argv[1] ?? '') === '' || count($argv) !== 2
        || !in_array($argv[1], ['--check', '--deploy'], true)) throw new RuntimeException();
    safePath(__FILE__);
    if (realpath(__DIR__) !== KIT_ROOT || realpath(getenv('HOME') ?: '') !== '/home/gaza5045') throw new RuntimeException();
    if (!function_exists('proc_open') || !function_exists('pcntl_alarm')) throw new RuntimeException();
    pcntl_async_signals(true);
    pcntl_signal(SIGALRM, static function (): void { fwrite(STDERR, "FAIL: runner deadline; inspect private receipt.\n"); exit(1); });
    pcntl_alarm(390);
    if (!chmod(KIT_ROOT, 0700)) throw new RuntimeException();
    safePath(KIT_ROOT . '/production-runner.lock');
    $lock = fopen(KIT_ROOT . '/production-runner.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException();
    $ownsLock = true;
    chmod(KIT_ROOT . '/production-runner.lock', 0600);
    $approval = json_decode(privateInput('live-approval.json'), true, 32, JSON_THROW_ON_ERROR);
    $env = privateInput('live-runtime.env');
    $ownerBytes = privateInput('owner-bootstrap.json');
    $owner = json_decode($ownerBytes, true, 32, JSON_THROW_ON_ERROR);
    if (($approval['schema_version'] ?? null) !== '1.0'
        || ($approval['action'] ?? '') !== 'install' || ($approval['environment'] ?? '') !== 'production'
        || ($approval['source_sha'] ?? '') !== SOURCE_SHA || ($approval['release_id'] ?? '') !== RELEASE_ID
        || ($approval['manifest_sha256'] ?? '') !== MANIFEST_SHA
        || ($approval['target_webroot'] ?? '') !== '/home/gaza5045/public_html'
        || ($approval['app_dir'] ?? '') !== APP_ROOT || ($approval['runtime_env_file'] ?? '') !== KIT_ROOT . '/live-runtime.env'
        || ($approval['database']['database'] ?? '') !== 'gaza5045_gateway_live'
        || ($approval['database']['username'] ?? '') !== 'gaza5045_liveadmin'
        || !is_string($approval['database']['password'] ?? null) || $approval['database']['password'] === ''
        || ($owner['releaseSha'] ?? '') !== SOURCE_SHA || ($owner['database'] ?? '') !== 'gaza5045_gateway_live'
        || !is_string($owner['smtp']['password'] ?? null) || $owner['smtp']['password'] === ''
        || !preg_match('/^APP_ENV=production\r?$/m', $env)
        || !preg_match('/^DB_DATABASE=gaza5045_gateway_live\r?$/m', $env)
        || !preg_match('/^DB_USERNAME=gaza5045_liveruntime\r?$/m', $env)
        || !preg_match('/^DB_PASSWORD=.+$/m', $env)) throw new RuntimeException();
    $manifest = KIT_ROOT . '/release/release-manifest.json';
    safePath($manifest);
    if (!is_file($manifest) || hash_file('sha256', $manifest) !== MANIFEST_SHA) throw new RuntimeException();
    $manifestData = json_decode(file_get_contents($manifest), true, 32, JSON_THROW_ON_ERROR);
    $installer = KIT_ROOT . '/release/installer/hostpapa-install.php'; safePath($installer);
    if (hash_file('sha256', $installer) !== ($manifestData['installer']['installer/hostpapa-install.php']['sha256'] ?? '')) throw new RuntimeException();
    runBounded([$installer, '--action=verify', '--package-dir=' . KIT_ROOT . '/release'], 90);
    echo "PASS: pinned package, production bindings and private inputs.\n";
    if ($argv[1] === '--check') { pcntl_alarm(0); exit(0); }
    $backup = KIT_ROOT . '/precutover-public-20261013.tar.gz'; safePath($backup);
    if (!is_file($backup) || filesize($backup) < 1024) throw new RuntimeException();
    $gzip = fopen($backup, 'rb'); $magic = fread($gzip, 2); fclose($gzip);
    if ($magic !== "\x1f\x8b") throw new RuntimeException();
    // Never repeatedly retry migrations or an owner invitation from a recurring one-minute task.
    $attemptPath = KIT_ROOT . '/production-deploy-attempted'; safePath($attemptPath);
    if (is_file($attemptPath)) { echo "SKIP: deployment already attempted; inspect production-result.json and remove temporary cron.\n"; exit(0); }
    $attempt = fopen($attemptPath, 'x'); if (!$attempt) throw new RuntimeException();
    fwrite($attempt, gmdate('c') . "\n"); fclose($attempt); $attempt = null;
    $stage = 'install';
    runBounded([$installer, '--action=install', '--package-dir=' . KIT_ROOT . '/release', '--approval-file=' . KIT_ROOT . '/live-approval.json'], 190);
    $pointer = APP_ROOT . '/current-release.txt'; safePath($pointer);
    if (trim(file_get_contents($pointer)) !== RELEASE_ID) throw new RuntimeException();
    echo "PASS: installed pinned release and migration UP; prior bytes retained by installer.\n";
    $stage = 'owner_invitation';
    $ownerTarget = APP_ROOT . '/shared/storage/app/private/owner-bootstrap.json'; safePath($ownerTarget);
    if (file_exists($ownerTarget)) throw new RuntimeException();
    if (file_put_contents($ownerTarget, $ownerBytes, LOCK_EX) !== strlen($ownerBytes) || !chmod($ownerTarget, 0600)) throw new RuntimeException();
    $cli = APP_ROOT . '/releases/' . RELEASE_ID . '/bin/hostpapa-cli'; safePath($cli);
    runBounded([$cli, 'hostpapa:bootstrap-owner', '--no-interaction'], 35);
    echo "PASS: first owner invitation queued and encrypted SMTP settings saved.\n";
    $stage = 'initial_cron';
    runBounded([$cli, 'shared-hosting:cron', '--max-seconds=25', '--batch-limit=25'], 30);
    $receipt = ['outcome' => 'DEPLOYED_OWNER_TESTING_PENDING', 'source_sha' => SOURCE_SHA,
        'release_id' => RELEASE_ID, 'manifest_sha256' => MANIFEST_SHA, 'database' => 'gaza5045_gateway_live',
        'completed_at' => gmdate('c'), 'mailbox_delivery' => 'NOT_CERTIFIED', 'acceptance_tests' => 'OWNER_PENDING'];
    file_put_contents(KIT_ROOT . '/production-result.json', json_encode($receipt, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    echo "PASS: bounded cron completed. Deployment finished; mailbox and user acceptance are owner tests.\n";
    pcntl_alarm(0);
} catch (Throwable) {
    if ($ownsLock && is_dir(KIT_ROOT) && realpath(__DIR__) === KIT_ROOT) {
        @file_put_contents(KIT_ROOT . '/production-result.json', json_encode(['outcome' => 'FAIL', 'stage' => $stage,
            'source_sha' => SOURCE_SHA, 'time' => gmdate('c'), 'message' => 'Stopped; inspect configuration and retained backups before retry.']) . "\n", LOCK_EX);
    }
    fwrite(STDERR, "FAIL: production runner stopped at " . $stage . "; no credential details printed. Do not remove the attempt marker or retry blindly.\n");
    exit(1);
} finally {
    if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
}
