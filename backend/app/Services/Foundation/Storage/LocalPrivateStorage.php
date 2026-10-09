<?php

declare(strict_types=1);

namespace App\Services\Foundation\Storage;

use App\Contracts\Storage\Exceptions\InvalidStorageKeyException;
use App\Contracts\Storage\Exceptions\StoragePayloadException;
use App\Contracts\Storage\Exceptions\StorageSecurityException;
use App\Contracts\Storage\PrivateStorageInterface;
use App\Contracts\Storage\StorageDeleteReceipt;
use App\Contracts\Storage\StorageKey;
use App\Contracts\Storage\StoragePutReceipt;
use App\Contracts\Storage\StoredObject;
use DateTimeImmutable;
use DateTimeZone;
use Throwable;

/**
 * Honest local private object storage adapter for development and testing.
 *
 * Implements atomic single-envelope private writes, race-safe no-clobber semantics
 * using same-filesystem atomic publication, strict symlink and traversal guards,
 * and truthful receipts with hashes. Never generates public URLs or suppresses filesystem failures.
 */
class LocalPrivateStorage implements PrivateStorageInterface
{
    public const int DEFAULT_MAX_OBJECT_BYTES = 10485760; // 10 MiB
    public const int MAX_METADATA_BYTES = 65536; // 64 KiB
    public const int MAX_METADATA_KEYS = 50;
    public const int MAX_METADATA_KEY_LENGTH = 64;
    private const string ENVELOPE_FORMAT = 'gza_object_v1';

    private string $canonicalRoot;
    private string $tmpDir;
    private int $maxObjectBytes;
    private int $fileMode;
    private int $dirMode;

    public function __construct(
        string $storageRoot,
        int $maxObjectBytes = self::DEFAULT_MAX_OBJECT_BYTES,
        int $fileMode = 0600,
        int $dirMode = 0700,
    ) {
        // Guard: File and directory modes must be strictly 0600 and 0700
        if ($fileMode !== 0600) {
            throw new StorageSecurityException('Storage file permissions must be strictly 0600.');
        }
        if ($dirMode !== 0700) {
            throw new StorageSecurityException('Storage directory permissions must be strictly 0700.');
        }
        if ($maxObjectBytes <= 0 || $maxObjectBytes > self::DEFAULT_MAX_OBJECT_BYTES) {
            throw new StoragePayloadException('Configured max object size exceeds architectural bounds (10 MiB).');
        }

        $this->maxObjectBytes = $maxObjectBytes;
        $this->fileMode = $fileMode;
        $this->dirMode = $dirMode;
        $this->canonicalRoot = $this->resolveAndValidateRoot($storageRoot);

        $this->tmpDir = $this->canonicalRoot . DIRECTORY_SEPARATOR . '.tmp';
        $this->ensureAndValidateTmpDir();
    }

    public function put(
        string $key,
        string $contents,
        array $declaredMetadata = [],
        bool $overwrite = true,
    ): StoragePutReceipt {
        $validKey = StorageKey::validate($key);

        if (strlen($contents) > $this->maxObjectBytes) {
            throw new StoragePayloadException(
                "Payload exceeds maximum allowed storage limit of {$this->maxObjectBytes} bytes."
            );
        }

        $validatedMetadata = $this->validateDeclaredMetadata($declaredMetadata);
        $targetPath = $this->resolveFilePath($validKey);
        $this->assertNoSymlinkEscape($targetPath);

        // No-clobber semantics: if overwrite is false, preserve existing object
        if (!$overwrite) {
            if (file_exists($targetPath)) {
                $existing = $this->get($validKey);
                if ($existing !== null) {
                    return new StoragePutReceipt(
                        key: $validKey,
                        status: StoragePutReceipt::STATUS_NO_OP_EXISTS,
                        byteLength: $existing->byteLength,
                        sha256: $existing->sha256,
                        declaredMetadata: $existing->declaredMetadata,
                        storedAt: $existing->lastModifiedAt,
                    );
                }
            }

            // Stage complete envelope first, then atomically publish with no-clobber
            return $this->stageAndPublish(
                validKey: $validKey,
                contents: $contents,
                declaredMetadata: $validatedMetadata,
                targetPath: $targetPath,
                overwrite: false,
            );
        }

        // Atomic replace via staging envelope and rename
        return $this->stageAndPublish(
            validKey: $validKey,
            contents: $contents,
            declaredMetadata: $validatedMetadata,
            targetPath: $targetPath,
            overwrite: true,
        );
    }

