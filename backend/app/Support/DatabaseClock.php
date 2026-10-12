<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Expression;
use Illuminate\Support\Facades\DB;

final class DatabaseClock
{
    /**
     * Fresh UTC_TIMESTAMP(6) evaluated on the database connection,
     * specifically after waited locks.
     */
    public static function now(\Illuminate\Database\ConnectionInterface|string|null $connection = null): CarbonImmutable
    {
        $conn = $connection instanceof \Illuminate\Database\ConnectionInterface
            ? $connection
            : DB::connection($connection);
        $row = $conn->selectOne('SELECT UTC_TIMESTAMP(6) AS db_now');
        return CarbonImmutable::parse($row->db_now, 'UTC');
    }

    /**
     * Database raw expression for UTC_TIMESTAMP(6).
     */
    public static function raw(): Expression
    {
        return DB::raw('UTC_TIMESTAMP(6)');
    }

    /**
     * ISO 8601 string representation with microsecond precision.
     */
    public static function nowIso8601(?string $connection = null): string
    {
        return self::now($connection)->format('Y-m-d\TH:i:s.u\Z');
    }
}
