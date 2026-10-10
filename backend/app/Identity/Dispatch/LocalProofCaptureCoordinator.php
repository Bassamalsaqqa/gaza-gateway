<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\MailMessage;
use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;

/**
 * Dedicated proof-aware local capture coordinator.
 *
 * Enforces:
 * - Mandatory secret-free reservation persisted in ledger BEFORE any raw bytes (or tempfiles) are written.
 * - Entire dedupe, reservation, I/O, and commit boundary protected under a bounded ledger lock.
 * - Server chooses capture identifier and temporary/final path identities immutably.
 * - Supervised direct PHP child process for raw filesystem writes with monotonic deadline and termination escalation.
 * - Parent termination of child precedes lock release or cleanup.
 * - Safe rollback / remnant tracking on any failure via ledger abort/commit.
 */
class LocalProofCaptureCoordinator
{
    public const float DEFAULT_WRITE_TIMEOUT = 2.0;

    private ?float $stallProbe = null;
    private bool $simulateSyncFailure = false;

    public function __construct(
        private readonly OwnedCaptureRetentionLedger $ledger,
        private readonly float $writeTimeoutSeconds = self::DEFAULT_WRITE_TIMEOUT,
        ?float $stallProbe = null,
        bool $simulateSyncFailure = false,
    ) {
        if (is_nan($writeTimeoutSeconds) || is_infinite($writeTimeoutSeconds) || $writeTimeoutSeconds < 0.001 || $writeTimeoutSeconds > 60.0) {
            throw new \InvalidArgumentException('Write timeout must be a finite positive number <= 60 seconds.');
        }

        if ($stallProbe !== null || $simulateSyncFailure) {
            if (getenv('APP_ENV') !== 'testing' || !app()->environment('testing')) {
                throw new \LogicException('Stall or failure injection is strictly forbidden in production.');
            }
            $db = $this->ledger->getConnection();
            if ($db === null || $db->selectOne('SELECT current_database() as d')->d !== 'gaza_gateway_test') {
                throw new \LogicException('Stall injection requires live testing database connection.');
            }
        }

        if ($stallProbe !== null && (!is_finite($stallProbe) || $stallProbe < 0 || $stallProbe > 5)) {
            throw new \InvalidArgumentException('Invalid test stall duration.');
        }

        $this->stallProbe = $stallProbe;
        $this->simulateSyncFailure = $simulateSyncFailure;
    }

    public function setStallProbe(?float $stallProbe): void
    {
        if ($stallProbe !== null) {
            if (getenv('APP_ENV') !== 'testing' || !app()->environment('testing')) {
                throw new \LogicException('Stall injection is strictly forbidden in production.');
            }
            $db = $this->ledger->getConnection();
            if ($db === null || $db->selectOne('SELECT current_database() as d')->d !== 'gaza_gateway_test') {
                throw new \LogicException('Stall injection requires live testing database connection.');
            }
        }
        if ($stallProbe !== null && (!is_finite($stallProbe) || $stallProbe < 0 || $stallProbe > 5)) {
            throw new \InvalidArgumentException('Invalid test stall duration.');
        }
        $this->stallProbe = $stallProbe;
    }

    public function getLedger(): OwnedCaptureRetentionLedger
    {
        return $this->ledger;
    }

