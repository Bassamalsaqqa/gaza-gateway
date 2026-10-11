<?php

declare(strict_types=1);

namespace App\Reference\Fleet;

final class SeatLayoutDto
{
    /**
     * @param string[] $letters
     * @param array[]  $zones
     * @param int[]    $extraLegroomRows
     * @param string[] $unavailable
     */
    public function __construct(
        public readonly string $aircraftId,
        public readonly int $rows,
        public readonly array $letters,
        public readonly int $aisleAfter,
        public readonly array $zones,
        public readonly array $extraLegroomRows,
        public readonly array $unavailable,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self(
            aircraftId: $row->aircraft_id,
            rows: (int) $row->rows,
            letters: json_decode($row->letters_json, true, 512, JSON_THROW_ON_ERROR),
            aisleAfter: (int) $row->aisle_after,
            zones: array_map(static fn(array $zone): array => ['id' => $zone['id'], 'firstRow' => $zone['firstRow'], 'lastRow' => $zone['lastRow']],
                json_decode($row->zones_json, true, 512, JSON_THROW_ON_ERROR)),
            extraLegroomRows: json_decode($row->extra_legroom_rows_json, true, 512, JSON_THROW_ON_ERROR),
            unavailable: json_decode($row->unavailable_json, true, 512, JSON_THROW_ON_ERROR),
        );
    }

    public function toArray(): array
    {
        return [
            'aircraftId'       => $this->aircraftId,
            'rows'             => $this->rows,
            'letters'          => $this->letters,
            'aisleAfter'       => $this->aisleAfter,
            'zones'            => $this->zones,
            'extraLegroomRows' => $this->extraLegroomRows,
            'unavailable'      => $this->unavailable,
        ];
    }
}
