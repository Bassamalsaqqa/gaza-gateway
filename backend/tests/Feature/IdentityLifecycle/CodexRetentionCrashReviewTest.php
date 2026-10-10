<?php
declare(strict_types=1);

namespace App\Identity\Dispatch {
    function fsync($stream): bool {
        return !empty($GLOBALS['codex_retention_fsync_failure']) ? false : \fsync($stream);
    }
}

namespace Tests\CodexReview {
    use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
    use App\Identity\Dispatch\Exceptions\DispatchException;
    use Carbon\CarbonImmutable;
    use Illuminate\Support\Facades\DB;
    use Tests\TestCase;

    final class CodexRetentionCrashReviewTest extends TestCase {
        private array $roots = [];

        private function ledger(): OwnedCaptureRetentionLedger {
            $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_crash_', DB::connection());
            $this->roots[] = $root;
            config(['foundation-services.mail.local_path' => $root]);
            return new OwnedCaptureRetentionLedger($root, DB::connection());
        }

        private function reserve(OwnedCaptureRetentionLedger $ledger, CarbonImmutable $expires): string {
            $id = 'cap_' . str_repeat('e', 32);
            $ledger->reserveCapture($id, '00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $expires);
            return $id;
        }

        public function testFailedReservationSyncCannotAuthorizeRawCapture(): void {
            $ledger = $this->ledger();
            $rejected = false;
            $GLOBALS['codex_retention_fsync_failure'] = true;
            try {
                $this->reserve($ledger, CarbonImmutable::now('UTC')->addMinutes(10));
            } catch (DispatchException) {
                $rejected = true;
            } finally {
                $GLOBALS['codex_retention_fsync_failure'] = false;
            }
            $this->assertTrue($rejected, 'A failed reservation fsync was silently accepted.');
        }

        public function testCrashTemporaryRemnantCannotLoseItsReservation(): void {
            $ledger = $this->ledger();
            $expiry = CarbonImmutable::now('UTC')->addMinute();
            $id = $this->reserve($ledger, $expiry);
            $temp = $ledger->getOwnedRoot() . '/' . $id . '.tmp';
            file_put_contents($temp, 'synthetic-proof-remnant');
            $this->assertCount(1, $ledger->loadLedger());
            $ledger->cleanupExpired($expiry->addSecond(), 1);
            $tracked = array_filter($ledger->loadLedger(), static fn(array $entry): bool => $entry['capture_id'] === $id);
            $this->assertTrue(!file_exists($temp) || count($tracked) === 1,
                'Cleanup dropped a reservation while its raw temporary file survived.');
        }

        public function testInsecureExistingOwnedRootIsRejectedWithoutChmod(): void {
            $ledger = $this->ledger();
            $root = $ledger->getOwnedRoot();
            chmod($root, 0755);
            $rejected = false;
            try { new OwnedCaptureRetentionLedger($root, DB::connection()); }
            catch (DispatchException) { $rejected = true; }
            clearstatcache(true, $root);
            $this->assertTrue($rejected, 'Existing world-readable capture root was accepted.');
            $this->assertSame(0755, fileperms($root) & 0777, 'Rejection silently altered an existing directory.');
        }

        public function testTempAndFinalSimultaneousDeletionFailureRetainsReservationAndRetries(): void {
            $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_crash_simul_', DB::connection());
            $this->roots[] = $root;
            config(['foundation-services.mail.local_path' => $root]);

            $failErasure = true;
            $ledger = new class($root, DB::connection(), $failErasure) extends OwnedCaptureRetentionLedger {
                public function __construct(string $root, $db, private bool &$fail) {
                    parent::__construct($root, $db);
                }
                public function eraseCaptureFile(string $captureId): bool {
                    return $this->fail ? false : parent::eraseCaptureFile($captureId);
                }
            };

            $expiry = CarbonImmutable::now('UTC')->addMinute();
            $id = $this->reserve($ledger, $expiry);
            $temp = $root . '/' . $id . '.tmp';
            $final = $root . '/' . $id . '.json';
            file_put_contents($temp, 'raw-temp-remnant');
            file_put_contents($final, 'raw-final-remnant');

            // 1. Initial cleanup attempt where deletion fails
            $cleaned = $ledger->cleanupExpired($expiry->addSecond(), 1);
            $this->assertSame(0, $cleaned);
            $tracked = array_filter($ledger->loadLedger(), static fn(array $e): bool => $e['capture_id'] === $id);
            $this->assertCount(1, $tracked, 'Reservation was dropped despite deletion failure.');
            $this->assertSame('failed_cleanup', reset($tracked)['state']);

            // 2. Retry cleanup attempt where deletion succeeds
            $failErasure = false;
            $cleanedRetry = $ledger->cleanupExpired($expiry->addSecond(), 1);
            $this->assertSame(1, $cleanedRetry);
            $trackedRetry = array_filter($ledger->loadLedger(), static fn(array $e): bool => $e['capture_id'] === $id);
            $this->assertCount(0, $trackedRetry, 'Reservation was not cleared after successful retry.');
            $this->assertFileDoesNotExist($temp);
            $this->assertFileDoesNotExist($final);
        }

        public function testInjectedStallWithBoundedTerminationAndRetainedReservation(): void {
            $ledger = $this->ledger();
            $expiry = CarbonImmutable::now('UTC')->addMinute();
            $outboxId = '00000000-0000-4000-8000-000000000001';
            $targetId = '00000000-0000-4000-8000-000000000002';
            $msg = new \App\Contracts\Mail\MailMessage('dest@example.com', 'Subj', 'Body');

            $coordinator = new \App\Identity\Dispatch\LocalProofCaptureCoordinator(
                $ledger,
                writeTimeoutSeconds: 0.05,
                stallProbe: 0.07
            );

            $startTime = microtime(true);
            $timedOut = false;
            try {
                $coordinator->captureProof($outboxId, $targetId, 'passenger_password_reset', $expiry, $msg);
            } catch (\App\Contracts\Mail\Exceptions\MailCaptureException $e) {
                $timedOut = true;
            }
            $elapsed = microtime(true) - $startTime;

            $this->assertTrue($timedOut, 'Injected write stall did not throw MailCaptureException.');
            $this->assertLessThan(1.5, $elapsed, 'Raw writer execution was not bounded.');

            // Verify reservation was created and accounted for in ledger
            $entries = $ledger->loadLedger();
            $this->assertNotEmpty($entries, 'Reservation was completely lost after stalled write.');
        }

        public function testDisposableTestRootRejectsTraversalAndForeignMarker(): void {
            // Traversal prefix rejected
            $rejectedTraversal = false;
            try {
                OwnedCaptureRetentionLedger::createDisposableTestRoot('../traversal_', DB::connection());
            } catch (DispatchException) {
                $rejectedTraversal = true;
            }
            $this->assertTrue($rejectedTraversal, 'Traversal prefix in createDisposableTestRoot was accepted.');

            // Foreign marker rejected
            $private = realpath(storage_path('app/private'));
            $foreignDir = $private . '/codex_crash_foreign_' . bin2hex(random_bytes(8));
            $this->roots[] = $foreignDir;
            mkdir($foreignDir, 0700);
            file_put_contents($foreignDir . '/' . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER, 'foreign_unauthorized_content');

            $rejectedMarker = false;
            try {
                new OwnedCaptureRetentionLedger($foreignDir, DB::connection());
            } catch (DispatchException) {
                $rejectedMarker = true;
            }
            $this->assertTrue($rejectedMarker, 'Foreign capability marker was accepted.');
        }

        protected function tearDown(): void {
            $GLOBALS['codex_retention_fsync_failure'] = false;
            foreach ($this->roots as $root) {
                $private = realpath(storage_path('app/private'));
                if ($private === false || dirname($root) !== $private || !str_starts_with(basename($root), 'codex_crash_')) {
                    throw new \LogicException('Refusing cleanup outside the exact created disposable root.');
                }
                foreach (scandir($root) ?: [] as $name) {
                    if ($name === '.' || $name === '..') continue;
                    $file = $root . '/' . $name;
                    if (is_file($file) || is_link($file)) unlink($file);
                }
                rmdir($root);
            }
            parent::tearDown();
        }
    }
}
