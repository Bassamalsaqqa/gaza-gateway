<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use JsonSerializable;

/**
 * Summary of a bounded outbox dispatch batch run.
 *
 * Distinguishes local capture from external delivery.
 */
final readonly class DispatchBatchResult implements JsonSerializable
{
    /**
     * @param int $processedCount Total records examined in this batch
     * @param int $capturedLocallyCount Records captured by honest local sink
     * @param int $failedCount Records encountering dispatch errors
     * @param int $expiredCount Records expired and scrubbed during run
     * @param array<int, string> $captureIds Diagnostic capture IDs
     * @param array<int, string> $errorCodes Safe allowlisted error tags
     */
    public function __construct(
        public int $processedCount,
        public int $capturedLocallyCount,
        public int $failedCount,
        public int $expiredCount,
        public array $captureIds = [],
        public array $errorCodes = [],
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'processed_count' => $this->processedCount,
            'captured_locally_count' => $this->capturedLocallyCount,
            'failed_count' => $this->failedCount,
            'expired_count' => $this->expiredCount,
            'capture_ids_count' => count($this->captureIds),
            'error_codes' => $this->errorCodes,
        ];
    }
}
