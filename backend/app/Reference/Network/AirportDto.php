<?php

declare(strict_types=1);

namespace App\Reference\Network;

final class AirportDto
{
    /**
     * @param array{en: string, ar: string} $airportName
     * @param array{en: string, ar: string} $city
     * @param array{en: string, ar: string} $country
     */
    public function __construct(
        public readonly string $code,
        public readonly array $airportName,
        public readonly array $city,
        public readonly array $country,
        public readonly string $timezone,
        public readonly int $blockMinutes,
        public readonly bool $active,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self(
            code: $row->code,
            airportName: [
                'en' => $row->airport_name_en,
                'ar' => $row->airport_name_ar,
            ],
            city: [
                'en' => $row->city_en,
                'ar' => $row->city_ar,
            ],
            country: [
                'en' => $row->country_en,
                'ar' => $row->country_ar,
            ],
            timezone: $row->timezone,
            blockMinutes: (int) $row->block_minutes,
            active: (bool) $row->active,
        );
    }

    public function toArray(): array
    {
        return [
            'code' => $this->code,
            'airportName' => $this->airportName,
            'city' => $this->city,
            'country' => $this->country,
            'timezone' => $this->timezone,
            'blockMinutes' => $this->blockMinutes,
            'active' => $this->active,
        ];
    }
}
