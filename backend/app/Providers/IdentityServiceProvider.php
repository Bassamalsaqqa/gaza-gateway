<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Password\PasswordPolicy;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

final class IdentityServiceProvider extends ServiceProvider
{
    /**
     * Register identity services and security primitives in container.
     */
    public function register(): void
    {
        $this->mergeConfigFrom(
            dirname(__DIR__, 2) . '/config/identity.php',
            'identity'
        );

        $this->mergeConfigFrom(
            dirname(__DIR__, 2) . '/config/hashing.php',
            'hashing'
        );

        $this->app->singleton(PasswordPolicy::class, function () {
            return new PasswordPolicy();
        });

        $this->app->singleton(Argon2idPasswordHasher::class, function ($app) {
            $config = $app['config']->get('identity.passwords.argon2id');
            if (!is_array($config) ||
                !isset($config['memory_kib'], $config['time_cost'], $config['threads']) ||
                !is_int($config['memory_kib']) ||
                !is_int($config['time_cost']) ||
                !is_int($config['threads'])
            ) {
                throw new \InvalidArgumentException('Invalid Argon2id configuration profile: strictly typed integers required.');
            }

            return new Argon2idPasswordHasher(
                memoryKib: $config['memory_kib'],
                timeCost: $config['time_cost'],
                threads: $config['threads'],
                policy: $app->make(PasswordPolicy::class),
            );
        });

        $this->app->singleton(PassengerSessionStore::class, function ($app) {
            return new PassengerSessionStore(
                db: DB::connection(),
                encrypter: $app->make(Encrypter::class),
            );
        });

        $this->app->singleton(StaffSessionStore::class, function ($app) {
            return new StaffSessionStore(
                db: DB::connection(),
                encrypter: $app->make(Encrypter::class),
            );
        });

        $this->app->singleton(RbacPolicy::class, function () {
            return new RbacPolicy(
                db: DB::connection(),
            );
        });

        $this->app->singleton(DurableRateLimiter::class, function () {
            return new DurableRateLimiter(
                db: DB::connection(),
            );
        });

        $this->app->singleton(\App\Identity\Sessions\AnonymousSessionCleanup::class, function () {
            return new \App\Identity\Sessions\AnonymousSessionCleanup(
                db: DB::connection(),
            );
        });

        $this->app->singleton(\App\Identity\RateLimiting\AnonymousBootstrapAdmission::class, function ($app) {
            return new \App\Identity\RateLimiting\AnonymousBootstrapAdmission(
                db: DB::connection(),
                encrypter: $app->make(Encrypter::class),
                cleanupService: $app->make(\App\Identity\Sessions\AnonymousSessionCleanup::class),
            );
        });

        $this->app->singleton(\App\Http\Middleware\Identity\VerifyApplicationCsrfHeader::class, function ($app) {
            return new \App\Http\Middleware\Identity\VerifyApplicationCsrfHeader(
                passengerStore: $app->make(PassengerSessionStore::class),
                staffStore: $app->make(StaffSessionStore::class),
                rbacPolicy: $app->make(RbacPolicy::class),
                db: DB::connection(),
            );
        });
    }

    /**
     * Bootstrap any application identity services.
     */
    public function boot(): void
    {
        \Illuminate\Support\Facades\Auth::extend('passenger_session', function ($app, $name, array $config) {
            $guard = new \App\Identity\Guards\PassengerSessionGuard(
                store: $app->make(PassengerSessionStore::class),
                request: $app->make('request'),
            );
            $app->refresh('request', $guard, 'setRequest');
            return $guard;
        });

        \Illuminate\Support\Facades\Auth::extend('staff_session', function ($app, $name, array $config) {
            $guard = new \App\Identity\Guards\StaffSessionGuard(
                store: $app->make(StaffSessionStore::class),
                rbacPolicy: $app->make(RbacPolicy::class),
                request: $app->make('request'),
            );
            $app->refresh('request', $guard, 'setRequest');
            return $guard;
        });
    }
}
