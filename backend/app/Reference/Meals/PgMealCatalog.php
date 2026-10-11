<?php

declare(strict_types=1);

namespace App\Reference\Meals;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use Illuminate\Support\Facades\DB;

final class PgMealCatalog implements MealCatalogInterface
{
    public function isAvailable(): bool
    {
        return config('meals.enabled') === true;
    }

    /**
     * Returns list of currently active commercial meal identifiers.
     *
     * @return list<string>
     */
    public function getActiveMealIds(): array
    {
        if (!$this->isAvailable()) {
            return [];
        }

        return DB::table('meal_options')
            ->where('active', true)
            ->orderBy('order_num', 'asc')
            ->orderBy('id', 'asc')
            ->pluck('id')
            ->map(static fn(mixed $id): string => (string) $id)
            ->all();
    }
}
