<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

interface ReservationOfferingAuthority
{
    /**
     * Resolve dated flight offering for reservation.
     *
     * Returns exact DTO with keys:
     * id, scheduleId, date, number, direction, originCode, destinationCode,
     * departTime, arriveTime, durationMinutes, aircraftId, aircraft, layout,
     * revisions, classification='commemorative', priceMinor=0.
     *
     * @return array{
     *     id: string,
     *     scheduleId: string,
     *     date: string,
     *     number: string,
     *     direction: string,
     *     originCode: string,
     *     destinationCode: string,
     *     departTime: string,
     *     arriveTime: string,
     *     departAt: string,
     *     arriveAt: string,
     *     originTimezone: string,
     *     destinationTimezone: string,
     *     arrivalDate: string,
     *     durationMinutes: int,
     *     aircraftId: string,
     *     aircraft: string,
     *     layout: array<string, mixed>,
     *     revisions: array{fleet: int, network: int, schedules: int},
     *     classification: string,
     *     priceMinor: int
     * }
     */
    public function resolve(string $serviceId): array;
}
