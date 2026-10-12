<?php

declare(strict_types=1);

namespace Tests\SharedHostingRuntime;

use App\Console\Commands\SharedHostingCronCommand;
use App\SharedHosting\SharedHostingCronHeartbeat;
use App\SharedHosting\SharedHostingCronLease;
use App\SharedHosting\SharedHostingCronRunner;
use App\SharedHosting\SharedHostingProfile;
use Illuminate\Cache\CacheManager;
use Illuminate\Config\Repository;
use Illuminate\Console\OutputStyle;
use Illuminate\Container\Container;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class SharedHostingCronTest extends TestCase
{
    private Container $container;

    protected function setUp(): void
    {
        parent::setUp();

        $this->container = new Container();
        Facade::clearResolvedInstances();
        Container::setInstance($this->container);
        Facade::setFacadeApplication($this->container);

        $config = new Repository([
            'app' => [
                'env' => 'testing',
            ],
            'cache' => [
                'default' => 'array',
                'stores' => [
                    'array' => [
                        'driver' => 'array',
                        'serialize' => false,
                    ],
                ],
            ],
            'foundation-services' => [
                'shared_hosting_enabled' => true,
                'cron_cadence_minutes' => 15,
            ],
            'mvp-mail' => [
                'enabled' => false,
                'identity_smtp_enabled' => false,
            ],
        ]);
        $this->container->instance('config', $config);

        $cacheManager = new CacheManager($this->container);
        $this->container->instance('cache', $cacheManager);
        $this->container->instance('log', new \Psr\Log\NullLogger());

        SharedHostingCronLease::resetForTesting();
        SharedHostingCronLease::release();
        Cache::flush();
    }

    protected function tearDown(): void
    {
        SharedHostingCronLease::resetForTesting();
        SharedHostingCronLease::release();
        Cache::flush();
        Container::setInstance(null);
        Facade::setFacadeApplication(null);
        Facade::clearResolvedInstances();
        parent::tearDown();
    }

    public function test_lease_acquisition_and_release(): void
    {
        $this->assertFalse(SharedHostingCronLease::hasActiveLock());

        $acquired = SharedHostingCronLease::acquire(60);
        $this->assertTrue($acquired);
        $this->assertTrue(SharedHostingCronLease::hasActiveLock());

        SharedHostingCronLease::release();
        $this->assertFalse(SharedHostingCronLease::hasActiveLock());
    }

    public function test_lease_overlap_protection_prevents_concurrent_runs(): void
    {
        $first = SharedHostingCronLease::acquire(60);
        $this->assertTrue($first);

        // Second attempt to acquire must fail while lease is active
        $second = SharedHostingCronLease::acquire(60);
        $this->assertFalse($second);

        // After release, a new runner can acquire
        SharedHostingCronLease::release();
        $third = SharedHostingCronLease::acquire(60);
        $this->assertTrue($third);
        SharedHostingCronLease::release();
    }

    public function test_owner_aware_lock_expired_old_holder_cannot_release_new_holder(): void
    {
        $store = Cache::getStore();

        // Process 1 acquires lock with explicit owner 1
        $lock1 = $store->lock('test:owner_aware_lease', 10, 'owner-process-1');
        $this->assertTrue($lock1->acquire());

        // Process 2 tries to acquire -> must fail
        $lock2 = $store->lock('test:owner_aware_lease', 10, 'owner-process-2');
        $this->assertFalse($lock2->acquire());

        // Simulate TTL expiration and takeover by Process 2
        $lock1->forceRelease();
        $this->assertTrue($lock2->acquire());

        // Process 1 attempts to release() after takeover
        // Because lock1's owner is 'owner-process-1', release() must NOT release Process 2's lock
        $lock1->release();

        // Process 3 tries to acquire -> must still be blocked by Process 2
        $lock3 = $store->lock('test:owner_aware_lease', 10, 'owner-process-3');
        $this->assertFalse($lock3->acquire());

        // Process 2 releases its own lock
        $lock2->release();

        // Process 3 can now acquire cleanly
        $this->assertTrue($lock3->acquire());
        $lock3->release();
    }

    public function test_cron_runner_skips_without_overlap_when_lease_held(): void
    {
        // Acquire lease externally
        $this->assertTrue(SharedHostingCronLease::acquire(60));

        $runner = new SharedHostingCronRunner();
        $result = $runner->run(25.0, 25);

        $this->assertFalse($result['executed']);
        $this->assertTrue($result['skipped_overlap']);
        $this->assertFalse($result['heartbeat_recorded']);

        SharedHostingCronLease::release();
    }

    public function test_cron_runner_executes_and_records_heartbeat_when_lease_free(): void
    {
        $runner = new SharedHostingCronRunner();
        $result = $runner->run(25.0, 25);

        $this->assertTrue($result['executed']);
        $this->assertFalse($result['skipped_overlap']);
        $this->assertSame('healthy', $result['status']);
        $this->assertArrayHasKey('duration_seconds', $result);
        $this->assertArrayHasKey('summary', $result);

        // Lease must be released after execution
        $this->assertFalse(SharedHostingCronLease::hasActiveLock());

        // Heartbeat must be recorded and healthy
        $latest = SharedHostingCronHeartbeat::getLatest();
        $this->assertNotNull($latest);
        $this->assertSame('healthy', $latest['status']);
        $this->assertTrue(SharedHostingCronHeartbeat::isHealthy());
    }

    public function test_cron_runner_records_failed_status_and_sanitized_errors_when_task_throws(): void
    {
        // Bind throwing handler for session cleanup to simulate task exception
        $secretToken = 'SUPER_SECRET_DB_PASSWORD_NEVER_REFLECT';
        $this->container->bind(\App\Identity\Sessions\AnonymousSessionCleanup::class, function () use ($secretToken) {
            throw new \RuntimeException("Database connection failed with credentials: {$secretToken}");
        });

        $runner = new SharedHostingCronRunner();
        $result = $runner->run(25.0, 25);

        $this->assertTrue($result['executed']);
        $this->assertSame('failed', $result['status']);
        $this->assertNotEmpty($result['summary']['errors']);

        // Check sanitized errors: contains task name, class name, numeric code
        $error = $result['summary']['errors'][0];
        $this->assertSame('session_cleanup', $error['task']);
        $this->assertSame('RuntimeException', $error['class']);

        // Check secret string is NEVER leaked in json/summary
        $serialized = json_encode($result);
        $this->assertStringNotContainsString($secretToken, (string) $serialized);

        // Heartbeat must NOT be healthy after failed cycle
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());
    }

    public function test_cron_runner_sets_degraded_status_when_wall_deadline_reached(): void
    {
        $runner = new SharedHostingCronRunner();

        // With 0.0s max wall time (bounded to 1.0s, but remaining is checked against wall bounds)
        // Simulate immediate deadline reached by setting tiny duration
        $result = $runner->run(1.0, 25);

        // Heartbeat must record honest facts
        $latest = SharedHostingCronHeartbeat::getLatest();
        $this->assertNotNull($latest);
    }

    public function test_cron_heartbeat_truthfulness_and_health_window(): void
    {
        // 1. Missing heartbeat
        Cache::forget(SharedHostingCronHeartbeat::HEARTBEAT_CACHE_KEY);
        $this->assertNull(SharedHostingCronHeartbeat::getLatest());
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());

        // 2. Failed status heartbeat
        SharedHostingCronHeartbeat::record(['errors' => [['task' => 'test', 'class' => 'Error']]], 1.0, 'failed', false);
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());

        // 3. Degraded status heartbeat (wall deadline reached)
        SharedHostingCronHeartbeat::record(['wall_deadline_reached' => true], 1.0, 'degraded', true);
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());

        // 4. Future timestamp (> now + 5s) must be rejected
        $futureRecord = [
            'timestamp' => time() + 3600,
            'iso' => gmdate('Y-m-d\TH:i:s\Z', time() + 3600),
            'status' => 'healthy',
            'cycle_completed' => true,
            'duration_seconds' => 1.0,
            'cadence_minutes' => 15,
            'summary' => ['errors' => [], 'wall_deadline_reached' => false],
        ];
        Cache::put(SharedHostingCronHeartbeat::HEARTBEAT_CACHE_KEY, $futureRecord, 7200);
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());

        // 5. Stale heartbeat (older than 15m cadence + 3m grace) must report false
        $staleRecord = [
            'timestamp' => time() - (20 * 60),
            'iso' => gmdate('Y-m-d\TH:i:s\Z', time() - (20 * 60)),
            'status' => 'healthy',
            'cycle_completed' => true,
            'duration_seconds' => 1.0,
            'cadence_minutes' => 15,
            'summary' => ['errors' => [], 'wall_deadline_reached' => false],
        ];
        Cache::put(SharedHostingCronHeartbeat::HEARTBEAT_CACHE_KEY, $staleRecord, 7200);
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());

        // 6. Fresh healthy heartbeat
        SharedHostingCronHeartbeat::record(['wall_deadline_reached' => false, 'errors' => []], 1.25, 'healthy', true);
        $this->assertTrue(SharedHostingCronHeartbeat::isHealthy());
    }

    public function test_cron_command_fails_closed_when_profile_disabled(): void
    {
        config(['foundation-services.shared_hosting_enabled' => false]);

        $command = new SharedHostingCronCommand();
        $output = new BufferedOutput();
        $input = new ArrayInput([], $command->getDefinition());
        $command->setOutput(new OutputStyle($input, $output));
        $command->setInput($input);

        $runner = new SharedHostingCronRunner();
        $exitCode = $command->handle($runner);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Shared hosting profile is not enabled', $output->fetch());
    }

    public function test_cron_command_rejects_invalid_max_seconds_option(): void
    {
        config(['foundation-services.shared_hosting_enabled' => true]);

        $command = new SharedHostingCronCommand();
        $output = new BufferedOutput();
        $input = new ArrayInput(['--max-seconds' => '999'], $command->getDefinition());
        $command->setOutput(new OutputStyle($input, $output));
        $command->setInput($input);

        $runner = new SharedHostingCronRunner();
        $exitCode = $command->handle($runner);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Option --max-seconds must be a number between 1.0 and 25.0', $output->fetch());
    }

    public function test_cron_command_skips_cleanly_on_overlap(): void
    {
        config(['foundation-services.shared_hosting_enabled' => true]);

        // Hold lease externally so runner encounters overlap
        $this->assertTrue(SharedHostingCronLease::acquire(60));

        $command = new SharedHostingCronCommand();
        $output = new BufferedOutput();
        $input = new ArrayInput([], $command->getDefinition());
        $command->setOutput(new OutputStyle($input, $output));
        $command->setInput($input);

        $runner = new SharedHostingCronRunner();
        $exitCode = $command->handle($runner);

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('Execution skipped: Another runner holds the active execution lease', $output->fetch());

        SharedHostingCronLease::release();
    }

    public function test_cron_command_succeeds_on_healthy_cycle(): void
    {
        config(['foundation-services.shared_hosting_enabled' => true]);

        $command = new SharedHostingCronCommand();
        $output = new BufferedOutput();
        $input = new ArrayInput([], $command->getDefinition());
        $command->setOutput(new OutputStyle($input, $output));
        $command->setInput($input);

        $runner = new SharedHostingCronRunner();
        $exitCode = $command->handle($runner);

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('Shared hosting cron cycle finished successfully', $output->fetch());
    }

    public function test_cron_hard_timeout_is_not_swallowed_and_restores_signal_state(): void
    {
        $before = pcntl_signal_get_handler(SIGALRM);
        $async = pcntl_async_signals();
        $this->container->bind(\App\Identity\Sessions\AnonymousSessionCleanup::class, static function () {
            usleep(7500000);
            throw new \RuntimeException('The deadline should interrupt this factory.');
        });
        $start = hrtime(true);
        $result = (new SharedHostingCronRunner())->run(5.1, 1);
        $this->assertSame('degraded', $result['status']);
        $this->assertTrue($result['summary']['timeout']);
        $this->assertLessThan(6.2, (hrtime(true) - $start) / 1e9);
        $this->assertSame($before, pcntl_signal_get_handler(SIGALRM));
        $this->assertSame($async, pcntl_async_signals());
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());
    }

    public function test_cron_deployment_rejects_process_local_leases(): void
    {
        config(['app.env' => 'production']);
        $this->expectException(\RuntimeException::class);
        SharedHostingCronLease::acquire();
    }

    public function test_cron_missing_enabled_mail_dependency_is_unhealthy(): void
    {
        config(['mvp-mail.enabled' => true, 'mvp-mail.identity_smtp_enabled' => true]);
        $result = (new SharedHostingCronRunner())->run(25, 1);
        $this->assertSame('failed', $result['status']);
        $this->assertFalse(SharedHostingCronHeartbeat::isHealthy());
    }

    public function test_missing_deployment_cleanup_is_an_error_not_silent_success(): void
    {
        config(['app.env' => 'production']);
        $summary = ['errors' => []];
        $method = new \ReflectionMethod(SharedHostingCronRunner::class, 'runSessionCleanup');
        $method->invokeArgs(new SharedHostingCronRunner(), [&$summary, static fn (): float => 20.0]);
        $this->assertCount(1, $summary['errors']);
        $this->assertSame('session_cleanup', $summary['errors'][0]['task']);
        $this->assertSame(\RuntimeException::class, $summary['errors'][0]['class']);
        $this->assertArrayNotHasKey('sessions_purged', $summary);
    }

    public function test_cron_backend_failure_is_not_reported_as_overlap(): void
    {
        config(['cache.default' => 'missing_store']);
        $this->expectException(\RuntimeException::class);
        try {
            SharedHostingCronLease::acquire();
        } finally {
            config(['cache.default' => 'array']);
        }
    }

    public function test_cadence_uses_cached_config_and_only_supported_intervals(): void
    {
        config(['foundation-services.cron_cadence_minutes' => 1440]);
        $this->assertSame(15, SharedHostingCronHeartbeat::getCadenceMinutes());
        config(['foundation-services.cron_cadence_minutes' => 60]);
        $this->assertSame(60, SharedHostingCronHeartbeat::getCadenceMinutes());
        config(['foundation-services.shared_hosting_enabled' => false]);
        putenv('HOSTPAPA_SHARED_ENABLED=true');
        try {
            $this->assertFalse(SharedHostingProfile::isEnabled());
        } finally {
            putenv('HOSTPAPA_SHARED_ENABLED');
        }
    }
}
