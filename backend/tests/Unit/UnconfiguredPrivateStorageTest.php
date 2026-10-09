<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Storage\Exceptions\UnconfiguredStorageProviderException;
use App\Services\Foundation\Storage\UnconfiguredPrivateStorage;
use PHPUnit\Framework\TestCase;

class UnconfiguredPrivateStorageTest extends TestCase
{
    public function test_put_throws_unconfigured_exception(): void
    {
        $storage = new UnconfiguredPrivateStorage();

        $this->expectException(UnconfiguredStorageProviderException::class);
        $this->expectExceptionMessage('Private object storage is unconfigured in this environment. No objects can be stored.');

        $storage->put('key-01', 'payload');
    }

    public function test_get_throws_unconfigured_exception(): void
    {
        $storage = new UnconfiguredPrivateStorage();

        $this->expectException(UnconfiguredStorageProviderException::class);
        $this->expectExceptionMessage('Private object storage is unconfigured in this environment. No objects can be retrieved.');

        $storage->get('key-01');
    }

    public function test_has_throws_unconfigured_exception(): void
    {
        $storage = new UnconfiguredPrivateStorage();

        $this->expectException(UnconfiguredStorageProviderException::class);
        $this->expectExceptionMessage('Private object storage is unconfigured in this environment. Object existence cannot be queried.');

        $storage->has('key-01');
    }

    public function test_delete_throws_unconfigured_exception(): void
    {
        $storage = new UnconfiguredPrivateStorage();

        $this->expectException(UnconfiguredStorageProviderException::class);
        $this->expectExceptionMessage('Private object storage is unconfigured in this environment. No objects can be deleted.');

        $storage->delete('key-01');
    }
}
