<?php

declare(strict_types=1);

namespace App\Reference\Meals;

final class MealDto
{
    public function __construct(
        public readonly string $id,
        public readonly string $labelEn,
        public readonly string $labelAr,
        public readonly bool $active,
        public readonly int $order,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self(
            id: (string) $row->id,
            labelEn: (string) $row->label_en,
            labelAr: (string) $row->label_ar,
            active: (bool) $row->active,
            order: (int) $row->order_num,
        );
    }

    /**
     * @return array{
     *     id: string,
     *     label: array{en: string, ar: string},
     *     active: bool,
     *     order: int
     * }
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'label' => [
                'en' => $this->labelEn,
                'ar' => $this->labelAr,
            ],
            'active' => $this->active,
            'order' => $this->order,
        ];
    }
}
