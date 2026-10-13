<?php

declare(strict_types=1);

namespace Tests\MySqlIdentityFoundation;

use App\Support\ConfigurationValidator;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\NullOutput;

class ConfigurationAndDestructiveGuardsTest extends MySqlTestCase
{
    private function getValidProductionConfig(): array
    {
        return [
            'app' => [
                'key' => 'base64:' . base64_encode(random_bytes(32)),
                'cipher' => 'AES-256-CBC',
                'debug' => false,
                'url' => 'https://www.gazaairport.com',
                'allowed_hosts' => ['www.gazaairport.com', 'gazaairport.com'],
            ],
            'cors' => [
                'allowed_origins' => ['https://www.gazaairport.com', 'https://gazaairport.com'],
            ],
            'database' => [
                'default' => 'mysql',
                'connections' => [
                    'mysql' => [
                        'driver' => 'mysql',
                        'host' => '127.0.0.1',
                        'port' => '3306',
                        'database' => 'gaza_gateway_prod_db',
                        'username' => 'cpanel_gaza_user',
                        'password' => 'Str0ng_Pr0duct10n_P@ssw0rd!',
                        'strict' => true,
                        'timezone' => '+00:00',
                        'isolation_level' => 'READ COMMITTED',
                        'options' => [
                            \PDO::ATTR_TIMEOUT => 3,
                            \PDO::MYSQL_ATTR_INIT_COMMAND => 'SET SESSION innodb_lock_wait_timeout = 3; SET SESSION max_execution_time = 3000;',
                        ],
                        'server_options' => [
                            'statement_timeout' => '3000',
                            'lock_timeout' => '3000',
                        ],
                    ],
                ],
            ],
            'queue' => [
                'default' => 'database',
                'connections' => [
                    'database' => [
                        'driver' => 'database',
                        'table' => 'jobs',
                        'queue' => 'default',
                        'connection' => 'mysql',
                    ],
                ],
            ],
            'cache' => [
                'default' => 'database',
                'stores' => [
                    'database' => [
                        'driver' => 'database',
                        'table' => 'cache',
                        'lock_table' => 'cache_locks',
                        'connection' => 'mysql',
                        'lock_connection' => 'mysql',
                    ],
                ],
            ],
        ];
    }

    public function testValidProductionConfigPasses(): void
    {
        $config = $this->getValidProductionConfig();
        ConfigurationValidator::validate($config, 'production');
        $this->assertTrue(true, 'Valid production config must pass validation.');
    }

    public function testProductionRejectsPgsqlDefault(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['default'] = 'pgsql';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("[database.default] must be 'mysql' in deployment.");
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsRemoteDbHost(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['host'] = 'external-db.rds.amazonaws.com';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database host must be loopback localhost/socket in shared-hosting deployment; remote DB host is disallowed.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsTestDatabaseName(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['database'] = 'gaza_gateway_mysql_test';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database name cannot be empty, local/test, or placeholder in deployment.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsDefaultOrPlaceholderPassword(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['password'] = 'gaza_app_local_pass';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database password cannot use dev defaults or placeholders in deployment.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsDebugTrue(): void
    {
        $config = $this->getValidProductionConfig();
        $config['app']['debug'] = true;

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.debug] must be false in deployment.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testDestructiveCommandGuardRejectsNonTestingEnvironment(): void
    {
        // Mock non-testing environment check by simulating CommandStarting in production
        $event = new CommandStarting(
            'migrate:fresh',
            new ArrayInput(['--force' => true]),
            new NullOutput()
        );

        // Temporarily change app environment
        $originalEnv = $this->app->environment();
        $this->app['env'] = 'production';

        try {
            Event::dispatch($event);
            $this->fail('Destructive command in production must throw RuntimeException.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('is strictly prohibited in environment [production]', $e->getMessage());
        } finally {
            $this->app['env'] = $originalEnv;
        }
    }

    public function testProductionRejectsMalformedConnectTimeout(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['options'][\PDO::ATTR_TIMEOUT] = '3oops';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsDisallowedHostAlias(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['host'] = '127.00.00.01';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database host must be loopback localhost/socket in shared-hosting deployment; remote DB host is disallowed.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsMissingInitCommandTimeouts(): void
    {
        $config = $this->getValidProductionConfig();
        unset($config['database']['connections']['mysql']['options'][\PDO::MYSQL_ATTR_INIT_COMMAND]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database lock timeout must be configured in deployment.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testProductionRejectsContradictoryUrlTimeoutOverride(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['mysql']['connect_timeout'] = '2'; // URL query override contradicts options timeout 3

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Contradictory database connect timeout configuration.');
        ConfigurationValidator::validate($config, 'production');
    }

    public function testLivePdoInitSessionTimeoutsConfigured(): void
    {
        $conn = \Illuminate\Support\Facades\DB::connection('mysql_test');
        $lockWait = $conn->selectOne('SELECT @@innodb_lock_wait_timeout AS val')->val;
        $maxExec = $conn->selectOne('SELECT @@max_execution_time AS val')->val;

        $this->assertGreaterThanOrEqual(1, (int) $lockWait);
        $this->assertLessThanOrEqual(5, (int) $lockWait);
        $this->assertGreaterThanOrEqual(100, (int) $maxExec);
        $this->assertLessThanOrEqual(5000, (int) $maxExec);
    }

    public function testDestructiveCommandGuardRejectsNonTestDatabaseEvenInTesting(): void
    {
        config(['database.connections.fake_prod' => [
            'driver' => 'mysql',
            'host' => '127.0.0.1',
            'database' => 'gaza_gateway_production_data',
        ]]);

        $event = new CommandStarting(
            'migrate:fresh',
            new ArrayInput(['--database' => 'fake_prod', '--force' => true]),
            new NullOutput()
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('strictly prohibited on non-test database [gaza_gateway_production_data]');
        Event::dispatch($event);
    }
}
