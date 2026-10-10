<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

/**
 * Retention manager for bounded cleanup of owned local mail captures.
 *
 * Enforces:
 * - Strictly bounded to owned private mail sink directory (no arbitrary deletion).
 * - Matches only authentic owned file pattern: cap_[0-9a-f]{32}\.json.
 * - Rejects symlinks and forbidden system roots.
 * - Enforces bounded batch execution.
 */
class LocalCaptureRetentionManager
{
    public const string FILE_PATTERN = '/^cap_[0-9a-f]{32}\.json$/';

    /**
     * Arbitrary directory sweep is disabled and fails closed.
     * All retention cleanup must proceed through OwnedCaptureRetentionLedger at authoritative original deadline.
     */
    public function cleanupExpiredCaptures(
        string $sinkPath,
        int $maxAgeSeconds = 86400,
        int $batchLimit = 100,
    ): int {
        throw new DispatchException('Arbitrary directory sweep is strictly forbidden; retention cleanup must be authorized through OwnedCaptureRetentionLedger at original deadline.');
    }

    /**
     * Clean up expired captures at their exact original proof/challenge deadline
     * using the secret-free private ledger with optional authoritative DB reconciliation.
     */
    public function cleanupAtOriginalDeadline(
        OwnedCaptureRetentionLedger $ledger,
        ?CarbonImmutable $now = null,
        int $batchLimit = 100,
        ?ConnectionInterface $conn = null,
    ): int {
        return $ledger->cleanupExpired($now, $batchLimit, $conn);
    }

    private function validateAndResolveDirectory(string $path): ?string
    {
        $trimmed = trim($path);
        if ($trimmed === '' || is_link($trimmed)) {
            return null;
        }

        $forbidden = ['/', '\\', 'c:\\', 'c:/', '/etc', '/var', '/usr', '/bin', '/sbin'];
        $normalized = strtolower(rtrim(str_replace('\\', '/', $trimmed), '/'));
        if (in_array($normalized, $forbidden, true) || $normalized === '') {
            throw new DispatchException('Retention directory cannot be a root or system directory.');
        }

        if (!is_dir($trimmed)) {
            return null;
        }

        $real = realpath($trimmed);
        if ($real === false || is_link($real)) {
            return null;
        }

        return $real;
    }
}
