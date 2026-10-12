<?php

declare(strict_types=1);

namespace App\SharedHosting;

use Illuminate\Contracts\Cache\Lock;
use Illuminate\Support\Facades\Cache;

/**
 * Shared hosting database-backed owner-aware cron lease manager.
 *
 * Uses configured Cache::lock with cryptographic owner tokens to guarantee:
 * - Atomic mutual exclusion between concurrent cPanel cron invocations.
 * - Owner-aware release: an expired holder can NEVER release another active worker's lease.
 * - No unowned fallbacks (Cache::add / Cache::forget).
 * - Distinguishes genuine lock contention (skip) from database/cache backend failures (fail-closed/unhealthy).
 */
final class SharedHostingCronLease
{
    public const LEASE_KEY = 'shared_hosting:cron:lease';
    public const DEFAULT_LEASE_TTL_SECONDS = 60;
    public const MIN_LEASE_TTL_SECONDS = 10;
    public const MAX_LEASE_TTL_SECONDS = 120;

    private static ?Lock $activeLock = null;

    /**
     * Attempt to acquire an exclusive, owner-aware execution lease.
     *
     * @param int $ttlSeconds Lease time-to-live in seconds (bounded to 10..120s)
     * @return bool True if acquired, False if genuinely held by another process
     * @throws \RuntimeException If the cache/database backend fails
     */
    public static function acquire(int $ttlSeconds = self::DEFAULT_LEASE_TTL_SECONDS): bool
    {
        if (in_array(config('app.env'), ['staging', 'production'], true)
            && config('cache.default') !== 'database') {
            throw new \RuntimeException('Shared hosting requires a database-backed cron lease.');
        }
        $boundedTtl = max(self::MIN_LEASE_TTL_SECONDS, min($ttlSeconds, self::MAX_LEASE_TTL_SECONDS));

        try {
            // Must use configured cache store lock (DatabaseLock in deployment)
            $lock = Cache::lock(self::LEASE_KEY, $boundedTtl);
            if ($lock->get()) {
                self::$activeLock = $lock;
                return true;
            }

            // Genuinely held by another concurrent runner
            return false;
        } catch (\Throwable $e) {
            // Backend failure is NOT a normal overlap: fail closed so caller marks unhealthy
            throw new \RuntimeException(
                'SharedHosting lease backend failure: unable to communicate with lock store.',
                0,
                $e
            );
        }
    }

    /**
     * Release the held lease.
     * Only the genuine owner can release it. If expired, current holder will not be released.
     */
    public static function release(): void
    {
        if (self::$activeLock !== null) {
            try {
                self::$activeLock->release();
            } catch (\Throwable) {
                // Ignore release errors to prevent masking primary task exceptions
            } finally {
                self::$activeLock = null;
            }
        }
    }

    /**
     * Check if the current process holds an active lease reference.
     */
    public static function hasActiveLock(): bool
    {
        return self::$activeLock !== null;
    }

    /**
     * Reset static lease state (for test cleanup only).
     */
    public static function resetForTesting(): void
    {
        self::$activeLock = null;
    }
}
