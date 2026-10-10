<?php

declare(strict_types=1);

/**
 * Isolated Concurrency Probe Script for Phase 13B Package 03 (Staff Directory Guard).
 *
 * Used by PHPUnit concurrency race tests to spawn two independent operating-system processes
 * racing across an exclusive file barrier or PostgreSQL row lock contention.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use App\Identity\Directory\DirectoryMutationPlan;
use App\Identity\Directory\DirectoryTransactionGuard;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

// Check for help flag early
if (in_array('--help', $argv ?? [], true) || in_array('-h', $argv ?? [], true)) {
    echo "Usage: php scripts/probe-identity-directory.php --mode=<mode> [--target-staff-id=<uuid>] ...\n";
    echo "Modes: demote, suspend, mfa-revoke, password-unusable, offline-demote, guarded-noop\n";
    exit(0);
}

// 1. Read private STDIN JSON payload if piped
$input = [];
if (!stream_isatty(STDIN)) {
    $inputRaw = stream_get_contents(STDIN);
    $input = json_decode((string) $inputRaw, true) ?? [];
}

if (!empty($input['app_key'])) {
    putenv("APP_KEY={$input['app_key']}");
    $_ENV['APP_KEY'] = $input['app_key'];
    $_SERVER['APP_KEY'] = $input['app_key'];
}

// 2. Bootstrap minimal Laravel environment
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// 3. Strict environment and database verification before any mutation
if (config('app.env') !== 'testing' || getenv('APP_ENV') !== 'testing') {
    fwrite(STDERR, "Directory probe must run in testing environment.\n");
    exit(2);
}

$defaultConn = DB::getDefaultConnection();
if ($defaultConn !== 'pgsql_test') {
    fwrite(STDERR, "Directory probe must use pgsql_test connection.\n");
    exit(3);
}

$currentDb = DB::selectOne('SELECT current_database() AS db')->db;
if ($currentDb !== 'gaza_gateway_test' || DB::connection()->getDatabaseName() !== 'gaza_gateway_test') {
    fwrite(STDERR, "Directory probe must run against the intended disposable test database.\n");
    exit(4);
}

// Set strict timeouts to prevent unmonitored hangs
DB::statement("SET statement_timeout = '8000ms'");
DB::statement("SET lock_timeout = '5000ms'");

$options = getopt('h', [
    'help',
    'mode:',
    'target-staff-id::',
    'actor-staff-id::',
    'actor-session-id::',
    'mfa-version::',
    'barrier-file::',
    'ready-file::',
    'clock-file::',
]);

$mode = $options['mode'] ?? ($input['mode'] ?? null);
$barrierFile = $options['barrier-file'] ?? null;
$readyFile = $options['ready-file'] ?? null;
$clockFile = $options['clock-file'] ?? ($input['clock_file'] ?? null);

if ($clockFile) {
    CarbonImmutable::setTestNow(function () use ($clockFile) {
        if (file_exists($clockFile)) {
            $content = trim((string) file_get_contents($clockFile));
            if (is_numeric($content)) {
                return new \DateTimeImmutable('@' . (int) $content);
            }
        }
        return new \DateTimeImmutable();
    });
}

if (!$mode) {
    fwrite(STDERR, "Missing --mode option\n");
    exit(1);
}

// Signal readiness to parent before waiting on barrier lock
if ($readyFile) {
    file_put_contents($readyFile, (string) DB::selectOne('SELECT pg_backend_pid() AS pid')->pid);
}

// If a synchronization barrier file is provided, block until lock is released by parent test runner
if ($barrierFile && file_exists($barrierFile)) {
    $fp = fopen($barrierFile, 'r');
    if ($fp) {
        flock($fp, LOCK_SH);
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

$guard = new DirectoryTransactionGuard(DB::connection());
$actorStaffId = $options['actor-staff-id'] ?? ($input['actor_staff_id'] ?? null);
$actorSessionId = $options['actor-session-id'] ?? ($input['actor_session_id'] ?? null);
$targetStaffId = $options['target-staff-id'] ?? ($input['target_staff_id'] ?? null);
$mfaVersion = (int) ($options['mfa-version'] ?? ($input['mfa_version'] ?? 1));

if (!$targetStaffId) {
    fwrite(STDERR, "Missing target_staff_id\n");
    exit(6);
}

// Build closed typed DirectoryMutationPlan
$plan = match ($mode) {
    'demote' => DirectoryMutationPlan::demoteRole($targetStaffId, 'editor'),
    'suspend' => DirectoryMutationPlan::changeStatus($targetStaffId, 'suspended'),
    'mfa-revoke' => DirectoryMutationPlan::revokeMfa($targetStaffId, $mfaVersion),
    'password-unusable' => DirectoryMutationPlan::invalidatePassword($targetStaffId),
    'offline-demote' => DirectoryMutationPlan::demoteRole($targetStaffId, 'viewer'),
    'guarded-noop' => DirectoryMutationPlan::noop($targetStaffId),
    default => null,
};

if ($plan === null) {
    fwrite(STDERR, "Unknown probe mode.\n");
    exit(7);
}

try {
    if ($mode === 'offline-demote') {
        $result = $guard->executeAsOfflineSystem($plan);
    } else {
        if (!$actorStaffId || !$actorSessionId) {
            fwrite(STDERR, "Missing actor credentials for guarded staff execution\n");
            exit(5);
        }
        $result = $guard->executeAsStaff(
            actorStaffId: $actorStaffId,
            actorSessionId: $actorSessionId,
            plan: $plan,
        );
    }

    echo json_encode([
        'success' => $result->success,
        'error_code' => $result->errorCode,
        'eligible_admin_count' => $result->eligibleAdminCount,
        'pid' => getmypid(),
    ], JSON_THROW_ON_ERROR);

    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, "Probe execution failed.\n");
    exit(10);
}
