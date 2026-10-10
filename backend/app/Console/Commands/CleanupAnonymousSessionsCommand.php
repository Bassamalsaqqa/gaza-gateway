<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Identity\Sessions\AnonymousSessionCleanup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

final class CleanupAnonymousSessionsCommand extends Command
{
    /**
     * The name and signature of the console command.
     * Enforces strictly bounded parameters matching policy: max 10 batches, max 100 rows per batch.
     *
     * @var string
     */
    protected $signature = 'identity:clean-anonymous
                            {--batches=10 : Number of batches per realm (1..10)}
                            {--batch-size=100 : Maximum row batch size per transaction (1..100)}
                            {--horizon=3600 : Safe horizon in seconds beyond window expiration (>=3600)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Durable cleanup of expired or revoked anonymous sessions and stale bootstrap rate limit buckets';

    /**
     * Execute the console command.
     */
    public function handle(AnonymousSessionCleanup $cleanup): int
    {
        $rawBatches = $this->option('batches');
        $rawBatchSize = $this->option('batch-size');
        $rawHorizon = $this->option('horizon');

        if (!$this->isBoundedInteger($rawBatches, 1, 10)) {
            $this->error('Option --batches must be an integer between 1 and 10.');
            return 1;
        }

        if (!$this->isBoundedInteger($rawBatchSize, 1, 100)) {
            $this->error('Option --batch-size must be an integer between 1 and 100.');
            return 1;
        }

        if (!$this->isBoundedInteger($rawHorizon, 3600, 31536000)) {
            $this->error('Option --horizon must be an integer >= 3600 and <= 31536000 seconds.');
            return 1;
        }

        $batches = (int) $rawBatches;
        $batchSize = (int) $rawBatchSize;
        $horizon = (int) $rawHorizon;

        $this->info("Starting anonymous session and rate limit cleanup (batches: {$batches}, batch size: {$batchSize})...");

        try {
            $summary = $cleanup->runCleanup(
                maxBatchesPerRealm: $batches,
                batchSize: $batchSize,
                safeHorizonSeconds: $horizon
            );

            $this->table(
                ['Resource', 'Rows Purged'],
                [
                    ['Passenger Anonymous Sessions', $summary['passenger_sessions']],
                    ['Staff Anonymous Sessions', $summary['staff_sessions']],
                    ['Bootstrap Rate Limit Buckets', $summary['rate_limit_buckets']],
                ]
            );

            $this->info('Anonymous session cleanup completed successfully.');
            return 0;
        } catch (\Throwable $e) {
            // Invariant: Never reflect raw database driver, SQL queries, or credentials to terminal output
            Log::error('Anonymous cleanup command failure', [
                'exception_class' => get_class($e),
            ]);
            $this->error('Anonymous session cleanup failed due to a database service error.');
            return 1;
        }
    }

    private function isBoundedInteger(mixed $value, int $minimum, int $maximum): bool
    {
        return (is_int($value) || (is_string($value) && preg_match('/^[1-9][0-9]{0,7}$/D', $value) === 1))
            && (int) $value >= $minimum && (int) $value <= $maximum;
    }
}
