<?php

declare(strict_types=1);

namespace App\Reference\Network;

final class RouteDto
{
    public function __construct(
        public readonly string $id,
        public readonly string $originCode,
        public readonly string $destinationCode,
        public readonly string $direction,
        public readonly int $blockMinutes,
        public readonly bool $active,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self(
            id: (string) $row->id,
            originCode: (string) $row->origin_code,
            destinationCode: (string) $row->destination_code,
            direction: (string) $row->direction,
            blockMinutes: (int) $row->block_minutes,
            active: (bool) $row->active,
        );
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'originCode' => $this->originCode,
            'destinationCode' => $this->destinationCode,
            'direction' => $this->direction,
            'blockMinutes' => $this->blockMinutes,
            'active' => $this->active,
        ];
    }
}
