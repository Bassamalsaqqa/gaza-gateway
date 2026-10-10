<?php

declare(strict_types=1);

/**
 * Isolated CLI Concurrency Worker for Phase 13B Identity Lifecycle proof replay
 * and lock contention verification.
 *
 * Strict safety boundaries:
 * - Requires APP_ENV === 'testing'
 * - Requires DB_TEST_DATABASE === 'gaza_gateway_test'
 * - Requires live PostgreSQL connection current_database() === 'gaza_gateway_test'
 * - Emits only known allowlisted status/tag responses (never raw SQL or credentials)
 */

$env = getenv('APP_ENV');
if ($env !== 'testing') {
    fwrite(STDERR, "Configuration error: worker requires APP_ENV=testing\n");
    exit(1);
}

$database = getenv('DB_TEST_DATABASE');
if ($database !== 'gaza_gateway_test') {
    fwrite(STDERR, "Configuration error: worker requires DB_TEST_DATABASE=gaza_gateway_test\n");
    exit(1);
}

require_once __DIR__ . '/../../../vendor/autoload.php';
$app = require_once __DIR__ . '/../../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;

$conn = DB::connection('pgsql_test');
$liveDb = (string) $conn->selectOne('SELECT current_database() AS db')->db;
if ($liveDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "Database error: live connection is not gaza_gateway_test\n");
    exit(3);
}

$backendPid = (int) $conn->selectOne('SELECT pg_backend_pid() AS pid')->pid;
$pdo = $conn->getPdo();

// Announce readiness and backend PID
echo json_encode(['status' => 'READY', 'pid' => $backendPid]) . "\n";
flush();

function extractAllowlistedTag(string $message): string
{
    $allowlistedTags = [
        'chk_user_email_verif_state',
        'chk_user_password_resets_state',
        'chk_staff_invitations_state',
        'chk_staff_password_resets_state',
        'already_consumed',
        'consumed',
        'lock_acquired',
        'lock_released',
        'lock_failed',
        'invalid_arguments',
        'ERR_UNCONFIGURED_PROVIDER',
        'ERR_INVALID_MAIL_MESSAGE',
        'ERR_MAIL_CAPTURE_IO',
        'ERR_PAYLOAD_DECRYPTION',
        'ERR_RETENTION_LEDGER_REQUIRED',
        'ERR_DISPATCH_FAILURE',
        'ERR_CONSUME_FAILURE',
        'ERR_REISSUE_FAILURE',
        'ERR_RECORD_CAPTURE_FAILURE',
        'ERR_ENQUEUE_FAILURE',
    ];

    foreach ($allowlistedTags as $tag) {
        if (str_contains($message, $tag)) {
            return $tag;
        }
    }

    return 'ERR_OPERATION_FAILED';
}

