<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\SharedHosting\SharedHostingCronRunner;
use App\SharedHosting\SharedHostingProfile;
use Illuminate\Console\Command;

/**
 * Shared hosting bounded cron console command.
 *
 * Runs short-lived bounded tasks (session cleanup, booking mail, identity proof SMTP)
 * with atomic lease overlap protection, strict <=25s wall time ceiling, and bounded batches.
 */
final class SharedHostingCronCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'shared-hosting:cron
                            {--max-seconds=25 : Maximum execution wall-clock time in seconds (1..25)}
                            {--batch-limit=25 : Maximum items per worker batch (1..50)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Execute bounded shared hosting cron tasks (overlap protected, max 25s wall time, bounded batch)';

    /**
     * Execute the console command.
     */
    public function handle(SharedHostingCronRunner $runner): int
    {
        if (!SharedHostingProfile::isEnabled()) {
            $this->error('Shared hosting profile is not enabled (HOSTPAPA_SHARED_ENABLED is not true). Fail-closed with zero DB/mail execution.');
            return 1;
        }

        $rawMaxSeconds = $this->option('max-seconds');
        $maxSeconds = filter_var($rawMaxSeconds, FILTER_VALIDATE_FLOAT);
        if ($maxSeconds === false || $maxSeconds < 1.0 || $maxSeconds > 25.0) {
            $this->error('Option --max-seconds must be a number between 1.0 and 25.0 seconds.');
            return 1;
        }

        $rawBatchLimit = $this->option('batch-limit');
        $batchLimit = filter_var($rawBatchLimit, FILTER_VALIDATE_INT);
        if ($batchLimit === false || $batchLimit < 1 || $batchLimit > 50) {
            $this->error('Option --batch-limit must be an integer between 1 and 50.');
            return 1;
        }

        $this->info("Starting bounded shared hosting cron cycle (max wall: {$maxSeconds}s, batch limit: {$batchLimit})...");

        try {
            $result = $runner->run((float) $maxSeconds, (int) $batchLimit);
        } catch (\Throwable $e) {
            $this->error('Shared hosting cron runner failed fatally: ' . get_class($e));
            return 1;
        }

        if ($result['skipped_overlap'] ?? false) {
            $this->warn('Execution skipped: Another runner holds the active execution lease (overlap protected).');
            return 0;
        }

        $summary = $result['summary'] ?? [];
        $status = (string) ($result['status'] ?? 'unknown');
        $hasErrors = !empty($summary['errors']);
        $deadlineReached = (bool) ($summary['wall_deadline_reached'] ?? false);

        $this->table(
            ['Metric', 'Value'],
            [
                ['Duration', ($result['duration_seconds'] ?? 0) . 's'],
                ['Sessions Purged', $summary['sessions_purged'] ?? 0],
                ['Rate Buckets Purged', $summary['rate_buckets_purged'] ?? 0],
                ['Booking Mail Processed', $summary['booking_mail_processed'] ?? 0],
                ['Identity Mail Processed', $summary['identity_mail_processed'] ?? 0],
                ['Wall Deadline Reached', $deadlineReached ? 'Yes' : 'No'],
                ['Errors Count', count($summary['errors'] ?? [])],
                ['Status', $status],
            ]
        );

        if ($status !== 'healthy' || $hasErrors || $deadlineReached) {
            $this->error("Shared hosting cron cycle finished with status [{$status}] and errors.");
            return 1;
        }

        $this->info('Shared hosting cron cycle finished successfully.');
        return 0;
    }
}
