<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Collection;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

/** Current action plus bounded live target authority; never locks expired/revoked history. */
final class StaffAuthorityRows
{
    public const LIMIT = 100;

    public static function lockSessions(ConnectionInterface $db, string $currentId, ?string $revocationTarget): Collection
    {
        $bound = [];
        if ($revocationTarget !== null) {
            $bound = $db->table('staff_pending_auth')->where('staff_id', $revocationTarget)->where('state', 'issued')
                ->whereNull('revoked_at')->whereNull('consumed_at')->where('expires_at', '>', $db->raw('clock_timestamp()'))
                ->orderBy('id')->limit(self::LIMIT + 1)->pluck('bound_session_id')->all();
            if (count($bound) > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        }
        $rows = $db->table('staff_sessions')->where(function ($q) use ($db, $currentId, $revocationTarget, $bound) {
            $q->where('id', $currentId);
            if ($revocationTarget !== null) {
                $q->orWhere(function ($live) use ($db, $revocationTarget, $bound) {
                    $live->where(fn ($owner) => $owner->where('staff_id', $revocationTarget)->orWhereIn('id', $bound))
                        ->whereNull('revoked_at')->where('absolute_expires_at', '>', $db->raw('clock_timestamp()'))
                        ->where('idle_expires_at', '>', $db->raw('clock_timestamp()'));
                });
            }
        })->orderBy('id')->limit(self::LIMIT + 1)->lockForUpdate()->get();
        if ($rows->count() > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        return $rows;
    }

    public static function revokeLiveSessions(ConnectionInterface $db, string $staffId, $now): void
    {
        $bound = $db->table('staff_pending_auth')->where('staff_id', $staffId)->where('state', 'issued')
            ->whereNull('revoked_at')->whereNull('consumed_at')->where('expires_at', '>', $db->raw('clock_timestamp()'))
            ->orderBy('id')->limit(self::LIMIT + 1)->pluck('bound_session_id');
        if ($bound->count() > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        $db->table('staff_sessions')->where(fn ($q) => $q->where('staff_id', $staffId)->orWhereIn('id', $bound))
            ->whereNull('revoked_at')->where('absolute_expires_at', '>', $db->raw('clock_timestamp()'))
            ->where('idle_expires_at', '>', $db->raw('clock_timestamp()'))->update(['revoked_at' => $now]);
    }
}
