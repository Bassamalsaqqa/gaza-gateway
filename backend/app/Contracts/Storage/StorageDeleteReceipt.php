<?php

declare(strict_types=1);

namespace App\Contracts\Storage;

/**
 * Immutable receipt for private object store deletion operations.
 */
final readonly class StorageDeleteReceipt
{
    public const string STATUS_DELETED = 'deleted';
    public const string STATUS_NOT_FOUND = 'not_found';

    public function __construct(
        public string $key,
        public string $status,
        public string $deletedAt,
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
            'deleted_at' => $this->deletedAt,
        ];
    }
}
