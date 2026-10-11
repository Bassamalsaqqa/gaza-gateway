<?php

declare(strict_types=1);

namespace App\Reference\Fleet;

final class AircraftDto
{
    public function __construct(
        public readonly string $id,
        public readonly string $model,
        public readonly string $registration,
        public readonly bool $active,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self(
            id: $row->id,
            model: $row->model,
            registration: $row->registration_normalized,
            active: (bool) $row->active,
        );
    }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'model'        => $this->model,
            'registration' => $this->registration,
            'active'       => $this->active,
        ];
    }
}
