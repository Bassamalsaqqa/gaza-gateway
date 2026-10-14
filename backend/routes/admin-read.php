<?php
use App\Mvp\Admin\AdminReadController;
use App\Mvp\Admin\RequireAdminRead;
use Illuminate\Support\Facades\Route;

if (config('reservations.enabled') === true) {
    Route::get('/admin/dashboard', [AdminReadController::class, 'dashboard'])->middleware([RequireAdminRead::class.':dashboard.view', 'throttle:reservations_read'])->name('getAdminDashboard');
    Route::get('/admin/customers', [AdminReadController::class, 'customers'])->middleware([RequireAdminRead::class.':commercial.view', 'throttle:reservations_read'])->name('getAdminCustomers');
    Route::get('/admin/activity', [AdminReadController::class, 'activity'])->middleware([RequireAdminRead::class.':admin.manage', 'throttle:reservations_read'])->name('getAdminActivity');
}
