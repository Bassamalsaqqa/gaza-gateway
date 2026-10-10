<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

/**
 * Secret-free private ledger for tracking local mail capture retention
 * bound to authoritative proof and challenge deadlines.
 *
 * Enforces:
 * - Confined strictly to configured owned sink directory (0700 dir, 0600 files).
 * - Rejects system roots, foreign parents, and symlink ancestors before creation/chmod.
 * - Rejects symlink and hardlink capture targets.
 * - Interprocess file lock with bounded wait for atomic read-modify-write.
 * - Records stable outbox/proof binding and original absolute deadline in a secret-free private ledger.
 * - Mandatory durable secret-free reservation before any raw proof bytes or tempfiles are written.
 * - Cleans up local capture JSON files and ledger metadata at original deadline (e.g. 10m OTP, 30m reset).
 * - Deduplicates repeated local captures of the same dispatch and preserves original deadline (no extension).
 * - Reconciles revocation and deadline against authoritative PostgreSQL state during cleanup.
 * - Fails closed on malformed ledger data, unknown keys, duplicate IDs, and invalid scalar types.
 * - Bounds encoded ledger bytes on write and read (512 KiB, 500 entries).
 * - Retains metadata entries on unlink failures for subsequent retry (double-deletion tracking).
 */
class OwnedCaptureRetentionLedger
{
    public const string LEDGER_FILENAME = '.dispatch_ledger.json';
    public const string LOCK_FILENAME = '.dispatch_ledger.lock';
    public const string OWNED_TEST_MARKER = '.gza_owned_test_root_marker';
    public const string FILE_PATTERN = '/^cap_[0-9a-f]{32}\.json$/';
    public const int MAX_LEDGER_BYTES = 524288; // 512 KiB bound
    public const int MAX_LEDGER_ENTRIES = 500;  // 500 entry limit

    public const array ALLOWED_ENTRY_KEYS = [
        'capture_id',
        'outbox_id',
        'target_id',
        'purpose',
        'expires_at',
        'captured_at',
        'revoked',
        'state',
        'updated_at',
        'last_attempted_at',
    ];

    public const array REQUIRED_ENTRY_KEYS = [
        'capture_id',
        'outbox_id',
        'target_id',
        'purpose',
        'expires_at',
        'captured_at',
        'revoked',
    ];

    public const array ALLOWED_STATES = [
        'reserved',
        'captured',
        'failed_cleanup',
        'revoked',
    ];

    public const array ALLOWED_PURPOSES = [
        'passenger_email_verification',
        'passenger_password_reset',
        'staff_invitation',
        'staff_password_reset',
        'booking_guest_challenge',
        'manage_booking',
        'claim_booking',
    ];

    private readonly string $ownedRoot;

    public function __construct(
        string $ownedRootDirectory,
        private readonly ?ConnectionInterface $db = null,
    ) {
        $resolved = $this->validateAndResolveRoot($ownedRootDirectory);
        $this->ownedRoot = $resolved;
    }

    public function getOwnedRoot(): string
    {
        return $this->ownedRoot;
    }

    public function getConnection(): ?ConnectionInterface
    {
        return $this->db;
    }

    private function getLedgerPath(): string
    {
        return $this->ownedRoot . DIRECTORY_SEPARATOR . self::LEDGER_FILENAME;
    }

    private function getLockPath(): string
    {
        return $this->ownedRoot . DIRECTORY_SEPARATOR . self::LOCK_FILENAME;
    }

