<?php

declare(strict_types=1);

namespace Tests\MySqlIdentityFoundation;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class MySqlTestCase extends BaseTestCase
{
    public function createApplication()
    {
        $disposableKey = 'base64:' . base64_encode('01234567890123456789012345678901');
        putenv("APP_KEY={$disposableKey}");
        $_ENV['APP_KEY'] = $disposableKey;
        $_SERVER['APP_KEY'] = $disposableKey;

        putenv('APP_URL=https://127.0.0.1:18090');
        $_ENV['APP_URL'] = 'https://127.0.0.1:18090';
        $_SERVER['APP_URL'] = 'https://127.0.0.1:18090';

        putenv('DB_CONNECTION=mysql_test');
        $_ENV['DB_CONNECTION'] = 'mysql_test';
        $_SERVER['DB_CONNECTION'] = 'mysql_test';

        putenv('DB_HOST=mysql');
        $_ENV['DB_HOST'] = 'mysql';
        $_SERVER['DB_HOST'] = 'mysql';

        putenv('DB_PORT=3306');
        $_ENV['DB_PORT'] = '3306';
        $_SERVER['DB_PORT'] = '3306';

        putenv('DB_TEST_DATABASE=gaza_gateway_mysql_test');
        $_ENV['DB_TEST_DATABASE'] = 'gaza_gateway_mysql_test';
        $_SERVER['DB_TEST_DATABASE'] = 'gaza_gateway_mysql_test';

        putenv('DB_USERNAME=gaza_app_user');
        $_ENV['DB_USERNAME'] = 'gaza_app_user';
        $_SERVER['DB_USERNAME'] = 'gaza_app_user';

        putenv('DB_PASSWORD=gaza_app_local_pass');
        $_ENV['DB_PASSWORD'] = 'gaza_app_local_pass';
        $_SERVER['DB_PASSWORD'] = 'gaza_app_local_pass';

        $app = require __DIR__ . '/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableMySqlDatabaseTarget();
    }

    final protected function assertDisposableMySqlDatabaseTarget(): void
    {
        if (getenv('APP_ENV') !== 'testing' || !$this->app->environment('testing')) {
            throw new \RuntimeException('MySql foundation test requires testing environment.');
        }

        $defaultConn = config('database.default');
        if ($defaultConn !== 'mysql_test') {
            throw new \RuntimeException(
                "MySql foundation test default connection must be [mysql_test], got: [{$defaultConn}]"
            );
        }

        $connection = DB::connection('mysql_test');
        $liveTarget = $connection->selectOne('SELECT DATABASE() AS database_name');
        if ($connection->getName() !== 'mysql_test'
            || $connection->getDriverName() !== 'mysql'
            || ($liveTarget->database_name ?? null) !== 'gaza_gateway_mysql_test') {
            throw new \RuntimeException('Fixture admission rejected the live MySQL database target.');
        }

        $databaseName = $connection->getDatabaseName();
        if ($databaseName !== 'gaza_gateway_mysql_test') {
            throw new \RuntimeException(
                "Test suite must run strictly against disposable test database [gaza_gateway_mysql_test], got: [{$databaseName}]"
            );
        }
    }
}
