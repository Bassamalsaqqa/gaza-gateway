<?php

declare(strict_types=1);

namespace Tests\Unit\ReferenceSchedules;

use App\Mvp\Reservations\ReservationDepartureBoundary;
use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use App\Reference\Schedules\OfferingLocalTime;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class ReservationDepartureBoundaryTest extends TestCase
{
    public function test_western_departure_still_future_after_utc_midnight(): void
    {
        $offering = OfferingLocalTime::project('2026-07-15', '23:30', 'America/New_York', 'Asia/Gaza', 600);
        ReservationDepartureBoundary::assertFuture($offering['departAt'], new DateTimeImmutable('2026-07-16T02:00:00Z'));
        $this->assertSame('2026-07-15T23:30:00-04:00', $offering['departAt']);
    }

    public function test_eastern_tomorrow_calendar_can_already_have_departed(): void
    {
        $offering = OfferingLocalTime::project('2026-07-16', '00:30', 'Pacific/Auckland', 'Asia/Gaza', 900);
        $this->expectException(ReservationValidationException::class);
        ReservationDepartureBoundary::assertFuture($offering['departAt'], new DateTimeImmutable('2026-07-15T13:00:00Z'));
    }

    public function test_exact_boundary_and_microsecond_after_reject_but_before_accepts(): void
    {
        $departure = '2026-12-20T08:00:00+02:00';
        ReservationDepartureBoundary::assertFuture($departure, new DateTimeImmutable('2026-12-20T05:59:59.999999Z'));
        $this->addToAssertionCount(1);
        foreach (['2026-12-20T06:00:00.000000Z', '2026-12-20T06:00:00.000001Z'] as $now) {
            try { ReservationDepartureBoundary::assertFuture($departure, new DateTimeImmutable($now)); $this->fail('Departed offering accepted.'); }
            catch (ReservationValidationException) { $this->addToAssertionCount(1); }
        }
    }

    public function test_dst_offsets_and_fractional_offset_are_compared_as_instants(): void
    {
        foreach ([['2026-03-08', '01:30', 'America/New_York', '2026-03-08T06:29:59Z'],
            ['2026-03-08', '03:30', 'America/New_York', '2026-03-08T07:29:59Z'],
            ['2026-11-01', '02:30', 'America/New_York', '2026-11-01T07:29:59Z'],
            ['2026-07-15', '04:30', 'Asia/Kolkata', '2026-07-14T22:59:59Z']] as [$date, $time, $zone, $now]) {
            $offering = OfferingLocalTime::project($date, $time, $zone, 'Asia/Gaza', 600);
            ReservationDepartureBoundary::assertFuture($offering['departAt'], new DateTimeImmutable($now));
            $this->addToAssertionCount(1);
            try { ReservationDepartureBoundary::assertFuture($offering['departAt'], new DateTimeImmutable($offering['departAt'])); $this->fail('Departure boundary accepted.'); }
            catch (ReservationValidationException) { $this->addToAssertionCount(1); }
        }
    }

    public function test_missing_offset_relative_and_invalid_calendar_instants_fail_closed(): void
    {
        foreach ([null, '', 'tomorrow', '2026-12-20T08:00:00', '2026-02-30T08:00:00Z', '2026-12-20T25:00:00Z'] as $bad) {
            try { ReservationDepartureBoundary::assertFuture($bad, new DateTimeImmutable('2026-01-01T00:00:00Z')); $this->fail('Invalid authority accepted.'); }
            catch (ReservationValidationException) { $this->addToAssertionCount(1); }
        }
    }
}
