<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Audit\AuditWriter;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\StaffAuthCoordinator;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

final class StaffIdentityServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(StaffAuthCoordinator::class, fn ($app) => new StaffAuthCoordinator(
            DB::connection(), $app->make(Encrypter::class), $app->make(Argon2idPasswordHasher::class),
            $app->make(StaffSessionStore::class), $app->make(DurableRateLimiter::class),
            $app->make(AuditWriter::class), $app->make(RbacPolicy::class),
        ));
    }
}
