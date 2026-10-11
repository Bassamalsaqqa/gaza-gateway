<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Audit\AuditWriter;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\StaffAuthCoordinator;
use App\Identity\Staff\StaffLifecycleCoordinator;
use App\Identity\Staff\StaffDirectoryCoordinator;
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
        $this->app->singleton(StaffLifecycleCoordinator::class, fn ($app) => new StaffLifecycleCoordinator(
            DB::connection(), $app->make(Encrypter::class), $app->make(Argon2idPasswordHasher::class),
            $app->make(StaffSessionStore::class), $app->make(DurableRateLimiter::class),
            $app->make(\App\Identity\Proofs\ProofService::class), $app->make(\App\Identity\Dispatch\OutboxService::class),
            $app->make(AuditWriter::class), $app->make(RbacPolicy::class),
        ));
        $this->app->singleton(StaffDirectoryCoordinator::class, fn ($app) => new StaffDirectoryCoordinator(
            DB::connection(), $app->make(Encrypter::class), $app->make(DurableRateLimiter::class),
            $app->make(\App\Identity\Proofs\ProofService::class), $app->make(\App\Identity\Dispatch\OutboxService::class),
            $app->make(AuditWriter::class), $app->make(RbacPolicy::class),
        ));
    }
}
