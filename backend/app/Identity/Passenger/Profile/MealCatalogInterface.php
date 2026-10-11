<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

/**
 * Narrow interface for commercial meal catalog context.
 *
 * Phase 13C provides the authoritative commercial catalog implementation.
 * In Phase 13B, unconfigured default reports unavailable (isAvailable() === false).
 */
interface MealCatalogInterface
{
    /**
     * Indicates whether an authoritative commercial meal catalog is currently active.
     */
    public function isAvailable(): bool;

    /**
     * Returns list of currently active commercial meal identifiers.
     *
     * @return list<string>
     */
    public function getActiveMealIds(): array;
}
