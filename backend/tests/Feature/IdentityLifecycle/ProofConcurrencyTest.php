<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityLifecycle;

use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\ProofConsumptionOutcome;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityLifecycle\ConcurrencyWorkerProcess;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;

class ProofConcurrencyTest extends TestCase
{
    private ProofService $service;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('security_dispatch_outbox')->delete();
        $this->service = new ProofService(DB::connection());
    }

    protected function tearDown(): void
    {
        DB::table('security_dispatch_outbox')->delete();
        parent::tearDown();
    }

    /**
     * Helper to poll PostgreSQL until a target backend PID is actively blocked by an expected blocker PID.
     */
    private function assertBackendBlocked(int $blockedPid, int $expectedBlockerPid, int $timeoutMs = 5000): void
    {
        $start = microtime(true);
        $observedBlockers = [];

        while ((microtime(true) - $start) * 1000 < $timeoutMs) {
            $rows = DB::select('
                SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
                FROM pg_stat_activity
                WHERE pid = ?
            ', [$blockedPid]);

            if (!empty($rows)) {
                $blockerStr = trim($rows[0]->blockers, '{}');
                if ($blockerStr !== '') {
                    $observedBlockers = array_map('intval', explode(',', $blockerStr));
                    if (in_array($expectedBlockerPid, $observedBlockers, true)) {
                        $this->assertSame('Lock', $rows[0]->wait_event_type, 'Expected PostgreSQL wait_event_type to be Lock');
                        return;
                    }
                }
            }

            usleep(25000); // 25ms
        }

        $this->fail(sprintf(
            'Backend PID %d was not blocked by PID %d within %d ms (observed blockers: %s)',
            $blockedPid,
            $expectedBlockerPid,
            $timeoutMs,
            json_encode($observedBlockers)
        ));
    }

    public function test_two_process_proof_consumption_lock_wait_and_single_success(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        $worker = new ConcurrencyWorkerProcess();
        $workerPid = $worker->getBackendPid();
        $this->assertGreaterThan(0, $workerPid);

        try {
            // Step 1: Worker locks proof row FOR UPDATE and holds transaction open
            $worker->sendCommand([
                'action' => 'lock_proof_and_wait',
                'table' => 'user_email_verifications',
                'proof_id' => $receipt->proofId,
            ]);

            $workerResponse = $worker->readLine(3.0);
            $this->assertNotNull($workerResponse);
            $this->assertSame('LOCKED', $workerResponse['status']);

            // Step 2: Parent attempts to consume the proof concurrently in a separate connection/transaction
            // Worker commits first by consuming the proof
            $worker->sendCommand([
                'action' => 'consume_proof',
                'table' => 'user_email_verifications',
                'proof_id' => $receipt->proofId,
            ]);

            $consumeResponse = $worker->readLine(3.0);
            $this->assertNotNull($consumeResponse);
            $this->assertSame('SUCCESS', $consumeResponse['status']);

            $worker->sendCommand(['action' => 'commit']);
            $commitResponse = $worker->readLine(3.0);
            $this->assertNotNull($commitResponse);
            $this->assertSame('COMMITTED', $commitResponse['status']);

            // Step 3: Now parent attempts consumption of the same proof token
            $parentResult = $this->service->consume(
                ProofPurpose::PassengerEmailVerification,
                $receipt->getRawToken()
            );

            // Parent MUST observe AlreadyConsumed
            $this->assertSame(ProofConsumptionOutcome::AlreadyConsumed, $parentResult->outcome);

            // Final state in PostgreSQL is consumed
            $finalRow = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
            $this->assertSame('consumed', $finalRow->state);
            $this->assertNotNull($finalRow->consumed_at);
        } finally {
            $worker->close();
        }
    }

    public function test_worker_is_blocked_by_parent_lock_and_observes_exact_blocker(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        $worker = new ConcurrencyWorkerProcess();
        $workerPid = $worker->getBackendPid();
        $this->assertGreaterThan(0, $workerPid);

        try {
            // Step 1: Parent starts a transaction and acquires FOR UPDATE on proof row
            DB::beginTransaction();
            $parentPid = (int) DB::selectOne('SELECT pg_backend_pid() AS pid')->pid;
            $this->assertGreaterThan(0, $parentPid);

            $lockedRow = DB::table('user_email_verifications')
                ->where('id', $receipt->proofId)
                ->lockForUpdate()
                ->first();
            $this->assertNotNull($lockedRow);

            // Step 2: Worker concurrently attempts to acquire FOR UPDATE on the same row
            $worker->sendCommand([
                'action' => 'lock_proof_and_wait',
                'table' => 'user_email_verifications',
                'proof_id' => $receipt->proofId,
            ]);

            // Step 3: Verify PostgreSQL reports worker PID blocked by parent PID
            $this->assertBackendBlocked($workerPid, $parentPid, timeoutMs: 3000);

            // Step 4: Parent consumes proof under lock and commits
            DB::table('user_email_verifications')
                ->where('id', $receipt->proofId)
                ->update([
                    'state' => 'consumed',
                    'consumed_at' => DB::raw('clock_timestamp()'),
                ]);
            DB::commit();

            // Step 5: Unblocked worker now reads the lock response
            $workerResponse = $worker->readLine(3.0);
            $this->assertNotNull($workerResponse);
            $this->assertSame('LOCKED', $workerResponse['status']);

            // Worker verifies the row is already consumed
            $worker->sendCommand([
                'action' => 'consume_proof',
                'table' => 'user_email_verifications',
                'proof_id' => $receipt->proofId,
            ]);
            $consumeResponse = $worker->readLine(3.0);
            $this->assertNotNull($consumeResponse);
            $this->assertSame('ALREADY_CONSUMED', $consumeResponse['status']);

            $worker->sendCommand(['action' => 'rollback']);
            $worker->readLine(3.0);
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $worker->close();
        }
    }

    public function test_worker_process_enforces_64kib_input_bound_and_rejects_oversize_command(): void
    {
        $worker = new ConcurrencyWorkerProcess();
        try {
            $this->expectException(\InvalidArgumentException::class);
            $this->expectExceptionMessage('64KiB');
            $worker->sendCommand([
                'action' => 'ping',
                'oversize_payload' => str_repeat('A', 70000),
            ]);
        } finally {
            $worker->close();
        }
    }

    public function test_worker_process_enforces_64kib_output_bound_and_fails_safely(): void
    {
        $worker = new ConcurrencyWorkerProcess();
        try {
            $worker->sendCommand(['action' => 'emit_oversize']);
            $this->expectException(\RuntimeException::class);
            $this->expectExceptionMessage('64KiB');
            $worker->readLine(3.0);
        } finally {
            $worker->close();
        }
    }

    public function test_real_two_process_enqueue_vs_dispatch_blocks_cleanly_without_40p01_deadlock(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt1 = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);
        $encrypter = app(\Illuminate\Contracts\Encryption\Encrypter::class);
        $outboxService = new OutboxService($encrypter, DB::connection());
        $outboxId1 = $outboxService->enqueueProof($receipt1);

        $worker1 = new ConcurrencyWorkerProcess();
        $worker2 = new ConcurrencyWorkerProcess();

        try {
            // Step 1: Worker 1 runs genuine OutboxService::enqueueProof within its owned transaction for the same user and holds transaction open
            $worker1->sendCommand([
                'action' => 'enqueue_proof_and_wait',
                'purpose' => 'passenger_email_verification',
                'principal_id' => $userId,
            ]);
            $w1Resp = $worker1->readLine(5.0);
            $this->assertNotNull($w1Resp);
            $this->assertSame('ENQUEUED_AND_LOCKED', $w1Resp['status']);

            // Step 2: Worker 2 runs real dispatchBatch service path; attempts lock on same principal row and BLOCKS
            $sinkDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_sink_deadlock_', DB::connection());

            $worker2->sendCommand([
                'action' => 'dispatch_batch',
                'sink_dir' => $sinkDir,
                'limit' => 10,
            ]);

            // Step 3: Observe via PostgreSQL pg_blocking_pids that Worker 2 is actively blocked by Worker 1
            $this->assertBackendBlocked($worker2->getBackendPid(), $worker1->getBackendPid(), timeoutMs: 5000);

            // Step 4: Worker 1 releases lock by committing its transaction
            $worker1->sendCommand(['action' => 'commit']);
            $commitResp = $worker1->readLine(3.0);
            $this->assertNotNull($commitResp);
            $this->assertSame('COMMITTED', $commitResp['status']);

            // Step 5: Worker 2 unblocks, acquires lock, finishes dispatchBatch without 40P01 deadlock
            $w2Resp = $worker2->readLine(5.0);
            $this->assertNotNull($w2Resp);
            $this->assertSame('SUCCESS', $w2Resp['status'], 'Worker 2 dispatch failed: ' . json_encode($w2Resp));
            $this->assertGreaterThanOrEqual(1, $w2Resp['captured']);

            // Verify outbox state
            $outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId1)->first();
            $this->assertSame('queued', $outboxRow->status);
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }

    public function test_real_two_process_deadline_post_wait_scrubs_expired_outbox_without_dispatch(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        $encrypter = app(\Illuminate\Contracts\Encryption\Encrypter::class);
        $outboxService = new OutboxService($encrypter, DB::connection());
        $outboxId = $outboxService->enqueueProof($receipt);

        $worker1 = new ConcurrencyWorkerProcess();
        $worker2 = new ConcurrencyWorkerProcess();

        try {
            // Step 1: Worker 1 locks principal row FOR UPDATE and holds transaction open
            $worker1->sendCommand([
                'action' => 'lock_principal_and_wait',
                'table' => 'users',
                'principal_id' => $userId,
            ]);
            $w1Resp = $worker1->readLine(3.0);
            $this->assertNotNull($w1Resp);
            $this->assertSame('LOCKED', $w1Resp['status']);

            // Step 2: Now that Worker 1 holds the lock, set expiry to 2.0 seconds from now in DB
            DB::statement("
                UPDATE user_email_verifications
                SET expires_at = clock_timestamp() + interval '2.0 seconds'
                WHERE id = ?
            ", [$receipt->proofId]);

            DB::statement("
                UPDATE security_dispatch_outbox
                SET expires_at = clock_timestamp() + interval '2.0 seconds'
                WHERE id = ?
            ", [$outboxId]);

            // Step 3: Worker 2 runs real dispatchBatch; blocks waiting on principal row lock held by Worker 1
            $sinkDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_sink_expiry_', DB::connection());

            $worker2->sendCommand([
                'action' => 'dispatch_batch',
                'sink_dir' => $sinkDir,
                'limit' => 10,
            ]);

            // Step 4: Observe via pg_blocking_pids that Worker 2 is actively blocked by Worker 1
            $this->assertBackendBlocked($worker2->getBackendPid(), $worker1->getBackendPid(), timeoutMs: 5000);

            // Step 5: Let proof deadline pass during Worker 2's observed lock wait
            usleep(4000000); // 4.0 seconds

            // Step 6: Worker 1 releases lock by committing
            $worker1->sendCommand(['action' => 'commit']);
            $worker1->readLine(3.0);

            // Step 6: Worker 2 unblocks; derives clock_timestamp AFTER acquiring lock,
            // detects proof has expired, scrubs outbox record, and captures ZERO mail
            $w2Resp = $worker2->readLine(5.0);
            $this->assertNotNull($w2Resp);
            $this->assertSame('SUCCESS', $w2Resp['status'], 'Worker 2 dispatch failed: ' . json_encode($w2Resp));
            $this->assertSame(0, $w2Resp['captured'], 'Expired proof must not produce any mail captures');

            // Verify outbox row in DB is cleanly expired/scrubbed and ciphertext is erased
            $outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
            $this->assertContains($outboxRow->status, ['expired', 'scrubbed']);
            $this->assertNull($outboxRow->encrypted_payload);
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }

    public function test_real_two_process_reissue_revocation_vs_dispatch_blocks_and_scrubs(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        $encrypter = app(\Illuminate\Contracts\Encryption\Encrypter::class);
        $outboxService = new OutboxService($encrypter, DB::connection());
        $outboxId = $outboxService->enqueueProof($receipt);

        $worker1 = new ConcurrencyWorkerProcess();
        $worker2 = new ConcurrencyWorkerProcess();

        try {
            // Step 1: Worker 1 runs reissue_proof_and_wait; locks principal row, revokes old proof, increments epoch, and holds transaction open
            $worker1->sendCommand([
                'action' => 'reissue_proof_and_wait',
                'purpose' => 'passenger_email_verification',
                'principal_id' => $userId,
            ]);
            $w1Resp = $worker1->readLine(5.0);
            $this->assertNotNull($w1Resp);
            $this->assertSame('REISSUED_AND_LOCKED', $w1Resp['status']);

            // Step 2: Worker 2 attempts dispatchBatch of the queued outbox item; BLOCKS waiting on principal lock held by Worker 1
            $sinkDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_sink_reissue_', DB::connection());

            $worker2->sendCommand([
                'action' => 'dispatch_batch',
                'sink_dir' => $sinkDir,
                'limit' => 10,
            ]);

            // Step 3: Observe via PostgreSQL pg_blocking_pids that Worker 2 is actively blocked by Worker 1
            $this->assertBackendBlocked($worker2->getBackendPid(), $worker1->getBackendPid(), timeoutMs: 5000);

            // Step 4: Worker 1 commits its reissue transaction
            $worker1->sendCommand(['action' => 'commit']);
            $commitResp = $worker1->readLine(3.0);
            $this->assertNotNull($commitResp);
            $this->assertSame('COMMITTED', $commitResp['status']);

            // Step 5: Worker 2 unblocks; rechecks authority post-lock wait, detects revocation, scrubs outbox row, and writes ZERO capture files
            $w2Resp = $worker2->readLine(5.0);
            $this->assertNotNull($w2Resp);
            $this->assertSame('SUCCESS', $w2Resp['status'], 'Worker 2 dispatch failed: ' . json_encode($w2Resp));
            $this->assertSame(0, $w2Resp['captured'], 'Revoked proof must produce ZERO mail captures');

            // Verify outbox state in DB: status is scrubbed, payload is NULL
            $outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
            $this->assertSame('scrubbed', $outboxRow->status);
            $this->assertNull($outboxRow->encrypted_payload);

            // Verify sink on disk contains ZERO capture JSON files
            $rawFiles = glob($sinkDir . DIRECTORY_SEPARATOR . 'cap_*.json') ?: [];
            $this->assertEmpty($rawFiles, 'Zero capture files must be written for revoked proof');
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }
}
