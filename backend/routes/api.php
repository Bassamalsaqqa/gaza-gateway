<?php

use App\Http\Controllers\HealthController;
use App\Http\Controllers\SystemController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Liveness is independent of DB connection, migrations, queue, and rate limiting store
    Route::get('/health', [HealthController::class, 'liveness']);

    // Readiness probes PostgreSQL connection, migrations, and queue infrastructure directly
    Route::get('/health/ready', [HealthController::class, 'readiness']);

    // Rate-limited system endpoints
    Route::middleware('throttle:api')->group(function () {
        // Version reports configuration and build metadata
        Route::get('/version', [SystemController::class, 'version']);
    });

    // Identity protocol routes (Phase 13B)
    require __DIR__ . '/identity.php';
});