    public function get(string $key): ?StoredObject
    {
        $validKey = StorageKey::validate($key);
        $targetPath = $this->resolveFilePath($validKey);
        $this->assertNoSymlinkEscape($targetPath);

        if (!file_exists($targetPath)) {
            return null; // Truly absent
        }

        // Object file exists; any failure to read must throw safe exception
        $rawEnvelope = @file_get_contents($targetPath);
        if ($rawEnvelope === false) {
            throw new StorageSecurityException('Failed to read private object envelope.');
        }

        try {
            $data = json_decode($rawEnvelope, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new StorageSecurityException('Stored private object envelope is corrupted or unreadable.');
        }

        if (
            !is_array($data) ||
            ($data['format'] ?? null) !== self::ENVELOPE_FORMAT ||
            ($data['key'] ?? null) !== $validKey ||
            !isset($data['payload_base64'], $data['sha256'], $data['byte_length'])
        ) {
            throw new StorageSecurityException('Stored private object envelope violates schema invariants.');
        }

        $payload = base64_decode((string) $data['payload_base64'], true);
        if ($payload === false) {
            throw new StorageSecurityException('Failed to decode stored private object payload.');
        }

        $byteLength = strlen($payload);
        $sha256 = hash('sha256', $payload);

        // Cryptographic integrity verification
        if ($byteLength !== (int) $data['byte_length'] || !hash_equals((string) $data['sha256'], $sha256)) {
            throw new StorageSecurityException('Stored private object payload failed cryptographic integrity check.');
        }

        $declaredMetadata = is_array($data['declared_metadata'] ?? null) ? $data['declared_metadata'] : [];
        $lastModifiedAt = is_string($data['stored_at'] ?? null)
            ? $data['stored_at']
            : (new DateTimeImmutable('@' . filemtime($targetPath), new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');

        return new StoredObject(
            key: $validKey,
            contents: $payload,
            byteLength: $byteLength,
            sha256: $sha256,
            declaredMetadata: $declaredMetadata,
            lastModifiedAt: $lastModifiedAt,
        );
    }

    public function has(string $key): bool
    {
        $validKey = StorageKey::validate($key);
        $targetPath = $this->resolveFilePath($validKey);
        $this->assertNoSymlinkEscape($targetPath);

        return file_exists($targetPath);
    }

    public function delete(string $key): StorageDeleteReceipt
    {
        $validKey = StorageKey::validate($key);
        $targetPath = $this->resolveFilePath($validKey);
        $this->assertNoSymlinkEscape($targetPath);

        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');

        if (!file_exists($targetPath)) {
            return new StorageDeleteReceipt(
                key: $validKey,
                status: StorageDeleteReceipt::STATUS_NOT_FOUND,
                deletedAt: $now,
            );
        }

        // Truthful deletion: check unlink result and verify file is actually removed
        $unlinked = @unlink($targetPath);
        if (!$unlinked || file_exists($targetPath)) {
            throw new StorageSecurityException('Failed to delete private object from storage.');
        }

        return new StorageDeleteReceipt(
            key: $validKey,
            status: StorageDeleteReceipt::STATUS_DELETED,
            deletedAt: $now,
        );
    }

    public function getStorageRoot(): string
    {
        return $this->canonicalRoot;
    }

    private function stageAndPublish(
        string $validKey,
        string $contents,
        array $declaredMetadata,
        string $targetPath,
        bool $overwrite,
    ): StoragePutReceipt {
        $this->ensureAndValidateTmpDir();

        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
        $sha256 = hash('sha256', $contents);
        $byteLength = strlen($contents);

        $envelopeJson = $this->buildEnvelopeJson($validKey, $contents, $declaredMetadata, $now, $sha256, $byteLength);

        $randomSuffix = bin2hex(random_bytes(10));
        $tmpFile = $this->tmpDir . DIRECTORY_SEPARATOR . 'tmp_obj_' . $randomSuffix . '.tmp';

        $handle = @fopen($tmpFile, 'wb');
        if ($handle === false) {
            throw new StorageSecurityException('Failed to stage private object envelope.');
        }

        $written = @fwrite($handle, $envelopeJson);
        $flushed = @fflush($handle);
        $closed = @fclose($handle);

        if ($written !== strlen($envelopeJson) || !$flushed || !$closed) {
            @unlink($tmpFile);
            throw new StorageSecurityException('Failed to write complete private object envelope.');
        }

        if (!@chmod($tmpFile, $this->fileMode)) {
            @unlink($tmpFile);
            throw new StorageSecurityException('Failed to enforce 0600 permissions on staged object envelope.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            clearstatcache(true, $tmpFile);
            $actualPerms = fileperms($tmpFile);
            if ($actualPerms === false || ($actualPerms & 0777) !== $this->fileMode) {
                @unlink($tmpFile);
                throw new StorageSecurityException('Staged object envelope violates private 0600 permissions.');
            }
        }

        // Atomic publication
        if ($overwrite) {
            // Overwrite: Atomic rename replaces targetPath instantaneously
            if (!@rename($tmpFile, $targetPath)) {
                @unlink($tmpFile);
                throw new StorageSecurityException('Failed to atomically finalize private object envelope.');
            }
        } else {
            // No-clobber: Atomic hard-link fails if targetPath already exists (POSIX / Linux)
            $published = @link($tmpFile, $targetPath);
            @unlink($tmpFile);

            if (!$published) {
                if (file_exists($targetPath)) {
                    // Object was created concurrently or exists; return truthful no-op
                    $existing = $this->get($validKey);
                    if ($existing !== null) {
                        return new StoragePutReceipt(
                            key: $validKey,
                            status: StoragePutReceipt::STATUS_NO_OP_EXISTS,
                            byteLength: $existing->byteLength,
                            sha256: $existing->sha256,
                            declaredMetadata: $existing->declaredMetadata,
                            storedAt: $existing->lastModifiedAt,
                        );
                    }
                }
                throw new StorageSecurityException('Failed to publish private object envelope.');
            }
        }

        return new StoragePutReceipt(
            key: $validKey,
            status: StoragePutReceipt::STATUS_STORED,
            byteLength: $byteLength,
            sha256: $sha256,
            declaredMetadata: $declaredMetadata,
            storedAt: $now,
        );
    }

    private function buildEnvelopeJson(
        string $validKey,
        string $contents,
        array $declaredMetadata,
        string $storedAt,
        string $sha256,
        int $byteLength,
    ): string {
        $record = [
            'format' => self::ENVELOPE_FORMAT,
            'key' => $validKey,
            'byte_length' => $byteLength,
            'sha256' => $sha256,
            'declared_metadata' => $declaredMetadata,
            'stored_at' => $storedAt,
            'payload_base64' => base64_encode($contents),
        ];

        try {
            return json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (Throwable) {
            throw new StoragePayloadException('Failed to serialize private object envelope.');
        }
    }

    private function validateDeclaredMetadata(array $metadata): array
    {
        if (count($metadata) > self::MAX_METADATA_KEYS) {
            throw new StoragePayloadException('Declared metadata exceeds maximum allowed key count (50).');
        }

        foreach ($metadata as $key => $value) {
            if (!is_string($key) || strlen($key) === 0 || strlen($key) > self::MAX_METADATA_KEY_LENGTH) {
                throw new StoragePayloadException('Declared metadata contains invalid key identifier.');
            }
            if (!preg_match('/^[a-zA-Z0-9_\-\.]{1,64}$/', $key)) {
                throw new StoragePayloadException('Declared metadata key violates allowed character grammar.');
            }
            if (!is_scalar($value) && $value !== null) {
                throw new StoragePayloadException('Declared metadata values must be scalar or null.');
            }
            if (is_string($value) && strlen($value) > 4096) {
                throw new StoragePayloadException('Declared metadata value exceeds maximum length of 4096 bytes.');
            }
        }

        try {
            $json = json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (Throwable) {
            throw new StoragePayloadException('Declared metadata cannot be serialized to JSON.');
        }

        if (strlen($json) > self::MAX_METADATA_BYTES) {
            throw new StoragePayloadException('Declared metadata serialized size exceeds 64 KiB ceiling.');
        }

        return $metadata;
    }

    private function resolveFilePath(string $key): string
    {
        $path = $this->canonicalRoot . DIRECTORY_SEPARATOR . $key . '.object.json';
        $normalizedRoot = rtrim(str_replace('\\', '/', $this->canonicalRoot), '/');
        $normalizedPath = str_replace('\\', '/', $path);

        if (!str_starts_with($normalizedPath, $normalizedRoot . '/')) {
            throw new StorageSecurityException('Storage path escapes canonical root.');
        }

        return $path;
    }

    private function assertNoSymlinkEscape(string $path): void
    {
        if (is_link($path)) {
            throw new StorageSecurityException('Forbidden symlink detected at target storage path.');
        }

        if (file_exists($path)) {
            $real = realpath($path);
            if ($real === false) {
                throw new StorageSecurityException('Storage path could not be resolved.');
            }

            $normalizedRoot = rtrim(str_replace('\\', '/', $this->canonicalRoot), '/');
            $normalizedReal = str_replace('\\', '/', $real);

            if (!str_starts_with($normalizedReal, $normalizedRoot . '/')) {
                throw new StorageSecurityException('Storage target escapes canonical storage root via symlink or redirection.');
            }
        }
    }

    private function ensureAndValidateTmpDir(): void
    {
        if (is_link($this->tmpDir)) {
            throw new StorageSecurityException('Forbidden symlink detected at storage temporary directory.');
        }

        if (!is_dir($this->tmpDir)) {
            if (!@mkdir($this->tmpDir, $this->dirMode, true) && !is_dir($this->tmpDir)) {
                throw new StorageSecurityException('Failed to create storage temporary directory.');
            }
            @chmod($this->tmpDir, $this->dirMode);
        }

        $realTmp = realpath($this->tmpDir);
        if ($realTmp === false) {
            throw new StorageSecurityException('Storage temporary directory cannot be resolved.');
        }

        $normalizedRoot = rtrim(str_replace('\\', '/', $this->canonicalRoot), '/');
        $normalizedRealTmp = str_replace('\\', '/', $realTmp);

        if ($normalizedRealTmp !== $normalizedRoot . '/.tmp') {
            throw new StorageSecurityException('Storage temporary directory escapes canonical root via symlink.');
        }

        if (DIRECTORY_SEPARATOR === '/') {
            $perms = fileperms($realTmp);
            if ($perms !== false && ($perms & 0777) !== 0700) {
                @chmod($realTmp, 0700);
                clearstatcache(true, $realTmp);
                $updatedPerms = fileperms($realTmp);
                if ($updatedPerms === false || ($updatedPerms & 0777) !== 0700) {
                    throw new StorageSecurityException('Storage temporary directory violates private 0700 permission bounds.');
                }
            }
        }
    }

    private function resolveAndValidateRoot(string $root): string
    {
        $trimmed = trim($root);

        if ($trimmed === '') {
            throw new StorageSecurityException('Storage root directory cannot be empty.');
        }

        if (is_link($trimmed)) {
            throw new StorageSecurityException('Configured storage root cannot be a symlink.');
        }

        // Forbidden system roots guard
        $forbidden = ['/', '\\', 'c:\\', 'c:/', '/etc', '/var', '/usr', '/bin', '/sbin'];
        $normalized = strtolower(rtrim(str_replace('\\', '/', $trimmed), '/'));
        if (in_array($normalized, $forbidden, true) || $normalized === '') {
            throw new StorageSecurityException('Configured storage root matches a forbidden system directory.');
        }

        if (!is_dir($trimmed)) {
            if (!@mkdir($trimmed, $this->dirMode, true) && !is_dir($trimmed)) {
                throw new StorageSecurityException('Failed to create configured storage root directory.');
            }
            @chmod($trimmed, $this->dirMode);
        }

        $real = realpath($trimmed);
        if ($real === false) {
            throw new StorageSecurityException('Configured storage root directory cannot be canonically resolved.');
        }

        // Verify existing directory permissions in POSIX environments
        if (DIRECTORY_SEPARATOR === '/') {
            $perms = fileperms($real);
            if ($perms !== false && ($perms & 0777) !== 0700) {
                @chmod($real, 0700);
                clearstatcache(true, $real);
                $updatedPerms = fileperms($real);
                if ($updatedPerms === false || ($updatedPerms & 0777) !== 0700) {
                    throw new StorageSecurityException('Storage root directory violates permission bounds (must be private 0700).');
                }
            }
        }

        return $real;
    }
}