    /**
     * Create an explicit server-controlled disposable test root with owned capability marker.
     */
    public static function createDisposableTestRoot(string $prefix = 'codex_retention_', ?ConnectionInterface $db = null): string
    {
        $isTesting = (getenv('APP_ENV') === 'testing' && function_exists('app') && app()->environment('testing'));
        if (!$isTesting) {
            throw new DispatchException('Disposable test roots are only permitted in testing environment.');
        }

        if (!preg_match('/^[a-zA-Z0-9_]{1,32}$/', $prefix) || basename($prefix) !== $prefix || str_contains($prefix, '.') || str_contains($prefix, '/') || str_contains($prefix, '\\')) {
            throw new DispatchException('Invalid disposable test root prefix.');
        }

        if (!str_starts_with($prefix, 'test_') && !str_starts_with($prefix, 'codex_') && !str_starts_with($prefix, 'disposable_')) {
            throw new DispatchException('Prefix must begin with test_, codex_, or disposable_.');
        }

        $targetDb = $db;
        if ($targetDb === null && function_exists('app') && app()->bound('db')) {
            try {
                $targetDb = \Illuminate\Support\Facades\DB::connection();
            } catch (\Throwable) {}
        }

        if ($targetDb === null) {
            throw new DispatchException('Disposable test roots require a resolved live database connection.');
        }

        try {
            $row = $targetDb->selectOne('SELECT current_database() AS db');
            if ((string) ($row?->db ?? '') !== 'gaza_gateway_test') {
                throw new DispatchException('Disposable test roots require live database gaza_gateway_test.');
            }
        } catch (DispatchException $e) {
            throw $e;
        } catch (\Throwable) {
            throw new DispatchException('Failed to verify live database for disposable test root.');
        }

        $rawPrivate = storage_path('app/private');
        if (!is_dir($rawPrivate)) {
            @mkdir($rawPrivate, 0700, false);
        }
        $canonicalPrivate = realpath($rawPrivate);
        if ($canonicalPrivate === false || !is_dir($canonicalPrivate) || is_link($canonicalPrivate)) {
            throw new DispatchException('Private storage parent directory does not exist or is a symlink.');
        }
        if (DIRECTORY_SEPARATOR === '/') {
            $pstat = @lstat($canonicalPrivate);
            if ($pstat === false || ($pstat['mode'] & 0777) !== 0700 ||
                (function_exists('posix_geteuid') && ($pstat['uid'] ?? -1) !== posix_geteuid())) {
                throw new DispatchException('Private storage parent must be mode 0700 and privately owned.');
            }
        }

        $root = $canonicalPrivate . DIRECTORY_SEPARATOR . $prefix . bin2hex(random_bytes(8));
        if (file_exists($root) || is_link($root)) {
            throw new DispatchException('Disposable test root already exists.');
        }

        $created = @mkdir($root, 0700, false);
        if (!$created && !is_dir($root)) {
            throw new DispatchException('Failed to create disposable test root directory.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            @chmod($root, 0700);
            $rstat = @lstat($root);
            if ($rstat === false || ($rstat['mode'] & 0777) !== 0700 ||
                (function_exists('posix_geteuid') && ($rstat['uid'] ?? -1) !== posix_geteuid())) {
                @rmdir($root);
                throw new DispatchException('Disposable test root directory permissions invalid.');
            }
        }

        $markerPath = $root . DIRECTORY_SEPARATOR . self::OWNED_TEST_MARKER;
        $markerContent = "gza_test_owned_marker_v1\n";
        $oldMask = umask(0077);
        try {
            $mfp = @fopen($markerPath, 'xb');
        } finally {
            umask($oldMask);
        }
        if ($mfp === false) {
            @rmdir($root);
            throw new DispatchException('Failed to create disposable test root capability marker.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            @chmod($markerPath, 0600);
        }

        $mwritten = @fwrite($mfp, $markerContent);
        if ($mwritten === false || $mwritten !== strlen($markerContent)) {
            @fclose($mfp);
            @unlink($markerPath);
            @rmdir($root);
            throw new DispatchException('Failed to write disposable test root capability marker completely.');
        }

        if (!fflush($mfp) || !function_exists('fsync') || !fsync($mfp) || !fclose($mfp)) {
            @unlink($markerPath);
            @rmdir($root);
            throw new DispatchException('Failed to sync disposable test root capability marker.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            @chmod($markerPath, 0600);
        }

        $real = realpath($root);
        if ($real === false || is_link($real)) {
            throw new DispatchException('Failed to resolve disposable test root path.');
        }

        return $real;
    }

    private int $lockDepth = 0;
    private mixed $activeLockFp = null;
    private bool $retainChildLock = false;

    /** Internal process boundary: inherit the currently held open-file description. */
    public function captureWorkerLockStream(): mixed
    {
        if ($this->lockDepth < 1 || !is_resource($this->activeLockFp)) {
            throw new DispatchException('Capture worker requires the active retention lock.');
        }
        return $this->activeLockFp;
    }

    public function retainLockUntilChildExit(): void
    {
        $this->captureWorkerLockStream();
        $this->retainChildLock = true;
    }

    /**
     * Execute an operation under a stable interprocess file lock with bounded wait.
     * Supports re-entrant acquisition by the same object instance.
     */
    public function withLedgerLock(callable $operation, float $timeoutSeconds = 5.0): mixed
    {
        if ($this->lockDepth > 0 && $this->activeLockFp !== null) {
            $this->lockDepth++;
            try {
                return $operation();
            } finally {
                $this->lockDepth--;
            }
        }

        $boundedTimeout = min(max($timeoutSeconds, 0.1), 10.0);
        $lockPath = $this->getLockPath();

        // Check is_link FIRST: detects both dangling and valid symlinks before fopen creates anything
        if (is_link($lockPath)) {
            throw new DispatchException('Symlink lockfile target rejected.');
        }

        if (file_exists($lockPath)) {
            $stat = @stat($lockPath);
            if ($stat !== false && isset($stat['nlink']) && $stat['nlink'] > 1) {
                throw new DispatchException('Hardlink lockfile target rejected.');
            }
        }

        $fp = @fopen($lockPath, 'c+');
        if ($fp === false) {
            throw new DispatchException('Failed to open retention ledger lock file.');
        }

        if (is_link($lockPath)) {
            fclose($fp);
            throw new DispatchException('Symlink lockfile target rejected.');
        }

        $fstat = @fstat($fp);
        if ($fstat !== false && isset($fstat['nlink']) && $fstat['nlink'] > 1) {
            fclose($fp);
            throw new DispatchException('Hardlink lockfile target rejected.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            @chmod($lockPath, 0600);
        }

        $start = microtime(true);
        $locked = false;
        while ((microtime(true) - $start) < $boundedTimeout) {
            if (flock($fp, LOCK_EX | LOCK_NB)) {
                $locked = true;
                break;
            }
            usleep(10000); // 10ms
        }

        if (!$locked) {
            fclose($fp);
            throw new DispatchException('Timed out acquiring retention ledger interprocess lock.');
        }

        $this->activeLockFp = $fp;
        $this->lockDepth = 1;
        $this->retainChildLock = false;

        try {
            return $operation();
        } finally {
            $this->lockDepth = 0;
            $this->activeLockFp = null;
            if (!$this->retainChildLock) { flock($fp, LOCK_UN); }
            fclose($fp);
        }
    }

    /**
     * Parse and strictly validate an RFC 3339 timestamp with calendar date checking.
     */
    public static function parseStrictRfc3339(string $timestamp): CarbonImmutable
    {
        if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/', $timestamp, $matches)) {
            throw new DispatchException('Timestamp is not strict RFC 3339 format.');
        }

        $year = (int) $matches[1];
        $month = (int) $matches[2];
        $day = (int) $matches[3];

        if (!checkdate($month, $day, $year)) {
            throw new DispatchException('Timestamp has invalid calendar date.');
        }

        try {
            return CarbonImmutable::parse($timestamp);
        } catch (\Throwable) {
            throw new DispatchException('Failed to parse RFC 3339 timestamp.');
        }
    }

    /**
     * Durably reserve capture metadata BEFORE any raw proof bytes or tempfiles are written.
     */
    public function reserveCapture(
        string $captureId,
        string $outboxId,
        string $targetId,
        string $purpose,
        CarbonImmutable $expiresAt,
        ?CarbonImmutable $reservedAt = null,
    ): void {
        if (!preg_match('/^cap_[0-9a-f]{32}$/', $captureId)) {
            throw new DispatchException('Invalid capture identifier format.');
        }
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $outboxId)) {
            throw new DispatchException('Invalid outbox identifier format.');
        }
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $targetId)) {
            throw new DispatchException('Invalid target identifier format.');
        }
        if (!in_array($purpose, self::ALLOWED_PURPOSES, true)) {
            throw new DispatchException('Invalid capture purpose.');
        }

