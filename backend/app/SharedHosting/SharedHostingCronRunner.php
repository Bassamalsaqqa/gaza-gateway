<?php

declare(strict_types=1);

namespace App\SharedHosting;

use App\Analytics\AnalyticsMaintenanceRunner;
use App\Identity\Sessions\AnonymousSessionCleanup;
use App\Mvp\Archive\ArchiveMailWorker;
use App\Mvp\Mail\BookingMailWorker;
use App\Mvp\Mail\IdentitySmtpDispatcher;
use Illuminate\Support\Facades\Log;

/**
 * Shared hosting bounded cron runner.
 *
 * Coordinates bounded task batches within strict runtime constraints:
 * - Database-backed owner-aware lease overlap protection.
 * - Scoped whole-cycle hard wall bounding via pcntl_alarm where supported.
 * - Monotonic remaining budget tracking preventing dispatch if remaining < 8s message budget.
 * - Prioritized identity proof dispatch preventing starvation behind booking mail.
 * - Sanitized worker exceptions (no raw secrets, messages, or stack traces).
 * - Honest heartbeat reporting (healthy only on 0 errors and completed bounded cycle).
 */
final class SharedHostingCronRunner
{
    public const DEFAULT_MAX_WALL_SECONDS = 25.0;
    public const DEFAULT_BATCH_LIMIT = 25;
    public const MESSAGE_BUDGET_SECONDS = 8.0;
    public const DOCUMENT_MESSAGE_BUDGET_SECONDS = 13.0;
    public const COLD_OPERATION_BUDGET_SECONDS = 3.0;

    public function __construct(
        private readonly ?AnonymousSessionCleanup $sessionCleanup = null,
        private readonly ?BookingMailWorker $bookingMailWorker = null,
        private readonly ?IdentitySmtpDispatcher $identitySmtpDispatcher = null,
        private readonly ?ArchiveMailWorker $archiveMailWorker = null,
        private readonly ?AnalyticsMaintenanceRunner $analyticsRunner = null,
    ) {}

