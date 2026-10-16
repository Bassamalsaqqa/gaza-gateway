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
            Route::post('/reservation-trips', [\App\Mvp\Reservations\ReservationTripController::class, 'create'])->middleware('throttle:reservations_write')->name('postReservationTrip');
            Route::post('/reservations', [ReservationController::class, 'create'])->middleware('throttle:reservations_write')->name('postReservation');
            Route::get('/reservations', [ReservationController::class, 'index'])->middleware('throttle:reservations_read')->name('getReservations');
            Route::get('/reservations/{ref}', [ReservationController::class, 'show'])->middleware('throttle:reservations_read')->name('getReservationByRef');
            Route::post('/reservations/{ref}/cancel', [ReservationController::class, 'cancel'])->middleware('throttle:reservations_write')->name('postReservationCancel');
            Route::get('/reservations/{ref}/ticket', [ReservationController::class, 'ticket'])->middleware('throttle:reservations_read')->name('getReservationTicket');
        });

        Route::middleware(\App\Mvp\Reservations\RequireGuestReservationSession::class)->group(function (): void {
            Route::post('/guest-reservation-trips', [\App\Mvp\Reservations\ReservationTripController::class, 'createGuest'])->middleware('throttle:reservations_write')->name('postGuestReservationTrip');
            Route::post('/guest-reservations/email-challenges', [\App\Mvp\Reservations\GuestReservationController::class, 'createEmailChallenge'])
                ->middleware('throttle:guest_reservations_challenge')
                ->name('postGuestEmailChallenge');
            Route::post('/guest-reservations/email-verifications', [\App\Mvp\Reservations\GuestReservationController::class, 'verifyEmailChallenge'])
                ->middleware('throttle:guest_reservations_verify')
                ->name('postGuestEmailVerification');
            Route::post('/guest-reservations', [\App\Mvp\Reservations\GuestReservationController::class, 'create'])
                ->middleware('throttle:reservations_write')
                ->name('postGuestReservation');
            Route::post('/guest-reservations/access-challenges', [\App\Mvp\Reservations\GuestReservationController::class, 'createAccessChallenge'])
                ->middleware('throttle:guest_reservations_challenge')
                ->name('postGuestAccessChallenge');
            Route::post('/guest-reservations/access-verifications', [\App\Mvp\Reservations\GuestReservationController::class, 'verifyAccessChallenge'])
                ->middleware('throttle:guest_reservations_verify')
                ->name('postGuestAccessVerification');
            Route::get('/guest-reservations/{ref}', [\App\Mvp\Reservations\GuestReservationController::class, 'show'])
                ->middleware('throttle:guest_reservations_read')
                ->name('getGuestReservationByRef');
            Route::get('/guest-reservations/{ref}/ticket', [\App\Mvp\Reservations\GuestReservationController::class, 'ticket'])
                ->middleware('throttle:guest_reservations_read')
                ->name('getGuestReservationTicket');
            Route::post('/guest-reservations/{ref}/cancel', [\App\Mvp\Reservations\GuestReservationController::class, 'cancel'])
                ->middleware('throttle:reservations_write')
                ->name('postGuestReservationCancel');
        });

        Route::middleware(RequireStaffReservationAuth::class)->group(function (): void {
            Route::get('/admin/reservations', [AdminReservationController::class, 'index'])->middleware('throttle:reservations_read')->name('getAdminReservations');
            Route::get('/admin/reservations/{ref}', [AdminReservationController::class, 'show'])->middleware('throttle:reservations_read')->name('getAdminReservationByRef');
            Route::post('/admin/reservations/{ref}/cancel', [AdminReservationController::class, 'cancel'])->middleware('throttle:reservations_write')->name('postAdminReservationCancel');
        });
    });
}