        $now = $reservedAt ?? CarbonImmutable::now('UTC');

        $this->withLedgerLock(function () use ($captureId, $outboxId, $targetId, $purpose, $expiresAt, $now) {
            $ledger = $this->loadLedger();

            // Check if capture_id already exists
            foreach ($ledger as $entry) {
                if ($entry['capture_id'] === $captureId) {
                    throw new DispatchException('Duplicate capture identifier in ledger.');
                }
            }

            // Check if existing entry for outbox_id attempts deadline extension
            $effectiveExpiry = $expiresAt;
            foreach ($ledger as $entry) {
                if ($entry['outbox_id'] === $outboxId) {
                    $existingExpiry = self::parseStrictRfc3339($entry['expires_at']);
                    if ($expiresAt->greaterThan($existingExpiry)) {
                        throw new DispatchException('Capture deadline extension rejected for existing dispatch.');
                    }
                    if ($existingExpiry->lessThan($effectiveExpiry)) {
                        $effectiveExpiry = $existingExpiry;
                    }
                }
            }

            $ledger[] = [
                'capture_id' => $captureId,
                'outbox_id' => $outboxId,
                'target_id' => $targetId,
                'purpose' => $purpose,
                'expires_at' => $effectiveExpiry->toRfc3339String(),
                'captured_at' => $now->toRfc3339String(),
                'revoked' => false,
                'state' => 'reserved',
                'updated_at' => $now->toRfc3339String(),
            ];

            $this->saveLedger($ledger);
        });
    }

    /**
     * Commit a previously reserved capture after raw bytes are safely written and fsynced.
     */
    public function commitCapture(
        string $captureId,
        string $outboxId,
        ?CarbonImmutable $committedAt = null,
    ): void {
        $now = $committedAt ?? CarbonImmutable::now('UTC');

        $this->withLedgerLock(function () use ($captureId, $outboxId, $now) {
            $ledger = $this->loadLedger();
            $targetIndex = null;

            foreach ($ledger as $idx => $entry) {
                if ($entry['capture_id'] === $captureId) {
                    $targetIndex = $idx;
                    break;
                }
            }

            if ($targetIndex === null) {
                throw new DispatchException('Reservation not found for commit.');
            }

            // Handle any superseded prior captures for this outbox
            $newLedger = [];
            foreach ($ledger as $idx => $entry) {
                if ($idx === $targetIndex) {
                    $entry['state'] = 'captured';
                    $entry['updated_at'] = $now->toRfc3339String();
                    $newLedger[] = $entry;
                    continue;
                }

                if ($entry['outbox_id'] === $outboxId && $entry['capture_id'] !== $captureId) {
                    // Superseded prior capture: try to erase its raw files (both temp and final)
                    $erased = $this->eraseCaptureRemnants((string) $entry['capture_id']);
                    if (!$erased) {
                        // Unlink failed: MUST retain entry in ledger at original deadline!
                        $entry['state'] = 'failed_cleanup';
                        $entry['revoked'] = true;
                        $entry['updated_at'] = $now->toRfc3339String();
                        $newLedger[] = $entry;

                        // Also mark the new reservation as failed_cleanup because commit failed
                        foreach ($ledger as $idx2 => $entry2) {
                            if ($idx2 === $targetIndex) {
                                $entry2['state'] = 'failed_cleanup';
                                $entry2['revoked'] = true;
                                $entry2['updated_at'] = $now->toRfc3339String();
                                $newLedger[] = $entry2;
                                break;
                            }
                        }
                        $this->saveLedger($newLedger);
                        // Attempt to clean up new file remnants as well (if this also fails -> double unlink failure!)
                        $this->eraseCaptureRemnants($captureId);
                        throw new DispatchException('Failed to erase superseded capture file; preserved existing ledger record.');
                    }
                    // Files erased successfully, drop from ledger
                    continue;
                }

                $newLedger[] = $entry;
            }

            $this->saveLedger($newLedger);
            $this->secureCaptureFile($captureId);
        });
    }

    /**
     * Abort a reservation if writing raw bytes failed.
     */
    public function abortReservation(string $captureId): void
    {
        $this->withLedgerLock(function () use ($captureId) {
            $ledger = $this->loadLedger();
            $this->eraseCaptureRemnants($captureId);

            $newLedger = [];
            foreach ($ledger as $entry) {
                if ($entry['capture_id'] === $captureId) {
                    // commit/write/abort failures keep reservations:
                    // retain entry marked failed_cleanup until authoritative deadline cleanup
                    $entry['state'] = 'failed_cleanup';
                    $entry['revoked'] = true;
                    $entry['updated_at'] = CarbonImmutable::now('UTC')->toRfc3339String();
                    $newLedger[] = $entry;
                    continue;
                }
                $newLedger[] = $entry;
            }

            $this->saveLedger($newLedger);
        });
    }

    /**
     * Compatibility wrapper: commit a previously reserved capture entry.
     * Enforces mandatory pre-write reservation policy: rejects any unreserved capture.
     */
    public function recordCapture(
        string $captureId,
        string $outboxId,
        string $targetId,
        string $purpose,
        CarbonImmutable $expiresAt,
        ?CarbonImmutable $capturedAt = null,
    ): void {
        $this->withLedgerLock(function () use ($captureId, $outboxId, $targetId, $purpose, $expiresAt, $capturedAt) {
            $ledger = $this->loadLedger();
            $reserved = false;
            foreach ($ledger as $entry) {
                if ($entry['capture_id'] === $captureId && ($entry['state'] ?? '') === 'reserved') {
                    if ($entry['outbox_id'] !== $outboxId || $entry['target_id'] !== $targetId
                        || $entry['purpose'] !== $purpose
                        || $expiresAt->greaterThan(self::parseStrictRfc3339($entry['expires_at']))) {
                        throw new DispatchException('Capture reservation binding mismatch.');
                    }
                    $reserved = true;
                    break;
                }
            }
            if (!$reserved) {
                throw new DispatchException('Unreserved capture rejected: mandatory pre-write reservation required.');
            }
            $this->commitCapture($captureId, $outboxId, $capturedAt);
        });
    }

    /**
     * Check if an active, unexpired, non-revoked capture file already exists for outbox ID.
     */
    public function hasActiveCapture(string $outboxId, ?CarbonImmutable $now = null): bool
    {
        $currentTime = $now ?? CarbonImmutable::now('UTC');
        $ledger = $this->loadLedger();

        foreach ($ledger as $entry) {
            if ($entry['outbox_id'] === $outboxId) {
                if (!empty($entry['revoked'])) {
                    continue;
                }
                if (isset($entry['state']) && $entry['state'] !== 'captured') {
                    continue;
                }
                $expiresAt = self::parseStrictRfc3339($entry['expires_at']);
                if ($currentTime->greaterThanOrEqualTo($expiresAt)) {
                    continue;
                }
                $filename = $entry['capture_id'] . '.json';
                $filePath = $this->ownedRoot . DIRECTORY_SEPARATOR . $filename;
                if (file_exists($filePath) && is_file($filePath) && !is_link($filePath)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Retrieve active capture ID for an outbox ID.
     */
    public function getActiveCaptureId(string $outboxId): ?string
    {
        $ledger = $this->loadLedger();
        foreach ($ledger as $entry) {
            if ($entry['outbox_id'] === $outboxId && empty($entry['revoked']) && (!isset($entry['state']) || $entry['state'] === 'captured')) {
                return (string) $entry['capture_id'];
            }
        }
        return null;
    }

    /**
     * Erase a single owned raw capture JSON file securely.
     * Rejects symlinks and hardlinks.
     */
    public function eraseCaptureFile(string $captureId): bool
    {
        if (!preg_match('/^cap_[0-9a-f]{32}$/', $captureId)) {
            return false;
        }

        $filePath = $this->ownedRoot . DIRECTORY_SEPARATOR . $captureId . '.json';
        if (is_link($filePath)) {
            throw new DispatchException('Symlink capture target rejected.');
        }

        if (!file_exists($filePath)) {
            return true;
        }

        $stat = @lstat($filePath);
        if ($stat === false || !is_file($filePath) || (isset($stat['nlink']) && $stat['nlink'] > 1)) {
            throw new DispatchException('Invalid capture target inode or hardlink rejected.');
        }

        return @unlink($filePath);
    }

    /** Both immutable raw paths are covered by the same pre-write reservation. */
    public function eraseCaptureRemnants(string $captureId): bool
    {
        if (!preg_match('/^cap_[0-9a-f]{32}$/D', $captureId)) {
            return false;
        }
        $finalAbsent = $this->eraseCaptureFile($captureId);
        $tempPath = $this->ownedRoot . DIRECTORY_SEPARATOR . $captureId . '.tmp';
        if (is_link($tempPath)) {
            throw new DispatchException('Symlink temporary capture target rejected.');
        }
        if (!file_exists($tempPath)) {
            return $finalAbsent;
        }
        $stat = @lstat($tempPath);
        if ($stat === false || !is_file($tempPath) || ($stat['nlink'] ?? 0) !== 1) {
            throw new DispatchException('Invalid temporary capture inode.');
        }
        $tempAbsent = @unlink($tempPath);
        return $finalAbsent && $tempAbsent;
    }

    /**
     * Mark captures associated with a target proof or challenge as revoked.
     */
    public function markRevoked(string $targetId, ?CarbonImmutable $now = null): int
    {
        return $this->withLedgerLock(function () use ($targetId, $now) {
            $currentTime = $now ?? CarbonImmutable::now('UTC');
            $ledger = $this->loadLedger();
            $revokedCount = 0;

            foreach ($ledger as $idx => $entry) {
                if ($entry['target_id'] === $targetId && empty($entry['revoked'])) {
                    $ledger[$idx]['revoked'] = true;
                    $ledger[$idx]['state'] = 'revoked';
                    $ledger[$idx]['updated_at'] = $currentTime->toRfc3339String();
                    $erased = $this->eraseCaptureRemnants((string) $entry['capture_id']);
                    if (!$erased) {
                        $ledger[$idx]['state'] = 'failed_cleanup';
                    }
                    $revokedCount++;
                }
            }

            if ($revokedCount > 0) {
                $this->saveLedger($ledger);
            }

            return $revokedCount;
        });
    }

    /**
     * Cleanup expired or revoked capture files at their authoritative deadline under lock.
     * Reconciles actual current database status (revocation, scrub, consumption, expiry).
     * Retains metadata entries if unlink fails for retry.
     */
    public function cleanupExpired(
        ?CarbonImmutable $now = null,
        int $batchLimit = 100,
        ?ConnectionInterface $conn = null,
    ): int {
        return $this->withLedgerLock(function () use ($now, $batchLimit, $conn) {
            $maxAttempts = min(max($batchLimit, 1), 100);
            $currentTime = $now ?? CarbonImmutable::now('UTC');
            $ledger = $this->loadLedger();
            if (empty($ledger)) {
                return 0;
            }

            $targetDb = $conn ?? $this->db;
            $cleaned = 0;

            // Fair subsequent pagination / round-robin:
            // Entries track 'last_attempted_at' (or null if never attempted).
            // Sort candidate indices by (last_attempted_at ASC, expires_at ASC)
            // so entries that have never been attempted, or were attempted longest ago,
            // are examined first. This bounds attempts to at most $maxAttempts and avoids starvation.
            $indices = array_keys($ledger);
            usort($indices, function ($a, $b) use ($ledger) {
                $timeA = $ledger[$a]['last_attempted_at'] ?? '';
                $timeB = $ledger[$b]['last_attempted_at'] ?? '';
                if ($timeA !== $timeB) {
                    return $timeA <=> $timeB;
                }
                return ($ledger[$a]['expires_at'] ?? '') <=> ($ledger[$b]['expires_at'] ?? '');
            });

            $candidatesToExamine = array_slice($indices, 0, $maxAttempts);
            $toRemove = [];

            foreach ($candidatesToExamine as $idx) {
                $entry = &$ledger[$idx];

                $isExpired = $currentTime->greaterThanOrEqualTo(self::parseStrictRfc3339($entry['expires_at']));
                $isRevoked = !empty($entry['revoked']) || (isset($entry['state']) && in_array($entry['state'], ['revoked', 'failed_cleanup'], true));
                $isReserved = (isset($entry['state']) && $entry['state'] === 'reserved');

                // Reconcile authoritative state against database if connection available
                if ($targetDb !== null && !$isExpired && !$isRevoked && !$isReserved) {
                    $outboxRow = $targetDb->table('security_dispatch_outbox')
                        ->where('id', $entry['outbox_id'])
                        ->first(['status', 'scrubbed_at', 'expires_at']);

                    if (!$outboxRow || in_array($outboxRow->status, ['scrubbed', 'expired'], true) || $outboxRow->scrubbed_at !== null) {
                        $isRevoked = true;
                    } elseif ($currentTime->greaterThanOrEqualTo(CarbonImmutable::parse($outboxRow->expires_at))) {
                        $isExpired = true;
                    }

                    if (!$isRevoked && !$isExpired) {
                        $table = match ($entry['purpose']) {
                            'passenger_email_verification' => 'user_email_verifications',
                            'passenger_password_reset' => 'user_password_resets',
                            'staff_invitation' => 'staff_invitations',
                            'staff_password_reset' => 'staff_password_resets',
                            'booking_guest_challenge', 'manage_booking', 'claim_booking' => 'booking_guest_challenges',
                            default => null,
                        };

                        if ($table !== null) {
                            $targetRow = $targetDb->table($table)
                                ->where('id', $entry['target_id'])
                                ->first(['state', 'revoked_at', 'consumed_at', 'expires_at']);

                            if (!$targetRow || $targetRow->state !== 'issued' || $targetRow->revoked_at !== null || $targetRow->consumed_at !== null) {
                                $isRevoked = true;
                            } elseif ($currentTime->greaterThanOrEqualTo(CarbonImmutable::parse($targetRow->expires_at))) {
                                $isExpired = true;
                            }
                        }
                    }
                }

                if ($isExpired || $isRevoked || $isReserved) {
                    $finalPath = $this->ownedRoot . DIRECTORY_SEPARATOR . $entry['capture_id'] . '.json';
                    $tempPath = $this->ownedRoot . DIRECTORY_SEPARATOR . $entry['capture_id'] . '.tmp';
                    $hasRaw = (file_exists($finalPath) || is_link($finalPath) || file_exists($tempPath) || is_link($tempPath));

                    if (!$hasRaw) {
                        // Crash after reservation with no raw files is cleanup-safe!
                        $cleaned++;
                        $toRemove[$entry['capture_id']] = true;
                        continue;
                    }

                    $unlinked = $this->eraseCaptureRemnants((string) $entry['capture_id']);
                    if ($unlinked) {
                        $cleaned++;
                        $toRemove[$entry['capture_id']] = true;
                        continue;
                    }

                    // Erase failure: retain entry in ledger to retry on subsequent run
                    $entry['state'] = 'failed_cleanup';
                    $entry['revoked'] = true;
                    $entry['updated_at'] = $currentTime->toRfc3339String();
                    $entry['last_attempted_at'] = $currentTime->toRfc3339String();
                } else {
                    // Not expired or revoked: record examination timestamp for round-robin fairness
                    $entry['last_attempted_at'] = $currentTime->toRfc3339String();
                }
            }
            unset($entry);

            // Remove successfully cleaned entries, keep all others (both unexamined and failed)
            $newLedger = [];
            foreach ($ledger as $entry) {
                if (!isset($toRemove[$entry['capture_id']])) {
                    $newLedger[] = $entry;
                }
            }

            $this->saveLedger($newLedger);
            return $cleaned;
        });
    }

    /**
     * Load and validate all ledger entries.
     * Rejects empty existing files, malformed JSON, unknown keys, duplicate capture IDs,
     * invalid UUIDs, unknown purposes, and invalid timestamps.
     *
     * @return array<int, array<string, mixed>>
     */
    public function loadLedger(): array
    {
        $path = $this->getLedgerPath();
        if (!file_exists($path)) {
            return [];
        }

        if (is_link($path)) {
            throw new DispatchException('Ledger file cannot be a symbolic link.');
        }

        $size = filesize($path);
        if ($size === false || $size > self::MAX_LEDGER_BYTES) {
            throw new DispatchException('Retention ledger file exceeds maximum allowed size.');
        }

        $content = @file_get_contents($path);
        if ($content === false) {
            throw new DispatchException('Failed to read retention ledger file.');
        }

        if (trim($content) === '') {
            throw new DispatchException('Retention ledger file is empty or malformed.');
        }

        try {
            $data = json_decode($content, true, 8, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new DispatchException('Retention ledger file is malformed JSON.');
        }

        if (!is_array($data) || !array_is_list($data)) {
            throw new DispatchException('Retention ledger must contain a JSON array of entries.');
        }

        if (count($data) > self::MAX_LEDGER_ENTRIES) {
            throw new DispatchException('Retention ledger exceeds maximum allowed entry count.');
        }

        $seenCaptureIds = [];

        foreach ($data as $entry) {
            if (!is_array($entry)) {
                throw new DispatchException('Retention ledger entry must be a JSON object.');
            }

            // Reject unknown keys strictly
            $unknownKeys = array_diff(array_keys($entry), self::ALLOWED_ENTRY_KEYS);
            if (!empty($unknownKeys)) {
                throw new DispatchException('Retention ledger entry contains unknown metadata key.');
            }

            // Verify required keys
            foreach (self::REQUIRED_ENTRY_KEYS as $rk) {
                if (!array_key_exists($rk, $entry)) {
                    throw new DispatchException("Retention ledger entry missing required field [{$rk}].");
                }
            }

            // Strict format and type validations
            if (!is_string($entry['capture_id']) || !preg_match('/^cap_[0-9a-f]{32}$/', $entry['capture_id'])) {
                throw new DispatchException('Retention ledger entry has invalid capture_id format.');
            }

            if (!is_string($entry['outbox_id']) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $entry['outbox_id'])) {
                throw new DispatchException('Retention ledger entry has invalid outbox_id UUID.');
            }

            if (!is_string($entry['target_id']) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $entry['target_id'])) {
                throw new DispatchException('Retention ledger entry has invalid target_id UUID.');
            }

            if (!is_string($entry['purpose']) || !in_array($entry['purpose'], self::ALLOWED_PURPOSES, true)) {
                throw new DispatchException('Retention ledger entry has invalid purpose.');
            }

            if (!is_bool($entry['revoked'])) {
                throw new DispatchException('Retention ledger entry has invalid revoked boolean type.');
            }

            if (isset($entry['state'])) {
                if (!is_string($entry['state']) || !in_array($entry['state'], self::ALLOWED_STATES, true)) {
                    throw new DispatchException('Retention ledger entry has invalid state.');
                }
            }

            // Validate timestamps with strict RFC 3339 and calendar validation
            if (!is_string($entry['expires_at'])) {
                throw new DispatchException('Retention ledger entry expires_at must be a string.');
            }
            if (!is_string($entry['captured_at'])) {
                throw new DispatchException('Retention ledger entry captured_at must be a string.');
            }
            self::parseStrictRfc3339($entry['expires_at']);
            self::parseStrictRfc3339($entry['captured_at']);
            if (isset($entry['updated_at'])) {
                if (!is_string($entry['updated_at'])) {
                    throw new DispatchException('Invalid updated_at timestamp.');
                }
                self::parseStrictRfc3339($entry['updated_at']);
            }

            // Duplicate detection: only capture_id must be strictly unique!
            // Outbox ID uniqueness is relaxed to allow multiple remnants from failed deletions.
            if (isset($seenCaptureIds[$entry['capture_id']])) {
                throw new DispatchException('Duplicate capture_id detected in retention ledger.');
            }
            $seenCaptureIds[$entry['capture_id']] = true;
        }

        return $data;
    }

    /**
     * @param array<int, array<string, mixed>> $ledger
     */
    private function saveLedger(array $ledger): void
    {
        if (count($ledger) > self::MAX_LEDGER_ENTRIES) {
            throw new DispatchException('Retention ledger exceeds maximum allowed entry count.');
        }

        $path = $this->getLedgerPath();
        $json = json_encode($ledger, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        if (strlen($json) > self::MAX_LEDGER_BYTES) {
            throw new DispatchException('Retention ledger exceeds maximum allowed encoded size.');
        }

        $tempPath = $path . '.tmp.' . bin2hex(random_bytes(6));
        $oldMask = umask(0077);
        try {
            $fp = @fopen($tempPath, 'wb');
        } finally {
            umask($oldMask);
        }
        if ($fp === false) {
            throw new DispatchException('Failed to open temporary ledger file.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            @chmod($tempPath, 0600);
            $fstat = @fstat($fp);
            if ($fstat === false || ($fstat['nlink'] ?? 0) !== 1 || is_link($tempPath)) {
                @fclose($fp);
                @unlink($tempPath);
                throw new DispatchException('Insecure temporary ledger file target.');
            }
            if (($fstat['mode'] & 0777) !== 0600 ||
                (function_exists('posix_geteuid') && ($fstat['uid'] ?? -1) !== posix_geteuid())) {
                @fclose($fp);
                @unlink($tempPath);
                throw new DispatchException('Temporary ledger file permissions must be 0600.');
            }
        }

        $written = @fwrite($fp, $json);
        if ($written === false || $written !== strlen($json)) {
            @fclose($fp);
            @unlink($tempPath);
            throw new DispatchException('Failed to write temporary ledger file completely.');
        }

        if (!fflush($fp) || !function_exists('fsync') || !fsync($fp)) {
            fclose($fp);
            @unlink($tempPath);
            throw new DispatchException('Retention metadata sync failed.');
        }
        if (!fclose($fp)) {
            @unlink($tempPath);
            throw new DispatchException('Retention metadata close failed.');
        }

        $renamed = @rename($tempPath, $path);
        if (!$renamed) {
            @unlink($tempPath);
            throw new DispatchException('Failed to rename temporary ledger file atomically.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            $chmodSuccess = @chmod($path, 0600);
            if (!$chmodSuccess) {
                throw new DispatchException('Failed to set secure permissions on ledger file.');
            }
        }
    }

    private function secureCaptureFile(string $captureId): void
    {
        $filePath = $this->ownedRoot . DIRECTORY_SEPARATOR . $captureId . '.json';
        if (file_exists($filePath) && DIRECTORY_SEPARATOR === '/') {
            @chmod($filePath, 0600);
        }
    }

    private function validateAndResolveRoot(string $path): string
    {
        $trimmed = trim($path);
        if ($trimmed === '' || str_contains($trimmed, "\0")) {
            throw new DispatchException('Owned root directory cannot be empty or contain null bytes.');
        }

        // Reject symlinks on any ancestor before creation/resolution
        $current = $trimmed;
        while ($current !== '.' && $current !== '/' && $current !== '\\' && $current !== '') {
            if (is_link($current)) {
                throw new DispatchException('Owned root path contains symbolic link ancestors.');
            }
            $parent = dirname($current);
            if ($parent === $current) {
                break;
            }
            $current = $parent;
        }

        $forbidden = ['/', '\\', 'c:\\', 'c:/', '/etc', '/var', '/usr', '/bin', '/sbin', '/home', '/root', 'c:\\windows', 'c:\\users', 'c:\\temp', '/tmp'];
        $cleanTrimmed = rtrim(str_replace('\\', '/', $trimmed), '/');
        $isWindows = (DIRECTORY_SEPARATOR === '\\');
        $normalized = $isWindows ? strtolower($cleanTrimmed) : $cleanTrimmed;

        if (in_array(strtolower($cleanTrimmed), $forbidden, true) || $cleanTrimmed === '') {
            throw new DispatchException('Retention directory cannot be a root or system directory.');
        }

        // Reject existing insecure roots before chmod, write, or delete
        $alreadyExisted = file_exists($trimmed) || is_dir($trimmed) || is_link($trimmed);
        if ($alreadyExisted) {
            if (is_link($trimmed)) {
                throw new DispatchException('Owned root cannot be a symbolic link.');
            }
            if (!is_dir($trimmed)) {
                throw new DispatchException('Owned root path must be a directory.');
            }
            if (DIRECTORY_SEPARATOR === '/') {
                $stat = @lstat($trimmed);
                if ($stat === false || ($stat['mode'] & 0777) !== 0700 ||
                    (function_exists('posix_geteuid') && ($stat['uid'] ?? -1) !== posix_geteuid())) {
                    throw new DispatchException('Existing capture root must be privately owned with mode 0700.');
                }
            }
        }

        // Anchor root to actual configured owned private sink or guarded explicitly marked disposable test roots.
        $rawPrivate = rtrim(str_replace('\\', '/', storage_path('app/private')), '/');
        $canonicalPrivate = $isWindows ? strtolower($rawPrivate) : $rawPrivate;

        // Reject the broad private parent directory itself!
        if ($normalized === $canonicalPrivate) {
            throw new DispatchException('Private storage parent cannot be used directly as an owned retention sink.');
        }

        // Sibling rejection: Must be strictly inside canonicalPrivate/
        $privateBoundary = $canonicalPrivate . '/';
        $normalizedWithSlash = $normalized . '/';

        if (!str_starts_with($normalizedWithSlash, $privateBoundary)) {
            throw new DispatchException('Retention directory must be anchored within the configured private storage root.');
        }

        // In testing, ensure it is either the configured mail sink or an ownership-marked disposable test directory
        $configuredLocalPath = config('foundation-services.mail.local_path');
        $cleanConfigured = $configuredLocalPath !== null && $configuredLocalPath !== ''
            ? rtrim(str_replace('\\', '/', (string) $configuredLocalPath), '/')
            : null;
        $normalizedConfigured = $cleanConfigured !== null
            ? ($isWindows ? strtolower($cleanConfigured) : $cleanConfigured)
            : null;

        $isConfiguredSink = ($normalizedConfigured !== null && $normalized === $normalizedConfigured);

        $isTesting = (getenv('APP_ENV') === 'testing' && function_exists('app') && app()->environment('testing'));
        $baseName = basename($normalized);
        $isDisposableTestSink = $isTesting && (
            str_starts_with($baseName, 'test_') ||
            str_starts_with($baseName, 'codex_') ||
            str_starts_with($baseName, 'disposable_')
        );

        if (!$isConfiguredSink && !$isDisposableTestSink) {
            throw new DispatchException('Retention directory is not the configured owned sink or an authorized test sink.');
        }

        if ($isDisposableTestSink) {
            // Require capability marker file!
            $markerPath = $trimmed . DIRECTORY_SEPARATOR . self::OWNED_TEST_MARKER;
            if (is_link($markerPath) || !file_exists($markerPath) || !is_file($markerPath)) {
                throw new DispatchException('Disposable test root missing server-created owned capability marker.');
            }

            if (DIRECTORY_SEPARATOR === '/') {
                $mstat = @lstat($markerPath);
                if ($mstat === false || ($mstat['nlink'] ?? 0) !== 1) {
                    throw new DispatchException('Disposable test root marker inode invalid.');
                }
                if (($mstat['mode'] & 0777) !== 0600) {
                    throw new DispatchException('Disposable test root marker permissions must be 0600.');
                }
                if (function_exists('posix_geteuid') && ($mstat['uid'] ?? -1) !== posix_geteuid()) {
                    throw new DispatchException('Disposable test root marker must be owned by current user.');
                }
            }

            $markerContent = @file_get_contents($markerPath);
            if ($markerContent === false || trim($markerContent) !== 'gza_test_owned_marker_v1') {
                throw new DispatchException('Disposable test root marker metadata invalid.');
            }

            // Verify live DB
            $dbConn = $this->db;
            if ($dbConn === null && function_exists('app') && app()->bound('db')) {
                try {
                    $dbConn = \Illuminate\Support\Facades\DB::connection();
                } catch (\Throwable) {}
            }
            if ($dbConn === null) {
                throw new DispatchException('Disposable test root requires live database connection.');
            }
            try {
                $currentDbRow = $dbConn->selectOne('SELECT current_database() AS db');
                if ((string) ($currentDbRow?->db ?? '') !== 'gaza_gateway_test') {
                    throw new DispatchException('Disposable test root rejected: database is not gaza_gateway_test.');
                }
            } catch (DispatchException $e) {
                throw $e;
            } catch (\Throwable) {
                throw new DispatchException('Disposable test root rejected: failed to verify test database.');
            }
        }

        if (!$alreadyExisted) {
            $created = @mkdir($trimmed, 0700, false);
            if (!$created && !is_dir($trimmed)) {
                throw new DispatchException('Failed to create owned retention directory.');
            }
        }

        $real = realpath($trimmed);
        if ($real === false || is_link($real)) {
            throw new DispatchException('Failed to resolve owned root directory or path is a symlink.');
        }

        $realClean = rtrim(str_replace('\\', '/', $real), '/');
        $realNormalized = $isWindows ? strtolower($realClean) : $realClean;

        if ($realNormalized === $canonicalPrivate || !str_starts_with($realNormalized . '/', $privateBoundary)) {
            throw new DispatchException('Resolved retention directory escapes configured private storage root.');
        }

        // Only chmod if on Linux/Unix AND if newly created by us (never alter foreign directory permissions)
        if (DIRECTORY_SEPARATOR === '/' && !$alreadyExisted) {
            @chmod($real, 0700);
        }

        return $real;
    }
}
