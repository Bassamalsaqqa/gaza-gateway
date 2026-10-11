<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Mvp\Reservations\Exceptions\ReservationAuthorityUnavailableException;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Reference\Schedules\Exceptions\OfferingAvailabilityException;
use App\Reference\Schedules\Exceptions\OfferingNotFoundException;
use App\Reference\Schedules\OfferingResolver;
use Throwable;

final class OfferingResolverReservationAuthority implements ReservationOfferingAuthority
{
    public function __construct(
        private readonly OfferingResolver $resolver,
    ) {}

    public function resolve(string $serviceId): array
    {
        try {
            return $this->resolver->resolveId($serviceId)->toArray();
        } catch (OfferingNotFoundException $e) {
            throw new ReservationNotFoundException('Offering not found.');
        } catch (OfferingAvailabilityException $e) {
            throw new ReservationNotFoundException('Offering not found.');
        } catch (Throwable $e) {
            throw new ReservationAuthorityUnavailableException('Offering authority unavailable: ' . 'Offering not found.');
        }
    }
}