while ($line = fgets(STDIN, 65538)) {
    if (strlen($line) > 65536 || !str_ends_with($line, "\n")) {
        fwrite(STDERR, "Worker protocol input limit exceeded\n");
        exit(4);
    }
    $line = trim($line);
    if ($line === '') {
        continue;
    }

    try {
        $cmd = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
    } catch (\Throwable $e) {
        fwrite(STDERR, "Worker received invalid JSON\n");
        exit(5);
    }

    $action = $cmd['action'] ?? null;

    if ($action === 'ping') {
        echo json_encode(['status' => 'PONG']) . "\n";
        flush();
        continue;
    }

    if ($action === 'quit') {
        if ($conn->transactionLevel() > 0) {
            $conn->rollBack();
        }
        echo json_encode(['status' => 'BYE']) . "\n";
        flush();
        exit(0);
    }

    if ($action === 'lock_proof_and_wait') {
        $table = $cmd['table'] ?? 'user_email_verifications';
        $proofId = $cmd['proof_id'] ?? null;

        $allowedTables = [
            'user_email_verifications',
            'user_password_resets',
            'staff_invitations',
            'staff_password_resets',
        ];

        if (!in_array($table, $allowedTables, true) || !$proofId) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments']) . "\n";
            flush();
            continue;
        }

        try {
            $conn->beginTransaction();
            $stmt = $pdo->prepare("SELECT id, state, token_digest FROM {$table} WHERE id = ? FOR UPDATE");
            $stmt->execute([$proofId]);
            $row = $stmt->fetch();

            echo json_encode([
                'status' => 'LOCKED',
                'pid' => $backendPid,
                'tag' => 'lock_acquired',
                'row_found' => (bool) $row,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            $tag = extractAllowlistedTag($e->getMessage()) ?? 'lock_failed';
            echo json_encode(['status' => 'ERROR', 'tag' => $tag]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'lock_principal_and_wait') {
        $table = $cmd['table'] ?? 'users';
        $principalId = $cmd['principal_id'] ?? null;

        if (!in_array($table, ['users', 'staff_users'], true) || !$principalId) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments']) . "\n";
            flush();
            continue;
        }

        try {
            $conn->beginTransaction();
            $stmt = $pdo->prepare("SELECT id, email FROM {$table} WHERE id = ? FOR UPDATE");
            $stmt->execute([$principalId]);
            $row = $stmt->fetch();

            echo json_encode([
                'status' => 'LOCKED',
                'pid' => $backendPid,
                'tag' => 'lock_acquired',
                'row_found' => (bool) $row,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            $tag = extractAllowlistedTag($e->getMessage()) ?? 'lock_failed';
            echo json_encode(['status' => 'ERROR', 'tag' => $tag]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'emit_oversize') {
        echo str_repeat('X', 70000) . "\n";
        flush();
        continue;
    }

    if ($action === 'dispatch_batch') {
        try {
            $sinkDir = $cmd['sink_dir'] ?? null;
            if ($sinkDir === null || !file_exists($sinkDir . '/' . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER)) {
                $sinkDir = OwnedCaptureRetentionLedger::createDisposableTestRoot('test_worker_sink_', $conn);
            }
            $gateway = new LocalFileMailGateway($sinkDir);
            $encrypter = app(Encrypter::class);
            $ledger = new OwnedCaptureRetentionLedger($sinkDir, $conn);
            $dispatcher = new OutboxDispatcher($gateway, $encrypter, $conn, $ledger);
            $result = $dispatcher->dispatchBatch(limit: (int) ($cmd['limit'] ?? 10));

            echo json_encode([
                'status' => 'SUCCESS',
                'captured' => $result->capturedLocallyCount,
                'failed' => $result->failedCount,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'enqueue_proof_and_wait') {
        try {
            $purpose = ProofPurpose::from($cmd['purpose']);
            $principalId = $cmd['principal_id'];
            $proofService = app(ProofService::class);
            $encrypter = app(Encrypter::class);

            $receipt = $proofService->issue($purpose, $principalId);

            $conn->beginTransaction();
            $outboxService = new OutboxService($encrypter, $conn);
            $outboxId = $outboxService->enqueueProof($receipt, $conn);

            echo json_encode([
                'status' => 'ENQUEUED_AND_LOCKED',
                'outbox_id' => $outboxId,
                'proof_id' => $receipt->proofId,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'consume_proof_service') {
        try {
            $purpose = ProofPurpose::from($cmd['purpose']);
            $rawToken = $cmd['raw_token'];
            $proofService = app(ProofService::class);
            $result = $proofService->consume($purpose, $rawToken);

            echo json_encode([
                'status' => 'SUCCESS',
                'outcome' => $result->outcome->value,
                'is_success' => $result->isSuccess(),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'reissue_proof_service') {
        try {
            $purpose = ProofPurpose::from($cmd['purpose']);
            $principalId = $cmd['principal_id'];
            $proofService = app(ProofService::class);
            $receipt = $proofService->reissue($purpose, $principalId);

            echo json_encode([
                'status' => 'SUCCESS',
                'proof_id' => $receipt->proofId,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'reissue_proof_and_wait') {
        try {
            $purpose = ProofPurpose::from($cmd['purpose']);
            $principalId = $cmd['principal_id'];

            $conn->beginTransaction();

            $stmt = $pdo->prepare("SELECT id, email, credential_epoch FROM users WHERE id = ? FOR UPDATE");
            $stmt->execute([$principalId]);
            $principal = $stmt->fetch();

            if (!$principal) {
                $conn->rollBack();
                echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments', 'pid' => $backendPid]) . "\n";
                flush();
                continue;
            }

            $proofService = app(ProofService::class);
            $proofService->revokeAll($purpose, $principalId, $conn);

            $conn->table('users')->where('id', $principalId)->increment('credential_epoch');

            $receipt = $proofService->issue($purpose, $principalId, $conn);

            echo json_encode([
                'status' => 'REISSUED_AND_LOCKED',
                'proof_id' => $receipt->proofId,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'record_capture_ledger') {
        try {
            $sinkDir = $cmd['sink_dir'];
            $ledger = new OwnedCaptureRetentionLedger($sinkDir, $conn);
            $expiresAt = CarbonImmutable::parse($cmd['expires_at']);
            $capturedAt = isset($cmd['captured_at']) ? CarbonImmutable::parse($cmd['captured_at']) : null;
            $ledger->recordCapture(
                captureId: $cmd['capture_id'],
                outboxId: $cmd['outbox_id'],
                targetId: $cmd['target_id'],
                purpose: $cmd['purpose'],
                expiresAt: $expiresAt,
                capturedAt: $capturedAt,
            );

            echo json_encode([
                'status' => 'SUCCESS',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'ERROR',
                'tag' => extractAllowlistedTag($e->getMessage()),
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'consume_proof') {
        $table = $cmd['table'] ?? 'user_email_verifications';
        $proofId = $cmd['proof_id'] ?? null;

        $allowedTables = [
            'user_email_verifications',
            'user_password_resets',
            'staff_invitations',
            'staff_password_resets',
        ];

        if (!in_array($table, $allowedTables, true) || !$proofId) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments']) . "\n";
            flush();
            continue;
        }

        try {
            $needCommit = false;
            if ($conn->transactionLevel() === 0) {
                $conn->beginTransaction();
                $needCommit = true;
            }

            // Lock row FOR UPDATE
            $stmt = $pdo->prepare("SELECT id, state, expires_at FROM {$table} WHERE id = ? FOR UPDATE");
            $stmt->execute([$proofId]);
            $row = $stmt->fetch();

            if (!$row) {
                if ($needCommit) {
                    $conn->rollBack();
                }
                echo json_encode(['status' => 'NOT_FOUND', 'tag' => 'not_found']) . "\n";
                flush();
                continue;
            }

            if ($row['state'] === 'consumed') {
                if ($needCommit) {
                    $conn->rollBack();
                }
                echo json_encode(['status' => 'ALREADY_CONSUMED', 'tag' => 'already_consumed']) . "\n";
                flush();
                continue;
            }

            $update = $pdo->prepare("UPDATE {$table} SET state = 'consumed', consumed_at = clock_timestamp() WHERE id = ?");
            $update->execute([$proofId]);

            if ($needCommit) {
                $conn->commit();
            }

            echo json_encode(['status' => 'SUCCESS', 'tag' => 'consumed']) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            $tag = extractAllowlistedTag($e->getMessage()) ?? 'consume_failed';
            echo json_encode(['status' => 'ERROR', 'tag' => $tag]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'commit') {
        try {
            if ($conn->transactionLevel() > 0) {
                $conn->commit();
            }
            echo json_encode(['status' => 'COMMITTED']) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'commit_failed']) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'rollback') {
        try {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode(['status' => 'ROLLED_BACK']) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'rollback_failed']) . "\n";
            flush();
        }
        continue;
    }

    echo json_encode(['status' => 'UNKNOWN_ACTION']) . "\n";
    flush();
}

exit(0);
