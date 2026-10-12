<?php

use App\Mvp\Reservations\AdminReservationController;
use App\Mvp\Reservations\RequirePassengerReservationAuth;
use App\Mvp\Reservations\RequireStaffReservationAuth;
use App\Mvp\Reservations\ReservationController;
use Illuminate\Support\Facades\Route;

if (config('reservations.enabled') === true) {
    Route::group([], function (): void {
        Route::get('/offerings/{id}/seats', [ReservationController::class, 'seats'])->middleware('throttle:reservations_occupancy')->name('getOfferingSeats');

        Route::middleware(RequirePassengerReservationAuth::class)->group(function (): void {
            Route::post('/reservations', [ReservationController::class, 'create'])->middleware('throttle:reservations_write')->name('postReservation');
            Route::get('/reservations', [ReservationController::class, 'index'])->middleware('throttle:reservations_read')->name('getReservations');
            Route::get('/reservations/{ref}', [ReservationController::class, 'show'])->middleware('throttle:reservations_read')->name('getReservationByRef');
            Route::post('/reservations/{ref}/cancel', [ReservationController::class, 'cancel'])->middleware('throttle:reservations_write')->name('postReservationCancel');
            Route::get('/reservations/{ref}/ticket', [ReservationController::class, 'ticket'])->middleware('throttle:reservations_read')->name('getReservationTicket');
        });

        Route::middleware(RequireStaffReservationAuth::class)->group(function (): void {
            Route::get('/admin/reservations', [AdminReservationController::class, 'index'])->middleware('throttle:reservations_read')->name('getAdminReservations');
            Route::get('/admin/reservations/{ref}', [AdminReservationController::class, 'show'])->middleware('throttle:reservations_read')->name('getAdminReservationByRef');
            Route::post('/admin/reservations/{ref}/cancel', [AdminReservationController::class, 'cancel'])->middleware('throttle:reservations_write')->name('postAdminReservationCancel');
        });
    });
}
