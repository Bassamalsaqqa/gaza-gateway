<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\PassengerSessionStore;
use App\Mvp\Mail\IdentitySmtpDispatcher;
use App\Mvp\Mail\MailSettings;
use App\Mvp\Reservations\GuestAccessCoordinator;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class GuestReservationMailTest extends TestCase
{
    private static ?string $staffHash = null;

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Guest reservation mail tests require the disposable reservation gate.');
        }
        parent::setUp();

        config([
            'reservations.enabled' => true,
            'reservations.authority' => 'resolver',
            'mvp-mail.enabled' => true,
            'mvp-mail.identity_smtp_enabled' => true,
            'mvp-mail.allowed_hosts' => ['mailpit', '127.0.0.1', 'localhost'],
            'mvp-mail.sender_email' => 'noreply@gazaairport.com',
            'mvp-mail.sender_name' => 'Palestinian Airlines',
        ]);

        $this->configureMailSettings();

        // Ensure clean slate in guest mail outbox
        DB::table('mvp_guest_mail_outbox')->delete();
    }

    protected function tearDown(): void
    {
        DB::table('mvp_guest_mail_outbox')->delete();
        DB::table('mvp_guest_email_challenges')->delete();
        DB::table('mvp_guest_access_challenges')->delete();
        parent::tearDown();
    }

    private function createStaffUser(): array
    {
        $id = (string) Str::uuid();
        self::$staffHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-secret-2026', 'staff');
        $username = 'staff_' . bin2hex(random_bytes(4));
        $email = $username . '@example.test';

        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Member',
            'full_name_ar' => 'موظف تجريبي',
            'password_hash' => self::$staffHash,
            'role' => 'admin',
            'status' => 'invited',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $id,
            'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);

        return ['id' => $id, 'email' => $email];
    }

    private function configureMailSettings(): void
    {
        $staff = $this->createStaffUser();
        $settings = app(MailSettings::class);
        $read = $settings->read();

        $settings->save([
            'expectedRevision' => (int) $read['revision'],
            'driver' => 'smtp',
            'host' => '127.0.0.1',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Palestinian Airlines',
            'senderEmail' => 'noreply@gazaairport.com',
            'replyTo' => 'support@gazaairport.com',
            'username' => 'synthetic-worker',
            'password' => 'synthetic-pass-sentinel-2026',
        ], $staff['id']);
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

    private function createGuestChallenge(string $email = 'guest-smtp@example.test'): array
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        $session = app(PassengerSessionStore::class)->read($receipt->getRawToken());
        $this->assertNotNull($session);

        $coordinator = app(GuestAccessCoordinator::class);
        $result = $coordinator->createEmailChallenge($email, $session);

        return [
            'session' => $session,
            'challengeId' => $result['challengeId'],
            'email' => strtolower($email),
        ];
    }

    public function test_guest_outbox_queued_schema_conformance_and_encryption(): void
    {
        $info = $this->createGuestChallenge('verify-schema@example.test');
        $challengeId = $info['challengeId'];

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($outbox);

        $this->assertSame('email_verification', $outbox->challenge_type);
        $this->assertSame($challengeId, $outbox->challenge_id);
        $this->assertSame('verify-schema@example.test', $outbox->recipient_email);
        $this->assertSame('queued', $outbox->status);
        $this->assertSame(0, (int) $outbox->attempts);
        $this->assertNull($outbox->claim_nonce);
        $this->assertNull($outbox->claim_deadline);
        $this->assertNotNull($outbox->expires_at);
        $this->assertNotNull($outbox->encrypted_payload);

        // Verify encrypted payload decrypts to canonical structure
        $decrypted = json_decode(app(Encrypter::class)->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('email_verification', $decrypted['type']);
        $this->assertSame('verify-schema@example.test', $decrypted['recipient']);
        $this->assertMatchesRegularExpression('/\A[0-9]{6}\z/', $decrypted['code']);
    }

    public function test_actual_successful_send_and_terminal_payload_scrubbed(): void
    {
        $sink = $this->startSink('accept');
        try {
            $info = $this->createGuestChallenge('real-send@example.test');
            $challengeId = $info['challengeId'];

            $dispatcher = app(IdentitySmtpDispatcher::class);
            $processed = $dispatcher->runOne();
            $this->assertTrue($processed);

            $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
            $this->assertNotNull($outbox);
            $this->assertSame('sent', $outbox->status);
            $this->assertNotNull($outbox->accepted_at);
            $this->assertNotNull($outbox->provider_message_id);
            $this->assertNull($outbox->encrypted_payload); // Terminal scrubbed on accepted delivery!
            $this->assertSame(1, (int) $outbox->attempts);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_stale_expired_outbox_cannot_send_and_is_scrubbed(): void
    {
        $info = $this->createGuestChallenge('stale-outbox@example.test');
        $challengeId = $info['challengeId'];

        // Set outbox expires_at to 10 minutes in the past
        DB::table('mvp_guest_mail_outbox')
            ->where('challenge_id', $challengeId)
            ->update([
                'expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 10 MINUTE)'),
            ]);

        $dispatcher = app(IdentitySmtpDispatcher::class);
        $processed = $dispatcher->runOne();
        $this->assertFalse($processed);

        $erased = $dispatcher->expireAndErase();
        $this->assertGreaterThanOrEqual(1, $erased);

        $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($row);
        // Must transition to 'expired' and payload scrubbed
        $this->assertSame('expired', $row->status);
        $this->assertNull($row->encrypted_payload);
    }

    public function test_stale_expired_challenge_cannot_send_and_is_scrubbed(): void
    {
        $info = $this->createGuestChallenge('stale-chal@example.test');
        $challengeId = $info['challengeId'];

        // Set challenge expires_at to 10 minutes in the past
        DB::table('mvp_guest_email_challenges')
            ->where('id', $challengeId)
            ->update([
                'expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 10 MINUTE)'),
            ]);

        $dispatcher = app(IdentitySmtpDispatcher::class);
        $dispatcher->runOne();

        $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($row);
        $this->assertSame('expired', $row->status);
        $this->assertNull($row->encrypted_payload);
    }

    public function test_revoked_session_cannot_send_and_candidate_is_scrubbed(): void
    {
        $info = $this->createGuestChallenge('revoked-sess@example.test');
        $challengeId = $info['challengeId'];
        $sessionId = $info['session']->sessionId;

        // Revoke session in passenger_sessions
        DB::table('passenger_sessions')
            ->where('id', $sessionId)
            ->update([
                'revoked_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

        $dispatcher = app(IdentitySmtpDispatcher::class);
        $dispatcher->runOne();

        $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($row);
        $this->assertSame('scrubbed', $row->status);
        $this->assertNull($row->encrypted_payload);
    }

    public function test_exhausted_or_consumed_challenge_cannot_send_and_candidate_is_scrubbed(): void
    {
        $info = $this->createGuestChallenge('exhausted-chal@example.test');
        $challengeId = $info['challengeId'];

        // Transition challenge state to 'exhausted'
        DB::table('mvp_guest_email_challenges')
            ->where('id', $challengeId)
            ->update([
                'state' => 'exhausted',
                'failed_attempts' => 10,
            ]);

        $dispatcher = app(IdentitySmtpDispatcher::class);
        $dispatcher->runOne();

        $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($row);
        $this->assertSame('scrubbed', $row->status);
        $this->assertNull($row->encrypted_payload);
    }

    public function test_existing_identity_outbox_untouched_by_guest_dispatch(): void
    {
        // 1. Seed a non-eligible row into security_dispatch_outbox (status = 'accepted' with valid proof constraint)
        $sentinelId = (string) Str::uuid();

        if (DB::getSchemaBuilder()->hasTable('security_dispatch_outbox')) {
            $userUuid = (string) Str::uuid();
            DB::table('users')->insert([
                'id' => $userUuid,
                'email' => 'sentinel-user@example.invalid',
                'password_hash' => 'hash',
                'status' => 'active',
                'credential_epoch' => 1,
                'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            $proofId = (string) Str::uuid();
            DB::table('user_email_verifications')->insert([
                'id' => $proofId,
                'user_id' => $userUuid,
                'token_digest' => str_repeat('a', 64),
                'credential_epoch' => 1,
                'state' => 'expired',
                'purpose' => 'passenger_email_verification',
                'email_snapshot' => 'sentinel-user@example.invalid',
                'expires_at' => DB::raw('DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
                'issued_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            DB::table('security_dispatch_outbox')->insert([
                'id' => $sentinelId,
                'user_verification_id' => $proofId,
                'user_reset_id' => null,
                'staff_invitation_id' => null,
                'staff_reset_id' => null,
                'booking_challenge_id' => null,
                'encrypted_payload' => null,
                'status' => 'accepted',
                'provider_message_id' => '<sentinel-msg@gazaairport.com>',
                'accepted_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'scrubbed_at' => null,
                'expires_at' => DB::raw('DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
                'attempts' => 1,
            ]);
        }

        // 2. Create and run guest dispatch with local sink
        $sink = $this->startSink('accept');
        try {
            $info = $this->createGuestChallenge('guest-run@example.test');
            $dispatcher = app(IdentitySmtpDispatcher::class);
            $processed = $dispatcher->runOne();
            $this->assertTrue($processed);

            // 3. Verify security_dispatch_outbox sentinel row was untouched
            if (DB::getSchemaBuilder()->hasTable('security_dispatch_outbox')) {
                $sentinelRow = DB::table('security_dispatch_outbox')->where('id', $sentinelId)->first();
                $this->assertNotNull($sentinelRow);
                $this->assertSame('accepted', $sentinelRow->status);
                $this->assertSame(1, (int) $sentinelRow->attempts);
                $this->assertNull($sentinelRow->encrypted_payload);
                $this->assertSame('<sentinel-msg@gazaairport.com>', $sentinelRow->provider_message_id);

                // Cleanup sentinel
                DB::table('security_dispatch_outbox')->where('id', $sentinelId)->delete();
                DB::table('user_email_verifications')->where('id', $proofId)->delete();
                DB::table('users')->where('id', $userUuid)->delete();
            }
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_finalizer_rechecks_proof_lease_and_claim_after_smtp(): void
    {
        foreach (['consumed', 'expired_lease', 'replaced_claim'] as $case) {
            $sink = $this->startSink('accept');
            $dispatcher = app(IdentitySmtpDispatcher::class);
            try {
                $info = $this->createGuestChallenge($case.'@example.test');
                $id = $info['challengeId'];
                $nonce = (string) Str::uuid();
                $dispatcher->setBeforeFinalizeHook(function () use ($case, $id, $nonce): void {
                    $this->assertSame(0, DB::transactionLevel());
                    $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $id)->first();
                    $this->assertSame('processing', $row->status);
                    $this->assertNotNull($row->claim_nonce);
                    if ($case === 'consumed') {
                        DB::table('mvp_guest_email_challenges')->where('id', $id)
                            ->update(['state' => 'consumed', 'consumed_at' => DB::raw('UTC_TIMESTAMP(6)')]);
                    } else {
                        $change = $case === 'expired_lease'
                            ? ['claim_deadline' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)')]
                            : ['claim_nonce' => $nonce];
                        DB::table('mvp_guest_mail_outbox')->where('challenge_id', $id)->update($change);
                    }
                });
                $this->assertTrue($dispatcher->runOne());
                $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $id)->first();
                $this->assertNull($row->accepted_at);
                if ($case === 'replaced_claim') {
                    $this->assertSame('processing', $row->status);
                    $this->assertSame($nonce, $row->claim_nonce);
                    // The stale finalizer leaves the newer claim untouched.
                    DB::table('mvp_guest_mail_outbox')->where('challenge_id', $id)->update([
                        'claim_deadline' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)'),
                    ]);
                    $dispatcher->reconcileExpiredMarkers();
                    $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $id)->first();
                }
                $this->assertSame($case === 'consumed' ? 'scrubbed' : 'uncertain', $row->status);
                $this->assertNull($row->encrypted_payload);
            } finally {
                $dispatcher->setBeforeFinalizeHook(null);
                $this->stopSink($sink);
            }
        }
    }

    public function test_expired_processing_claim_is_reconciled_without_resend(): void
    {
        $info = $this->createGuestChallenge('marker-reconcile@example.test');
        $challengeId = $info['challengeId'];

        // Simulate an orphaned processing marker whose claim deadline expired 5 minutes ago
        DB::table('mvp_guest_mail_outbox')
            ->where('challenge_id', $challengeId)
            ->update([
                'status' => 'processing',
                'claim_nonce' => (string) Str::uuid(),
                'claim_deadline' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)'),
            ]);

        // Running dispatcher reconciles expired processing markers to terminal 'uncertain' and scrubs payload
        $dispatcher = app(IdentitySmtpDispatcher::class);
        $dispatcher->runOne();

        $row = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($row);
        $this->assertSame('uncertain', $row->status);
        $this->assertNull($row->encrypted_payload);
        $this->assertNull($row->claim_nonce);
        $this->assertNull($row->claim_deadline);
    }

    public function test_queued_more_than_30_minutes_with_expired_session_still_delivers_successfully(): void
    {
        $sink = $this->startSink('accept');
        try {
            $info = $this->createGuestChallenge('delayed-30m@example.test');
            $challengeId = $info['challengeId'];
            $sessionId = $info['session']->sessionId;

            // Session has been idle and absolute expired for 45 minutes (exceeding standard 30min session lifetime)
            DB::table('passenger_sessions')
                ->where('id', $sessionId)
                ->update([
                    'issued_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 2 HOUR)'),
                    'idle_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
                    'absolute_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
                    'revoked_at' => null, // NOT revoked
                ]);

            // Outbox was queued 45 minutes ago
            DB::table('mvp_guest_mail_outbox')
                ->where('challenge_id', $challengeId)
                ->update([
                    'created_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
                    'updated_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
                ]);

            $dispatcher = app(IdentitySmtpDispatcher::class);
            $processed = $dispatcher->runOne();
            $this->assertTrue($processed, 'Dispatcher must deliver guest challenge even when original anonymous session is expired');

            $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
            $this->assertNotNull($outbox);
            $this->assertSame('sent', $outbox->status);
            $this->assertNotNull($outbox->accepted_at);
            $this->assertNull($outbox->encrypted_payload);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_delivery_near_12h_truthful_expiration_and_code_not_in_subject(): void
    {
        $info = $this->createGuestChallenge('truthful-expiry@example.test');
        $challengeId = $info['challengeId'];

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($outbox);
        $payload = json_decode(app(Encrypter::class)->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $code = $payload['code'];

        $nowIso = CarbonImmutable::parse($payload['expires_at'])->subHours(12)->toIso8601String();
        $email = \App\Mvp\Reservations\GuestAccessEmail::build(
            $payload,
            [
                'senderEmail' => 'noreply@gazaairport.com',
                'senderName' => 'Palestinian Airlines',
                'replyTo' => 'support@gazaairport.com',
            ],
            (string) Str::uuid(),
            $nowIso
        );

        // Code MUST NOT be in the email subject
        $this->assertStringNotContainsString($code, $email->getSubject());
        $this->assertSame('Gaza Gateway · Email Verification Code', $email->getSubject());

        // Body must truthfully state 12 hours remaining
        $this->assertStringContainsString('expires in 12 hours', $email->getTextBody());
        $this->assertStringContainsString('صالح لمدة 12 ساعة', $email->getTextBody());
        $this->assertStringContainsString('#challenge=' . $challengeId, $email->getTextBody());
        $this->assertStringContainsString('#challenge=' . $challengeId, $email->getHtmlBody());

        // Now test remaining expiration near 12h (e.g. 11 hours after issuance, 25 minutes remaining)
        $near12hTime = CarbonImmutable::parse($payload['expires_at'])->subMinutes(25)->toIso8601String();
        $emailNearExpiry = \App\Mvp\Reservations\GuestAccessEmail::build(
            $payload,
            [
                'senderEmail' => 'noreply@gazaairport.com',
                'senderName' => 'Palestinian Airlines',
                'replyTo' => 'support@gazaairport.com',
            ],
            (string) Str::uuid(),
            $near12hTime
        );

        $this->assertStringContainsString('expires in 25 minutes', $emailNearExpiry->getTextBody());
        $this->assertStringContainsString('صالح لمدة 25 دقيقة', $emailNearExpiry->getTextBody());
    }

    public function test_session_cleanup_preserves_session_with_active_guest_challenge_until_own_expiry(): void
    {
        $info = $this->createGuestChallenge('cleanup-preserve@example.test');
        $challengeId = $info['challengeId'];
        $sessionId = $info['session']->sessionId;

        // Session is expired past ordinary 30-minute idle/absolute horizon
        DB::table('passenger_sessions')
            ->where('id', $sessionId)
            ->update([
                'issued_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 2 HOUR)'),
                'idle_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
                'absolute_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 45 MINUTE)'),
            ]);

        $cleanup = app(\App\Identity\Sessions\AnonymousSessionCleanup::class);
        $cleanup->cleanRealmBatch('passenger');

        // Session must STILL exist because it owns an issued, unexpired guest challenge
        $sessionRow = DB::table('passenger_sessions')->where('id', $sessionId)->first();
        $this->assertNotNull($sessionRow, 'Session must survive ordinary cleanup while guest challenge is unexpired');

        // Once the challenge expires (past 12h)
        DB::table('mvp_guest_email_challenges')
            ->where('id', $challengeId)
            ->update([
                'expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
                'state' => 'expired',
            ]);

        $cleanup->cleanRealmBatch('passenger');

        // Now the session row can be cleaned up
        $sessionRowAfter = DB::table('passenger_sessions')->where('id', $sessionId)->first();
        $this->assertNull($sessionRowAfter, 'Session row is pruned once challenge is expired');
    }
}
