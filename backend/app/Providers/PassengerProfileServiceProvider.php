<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use App\Identity\Passenger\Profile\PassengerProfileAuthorizer;
use App\Identity\Passenger\Profile\PassengerProfileCoordinator;
use App\Identity\Passenger\Profile\SavedTravelerCoordinator;
use App\Identity\Passenger\Profile\UnconfiguredMealCatalog;
use Illuminate\Support\ServiceProvider;

final class PassengerProfileServiceProvider extends ServiceProvider
{
    /**
     * Register Passenger Profile services in container.
     */
    public function register(): void
    {
        // 1. Authoritative meal catalog defaults to unconfigured (returns unavailable).
        // Phase 13C provides the commercial catalog adapter.
        $this->app->bindIf(MealCatalogInterface::class, UnconfiguredMealCatalog::class);

        // 2. Register coordinators and authorizer
        $this->app->singleton(PassengerProfileAuthorizer::class);
        $this->app->singleton(PassengerProfileCoordinator::class);
        $this->app->singleton(SavedTravelerCoordinator::class);
    }

    /**
     * Bootstrap services. Route wiring is performed by Codex upon authentication acceptance.
     */
    public function boot(): void
    {
    }
}
