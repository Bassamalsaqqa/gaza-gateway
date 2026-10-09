<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProcessProbeJob implements ShouldQueue
{
    use Queueable;

    public string $probeId;
    public string $dispatchedAt;

    /**
     * Create a new job instance.
     */
    public function __construct(string $probeId)
    {
        $this->probeId = $probeId;
        $this->dispatchedAt = gmdate('Y-m-d\TH:i:s\Z');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        Log::info('processing_probe_job', [
            'probeId' => $this->probeId,
            'dispatchedAt' => $this->dispatchedAt,
        ]);

        // Record execution marker in cache store
        Cache::put('probe_job_result:' . $this->probeId, [
            'status' => 'completed',
            'executedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ], 300);
    }
}
