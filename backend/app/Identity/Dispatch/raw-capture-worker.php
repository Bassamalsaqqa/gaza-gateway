<?php

declare(strict_types=1);

// Standalone child worker for supervised raw proof capture I/O.
// - Direct child of PHP CLI (no shell, no framework bootstrap, no network, no DB).
// - Receives configuration and secret payload strictly via STDIN (never argv, env, or logs).
// - Validates immutable temp and final path formats within owned directory.
// - Writes raw bytes with strict mode 0600, verifies inode, fstat, fflush, fsync.
// - Performs atomic rename to final path.
// - Outputs JSON status on STDOUT and exits.

if (PHP_SAPI !== 'cli') {
    exit(1);
}

// The parent passes its locked descriptor; retain it until this process exits.
// This keeps cleanup serialized even if the parent crashes while raw I/O is pending.
$retentionLock = @fopen('php://fd/3', 'r+');
if (!is_resource($retentionLock)) { exit(1); }

// Bounded STDIN read (up to 64 KiB)
$input = '';
$stdin = fopen('php://stdin', 'rb');
if ($stdin === false) {
    exit(1);
}

while (!feof($stdin)) {
    $chunk = fread($stdin, 8192);
    if ($chunk === false) {
        break;
    }
    $input .= $chunk;
    if (strlen($input) > 65536) {
        fclose($stdin);
        fwrite(STDERR, "Input payload exceeds 64 KiB bound.\n");
        exit(2);
    }
}
fclose($stdin);

$data = json_decode($input, true);
if (!is_array($data)) {
    fwrite(STDERR, "Malformed input JSON.\n");
    exit(3);
}

$tempPath = $data['temp_path'] ?? null;
$finalPath = $data['final_path'] ?? null;
$payloadJson = $data['payload_json'] ?? null;
$injectedStallMs = (int) ($data['injected_stall_ms'] ?? 0);
$simulateSyncFailure = !empty($data['simulate_sync_failure']);

if (!is_string($tempPath) || !is_string($finalPath) || !is_string($payloadJson)) {
    fwrite(STDERR, "Missing required paths or payload.\n");
    exit(4);
}

// Validate file naming pattern
$tempBase = basename($tempPath);
$finalBase = basename($finalPath);
if (!preg_match('/^cap_[0-9a-f]{32}\.tmp$/D', $tempBase) || !preg_match('/^cap_[0-9a-f]{32}\.json$/D', $finalBase)) {
    fwrite(STDERR, "Invalid capture file identities.\n");
    exit(5);
}

$root = dirname($tempPath);
$rootStat = @lstat($root);
$lockStat = @fstat($retentionLock);
$pathLockStat = @lstat($root . '/.dispatch_ledger.lock');
if (dirname($finalPath) !== $root || substr($tempBase, 0, 36) !== substr($finalBase, 0, 36)
    || is_link($root) || realpath($root) !== $root || $rootStat === false
    || ($rootStat['mode'] & 0777) !== 0700 || ($rootStat['mode'] & 0170000) !== 0040000
    || !function_exists('posix_geteuid') || $rootStat['uid'] !== posix_geteuid()
    || $lockStat === false || $pathLockStat === false || is_link($root . '/.dispatch_ledger.lock')
    || $lockStat['dev'] !== $pathLockStat['dev'] || $lockStat['ino'] !== $pathLockStat['ino']) {
    exit(5);
}

// If injected stall requested (test seam)
if ($injectedStallMs > 0) {
    usleep($injectedStallMs * 1000);
}

// Ensure private 0600 creation
$oldMask = umask(0077);
try {
    $fp = @fopen($tempPath, 'xb');
} finally {
    umask($oldMask);
}

if ($fp === false) {
    fwrite(STDERR, "Failed to open temporary capture file.\n");
    exit(6);
}

if (DIRECTORY_SEPARATOR === '/') {
    @chmod($tempPath, 0600);
    $fstat = @fstat($fp);
    if ($fstat === false || ($fstat['nlink'] ?? 0) !== 1 || is_link($tempPath)) {
        fclose($fp);
        @unlink($tempPath);
        fwrite(STDERR, "Insecure temporary capture inode.\n");
        exit(7);
    }
    if (($fstat['mode'] & 0777) !== 0600 ||
        (function_exists('posix_geteuid') && ($fstat['uid'] ?? -1) !== posix_geteuid())) {
        fclose($fp);
        @unlink($tempPath);
        fwrite(STDERR, "Temporary capture permissions must be 0600.\n");
        exit(8);
    }
}

$written = @fwrite($fp, $payloadJson);
if ($written === false || $written !== strlen($payloadJson)) {
    @fclose($fp);
    @unlink($tempPath);
    fwrite(STDERR, "Incomplete payload write.\n");
    exit(9);
}

if (!fflush($fp)) {
    fclose($fp);
    @unlink($tempPath);
    fwrite(STDERR, "Flush failed.\n");
    exit(10);
}

if ($simulateSyncFailure) {
    fclose($fp);
    fwrite(STDERR, "Simulated sync failure.\n");
    exit(11);
}

if (!function_exists('fsync') || !fsync($fp)) {
    fclose($fp);
    @unlink($tempPath);
    fwrite(STDERR, "Fsync failed.\n");
    exit(12);
}

if (!fclose($fp)) {
    @unlink($tempPath);
    fwrite(STDERR, "Close failed.\n");
    exit(13);
}

$renamed = @rename($tempPath, $finalPath);
if (!$renamed) {
    @unlink($tempPath);
    fwrite(STDERR, "Atomic rename failed.\n");
    exit(14);
}

if (DIRECTORY_SEPARATOR === '/') {
    @chmod($finalPath, 0600);
}

// Success output on STDOUT
echo json_encode(['status' => 'ok'], JSON_THROW_ON_ERROR);
exit(0);
