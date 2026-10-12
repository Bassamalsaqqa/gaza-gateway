<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use App\Support\DatabaseClock;
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
                ->whereNull('revoked_at')->whereNull('consumed_at')->where('expires_at', '>', DatabaseClock::raw())
                ->orderBy('id')->limit(self::LIMIT + 1)->pluck('bound_session_id')->all();
            if (count($bound) > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        }
        $query = $db->table('staff_sessions')->where(function ($q) use ($db, $currentId, $revocationTarget, $bound) {
            $q->where('id', $currentId);
            if ($revocationTarget !== null) {
                $q->orWhere(function ($live) use ($db, $revocationTarget, $bound) {
                    $live->where(fn ($owner) => $owner->where('staff_id', $revocationTarget)->orWhereIn('id', $bound))
                        ->whereNull('revoked_at')->where('absolute_expires_at', '>', DatabaseClock::raw())
                        ->where('idle_expires_at', '>', DatabaseClock::raw());
                });
            }
        });
        // The caller holds the target principal, so new live sessions cannot be issued concurrently.
        // Discover without row locks: an InnoDB OR scan otherwise waits on unrelated expired history.
        $ids = (clone $query)->orderBy('id')->limit(self::LIMIT + 1)->pluck('id');
        if ($ids->count() > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        $rows = new Collection();
        foreach ($ids as $id) {
            // Exact primary-key lookups retain deterministic ordering and re-evaluate live predicates after waiting.
            $row = (clone $query)->where('id', $id)->lockForUpdate()->first();
            if ($row !== null) { $rows->push($row); }
        }
        return $rows;
    }

    public static function revokeLiveSessions(ConnectionInterface $db, string $staffId, $now): void
    {
        $bound = $db->table('staff_pending_auth')->where('staff_id', $staffId)->where('state', 'issued')
            ->whereNull('revoked_at')->whereNull('consumed_at')->where('expires_at', '>', DatabaseClock::raw())
            ->orderBy('id')->limit(self::LIMIT + 1)->pluck('bound_session_id');
        if ($bound->count() > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        $query = $db->table('staff_sessions')->where(fn ($q) => $q->where('staff_id', $staffId)->orWhereIn('id', $bound))
            ->whereNull('revoked_at')->where('absolute_expires_at', '>', DatabaseClock::raw())
            ->where('idle_expires_at', '>', DatabaseClock::raw());
        $ids = (clone $query)->orderBy('id')->limit(self::LIMIT + 1)->pluck('id');
        if ($ids->count() > self::LIMIT) { throw new ServiceUnavailableHttpException(null, 'Staff authority exceeds the bounded operation capacity.'); }
        foreach ($ids as $id) {
            (clone $query)->where('id', $id)->update(['revoked_at' => $now]);
        }
    }
}
