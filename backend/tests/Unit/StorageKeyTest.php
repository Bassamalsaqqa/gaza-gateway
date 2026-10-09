<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Storage\Exceptions\InvalidStorageKeyException;
use App\Contracts\Storage\StorageKey;
use PHPUnit\Framework\TestCase;

class StorageKeyTest extends TestCase
{
    public function test_valid_keys_are_accepted(): void
    {
        $validKeys = [
            'doc-123',
            'archive_2026.pdf',
            'passenger_manifest_final',
            'opaque-key-01',
            'receipt-987.json',
            'PS204',
        ];

        foreach ($validKeys as $key) {
            $storageKey = new StorageKey($key);
            $this->assertSame($key, $storageKey->value);
            $this->assertSame($key, (string) $storageKey);
        }
    }

    public function test_rejects_empty_key(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('Storage key cannot be empty');

        new StorageKey('   ');
    }

    public function test_rejects_traversal_with_double_dot(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey('../secret');
    }

    public function test_rejects_traversal_with_forward_slash(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey('sub/dir/key');
    }

    public function test_rejects_traversal_with_backslash(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey('sub\\dir\\key');
    }

    public function test_rejects_absolute_unix_path(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey('/etc/passwd');
    }

    public function test_rejects_windows_drive_path(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey('C:\\Windows\\System32');
    }

    public function test_rejects_leading_dot(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('cannot start or end with a dot');

        new StorageKey('.hidden_file');
    }

    public function test_rejects_trailing_dot(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('cannot start or end with a dot');

        new StorageKey('filename.');
    }

    public function test_rejects_null_byte(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('forbidden traversal');

        new StorageKey("key\0name");
    }

    public function test_rejects_oversized_key(): void
    {
        $oversized = str_repeat('k', 129);
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('maximum allowed bound');

        new StorageKey($oversized);
    }

    public function test_rejects_disallowed_characters(): void
    {
        $this->expectException(InvalidStorageKeyException::class);
        $this->expectExceptionMessage('violates the allowed opaque character grammar');

        new StorageKey('key with spaces');
    }
}
