<?php

declare(strict_types=1);

use App\Http\Controllers\Analytics\AnalyticsController;
use App\Mvp\Site\RequireSiteStaffAuth;
use Illuminate\Support\Facades\Route;

// Public privacy-preserving event ingestion endpoint
Route::post('/analytics/events', [AnalyticsController::class, 'ingest']);

// Staff-authorized analytics and report management
Route::middleware([RequireSiteStaffAuth::class, 'throttle:api'])->group(function (): void {
    // 7/30/90/previous_month summary metrics
    Route::get('/admin/analytics/summary', [AnalyticsController::class, 'summary']);

    // Report opt-in configuration and routing
    Route::get('/admin/analytics/reports/settings', [AnalyticsController::class, 'getSettings']);
    Route::put('/admin/analytics/reports/settings', [AnalyticsController::class, 'saveSettings']);

    // Safe rate-limited preview (queues 202 into archive_mail_outbox)
    Route::post('/admin/analytics/reports/preview', [AnalyticsController::class, 'preview']);
});
