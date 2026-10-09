<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\MailMessage;
use App\Contracts\Mail\MailReceipt;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use PHPUnit\Framework\TestCase;

class LocalFileMailGatewayTest extends TestCase
{
    private string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_mail_test_' . bin2hex(random_bytes(8));
        @mkdir($this->tempDir, 0700, true);
    }

    protected function tearDown(): void
    {
        $this->cleanDirectory($this->tempDir);
        parent::tearDown();
    }

    public function test_submit_captures_mail_locally_with_truthful_receipt(): void
    {
        $gateway = new LocalFileMailGateway($this->tempDir);

        $message = new MailMessage(
            recipient: 'ops@gazaairport.com',
            subject: 'Gate Assignment Notification',
            body: 'Flight PS 204 assigned to Gate 3.',
        );

        $receipt = $gateway->submit($message);

        // Receipt verification: status must be explicitly captured_locally
        $this->assertSame(MailReceipt::STATUS_CAPTURED_LOCALLY, $receipt->status);
        $this->assertNotSame('sent', $receipt->status);
        $this->assertNotSame('delivered', $receipt->status);
        $this->assertStringStartsWith('cap_', $receipt->captureId);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $receipt->capturedAt);
        $this->assertSame(64, strlen($receipt->payloadHash));
        $this->assertGreaterThan(0, $receipt->bytesWritten);

        // Verification of privacy boundary: receipt strictly omits recipient and body
        $receiptArray = $receipt->toArray();
        $this->assertArrayNotHasKey('recipient', $receiptArray);
        $this->assertArrayNotHasKey('body', $receiptArray);
        $this->assertArrayNotHasKey('subject', $receiptArray);

        $debugInfo = $receipt->__debugInfo();
        $this->assertArrayNotHasKey('recipient', $debugInfo);
        $this->assertArrayNotHasKey('body', $debugInfo);

        // Filesystem verification: actual file stored privately under configured root
        $capturedFile = $this->tempDir . DIRECTORY_SEPARATOR . $receipt->captureId . '.json';
        $this->assertFileExists($capturedFile);

        $rawJson = file_get_contents($capturedFile);
        $this->assertNotFalse($rawJson);
        $this->assertSame($receipt->bytesWritten, strlen($rawJson));
        $this->assertSame($receipt->payloadHash, hash('sha256', $rawJson));

        // Decoded content verification
        $data = json_decode($rawJson, true);
        $this->assertIsArray($data);
        $this->assertSame($receipt->captureId, $data['capture_id']);
        $this->assertSame($receipt->capturedAt, $data['captured_at']);
        $this->assertSame('captured_locally', $data['status']);
        $this->assertSame('ops@gazaairport.com', $data['recipient']);
        $this->assertSame('Gate Assignment Notification', $data['subject']);
        $this->assertSame('Flight PS 204 assigned to Gate 3.', $data['body']);

        // Permissions check in Unix environment
        if (DIRECTORY_SEPARATOR === '/') {
            $perms = fileperms($capturedFile) & 0777;
            $this->assertSame(0600, $perms);
        }
    }

    public function test_send_alias_functions_identically(): void
    {
        $gateway = new LocalFileMailGateway($this->tempDir);

        $message = new MailMessage(
            recipient: 'support@gazaairport.com',
            subject: 'Luggage Inquiry',
            body: 'Reference GZA-7K8P tracking inquiry.',
        );

        $receipt = $gateway->send($message);
        $this->assertSame(MailReceipt::STATUS_CAPTURED_LOCALLY, $receipt->status);
        $this->assertFileExists($this->tempDir . DIRECTORY_SEPARATOR . $receipt->captureId . '.json');
    }

    public function test_rejects_empty_or_forbidden_storage_root(): void
    {
        $this->expectException(MailCaptureException::class);
        $this->expectExceptionMessage('Local mail storage path cannot be empty');

        new LocalFileMailGateway('');
    }

    public function test_rejects_system_root_as_storage_directory(): void
    {
        $this->expectException(MailCaptureException::class);
        $this->expectExceptionMessage('forbidden system directory');

        new LocalFileMailGateway('/');
    }

    public function test_rejects_unsafe_configured_file_modes(): void
    {
        $this->expectException(MailCaptureException::class);
        $this->expectExceptionMessage('strictly 0600');

        new LocalFileMailGateway(
            storagePath: $this->tempDir,
            fileMode: 0777,
        );
    }

    public function test_rejects_unsafe_configured_dir_modes(): void
    {
        $this->expectException(MailCaptureException::class);
        $this->expectExceptionMessage('strictly 0700');

        new LocalFileMailGateway(
            storagePath: $this->tempDir,
            dirMode: 0777,
        );
    }

    public function test_symlink_mail_root_is_rejected(): void
    {
        if (!function_exists('symlink')) {
            $this->markTestSkipped('Symlink function is not available.');
        }

        $realTarget = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_mail_realtarget_' . bin2hex(random_bytes(6));
        @mkdir($realTarget, 0700, true);
        $symlinkRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_mail_symlink_' . bin2hex(random_bytes(6));

        $created = @symlink($realTarget, $symlinkRoot);
        if (!$created) {
            $this->cleanDirectory($realTarget);
            $this->markTestSkipped('Symlink creation not permitted.');
        }

        try {
            new LocalFileMailGateway($symlinkRoot);
            $this->fail('Expected MailCaptureException on symlinked mail root.');
        } catch (MailCaptureException $e) {
            $this->assertStringContainsString('cannot be a symlink', $e->getMessage());
        } finally {
            @unlink($symlinkRoot);
            $this->cleanDirectory($realTarget);
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
