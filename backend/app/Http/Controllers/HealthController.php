<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class HealthController extends Controller
{
    /**
     * GET /api/v1/health (getHealthLiveness)
     * Independent of DB or queue failure; returns 200 while process can serve requests.
     */
    public function liveness(Request $request): JsonResponse
    {
        $requestId = $request->attributes->get('request_id');
        $now = gmdate('Y-m-d\TH:i:s\Z');

        return response()->json([
            'success' => true,
            'data' => [
                'status' => 'ok',
                'timestamp' => $now,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => $now,
            ],
        ], 200, [
            'Cache-Control' => 'no-store',
            'X-Request-Id' => $requestId,
        ]);
    }

    /**
     * GET /api/v1/health/ready (getHealthReadiness)
     * Probes actual PostgreSQL connection, applied-vs-pending migrations, and required queue infrastructure.
     * Fails closed with 503 ErrorResponse if any dependency is not ready.
     */
    public function readiness(Request $request): JsonResponse
    {
        $requestId = $request->attributes->get('request_id');
        $now = gmdate('Y-m-d\TH:i:s\Z');

        try {
            // 0. Validate supported queue and cache driver foundation
            try {
                \App\Support\ConfigurationValidator::validateQueueAndCache(config()->all());
            } catch (\Throwable) {
                return $this->errorResponse('service_unavailable', 'Unsupported sync or in-memory queue/cache driver configured.', 503, $requestId, $now);
            }

            // 1. Probe database connection
            DB::connection()->getPdo();
            $dbStatus = 'connected';

            // 2. Probe migration status against migration repository
            $migrator = app('migrator');
            if (!$migrator->repositoryExists()) {
                return $this->errorResponse('service_unavailable', 'Database migration repository is not initialized.', 503, $requestId, $now);
            }

            $migrationFiles = $migrator->getMigrationFiles([database_path('migrations')]);
            $ranMigrations = $migrator->getRepository()->getRan();
            $pendingMigrations = array_diff(array_keys($migrationFiles), $ranMigrations);

            if (!empty($pendingMigrations)) {
                return $this->errorResponse('service_unavailable', 'Database migrations are pending.', 503, $requestId, $now);
            }
            $migrationStatus = 'up_to_date';

            // 3. Probe required infrastructure tables (cache and queue)
            $requiredTables = ['cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs'];
            foreach ($requiredTables as $table) {
                if (!Schema::hasTable($table)) {
                    return $this->errorResponse('service_unavailable', 'Required queue or cache infrastructure is unavailable.', 503, $requestId, $now);
                }
            }

            // 4. Probe cache store read/write roundtrip
            \Illuminate\Support\Facades\Cache::put('readiness:probe', 1, 10);
            if (\Illuminate\Support\Facades\Cache::get('readiness:probe') !== 1) {
                return $this->errorResponse('service_unavailable', 'Cache store is unavailable.', 503, $requestId, $now);
            }

            // 5. Probe worker heartbeat (< 30s freshness)
            $heartbeat = \Illuminate\Support\Facades\Cache::get('worker:heartbeat');
            if ($heartbeat === null || (time() - (int) $heartbeat) > 30) {
                return $this->errorResponse('service_unavailable', 'Worker heartbeat is missing or stale.', 503, $requestId, $now);
            }
            $queueStatus = 'healthy';

            return response()->json([
                'success' => true,
                'data' => [
                    'database' => $dbStatus,
                    'migrations' => $migrationStatus,
                    'queue' => $queueStatus,
                ],
                'meta' => [
                    'requestId' => $requestId,
                    'timestamp' => $now,
                ],
            ], 200, [
                'Cache-Control' => 'no-store',
                'X-Request-Id' => $requestId,
            ]);
        } catch (\Throwable $e) {
            // Safe stable code and message, no credentials, traces, or DSNs leaked
            return $this->errorResponse('service_unavailable', 'Service dependencies are not ready.', 503, $requestId, $now);
        }
    }

    protected function errorResponse(string $code, string $message, int $status, string $requestId, string $timestamp): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => $timestamp,
            ],
        ], $status, [
            'Cache-Control' => 'no-store',
            'X-Request-Id' => $requestId,
        ]);
    }
}
