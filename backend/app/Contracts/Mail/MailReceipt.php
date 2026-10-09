<?php

declare(strict_types=1);

namespace App\Contracts\Mail;

/**
 * Immutable receipt confirming local capture of a mail submission.
 *
 * State is explicitly 'captured_locally' and never claims external dispatch or delivery.
 * Recipient email and body content are strictly excluded from receipt and debug representations.
 */
final readonly class MailReceipt
{
    public const string STATUS_CAPTURED_LOCALLY = 'captured_locally';

    public function __construct(
        public string $captureId,
        public string $capturedAt,
        public string $status,
        public string $payloadHash,
        public int $bytesWritten,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'capture_id' => $this->captureId,
            'captured_at' => $this->capturedAt,
            'status' => $this->status,
            'payload_hash' => $this->payloadHash,
            'bytes_written' => $this->bytesWritten,
        ];
    }

    /**
     * Redacted representation for safe structured logging.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return $this->toArray();
    }
}
