<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Storage\Exceptions\InvalidStorageKeyException;
use App\Contracts\Storage\Exceptions\StoragePayloadException;
use App\Contracts\Storage\Exceptions\StorageSecurityException;
use App\Contracts\Storage\StorageDeleteReceipt;
use App\Contracts\Storage\StoragePutReceipt;
use App\Services\Foundation\Storage\LocalPrivateStorage;
use PHPUnit\Framework\TestCase;

class LocalPrivateStorageTest extends TestCase
{
    private string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_storage_test_' . bin2hex(random_bytes(8));
        @mkdir($this->tempDir, 0700, true);
    }

    protected function tearDown(): void
    {
        @chmod($this->tempDir, 0700);
        $this->cleanDirectory($this->tempDir);
        parent::tearDown();
    }

    public function test_put_get_has_and_delete_roundtrip(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'booking-receipt-7K8P';
        $content = "CONFIRMATION RECEIPT: PNR GZA-7K8P FLIGHT PS 204\nDATE 2026-09-18";
        $metadata = [
            'declared_mime' => 'text/plain',
            'retention_class' => 'operational_receipt',
        ];

        // 1. Initial existence probe
        $this->assertFalse($storage->has($key));
        $this->assertNull($storage->get($key));

        // 2. Put object
        $receipt = $storage->put($key, $content, $metadata);

        $this->assertSame($key, $receipt->key);
        $this->assertSame(StoragePutReceipt::STATUS_STORED, $receipt->status);
        $this->assertSame(strlen($content), $receipt->byteLength);
        $this->assertSame(hash('sha256', $content), $receipt->sha256);
        $this->assertSame($metadata, $receipt->declaredMetadata);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $receipt->storedAt);

        // 3. Has object
        $this->assertTrue($storage->has($key));

        // 4. Get object
        $stored = $storage->get($key);
        $this->assertNotNull($stored);
        $this->assertSame($key, $stored->key);
        $this->assertSame($content, $stored->contents);
        $this->assertSame(strlen($content), $stored->byteLength);
        $this->assertSame(hash('sha256', $content), $stored->sha256);
        $this->assertSame($metadata, $stored->declaredMetadata);

        // 5. Delete object
        $deleteReceipt = $storage->delete($key);
        $this->assertSame($key, $deleteReceipt->key);
        $this->assertSame(StorageDeleteReceipt::STATUS_DELETED, $deleteReceipt->status);

        // 6. Post-delete probes
        $this->assertFalse($storage->has($key));
        $this->assertNull($storage->get($key));

        // 7. Deleting missing object returns truthful not_found receipt
        $deleteMissing = $storage->delete($key);
        $this->assertSame(StorageDeleteReceipt::STATUS_NOT_FOUND, $deleteMissing->status);
    }

    public function test_no_clobber_semantics_preserves_existing_bytes(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'immutable-report-2026';
        $originalContent = 'ORIGINAL IMMUTABLE CONTENT';
        $attemptedContent = 'ATTEMPTED REPLACEMENT CONTENT';

        // Write original
        $initialReceipt = $storage->put($key, $originalContent, ['version' => 1]);
        $this->assertSame(StoragePutReceipt::STATUS_STORED, $initialReceipt->status);

        // Attempt write with overwrite: false
        $noClobberReceipt = $storage->put($key, $attemptedContent, ['version' => 2], overwrite: false);

        $this->assertSame(StoragePutReceipt::STATUS_NO_OP_EXISTS, $noClobberReceipt->status);
        $this->assertSame(strlen($originalContent), $noClobberReceipt->byteLength);
        $this->assertSame(hash('sha256', $originalContent), $noClobberReceipt->sha256);

        // Verify stored object remains completely unchanged
        $current = $storage->get($key);
        $this->assertNotNull($current);
        $this->assertSame($originalContent, $current->contents);
        $this->assertSame(['version' => 1], $current->declaredMetadata);
    }

    public function test_safe_replace_overwrites_when_explicitly_requested(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'mutable-state-token';

        $storage->put($key, 'FIRST_STATE', ['state' => 'initial']);
        $overwriteReceipt = $storage->put($key, 'SECOND_STATE', ['state' => 'updated'], overwrite: true);

        $this->assertSame(StoragePutReceipt::STATUS_STORED, $overwriteReceipt->status);

        $current = $storage->get($key);
        $this->assertNotNull($current);
        $this->assertSame('SECOND_STATE', $current->contents);
        $this->assertSame(['state' => 'updated'], $current->declaredMetadata);
    }

    public function test_invalid_write_preserves_existing_bytes_unmodified(): void
    {
        $storage = new LocalPrivateStorage(
            storageRoot: $this->tempDir,
            maxObjectBytes: 100,
        );
        $key = 'critical-document';
        $originalContent = 'CRITICAL RESILIENT DATA';

        $storage->put($key, $originalContent);

        // Attempt write with payload exceeding size bound
        $oversizedPayload = str_repeat('X', 101);
        try {
            $storage->put($key, $oversizedPayload);
            $this->fail('Expected StoragePayloadException was not thrown.');
        } catch (StoragePayloadException) {
            // Expected
        }

        // Verify existing file is completely intact
        $intact = $storage->get($key);
        $this->assertNotNull($intact);
        $this->assertSame($originalContent, $intact->contents);
        $this->assertSame(strlen($originalContent), $intact->byteLength);
        $this->assertSame(hash('sha256', $originalContent), $intact->sha256);
    }

    public function test_delete_fails_safely_when_unlink_is_prevented(): void
    {
        if (DIRECTORY_SEPARATOR !== '/') {
            $this->markTestSkipped('POSIX permission checks only apply to Unix/Linux environments.');
        }

        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            $this->markTestSkipped('Root user (UID 0) bypasses POSIX 0500 directory write permissions.');
        }

        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'locked-object';
        $storage->put($key, 'LOCKED DATA');

        // Make root directory read-only so unlink fails
        chmod($this->tempDir, 0500);

        try {
            $storage->delete($key);
            $this->fail('Expected StorageSecurityException on delete in read-only directory.');
        } catch (StorageSecurityException $e) {
            $this->assertStringContainsString('failed to delete', strtolower($e->getMessage()));
        } finally {
            chmod($this->tempDir, 0700);
        }

        // Object must still exist; delete must not have claimed success
        $this->assertTrue($storage->has($key));
    }

    public function test_tmp_symlink_escape_is_strictly_rejected(): void
    {
        if (!function_exists('symlink')) {
            $this->markTestSkipped('Symlink function is not available.');
        }

        $siblingExternalDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_tmp_ext_' . bin2hex(random_bytes(8));
        @mkdir($siblingExternalDir, 0700, true);

        $tmpSymlinkPath = $this->tempDir . DIRECTORY_SEPARATOR . '.tmp';
        $symlinkCreated = @symlink($siblingExternalDir, $tmpSymlinkPath);

        if (!$symlinkCreated) {
            $this->cleanDirectory($siblingExternalDir);
            $this->markTestSkipped('Symlink creation not permitted.');
        }

        try {
            new LocalPrivateStorage($this->tempDir);
            $this->fail('Expected StorageSecurityException on .tmp symlink escape');
        } catch (StorageSecurityException $e) {
            $this->assertStringContainsString('symlink', strtolower($e->getMessage()));
        } finally {
            @unlink($tmpSymlinkPath);
            $this->cleanDirectory($siblingExternalDir);
        }
    }

    public function test_rejects_unsafe_configured_modes(): void
    {
        $this->expectException(StorageSecurityException::class);
        $this->expectExceptionMessage('strictly 0600');

        new LocalPrivateStorage(
            storageRoot: $this->tempDir,
            fileMode: 0777,
        );
    }

    public function test_rejects_unsafe_configured_dir_modes(): void
    {
        $this->expectException(StorageSecurityException::class);
        $this->expectExceptionMessage('strictly 0700');

        new LocalPrivateStorage(
            storageRoot: $this->tempDir,
            dirMode: 0777,
        );
    }

    public function test_unreadable_existing_file_throws_safe_exception(): void
    {
        if (DIRECTORY_SEPARATOR !== '/') {
            $this->markTestSkipped('POSIX permission checks only apply to Unix/Linux environments.');
        }

        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            $this->markTestSkipped('Root user (UID 0) bypasses POSIX 0000 read permissions.');
        }

        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'unreadable-test-obj';
        $storage->put($key, 'SECRET CONTENT');

        $objectPath = $this->tempDir . DIRECTORY_SEPARATOR . $key . '.object.json';
        $this->assertFileExists($objectPath);

        // Make file unreadable
        chmod($objectPath, 0000);

        try {
            $storage->get($key);
            $this->fail('Expected StorageSecurityException on unreadable object file.');
        } catch (StorageSecurityException $e) {
            $this->assertStringContainsString('failed to read', strtolower($e->getMessage()));
        } finally {
            chmod($objectPath, 0600);
        }
    }

    public function test_metadata_shape_and_bounds_validation(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);

        // Nested array/object rejected
        try {
            $storage->put('meta-test-1', 'DATA', ['nested' => ['deep' => true]]);
            $this->fail('Expected StoragePayloadException on nested metadata array.');
        } catch (StoragePayloadException $e) {
            $this->assertStringContainsString('scalar or null', $e->getMessage());
        }

        // Invalid key rejected
        try {
            $storage->put('meta-test-2', 'DATA', ['bad/key' => 'val']);
            $this->fail('Expected StoragePayloadException on invalid metadata key.');
        } catch (StoragePayloadException $e) {
            $this->assertStringContainsString('character grammar', $e->getMessage());
        }

        // Oversized metadata (> 64 KiB) rejected
        $largeMetadata = [];
        for ($i = 0; $i < 20; $i++) {
            $largeMetadata["key_{$i}"] = str_repeat('V', 3500);
        }
        try {
            $storage->put('meta-test-3', 'DATA', $largeMetadata);
            $this->fail('Expected StoragePayloadException on oversized metadata.');
        } catch (StoragePayloadException $e) {
            $this->assertStringContainsString('exceeds 64 KiB', $e->getMessage());
        }

        // Valid metadata accepted
        $receipt = $storage->put('meta-test-valid', 'VALID DATA', [
            'author' => 'System',
            'version' => 1,
            'is_active' => true,
        ]);
        $this->assertSame(StoragePutReceipt::STATUS_STORED, $receipt->status);
    }

    public function test_symlink_storage_root_is_rejected(): void
    {
        if (!function_exists('symlink')) {
            $this->markTestSkipped('Symlink function is not available.');
        }

        $realTarget = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_storage_realtarget_' . bin2hex(random_bytes(6));
        @mkdir($realTarget, 0700, true);
        $symlinkRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_storage_symlink_' . bin2hex(random_bytes(6));

        $created = @symlink($realTarget, $symlinkRoot);
        if (!$created) {
            $this->cleanDirectory($realTarget);
            $this->markTestSkipped('Symlink creation not permitted.');
        }

        try {
            new LocalPrivateStorage($symlinkRoot);
            $this->fail('Expected StorageSecurityException on symlinked storage root.');
        } catch (StorageSecurityException $e) {
            $this->assertStringContainsString('cannot be a symlink', $e->getMessage());
        } finally {
            @unlink($symlinkRoot);
            $this->cleanDirectory($realTarget);
        }
    }

    public function test_atomic_publication_and_no_clobber_reader_probe(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);
        $key = 'atomic-probe-object';
        $content = 'ATOMIC CONTENT ' . bin2hex(random_bytes(32));

        // Initial store
        $receipt1 = $storage->put($key, $content, ['tag' => 'first'], overwrite: false);
        $this->assertSame(StoragePutReceipt::STATUS_STORED, $receipt1->status);

        // Verify stored object is complete and valid
        $read1 = $storage->get($key);
        $this->assertNotNull($read1);
        $this->assertSame($content, $read1->contents);
        $this->assertSame(hash('sha256', $content), $read1->sha256);

        // Attempt second store with overwrite: false (no-clobber)
        $receipt2 = $storage->put($key, 'DIFFERENT CONTENT', ['tag' => 'second'], overwrite: false);
        $this->assertSame(StoragePutReceipt::STATUS_NO_OP_EXISTS, $receipt2->status);
        $this->assertSame(strlen($content), $receipt2->byteLength);
        $this->assertSame(hash('sha256', $content), $receipt2->sha256);

        // Reader verification: prior bytes and metadata completely preserved
        $read2 = $storage->get($key);
        $this->assertNotNull($read2);
        $this->assertSame($content, $read2->contents);
        $this->assertSame(['tag' => 'first'], $read2->declaredMetadata);
    }

    public function test_rejects_oversized_payload_on_initial_write(): void
    {
        $storage = new LocalPrivateStorage(
            storageRoot: $this->tempDir,
            maxObjectBytes: 50,
        );

        $this->expectException(StoragePayloadException::class);
        $this->expectExceptionMessage('Payload exceeds maximum allowed storage limit');

        $storage->put('oversized-key', str_repeat('B', 51));
    }

    public function test_rejects_traversal_keys_on_all_operations(): void
    {
        $storage = new LocalPrivateStorage($this->tempDir);
        $traversalKey = '../escape_key';

        try {
            $storage->put($traversalKey, 'data');
            $this->fail('Expected InvalidStorageKeyException on put');
        } catch (InvalidStorageKeyException) {
        }

        try {
            $storage->get($traversalKey);
            $this->fail('Expected InvalidStorageKeyException on get');
        } catch (InvalidStorageKeyException) {
        }

        try {
            $storage->has($traversalKey);
            $this->fail('Expected InvalidStorageKeyException on has');
        } catch (InvalidStorageKeyException) {
        }

        try {
            $storage->delete($traversalKey);
            $this->fail('Expected InvalidStorageKeyException on delete');
        } catch (InvalidStorageKeyException) {
        }

        $this->assertTrue(true);
    }

    public function test_rejects_forbidden_root_configuration(): void
    {
        $this->expectException(StorageSecurityException::class);
        $this->expectExceptionMessage('forbidden system directory');

        new LocalPrivateStorage('/');
    }

    public function test_rejects_empty_storage_root(): void
    {
        $this->expectException(StorageSecurityException::class);
        $this->expectExceptionMessage('Storage root directory cannot be empty');

        new LocalPrivateStorage('');
    }

    public function test_symlink_escape_negative_probe(): void
    {
        if (!function_exists('symlink')) {
            $this->markTestSkipped('Symlink function is not available.');
        }

        $targetExternalDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_symlink_ext_' . bin2hex(random_bytes(8));
        @mkdir($targetExternalDir, 0700, true);
        $externalFile = $targetExternalDir . DIRECTORY_SEPARATOR . 'external_payload.txt';
        file_put_contents($externalFile, 'EXTERNAL DATA');

        $symlinkTarget = $this->tempDir . DIRECTORY_SEPARATOR . 'symlinked_key.object.json';
        $symlinkCreated = @symlink($externalFile, $symlinkTarget);

        if (!$symlinkCreated) {
            $this->cleanDirectory($targetExternalDir);
            $this->markTestSkipped('Symlink creation not permitted in this OS environment.');
        }

        $storage = new LocalPrivateStorage($this->tempDir);

        try {
            $storage->get('symlinked_key');
            $this->fail('Expected StorageSecurityException on symlink probe');
        } catch (StorageSecurityException $e) {
            $this->assertStringContainsString('symlink', strtolower($e->getMessage()));
        } finally {
            @unlink($symlinkTarget);
            $this->cleanDirectory($targetExternalDir);
        }
    }

    private function cleanDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = scandir($dir);
        if ($items === false) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $this->cleanDirectory($path);
            } else {
                @unlink($path);
            }
        }

        @rmdir($dir);
    }
}
