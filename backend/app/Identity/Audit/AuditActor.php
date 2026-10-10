<?php

declare(strict_types=1);

namespace App\Identity\Audit;

use App\Identity\Audit\Exceptions\AuditValidationException;
use Illuminate\Support\Str;

/**
 * Value object representing an authenticated principal or verified system actor.
 *
 * Enforces exactly one actor representation matching audit_events check constraints:
 * - passenger: realm='passenger', passenger_id NOT NULL, staff_id NULL, is_system_actor=false
 * - staff: realm='staff', passenger_id NULL, staff_id NOT NULL, is_system_actor=false
 * - system: realm='system', passenger_id NULL, staff_id NULL, is_system_actor=true
 */
final readonly class AuditActor
{
    private function __construct(
        public string $realm,
        public ?string $passengerId,
        public ?string $staffId,
        public bool $isSystemActor,
    ) {
    }

    public static function passenger(string $userId): self
    {
        if (!Str::isUuid($userId)) {
            throw new AuditValidationException("Passenger actor ID must be a valid UUID, got: [{$userId}].");
        }

        return new self(
            realm: 'passenger',
            passengerId: $userId,
            staffId: null,
            isSystemActor: false,
        );
    }

    public static function staff(string $staffId): self
    {
        if (!Str::isUuid($staffId)) {
            throw new AuditValidationException("Staff actor ID must be a valid UUID, got: [{$staffId}].");
        }

        return new self(
            realm: 'staff',
            passengerId: null,
            staffId: $staffId,
            isSystemActor: false,
        );
    }

    public static function system(): self
    {
        return new self(
            realm: 'system',
            passengerId: null,
            staffId: null,
            isSystemActor: true,
        );
    }
}
