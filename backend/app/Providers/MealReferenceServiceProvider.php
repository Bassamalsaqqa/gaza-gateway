<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use App\Reference\Meals\MealCoordinator;
use App\Reference\Meals\MealValidator;
use App\Reference\Meals\PgMealCatalog;
use Illuminate\Support\ServiceProvider;

final class MealReferenceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(MealValidator::class);
        $this->app->singleton(MealCoordinator::class);

        if (config('meals.enabled') === true) {
            $this->app->bind(MealCatalogInterface::class, PgMealCatalog::class);
        }
    }

    public function boot(): void
    {
    }
}
