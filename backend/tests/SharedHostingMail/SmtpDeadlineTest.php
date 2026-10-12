<?php

declare(strict_types=1);

namespace Tests\SharedHostingMail;

use App\SharedHosting\SharedHostingTimeoutException;
use App\Deployment\SmtpDeadline;
use App\Deployment\SmtpDeadlineException;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

final class SmtpDeadlineTest extends SharedHostingMailTestCase
{
    public function test_detects_hard_deadline_capability(): void
    {
        $hasCap = SmtpDeadline::hasHardDeadlineCapability();
        $this->assertIsBool($hasCap);

        if (PHP_SAPI === 'cli' && extension_loaded('pcntl')) {
            $this->assertTrue($hasCap, 'pcntl in CLI must report hard deadline capability.');
        }
    }

    public function test_run_with_deadline_success(): void
    {
        $result = SmtpDeadline::runWithDeadline(function () {
            return 'success_val';
        }, 3);

        $this->assertSame('success_val', $result);
        $this->assertFalse(SmtpDeadline::isExpired());
    }

    public function test_run_with_deadline_timeout_and_expiration_tracking(): void
    {
        if (!SmtpDeadline::hasHardDeadlineCapability()) {
            $this->markTestSkipped('pcntl extension required for hard wall-clock signal testing.');
        }

        $this->expectException(SmtpDeadlineException::class);

        try {
            SmtpDeadline::runWithDeadline(function () {
                // Sleep longer than deadline (1s deadline)
                sleep(3);
                return 'should_not_reach';
            }, 1);
        } finally {
            $this->assertTrue(SmtpDeadline::isExpired(), 'Expired flag must be set when deadline fires.');
        }
    }

    public function test_restores_previous_signal_handler_and_alarm_state(): void
    {
        if (!SmtpDeadline::hasHardDeadlineCapability()) {
            $this->markTestSkipped('pcntl extension required for signal state testing.');
        }

        $customHandler = function () {};
        pcntl_signal(SIGALRM, $customHandler);
        pcntl_alarm(10);

        try {
            $res = SmtpDeadline::runWithDeadline(function () {
                return 42;
            }, 2);

            $this->assertSame(42, $res);

            // Handler must be restored
            $currentHandler = pcntl_signal_get_handler(SIGALRM);
            $this->assertSame($customHandler, $currentHandler);
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, SIG_DFL);
        }
    }

    public function test_configure_transport_stream_bounds_socket_timeout(): void
    {
        $transport = new EsmtpTransport('127.0.0.1', 1025, false);
        SmtpDeadline::configureTransportStream($transport, 10);

        // Requested 10s must be clamped to SmtpDeadline::SOCKET_TIMEOUT_SECONDS (3s)
        $this->assertSame(3.0, (float) $transport->getStream()->getTimeout());
    }

    public function test_nested_alarms_honors_smaller_outer_alarm(): void
    {
        if (!SmtpDeadline::hasHardDeadlineCapability()) {
            $this->markTestSkipped('pcntl extension required for signal state testing.');
        }

        // Outer alarm is 2 seconds with custom handler; inner requests 8 seconds
        $outerHandler = function (int $sig) {};
        pcntl_signal(SIGALRM, $outerHandler);
        pcntl_alarm(2);

        try {
            $start = hrtime(true);
            try {
                SmtpDeadline::runWithDeadline(function () {
                    sleep(5);
                    return 'unreachable';
                }, 8);
                $this->fail('Should have timed out via outer deadline');
            } catch (SharedHostingTimeoutException $e) {
                $elapsed = (hrtime(true) - $start) / 1e9;
                // Must have timed out at ~2s, not at 8s
                $this->assertLessThan(4.0, $elapsed);
            }
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, SIG_DFL);
        }
    }

    public function test_nested_alarm_restores_parent_remaining_time_without_extension(): void
    {
        if (!SmtpDeadline::hasHardDeadlineCapability()) {
            $this->markTestSkipped('pcntl extension required for signal state testing.');
        }

        $outerHandler = function (int $sig) {};
        pcntl_signal(SIGALRM, $outerHandler);
        // Outer parent sets alarm of 10 seconds
        pcntl_alarm(10);

        try {
            // Inner runs operation with deadline 8s, completing in ~1 second
            $res = SmtpDeadline::runWithDeadline(function () {
                usleep(1000000); // 1.0s
                return 'done';
            }, 8);

            $this->assertSame('done', $res);

            // Read remaining parent alarm time
            $remaining = pcntl_alarm(0);
            // Must NOT have extended the parent alarm (remaining must be <= 9s, > 0)
            $this->assertGreaterThan(0, $remaining);
            $this->assertLessThanOrEqual(9, $remaining);
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, SIG_DFL);
        }
    }

    public function test_abort_transport_clears_started_and_terminates(): void
    {
        $transport = new EsmtpTransport('127.0.0.1', 1025, false);
        SmtpDeadline::abortTransport($transport);

        // After abortTransport, stop() must return without errors or blocking
        $transport->stop();
        $this->assertTrue(true);
    }

    public function test_wall_bound_constants(): void
    {
        $this->assertLessThanOrEqual(8, SmtpDeadline::WALL_TIMEOUT_SECONDS);
        $this->assertLessThanOrEqual(3, SmtpDeadline::SOCKET_TIMEOUT_SECONDS);
    }
}
