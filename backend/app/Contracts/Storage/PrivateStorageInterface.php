<?php

declare(strict_types=1);

namespace App\Contracts\Storage;

use App\Contracts\Storage\Exceptions\InvalidStorageKeyException;
use App\Contracts\Storage\Exceptions\StoragePayloadException;
use App\Contracts\Storage\Exceptions\StorageSecurityException;
use App\Contracts\Storage\Exceptions\UnconfiguredStorageProviderException;

/**
 * Seam contract for private object storage.
 *
 * Enforces bounded opaque keys, raw bytes with declared metadata, no public URLs,
 * and fail-closed behavior in deployment.
 */
interface PrivateStorageInterface
{
    /**
     * Store private object bytes with atomic write semantics.
     *
     * When $overwrite is false and the key already exists, returns a truthful no-op receipt
     * without modifying existing bytes.
     *
     * @param array<string, mixed> $declaredMetadata Declared-only metadata (not trusted for MIME safety)
     *
     * @throws InvalidStorageKeyException If the key violates opaque key grammar or traversal rules.
     * @throws StoragePayloadException If the object exceeds maximum size bounds.
     * @throws StorageSecurityException If path traversal, symlink escapes, or forbidden roots are detected.
     * @throws UnconfiguredStorageProviderException If called on an unconfigured provider adapter.
     */
    public function put(
        string $key,
        string $contents,
        array $declaredMetadata = [],
        bool $overwrite = true,
    ): StoragePutReceipt;

    /**
     * Retrieve a stored private object, or null if the key does not exist.
     *
     * @throws InvalidStorageKeyException If the key violates opaque key grammar.
     * @throws StorageSecurityException If path traversal or symlink escapes are detected.
     * @throws UnconfiguredStorageProviderException If called on an unconfigured provider adapter.
     */
    public function get(string $key): ?StoredObject;

    /**
     * Check if a private object exists.
     *
     * @throws InvalidStorageKeyException If the key violates opaque key grammar.
     * @throws StorageSecurityException If path traversal or symlink escapes are detected.
     * @throws UnconfiguredStorageProviderException If called on an unconfigured provider adapter.
     */
    public function has(string $key): bool;

    /**
     * Delete a private object, returning a truthful receipt (deleted or not_found).
     *
     * @throws InvalidStorageKeyException If the key violates opaque key grammar.
     * @throws StorageSecurityException If path traversal or symlink escapes are detected.
     * @throws UnconfiguredStorageProviderException If called on an unconfigured provider adapter.
     */
    public function delete(string $key): StorageDeleteReceipt;
}
