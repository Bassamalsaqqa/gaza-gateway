<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        // Dynamically generate a valid disposable in-memory test key if absent from environment
        if (empty(env('APP_KEY'))) {
            $disposableKey = 'base64:' . base64_encode(random_bytes(32));
            putenv("APP_KEY={$disposableKey}");
            $_ENV['APP_KEY'] = $disposableKey;
            $_SERVER['APP_KEY'] = $disposableKey;
        }

        return parent::createApplication();
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->assertDisposableDatabaseTarget();
    }

    final protected function assertDisposableDatabaseTarget(): void
    {
        if (getenv('APP_ENV') !== 'testing' || !$this->app->environment('testing')) {
            throw new \RuntimeException('Fixture admission requires the testing environment.');
        }

        // Guard: Strictly enforce testing environment
        if (!$this->app->environment('testing')) {
            throw new \RuntimeException(
                "Test suite must run strictly in [testing] environment, got: [" . $this->app->environment() . "]"
            );
        }

        // Guard: Strictly enforce default test connection
        $defaultConn = config('database.default');
        if ($defaultConn !== 'pgsql_test') {
            throw new \RuntimeException(
                "Test suite default connection must be [pgsql_test], got: [{$defaultConn}]"
            );
        }

        // Guard: Strictly enforce disposable test database
        $connection = DB::connection();
        try {
            $liveTarget = $connection->selectOne('SELECT current_database() AS database_name');
        } catch (\Throwable) {
            throw new \RuntimeException('Unable to verify the live disposable database target.');
        }
        if ($connection->getName() !== 'pgsql_test'
            || $connection->getDriverName() !== 'pgsql'
            || ($liveTarget->database_name ?? null) !== 'gaza_gateway_test') {
            throw new \RuntimeException('Fixture admission rejected the live database target.');
        }
        $databaseName = $connection->getDatabaseName();
        if ($databaseName !== 'gaza_gateway_test') {
            throw new \RuntimeException(
                "Test suite must run strictly against disposable test database [gaza_gateway_test], got: [{$databaseName}]"
            );
        }
    }
}
