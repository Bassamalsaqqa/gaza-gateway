<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Support\Facades\DB;
use PDO;

/** Privileged read-only observation on an owned disposable database; never app credentials. */
final class MySqlLockObserver
{
    public static function waitingCount(): int
    {
        $db = DB::connection();
        $password = getenv('MYSQL_GATE_OBSERVER_PASSWORD');
        if (getenv('APP_ENV') !== 'testing' || !app()->environment('testing')
            || $db->getName() !== 'mysql_test' || $db->getDriverName() !== 'mysql'
            || $db->selectOne('SELECT DATABASE() AS db')->db !== 'gaza_gateway_mysql_test'
            || !is_string($password) || $password === '') {
            throw new \LogicException('Disposable lock observer admission failed.');
        }
        $pdo = new PDO('mysql:host=mysql;port=3306;dbname=gaza_gateway_mysql_test', 'root', $password,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]);
        return (int) $pdo->query("SELECT COUNT(*) FROM performance_schema.data_lock_waits")->fetchColumn();
    }
}
