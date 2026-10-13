<?php
declare(strict_types=1);

/** Test-only live database admission; never permits deployment profiles or arbitrary schemas. */
function assertOwnedBrowserDatabase(): void
{
    if (getenv('MVP_BROWSER_GATE_OWNED') !== '1' || !app()->environment('testing') || getenv('APP_ENV') !== 'testing') {
        throw new RuntimeException('Owned disposable browser gate required.');
    }
    $connection = \Illuminate\Support\Facades\DB::connection();
    [$name, $database, $query] = match ($connection->getDriverName()) {
        'mysql' => ['mysql_test', 'gaza_gateway_mysql_test', 'SELECT DATABASE() AS actual_database'],
        'pgsql' => ['pgsql_test', 'gaza_gateway_test', 'SELECT current_database() AS actual_database'],
        default => throw new RuntimeException('Unsupported browser test database.'),
    };
    if ($connection->getName() !== $name || $connection->getDatabaseName() !== $database
        || $connection->selectOne($query)->actual_database !== $database) {
        throw new RuntimeException('Foreign browser test database refused.');
    }
}
