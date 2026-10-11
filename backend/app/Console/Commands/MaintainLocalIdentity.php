<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Contracts\Mail\MailSubmissionInterface;
use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Bounded single-cycle local identity maintenance command.
 *
 * Enforces:
 * - Exactly one bounded cycle (1..100 items).
 * - Explicit --dispatch opt-in for local capture; otherwise only expiration/erasure and ledger cleanup.
 * - Strict profile guards: process APP_ENV and bootstrapped app environment must be local or testing and match.
 * - Default PostgreSQL connection pgsql (local) or pgsql_test (testing), driver pgsql, exact live database match.
 * - Fails closed before any service resolution or file writes on profile mismatch, outer transaction, or non-local mail driver.
 * - Output hygiene: aggregate integer counts and fixed stage names only; never exposes raw tokens, filenames, emails, PII, SQL, or stack traces.
 * - Local capture is strictly marked as capture, never delivery.
 */
final class MaintainLocalIdentity extends Command
{
    public const EXIT_SUCCESS = 0;
    public const EXIT_FAILURE = 1;
    public const EXIT_INVALID_OPTIONS = 2;

    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'identity:maintain-local
                            {--limit=50 : Bounded batch size between 1 and 100}
                            {--dispatch : Explicit opt-in to bounded local capture of eligible queued items}
                            {--json : Output aggregate results as JSON}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Execute a bounded single cycle of local identity outbox expiration, capture ledger reconciliation, and optional local capture';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $rawLimit = $this->option('limit');
        if (!$this->isValidLimit($rawLimit)) {
            return $this->failWithCategory(
                'ERR_INVALID_OPTIONS',
                'Option --limit must be canonical lexical integer between 1 and 100.',
                self::EXIT_INVALID_OPTIONS
            );
        }
        $limit = (int) $rawLimit;

        // Guard 1: Process and bootstrapped application environment matching
        $processEnv = getenv('APP_ENV');
        $appEnv = $this->laravel->environment();

