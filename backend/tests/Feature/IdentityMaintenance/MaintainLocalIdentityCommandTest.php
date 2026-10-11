<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityMaintenance;

use App\Console\Commands\MaintainLocalIdentity;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\ProofPurpose;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityMaintenance\MaintenanceTestFixture;
use Tests\TestCase;

/**
 * Focused verification tests for MaintainLocalIdentity console command.
 *
 * Verifies:
 * - Strict limit lexical integer bounds validation (1..100) returning exit code 2.
 * - Environment profile refusal (production, staging, mismatch, driver, connection, DB, mail driver, outer TX) returning exit code 2 before any service resolution or file writes.
 * - Caller outer transaction rejection before maintenance actions.
 * - Pure maintenance cycle without --dispatch: expires outbox ciphertext and cleans ledger without capturing.
 * - Explicit --dispatch opt-in: captures eligible queued items locally into owned ledger without marking delivery in DB.
 * - Expired and revoked capture cleanup purges raw files at authoritative deadline.
 * - Multiple deletion failures preserve retry metadata and original deadlines in ledger.
 * - Output hygiene across terminal table and JSON mode: zero tokens, passwords, emails, raw UUIDs, filenames, SQL, or stack traces.
 */
final class MaintainLocalIdentityCommandTest extends TestCase
{
    private MaintenanceTestFixture $fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertTestingGuards();
        $this->fixture = MaintenanceTestFixture::create();
        $this->fixture->assertReady();

