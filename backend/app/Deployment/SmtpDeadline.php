<?php

declare(strict_types=1);

namespace App\Deployment;

use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use App\SharedHosting\SharedHostingTimeoutException;

class SmtpDeadlineException extends \RuntimeException {}

final class SmtpDeadline
{
    /** Hard socket timeout bound (<= 3 seconds) */
    public const SOCKET_TIMEOUT_SECONDS = 3;

    /** Hard message wall-clock deadline bound (<= 8 seconds) */
    public const WALL_TIMEOUT_SECONDS = 8;

    private static bool $lastOperationExpired = false;

    public static function isExpired(): bool
    {
        return self::$lastOperationExpired;
    }

    public static function resetExpired(): void
    {
        self::$lastOperationExpired = false;
    }

    public static function hasHardDeadlineCapability(): bool
    {
        return PHP_SAPI === 'cli'
            && extension_loaded('pcntl')
            && function_exists('pcntl_alarm')
            && function_exists('pcntl_signal')
            && function_exists('pcntl_async_signals')
            && function_exists('pcntl_signal_get_handler');
    }

    public static function assertHardDeadlineCapability(string $context = 'SMTP'): void
    {
        if (PHP_SAPI !== 'cli') {
            throw new \LogicException(
                "[{$context}] Hard wall-clock SMTP deadline capability (pcntl CLI) is unavailable outside CLI; refusing unbounded send."
            );
        }
        $isProdOrStaging = app()->environment('production', 'staging');
        if ($isProdOrStaging && !self::hasHardDeadlineCapability()) {
            throw new \RuntimeException(
                "[{$context}] Hard wall-clock SMTP deadline capability (pcntl CLI) is unavailable in " .
                app()->environment() . "; refusing to execute unbounded SMTP dispatch."
            );
        }
    }

    /**
     * Executes the given operation within a scoped hard wall-clock deadline.
     * Enforces wall timeout <= 8s. Restores previous signal and alarm state upon completion.
     *
     * @template T
     * @param callable(): T $operation
     * @param int $timeoutSeconds Maximum wall seconds allowed (<= 8s)
     * @return T
     * @throws SharedHostingTimeoutException if outer cron deadline expires during execution
     * @throws SmtpDeadlineException if inner SMTP deadline expires during execution
     */
    public static function runWithDeadline(callable $operation, int $timeoutSeconds = self::WALL_TIMEOUT_SECONDS): mixed
    {
        $boundedTimeout = min(max(1, $timeoutSeconds), self::WALL_TIMEOUT_SECONDS);

        if (!self::hasHardDeadlineCapability()) {
            self::assertHardDeadlineCapability('SmtpDeadline::runWithDeadline');
            // In local/testing where pcntl is unavailable (e.g. native Windows testing),
            // execute synchronously with monotonic bounds
            self::$lastOperationExpired = false;
            $start = hrtime(true);
            try {
                return $operation();
            } finally {
                $elapsedSec = (hrtime(true) - $start) / 1e9;
                if ($elapsedSec > $boundedTimeout) {
                    self::$lastOperationExpired = true;
                }
            }
        }

        self::$lastOperationExpired = false;
        $prevHandler = pcntl_signal_get_handler(SIGALRM);
        $prevAsync = pcntl_async_signals(true);
        $prevAlarm = pcntl_alarm(0);
        $startTime = hrtime(true);

        // Honor smaller existing alarm; do not extend or reset outer cron deadline
        $outerAlarmGoverns = ($prevAlarm > 0 && $prevAlarm <= $boundedTimeout);
        $effectiveTimeout = $outerAlarmGoverns ? $prevAlarm : $boundedTimeout;

        $alarmHandler = function (int $sig) use ($effectiveTimeout, $outerAlarmGoverns, $prevHandler): void {
            self::$lastOperationExpired = true;
            if ($outerAlarmGoverns) {
                if (is_callable($prevHandler)) {
                    $prevHandler($sig);
                }
                throw new SharedHostingTimeoutException("Shared hosting outer cron deadline exceeded ({$effectiveTimeout}s).");
            }
            throw new SmtpDeadlineException("SMTP wall-clock deadline exceeded ({$effectiveTimeout}s).");
        };

        pcntl_signal(SIGALRM, $alarmHandler);
        pcntl_alarm($effectiveTimeout);

        try {
            return $operation();
        } catch (\Throwable $e) {
            if ($e instanceof SharedHostingTimeoutException) {
                self::$lastOperationExpired = true;
                throw $e;
            }
            if ($e instanceof SmtpDeadlineException || self::$lastOperationExpired) {
                self::$lastOperationExpired = true;
                throw ($e instanceof SmtpDeadlineException ? $e : new SmtpDeadlineException("SMTP wall-clock deadline exceeded ({$effectiveTimeout}s).", 0, $e));
            }
            throw $e;
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, $prevHandler);
            pcntl_async_signals($prevAsync);

            if ($prevAlarm > 0) {
                $elapsedSec = (int) ceil((hrtime(true) - $startTime) / 1e9);
                $remaining = $prevAlarm - $elapsedSec;
                if ($remaining > 0) {
                    pcntl_alarm($remaining);
                } else {
                    pcntl_alarm(1);
                }
            }
        }
    }

    /**
     * Immediately aborts the transport without blocking in QUIT/destructor.
     * Terminates the stream and clears started state.
     */
    public static function abortTransport(EsmtpTransport $transport): void
    {
        try {
            $transport->getStream()->terminate();
        } catch (\Throwable) {}

        try {
            $ref = new \ReflectionProperty(\Symfony\Component\Mailer\Transport\Smtp\SmtpTransport::class, 'started');
            $ref->setValue($transport, false);
        } catch (\Throwable) {}
    }

    /**
     * Configures the transport stream with bounded socket timeout (<= 3s).
     */
    public static function configureTransportStream(EsmtpTransport $transport, int $socketTimeout = self::SOCKET_TIMEOUT_SECONDS): void
    {
        $boundedSocket = min(max(1, $socketTimeout), self::SOCKET_TIMEOUT_SECONDS);
        $transport->getStream()->setTimeout($boundedSocket);
    }
}
