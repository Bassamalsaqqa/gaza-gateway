<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityLifecycle;

use App\Contracts\Mail\MailMessage;
use App\Contracts\Mail\MailReceipt;
use App\Contracts\Mail\MailSubmissionInterface;
use App\Identity\Dispatch\Exceptions\DispatchException;
use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;

/**
 * Focused verification tests for Review 07 repairs:
 * - O07.1: Unsupported remote dispatch fail-closed before any submit I/O (both with and without supplied ledger).
 * - O07.2: Fresh locked authority before local dedupe, separate consumed/revoked controls,
 *          omitted-candidate bounded reconciliation, and failed erasure durability.
 *
 * Attribution: TestCase base class was supplied by Codex and committed at 7022d81.
 * This test suite is authored by Antigravity under Review 07 direction.
 */
final class OutboxAuthorityReviewTest extends TestCase
{
    private array $ownedRoots = [];
    private array $createdUserIds = [];
    private array $createdProofRecords = [];
    private array $createdOutboxIds = [];

    private OutboxService $outboxService;
    private ProofService $proofService;
    private Encrypter $encrypter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertTestingGuards();
        $this->encrypter = app(Encrypter::class);
        $this->outboxService = new OutboxService($this->encrypter, DB::connection());
        $this->proofService = new ProofService(DB::connection());
    }

    private function assertTestingGuards(): void
    {
        $isTesting = (getenv('APP_ENV') === 'testing' && function_exists('app') && app()->environment('testing'));
        if (!$isTesting) {
            $this->markTestSkipped('Testing environment APP_ENV=testing required.');
        }

        $db = DB::connection();
        $row = $db->selectOne('SELECT current_database() AS db');
        if ((string) ($row?->db ?? '') !== 'gaza_gateway_test') {
            $this->markTestSkipped('Live test database gaza_gateway_test required.');
        }
    }

    private function createTrackedUser(): string
    {
        $userId = LifecycleTestFactory::createUser();
        $this->createdUserIds[] = $userId;
        return $userId;
    }

    private function issueTrackedProof(ProofPurpose $purpose, string $userId): \App\Identity\Proofs\ProofIssuedReceipt
    {
        $proof = $this->proofService->issue($purpose, $userId);
        $this->createdProofRecords[] = [
            'table' => $purpose->table(),
            'id' => $proof->proofId,
        ];
        return $proof;
    }

    private function enqueueTrackedProof(\App\Identity\Proofs\ProofIssuedReceipt $proof): string
    {
        $outboxId = $this->outboxService->enqueueProof($proof);
        $this->createdOutboxIds[] = $outboxId;
        return $outboxId;
    }

    private function createOwnedRoot(): string
    {
        $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_outbox07_', DB::connection());
        $this->ownedRoots[] = $root;
        config(['foundation-services.mail.local_path' => $root]);
        return $root;
    }

    private function cleanupOwnedRoot(string $root): void
    {
        $private = realpath(storage_path('app/private'));
        $realRoot = realpath($root);
        if ($private === false || $realRoot === false || is_link($root)
            || dirname($realRoot) !== $private
            || !preg_match('/^codex_outbox07_[a-zA-Z0-9_-]+$/', basename($realRoot))) {
            throw new \RuntimeException('Disposable capture cleanup rejected its root.');
        }
        $marker = $realRoot . DIRECTORY_SEPARATOR . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER;
        if (is_link($marker) || !is_file($marker)
            || file_get_contents($marker) !== "gza_test_owned_marker_v1\n") {
            throw new \RuntimeException('Disposable capture cleanup rejected its capability.');
        }
        $entries = scandir($realRoot);
        if ($entries === false || count($entries) > 1010) {
            throw new \RuntimeException('Disposable capture cleanup exceeded its bound.');
        }
        $leaves = [];
        foreach ($entries as $entry) {
            if (in_array($entry, ['.', '..', OwnedCaptureRetentionLedger::OWNED_TEST_MARKER], true)) {
                continue;
            }
            $leaf = $realRoot . DIRECTORY_SEPARATOR . $entry;
            if (is_link($leaf) || !is_file($leaf)
                || (!in_array($entry, [OwnedCaptureRetentionLedger::LEDGER_FILENAME, OwnedCaptureRetentionLedger::LOCK_FILENAME], true)
                    && !preg_match('/^cap_[a-f0-9]{32}\.(json|tmp)$/', $entry))) {
                throw new \RuntimeException('Disposable capture cleanup rejected an unexpected leaf.');
            }
            $leaves[] = $leaf;
        }
        $failed = false;
        foreach ($leaves as $leaf) {
            if (!unlink($leaf)) {
                $failed = true;
            }
        }
        // Keep the capability until all leaves are gone so failed cleanup remains retryable.
        if ($failed || !unlink($marker) || !rmdir($realRoot)) {
            throw new \RuntimeException('Disposable capture cleanup did not complete.');
        }
    }

    protected function tearDown(): void
    {
        $this->assertTestingGuards();

        $db = DB::connection();

        // Guarded fixture teardown in strict reverse FK order:
        // security_dispatch_outbox -> proof tables -> users
        if (!empty($this->createdOutboxIds)) {
            $db->table('security_dispatch_outbox')
                ->whereIn('id', $this->createdOutboxIds)
                ->delete();
            $this->createdOutboxIds = [];
        }

        if (!empty($this->createdProofRecords)) {
            foreach (array_reverse($this->createdProofRecords) as $record) {
                $db->table($record['table'])->where('id', $record['id'])->delete();
            }
            $this->createdProofRecords = [];
        }

        if (!empty($this->createdUserIds)) {
            $db->table('users')
                ->whereIn('id', $this->createdUserIds)
                ->delete();
            $this->createdUserIds = [];
        }

        // Safe bounded leaf cleanup of disposable test roots (including hidden files)
        foreach ($this->ownedRoots as $root) {
            $this->cleanupOwnedRoot($root);
        }
        $this->ownedRoots = [];

        parent::tearDown();
    }

    /**
     * O07.1: Unsupported normal-returning gateway with NO ledger must result in zero submit calls,
     * fail closed before payload decryption or external I/O, and record ERR_UNCONFIGURED_PROVIDER.
     */
    public function test_unsupported_normal_returning_gateway_zero_submit_calls_without_ledger(): void
    {
        $spyGateway = new class implements MailSubmissionInterface {
            public int $submitCalls = 0;

            public function submit(MailMessage $message): MailReceipt
            {
                $this->submitCalls++;
                return new MailReceipt(
                    captureId: 'cap_' . str_repeat('a', 32),
                    capturedAt: CarbonImmutable::now('UTC')->toRfc3339String(),
                    status: MailReceipt::STATUS_CAPTURED_LOCALLY,
                    payloadHash: 'hash',
                    bytesWritten: 128,
                );
            }

            public function send(MailMessage $message): MailReceipt
            {
                return $this->submit($message);
            }
        };

        $dispatcher = new OutboxDispatcher(
            mailSubmission: $spyGateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: null,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        $result = $dispatcher->dispatchBatch(limit: 10);

        $this->assertSame(0, $spyGateway->submitCalls, 'Unsupported normal-returning gateway must have zero submit calls.');
        $this->assertSame(1, $result->processedCount);
        $this->assertSame(0, $result->capturedLocallyCount);
        $this->assertSame(1, $result->failedCount);
        $this->assertContains('ERR_UNCONFIGURED_PROVIDER', $result->errorCodes);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('failed', $row->status);
        $this->assertSame(1, (int) $row->attempts);
        $this->assertNull($row->accepted_at);
        $this->assertNull($row->provider_message_id);
    }

    /**
     * O07.1 Negative Control: Unsupported normal-returning gateway WITH an explicitly supplied ledger
     * must STILL fail closed before payload decryption, raw capture, or submit calls.
     * Local capture mode must require accepted LocalFileMailGateway, not merely a non-null ledger.
     */
    public function test_unsupported_normal_returning_gateway_with_supplied_ledger_fails_closed_without_local_masquerade(): void
    {
        $spyGateway = new class implements MailSubmissionInterface {
            public int $submitCalls = 0;

            public function submit(MailMessage $message): MailReceipt
            {
                $this->submitCalls++;
                return new MailReceipt(
                    captureId: 'cap_' . str_repeat('b', 32),
                    capturedAt: CarbonImmutable::now('UTC')->toRfc3339String(),
                    status: MailReceipt::STATUS_CAPTURED_LOCALLY,
                    payloadHash: 'hash',
                    bytesWritten: 128,
                );
            }

            public function send(MailMessage $message): MailReceipt
            {
                return $this->submit($message);
            }
        };

        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());

        $dispatcher = new OutboxDispatcher(
            mailSubmission: $spyGateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        $result = $dispatcher->dispatchBatch(limit: 10);

        $this->assertSame(0, $spyGateway->submitCalls, 'Unsupported gateway with supplied ledger must never invoke submit.');
        $this->assertSame(1, $result->processedCount);
        $this->assertSame(0, $result->capturedLocallyCount, 'Must not claim local capture when gateway is unsupported.');
        $this->assertSame(1, $result->failedCount);
        $this->assertContains('ERR_UNCONFIGURED_PROVIDER', $result->errorCodes);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('failed', $row->status);
        $this->assertSame(1, (int) $row->attempts);
        $this->assertNull($row->accepted_at);
        $this->assertNull($row->provider_message_id);

        // Retention ledger must have zero entries recorded and no capture files written
        $this->assertEmpty($ledger->loadLedger(), 'No capture entries may be recorded in the ledger by an unsupported gateway.');
        $files = scandir($root) ?: [];
        $captureFiles = array_filter($files, fn ($f) => str_starts_with($f, 'cap_'));
        $this->assertEmpty($captureFiles, 'No capture files may be written to disk by an unsupported gateway.');
    }

    /**
     * O07.1: Unconfigured gateway must safely fail without claiming external delivery.
     */
    public function test_unconfigured_gateway_safe_failure_no_delivered_claim(): void
    {
        $gateway = new UnconfiguredMailGateway();
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        $result = $dispatcher->dispatchBatch(limit: 10);

        $this->assertSame(1, $result->processedCount);
        $this->assertSame(0, $result->capturedLocallyCount);
        $this->assertSame(1, $result->failedCount);
        $this->assertContains('ERR_UNCONFIGURED_PROVIDER', $result->errorCodes);

        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('failed', $row->status);
        $this->assertSame(1, (int) $row->attempts);
        $this->assertNull($row->accepted_at);
        $this->assertNull($row->provider_message_id);
    }

    /**
     * O07.2: Active local capture repeat dedupe must execute behind canonical locks,
     * revalidate authority against fresh database time, and preserve original deadline without extension.
     */
    public function test_active_local_capture_repeat_dedupe_with_unchanged_deadline(): void
    {
        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        // First dispatch: creates local capture
        $res1 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res1->capturedLocallyCount);
        $this->assertCount(1, $res1->captureIds);
        $capId = $res1->captureIds[0];

        $entriesBefore = $ledger->loadLedger();
        $this->assertCount(1, $entriesBefore);
        $origExpiresAt = $entriesBefore[0]['expires_at'];
        $origCapturedAt = $entriesBefore[0]['captured_at'];

        // Second dispatch: repeat dedupe under locked authority
        $res2 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res2->capturedLocallyCount);
        $this->assertSame([$capId], $res2->captureIds);

        // Retention ledger entry must retain exact original deadline without extension
        $entriesAfter = $ledger->loadLedger();
        $this->assertCount(1, $entriesAfter);
        $this->assertSame($capId, $entriesAfter[0]['capture_id']);
        $this->assertSame($origExpiresAt, $entriesAfter[0]['expires_at'], 'Capture deadline must remain unchanged on repeat.');
        $this->assertSame($origCapturedAt, $entriesAfter[0]['captured_at']);

        // Outbox row remains queued in PostgreSQL with attempt count 1
        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertSame('queued', $row->status);
        $this->assertSame(1, (int) $row->attempts);
        $this->assertNull($row->accepted_at);
        $this->assertNull($row->provider_message_id);
    }

    /**
     * O07.2: Capture -> revoke -> dispatch+cleanup must yield no valid capture result,
     * scrub outbox ciphertext in PostgreSQL, and erase raw capture file from disk.
     */
    public function test_capture_then_revoke_dispatch_cleans_up_with_no_valid_capture_result_and_scrubbed_ciphertext(): void
    {
        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        // Initial dispatch: successfully captured locally
        $res1 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res1->capturedLocallyCount);
        $capId = $res1->captureIds[0];
        $capFile = $root . DIRECTORY_SEPARATOR . $capId . '.json';
        $this->assertFileExists($capFile);

        // Revoke the proof in DB
        $this->proofService->revokeAll(ProofPurpose::PassengerEmailVerification, $userId);

        // Second dispatch: must not return valid captured outcome, must scrub ciphertext and erase raw file
        $res2 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(0, $res2->capturedLocallyCount, 'Must not return a valid capture result for revoked proof.');
        $this->assertEmpty($res2->captureIds, 'Never return a stale capture ID on revoked proof.');

        // Assert outbox row is scrubbed and ciphertext erased
        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('scrubbed', $row->status);
        $this->assertNotNull($row->scrubbed_at);
        $this->assertNull($row->encrypted_payload, 'Encrypted payload must be scrubbed.');

        // Assert raw capture file is erased
        $this->assertFileDoesNotExist($capFile, 'Raw capture file must be erased on scrub/revocation.');
    }

    /**
     * O07.2: Capture -> consume -> dispatch+cleanup must yield no valid capture result,
     * scrub outbox ciphertext in PostgreSQL, and erase raw capture file from disk.
     */
    public function test_capture_then_consume_dispatch_cleans_up_with_no_valid_capture_result_and_scrubbed_ciphertext(): void
    {
        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        // Initial dispatch: successfully captured locally
        $res1 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res1->capturedLocallyCount);
        $capId = $res1->captureIds[0];
        $capFile = $root . DIRECTORY_SEPARATOR . $capId . '.json';
        $this->assertFileExists($capFile);

        // Consume the proof token
        $consumptionResult = $this->proofService->consume(
            purpose: ProofPurpose::PassengerEmailVerification,
            rawSecretToken: $proof->getRawToken(),
        );
        $this->assertTrue($consumptionResult->isSuccess(), 'Proof consumption must succeed.');

        // Second dispatch: consumed proof invalidates authority, scrubs ciphertext, erases capture
        $res2 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(0, $res2->capturedLocallyCount, 'Must not return a valid capture result for consumed proof.');
        $this->assertEmpty($res2->captureIds, 'Never return a stale capture ID on consumed proof.');

        // Assert outbox row is scrubbed and ciphertext erased
        $row = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($row);
        $this->assertSame('scrubbed', $row->status);
        $this->assertNotNull($row->scrubbed_at);
        $this->assertNull($row->encrypted_payload, 'Encrypted payload must be scrubbed.');

        // Assert raw capture file is erased
        $this->assertFileDoesNotExist($capFile, 'Raw capture file must be erased on scrub/consumed proof.');
    }

    /**
     * O07.2: Already-scrubbed or non-queued outbox records omitted from candidate selection
     * must still receive bounded durable reconciliation via cleanupExpired at dispatch invocation.
     */
    public function test_omitted_scrubbed_candidate_reconciles_via_retention_ledger_without_queue_selection(): void
    {
        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        // Initial dispatch: successfully captured locally
        $res1 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res1->capturedLocallyCount);
        $capId = $res1->captureIds[0];
        $capFile = $root . DIRECTORY_SEPARATOR . $capId . '.json';
        $this->assertFileExists($capFile);
        $this->assertCount(1, $ledger->loadLedger());

        // External/prior scrub: mark outbox row scrubbed directly in database
        DB::table('security_dispatch_outbox')
            ->where('id', $outboxId)
            ->update([
                'status' => 'scrubbed',
                'scrubbed_at' => DB::raw('clock_timestamp()'),
                'encrypted_payload' => null,
            ]);

        // Subsequent dispatch: candidate query omits the scrubbed record (processedCount = 0),
        // but cleanupExpired reconciles ledger at dispatch start against authoritative DB status
        $res2 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(0, $res2->processedCount, 'Omitted scrubbed candidate is not processed in batch loop.');
        $this->assertSame(0, $res2->capturedLocallyCount);
        $this->assertEmpty($res2->captureIds);

        // Raw capture file must be erased from disk and ledger entry removed
        $this->assertFileDoesNotExist($capFile, 'Omitted scrubbed candidate raw file must be erased via cleanupExpired.');
        $this->assertEmpty($ledger->loadLedger(), 'Retention ledger entry must be purged for scrubbed candidate.');
    }

    /**
     * O07.2: Failed file erasure must remain durably accounted in the retention ledger,
     * preserving original deadline and failed_cleanup state for subsequent retry.
     */
    public function test_failed_erasure_remains_ledger_accounted_and_retryable(): void
    {
        $root = $this->createOwnedRoot();

        $ledger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public bool $failErasure = false;

            public function eraseCaptureFile(string $captureId): bool
            {
                if ($this->failErasure) {
                    return false;
                }
                return parent::eraseCaptureFile($captureId);
            }
        };

        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        $userId = $this->createTrackedUser();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        // Initial dispatch
        $res1 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(1, $res1->capturedLocallyCount);
        $capId = $res1->captureIds[0];
        $capFile = $root . DIRECTORY_SEPARATOR . $capId . '.json';
        $this->assertFileExists($capFile);

        $entriesBefore = $ledger->loadLedger();
        $origExpiresAt = $entriesBefore[0]['expires_at'];

        // Revoke proof and simulate erasure failure
        $this->proofService->revokeAll(ProofPurpose::PassengerEmailVerification, $userId);
        $ledger->failErasure = true;

        // Dispatch reconciles revocation, but erase fails
        $res2 = $dispatcher->dispatchBatch(limit: 10);
        $this->assertSame(0, $res2->capturedLocallyCount);

        // Ledger must retain entry marked failed_cleanup and revoked
        $entriesFailed = $ledger->loadLedger();
        $this->assertCount(1, $entriesFailed, 'Failed erasure must remain accounted in the ledger.');
        $this->assertSame('failed_cleanup', $entriesFailed[0]['state']);
        $this->assertTrue($entriesFailed[0]['revoked']);
        $this->assertSame($origExpiresAt, $entriesFailed[0]['expires_at'], 'Original deadline must be preserved on erasure failure.');

        // Restore normal erasure capability and retry cleanup
        $ledger->failErasure = false;
        $cleaned = $ledger->cleanupExpired(now: CarbonImmutable::now('UTC'), conn: DB::connection());
        $this->assertSame(1, $cleaned);

        // File is now erased and ledger entry removed
        $this->assertFileDoesNotExist($capFile);
        $this->assertEmpty($ledger->loadLedger(), 'Retryable cleanup must purge ledger entry after successful erase.');
    }

    /**
     * O07.2: Dispatcher must reject invocation from within an active caller transaction
     * BEFORE any file lock acquisition, directory I/O, or candidate processing.
     */
    public function test_caller_transaction_still_rejects_before_io(): void
    {
        $root = $this->createOwnedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $gateway = new LocalFileMailGateway(storagePath: $root);
        $dispatcher = new OutboxDispatcher(
            mailSubmission: $gateway,
            encrypter: $this->encrypter,
            db: DB::connection(),
            captureLedger: $ledger,
        );

        DB::beginTransaction();
        try {
            $this->expectException(DispatchException::class);
            $this->expectExceptionMessage('Dispatcher cannot be invoked from inside an active transaction.');
            $dispatcher->dispatchBatch(10);
        } finally {
            DB::rollBack();
        }
    }
}
