<?php

declare(strict_types=1);

namespace App\Services\Foundation\Storage;

use App\Contracts\Storage\Exceptions\UnconfiguredStorageProviderException;
use App\Contracts\Storage\PrivateStorageInterface;
use App\Contracts\Storage\StorageDeleteReceipt;
use App\Contracts\Storage\StoragePutReceipt;
use App\Contracts\Storage\StoredObject;

/**
 * Fail-closed unconfigured private object storage adapter.
 *
 * Enforces production/staging isolation by throwing dedicated exceptions on invocation.
 * Performs zero filesystem I/O, zero network requests, and zero persistent storage operations.
 */
class UnconfiguredPrivateStorage implements PrivateStorageInterface
{
    public function put(
        string $key,
        string $contents,
        array $declaredMetadata = [],
        bool $overwrite = true,
    ): StoragePutReceipt {
        throw new UnconfiguredStorageProviderException(
            'Private object storage is unconfigured in this environment. No objects can be stored.'
        );
    }

    public function get(string $key): ?StoredObject
    {
        throw new UnconfiguredStorageProviderException(
            'Private object storage is unconfigured in this environment. No objects can be retrieved.'
        );
    }

    public function has(string $key): bool
    {
        throw new UnconfiguredStorageProviderException(
            'Private object storage is unconfigured in this environment. Object existence cannot be queried.'
        );
    }

    public function delete(string $key): StorageDeleteReceipt
    {
        throw new UnconfiguredStorageProviderException(
            'Private object storage is unconfigured in this environment. No objects can be deleted.'
        );
    }
}
