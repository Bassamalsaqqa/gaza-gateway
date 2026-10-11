<?php
use App\Http\Controllers\Reference\FleetController;
use App\Http\Middleware\Reference\RequireReferenceStaffAuth;
use Illuminate\Support\Facades\Route;

if (config('reference.enabled') === true) {
    Route::middleware('throttle:reference')->group(function (): void {
        Route::get('/fleet/snapshot', [FleetController::class, 'snapshot'])->name('getMvpFleetSnapshot');
        Route::get('/fleet/aircraft', [FleetController::class, 'index'])->name('getFleetAircraft');
        Route::get('/fleet/seat-layouts/{id}', [FleetController::class, 'layout'])->name('getSeatLayoutById');
        Route::middleware(RequireReferenceStaffAuth::class)->group(function (): void {
            Route::patch('/admin/fleet/aircraft/{id}/receipt', [FleetController::class, 'patchReceipt'])->name('patchMvpAircraftReceipt');
            Route::put('/admin/fleet/seat-layouts/{id}/receipt', [FleetController::class, 'layoutReceipt'])->name('putMvpLayoutReceipt');
            Route::post('/admin/fleet/aircraft', [FleetController::class, 'create'])->name('postAdminAircraft');
            Route::patch('/admin/fleet/aircraft/{id}', [FleetController::class, 'patch'])->name('patchAdminAircraft');
            Route::put('/admin/fleet/seat-layouts/{id}', [FleetController::class, 'putLayout'])->name('putAdminSeatLayout');
        });
    });
}
require __DIR__.'/network-reference.php';
