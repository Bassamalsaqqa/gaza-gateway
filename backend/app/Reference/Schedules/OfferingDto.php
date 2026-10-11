<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

final class OfferingDto
{
    /**
     * @param array<string, mixed> $layout
     * @param array{fleet: int, network: int, schedules: int} $revisions
     */
    public function __construct(
        public readonly string $id,
        public readonly string $scheduleId,
        public readonly string $date,
        public readonly string $number,
        public readonly string $direction,
        public readonly string $originCode,
        public readonly string $destinationCode,
        public readonly string $departTime,
        public readonly string $arriveTime,
        public readonly int $durationMinutes,
        public readonly string $aircraftId,
        public readonly string $aircraft,
        public readonly array $layout,
        public readonly array $revisions,
        public readonly string $classification = 'commemorative',
        public readonly int $priceMinor = 0,
    ) {}

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'scheduleId' => $this->scheduleId,
            'date' => $this->date,
            'number' => $this->number,
            'direction' => $this->direction,
            'originCode' => $this->originCode,
            'destinationCode' => $this->destinationCode,
            'departTime' => $this->departTime,
            'arriveTime' => $this->arriveTime,
            'durationMinutes' => $this->durationMinutes,
            'aircraftId' => $this->aircraftId,
            'aircraft' => $this->aircraft,
            'layout' => $this->layout,
            'revisions' => $this->revisions,
            'classification' => $this->classification,
            'priceMinor' => $this->priceMinor,
        ];
    }
}
