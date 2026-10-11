<?php

declare(strict_types=1);

use App\Http\Controllers\Reference\NetworkController;
use App\Http\Middleware\Reference\RequireNetworkStaffAuth;
use Illuminate\Support\Facades\Route;

if (config('reference.enabled') === true) {
    Route::middleware('throttle:reference')->group(function (): void {
        Route::get('/network/airports', [NetworkController::class, 'index'])->name('getAirports');
        Route::middleware(RequireNetworkStaffAuth::class)->group(function (): void {
            Route::get('/admin/network/airports', [NetworkController::class, 'adminIndex'])->name('getAdminAirports');
            Route::post('/admin/network/airports', [NetworkController::class, 'create'])->name('postAdminAirport');
            Route::patch('/admin/network/airports/{code}', [NetworkController::class, 'patch'])->name('patchAdminAirport');
        });
        Route::get('/network/routes', [NetworkController::class, 'routes'])->name('getNetworkRoutes');
    });
}
