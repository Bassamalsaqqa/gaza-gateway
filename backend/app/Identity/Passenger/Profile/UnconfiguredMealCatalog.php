<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

/**
 * Default production meal catalog implementation when Phase 13C commercial
 * catalog has not been configured.
 *
 * Genuinely changed meal preferences fail closed with service_unavailable (503).
 */
final class UnconfiguredMealCatalog implements MealCatalogInterface
{
    public function isAvailable(): bool
    {
        return false;
    }

    public function getActiveMealIds(): array
    {
        return [];
    }
}
