<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\ProofPurpose;
use App\Mvp\Mail\IdentitySmtpDispatcher;
use App\Mvp\Mail\MailSettings;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class IdentitySmtpTest extends TestCase
{
    private static ?string $staffHash = null;
    private static ?string $passengerHash = null;

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Identity SMTP tests require the disposable reservation gate.');
        }
        parent::setUp();

        config([
            'mvp-mail.enabled' => true,
            'mvp-mail.identity_smtp_enabled' => true,
            'mvp-mail.allowed_hosts' => ['mailpit'],
        ]);

        // Clean prior test records for deterministic isolation
        DB::table('security_dispatch_outbox')->whereIn('status', ['queued', 'failed'])->update([
            'status' => 'expired',
            'encrypted_payload' => null,
        ]);
        DB::table('security_smtp_attempts')->delete();

        $root = '/tmp/mvp-identity-smtp-sink';
        if (is_dir($root)) {
            foreach (glob($root . '/*.eml') ?: [] as $file) {
                unlink($file);
            }
        }
    }

    private function createStaffUser(string $role = 'admin', string $status = 'active'): array
    {
        $id = (string) Str::uuid();
        self::$staffHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-secret-2026', 'staff');
        $username = 'staff_' . bin2hex(random_bytes(4));
        $email = $username . '@example.test';

        // Insert with 'invited' status first to satisfy chk_staff_users_active_requirements
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Member',
            'full_name_ar' => 'موظف تجريبي',
            'password_hash' => self::$staffHash,
            'role' => $role,
            'status' => 'invited',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'),
            'updated_at' => DB::raw('clock_timestamp()'),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $id,
            'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('clock_timestamp()'),
        ]);

        if ($status === 'active') {
            DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        } else {
            DB::table('staff_users')->where('id', $id)->update(['status' => $status]);
        }

        return ['id' => $id, 'email' => $email];
    }

    private function createPassengerUser(string $status = 'active'): array
    {
        $id = (string) Str::uuid();
        self::$passengerHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-pass-2026', 'passenger');
        $email = 'passenger_' . bin2hex(random_bytes(4)) . '@example.test';

        DB::table('users')->insert([
            'id' => $id,
            'email' => $email,
            'password_hash' => self::$passengerHash,
            'status' => $status,
            'credential_epoch' => 1,
            'email_verified_at' => $status === 'active' ? DB::raw('clock_timestamp()') : null,
            'created_at' => DB::raw('clock_timestamp()'),
            'updated_at' => DB::raw('clock_timestamp()'),
        ]);

        return ['id' => $id, 'email' => $email];
    }

    private function configureSmtp(?string $staffId = null): void
    {
        $staffId ??= $this->createStaffUser()['id'];
        $settings = app(MailSettings::class);
        $read = $settings->read();

        $settings->save([
            'expectedRevision' => (int) $read['revision'],
            'driver' => 'smtp',
            'host' => 'mailpit',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Palestine Airways Limited',
            'senderEmail' => 'noreply@gazaairport.com',
            'replyTo' => 'support@gazaairport.com',
            'username' => 'synthetic-user',
            'password' => 'synthetic-pass-sentinel-2026',
        ], $staffId);
    }

    private function startSink(string $mode = 'accept'): array
    {
        $process = proc_open(
            [PHP_BINARY, base_path('tests/Fixtures/MvpMail/identity-smtp-sink.php'), $mode],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            base_path()
        );

        if (!is_resource($process)) {
            throw new \RuntimeException('Failed to start sink.');
        }

        stream_set_blocking($pipes[1], false);
        $deadline = microtime(true) + 5;
        $ready = false;

        while (microtime(true) < $deadline) {
            $line = fgets($pipes[1]);
            if ($line !== false && str_contains($line, 'READY')) {
                $ready = true;
                break;
            }
            usleep(10000);
        }

        if (!$ready) {
            proc_terminate($process, 9);
            proc_close($process);
            throw new \RuntimeException('Sink failed to signal READY.');
        }

        return [$process, $pipes];
    }

    private function stopSink(?array $sink): void
    {
        if ($sink === null) {
            return;
        }
        [$process, $pipes] = $sink;
        foreach ($pipes as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        if (is_resource($process)) {
            proc_terminate($process, 9);
            proc_close($process);
        }
    }

    private function enqueuePassengerProof(ProofPurpose $purpose, ?array $user = null): array
    {
        $user ??= $this->createPassengerUser($purpose === ProofPurpose::PassengerEmailVerification ? 'unverified' : 'active');
        $rawToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $proofId = (string) Str::uuid();

        DB::table($purpose->table())->insert([
            'id' => $proofId,
            'token_digest' => hash('sha256', $rawToken),
            'state' => 'issued',
            'issued_at' => DB::raw('clock_timestamp()'),
            'expires_at' => DB::raw("clock_timestamp() + interval '24 hours'"),
            'user_id' => $user['id'],
            'purpose' => $purpose->value,
            'credential_epoch' => 1,
            'email_snapshot' => $user['email'],
        ]);

        $outboxId = app(OutboxService::class)->enqueueProof($purpose, $proofId, $rawToken);

        return [
            'outbox_id' => $outboxId,
            'proof_id' => $proofId,
            'user' => $user,
            'token' => $rawToken,
        ];
    }

    private function enqueueStaffProof(ProofPurpose $purpose, ?array $staff = null): array
    {
        $staff ??= $this->createStaffUser('admin', $purpose === ProofPurpose::StaffInvitation ? 'invited' : 'active');
        $rawToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $proofId = (string) Str::uuid();

        DB::table($purpose->table())->insert([
            'id' => $proofId,
            'token_digest' => hash('sha256', $rawToken),
            'state' => 'issued',
            'issued_at' => DB::raw('clock_timestamp()'),
            'expires_at' => DB::raw("clock_timestamp() + interval '24 hours'"),
            'staff_id' => $staff['id'],
            'purpose' => $purpose->value,
            'credential_epoch' => 1,
            'email_snapshot' => $staff['email'],
        ]);

        $outboxId = app(OutboxService::class)->enqueueProof($purpose, $proofId, $rawToken);

        return [
            'outbox_id' => $outboxId,
            'proof_id' => $proofId,
            'staff' => $staff,
            'token' => $rawToken,
        ];
    }

    public function test_identity_smtp_valid_passenger_verification_accepted_once(): void
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

            $emlFiles = glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
            $content = file_get_contents($emlFiles[0]);
            $this->assertStringContainsString($data['user']['email'], $content);
            $this->assertStringContainsString('Palestine Airways Limited', $content);

            // Second dispatch run must not re-process the accepted outbox
            $this->assertFalse($dispatcher->runOne());
            $this->assertCount(1, glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_identity_smtp_valid_passenger_reset_and_staff_proofs_accepted_once(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $dispatcher = app(IdentitySmtpDispatcher::class);

            // 1. Passenger Password Reset
            $resetData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('accepted', DB::table('security_dispatch_outbox')->where('id', $resetData['outbox_id'])->value('status'));

            // 2. Staff Invitation (requires 'invited' status)
            $invData = $this->enqueueStaffProof(ProofPurpose::StaffInvitation);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('accepted', DB::table('security_dispatch_outbox')->where('id', $invData['outbox_id'])->value('status'));

            // 3. Staff Password Reset (requires 'active' status)
            $staffResetData = $this->enqueueStaffProof(ProofPurpose::StaffPasswordReset);
            $this->assertTrue($dispatcher->runOne());
            $this->assertSame('accepted', DB::table('security_dispatch_outbox')->where('id', $staffResetData['outbox_id'])->value('status'));

            $emlFiles = glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: [];
            $this->assertCount(3, $emlFiles);
            $this->assertFalse($dispatcher->runOne());
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_identity_smtp_consumed_revoked_expired_epoch_mismatch_and_foreign_recipient_do_not_send(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $dispatcher = app(IdentitySmtpDispatcher::class);

            // Scenario 1: Consumed proof
            $consumedData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            DB::table('user_email_verifications')->where('id', $consumedData['proof_id'])->update([
                'state' => 'consumed',
                'consumed_at' => DB::raw('clock_timestamp()'),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $consumedOutbox = DB::table('security_dispatch_outbox')->where('id', $consumedData['outbox_id'])->first();
            $this->assertSame('scrubbed', $consumedOutbox->status);
            $this->assertNull($consumedOutbox->encrypted_payload);
            $this->assertSame('scrubbed', DB::table('security_smtp_attempts')->where('outbox_id', $consumedData['outbox_id'])->value('status'));

            // Scenario 2: Revoked proof
            $revokedData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('user_password_resets')->where('id', $revokedData['proof_id'])->update([
                'state' => 'revoked',
                'revoked_at' => DB::raw('clock_timestamp()'),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $revokedOutbox = DB::table('security_dispatch_outbox')->where('id', $revokedData['outbox_id'])->first();
            $this->assertSame('scrubbed', $revokedOutbox->status);
            $this->assertNull($revokedOutbox->encrypted_payload);

            // Scenario 3: Expired proof / outbox (preserve chk_user_email_verif_expires: expires_at > issued_at)
            $expiredData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            DB::table('user_email_verifications')->where('id', $expiredData['proof_id'])->update([
                'issued_at' => DB::raw("clock_timestamp() - interval '20 minutes'"),
                'expires_at' => DB::raw("clock_timestamp() - interval '10 minutes'"),
            ]);
            DB::table('security_dispatch_outbox')->where('id', $expiredData['outbox_id'])->update([
                'expires_at' => DB::raw("clock_timestamp() - interval '10 minutes'"),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $expiredOutbox = DB::table('security_dispatch_outbox')->where('id', $expiredData['outbox_id'])->first();
            $this->assertSame('expired', $expiredOutbox->status);
            $this->assertNull($expiredOutbox->encrypted_payload);

            // Scenario 4: Credential epoch mismatch
            $epochData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('users')->where('id', $epochData['user']['id'])->update([
                'credential_epoch' => 2,
            ]);
            $this->assertTrue($dispatcher->runOne());
            $epochOutbox = DB::table('security_dispatch_outbox')->where('id', $epochData['outbox_id'])->first();
            $this->assertSame('scrubbed', $epochOutbox->status);
            $this->assertNull($epochOutbox->encrypted_payload);

            // Scenario 5: Foreign recipient in encrypted payload
            $foreignData = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $tamperedPayload = new OutboxPayload(
                recipient: 'attacker@hostile.invalid',
                subject: 'Tampered Subject',
                body: 'Tampered Body',
                purpose: 'passenger_email_verification',
                tokenOrCode: 'secret-tampered-token',
            );
            DB::table('security_dispatch_outbox')->where('id', $foreignData['outbox_id'])->update([
                'encrypted_payload' => app(Encrypter::class)->encrypt($tamperedPayload->toJson()),
            ]);
            $this->assertTrue($dispatcher->runOne());
            $foreignOutbox = DB::table('security_dispatch_outbox')->where('id', $foreignData['outbox_id'])->first();
            $this->assertSame('scrubbed', $foreignOutbox->status);
            $this->assertNull($foreignOutbox->encrypted_payload);

            // Scenario 6: Ineligible principal status (suspended passenger)
            $suspendedData = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);
            DB::table('users')->where('id', $suspendedData['user']['id'])->update([
                'status' => 'suspended',
            ]);
            $this->assertTrue($dispatcher->runOne());
            $suspendedOutbox = DB::table('security_dispatch_outbox')->where('id', $suspendedData['outbox_id'])->first();
            $this->assertSame('scrubbed', $suspendedOutbox->status);
            $this->assertNull($suspendedOutbox->encrypted_payload);

            // Scenario 7: Staff invitation for active staff (ineligible: invited only)
            $activeStaffData = $this->enqueueStaffProof(ProofPurpose::StaffInvitation);
            DB::table('staff_users')->where('id', $activeStaffData['staff']['id'])->update([
                'status' => 'active',
                'mfa_version' => 1,
            ]);
            $this->assertTrue($dispatcher->runOne());
            $activeStaffOutbox = DB::table('security_dispatch_outbox')->where('id', $activeStaffData['outbox_id'])->first();
            $this->assertSame('scrubbed', $activeStaffOutbox->status);
            $this->assertNull($activeStaffOutbox->encrypted_payload);

            // Synthetic SMTP sink must have received ZERO messages across all invalid scenarios
            $this->assertCount(0, glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    private function readWorkerLine($pipe): string
    {
        stream_set_blocking($pipe,false);
        $deadline=microtime(true)+15;
        $bytes='';
        while (microtime(true)<$deadline) {
            $part=fread($pipe,4096);
            if ($part!==false) $bytes.=$part;
            if (strlen($bytes)>4096) throw new \RuntimeException('Bounded worker response exceeded.');
            if (str_contains($bytes,"\n")) return trim($bytes);
            if (feof($pipe)) break;
            usleep(10000);
        }
        throw new \RuntimeException('Bounded worker response unavailable.');
    }

    public function test_identity_smtp_concurrent_two_process_workers_dispatch_exactly_once(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);

            // Spawn two concurrent PHP subprocesses (inheriting environment)
            $cmd = [PHP_BINARY, base_path('tests/Fixtures/MvpMail/identity-concurrency-worker.php')];

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

            foreach ([$pipes1, $pipes2] as $pipes) {
                foreach ($pipes as $p) {
                    if (is_resource($p)) {
                        fclose($p);
                    }
                }
            }
            proc_terminate($proc1, 9);
            proc_close($proc1);
            proc_terminate($proc2, 9);
            proc_close($proc2);

            // Exactly one worker processed the item; the other was suppressed
            $this->assertTrue($out1['ran'] !== $out2['ran'], 'Exactly one worker must process the item.');
            $this->assertTrue($out1['ran'] || $out2['ran']);

            } finally {
                foreach ([[$proc1,$pipes1],[$proc2,$pipes2]] as [$proc,$pipes]) {
                    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
                    if (is_resource($proc)) {proc_terminate($proc,9);proc_close($proc);}
                }
            }
            // Database reflects exactly 1 accepted outbox record
            $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outbox->status);
            $this->assertSame(1, (int) $outbox->attempts);

            // Exactly 1 email delivered to synthetic SMTP sink
            $emlFiles = glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_identity_smtp_failed_pre_submit_retries(): void
    {
        $this->configureSmtp();
        $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
        $dispatcher = app(IdentitySmtpDispatcher::class);

        // Run 1 without SMTP sink listening (port 1025 connection refused = definite pre-submit failure)
        $this->assertTrue($dispatcher->runOne());

        $outbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
        $this->assertSame('failed', $outbox->status);
        $this->assertSame(1, (int) $outbox->attempts);

        $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
        $this->assertSame('failed', $attempt->status);
        $this->assertSame(1, (int) $attempt->attempt);
        $this->assertNotNull($attempt->next_attempt_at);

        // Immediate retry before next_attempt_at must skip (no eligible items ready)
        $this->assertFalse($dispatcher->runOne());

        // Fast-forward backoff deadline
        DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->update([
            'next_attempt_at' => DB::raw("clock_timestamp() - interval '1 second'"),
        ]);

        // Start synthetic sink and retry
        $sink = $this->startSink('accept');
        try {
            $this->assertTrue($dispatcher->runOne());

            $outboxRetry = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $outboxRetry->status);
            $this->assertSame(2, (int) $outboxRetry->attempts);

            $attemptRetry = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $attemptRetry->status);
            $this->assertSame(2, (int) $attemptRetry->attempt);

            $this->assertCount(1, glob('/tmp/mvp-identity-smtp-sink/*.eml') ?: []);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_identity_smtp_ambiguous_or_db_finalization_failure_never_auto_replays(): void
    {
        $this->configureSmtp();
        $dispatcher = app(IdentitySmtpDispatcher::class);

        // Scenario A: Failure during DATA transmission -> outcome is 'uncertain'
        $sinkA = $this->startSink('fail_data');
        try {
            $dataA = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $this->assertTrue($dispatcher->runOne());

            $attemptA = DB::table('security_smtp_attempts')->where('outbox_id', $dataA['outbox_id'])->first();
            $this->assertNotNull($attemptA);
            $this->assertSame('uncertain', $attemptA->status);

            // Uncertain outcome must never be automatically retried
            $this->assertFalse($dispatcher->runOne());
        } finally {
            $this->stopSink($sinkA);
        }

        // Scenario B: DB finalization failure after SMTP accepted
        $sinkB = $this->startSink('accept');
        try {
            $dataB = $this->enqueuePassengerProof(ProofPurpose::PassengerPasswordReset);

            $dispatcher->setBeforeFinalizeHook(function (): void {
                throw new \RuntimeException('Simulated post-accept DB commit error.');
            });

            try {
                $dispatcher->runOne();
                $this->fail('Expected exception from finalize hook.');
            } catch (\RuntimeException) {
                // Expected rollback
            }

            // Committed marker remains 'processing' with active deadline
            $attemptB = DB::table('security_smtp_attempts')->where('outbox_id', $dataB['outbox_id'])->first();
            $this->assertNotNull($attemptB);
            $this->assertSame('processing', $attemptB->status);

            // While processing marker is live, worker cannot send
            $dispatcher->setBeforeFinalizeHook(null);
            $this->assertFalse($dispatcher->runOne());

            // Age the deadline into the past and reconcile
            DB::table('security_smtp_attempts')->where('outbox_id', $dataB['outbox_id'])->update([
                'deadline' => DB::raw("clock_timestamp() - interval '1 second'"),
            ]);

            $reconciled = $dispatcher->reconcileExpiredMarkers();
            $this->assertSame(1, $reconciled);

            // Marker has aged to 'uncertain', NOT 'queued'
            $this->assertSame('uncertain', DB::table('security_smtp_attempts')->where('outbox_id', $dataB['outbox_id'])->value('status'));

            // Second worker still cannot send
            $this->assertFalse($dispatcher->runOne());
        } finally {
            $this->stopSink($sinkB);
        }
    }

    public function test_identity_smtp_outer_transaction_rejects(): void
    {
        $this->configureSmtp();
        $dispatcher = app(IdentitySmtpDispatcher::class);

        DB::beginTransaction();
        try {
            $dispatcher->runOne();
            $this->fail('Outer transaction must be refused.');
        } catch (\LogicException $e) {
            $this->assertStringContainsString('cannot be invoked from inside an active transaction', $e->getMessage());
        } finally {
            DB::rollBack();
        }
    }

    public function test_identity_smtp_expire_and_erase_cleans_ciphertext_at_deadline(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);
            $this->assertTrue($dispatcher->runOne());

            // Successfully accepted record retains payload until deadline
            $acceptedOutbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $acceptedOutbox->status);
            $this->assertNotNull($acceptedOutbox->encrypted_payload);

            // Age the outbox expires_at into the past
            DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->update([
                'expires_at' => DB::raw("clock_timestamp() - interval '1 minute'"),
            ]);

            $erased = $dispatcher->expireAndErase();
            $this->assertSame(1, $erased);

            // Ciphertext erased, status remains accepted
            $cleanedOutbox = DB::table('security_dispatch_outbox')->where('id', $data['outbox_id'])->first();
            $this->assertSame('accepted', $cleanedOutbox->status);
            $this->assertNull($cleanedOutbox->encrypted_payload);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_identity_smtp_rebound_token_is_scrubbed_without_submission(): void
    {
        $this->configureSmtp();
        $data=$this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
        $wrong=rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $payload=new OutboxPayload($data['user']['email'],'Synthetic verification','Synthetic body','passenger_email_verification',$wrong);
        DB::table('security_dispatch_outbox')->where('id',$data['outbox_id'])->update([
            'encrypted_payload'=>app(Encrypter::class)->encrypt($payload->toJson()),
        ]);
        $this->assertTrue(app(IdentitySmtpDispatcher::class)->runOne());
        $row=DB::table('security_dispatch_outbox')->where('id',$data['outbox_id'])->first();
        $this->assertSame('scrubbed',$row->status);
        $this->assertNull($row->encrypted_payload);
        $this->assertNull($row->accepted_at);
    }

    public function test_identity_smtp_credentials_and_token_absent_from_safe_results(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $data = $this->enqueuePassengerProof(ProofPurpose::PassengerEmailVerification);
            $dispatcher = app(IdentitySmtpDispatcher::class);
            $dispatcher->runOne();

            // Verify database records contain zero plaintext credentials or tokens
            $attempt = DB::table('security_smtp_attempts')->where('outbox_id', $data['outbox_id'])->first();
            $encodedAttempt = json_encode($attempt, JSON_THROW_ON_ERROR);
            $this->assertStringNotContainsString('synthetic-pass-sentinel-2026', $encodedAttempt);
            $this->assertStringNotContainsString($data['token'], $encodedAttempt);

            // Verify artisan command output never leaks secrets or tokens
            $exit = Artisan::call('mvp:identity-smtp:work', ['--limit' => 25]);
            $this->assertSame(0, $exit);
            $output = Artisan::output();
            $this->assertStringNotContainsString('synthetic-pass-sentinel-2026', $output);
            $this->assertStringNotContainsString($data['token'], $output);
        } finally {
            $this->stopSink($sink);
        }
    }
}
