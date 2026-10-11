<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

final class ScheduleDto
{
    /**
     * @param int[] $days
     * @param array<int, array<string, mixed>> $exceptions
     */
    public function __construct(
        public readonly string $id,
        public readonly string $number,
        public readonly string $direction,
        public readonly string $destination,
        public readonly array $days,
        public readonly string $departTime,
        public readonly string $arriveTime,
        public readonly string $aircraft,
        public readonly ?string $aircraftId,
        public readonly string $from,
        public readonly string $until,
        public readonly bool $active,
        public readonly array $exceptions,
    ) {}

    public static function fromRow(object $row): self
    {
        $days = json_decode((string) $row->days_json, true, 512, JSON_THROW_ON_ERROR);
        sort($days);
        $exceptions = json_decode((string) $row->exceptions_json, true, 512, JSON_THROW_ON_ERROR);

        return new self(
            id: (string) $row->id,
            number: (string) $row->number,
            direction: (string) $row->direction,
            destination: (string) $row->destination,
            days: array_values($days),
            departTime: substr((string) $row->depart_time, 0, 5),
            arriveTime: substr((string) $row->arrive_time, 0, 5),
            aircraft: (string) $row->aircraft,
            aircraftId: $row->aircraft_id !== null ? (string) $row->aircraft_id : null,
            from: substr((string) $row->from_date, 0, 10),
            until: substr((string) $row->until_date, 0, 10),
            active: (bool) $row->active,
            exceptions: array_values($exceptions),
        );
    }

    public function toArray(): array
    {
        $data = [
            'id' => $this->id,
            'number' => $this->number,
            'direction' => $this->direction,
            'destination' => $this->destination,
            'days' => $this->days,
            'departTime' => $this->departTime,
            'arriveTime' => $this->arriveTime,
            'aircraft' => $this->aircraft,
            'from' => $this->from,
            'until' => $this->until,
            'active' => $this->active,
            'exceptions' => $this->exceptions,
        ];
        if ($this->aircraftId !== null) {
            $data['aircraftId'] = $this->aircraftId;
        }
        return $data;
    }
}
