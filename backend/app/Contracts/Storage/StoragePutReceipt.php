<?php

declare(strict_types=1);

namespace App\Contracts\Storage;

/**
 * Immutable receipt for private object store write operations.
 *
 * Truthfully records whether the object was freshly stored or preserved via no-clobber semantics.
 */
final readonly class StoragePutReceipt
{
    public const string STATUS_STORED = 'stored';
    public const string STATUS_NO_OP_EXISTS = 'no_op_exists';

    /**
     * @param array<string, mixed> $declaredMetadata
     */
    public function __construct(
        public string $key,
        public string $status,
        public int $byteLength,
        public string $sha256,
        public array $declaredMetadata,
        public string $storedAt,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'status' => $this->status,
            'byte_length' => $this->byteLength,
            'sha256' => $this->sha256,
            'declared_metadata' => $this->declaredMetadata,
            'stored_at' => $this->storedAt,
        ];
    }
}