    /**
     * Run the bounded cron tasks.
     *
     * @param float $maxWallSeconds Maximum allowed wall-clock time in seconds (default 25.0)
     * @param int $batchLimit Maximum items per worker batch (default 25)
     * @return array<string, mixed> Execution report
     */
    public function run(
        float $maxWallSeconds = self::DEFAULT_MAX_WALL_SECONDS,
        int $batchLimit = self::DEFAULT_BATCH_LIMIT
    ): array {
        $hasPcntl = PHP_SAPI === 'cli' && function_exists('pcntl_alarm')
            && function_exists('pcntl_signal_get_handler') && function_exists('pcntl_async_signals');
        if (!$hasPcntl) {
            if (in_array(config('app.env'), ['production', 'staging'], true)) {
                throw new \RuntimeException('Shared hosting cron requires CLI pcntl deadline support.');
            }
            return $this->runCycle($maxWallSeconds, $batchLimit);
        }
        // Include lease acquisition, cleanup and heartbeat persistence in the hard scope.
        // Reserve one second for finalization; re-arm if a dependency catches the signal.
        $seconds = max(1, (int) ceil(max(1, min($maxWallSeconds, 25))) - 1);
        $start = hrtime(true);
        $handler = pcntl_signal_get_handler(SIGALRM);
        $async = pcntl_async_signals(true);
        $previousAlarm = pcntl_alarm(0);
        pcntl_signal(SIGALRM, static function (): void {
            pcntl_alarm(1);
            throw new SharedHostingTimeoutException('Shared hosting cron deadline reached.');
        });
        pcntl_alarm($previousAlarm > 0 ? min($seconds, $previousAlarm) : $seconds);
        try {
            return $this->runCycle($maxWallSeconds, $batchLimit);
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, $handler);
            pcntl_async_signals($async);
            if ($previousAlarm > 0) {
                pcntl_alarm(max(1, $previousAlarm - (int) ceil((hrtime(true) - $start) / 1e9)));
            }
        }
    }

    private function runCycle(float $maxWallSeconds, int $batchLimit): array
    {
        $boundedWall = max(1.0, min($maxWallSeconds, 25.0));
        $startHr = hrtime(true);
        $deadlineHr = $startHr + (int) ($boundedWall * 1e9);

        $getRemainingSeconds = static function () use ($deadlineHr): float {
            $nowHr = hrtime(true);
            return max(0.0, ($deadlineHr - $nowHr) / 1e9);
        };

        // 1. Scoped hard-wall ceiling via pcntl_alarm where available
        $hasPcntl = function_exists('pcntl_alarm')
            && function_exists('pcntl_signal')
            && function_exists('pcntl_async_signals');

        $isDeployment = method_exists(app(), 'environment')
            ? app()->environment('production', 'staging')
            : in_array(config('app.env', 'local'), ['production', 'staging'], true);
        if ($isDeployment && !$hasPcntl) {
            throw new \RuntimeException(
                'Deployment capability missing: pcntl_alarm is required for hard wall enforcement on shared hosting.'
            );
        }

        // 2. Overlap protection: acquire exclusive owner-aware lease
        if (!SharedHostingCronLease::acquire(60)) {
            return [
                'executed' => false,
                'status' => 'skipped',
                'skipped_overlap' => true,
                'message' => 'Lease already held by another runner; skipped without overlap.',
                'duration_seconds' => 0.0,
                'heartbeat_recorded' => false,
                'summary' => [
                    'errors' => [],
                    'wall_deadline_reached' => false,
                ],
            ];
        }

        $summary = [
            'sessions_purged' => 0,
            'rate_buckets_purged' => 0,
            'identity_mail_processed' => 0,
            'booking_mail_processed' => 0,
            'archive_mail_processed' => 0,
            'analytics_events_purged' => 0,
            'monthly_reports_processed' => 0,
            'wall_deadline_reached' => false,
            'timeout' => false,
            'mail_status' => 'disabled',
            'errors' => [],
        ];

        $status = 'healthy';
        $cycleCompleted = false;

        try {
            // Task A: Bounded cleanup of expired anonymous sessions and stale rate buckets
            if ($getRemainingSeconds() >= self::COLD_OPERATION_BUDGET_SECONDS) {
                $this->runSessionCleanup($summary, $getRemainingSeconds);
            } else {
                $summary['wall_deadline_reached'] = true;
            }

            // Task B: Bounded Identity Proof SMTP dispatch (PRIORITIZED over booking messages to prevent starvation)
            if ($getRemainingSeconds() >= self::MESSAGE_BUDGET_SECONDS) {
                $this->runIdentitySmtp($summary, $getRemainingSeconds, min(10, $batchLimit));
            } elseif (config('mvp-mail.enabled') === true && config('mvp-mail.identity_smtp_enabled') === true) {
                $summary['wall_deadline_reached'] = true;
            }

            // Task C: Bounded Booking Mail processing (commemorative tickets)
            if ($getRemainingSeconds() >= self::DOCUMENT_MESSAGE_BUDGET_SECONDS) {
                $this->runBookingMail($summary, $getRemainingSeconds, $batchLimit);
            } elseif (config('mvp-mail.enabled') === true) {
                $summary['wall_deadline_reached'] = true;
            }

            // Task D: Bounded Analytics retention purge and report enqueue (before outbox processing)
            if ($getRemainingSeconds() >= self::COLD_OPERATION_BUDGET_SECONDS) {
                $this->runAnalyticsTasks($summary, $getRemainingSeconds);
            } elseif (config('analytics.enabled', true) === true) {
                $summary['wall_deadline_reached'] = true;
            }

            // Task E: Bounded Archive, Contact, and Analytics Report Outbox processing
            if ($getRemainingSeconds() >= self::DOCUMENT_MESSAGE_BUDGET_SECONDS) {
                $this->runArchiveMail($summary, $getRemainingSeconds, $batchLimit);
            } elseif (config('mvp-mail.enabled') === true) {
                $summary['wall_deadline_reached'] = true;
            }

            // If any task encountered an error, status is failed
            if (!empty($summary['errors'])) {
                $status = 'failed';
                $cycleCompleted = false;
            } elseif ($summary['wall_deadline_reached'] || $summary['timeout']) {
                $status = 'degraded';
                $cycleCompleted = false;
            } else {
                $status = 'healthy';
                $cycleCompleted = true;
            }
        } catch (SharedHostingTimeoutException) {
            $summary['wall_deadline_reached'] = true;
            $summary['timeout'] = true;
            $status = 'degraded';
            $cycleCompleted = false;
        } catch (\Throwable $e) {
            $summary['errors'][] = [
                'task' => 'runner_core',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            $status = 'failed';
            $cycleCompleted = false;
        } finally {
            $duration = (hrtime(true) - $startHr) / 1e9;

            // Bounded release of execution lease
            try {
                SharedHostingCronLease::release();
            } catch (\Throwable) {
                // Secondary release failure
            }

            // Record honest heartbeat (only marks healthy if status is healthy and cycle completed)
            $heartbeat = SharedHostingCronHeartbeat::record(
                summary: $summary,
                durationSeconds: $duration,
                status: $status,
                cycleCompleted: $cycleCompleted,
                jobsConsumed: 0
            );
        }

        return [
            'executed' => true,
            'status' => $status,
            'skipped_overlap' => false,
            'duration_seconds' => round($duration, 4),
            'summary' => $summary,
            'heartbeat' => $heartbeat,
        ];
    }

    private function runSessionCleanup(array &$summary, callable $getRemaining): void
    {
        try {
            $cleanup = $this->sessionCleanup;
            if ($cleanup === null && class_exists(AnonymousSessionCleanup::class)) {
                $cleanup = app()->bound(AnonymousSessionCleanup::class) || app()->bound(\Illuminate\Database\ConnectionInterface::class)
                    ? app(AnonymousSessionCleanup::class)
                    : null;
            }

            if ($cleanup === null && in_array(config('app.env'), ['production', 'staging'], true)) {
                throw new \RuntimeException('Session cleanup dependency is unavailable.');
            }
            if ($cleanup !== null) {
                $res = $cleanup->runCleanup(
                    maxBatchesPerRealm: 2,
                    batchSize: 50,
                    safeHorizonSeconds: 3600
                );
                $summary['sessions_purged'] = (int) (($res['passenger_sessions'] ?? 0) + ($res['staff_sessions'] ?? 0));
                $summary['rate_buckets_purged'] = (int) ($res['rate_limit_buckets'] ?? 0);
            }
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                throw $e;
            }
            $summary['errors'][] = [
                'task' => 'session_cleanup',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            Log::warning('SharedHostingCron: Session cleanup exception', [
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ]);
        }
    }

    private function runIdentitySmtp(array &$summary, callable $getRemaining, int $batchLimit): void
    {
        if (config('mvp-mail.enabled') !== true || config('mvp-mail.identity_smtp_enabled') !== true) {
            $summary['mail_status'] = 'disabled';
            return;
        }

        try {
            $dispatcher = $this->identitySmtpDispatcher;
            if ($dispatcher === null && class_exists(IdentitySmtpDispatcher::class)) {
                $dispatcher = app()->bound(IdentitySmtpDispatcher::class) || app()->bound(\Illuminate\Database\ConnectionInterface::class)
                    ? app(IdentitySmtpDispatcher::class)
                    : null;
            }

            if ($dispatcher === null) {
                throw new \RuntimeException('Identity mail dispatcher is unavailable.');
            }

            $count = 0;
            while ($count < $batchLimit && $getRemaining() >= self::MESSAGE_BUDGET_SECONDS) {
                if (!$dispatcher->runOne()) {
                    break;
                }
                $count++;
            }

            if ($getRemaining() < self::MESSAGE_BUDGET_SECONDS && $count < $batchLimit) {
                $summary['wall_deadline_reached'] = true;
            }

            if ($getRemaining() >= self::COLD_OPERATION_BUDGET_SECONDS) {
                $dispatcher->expireAndErase();
            }

            $summary['identity_mail_processed'] = $count;
            $summary['mail_status'] = 'active';
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                throw $e;
            }
            $summary['errors'][] = [
                'task' => 'identity_smtp',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            Log::warning('SharedHostingCron: Identity SMTP exception', [
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ]);
        }
    }

    private function runBookingMail(array &$summary, callable $getRemaining, int $batchLimit): void
    {
        if (config('mvp-mail.enabled') !== true) {
            $summary['mail_status'] = 'disabled';
            return;
        }

        try {
            $worker = $this->bookingMailWorker;
            if ($worker === null && class_exists(BookingMailWorker::class)) {
                $worker = app()->bound(BookingMailWorker::class) || app()->bound(\Illuminate\Database\ConnectionInterface::class)
                    ? app(BookingMailWorker::class)
                    : null;
            }

            if ($worker === null) {
                throw new \RuntimeException('Booking mail dispatcher is unavailable.');
            }

            if ($getRemaining() >= self::COLD_OPERATION_BUDGET_SECONDS) {
                $worker->adoptIntents();
            }

            $count = 0;
            while ($count < $batchLimit && $getRemaining() >= self::DOCUMENT_MESSAGE_BUDGET_SECONDS) {
                if (!$worker->runOne()) {
                    break;
                }
                $count++;
            }

            if ($getRemaining() < self::DOCUMENT_MESSAGE_BUDGET_SECONDS && $count < $batchLimit) {
                $summary['wall_deadline_reached'] = true;
            }

            if ($getRemaining() >= self::COLD_OPERATION_BUDGET_SECONDS) {
                $worker->purgeCaptures();
            }

            $summary['booking_mail_processed'] = $count;
            $summary['mail_status'] = 'active';
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                throw $e;
            }
            $summary['errors'][] = [
                'task' => 'booking_mail',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            Log::warning('SharedHostingCron: Booking mail exception', [
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ]);
        }
    }

    private function runArchiveMail(array &$summary, callable $getRemaining, int $batchLimit): void
    {
        if (config('mvp-mail.enabled') !== true) {
            return;
        }

        try {
            $worker = $this->archiveMailWorker;
            if ($worker === null && class_exists(ArchiveMailWorker::class)) {
                $worker = app()->bound(ArchiveMailWorker::class) || app()->bound(\Illuminate\Database\ConnectionInterface::class)
                    ? app(ArchiveMailWorker::class)
                    : null;
            }

            if ($worker === null) {
                return;
            }

            $count = $worker->runBatch($batchLimit, $getRemaining);
            $summary['archive_mail_processed'] = $count;
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                throw $e;
            }
            $summary['errors'][] = [
                'task' => 'archive_mail',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            Log::warning('SharedHostingCron: Archive mail exception', [
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ]);
        }
    }

    private function runAnalyticsTasks(array &$summary, callable $getRemaining): void
    {
        if (config('analytics.enabled', true) !== true) {
            return;
        }

        try {
            $runner = $this->analyticsRunner;
            if ($runner === null && class_exists(AnalyticsMaintenanceRunner::class)) {
                $runner = app()->bound(AnalyticsMaintenanceRunner::class) || app()->bound(\Illuminate\Database\ConnectionInterface::class)
                    ? app(AnalyticsMaintenanceRunner::class)
                    : null;
            }

            if ($runner === null) {
                return;
            }

            $res = $runner->run($getRemaining);
            $summary['analytics_events_purged'] = (int) ($res['events_purged'] ?? 0);
            $summary['monthly_reports_processed'] = (int) ($res['reports_processed'] ?? 0);
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                throw $e;
            }
            $summary['errors'][] = [
                'task' => 'analytics_maintenance',
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ];
            Log::warning('SharedHostingCron: Analytics maintenance exception', [
                'class' => get_class($e),
                'code' => (int) $e->getCode(),
            ]);
        }
    }
}
