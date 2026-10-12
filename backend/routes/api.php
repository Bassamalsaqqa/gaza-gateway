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
    require __DIR__ . '/passenger-profile.php';
    require __DIR__ . '/staff-identity.php';
    if (config('reservations.enabled') !== true) require __DIR__ . '/booking-identity.php';
    require __DIR__ . '/reference.php';
    require __DIR__ . '/meal-reference.php';
    require __DIR__ . '/schedule-reference.php';
    require __DIR__ . '/editorial.php';
    require __DIR__ . '/reservations.php';
    require __DIR__ . '/mvp-mail.php';
    require __DIR__ . '/mvp-site.php';
});