        if (!is_string($processEnv) || $processEnv === '' || $processEnv !== $appEnv || !in_array($processEnv, ['local', 'testing'], true)) {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_ENV',
                'APP_ENV must be local or testing and match bootstrapped application environment.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        // Guard 2: Default database connection configuration
        $defaultConn = (string) config('database.default');
        $expectedConn = $processEnv === 'local' ? 'pgsql' : 'pgsql_test';
        if ($defaultConn !== $expectedConn) {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_CONNECTION',
                'Default database connection must match environment target.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        $connDriver = (string) config("database.connections.{$defaultConn}.driver");
        if ($connDriver !== 'pgsql') {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_DRIVER',
                'Database connection driver must be pgsql.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        $configDb = (string) config("database.connections.{$defaultConn}.database");
        $expectedDb = $processEnv === 'local' ? 'gaza_gateway_dev' : 'gaza_gateway_test';
        if ($configDb !== $expectedDb) {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_DATABASE_CONFIG',
                'Configured database name must match expected environment database.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        // Guard 3: Foundation mail driver configuration
        $mailDriver = (string) config('foundation-services.mail.driver');
        if ($mailDriver !== 'local') {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_MAIL_DRIVER',
                'Mail driver must be strictly configured as local.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        // Guard 4: Live database verification and outer transaction check
        try {
            $db = DB::connection($defaultConn);

            if ($db->getName() !== $expectedConn) {
                return $this->failWithCategory(
                    'ERR_PROFILE_REFUSAL_CONNECTION',
                    'Resolved database connection name must match expected environment target.',
                    self::EXIT_INVALID_OPTIONS
                );
            }

            if ($db->getDriverName() !== 'pgsql') {
                return $this->failWithCategory(
                    'ERR_PROFILE_REFUSAL_DRIVER',
                    'Resolved database connection driver must be pgsql.',
                    self::EXIT_INVALID_OPTIONS
                );
            }

            if ($db->transactionLevel() > 0) {
                return $this->failWithCategory(
                    'ERR_PROFILE_REFUSAL_TRANSACTION',
                    'Cannot execute local maintenance from inside an active outer transaction.',
                    self::EXIT_INVALID_OPTIONS
                );
            }

            $row = $db->selectOne('SELECT current_database() AS db');
            $liveDb = (string) ($row?->db ?? '');
            if ($liveDb !== $expectedDb) {
                return $this->failWithCategory(
                    'ERR_PROFILE_REFUSAL_LIVE_DATABASE',
                    'Live connected database does not match expected environment database.',
                    self::EXIT_INVALID_OPTIONS
                );
            }
        } catch (\Throwable) {
            return $this->failWithCategory(
                'ERR_PROFILE_REFUSAL_DATABASE_UNAVAILABLE',
                'Failed to verify live database target.',
                self::EXIT_INVALID_OPTIONS
            );
        }

        // Resolve services only AFTER all environment, config, and database guards pass
        try {
            $ledger = null;
            $dispatcher = null;

            if ($this->laravel->bound(OutboxDispatcher::class)) {
                $dispatcher = $this->laravel->make(OutboxDispatcher::class);
                $ledger = $dispatcher->getCaptureLedger();
            }

            if ($ledger === null) {
                if ($this->laravel->bound(OwnedCaptureRetentionLedger::class)) {
                    $ledger = $this->laravel->make(OwnedCaptureRetentionLedger::class);
                } else {
                    $sinkPath = (string) config(
                        'foundation-services.mail.local_path',
                        storage_path('app/private/mail_sink')
                    );
                    $ledger = new OwnedCaptureRetentionLedger($sinkPath, $db);
                }
            }

            if ($dispatcher === null) {
                $mailSubmission = $this->laravel->make(MailSubmissionInterface::class);
                if (!$mailSubmission instanceof LocalFileMailGateway) {
                    return $this->failWithCategory(
                        'ERR_UNSUPPORTED_MAIL_GATEWAY',
                        'Mail gateway must be an instance of LocalFileMailGateway.',
                        self::EXIT_FAILURE
                    );
                }

                $encrypter = $this->laravel->make(Encrypter::class);
                $dispatcher = new OutboxDispatcher(
                    mailSubmission: $mailSubmission,
                    encrypter: $encrypter,
                    db: $db,
                    captureLedger: $ledger,
                );
            }
        } catch (\Throwable) {
            return $this->failWithCategory(
                'ERR_SERVICE_INITIALIZATION',
                'Failed to initialize required identity lifecycle services.',
                self::EXIT_FAILURE
            );
        }

        // Bounded maintenance execution outside caller transactions
        $dispatchOptIn = (bool) $this->option('dispatch');

        try {
            // 1. Expire past-deadline outbox records and permanently erase ciphertext
            $expiredCount = $dispatcher->expireAndErase($limit);

            // 2. Authoritative retention ledger reconciliation and expired capture file cleanup
            $cleanedCount = $ledger->cleanupExpired(now: null, batchLimit: $limit, conn: $db);

            // 3. Optional bounded local capture (only when --dispatch is explicitly supplied)
            $batchResult = null;
            if ($dispatchOptIn) {
                if ($db->transactionLevel() > 0) {
                    return $this->failWithCategory(
                        'ERR_PROFILE_REFUSAL_TRANSACTION',
                        'Cannot execute local dispatch batch from inside an active outer transaction.',
                        self::EXIT_INVALID_OPTIONS
                    );
                }
                $batchResult = $dispatcher->dispatchBatch($limit);
            }

            // Expired source/subject budgets have a bounded durable retention path.
            $prunedRateCount = (new \App\Identity\RateLimiting\DurableRateLimiter($db))->pruneExpired($limit);
            $expiredStaffCount = (new \App\Identity\Staff\StaffTransientCleanup($db))->expire($limit);

            // 4. Authoritative check of retained owned ledger entries via actual loadLedger API
            $failedCleanupCount = 0;
            $retainedEntries = $ledger->loadLedger();
            foreach ($retainedEntries as $entry) {
                if (($entry['state'] ?? '') === 'failed_cleanup') {
                    $failedCleanupCount++;
                }
            }
        } catch (\Throwable) {
            return $this->failWithCategory(
                'ERR_EXECUTION_FAILURE',
                'Local identity maintenance execution encountered an error.',
                self::EXIT_FAILURE
            );
        }

        $dispatchFailedCount = $batchResult?->failedCount ?? 0;
        $hasPartialFailure = ($failedCleanupCount > 0) || ($dispatchFailedCount > 0);

        // Output aggregate metrics
        if ($this->option('json')) {
            $payload = [
                'status' => $hasPartialFailure ? 'error' : 'success',
                'outbox_expired_count' => $expiredCount,
                'capture_cleaned_count' => $cleanedCount,
                'failed_cleanup_count' => $failedCleanupCount,
                'rate_buckets_pruned_count' => $prunedRateCount,
                'staff_transient_expired_count' => $expiredStaffCount,
            ];
            if ($hasPartialFailure) {
                $payload['category'] = 'partial_failure';
            }
            if ($batchResult !== null) {
                $payload['dispatch'] = [
                    'processed_count' => $batchResult->processedCount,
                    'captured_locally_count' => $batchResult->capturedLocallyCount,
                    'failed_count' => $batchResult->failedCount,
                    'expired_count' => $batchResult->expiredCount,
                ];
            }
            $this->line((string) json_encode($payload, JSON_UNESCAPED_SLASHES));
            return $hasPartialFailure ? self::EXIT_FAILURE : self::EXIT_SUCCESS;
        }

        $rows = [
            ['Outbox expired and erased', (string) $expiredCount],
            ['Capture files cleaned', (string) $cleanedCount],
            ['Capture cleanup failed', (string) $failedCleanupCount],
        ];
        if ($batchResult !== null) {
            $rows[] = ['Outbox items processed', (string) $batchResult->processedCount];
            $rows[] = ['Captured locally', (string) $batchResult->capturedLocallyCount];
            $rows[] = ['Dispatch failed', (string) $batchResult->failedCount];
            $rows[] = ['Dispatch expired', (string) $batchResult->expiredCount];
        }

        if ($hasPartialFailure) {
            Log::warning('Local identity maintenance completed with partial failure', [
                'category' => 'partial_failure',
                'failed_cleanup_count' => $failedCleanupCount,
                'dispatch_failed_count' => $dispatchFailedCount,
            ]);
            $this->error('Local identity maintenance completed with partial failure: [partial_failure]');
            $this->table(['Stage', 'Count'], $rows);
            return self::EXIT_FAILURE;
        }

        $this->info('Local identity maintenance cycle completed.');
        $this->table(['Stage', 'Count'], $rows);

        return self::EXIT_SUCCESS;
    }

    private function isValidLimit(mixed $value): bool
    {
        if (is_int($value)) {
            return $value >= 1 && $value <= 100;
        }
        if (is_string($value) && preg_match('/^(?:[1-9][0-9]?|100)$/D', $value) === 1) {
            return true;
        }
        return false;
    }

    private function failWithCategory(string $category, string $message, int $exitCode): int
    {
        Log::error('Local identity maintenance failure', [
            'category' => $category,
        ]);

        if ($this->hasOption('json') && (bool) $this->option('json')) {
            $this->line((string) json_encode([
                'status' => 'error',
                'category' => $category,
            ], JSON_UNESCAPED_SLASHES));
        } else {
            $this->error("Local identity maintenance error: [{$category}] {$message}");
        }

        return $exitCode;
    }
}
