<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityStaff;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Independent PostgreSQL transaction holding only synthetic history and optional writer locks. */
final class StaffHistoryBlocker
{
    public static function hold(string $currentSessionId, bool $sentinel = false, ?string $unrelatedStaff = null): \Illuminate\Database\ConnectionInterface
    {
        $db = DB::connection();
        $connName = $db->getName();
        if (getenv('APP_ENV') !== 'testing' || !app()->environment('testing')) { throw new \LogicException('Fixture database admission failed.'); }
        if ($connName === 'mysql_test') {
            if ($db->getDriverName() !== 'mysql' || $db->getDatabaseName() !== 'gaza_gateway_mysql_test') { throw new \LogicException('Fixture database admission failed.'); }
        } else {
            if ($connName !== 'pgsql_test' || $db->getDriverName() !== 'pgsql' || $db->getDatabaseName() !== 'gaza_gateway_test'
                || $db->selectOne('SELECT current_database() AS db')->db !== 'gaza_gateway_test') { throw new \LogicException('Fixture database admission failed.'); }
        }
        $base = (array) $db->table('staff_sessions')->where('id', $currentSessionId)->first();
        $rows = [];
        for ($i = 0; $i < 300; $i++) {
            $row = $base; $row['id'] = (string) Str::uuid(); $row['lookup_digest'] = hash('sha256', random_bytes(32));
            $row['issued_at'] = now()->subDays(2); $row['last_seen_at'] = now()->subDays(2);
            $row['absolute_expires_at'] = now()->subDay(); $row['idle_expires_at'] = now()->subDay();
            $row['revoked_at'] = $i % 2 === 0 ? now()->subDay() : null; $rows[] = $row;
        }
        $db->table('staff_sessions')->insert($rows);
        $alias = 'staff_history_' . bin2hex(random_bytes(6));
        config(['database.connections.' . $alias => config('database.connections.' . $connName)]);
        $blocker = DB::connection($alias);
        if ($connName === 'mysql_test') {
            if ($blocker->getDriverName() !== 'mysql' || $blocker->getDatabaseName() !== 'gaza_gateway_mysql_test') { throw new \LogicException('Fixture blocker admission failed.'); }
        } else {
            if ($blocker->getDriverName() !== 'pgsql' || $blocker->getDatabaseName() !== 'gaza_gateway_test'
                || $blocker->selectOne('SELECT current_database() AS db')->db !== 'gaza_gateway_test') { throw new \LogicException('Fixture blocker admission failed.'); }
        }
        $blocker->beginTransaction();
        if ($blocker->getDriverName() === 'pgsql') {
            $blocker->statement("SET LOCAL idle_in_transaction_session_timeout = '60s'");
        }
        if ($sentinel) { $blocker->table('staff_directory_control')->where('id', 1)->lockForUpdate()->first(); }
        if ($unrelatedStaff !== null) { $blocker->table('staff_users')->where('id', $unrelatedStaff)->lockForUpdate()->first(); }
        $blocker->table('staff_sessions')->whereIn('id', array_column($rows, 'id'))->orderBy('id')->lockForUpdate()->get();
        return $blocker;
    }
}
