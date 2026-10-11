<?php

use App\Mvp\Reservations\AdminReservationController;
use App\Mvp\Reservations\RequirePassengerReservationAuth;
use App\Mvp\Reservations\RequireStaffReservationAuth;
use App\Mvp\Reservations\ReservationController;
use Illuminate\Support\Facades\Route;

if (config('reservations.enabled') === true) {
    Route::middleware('throttle:reference')->group(function (): void {
        Route::get('/offerings/{id}/seats', [ReservationController::class, 'seats'])->name('getOfferingSeats');

        Route::middleware(RequirePassengerReservationAuth::class)->group(function (): void {
            Route::post('/reservations', [ReservationController::class, 'create'])->name('postReservation');
            Route::get('/reservations', [ReservationController::class, 'index'])->name('getReservations');
            Route::get('/reservations/{ref}', [ReservationController::class, 'show'])->name('getReservationByRef');
            Route::post('/reservations/{ref}/cancel', [ReservationController::class, 'cancel'])->name('postReservationCancel');
            Route::get('/reservations/{ref}/ticket', [ReservationController::class, 'ticket'])->name('getReservationTicket');
        });

        Route::middleware(RequireStaffReservationAuth::class)->group(function (): void {
            Route::get('/admin/reservations', [AdminReservationController::class, 'index'])->name('getAdminReservations');
            Route::get('/admin/reservations/{ref}', [AdminReservationController::class, 'show'])->name('getAdminReservationByRef');
            Route::post('/admin/reservations/{ref}/cancel', [AdminReservationController::class, 'cancel'])->name('postAdminReservationCancel');
        });
    });
}
