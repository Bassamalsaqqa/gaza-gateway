<?php
declare(strict_types=1);

namespace Tests\CodexReview;

use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\Exceptions\DispatchException;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;

final class CodexLifecycleCorrection03ReviewTest extends TestCase
{
    public function testLedgerRejectsUnknownMetadata(): void
    {
        $dir = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_ledger_', DB::connection());
        $path = $dir . '/' . OwnedCaptureRetentionLedger::LEDGER_FILENAME;
        $entry = [
            'capture_id' => 'cap_' . str_repeat('a', 32),
            'outbox_id' => '00000000-0000-4000-8000-000000000001',
            'target_id' => '00000000-0000-4000-8000-000000000002',
            'purpose' => 'passenger_password_reset',
            'expires_at' => '2026-10-10T12:30:00+00:00',
            'captured_at' => '2026-10-10T12:00:00+00:00',
            'revoked' => false,
            'unexpected_metadata' => 'invalid',
        ];
        try {
            file_put_contents($path, json_encode([$entry], JSON_THROW_ON_ERROR));
            $ledger = new OwnedCaptureRetentionLedger($dir, DB::connection());
            $this->expectException(DispatchException::class);
            $ledger->loadLedger();
        } finally {
            if (is_file($path)) { unlink($path); }
            $marker = $dir . '/' . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER;
            if (is_file($marker)) { unlink($marker); }
            @rmdir($dir);
        }
    }

    public function testCleanupConnectionTypeIsRealLaravelConnection(): void
    {
        $parameter = (new \ReflectionMethod(LocalCaptureRetentionManager::class, 'cleanupAtOriginalDeadline'))->getParameters()[3];
        $this->assertSame(\Illuminate\Database\ConnectionInterface::class, $parameter->getType()->getName());
    }

    public function testFixtureGuardChecksProcessEnvironment(): void
    {
        $prior = getenv('APP_ENV');
        try {
            putenv('APP_ENV=local');
            $this->expectException(\RuntimeException::class);
            LifecycleTestFactory::assertTestingEnvironment();
        } finally {
            putenv($prior === false ? 'APP_ENV' : 'APP_ENV=' . $prior);
        }
    }
}
