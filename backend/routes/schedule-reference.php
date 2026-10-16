<?php

declare(strict_types=1);

use App\Reference\Schedules\OfferingController;
use App\Reference\Schedules\RequireScheduleStaffAuth;
use App\Reference\Schedules\ScheduleController;
use Illuminate\Support\Facades\Route;

if (config('schedules.enabled') === true) {
    Route::middleware('throttle:reference')->group(function (): void {
        Route::get('/schedules', [ScheduleController::class, 'index'])->name('getSchedules');
        Route::get('/offerings/availability', [OfferingController::class, 'availability'])->name('getOfferingAvailability');
        Route::get('/offerings', [OfferingController::class, 'index'])->name('getOfferings');
        Route::get('/offerings/{id}', [OfferingController::class, 'show'])->name('getOfferingById');

        Route::middleware(RequireScheduleStaffAuth::class)->group(function (): void {
            Route::get('/admin/schedules', [ScheduleController::class, 'adminIndex'])->name('getAdminSchedules');
            Route::post('/admin/schedules', [ScheduleController::class, 'create'])->name('postAdminSchedule');
            Route::patch('/admin/schedules/{key}', [ScheduleController::class, 'patch'])->name('patchAdminSchedule');
        });
    });
}
