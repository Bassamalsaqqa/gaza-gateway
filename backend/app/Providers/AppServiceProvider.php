<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 0. Enforce fail-closed configuration profile validation
        \App\Support\ConfigurationValidator::validate(config()->all(), $this->app->environment());

        // 1. Prohibit destructive commands outside testing mode
        DB::prohibitDestructiveCommands(!$this->app->environment('testing'));

        // Ensure console command events are rerouted across all environments including tests
        $this->app->booted(function () {
            if ($this->app->bound(\Illuminate\Contracts\Console\Kernel::class)) {
                $kernel = $this->app->make(\Illuminate\Contracts\Console\Kernel::class);
                if (method_exists($kernel, 'rerouteSymfonyCommandEvents')) {
                    $kernel->rerouteSymfonyCommandEvents();
                }
            }
        });

        // 2. Strict destructive command database target safeguard
        // Confines migrate:fresh, migrate:refresh, migrate:reset, migrate:rollback, db:wipe strictly to gaza_gateway_test in testing
        Event::listen(CommandStarting::class, function (CommandStarting $event) {
            $destructiveCommands = [
                'migrate:fresh',
                'migrate:refresh',
                'migrate:reset',
                'migrate:rollback',
                'db:wipe',
            ];

            if (in_array($event->command, $destructiveCommands, true)) {
                $env = $this->app->environment();
                if ($env !== 'testing') {
                    throw new \RuntimeException(
                        "Destructive command [{$event->command}] is strictly prohibited in environment [{$env}]. " .
                        "Destructive operations are confined exclusively to testing mode."
                    );
                }

                $connectionName = null;
                if ($event->input->hasParameterOption('--database')) {
                    $connectionName = $event->input->getParameterOption('--database');
                } elseif ($event->input->hasOption('database')) {
                    $connectionName = $event->input->getOption('database');
                }
                if (!$connectionName) {
                    $connectionName = config('database.default', 'pgsql');
                }

                $connConfig = config("database.connections.{$connectionName}", []);
                $databaseName = $connConfig['database'] ?? null;
                if (!empty($connConfig['url'])) {
                    $parsed = parse_url($connConfig['url']);
                    if (!empty($parsed['path'])) {
                        $databaseName = ltrim($parsed['path'], '/');
                    }
                }

                try {
                    $liveDb = DB::connection($connectionName)->getDatabaseName();
                    if ($liveDb) {
                        $databaseName = $liveDb;
                    }
                } catch (\Throwable) {
                    // retain resolved databaseName
                }

                if ($databaseName !== 'gaza_gateway_test') {
                    throw new \RuntimeException(
                        "Destructive command [{$event->command}] is strictly prohibited on non-test database [{$databaseName}] " .
                        "via connection [{$connectionName}]. Destructive operations are confined exclusively to [gaza_gateway_test]."
                    );
                }
            }
        });

        // 3. Worker heartbeat updater
        // Touched on every polling cycle while the queue worker is actively looping
        Queue::looping(function () {
            try {
                Cache::put('worker:heartbeat', time(), 60);
            } catch (\Throwable) {
                // Ignore transient connection issues during restart
            }
        });

        // 4. Configure API rate limiter using configured cache/database store
        RateLimiter::for('api', function (Request $request) {
            $key = $request->ip() ?: 'anonymous';
            return Limit::perMinute(60)->by($key);
        });

        // Dedicated strict limiter for testing 429 Retry-After responses
        RateLimiter::for('probe-strict', function (Request $request) {
            $key = $request->ip() ?: 'anonymous';
            return Limit::perMinute(5)->by($key);
        });
    }
}
