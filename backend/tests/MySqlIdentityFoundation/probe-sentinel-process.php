<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

if (empty(getenv('APP_KEY'))) {
    $disposableKey = 'base64:' . base64_encode('01234567890123456789012345678901');
    putenv("APP_KEY={$disposableKey}");
    $_ENV['APP_KEY'] = $disposableKey;
    $_SERVER['APP_KEY'] = $disposableKey;
}
if (empty(getenv('APP_URL'))) {
    putenv('APP_URL=https://127.0.0.1:18090');
    $_ENV['APP_URL'] = 'https://127.0.0.1:18090';
    $_SERVER['APP_URL'] = 'https://127.0.0.1:18090';
}
if (empty(getenv('DB_CONNECTION'))) {
    putenv('DB_CONNECTION=mysql_test');
    $_ENV['DB_CONNECTION'] = 'mysql_test';
    $_SERVER['DB_CONNECTION'] = 'mysql_test';
}

$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$options = getopt('', ['worker:', 'hold-ms:', 'wait-timeout:']);
$worker = (int) ($options['worker'] ?? 1);
$holdMs = (int) ($options['hold-ms'] ?? 0);
$waitTimeout = (int) ($options['wait-timeout'] ?? 3);

$conn = DB::connection('mysql_test');
$conn->statement("SET SESSION innodb_lock_wait_timeout = {$waitTimeout}");

$startTime = microtime(true);
$conn->beginTransaction();

$row = $conn->selectOne('SELECT * FROM staff_directory_control WHERE id = 1 FOR UPDATE');
$acquiredTime = microtime(true);

// Immediately signal to orchestrator that lock is acquired
echo json_encode([
    'event' => 'lock_acquired',
    'worker' => $worker,
    'acquired_time' => $acquiredTime,
]) . "\n";
if (function_exists('ob_flush')) {
    @ob_flush();
}
flush();

$result = [
    'worker' => $worker,
    'start_time' => $startTime,
    'acquired_time' => $acquiredTime,
    'initial_timestamp' => $row->last_mutated_at ?? null,
];

if ($holdMs > 0) {
    usleep($holdMs * 1000);
    $mutatedTime = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
    $conn->table('staff_directory_control')->where('id', 1)->update([
        'last_mutated_at' => $mutatedTime,
    ]);
    $result['mutated_timestamp'] = $mutatedTime;
}

$commitCalledTime = microtime(true);
$result['commit_called_time'] = $commitCalledTime;

$conn->commit();
$endTime = microtime(true);
$result['end_time'] = $endTime;

echo json_encode([
    'event' => 'finished',
    ...$result,
]) . "\n";
exit(0);