    /**
     * Coordinate local proof capture under ledger lock with durable pre-write reservation.
     */
    public function captureProof(
        string $outboxId,
        string $targetId,
        string $purpose,
        CarbonImmutable $expiresAt,
        MailMessage $message,
    ): string {
        return $this->ledger->withLedgerLock(function () use ($outboxId, $targetId, $purpose, $expiresAt, $message) {
            // 1. Deduplication under lock
            if ($this->ledger->hasActiveCapture($outboxId)) {
                $existing = $this->ledger->getActiveCaptureId($outboxId);
                if ($existing !== null) {
                    return $existing;
                }
            }

            // 2. Server chooses capture ID
            $captureId = 'cap_' . bin2hex(random_bytes(16));

            // 3. Mandatory secret-free reservation persisted BEFORE any raw bytes/tempfiles are written
            $this->ledger->reserveCapture(
                captureId: $captureId,
                outboxId: $outboxId,
                targetId: $targetId,
                purpose: $purpose,
                expiresAt: $expiresAt,
            );

            // 4. Declare immutable paths
            $root = $this->ledger->getOwnedRoot();
            $tempPath = $root . DIRECTORY_SEPARATOR . $captureId . '.tmp';
            $finalPath = $root . DIRECTORY_SEPARATOR . $captureId . '.json';

            $payload = [
                'capture_id' => $captureId,
                'outbox_id' => $outboxId,
                'target_id' => $targetId,
                'purpose' => $purpose,
                'recipient' => $message->recipient,
                'subject' => $message->subject,
                'body' => $message->body,
                'expires_at' => $expiresAt->toRfc3339String(),
                'captured_at' => CarbonImmutable::now('UTC')->toRfc3339String(),
            ];

            $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

            $injectedStallMs = (int) (($this->stallProbe ?? 0) * 1000);

            $childInput = json_encode([
                'temp_path' => $tempPath,
                'final_path' => $finalPath,
                'payload_json' => $json,
                'injected_stall_ms' => $injectedStallMs,
                'simulate_sync_failure' => $this->simulateSyncFailure,
            ], JSON_THROW_ON_ERROR);
            if (strlen($childInput) > 65536) {
                $this->ledger->abortReservation($captureId);
                throw new MailCaptureException('Capture payload exceeds the bounded input size.');
            }

            $workerScript = __DIR__ . DIRECTORY_SEPARATOR . 'raw-capture-worker.php';
            $phpBinary = PHP_BINARY ?: 'php';

            $descriptors = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
                3 => $this->ledger->captureWorkerLockStream(),
            ];
            $pipes = [];
            $startMonotonic = hrtime(true);
            $deadlineNanos = (int) ($this->writeTimeoutSeconds * 1e9);
            $process = @proc_open([$phpBinary, $workerScript], $descriptors, $pipes, dirname($workerScript));
            if (!is_resource($process)) {
                $this->ledger->abortReservation($captureId);
                throw new MailCaptureException('Failed to spawn supervised capture worker process.');
            }

            stream_set_blocking($pipes[0], false);
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);
            $inputOffset = 0;
            $inputOpen = true;
            $stdoutBuffer = '';
            $stderrBuffer = '';
            $success = false;
            $timedOut = false;

            while (true) {
                $nowMonotonic = hrtime(true);
                $elapsedNanos = $nowMonotonic - $startMonotonic;
                if ($elapsedNanos >= $deadlineNanos) {
                    $timedOut = true;
                    break;
                }

                if ($inputOpen) {
                    $written = @fwrite($pipes[0], substr($childInput, $inputOffset, 8192));
                    if ($written === false) { break; }
                    $inputOffset += $written;
                    if ($inputOffset === strlen($childInput)) {
                        fclose($pipes[0]);
                        $inputOpen = false;
                    }
                }

                $read = [$pipes[1], $pipes[2]];
                $write = null;
                $except = null;
                $remainingNanos = $deadlineNanos - $elapsedNanos;
                $timeoutMicros = (int) min(5000, max(500, $remainingNanos / 1000));

                $ready = @stream_select($read, $write, $except, 0, $timeoutMicros);
                if ($ready !== false && $ready > 0) {
                    foreach ($read as $stream) {
                        $chunk = @fread($stream, 8192);
                        if ($chunk !== false && $chunk !== '') {
                            if ($stream === $pipes[1]) {
                                $stdoutBuffer .= $chunk;
                            } else {
                                $stderrBuffer .= $chunk;
                            }
                        }
                    }
                }

                if (strlen($stdoutBuffer) > 4096 || strlen($stderrBuffer) > 4096) {
                    break;
                }

                $status = proc_get_status($process);
                if (!$status['running']) {
                    $stdoutBuffer .= (string) stream_get_contents($pipes[1], 4097);
                    $stderrBuffer .= (string) stream_get_contents($pipes[2], 4097);
                    if ($status['exitcode'] === 0 && strlen($stdoutBuffer) <= 4096 && strlen($stderrBuffer) <= 4096) {
                        $decoded = json_decode($stdoutBuffer, true);
                        if (is_array($decoded) && ($decoded['status'] ?? null) === 'ok') {
                            $success = true;
                        }
                    }
                    break;
                }
            }

            // If timed out or execution failed: terminate child process
            if (!$success) {
                $status = proc_get_status($process);
                if ($status['running']) {
                    $sigterm = defined('SIGTERM') ? SIGTERM : 15;
                    @proc_terminate($process, $sigterm);

                    $termWait = hrtime(true);
                    while ((hrtime(true) - $termWait) < 15_000_000) {
                        usleep(1000);
                        $status = proc_get_status($process);
                        if (!$status['running']) {
                            break;
                        }
                    }

                    if ($status['running']) {
                        $sigkill = defined('SIGKILL') ? SIGKILL : 9;
                        @proc_terminate($process, $sigkill);
                        $killWait = hrtime(true);
                        do {
                            usleep(1000);
                            $status = proc_get_status($process);
                        } while ($status['running'] && hrtime(true) - $killWait < 50_000_000);
                    }
                }
            }

            if ($inputOpen) { fclose($pipes[0]); }
            fclose($pipes[1]);
            fclose($pipes[2]);
            $status = proc_get_status($process);
            if ($status['running']) {
                // Uninterruptible kernel I/O is outside the wall-clock guarantee.
                // Keep the durable reservation; never assert successful termination or erase its files.
                $this->ledger->retainLockUntilChildExit();
                throw new MailCaptureException('Capture worker termination could not be verified.');
            }
            @proc_close($process);

            // Parent verifies child termination precedes releasing reservation lock and cleanup
            if (!$success) {
                if (file_exists($tempPath)) {
                    @unlink($tempPath);
                }
                $this->ledger->abortReservation($captureId);
                if ($timedOut) {
                    throw new MailCaptureException('Raw capture write exceeded bounded execution deadline.');
                }
                throw new MailCaptureException('Failed to write local proof capture.');
            }

            // 5. Commit reservation in ledger
            $this->ledger->commitCapture($captureId, $outboxId);

            return $captureId;
        });
    }
}
