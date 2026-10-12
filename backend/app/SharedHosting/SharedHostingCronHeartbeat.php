<?php

declare(strict_types=1);

namespace App\SharedHosting;

use Illuminate\Support\Facades\Cache;

/**
 * Shared hosting honest cron heartbeat recording and readiness inspection.
 *
 * Enforces verifiable, truthful bounded cron run readiness based on confirmed
 * execution cadence, actual cycle completion, zero errors, and valid timestamps.
 * Eliminates fabricated worker heartbeats when no queue jobs are consumed.
 */
final class SharedHostingCronHeartbeat
{
    public const HEARTBEAT_CACHE_KEY = 'shared_hosting:cron:heartbeat';
    public const DEFAULT_CADENCE_MINUTES = 15;
    public const DEFAULT_GRACE_TOLERANCE_SECONDS = 180; // 3 minutes grace
    public const CACHE_TTL_SECONDS = 7200; // 2 hours retention

    /**
     * Record a cron execution heartbeat.
     *
     * @param array<string, mixed> $summary
     * @param float $durationSeconds
     * @param string $status 'healthy', 'degraded', or 'failed'
     * @param bool $cycleCompleted Whether the bounded cycle completed without hard abort
     * @param int $jobsConsumed Actual queue jobs consumed (0 = no fabrication of worker:heartbeat)
     * @return array<string, mixed>
     * @throws \RuntimeException If cache store write fails
     */
    public static function record(
        array $summary = [],
        float $durationSeconds = 0.0,
        string $status = 'healthy',
        bool $cycleCompleted = true,
        int $jobsConsumed = 0
    ): array {
        $now = time();
        $iso = gmdate('Y-m-d\TH:i:s\Z', $now);

        // Derive truthful status from execution facts
        $hasErrors = !empty($summary['errors']);
        $deadlineReached = (bool) ($summary['wall_deadline_reached'] ?? false);

        $truthfulStatus = $status;
        if ($hasErrors || !$cycleCompleted) {
            $truthfulStatus = 'failed';
        } elseif ($deadlineReached) {
            $truthfulStatus = 'degraded';
        }

        $record = [
            'timestamp' => $now,
            'iso' => $iso,
            'status' => $truthfulStatus,
            'cycle_completed' => $cycleCompleted && !$hasErrors,
            'duration_seconds' => round($durationSeconds, 4),
            'cadence_minutes' => self::getCadenceMinutes(),
            'summary' => $summary,
        ];

        try {
            $saved = Cache::put(self::HEARTBEAT_CACHE_KEY, $record, self::CACHE_TTL_SECONDS);
            if ($saved === false) {
                throw new \RuntimeException('Cache write returned false for cron heartbeat.');
            }
        } catch (\Throwable $e) {
            throw new \RuntimeException('Failed to persist cron heartbeat to cache store.', 0, $e);
        }

        // Only update legacy worker:heartbeat if actual queue jobs consumption is proven
        if ($jobsConsumed > 0) {
            try {
                Cache::put('worker:heartbeat', $now, self::CACHE_TTL_SECONDS);
            } catch (\Throwable) {
                // Secondary legacy bridge failure
            }
        }

        return $record;
    }

    /**
     * Retrieve the latest recorded cron heartbeat.
     *
     * @return array<string, mixed>|null
     */
    public static function getLatest(): ?array
    {
        try {
            $data = Cache::get(self::HEARTBEAT_CACHE_KEY);
            return is_array($data) ? $data : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Return the configured cron cadence in minutes (default 15).
     */
    public static function getCadenceMinutes(): int
    {
        $configured = config('foundation-services.cron_cadence_minutes');
        if (in_array($configured, [1, 5, 10, 15, 30, 60], true)) {
            return $configured;
        }

        return self::DEFAULT_CADENCE_MINUTES;
    }

    /**
     * Check whether the cron heartbeat is healthy:
     * - Must exist and be an array.
     * - Status must strictly be 'healthy' (not 'degraded' or 'failed').
     * - Bounded cycle must have completed cleanly with 0 errors.
     * - Wall deadline must not have timed out.
     * - Timestamp must be a valid non-future timestamp.
     * - Must be fresh within cadence + grace window.
     */
    public static function isHealthy(?int $toleranceSeconds = null): bool
    {
        $latest = self::getLatest();
        if ($latest === null) {
            return false;
        }

        // Must strictly be healthy
        if (($latest['status'] ?? '') !== 'healthy') {
            return false;
        }

        // Must have completed bounded cycle cleanly
        if (($latest['cycle_completed'] ?? false) !== true) {
            return false;
        }

        $summary = (array) ($latest['summary'] ?? []);
        if (!empty($summary['errors'])) {
            return false;
        }

        if (($summary['wall_deadline_reached'] ?? false) === true) {
            return false;
        }

        $timestamp = $latest['timestamp'] ?? null;
        $now = time();

        // Valid timestamp: positive and not in the future (allowing max 5s clock skew)
        if (!is_int($timestamp) || $timestamp <= 0 || $timestamp > ($now + 5)) {
            return false;
        }

        $cadenceSec = self::getCadenceMinutes() * 60;
        $tolerance = $toleranceSeconds ?? self::DEFAULT_GRACE_TOLERANCE_SECONDS;
        $maxAgeSeconds = $cadenceSec + $tolerance;

        return ($now - $timestamp) <= $maxAgeSeconds;
    }
}
