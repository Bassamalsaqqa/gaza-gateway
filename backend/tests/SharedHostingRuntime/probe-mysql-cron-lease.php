<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/vendor/autoload.php';

use App\SharedHosting\SharedHostingCronLease;
use Illuminate\Cache\CacheManager;
use Illuminate\Config\Repository;
use Illuminate\Container\Container;
use Illuminate\Database\DatabaseManager;
use Illuminate\Support\Facades\Facade;

// Standalone disposable test only. Never accepts an operator/live database name.
if (getenv('APP_ENV') !== 'testing' || getenv('DB_TEST_DATABASE') !== 'gaza_gateway_mysql_test') {
    fwrite(STDERR, "Disposable test database required.\n");
    exit(1);
}
$container = new Container();
Container::setInstance($container);
Facade::clearResolvedInstances();
Facade::setFacadeApplication($container);
$container->instance('config', new Repository([
    'app' => ['env' => 'production'], // Exercise deployment lease-store enforcement.
    'database' => ['default' => 'lease_test', 'connections' => ['lease_test' => [
        'driver' => 'mysql', 'host' => getenv('DB_HOST'), 'port' => 3306,
        'database' => getenv('DB_TEST_DATABASE'), 'username' => getenv('DB_USERNAME'),
        'password' => getenv('DB_PASSWORD'), 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_0900_bin',
        'strict' => true, 'timezone' => '+00:00',
    ]]],
    'cache' => ['default' => 'database', 'prefix' => 'cron-probe:', 'stores' => ['database' => [
        'driver' => 'database', 'connection' => 'lease_test', 'table' => 'cache',
        'lock_connection' => 'lease_test', 'lock_table' => 'cache_locks',
    ]]],
]));
$db = new DatabaseManager($container, new Illuminate\Database\Connectors\ConnectionFactory($container));
$container->instance('db', $db);
$container->instance('cache', new CacheManager($container));
$connection = $db->connection();
if (($argv[1] ?? '') === 'contender') {
    $acquired = SharedHostingCronLease::acquire();
    SharedHostingCronLease::release();
    echo $acquired ? 'acquired' : 'overlap';
    exit(0);
}
$checks = 0;
$assert = static function (bool $condition) use (&$checks): void {
    if (!$condition) { throw new RuntimeException('Cron lease invariant failed.'); }
    $checks++;
};
try {
    $connection->statement('CREATE TABLE cache_locks (`key` VARCHAR(255) PRIMARY KEY, owner VARCHAR(255) NOT NULL, expiration INT NOT NULL) ENGINE=InnoDB');
    $assert(SharedHostingCronLease::acquire());
    // An independent PHP process uses its own connection and genuine DatabaseLock.
    $process = proc_open([PHP_BINARY, __FILE__, 'contender'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $assert(is_resource($process));
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $deadline = hrtime(true) + 5_000_000_000;
    $stdout = ''; $stderr = '';
    do {
        $stdout .= stream_get_contents($pipes[1]); $stderr .= stream_get_contents($pipes[2]);
        $status = proc_get_status($process);
        if (!$status['running']) { break; }
        usleep(10000);
    } while (hrtime(true) < $deadline);
    if ($status['running']) { proc_terminate($process, 9); throw new RuntimeException('Bounded contender expired.'); }
    $stdout .= stream_get_contents($pipes[1]); $stderr .= stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); proc_close($process);
    $assert($status['exitcode'] === 0 && $stdout === 'overlap' && $stderr === '');
    $assert($connection->table('cache_locks')->count() === 1);
    // Expired predecessor cannot release a newer owner's lease.
    $connection->table('cache_locks')->update(['expiration' => time() - 1]);
    $successor = $container->make('cache')->lock(SharedHostingCronLease::LEASE_KEY, 60);
    $assert($successor->get());
    SharedHostingCronLease::release();
    $assert($connection->table('cache_locks')->value('owner') === $successor->owner());
    $assert($successor->release());
    $assert(SharedHostingCronLease::acquire());
    SharedHostingCronLease::release();
    $assert($connection->table('cache_locks')->count() === 0);
    $connection->statement('DROP TABLE cache_locks');
    $failedClosed = false;
    try { SharedHostingCronLease::acquire(); } catch (RuntimeException) { $failedClosed = true; }
    $assert($failedClosed);
    echo json_encode(['status' => 'PASS', 'assertions' => $checks,
        'scope' => 'Real MySQL DatabaseLock overlap, expired-owner release and backend-failure distinction'])."\n";
} catch (Throwable) {
    fwrite(STDERR, "Cron database lease probe failed.\n");
    exit(1);
}