        // Ensure Artisan recognizes the command in test environment
        try {
            Artisan::call('identity:maintain-local', ['--help' => true]);
        } catch (\Symfony\Component\Console\Exception\CommandNotFoundException) {
            $this->app->make(\Illuminate\Contracts\Console\Kernel::class)->registerCommand(new MaintainLocalIdentity());
        }
    }

    protected function tearDown(): void
    {
        $this->assertTestingGuards();
        $this->fixture->cleanup();
        parent::tearDown();
    }

    private function assertTestingGuards(): void
    {
        $processEnv = getenv('APP_ENV');
        if ($processEnv !== 'testing') {
            throw new \RuntimeException('Test suite requires process APP_ENV=testing, got: ' . ($processEnv ?: 'empty'));
        }

        if (!function_exists('app') || !app()->environment('testing')) {
            throw new \RuntimeException('Test suite requires application environment testing.');
        }

        $defaultConn = config('database.default');
        if ($defaultConn !== 'pgsql_test') {
            throw new \RuntimeException("Test suite requires default connection pgsql_test, got: [{$defaultConn}]");
        }

        $connection = DB::connection();
        if ($connection->getName() !== 'pgsql_test') {
            throw new \RuntimeException("Test suite requires actual connection name pgsql_test, got: [{$connection->getName()}]");
        }

        if ($connection->getDriverName() !== 'pgsql') {
            throw new \RuntimeException("Test suite requires actual database driver pgsql, got: [{$connection->getDriverName()}]");
        }

        try {
            $row = $connection->selectOne('SELECT current_database() AS db');
            $liveDb = (string) ($row?->db ?? '');
        } catch (\Throwable) {
            throw new \RuntimeException('Test suite failed to verify live database target.');
        }

        if ($liveDb !== 'gaza_gateway_test') {
            throw new \RuntimeException("Test suite requires live test database gaza_gateway_test, got: [{$liveDb}]");
        }
    }

    /**
     * Rejects invalid, non-lexical, non-canonical, or out-of-range --limit values with exit code 2.
     */
    public function test_invalid_limit_option_refuses_with_exit_code_two_and_sanitized_output(): void
    {
        $invalidLimits = [
            '0',
            '101',
            '-1',
            'abc',
            '50.5',
            '050',
            ' 50',
            '50 ',
            '',
        ];

        foreach ($invalidLimits as $invalidLimit) {
            $exitCode = Artisan::call('identity:maintain-local', ['--limit' => $invalidLimit]);
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode, "Limit '{$invalidLimit}' must be rejected with exit code 2.");
            $this->assertStringContainsString('ERR_INVALID_OPTIONS', $output);
            $this->assertStringNotContainsString('password', strtolower($output));
            $this->assertStringNotContainsString('select ', strtolower($output));
        }
    }

    /**
     * Refuses execution when process APP_ENV is production or mismatches application environment.
     */
    public function test_profile_refusal_when_process_app_env_mismatches_or_is_production(): void
    {
        $originalEnv = getenv('APP_ENV');
        putenv('APP_ENV=production');

        try {
            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_ENV', $output);
        } finally {
            putenv('APP_ENV=' . ($originalEnv !== false ? $originalEnv : 'testing'));
        }
    }

    /**
     * Refuses execution when database driver is not pgsql.
     */
    public function test_profile_refusal_when_database_driver_mismatches(): void
    {
        $originalDriver = config('database.connections.pgsql_test.driver');
        config(['database.connections.pgsql_test.driver' => 'mysql']);

        try {
            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_DRIVER', $output);
        } finally {
            config(['database.connections.pgsql_test.driver' => $originalDriver]);
        }
    }

    /**
     * Refuses execution when default database connection is not pgsql_test in testing.
     */
    public function test_profile_refusal_when_default_database_connection_mismatches(): void
    {
        $originalDefault = config('database.default');
        config(['database.default' => 'pgsql']);

        try {
            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_CONNECTION', $output);
        } finally {
            config(['database.default' => $originalDefault]);
        }
    }

    /**
     * Refuses execution when resolved database connection name does not match expected target.
     */
    public function test_profile_refusal_when_actual_connection_name_mismatches(): void
    {
        $originalDb = $this->app->make('db');
        $mockDb = \Mockery::mock(\Illuminate\Database\Connection::class);
        $mockDb->shouldReceive('getName')->andReturn('mismatched_connection');

        $dbManager = \Mockery::mock(\Illuminate\Database\DatabaseManager::class);
        $dbManager->shouldReceive('connection')->with('pgsql_test')->andReturn($mockDb);

        try {
            $this->app->instance('db', $dbManager);
            DB::clearResolvedInstance('db');

            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_CONNECTION', $output);
        } finally {
            $this->app->instance('db', $originalDb);
            DB::clearResolvedInstance('db');
        }
    }

    /**
     * Refuses execution when resolved database connection driver is not pgsql.
     */
    public function test_profile_refusal_when_actual_connection_driver_mismatches(): void
    {
        $originalDb = $this->app->make('db');
        $mockDb = \Mockery::mock(\Illuminate\Database\Connection::class);
        $mockDb->shouldReceive('getName')->andReturn('pgsql_test');
        $mockDb->shouldReceive('getDriverName')->andReturn('sqlite');

        $dbManager = \Mockery::mock(\Illuminate\Database\DatabaseManager::class);
        $dbManager->shouldReceive('connection')->with('pgsql_test')->andReturn($mockDb);

        try {
            $this->app->instance('db', $dbManager);
            DB::clearResolvedInstance('db');

            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_DRIVER', $output);
        } finally {
            $this->app->instance('db', $originalDb);
            DB::clearResolvedInstance('db');
        }
    }

    /**
     * Refuses execution when foundation mail driver is not local.
     */
    public function test_profile_refusal_when_foundation_mail_driver_not_local(): void
    {
        $originalDriver = config('foundation-services.mail.driver');
        config(['foundation-services.mail.driver' => 'smtp']);

        try {
            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_MAIL_DRIVER', $output);
        } finally {
            config(['foundation-services.mail.driver' => $originalDriver]);
        }
    }

    /**
     * Rejects caller invocation from inside an uncommitted outer transaction.
     */
    public function test_caller_outer_transaction_rejected_before_maintenance(): void
    {
        $this->fixture->assertReady();
        $this->fixture->createOwnedRoot();

        DB::beginTransaction();
        try {
            $exitCode = Artisan::call('identity:maintain-local');
            $output = Artisan::output();

            $this->assertSame(MaintainLocalIdentity::EXIT_INVALID_OPTIONS, $exitCode);
            $this->assertStringContainsString('ERR_PROFILE_REFUSAL_TRANSACTION', $output);
        } finally {
            DB::rollBack();
        }
    }

    /**
     * Pure maintenance cycle without --dispatch:
     * - Erases ciphertext and marks expired past-deadline outbox rows.
     * - Does NOT capture or dispatch eligible queued items.
     * - Output contains fixed stage names and aggregate counts only.
     */
    public function test_pure_maintenance_without_dispatch_expires_outbox_and_reconciles_without_capturing(): void
    {
        $this->fixture->assertReady();
        $root = $this->fixture->createOwnedRoot();

        $userId = $this->fixture->createTrackedUser();
        $expiredOutboxId = $this->fixture->createTrackedExpiredOutbox($userId);

        $validProof = $this->fixture->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $queuedOutboxId = $this->fixture->enqueueTrackedProof($validProof);

        $exitCode = Artisan::call('identity:maintain-local', ['--limit' => 50]);
        $output = Artisan::output();

        $this->assertSame(MaintainLocalIdentity::EXIT_SUCCESS, $exitCode);
        $this->assertStringContainsString('Local identity maintenance cycle completed.', $output);
        $this->assertStringContainsString('Outbox expired and erased', $output);
        $this->assertStringContainsString('Capture files cleaned', $output);
        $this->assertStringNotContainsString('Captured locally', $output);

        // Verify expired outbox row was updated
        $expiredRow = DB::table('security_dispatch_outbox')->where('id', $expiredOutboxId)->first();
        $this->assertNotNull($expiredRow);
        $this->assertSame('expired', $expiredRow->status);
        $this->assertNull($expiredRow->encrypted_payload);

        // Verify queued outbox row remained queued and uncaptured
        $queuedRow = DB::table('security_dispatch_outbox')->where('id', $queuedOutboxId)->first();
        $this->assertNotNull($queuedRow);
        $this->assertSame('queued', $queuedRow->status);
        $this->assertNotNull($queuedRow->encrypted_payload);

        // Verify no capture file was written
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $this->assertFalse($ledger->hasActiveCapture($queuedOutboxId));
    }

    /**
     * Explicit --dispatch opt-in:
     * - Captures eligible queued outbox items locally into owned ledger.
     * - Outbox row remains 'queued' (never claimed delivered or accepted).
     * - Writes private 0600 JSON capture file in owned root.
     * - Output describes local capture, never delivery.
     */
    public function test_eligible_local_capture_via_explicit_dispatch_opt_in(): void
    {
        $this->fixture->assertReady();
        $root = $this->fixture->createOwnedRoot();

        $userId = $this->fixture->createTrackedUser();
        $proof = $this->fixture->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->fixture->enqueueTrackedProof($proof);

        $exitCode = Artisan::call('identity:maintain-local', [
            '--limit' => 50,
            '--dispatch' => true,
        ]);
        $output = Artisan::output();

        $this->assertSame(MaintainLocalIdentity::EXIT_SUCCESS, $exitCode);
        $this->assertStringContainsString('Local identity maintenance cycle completed.', $output);
        $this->assertStringContainsString('Captured locally', $output);
        $this->assertStringNotContainsString('delivered', strtolower($output));

        // Outbox row invariant: remains queued, never accepted or given external provider ID
        $outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
        $this->assertNotNull($outboxRow);
        $this->assertSame('queued', $outboxRow->status);
        $this->assertNull($outboxRow->provider_message_id);
        $this->assertNull($outboxRow->accepted_at);

        // Ledger records active capture
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $this->assertTrue($ledger->hasActiveCapture($outboxId));

        $captureId = $ledger->getActiveCaptureId($outboxId);
        $this->assertNotNull($captureId);

        $captureFile = $root . DIRECTORY_SEPARATOR . $captureId . '.json';
        $this->assertFileExists($captureFile);

        // Verify no sensitive tokens or emails leaked to output
        $this->assertStringNotContainsString($userId, $output);
        $this->assertStringNotContainsString($outboxId, $output);
        $this->assertStringNotContainsString($captureId, $output);
    }

    /**
     * Authoritative cleanup purges expired or revoked capture files at original deadline.
     */
    public function test_expired_and_revoked_cleanup_purges_capture_files_at_original_deadline(): void
    {
        $this->fixture->assertReady();
        $root = $this->fixture->createOwnedRoot();

        $userId = $this->fixture->createTrackedUser();
        $proof = $this->fixture->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->fixture->enqueueTrackedProof($proof);

        // Step 1: Capture locally
        $exitCode = Artisan::call('identity:maintain-local', ['--dispatch' => true]);
        $this->assertSame(MaintainLocalIdentity::EXIT_SUCCESS, $exitCode);

        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $captureId = $ledger->getActiveCaptureId($outboxId);
        $this->assertNotNull($captureId);
        $captureFile = $root . DIRECTORY_SEPARATOR . $captureId . '.json';
        $this->assertFileExists($captureFile);

        // Step 2: Scrub the outbox record
        DB::table('security_dispatch_outbox')
            ->where('id', $outboxId)
            ->update([
                'status' => 'scrubbed',
                'scrubbed_at' => DB::raw('clock_timestamp()'),
                'encrypted_payload' => null,
            ]);

        // Step 3: Run maintenance cycle (reconciles revoked/scrubbed records)
        $exitCode2 = Artisan::call('identity:maintain-local', ['--limit' => 50]);
        $this->assertSame(MaintainLocalIdentity::EXIT_SUCCESS, $exitCode2);

        // Capture file must be purged
        $this->assertFileDoesNotExist($captureFile);
        $this->assertFalse($ledger->hasActiveCapture($outboxId));
    }

    /**
     * When unlinking fails, metadata is durably retained in ledger with state=failed_cleanup and original deadline,
     * and the command exits with code 1 reporting partial_failure category.
     */
    public function test_multiple_deletion_failures_preserve_metadata_in_ledger(): void
    {
        $root = $this->fixture->createOwnedRoot();
        $userId = $this->fixture->createTrackedUser();
        $outboxIds = [];
        foreach ([ProofPurpose::PassengerPasswordReset, ProofPurpose::PassengerEmailVerification] as $purpose) {
            $proof = $this->fixture->issueTrackedProof($purpose, $userId);
            $outboxIds[] = $this->fixture->enqueueTrackedProof($proof);
        }
        $this->assertSame(0, Artisan::call('identity:maintain-local', ['--dispatch' => true]));
        $ledger = new OwnedCaptureRetentionLedger($root, DB::connection());
        $original = $ledger->loadLedger();
        $this->assertCount(2, $original);
        DB::table('security_dispatch_outbox')->whereIn('id', $outboxIds)->update([
            'status' => 'scrubbed', 'scrubbed_at' => DB::raw('clock_timestamp()'), 'encrypted_payload' => null,
        ]);
        // Linux unlink permission depends on the directory, not the file mode. Inject two real erasure failures.
        $failingLedger = new class($root, DB::connection()) extends OwnedCaptureRetentionLedger {
            public int $attempts = 0;
            public function eraseCaptureFile(string $captureId): bool
            {
                $this->attempts++;
                return false;
            }
        };
        $this->app->instance(OwnedCaptureRetentionLedger::class, $failingLedger);
        $this->app->forgetInstance(\App\Identity\Dispatch\OutboxDispatcher::class);
        try {
            $exitCode = Artisan::call('identity:maintain-local', ['--limit' => 50, '--json' => true]);
            $output = json_decode(trim(Artisan::output()), true, 512, JSON_THROW_ON_ERROR);
            $this->assertSame(1, $exitCode);
            $this->assertSame('error', $output['status']);
            $this->assertSame('partial_failure', $output['category']);
            $this->assertSame(2, $output['failed_cleanup_count']);
            $this->assertGreaterThanOrEqual(2, $failingLedger->attempts);
            $retained = $failingLedger->loadLedger();
            $this->assertCount(2, $retained);
            foreach ($original as $entry) {
                $matching = array_values(array_filter($retained, fn (array $r) => $r['capture_id'] === $entry['capture_id']));
                $this->assertCount(1, $matching);
                $this->assertSame('failed_cleanup', $matching[0]['state']);
                $this->assertSame($entry['expires_at'], $matching[0]['expires_at']);
                $this->assertFileExists($root . '/' . $entry['capture_id'] . '.json');
            }
        } finally {
            $this->app->forgetInstance(\App\Identity\Dispatch\OutboxDispatcher::class);
            $this->app->forgetInstance(OwnedCaptureRetentionLedger::class);
        }
    }

    /**
     * Partial failure exits with code 1 and safe partial_failure category when dispatchBatch has failedCount > 0.
     */
    public function test_partial_failure_exit_when_dispatch_batch_has_failed_count(): void
    {
        $this->fixture->assertReady();
        $this->fixture->createOwnedRoot();

        $userId = $this->fixture->createTrackedUser();
        $proof = $this->fixture->issueTrackedProof(ProofPurpose::PassengerEmailVerification, $userId);
        $outboxId = $this->fixture->enqueueTrackedProof($proof);

        // Intentionally corrupt encrypted payload so decrypt fails during dispatchBatch
        DB::table('security_dispatch_outbox')
            ->where('id', $outboxId)
            ->update([
                'encrypted_payload' => 'invalid_base64_payload_corrupted',
            ]);

        $exitCode = Artisan::call('identity:maintain-local', [
            '--dispatch' => true,
            '--json' => true,
        ]);
        $output = trim(Artisan::output());

        $this->assertSame(MaintainLocalIdentity::EXIT_FAILURE, $exitCode);
        $decoded = json_decode($output, true);
        $this->assertIsArray($decoded);
        $this->assertSame('error', $decoded['status']);
        $this->assertSame('partial_failure', $decoded['category']);
        $this->assertArrayHasKey('dispatch', $decoded);
        $this->assertGreaterThan(0, $decoded['dispatch']['failed_count']);
    }

    /**
     * JSON output mode emits well-formed JSON with integer counts and zero leaked secrets.
     */
    public function test_output_hygiene_and_json_mode(): void
    {
        $this->fixture->assertReady();
        $this->fixture->createOwnedRoot();

        $exitCode = Artisan::call('identity:maintain-local', ['--json' => true]);
        $output = trim(Artisan::output());

        $this->assertSame(MaintainLocalIdentity::EXIT_SUCCESS, $exitCode);

        $decoded = json_decode($output, true);
        $this->assertIsArray($decoded);
        $this->assertSame('success', $decoded['status']);
        $this->assertArrayHasKey('outbox_expired_count', $decoded);
        $this->assertArrayHasKey('capture_cleaned_count', $decoded);
        $this->assertIsInt($decoded['outbox_expired_count']);
        $this->assertIsInt($decoded['capture_cleaned_count']);

        // Check for zero secret/credential leakage
        $this->assertStringNotContainsString('password', strtolower($output));
        $this->assertStringNotContainsString('token', strtolower($output));
        $this->assertStringNotContainsString('@example.com', $output);
    }
}
