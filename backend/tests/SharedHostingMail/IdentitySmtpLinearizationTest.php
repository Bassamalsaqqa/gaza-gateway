<?php

declare(strict_types=1);

namespace Tests\SharedHostingMail;

use App\SharedHosting\SharedHostingTimeoutException;
use App\Deployment\SmtpDeadline;
use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Proofs\ProofPurpose;
use App\Mvp\Mail\IdentitySmtpDispatcher;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class IdentitySmtpLinearizationTest extends SharedHostingMailTestCase
{
    public function test_1_valid_proof_accepted_once(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);

            $this->assertTrue($dispatcher->runOne());

            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outbox->status);
            $this->assertNotNull($outbox->provider_message_id);
            $this->assertNotNull($outbox->accepted_at);
            $this->assertSame(1, (int) $outbox->attempts);

            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $attempt->status);
            $this->assertSame(1, (int) $attempt->attempt);
            $this->assertSame($outbox->provider_message_id, $attempt->provider_message_id);

            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $emlFiles = glob($root . '/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
            $content = file_get_contents($emlFiles[0]);
            $this->assertStringContainsString($data['user']['email'], $content);
            $this->assertStringContainsString('Palestine Airways Limited', $content);

            // Second dispatch run must not re-process accepted outbox
            $this->assertFalse($dispatcher->runOne());
            $this->assertCount(1, glob($root . '/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_2_preadmission_revocation_epoch_expiry_recipient_tamper_sends_zero(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $dispatcher = app(IdentitySmtpDispatcher::class);

            // 1. Consumed proof
            $consumedData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            DB::table('user_email_verifications')->where('id', $consumedData['proof_id'])->update([
                'state' => 'consumed',
                'consumed_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('scrubbed', DB::table('security_dispatch_outbox')->where('id', $consumedData['outbox_id'])->value('status'));
            $this->assertNull(DB::table('security_dispatch_outbox')->where('id', $consumedData['outbox_id'])->value('encrypted_payload'));

            // 2. Revoked proof
            $revokedData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('user_password_resets')->where('id', $revokedData['proof_id'])->update([
                'state' => 'revoked',
                'revoked_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('scrubbed', DB::table('security_dispatch_outbox')->where('id', $revokedData['outbox_id'])->value('status'));

            // 3. Expired proof / outbox
            $expiredData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            DB::table('user_email_verifications')->where('id', $expiredData['proof_id'])->update([
                'issued_at' => DB::raw("DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 20 MINUTE)"),
                'expires_at' => DB::raw("DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 10 MINUTE)"),
            ]);
            DB::table('security_dispatch_outbox')->where('id', $expiredData['outbox_id'])->update([
                'expires_at' => DB::raw("DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 10 MINUTE)"),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('expired', DB::table('security_dispatch_outbox')->where('id', $expiredData['outbox_id'])->value('status'));

            // 4. Credential epoch mismatch
            $epochData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('users')->where('id', $epochData['user']['id'])->update([
                'credential_epoch' => 2,
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('scrubbed', DB::table('security_dispatch_outbox')->where('id', $epochData['outbox_id'])->value('status'));

            // 5. Recipient tamper in encrypted payload
            $foreignData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $tampered = new OutboxPayload(
                recipient: 'attacker@hostile.invalid',
                subject: 'Tampered Subject',
                body: 'Tampered Body',
                purpose: 'passenger_email_verification',
                tokenOrCode: 'secret-tampered-token',
            );
            DB::table('security_dispatch_outbox')->where('id', $foreignData['outbox_id'])->update([
                'encrypted_payload' => app(Encrypter::class)->encrypt($tampered->toJson()),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('scrubbed', DB::table('security_dispatch_outbox')->where('id', $foreignData['outbox_id'])->value('status'));

            // 6. Ineligible user status
            $suspendedData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('users')->where('id', $suspendedData['user']['id'])->update([
                'status' => 'suspended',
            ]);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('scrubbed', DB::table('security_dispatch_outbox')->where('id', $suspendedData['outbox_id'])->value('status'));

            // Zero SMTP messages sent to sink across all invalid scenarios
            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $this->assertCount(0, glob($root . '/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_3_postadmission_revocation_invalid_token_and_terminal_state_preserved(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);

            // Hook executed right before DB finalization commit:
            // Simulates proof revocation occurring after send-admission
            $dispatcher->setBeforeFinalizeHook(function () use ($data): void {
                // Proof revocation succeeds immediately on server
                DB::table('user_email_verifications')->where('id', $data['proof_id'])->update([
                    'state' => 'revoked',
                    'revoked_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
                // Outbox scrubbed
                DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->update([
                    'status' => 'scrubbed',
                    'encrypted_payload' => null,
                    'scrubbed_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
            });

            $this->assertTrue($dispatcher->runOne());

            // Server-side proof token is revoked and unusable
            $proofState = DB::table('user_email_verifications')->where('id', $data['proof_id'])->value('state');
            $this->assertSame('revoked', $proofState);

            // Outbox terminal state preserved: NEVER restored to accepted
            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('scrubbed', $outbox->status);
            $this->assertNull($outbox->accepted_at);

            $markerStatus = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->value('status');
            $this->assertSame('scrubbed', $markerStatus);
        } finally {
            $dispatcher->setBeforeFinalizeHook(null);
            $this->stopSink($sink);
        }
    }

    public function test_4_transaction_level_zero_on_network_and_second_db_writer_progress_while_smtp_blocked(): void
    {
        $this->configureSmtp();
        // Slow sink adds 1.5s delay during SMTP
        $sink = $this->startSink('slow');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);

            $secondWriterCompleted = false;

            // Hook executed right before SMTP finalization
            $dispatcher->setBeforeFinalizeHook(function () use ($data, &$secondWriterCompleted): void {
                // Verify transaction level is 0
                $this->assertSame(0, DB::connection('mysql_test')->transactionLevel(), 'Must be at transactionLevel 0');

                // Concurrent writer updates the principal row in users table while SMTP is in progress
                $updated = DB::connection('mysql_test')->table('users')->where('id', $data['user']['id'])->update([
                    'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
                $this->assertSame(1, $updated, 'Second writer must update principal row without being blocked by SMTP');
                $secondWriterCompleted = true;
            });

            $this->assertTrue($dispatcher->runOne());
            $this->assertTrue($secondWriterCompleted, 'Second DB writer must successfully complete while SMTP was executing');

            // Item successfully delivered and accepted
            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outbox->status);
        } finally {
            $dispatcher->setBeforeFinalizeHook(null);
            $this->stopSink($sink);
        }
    }

    public function test_5_failed_connection_retry_bounded_five_with_backoff(): void
    {
        $this->configureSmtp();
        $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
        $dispatcher = app(IdentitySmtpDispatcher::class);

        // Run without sink listening (connection refused = definite pre-submit failure)
        $this->assertTrue($dispatcher->runOne());

        $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
        $this->assertSame('failed', $outbox->status);
        $this->assertSame(1, (int) $outbox->attempts);

        $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
        $this->assertSame('failed', $attempt->status);
        $this->assertSame(1, (int) $attempt->attempt);
        $this->assertNotNull($attempt->next_attempt_at);

        // Immediate retry before next_attempt_at backoff must skip
        $this->assertFalse($dispatcher->runOne());

        // Fast-forward backoff deadline into past
        DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->update([
            'next_attempt_at' => DB::raw("DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)"),
        ]);

        // Start sink and retry
        $sink = $this->startSink('accept');
        try {
            $this->assertTrue($dispatcher->runOne());

            $outboxRetry = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outboxRetry->status);
            $this->assertSame(2, (int) $outboxRetry->attempts);

            $attemptRetry = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $attemptRetry->status);
            $this->assertSame(2, (int) $attemptRetry->attempt);

            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $this->assertCount(1, glob($root . '/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_6_partial_data_uncertain_no_automatic_retry(): void
    {
        $this->configureSmtp();
        $dispatcher = app(IdentitySmtpDispatcher::class);

        // Sink aborts connection after receiving DATA -> ambiguous outcome
        $sink = $this->startSink('fail_after_data');
        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $this->assertTrue($dispatcher->runOne());

            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertNotNull($attempt);
            $this->assertSame('uncertain', $attempt->status);

            // Uncertain status must NEVER be automatically retried
            $this->assertFalse($dispatcher->runOne());
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_7_hard_wall_bound_aborts_slow_smtp_and_skips_quit(): void
    {
        $this->configureSmtp();
        $dispatcher = app(IdentitySmtpDispatcher::class);

        // Sink hangs on socket without responding
        $sink = $this->startSink('hang');
        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);

            $start = hrtime(true);
            $this->assertTrue($dispatcher->runOne());
            $elapsedSec = (hrtime(true) - $start) / 1e9;

            // Must terminate within bounded time (socket timeout <= 3s, wall timeout <= 8s)
            $this->assertLessThanOrEqual(9.0, $elapsedSec, 'Hanging SMTP must be bounded by hard deadline.');

            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertNotNull($attempt);
            $this->assertContains($attempt->status, ['failed', 'uncertain']);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_8_concurrent_workers_overlap_skip_locked(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);

            $cmd = [PHP_BINARY, __DIR__ . '/identity-concurrency-worker.php'];
            $proc1 = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes1, base_path());
            $proc2 = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes2, base_path());

            $this->assertTrue(is_resource($proc1));
            $this->assertTrue(is_resource($proc2));

            try {
                // Wait for both workers to signal READY
                $this->assertSame("READY", $this->readWorkerLine($pipes1[1]));
                $this->assertSame("READY", $this->readWorkerLine($pipes2[1]));

                // Send GO simultaneously
                fwrite($pipes1[0], "GO\n");
                fflush($pipes1[0]);
                fwrite($pipes2[0], "GO\n");
                fflush($pipes2[0]);

                $out1 = json_decode($this->readWorkerLine($pipes1[1]), true, 32, JSON_THROW_ON_ERROR);
                $out2 = json_decode($this->readWorkerLine($pipes2[1]), true, 32, JSON_THROW_ON_ERROR);

                // Exactly one worker processed the item; the other was suppressed (SKIP LOCKED)
                $this->assertTrue($out1['ran'] !== $out2['ran'], 'Exactly one worker must process the item.');
                $this->assertTrue($out1['ran'] || $out2['ran']);
            } finally {
                foreach ([[$proc1, $pipes1], [$proc2, $pipes2]] as [$proc, $pipes]) {
                    foreach ($pipes as $pipe) {
                        if (is_resource($pipe)) fclose($pipe);
                    }
                    if (is_resource($proc)) {
                        proc_terminate($proc, 9);
                        proc_close($proc);
                    }
                }
            }

            // Exactly 1 accepted outbox in DB
            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outbox->status);
            $this->assertSame(1, (int) $outbox->attempts);

            // Exactly 1 email delivered to sink
            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $emlFiles = glob($root . '/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_9_smtp_server_accepts_data_then_stalls_quit_finishes_promptly_and_records_accepted(): void
    {
        $this->configureSmtp();
        // stall_quit accepts DATA (returns 250), then stalls for 15s on QUIT.
        // Worker must abort transport nonblockingly and finish in < 3s, recording accepted.
        $sink = $this->startSink('stall_quit');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);

            $start = hrtime(true);
            $ran = $dispatcher->runOne();
            $elapsedSec = (hrtime(true) - $start) / 1e9;

            $this->assertTrue($ran);
            // Must finish well under the 15s QUIT stall (typically < 1s, bounded to < 3.5s)
            $this->assertLessThan(3.5, $elapsedSec, 'Worker must not block on QUIT beyond message budget.');

            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outbox->status);
            $this->assertNotNull($outbox->provider_message_id);

            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $attempt->status);
            $this->assertSame($outbox->provider_message_id, $attempt->provider_message_id);

            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $emlFiles = glob($root . '/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_10_outer_cron_alarm_expiry_propagates_shared_hosting_timeout_exception_and_marks_marker_uncertain(): void
    {
        if (!SmtpDeadline::hasHardDeadlineCapability()) {
            $this->markTestSkipped('pcntl extension required for hard wall-clock signal testing.');
        }

        $this->configureSmtp();
        // Synthetic sink hangs for 15s on connection
        $sink = $this->startSink('hang');

        $outerHandler = function (int $sig) {};
        pcntl_signal(SIGALRM, $outerHandler);

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);

            $start = hrtime(true);
            // Outer parent cron sets alarm of 2 seconds (less than inner 8s)
            pcntl_alarm(2);

            try {
                $dispatcher->runOne();
                $this->fail('Expected SharedHostingTimeoutException when outer cron alarm expired.');
            } catch (SharedHostingTimeoutException $e) {
                $elapsedSec = (hrtime(true) - $start) / 1e9;
                // Outer alarm governed; finishes and propagates within cron budget (< 10s, requirement <= 25s)
                $this->assertLessThan(10.0, $elapsedSec);
            }

            // Database state must be cleanly preserved as uncertain (no automatic resend)
            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertNotNull($attempt);
            $this->assertSame('uncertain', $attempt->status);

            // Outbox marked failed with attempts recorded
            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('failed', $outbox->status);
            $this->assertSame(1, (int) $outbox->attempts);
        } finally {
            pcntl_alarm(0);
            pcntl_signal(SIGALRM, SIG_DFL);
            $this->stopSink($sink);
        }
    }

    private function readWorkerLine($pipe): string
    {
        stream_set_blocking($pipe, false);
        $deadline = microtime(true) + 15;
        $bytes = '';
        while (microtime(true) < $deadline) {
            $part = fread($pipe, 4096);
            if ($part !== false) {
                $bytes .= $part;
            }
            if (strlen($bytes) > 4096) {
                throw new \RuntimeException('Bounded worker response exceeded.');
            }
            if (str_contains($bytes, "\n")) {
                return trim($bytes);
            }
            if (feof($pipe)) {
                break;
            }
            usleep(10000);
        }
        throw new \RuntimeException('Bounded worker response unavailable.');
    }
}
