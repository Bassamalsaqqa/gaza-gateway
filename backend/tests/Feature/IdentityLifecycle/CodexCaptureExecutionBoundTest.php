<?php
declare(strict_types=1);

namespace Tests\CodexReview;

use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\MailMessage;
use App\Identity\Dispatch\Exceptions\DispatchException;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\LocalProofCaptureCoordinator;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CodexCaptureExecutionBoundTest extends TestCase
{
    private array $roots = [];

    private function createRoot(string $prefix = 'codex_bound_'): string
    {
        $root = OwnedCaptureRetentionLedger::createDisposableTestRoot($prefix, DB::connection());
        $this->roots[] = $root;
        config(['foundation-services.mail.local_path' => $root]);
        return $root;
    }

    public function testWriterDeadlineInterruptsStallRatherThanDetectingItAfterReturn(): void
    {
        $root = $this->createRoot('codex_bound_1_');
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $writer = new LocalProofCaptureCoordinator(
            $ledger,
            writeTimeoutSeconds: 0.05,
            stallProbe: 0.4
        );
        $denied = false;
        $start = hrtime(true);
        try {
            $writer->captureProof(
                '00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002',
                'passenger_password_reset',
                CarbonImmutable::now('UTC')->addMinute(),
                new MailMessage('synthetic@example.invalid', 'Synthetic', 'Synthetic')
            );
        } catch (MailCaptureException) {
            $denied = true;
        }
        $elapsed = (hrtime(true) - $start) / 1e9;

        $this->assertTrue($denied, 'Writer stall did not throw MailCaptureException.');
        $this->assertLessThan(0.2, $elapsed, 'The 50ms deadline waited for the entire 400ms writer stall.');
    }

    public function testChildTerminationPrecedesCleanupAndNoDelayedWrite(): void
    {
        $root = $this->createRoot('codex_bound_2_');
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $writer = new LocalProofCaptureCoordinator(
            $ledger,
            writeTimeoutSeconds: 0.05,
            stallProbe: 0.4
        );

        $denied = false;
        $start = hrtime(true);
        try {
            $writer->captureProof(
                '00000000-0000-4000-8000-000000000003',
                '00000000-0000-4000-8000-000000000004',
                'passenger_password_reset',
                CarbonImmutable::now('UTC')->addMinute(),
                new MailMessage('synthetic@example.invalid', 'Synthetic', 'Synthetic')
            );
        } catch (MailCaptureException) {
            $denied = true;
        }
        $elapsed = (hrtime(true) - $start) / 1e9;

        $this->assertTrue($denied);
        $this->assertLessThan(0.2, $elapsed);

        // Sleep long enough for the child's 400ms stall to have elapsed if it had survived
        usleep(450000);

        // Verify no delayed child write occurred after termination
        $entries = scandir($root) ?: [];
        $files = array_filter($entries, static fn(string $f): bool => !in_array($f, ['.', '..', OwnedCaptureRetentionLedger::OWNED_TEST_MARKER, OwnedCaptureRetentionLedger::LEDGER_FILENAME, OwnedCaptureRetentionLedger::LOCK_FILENAME], true));
        $this->assertEmpty($files, 'Child process wrote raw files after parent deadline termination.');
    }

    public function testSuccessfulCaptureUnderDeadlineWritesPayloadAndCommitsReservation(): void
    {
        $root = $this->createRoot('codex_bound_3_');
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $writer = new LocalProofCaptureCoordinator($ledger, writeTimeoutSeconds: 2.0);

        $outboxId = '00000000-0000-4000-8000-000000000005';
        $targetId = '00000000-0000-4000-8000-000000000006';
        $expires = CarbonImmutable::now('UTC')->addMinutes(10);
        $msg = new MailMessage('dest@example.invalid', 'Subject Line', 'Message Body Payload');

        $captureId = $writer->captureProof($outboxId, $targetId, 'passenger_password_reset', $expires, $msg);

        $this->assertMatchesRegularExpression('/^cap_[0-9a-f]{32}$/', $captureId);
        $finalFile = $root . DIRECTORY_SEPARATOR . $captureId . '.json';
        $this->assertFileExists($finalFile);

        if (DIRECTORY_SEPARATOR === '/') {
            $this->assertSame(0600, fileperms($finalFile) & 0777);
        }

        $ledgerEntries = $ledger->loadLedger();
        $this->assertCount(1, $ledgerEntries);
        $this->assertSame($captureId, $ledgerEntries[0]['capture_id']);
        $this->assertSame('captured', $ledgerEntries[0]['state']);
    }

    public function testRawSyncFailureAbortsReservationAndPreservesLedger(): void
    {
        $root = $this->createRoot('codex_bound_4_');
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $writer = new LocalProofCaptureCoordinator($ledger, writeTimeoutSeconds: 2.0, simulateSyncFailure: true);

        $outboxId = '00000000-0000-4000-8000-000000000007';
        $targetId = '00000000-0000-4000-8000-000000000008';
        $expires = CarbonImmutable::now('UTC')->addMinutes(10);
        $msg = new MailMessage('dest@example.invalid', 'Subject Line', 'Message Body Payload');

        $failed = false;
        try {
            $writer->captureProof($outboxId, $targetId, 'passenger_password_reset', $expires, $msg);
        } catch (MailCaptureException) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Simulated sync failure did not trigger MailCaptureException.');

        $ledgerEntries = $ledger->loadLedger();
        $this->assertCount(1, $ledgerEntries);
        $this->assertSame('failed_cleanup', $ledgerEntries[0]['state']);
        $this->assertTrue($ledgerEntries[0]['revoked']);
    }

    public function testCleanupBatchBoundsAttemptedItemsAndDBReconciliationWithFairPagination(): void
    {
        $root = $this->createRoot('codex_bound_5_');
        $ledger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public function eraseCaptureFile(string $captureId): bool
            {
                return false; // failing erasure to test attempted batch bounds
            }
        };

        $now = CarbonImmutable::now('UTC');
        // Seed 120 expired entries
        for ($i = 0; $i < 120; $i++) {
            $capId = 'cap_' . str_pad(dechex($i + 1), 32, '0', STR_PAD_LEFT);
            $outboxId = sprintf('00000000-0000-4000-8000-%012x', $i + 1);
            $targetId = sprintf('00000000-0000-4000-9000-%012x', $i + 1);
            $ledger->reserveCapture($capId, $outboxId, $targetId, 'passenger_password_reset', $now->subMinutes(10));
            file_put_contents($root . DIRECTORY_SEPARATOR . $capId . '.json', '{}');
            $ledger->commitCapture($capId, $outboxId, $now->subMinutes(10));
        }

        $allEntries = $ledger->loadLedger();
        $this->assertCount(120, $allEntries);

        // 1. First cleanup with batchLimit 50: must attempt exactly 50 entries
        $cleaned1 = $ledger->cleanupExpired($now, batchLimit: 50);
        $this->assertSame(0, $cleaned1); // all erasures failed

        $after1 = $ledger->loadLedger();
        $this->assertCount(120, $after1);
        $attempted1 = array_filter($after1, static fn(array $e): bool => !empty($e['last_attempted_at']));
        $this->assertCount(50, $attempted1, 'Cleanup examined more or fewer than the bounded batch limit.');

        // 2. Second cleanup with batchLimit 50: fair subsequent pagination must examine the NEXT 50 entries
        $cleaned2 = $ledger->cleanupExpired($now, batchLimit: 50);
        $this->assertSame(0, $cleaned2);

        $after2 = $ledger->loadLedger();
        $attempted2 = array_filter($after2, static fn(array $e): bool => !empty($e['last_attempted_at']));
        $this->assertCount(100, $attempted2, 'Fair pagination failed to examine unattempted entries.');
    }

    public function testArbitraryDirectorySweepFailsClosedAndLeavesForeignFilesUntouched(): void
    {
        $root = $this->createRoot('codex_bound_6_');
        $foreignFile = $root . DIRECTORY_SEPARATOR . 'foreign_important_document.txt';
        file_put_contents($foreignFile, 'unauthorized deletion target');

        $retentionManager = new LocalCaptureRetentionManager();

        $rejected = false;
        try {
            $retentionManager->cleanupExpiredCaptures($root, maxAgeSeconds: 3600);
        } catch (DispatchException) {
            $rejected = true;
        }

        $this->assertTrue($rejected, 'cleanupExpiredCaptures did not fail closed.');
        $this->assertFileExists($foreignFile, 'Foreign file was deleted by arbitrary directory sweep.');
    }

    protected function tearDown(): void
    {
        foreach ($this->roots as $root) {
            $private = realpath(storage_path('app/private'));
            if ($private === false || dirname($root) !== $private || !str_starts_with(basename($root), 'codex_bound_')) {
                throw new \LogicException('Unsafe disposable cleanup target.');
            }
            foreach (scandir($root) ?: [] as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                $path = $root . '/' . $entry;
                if (is_file($path) || is_link($path)) unlink($path);
            }
            rmdir($root);
        }
        parent::tearDown();
    }
}
