<?php

declare(strict_types=1);

namespace Tests\Unit\ReferenceSchedules;

use App\Reference\Schedules\OfferingLocalTime;
use PHPUnit\Framework\TestCase;

final class OfferingLocalTimeTest extends TestCase
{
    public function test_local_airport_clocks_and_real_elapsed_duration(): void
    {
        $result = OfferingLocalTime::project('2026-07-15', '07:00', 'Asia/Gaza', 'Africa/Cairo', 90);
        $this->assertSame('2026-07-15T07:00:00+03:00', $result['departAt']);
        $this->assertSame('08:30', $result['arriveTime']);
        $this->assertSame(5400, strtotime($result['arriveAt']) - strtotime($result['departAt']));
    }

    public function test_overnight_and_half_hour_timezone_are_not_truncated(): void
    {
        $result = OfferingLocalTime::project('2026-01-01', '23:30', 'America/New_York', 'Asia/Gaza', 60);
        $this->assertSame('2026-01-02', $result['arrivalDate']);
        $this->assertSame('07:30', $result['arriveTime']);
        $halfHour = OfferingLocalTime::project('2026-01-02', '04:30', 'Asia/Kolkata', 'Asia/Gaza', 75);
        $this->assertStringEndsWith('+05:30', $halfHour['departAt']);
        $this->assertSame('02:15', $halfHour['arriveTime']);
    }

    public function test_dst_in_flight_preserves_elapsed_minutes(): void
    {
        $result = OfferingLocalTime::project('2026-03-08', '01:30', 'America/New_York', 'America/New_York', 120);
        $this->assertSame('04:30', $result['arriveTime']);
        $this->assertSame(7200, strtotime($result['arriveAt']) - strtotime($result['departAt']));
    }

    public function test_nonexistent_and_ambiguous_departures_fail_closed(): void
    {
        foreach ([['2026-03-08','02:30'],['2026-11-01','01:30']] as [$date,$time]) {
            try { OfferingLocalTime::project($date,$time,'America/New_York','Asia/Gaza',60); $this->fail('Ambiguous or missing local clock was accepted.'); }
            catch (\InvalidArgumentException) { $this->addToAssertionCount(1); }
        }
    }

    public function test_calendar_and_duration_limits(): void
    {
        foreach ([['2026-02-30','12:00',60],['2026-01-01','25:00',60],['2026-01-01','12:00',19],['2026-01-01','12:00',1441]] as [$date,$time,$duration]) {
            try { OfferingLocalTime::project($date,$time,'Asia/Gaza','UTC',$duration); $this->fail('Invalid input was accepted.'); }
            catch (\InvalidArgumentException) { $this->addToAssertionCount(1); }
        }
    }
}
