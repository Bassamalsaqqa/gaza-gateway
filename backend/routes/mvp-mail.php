<?php
declare(strict_types=1);

use App\Mvp\Mail\MailController;
use App\Mvp\Reservations\RequirePassengerReservationAuth;
use App\Mvp\Reservations\RequireStaffReservationAuth;
use Illuminate\Support\Facades\Route;

if (config('mvp-mail.enabled') === true && config('reservations.enabled') === true) {
    Route::middleware(RequireStaffReservationAuth::class)->group(function (): void {
        Route::get('/admin/settings/email',[MailController::class,'settings'])->middleware('throttle:reservations_read');
        Route::put('/admin/settings/email',[MailController::class,'settings'])->middleware('throttle:mvp_mail_write');
        Route::post('/admin/settings/email/test',[MailController::class,'test'])->middleware('throttle:mvp_mail_write');
        Route::get('/admin/mail/messages',[MailController::class,'messages'])->middleware('throttle:reservations_read');
        Route::post('/admin/reservations/{ref}/email/resend',[MailController::class,'resend'])->middleware('throttle:mvp_mail_write');
    });
    Route::middleware(RequirePassengerReservationAuth::class)->group(function (): void {
        Route::get('/reservations/{ref}/email',[MailController::class,'status'])->middleware('throttle:reservations_read');
        Route::post('/reservations/{ref}/email/resend',[MailController::class,'resend'])->middleware('throttle:mvp_mail_write');
    });
}
