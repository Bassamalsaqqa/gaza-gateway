<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityPassengerProfile;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use LogicException;

/**
 * Deterministic test-only meal catalog implementation under strict testing guards.
 */
final class TestMealCatalog implements MealCatalogInterface
{
    public function __construct(
        public bool $available = true,
        /** @var list<string> */
        public array $activeMealIds = ['halal-standard', 'vegetarian', 'diabetic', 'kosher'],
    ) {
        if (config('app.env') !== 'testing' && env('APP_ENV') !== 'testing') {
            throw new LogicException('TestMealCatalog is strictly restricted to testing environment.');
        }
    }

    public function isAvailable(): bool
    {
        return $this->available;
    }

    public function getActiveMealIds(): array
    {
        return $this->activeMealIds;
    }

    public function setAvailable(bool $available): self
    {
        $this->available = $available;
        return $this;
    }

    /**
     * @param list<string> $mealIds
     */
    public function setActiveMealIds(array $mealIds): self
    {
        $this->activeMealIds = $mealIds;
        return $this;
    }
}
