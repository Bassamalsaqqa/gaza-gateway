<?php
declare(strict_types=1);

namespace Tests\CodexReview;

use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CodexRetentionCheckpointReviewTest extends TestCase
{
    private array $ownedDirectories = [];

    private function ownedRoot(): string
    {
        $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_retention_', DB::connection());
        $this->ownedDirectories[] = $root;
        config(['foundation-services.mail.local_path' => $root]);
        return $root;
    }

    private function entry(string $timestamp): array
    {
        return [
            'capture_id' => 'cap_' . str_repeat('a', 32),
            'outbox_id' => '00000000-0000-4000-8000-000000000001',
            'target_id' => '00000000-0000-4000-8000-000000000002',
            'purpose' => 'passenger_password_reset',
            'expires_at' => $timestamp,
            'captured_at' => '2026-10-10T12:00:00+00:00',
            'revoked' => false,
        ];
    }

    public function testImpossibleCalendarAndLocaleTimestampsAreRejected(): void
    {
        $root = $this->ownedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        foreach (['2026-02-30T12:00:00+00:00', 'January 1, 2026', 123] as $invalid) {
            $entry = $this->entry('2026-10-10T12:30:00+00:00');
            $entry['expires_at'] = $invalid;
            file_put_contents($root . '/' . OwnedCaptureRetentionLedger::LEDGER_FILENAME, json_encode([$entry], JSON_THROW_ON_ERROR));
            $rejected = false;
            try { $ledger->loadLedger(); } catch (DispatchException) { $rejected = true; }
            $this->assertTrue($rejected, 'Malformed timestamp was accepted.');
        }
    }

    public function testSiblingOfPrivateStorageIsRejectedWithoutPermissionChanges(): void
    {
        $foreign = storage_path('app/private_codex_' . bin2hex(random_bytes(8)));
        $this->ownedDirectories[] = $foreign;
        mkdir($foreign, 0750, true);
        chmod($foreign, 0750);
        $before = fileperms($foreign) & 0777;
        $rejected = false;
        try { new OwnedCaptureRetentionLedger($foreign, DB::connection()); } catch (DispatchException) { $rejected = true; }
        clearstatcache(true, $foreign);
        $this->assertTrue($rejected, 'A sibling of private storage was accepted.');
        $this->assertSame($before, fileperms($foreign) & 0777);
    }

    public function testSamePrefixForeignDirectoryWithoutMarkerIsRejectedWithoutChangingPermissions(): void
    {
        $foreign = storage_path('app/private/codex_foreign_' . bin2hex(random_bytes(8)));
        $this->ownedDirectories[] = $foreign;
        mkdir($foreign, 0750, true);
        chmod($foreign, 0750);
        $before = fileperms($foreign) & 0777;
        config(['foundation-services.mail.local_path' => null]);
        $rejected = false;
        try { new OwnedCaptureRetentionLedger($foreign, DB::connection()); } catch (DispatchException) { $rejected = true; }
        clearstatcache(true, $foreign);
        $this->assertTrue($rejected, 'A same-prefix foreign directory without owned marker was accepted.');
        $this->assertSame($before, fileperms($foreign) & 0777);
    }

    public function testFailedReplacementDeletionKeepsOldCaptureTracked(): void
    {
        $root = $this->ownedRoot();
        $old = 'cap_' . str_repeat('a', 32);
        $new = 'cap_' . str_repeat('b', 32);
        $ledger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public function eraseCaptureFile(string $captureId): bool
            {
                return $captureId === 'cap_' . str_repeat('a', 32) ? false : parent::eraseCaptureFile($captureId);
            }
        };
        $now = CarbonImmutable::now('UTC')->startOfSecond();
        $ledger->reserveCapture($old, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(30));
        file_put_contents($root . '/' . $old . '.json', 'synthetic');
        $ledger->commitCapture($old, '00000000-0000-4000-8000-000000000001', $now);

        $ledger->reserveCapture($new, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(30));
        file_put_contents($root . '/' . $new . '.json', 'synthetic');
        try { $ledger->commitCapture($new, '00000000-0000-4000-8000-000000000001', $now); } catch (DispatchException) {}

        $ids = array_column($ledger->loadLedger(), 'capture_id');
        $this->assertFileExists($root . '/' . $old . '.json');
        $this->assertContains($old, $ids);
        $this->assertTrue(!is_file($root . '/' . $new . '.json') || in_array($new, $ids, true), 'New capture was orphaned.');
    }

    public function testBroadPrivateParentIsRejectedWithoutChangingItsPermissions(): void
    {
        $prior = storage_path();
        $sandbox = $prior . '/app/private/codex_storage_' . bin2hex(random_bytes(8));
        $private = $sandbox . '/app/private';
        mkdir($private, 0750, true);
        chmod($private, 0750);
        try {
            app()->useStoragePath($sandbox);
            config(['foundation-services.mail.local_path' => $private . '/mail_sink']);
            $rejected = false;
            try { new OwnedCaptureRetentionLedger($private, DB::connection()); } catch (DispatchException) { $rejected = true; }
            clearstatcache(true, $private);
            $this->assertTrue($rejected, 'Broad private parent was accepted as an owned sink.');
            $this->assertSame(0750, fileperms($private) & 0777);
        } finally {
            app()->useStoragePath($prior);
            rmdir($private);
            rmdir($sandbox . '/app');
            rmdir($sandbox);
        }
    }

    public function testRejectedDeadlineExtensionDoesNotOrphanNewCapture(): void
    {
        $root = $this->ownedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $old = 'cap_' . str_repeat('a', 32);
        $new = 'cap_' . str_repeat('b', 32);
        $now = CarbonImmutable::now('UTC')->startOfSecond();
        $ledger->reserveCapture($old, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(30));
        file_put_contents($root . '/' . $old . '.json', 'synthetic');
        $ledger->commitCapture($old, '00000000-0000-4000-8000-000000000001', $now);

        $rejected = false;
        try {
            $ledger->reserveCapture($new, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(31));
        } catch (DispatchException) {
            $rejected = true;
        }
        $ids = array_column($ledger->loadLedger(), 'capture_id');
        $this->assertTrue($rejected);
        $this->assertContains($old, $ids);
        $this->assertFalse(in_array($new, $ids, true));
    }

    public function testDanglingLockSymlinkDoesNotCreateItsForeignTarget(): void
    {
        $root = $this->ownedRoot();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $foreign = $root . '-foreign';
        $lock = $root . '/' . OwnedCaptureRetentionLedger::LOCK_FILENAME;
        if (is_file($lock)) { unlink($lock); }
        symlink($foreign, $lock);
        try {
            $rejected = false;
            try { $ledger->withLedgerLock(static fn() => null); } catch (DispatchException) { $rejected = true; }
            $this->assertTrue($rejected);
            $this->assertFileDoesNotExist($foreign, 'Opening a dangling lock symlink created a foreign file.');
        } finally {
            if (is_file($foreign)) { unlink($foreign); }
        }
    }

    public function testDoubleEraseFailureCannotOrphanNewCapture(): void
    {
        $root = $this->ownedRoot();
        $ledger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public function eraseCaptureFile(string $captureId): bool { return false; }
        };
        $old = 'cap_' . str_repeat('a', 32);
        $new = 'cap_' . str_repeat('b', 32);
        $now = CarbonImmutable::now('UTC')->startOfSecond();
        $ledger->reserveCapture($old, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(30));
        file_put_contents($root . '/' . $old . '.json', 'synthetic');
        $ledger->commitCapture($old, '00000000-0000-4000-8000-000000000001', $now);

        $ledger->reserveCapture($new, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $now->addMinutes(30));
        file_put_contents($root . '/' . $new . '.json', 'synthetic');
        try { $ledger->commitCapture($new, '00000000-0000-4000-8000-000000000001', $now); } catch (DispatchException) {}

        $ids = array_column($ledger->loadLedger(), 'capture_id');
        $this->assertTrue(!is_file($root . '/' . $new . '.json') || in_array($new, $ids, true), 'Failed erasure left new raw capture without durable retention tracking.');
    }

    protected function tearDown(): void
    {
        foreach ($this->ownedDirectories as $root) {
            if (!is_dir($root) || is_link($root)) { continue; }
            foreach (scandir($root) ?: [] as $name) {
                if ($name === '.' || $name === '..') { continue; }
                $file = $root . '/' . $name;
                if (is_file($file) || is_link($file)) { unlink($file); }
            }
            rmdir($root);
        }
        parent::tearDown();
    }
}
