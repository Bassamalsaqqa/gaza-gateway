<?php

use App\Jobs\ProcessProbeJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

Artisan::command('probe:cache', function () {
    if (!app()->environment(['local', 'testing'])) {
        $this->error('Probes are strictly confined to local and testing environments.');
        return 1;
    }

    $this->info('Starting PostgreSQL cache roundtrip probe...');

    $key = 'probe_test_key_' . Str::random(8);
    $value = ['message' => 'gaza_gateway_cache_probe', 'timestamp' => microtime(true)];

    // 1. Write
    $putSuccess = Cache::put($key, $value, 60);
    if (!$putSuccess) {
        $this->error('FAIL: Cache::put returned false');
        return 1;
    }
    $this->line("1. Cache write succeeded for key: {$key}");

    // 2. Read
    $retrieved = Cache::get($key);
    if ($retrieved !== $value) {
        $this->error('FAIL: Retrieved value does not match written value');
        return 1;
    }
    $this->line("2. Cache read matched written value: " . json_encode($retrieved));

    // 3. Delete / Forget
    $forgetSuccess = Cache::forget($key);
    if (!$forgetSuccess) {
        $this->error('FAIL: Cache::forget returned false');
        return 1;
    }
    $this->line("3. Cache forget succeeded for key: {$key}");

    // 4. Verify gone
    $afterForget = Cache::get($key);
    if ($afterForget !== null) {
        $this->error('FAIL: Key still exists after forget');
        return 1;
    }
    $this->line("4. Verified key is null after forget");

    $this->info('SUCCESS: PostgreSQL cache write/read/delete roundtrip verified.');
    return 0;
})->purpose('Demonstrate real PostgreSQL cache write, read, and delete operations');

Artisan::command('probe:dispatch-job {probeId?}', function (?string $probeId = null) {
    if (!app()->environment(['local', 'testing'])) {
        $this->error('Probes are strictly confined to local and testing environments.');
        return 1;
    }

    $id = $probeId ?: Str::uuid()->toString();
    $this->info("Dispatching ProcessProbeJob with ID: {$id}");

    dispatch(new ProcessProbeJob($id));

    $this->line("Dispatched job {$id} to database queue.");
    return 0;
})->purpose('Dispatch a harmless probe job to the PostgreSQL database queue');

Artisan::command('probe:check-job {probeId}', function (string $probeId) {
    if (!app()->environment(['local', 'testing'])) {
        $this->error('Probes are strictly confined to local and testing environments.');
        return 1;
    }

    $result = Cache::get('probe_job_result:' . $probeId);
    if ($result === null) {
        $this->warn("Job {$probeId} has not completed yet or result was not found.");
        return 1;
    }

    $this->info("Job {$probeId} result found: " . json_encode($result));
    return 0;
})->purpose('Check if a dispatched probe job has executed');

/*
|--------------------------------------------------------------------------
| Identity Scheduler Registration (Phase 13B)
|--------------------------------------------------------------------------
|
| Documented Laravel scheduler registration for durable PostgreSQL cleanup
| of expired/revoked anonymous sessions and stale bootstrap rate limit buckets.
|
*/
\Illuminate\Support\Facades\Schedule::command('identity:clean-anonymous')
    ->hourly()
    ->withoutOverlapping();
