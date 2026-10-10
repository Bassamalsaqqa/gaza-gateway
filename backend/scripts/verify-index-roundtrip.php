<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

// Guard 1: Must be testing environment
if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
    fwrite(STDERR, "Error: Index roundtrip must run in testing environment.\n");
    exit(2);
}

// Guard 2: Must be pgsql_test connection
if (config('database.default') !== 'pgsql_test') {
    fwrite(STDERR, "Error: Index roundtrip must use pgsql_test connection.\n");
    exit(3);
}

// Guard 3: Must resolve strictly to gaza_gateway_test database
$currentDb = DB::selectOne('SELECT current_database() AS db')->db ?? '';
if ($currentDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "Error: Index roundtrip must run strictly against gaza_gateway_test.\n");
    exit(4);
}

echo "Pre-flight guards passed: verified live PostgreSQL disposable test database.\n";

$targetIndexes = [
    'idx_passenger_sessions_anonymous_cleanup',
    'idx_staff_sessions_anonymous_cleanup',
    'idx_security_rate_limits_window_end',
];
$migrationPath = 'database/migrations/2026_10_10_000004_create_bootstrap_cleanup_indexes.php';

function checkIndexes(array $targets): array
{
    $placeholders = implode(',', array_fill(0, count($targets), '?'));
    $rows = DB::select("SELECT indexname FROM pg_indexes WHERE indexname IN ($placeholders)", $targets);
    return array_column($rows, 'indexname');
}

// 1. Check initial index state
$initialFound = checkIndexes($targetIndexes);
echo "Initial check: found " . count($initialFound) . " of " . count($targetIndexes) . " indexes.\n";
foreach ($targetIndexes as $idx) {
    if (in_array($idx, $initialFound, true)) {
        echo "  [PRESENT] {$idx}\n";
    } else {
        echo "  [MISSING] {$idx}\n";
    }
}

if (count($initialFound) !== 3) {
    echo "Running migrate to ensure baseline...\n";
    Artisan::call('migrate', ['--path' => $migrationPath, '--force' => true]);
    $initialFound = checkIndexes($targetIndexes);
    if (count($initialFound) !== 3) {
        fwrite(STDERR, "Failed to reach initial 3-index baseline.\n");
        exit(5);
    }
}

// 2. Rollback the migration by 1 step
echo "\nRolling back only the bootstrap cleanup index migration ...\n";
$rollbackExit = Artisan::call('migrate:rollback', [
    '--path' => $migrationPath,
    '--step' => 1,
    '--force' => true,
]);

if ($rollbackExit !== 0) {
    fwrite(STDERR, "Rollback failed with exit code {$rollbackExit}.\n");
    exit(6);
}

$postRollbackFound = checkIndexes($targetIndexes);
echo "Post-rollback check: found " . count($postRollbackFound) . " indexes.\n";
foreach ($targetIndexes as $idx) {
    if (in_array($idx, $postRollbackFound, true)) {
        echo "  [ERROR: STILL PRESENT] {$idx}\n";
        exit(7);
    } else {
        echo "  [CONFIRMED DROPPED] {$idx}\n";
    }
}

// 3. Reapply the migration
echo "\nExecuting migrate --force ...\n";
$migrateExit = Artisan::call('migrate', [
    '--path' => $migrationPath,
    '--force' => true,
]);

if ($migrateExit !== 0) {
    fwrite(STDERR, "Reapply migrate failed with exit code {$migrateExit}.\n");
    exit(8);
}

$postMigrateFound = checkIndexes($targetIndexes);
echo "Post-reapply check: found " . count($postMigrateFound) . " indexes.\n";
foreach ($targetIndexes as $idx) {
    if (in_array($idx, $postMigrateFound, true)) {
        echo "  [CONFIRMED RESTORED] {$idx}\n";
    } else {
        echo "  [ERROR: MISSING] {$idx}\n";
        exit(9);
    }
}

echo "\nIndex roundtrip verification SUCCESS: all 3 indexes safely rolled back and restored.\n";
exit(0);
