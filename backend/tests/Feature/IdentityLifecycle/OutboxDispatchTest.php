<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityLifecycle;

use App\Identity\Dispatch\Exceptions\DispatchException;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\GuestOtpPepperRing;
use App\Identity\Proofs\ProofConsumptionResult;
use App\Identity\Proofs\ProofIssuedReceipt;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;


class OutboxDispatchTest extends TestCase
{
    private OutboxService $outboxService;
    private ProofService $proofService;
    private Encrypter $encrypter;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('security_dispatch_outbox')->delete();
        $this->encrypter = app(Encrypter::class);
        $this->outboxService = new OutboxService($this->encrypter, DB::connection());
        $this->proofService = new ProofService(DB::connection());
    }

    public function test_outbox_strictly_enforces_exactly_one_proof_foreign_key(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $staffId = LifecycleTestFactory::createStaffUser();
        $challengeId = LifecycleTestFactory::createBookingGuestChallenge();

        $userVerifReceipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $userResetReceipt = $this->proofService->issue(ProofPurpose::PassengerPasswordReset, $userId);
        $staffInvReceipt = $this->proofService->issue(ProofPurpose::StaffInvitation, $staffId);
        $staffResetReceipt = $this->proofService->issue(ProofPurpose::StaffPasswordReset, $staffId);

        $now = CarbonImmutable::now('UTC')->toIso8601String();
        $expires = CarbonImmutable::now('UTC')->addHour()->toIso8601String();

        // 1. Zero FKs must fail constraint chk_security_dispatch_outbox_num_nonnulls
        $this->expectException(QueryException::class);
        DB::statement('
            INSERT INTO security_dispatch_outbox (id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id, booking_challenge_id, encrypted_payload, status, expires_at, attempts)
            VALUES (?, NULL, NULL, NULL, NULL, NULL, ?, \'queued\', ?, 0)
        ', [(string) Str::uuid(), 'fake_enc', $expires]);
    }

    public function test_outbox_two_foreign_keys_violates_constraint(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $userVerifReceipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $userResetReceipt = $this->proofService->issue(ProofPurpose::PassengerPasswordReset, $userId);
        $expires = CarbonImmutable::now('UTC')->addHour()->toIso8601String();

        // Two FKs must fail constraint chk_security_dispatch_outbox_num_nonnulls
        $this->expectException(QueryException::class);
        DB::statement('
            INSERT INTO security_dispatch_outbox (id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id, booking_challenge_id, encrypted_payload, status, expires_at, attempts)
            VALUES (?, ?, ?, NULL, NULL, NULL, ?, \'queued\', ?, 0)
        ', [(string) Str::uuid(), $userVerifReceipt->proofId, $userResetReceipt->proofId, 'fake_enc', $expires]);
    }

    public function test_outbox_payload_is_encrypted_and_binds_original_expiry(): void
    {
        $recipientEmail = 'private_recipient_' . Str::random(8) . '@example.com';
        $userId = LifecycleTestFactory::createUser(['email' => $recipientEmail]);
        $proof = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);

        $outboxId = $this->outboxService->enqueueProof($proof);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame($proof->proofId, $row->user_verification_id);
        $this->assertSame('queued', $row->status);
        $this->assertSame(0, (int) $row->attempts);
        $this->assertSame($proof->expiresAt->toIso8601String(), CarbonImmutable::parse($row->expires_at)->toIso8601String());

        // Table row contains NO plaintext email, token, or subject columns
        $this->assertFalse(property_exists($row, 'recipient'));
        $this->assertFalse(property_exists($row, 'body'));
        $this->assertFalse(property_exists($row, 'token'));

        // Ciphertext decodes cleanly
        $decrypted = $this->encrypter->decrypt($row->encrypted_payload);
        $payload = OutboxPayload::fromJson($decrypted);
        $this->assertSame($recipientEmail, $payload->getRecipient());
        $this->assertSame($proof->getRawToken(), $payload->getTokenOrCode());
        $this->assertStringContainsString('Palestinian Airlines', $payload->getSubject());
    }

    public function test_local_capture_keeps_outbox_queued_without_inventing_acceptance(): void
    {
        $tempSink = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_mail_sink_', DB::connection());

        try {
            $ledger = new OwnedCaptureRetentionLedger($tempSink, DB::connection());
            $mailGateway = new LocalFileMailGateway(storagePath: $tempSink);
            $dispatcher = new OutboxDispatcher(
                mailSubmission: $mailGateway,
                encrypter: $this->encrypter,
                db: DB::connection(),
                captureLedger: $ledger,
            );

            $localEmail = 'local_test_' . Str::random(8) . '@example.com';
            $userId = LifecycleTestFactory::createUser(['email' => $localEmail]);
            $proof = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
            $outboxId = $this->outboxService->enqueueProof($proof);

            // Dispatch batch
            $result = $dispatcher->dispatchBatch(limit: 10);

            $this->assertSame(1, $result->processedCount);
            $this->assertSame(1, $result->capturedLocallyCount);
            $this->assertSame(0, $result->failedCount);
            $this->assertCount(1, $result->captureIds);

            // CRITICAL INVARIANT: Row stays 'queued' in PostgreSQL!
            $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
            $this->assertSame('queued', $row->status);
            $this->assertNull($row->provider_message_id);
            $this->assertNull($row->accepted_at);
            $this->assertNull($row->scrubbed_at);
            $this->assertSame(1, (int) $row->attempts);

            // Captured file exists locally in sink
            $captureFile = $tempSink . DIRECTORY_SEPARATOR . $result->captureIds[0] . '.json';
            $this->assertFileExists($captureFile);
        } finally {
            // Cleanup temp directory
            if (is_dir($tempSink)) {
                array_map('unlink', glob($tempSink . '/*') ?: []);
                @rmdir($tempSink);
            }
        }
    }

    public function test_expire_and_erase_clears_ciphertext_payload(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $proof = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->outboxService->enqueueProof($proof);

        // Manually move expires_at to past
        DB::table('security_dispatch_outbox')
            ->where('id', $outboxId)
            ->update([
                'expires_at' => CarbonImmutable::now('UTC')->subSeconds(5)->toIso8601String(),
            ]);

        $dispatcher = new OutboxDispatcher(
            mailSubmission: new UnconfiguredMailGateway(),
            encrypter: $this->encrypter,
            db: DB::connection(),
        );

        $erasedCount = $dispatcher->expireAndErase();
        $this->assertSame(1, $erasedCount);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertSame('expired', $row->status);
        $this->assertNull($row->encrypted_payload); // Ciphertext erased!
    }

    public function test_unconfigured_remote_adapter_fails_closed(): void
    {
        $dispatcher = new OutboxDispatcher(
            mailSubmission: new UnconfiguredMailGateway(),
            encrypter: $this->encrypter,
            db: DB::connection(),
        );

        $userId = LifecycleTestFactory::createUser();
        $proof = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->outboxService->enqueueProof($proof);

        $result = $dispatcher->dispatchBatch(limit: 10);

        $this->assertSame(1, $result->processedCount);
        $this->assertSame(0, $result->capturedLocallyCount);
        $this->assertSame(1, $result->failedCount);
        $this->assertContains('ERR_UNCONFIGURED_PROVIDER', $result->errorCodes);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertSame('failed', $row->status);
        $this->assertSame(1, (int) $row->attempts);
    }

    public function test_local_capture_retention_manager_cleans_only_expired_captures(): void
    {
        $tempSink = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_retention_', DB::connection());

        try {
            $retentionManager = new LocalCaptureRetentionManager();
            $ledger = new OwnedCaptureRetentionLedger($tempSink);

            $oldId = 'cap_' . str_repeat('a', 32);
            $freshId = 'cap_' . str_repeat('b', 32);
            $otherFile = $tempSink . DIRECTORY_SEPARATOR . 'other_owner_document.txt';

            $now = CarbonImmutable::now('UTC');
            $expiredAt = $now->subHour();
            $futureExpiry = $now->addHour();

            $outbox1 = (string) Str::uuid();
            $outbox2 = (string) Str::uuid();

            $ledger->reserveCapture($oldId, $outbox1, (string) Str::uuid(), 'passenger_password_reset', $expiredAt);
            $oldPath = $tempSink . DIRECTORY_SEPARATOR . $oldId . '.json';
            file_put_contents($oldPath, '{}');
            $ledger->commitCapture($oldId, $outbox1);

            $ledger->reserveCapture($freshId, $outbox2, (string) Str::uuid(), 'passenger_password_reset', $futureExpiry);
            $freshPath = $tempSink . DIRECTORY_SEPARATOR . $freshId . '.json';
            file_put_contents($freshPath, '{}');
            $ledger->commitCapture($freshId, $outbox2);

            file_put_contents($otherFile, 'sensitive data');

            // Arbitrary directory sweep fails closed
            $sweepBlocked = false;
            try {
                $retentionManager->cleanupExpiredCaptures($tempSink, maxAgeSeconds: 3600);
            } catch (\App\Identity\Dispatch\Exceptions\DispatchException) {
                $sweepBlocked = true;
            }
            $this->assertTrue($sweepBlocked, 'Arbitrary directory sweep did not fail closed.');

            // Clean up files at original deadline
            $cleaned = $retentionManager->cleanupAtOriginalDeadline($ledger, $now);

            $this->assertSame(1, $cleaned);
            $this->assertFileDoesNotExist($oldPath);
            $this->assertFileExists($freshPath);
            $this->assertFileExists($otherFile); // Other non-capture file must be preserved intact!
        } finally {
            if (is_dir($tempSink)) {
                array_map('unlink', glob($tempSink . '/*') ?: []);
                @rmdir($tempSink);
            }
        }
    }

    public function test_forged_proof_receipt_is_rejected_authoritatively(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $realReceipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // 1. Forged token in receipt
        $forgedTokenReceipt = new ProofIssuedReceipt(
            proofId: $realReceipt->proofId,
            purpose: ProofPurpose::PassengerEmailVerification,
            principalId: $userId,
            credentialEpoch: 1,
            issuedAt: $realReceipt->issuedAt,
            expiresAt: $realReceipt->expiresAt,
            emailSnapshot: $realReceipt->getEmailSnapshot(),
            tokenDigest: $realReceipt->getTokenDigest(),
            rawSecretToken: Str::random(43), // Forged token!
        );

        $forgedTokenFailed = false;
        try {
            $this->outboxService->enqueueProof($forgedTokenReceipt);
        } catch (DispatchException $e) {
            $forgedTokenFailed = true;
            $this->assertSame('Provided token does not match persisted proof digest.', $e->getMessage());
        }
        $this->assertTrue($forgedTokenFailed, 'Expected DispatchException on forged token');

        // 2. Forged principal ID in receipt
        $forgedPrincipalReceipt = new ProofIssuedReceipt(
            proofId: $realReceipt->proofId,
            purpose: ProofPurpose::PassengerEmailVerification,
            principalId: (string) Str::uuid(), // Forged principal!
            credentialEpoch: 1,
            issuedAt: $realReceipt->issuedAt,
            expiresAt: $realReceipt->expiresAt,
            emailSnapshot: $realReceipt->getEmailSnapshot(),
            tokenDigest: $realReceipt->getTokenDigest(),
            rawSecretToken: $realReceipt->getRawToken(),
        );

        $forgedPrincipalFailed = false;
        try {
            $this->outboxService->enqueueProof($forgedPrincipalReceipt);
        } catch (DispatchException $e) {
            $forgedPrincipalFailed = true;
            $this->assertSame('Principal identifier mismatch.', $e->getMessage());
        }
        $this->assertTrue($forgedPrincipalFailed, 'Expected DispatchException on forged principal ID');

        // 3. Forged state: already consumed proof cannot be enqueued
        $this->proofService->consume(ProofPurpose::PassengerEmailVerification, $realReceipt->getRawToken());

        $consumedEnqueueFailed = false;
        try {
            $this->outboxService->enqueueProof($realReceipt);
        } catch (DispatchException $e) {
            $consumedEnqueueFailed = true;
            $this->assertSame('Proof record is not in an issued state.', $e->getMessage());
        }
        $this->assertTrue($consumedEnqueueFailed, 'Expected DispatchException on consumed proof');
    }

    public function test_caller_rollback_restores_proof_and_outbox(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);

        DB::beginTransaction();

        $outboxId = $this->outboxService->enqueueProof($receipt);
        $this->assertNotNull(DB::table('security_dispatch_outbox')->where('id', $outboxId)->first());

        // Caller rollback restores outbox
        DB::rollBack();

        $this->assertNull(DB::table('security_dispatch_outbox')->where('id', $outboxId)->first());

        // Original proof remains issued and unconsumed
        $proofRow = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
        $this->assertSame('issued', $proofRow->state);
    }

    public function test_connection_without_active_transaction_owns_transaction_safely(): void
    {
        $conn = DB::connection();
        $this->assertSame(0, $conn->transactionLevel(), 'Prerequisite: connection has no active transaction');

        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId, $conn);
        $this->assertSame(0, $conn->transactionLevel());

        $outboxId = $this->outboxService->enqueueProof($receipt, $conn);
        $this->assertSame(0, $conn->transactionLevel());

        $outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($outboxRow);
        $this->assertSame('queued', $outboxRow->status);
    }

    public function test_consumption_result_does_not_export_email(): void
    {
        $sentinel = 'private-sentinel@example.test';
        $r = ProofConsumptionResult::success('synthetic-proof', 'synthetic-principal', $sentinel, 1, CarbonImmutable::now());
        foreach ([json_encode($r), json_encode($r->__debugInfo()), json_encode(get_object_vars($r)), serialize($r), var_export($r, true)] as $value) {
            $this->assertFalse(str_contains($value, $sentinel));
        }
    }

    public function test_persisted_guest_challenge_cannot_redirect_code_to_foreign_email(): void
    {
        $booking = LifecycleTestFactory::createBooking(['contact_email' => 'legitimate@example.test']);
        $id = LifecycleTestFactory::createBookingGuestChallenge(['booking_id' => $booking]);
        $service = new OutboxService($this->encrypter, DB::connection());
        $this->expectException(DispatchException::class);
        $service->enqueueGuestChallenge($id, '123456', 'foreign@example.test');
    }

    public function test_outbox_payload_rejects_malformed_field_types(): void
    {
        $this->expectException(DispatchException::class);
        OutboxPayload::fromJson(json_encode([
            'recipient' => ['synthetic'],
            'subject' => 'synthetic',
            'body' => 'synthetic',
            'purpose' => 'passenger_email_verification',
            'token_or_code' => 'synthetic',
        ], JSON_THROW_ON_ERROR));
    }

    public function test_guest_challenge_enqueue_verifies_code_and_requires_pepper_ring(): void
    {
        $ring = new GuestOtpPepperRing([1 => str_repeat('k', 32)]);
        $booking = LifecycleTestFactory::createBooking(['contact_email' => 'guest@example.com']);
        $code = '654321';
        $challengeId = LifecycleTestFactory::createBookingGuestChallenge([
            'booking_id' => $booking,
            'code' => $code,
            'pepper_ring' => $ring,
            'pepper_version' => 1,
        ]);

        // 1. Without pepper ring, service fails closed
        $unconfiguredService = new OutboxService($this->encrypter, DB::connection());
        $failedUnconfigured = false;
        try {
            $unconfiguredService->enqueueGuestChallenge($challengeId, $code);
        } catch (DispatchException $e) {
            $failedUnconfigured = true;
            $this->assertStringContainsString('unconfigured', $e->getMessage());
        }
        $this->assertTrue($failedUnconfigured);

        // 2. With wrong code, service rejects
        $configuredService = new OutboxService($this->encrypter, DB::connection(), $ring);
        $failedWrongCode = false;
        try {
            $configuredService->enqueueGuestChallenge($challengeId, '999999');
        } catch (DispatchException $e) {
            $failedWrongCode = true;
            $this->assertStringContainsString('does not match', $e->getMessage());
        }
        $this->assertTrue($failedWrongCode);

        // 3. With valid code and matching booking contact email, enqueue succeeds
        $outboxId = $configuredService->enqueueGuestChallenge($challengeId, $code);
        $this->assertNotNull($outboxId);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame($challengeId, $row->booking_challenge_id);
        $this->assertSame('queued', $row->status);
    }

    public function test_dispatcher_fails_closed_when_invoked_inside_active_transaction(): void
    {
        $dispatcher = new OutboxDispatcher(new UnconfiguredMailGateway(), $this->encrypter, DB::connection());

        DB::beginTransaction();
        try {
            $this->expectException(DispatchException::class);
            $this->expectExceptionMessage('Dispatcher cannot be invoked from inside an active transaction.');
            $dispatcher->dispatchBatch(10);
        } finally {
            DB::rollBack();
        }
    }

    public function test_dispatcher_reconciles_and_scrubs_consumed_or_revoked_proof(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->outboxService->enqueueProof($receipt);

        // Consume proof before dispatcher runs
        $this->proofService->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());

        $dispatcher = new OutboxDispatcher(new UnconfiguredMailGateway(), $this->encrypter, DB::connection());
        $batchResult = $dispatcher->dispatchBatch(10);

        // Row should be scrubbed and payload erased
        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('scrubbed', $row->status);
        $this->assertNotNull($row->scrubbed_at);
        $this->assertNull($row->encrypted_payload);
    }

    public function test_local_capture_retention_ledger_cleans_up_at_original_deadline(): void
    {
        $tempDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_retention_', DB::connection());

        try {
            $ledger = new OwnedCaptureRetentionLedger($tempDir);
            $retentionManager = new LocalCaptureRetentionManager();

            $captureId1 = 'cap_' . bin2hex(random_bytes(16));
            $captureId2 = 'cap_' . bin2hex(random_bytes(16));

            $now = CarbonImmutable::now('UTC');
            $outbox1 = (string) Str::uuid();
            $outbox2 = (string) Str::uuid();

            // Reserve first under mandatory pre-write reservation policy
            $ledger->reserveCapture($captureId1, $outbox1, (string) Str::uuid(), 'passenger_password_reset', $now->subMinutes(5));
            $file1 = $tempDir . DIRECTORY_SEPARATOR . $captureId1 . '.json';
            file_put_contents($file1, json_encode(['capture_id' => $captureId1]));
            $ledger->commitCapture($captureId1, $outbox1);

            $ledger->reserveCapture($captureId2, $outbox2, (string) Str::uuid(), 'booking_guest_challenge', $now->addMinutes(10));
            $file2 = $tempDir . DIRECTORY_SEPARATOR . $captureId2 . '.json';
            file_put_contents($file2, json_encode(['capture_id' => $captureId2]));
            $ledger->commitCapture($captureId2, $outbox2);

            $this->assertFileExists($file1);
            $this->assertFileExists($file2);

            // Run cleanup at original deadline
            $cleaned = $retentionManager->cleanupAtOriginalDeadline($ledger, $now);
            $this->assertSame(1, $cleaned);

            $this->assertFileDoesNotExist($file1);
            $this->assertFileExists($file2);
        } finally {
            @unlink($tempDir . DIRECTORY_SEPARATOR . OwnedCaptureRetentionLedger::LEDGER_FILENAME);
            if (isset($file1)) @unlink($file1);
            if (isset($file2)) @unlink($file2);
            @rmdir($tempDir);
        }
    }

    public function test_outbox_payload_conceals_secrets_across_six_channels(): void
    {
        $payload = new OutboxPayload(
            recipient: 'private_sentinel_email@example.com',
            subject: 'Secret Subject Sentinel',
            body: 'Secret Body Sentinel',
            purpose: 'passenger_email_verification',
            tokenOrCode: 'secret_token_sentinel',
        );

        // Channel 1: json_encode / jsonSerialize
        $json = json_encode($payload);
        $this->assertStringNotContainsString('private_sentinel_email', $json);
        $this->assertStringNotContainsString('Secret Subject Sentinel', $json);
        $this->assertStringNotContainsString('Secret Body Sentinel', $json);
        $this->assertStringNotContainsString('secret_token_sentinel', $json);
        $this->assertStringContainsString('[REDACTED]', $json);

        // Channel 2: print_r / __debugInfo
        $debug = print_r($payload, true);
        $this->assertStringNotContainsString('private_sentinel_email', $debug);
        $this->assertStringNotContainsString('Secret Subject Sentinel', $debug);
        $this->assertStringNotContainsString('Secret Body Sentinel', $debug);
        $this->assertStringNotContainsString('secret_token_sentinel', $debug);

        // Channel 3: get_object_vars
        $vars = get_object_vars($payload);
        $varsJson = json_encode($vars);
        $this->assertStringNotContainsString('private_sentinel_email', $varsJson);
        $this->assertStringNotContainsString('Secret Subject Sentinel', $varsJson);
        $this->assertStringNotContainsString('Secret Body Sentinel', $varsJson);
        $this->assertStringNotContainsString('secret_token_sentinel', $varsJson);

        // Channel 4: serialize -> throws LogicException
        $serializedThrown = false;
        try {
            serialize($payload);
        } catch (\LogicException) {
            $serializedThrown = true;
        }
        $this->assertTrue($serializedThrown);

        // Channel 5: var_export
        $exported = var_export($payload, true);
        $this->assertStringNotContainsString('private_sentinel_email', $exported);
        $this->assertStringNotContainsString('Secret Subject Sentinel', $exported);
        $this->assertStringNotContainsString('Secret Body Sentinel', $exported);
        $this->assertStringNotContainsString('secret_token_sentinel', $exported);

        // Channel 6: toJson() preserves genuine encrypted transport
        $transportJson = $payload->toJson();
        $this->assertStringContainsString('private_sentinel_email', $transportJson);
        $this->assertStringContainsString('Secret Subject Sentinel', $transportJson);
        $this->assertStringContainsString('Secret Body Sentinel', $transportJson);
        $this->assertStringContainsString('secret_token_sentinel', $transportJson);
    }

    public function test_outbox_dispatcher_repeated_dispatch_deduplicates_and_reconciles_revocation(): void
    {
        $tempSink = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_repeat_sink_', DB::connection());

        try {
            $ledger = new OwnedCaptureRetentionLedger($tempSink, DB::connection());
            $gateway = new LocalFileMailGateway(storagePath: $tempSink);
            $dispatcher = new OutboxDispatcher(
                mailSubmission: $gateway,
                encrypter: $this->encrypter,
                db: DB::connection(),
                captureLedger: $ledger,
            );

            $userId = LifecycleTestFactory::createUser();
            $receipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
            $outboxId = $this->outboxService->enqueueProof($receipt);

            // First dispatch: creates capture
            $res1 = $dispatcher->dispatchBatch(limit: 10);
            $this->assertSame(1, $res1->capturedLocallyCount);
            $this->assertCount(1, $res1->captureIds);
            $capFile = $tempSink . DIRECTORY_SEPARATOR . $res1->captureIds[0] . '.json';
            $this->assertFileExists($capFile);

            // Second dispatch: deduplicates before capturing
            $res2 = $dispatcher->dispatchBatch(limit: 10);
            $this->assertSame(1, $res2->capturedLocallyCount);
            $this->assertFileExists($capFile);

            // Now revoke proof in DB
            $this->proofService->revokeAll(ProofPurpose::PassengerEmailVerification, $userId);

            // Cleanup reconciles revocation against DB and erases raw capture file
            $cleaned = $ledger->cleanupExpired(now: CarbonImmutable::now('UTC'), conn: DB::connection());
            $this->assertSame(1, $cleaned);
            $this->assertFileDoesNotExist($capFile);
        } finally {
            if (is_dir($tempSink)) {
                array_map('unlink', glob($tempSink . '/*') ?: []);
                @rmdir($tempSink);
            }
        }
    }

    public function test_owned_capture_retention_ledger_fails_closed_on_malformed_json(): void
    {
        $tempDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_malformed_ledger_', DB::connection());

        try {
            $ledgerPath = $tempDir . DIRECTORY_SEPARATOR . OwnedCaptureRetentionLedger::LEDGER_FILENAME;
            file_put_contents($ledgerPath, '{"broken": json');

            $ledger = new OwnedCaptureRetentionLedger($tempDir);
            $this->expectException(\App\Identity\Dispatch\Exceptions\DispatchException::class);
            $this->expectExceptionMessage('malformed JSON');
            $ledger->loadLedger();
        } finally {
            @unlink($ledgerPath);
            @rmdir($tempDir);
        }
    }
}
