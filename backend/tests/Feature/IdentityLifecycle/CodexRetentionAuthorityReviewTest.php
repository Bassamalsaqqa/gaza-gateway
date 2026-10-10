<?php
declare(strict_types=1);

namespace Tests\CodexReview;

use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CodexRetentionAuthorityReviewTest extends TestCase
{
    private array $roots = [];

    private function root(): string
    {
        $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_authority_', DB::connection());
        $this->roots[] = $root;
        config(['foundation-services.mail.local_path' => $root]);
        return $root;
    }

    public function testPostWriteCompatibilityCannotAuthorizeUnreservedCapture(): void
    {
        $root = $this->root();
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $id = 'cap_' . str_repeat('a', 32);
        file_put_contents($root . '/' . $id . '.json', 'synthetic');
        $rejected = false;
        if (!method_exists($ledger, 'recordCapture')) {
            $rejected = true;
        } else {
            try {
                $ledger->recordCapture($id, '00000000-0000-4000-8000-000000000001',
                    '00000000-0000-4000-8000-000000000002', 'passenger_password_reset',
                    CarbonImmutable::now('UTC')->addMinute());
            } catch (DispatchException) { $rejected = true; }
        }
        $this->assertTrue($rejected, 'Unreserved raw capture acquired retention authority after writing.');
    }

    public function testGenericMtimeSweepCannotDeleteForeignCapture(): void
    {
        $root = $this->root();
        $file = $root . '/cap_' . str_repeat('b', 32) . '.json';
        file_put_contents($file, 'synthetic foreign capture');
        touch($file, time() - 7200);
        unlink($root . '/' . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER);
        config(['foundation-services.mail.local_path' => null]);
        $manager = new LocalCaptureRetentionManager();
        if (method_exists($manager, 'cleanupExpiredCaptures')) {
            try { $manager->cleanupExpiredCaptures($root, 3600, 1); }
            catch (DispatchException|\LogicException|\TypeError) {}
        }
        $this->assertFileExists($file, 'Generic mtime cleanup deleted an unowned/untracked raw capture.');
    }

    public function testFailedErasureAttemptsRespectBatchLimit(): void
    {
        $root = $this->root();
        $ledger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public int $attempts = 0;
            public function eraseCaptureFile(string $id): bool { $this->attempts++; return false; }
        };
        $expiry = CarbonImmutable::now('UTC')->startOfSecond()->addMinute();
        foreach (['a', 'b', 'c'] as $letter) {
            $id = 'cap_' . str_repeat($letter, 32);
            $ledger->reserveCapture($id, '00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002', 'passenger_password_reset', $expiry);
            file_put_contents($root . '/' . $id . '.json', 'synthetic');
        }
        $ledger->cleanupExpired($expiry->addSecond(), 1);
        $this->assertLessThanOrEqual(1, $ledger->attempts, 'A failed deletion bypassed the one-item cleanup budget.');
        $this->assertCount(3, $ledger->loadLedger(), 'Failed/skipped records lost retention accounting.');
    }

    public function testProviderChecksOwnedRootBeforeGatewayCanChangePermissions(): void
    {
        $root = $this->root();
        chmod($root, 0755);
        config(['foundation-services.mail.driver' => 'local']);
        app()->forgetInstance(\App\Contracts\Mail\MailSubmissionInterface::class);
        app()->register(\App\Providers\IdentityLifecycleServiceProvider::class);
        $rejected = false;
        try { app()->make(\App\Identity\Dispatch\OutboxDispatcher::class); }
        catch (DispatchException|\App\Contracts\Mail\Exceptions\MailCaptureException) { $rejected = true; }
        clearstatcache(true, $root);
        $this->assertTrue($rejected, 'Container resolution repaired an insecure existing root instead of rejecting it.');
        $this->assertSame(0755, fileperms($root) & 0777);
    }

    protected function tearDown(): void
    {
        foreach ($this->roots as $root) {
            $private = realpath(storage_path('app/private'));
            if ($private === false || dirname($root) !== $private || !str_starts_with(basename($root), 'codex_authority_')) {
                throw new \LogicException('Unsafe disposable cleanup target.');
            }
            foreach (scandir($root) ?: [] as $name) {
                if ($name === '.' || $name === '..') continue;
                $path = $root . '/' . $name;
                if (is_file($path) || is_link($path)) unlink($path);
            }
            rmdir($root);
        }
        parent::tearDown();
    }
}
