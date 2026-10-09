<?php

declare(strict_types=1);

namespace App\Contracts\Storage;

/**
 * Immutable representation of a retrieved private stored object.
 *
 * Declared metadata is treated as untrusted and not as proof of MIME safety.
 */
final readonly class StoredObject
{
    /**
     * @param array<string, mixed> $declaredMetadata
     */
    public function __construct(
        public string $key,
        public string $contents,
        public int $byteLength,
        public string $sha256,
        public array $declaredMetadata,
        public string $lastModifiedAt,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'byte_length' => $this->byteLength,
            'sha256' => $this->sha256,
            'declared_metadata' => $this->declaredMetadata,
            'last_modified_at' => $this->lastModifiedAt,
        ];
    }

    /**
     * Excludes raw contents from default debug output to prevent log leakage.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return [
            'key' => $this->key,
            'byte_length' => $this->byteLength,
            'sha256' => $this->sha256,
            'declared_metadata' => $this->declaredMetadata,
            'last_modified_at' => $this->lastModifiedAt,
        ];
    }
}
