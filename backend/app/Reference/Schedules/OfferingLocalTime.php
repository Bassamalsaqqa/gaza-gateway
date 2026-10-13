<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use DateTimeImmutable;
use DateTimeZone;

/** Calendar date belongs to departure airport. Block duration is elapsed time, including DST. */
final class OfferingLocalTime
{
    public static function project(string $date, string $time, string $originZone, string $destinationZone, int $minutes): array
    {
        if (!ScheduleIdentityCodec::isValidISODate($date) || !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $time)
            || $minutes < 20 || $minutes > 1440) throw new \InvalidArgumentException('Invalid offering time.');
        $origin = new DateTimeZone($originZone); $destination = new DateTimeZone($destinationZone);
        $wall = $date . ' ' . $time;
        $naive = DateTimeImmutable::createFromFormat('!Y-m-d H:i', $wall, new DateTimeZone('UTC'));
        $offsets = [];
        foreach ($origin->getTransitions($naive->getTimestamp() - 172800, $naive->getTimestamp() + 172800) ?: [] as $transition) {
            $offsets[(int) $transition['offset']] = true;
        }
        if (!$offsets) $offsets[$origin->getOffset($naive)] = true;
        $matches = [];
        foreach (array_keys($offsets) as $offset) {
            $candidate = (new DateTimeImmutable('@' . ($naive->getTimestamp() - $offset)))->setTimezone($origin);
            if ($candidate->format('Y-m-d H:i') === $wall) $matches[$candidate->getTimestamp()] = $candidate;
        }
        // Never silently normalize nonexistent clocks or choose an ambiguous DST occurrence.
        if (count($matches) !== 1) throw new \InvalidArgumentException('Offering departure clock is nonexistent or ambiguous.');
        $departure = array_values($matches)[0];
        $arrival = (new DateTimeImmutable('@' . ($departure->getTimestamp() + $minutes * 60)))->setTimezone($destination);
        return ['originTimezone' => $originZone, 'destinationTimezone' => $destinationZone,
            'departAt' => $departure->format(DATE_RFC3339), 'arriveAt' => $arrival->format(DATE_RFC3339),
            'arrivalDate' => $arrival->format('Y-m-d'), 'arriveTime' => $arrival->format('H:i')];
    }
}
