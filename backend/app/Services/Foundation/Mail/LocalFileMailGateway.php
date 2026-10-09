<?php

declare(strict_types=1);

namespace App\Services\Foundation\Mail;

use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\MailMessage;
use App\Contracts\Mail\MailReceipt;
use App\Contracts\Mail\MailSubmissionInterface;
use DateTimeImmutable;
use DateTimeZone;
use Throwable;

/**
 * Honest local file mail sink for development and testing.
 *
 * Captures bounded mail messages as private files on the local filesystem.
 * Enforces restrictive file permissions (0600), safe directory permissions (0700),
 * and atomic writes. Explicitly marks all receipts as 'captured_locally' and never
 * performs external delivery.
 */
class LocalFileMailGateway implements MailSubmissionInterface
{
    private string $canonicalStorageRoot;
    private int $fileMode;
    private int $dirMode;

    public function __construct(
        string $storagePath,
        int $fileMode = 0600,
        int $dirMode = 0700,
    ) {
        // Guard: File and directory modes must be strictly 0600 and 0700
        if ($fileMode !== 0600) {
            throw new MailCaptureException('Mail file permissions must be strictly 0600.');
        }
        if ($dirMode !== 0700) {
            throw new MailCaptureException('Mail directory permissions must be strictly 0700.');
        }

        $this->fileMode = $fileMode;
        $this->dirMode = $dirMode;
        $this->canonicalStorageRoot = $this->resolveAndValidateRoot($storagePath);
    }

    public function submit(MailMessage $message): MailReceipt
    {
        $captureId = 'cap_' . bin2hex(random_bytes(16));
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $capturedAt = $now->format('Y-m-d\TH:i:s.u\Z');

        $record = [
            'capture_id' => $captureId,
            'captured_at' => $capturedAt,
            'status' => MailReceipt::STATUS_CAPTURED_LOCALLY,
            'recipient' => $message->recipient,
            'subject' => $message->subject,
            'body' => $message->body,
        ];

        try {
            $json = json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (Throwable) {
            throw new MailCaptureException('Failed to serialize mail record for local capture.');
        }

        $payloadHash = hash('sha256', $json);
        $bytesWritten = strlen($json);

        $tempPath = $this->canonicalStorageRoot . DIRECTORY_SEPARATOR . '.' . $captureId . '.tmp';
        $finalPath = $this->canonicalStorageRoot . DIRECTORY_SEPARATOR . $captureId . '.json';

        if (is_link($tempPath) || is_link($finalPath)) {
            throw new MailCaptureException('Forbidden symlink detected at target mail capture path.');
        }

        try {
            // Write to temporary file with exclusive lock
            if (@file_put_contents($tempPath, $json, LOCK_EX) !== $bytesWritten) {
                throw new MailCaptureException('Failed to write temporary mail capture file.');
            }

            if (!@chmod($tempPath, $this->fileMode)) {
                @unlink($tempPath);
                throw new MailCaptureException('Failed to set restrictive permissions on mail capture file.');
            }

            if (DIRECTORY_SEPARATOR === '/') {
                clearstatcache(true, $tempPath);
                $actualPerms = fileperms($tempPath);
                if ($actualPerms === false || ($actualPerms & 0777) !== $this->fileMode) {
                    @unlink($tempPath);
                    throw new MailCaptureException('Mail capture file violates private 0600 permission bounds.');
                }
            }

            // Atomic rename to final target file
            if (!@rename($tempPath, $finalPath)) {
                @unlink($tempPath);
                throw new MailCaptureException('Failed to atomically finalize mail capture file.');
            }
        } catch (MailCaptureException $e) {
            if (file_exists($tempPath)) {
                @unlink($tempPath);
            }
            throw $e;
        } catch (Throwable) {
            if (file_exists($tempPath)) {
                @unlink($tempPath);
            }
            throw new MailCaptureException('Unexpected error occurred during local mail capture.');
        }

        return new MailReceipt(
            captureId: $captureId,
            capturedAt: $capturedAt,
            status: MailReceipt::STATUS_CAPTURED_LOCALLY,
            payloadHash: $payloadHash,
            bytesWritten: $bytesWritten,
        );
    }

    public function send(MailMessage $message): MailReceipt
    {
        return $this->submit($message);
    }

    public function getStorageRoot(): string
    {
        return $this->canonicalStorageRoot;
    }

    private function resolveAndValidateRoot(string $path): string
    {
        $trimmed = trim($path);

        if ($trimmed === '') {
            throw new MailCaptureException('Local mail storage path cannot be empty.');
        }

        if (is_link($trimmed)) {
            throw new MailCaptureException('Configured mail storage root cannot be a symlink.');
        }

        // Forbidden system roots guard
        $forbidden = ['/', '\\', 'c:\\', 'c:/', '/etc', '/var', '/usr', '/bin', '/sbin'];
        $normalized = strtolower(rtrim(str_replace('\\', '/', $trimmed), '/'));
        if (in_array($normalized, $forbidden, true) || $normalized === '') {
            throw new MailCaptureException('Configured mail storage root matches a forbidden system directory.');
        }

        if (!is_dir($trimmed)) {
            if (!@mkdir($trimmed, $this->dirMode, true) && !is_dir($trimmed)) {
                throw new MailCaptureException('Failed to create configured local mail storage directory.');
            }
            @chmod($trimmed, $this->dirMode);
        }

        $real = realpath($trimmed);
        if ($real === false) {
            throw new MailCaptureException('Configured local mail storage directory cannot be resolved.');
        }

        // Verify existing directory permissions in POSIX environments
        if (DIRECTORY_SEPARATOR === '/') {
            $perms = fileperms($real);
            if ($perms !== false && ($perms & 0777) !== 0700) {
                @chmod($real, 0700);
                clearstatcache(true, $real);
                $updatedPerms = fileperms($real);
                if ($updatedPerms === false || ($updatedPerms & 0777) !== 0700) {
                    throw new MailCaptureException('Mail storage root directory violates private 0700 permission bounds.');
                }
            }
        }

        return $real;
    }
}
