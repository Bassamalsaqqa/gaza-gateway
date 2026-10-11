<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\IdentityBootstrapController;
use App\Http\Controllers\Identity\Passenger\PassengerAuthController;
use App\Http\Controllers\Identity\Passenger\PassengerPasswordController;
use App\Http\Controllers\Identity\Passenger\PassengerSessionController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Identity Protocol Routes (Phase 13B)
|--------------------------------------------------------------------------
|
| Bounded production CSRF bootstraps and passenger authentication lifecycles:
| 1. POST /auth/register (postPassengerRegister, 202)
| 2. POST /auth/login (postPassengerLogin, 200)
| 3. POST /auth/logout (postPassengerLogout, 200)
| 4. POST /auth/password/forgot (postPassengerPasswordForgot, 202)
| 5. POST /auth/password/reset (postPassengerPasswordReset, 200)
| 6. POST /auth/email/verify (postPassengerEmailVerify, 200)
| 7. POST /auth/email/resend (postPassengerEmailResend, 202)
| 8. GET /auth/passenger/sessions (getPassengerSessions, 200)
| 9. DELETE /auth/passenger/sessions/{id} (deletePassengerSession, 200)
| 10. PUT /auth/passenger/password (putPassengerPassword, 200)
|
*/

// CSRF bootstraps
Route::get('/auth/csrf', [IdentityBootstrapController::class, 'passengerCsrf'])->name('auth.csrf');
Route::get('/staff/csrf', [IdentityBootstrapController::class, 'staffCsrf'])->name('staff.csrf');

// Passenger Authentication & Proof Lifecycles
Route::post('/auth/register', [PassengerAuthController::class, 'register'])->name('auth.register');
Route::post('/auth/login', [PassengerAuthController::class, 'login'])->name('auth.login');
Route::post('/auth/logout', [PassengerAuthController::class, 'logout'])->name('auth.logout');
Route::post('/auth/password/forgot', [PassengerPasswordController::class, 'forgotPassword'])->name('auth.password.forgot');
Route::post('/auth/password/reset', [PassengerPasswordController::class, 'resetPassword'])->name('auth.password.reset');
Route::post('/auth/email/verify', [PassengerAuthController::class, 'verifyEmail'])->name('auth.email.verify');
Route::post('/auth/email/resend', [PassengerAuthController::class, 'resendEmail'])->name('auth.email.resend');

// Passenger Session Management
Route::get('/auth/passenger/sessions', [PassengerSessionController::class, 'index'])->name('auth.passenger.sessions.index');
Route::delete('/auth/passenger/sessions/{id}', [PassengerSessionController::class, 'destroy'])
    ->name('auth.passenger.sessions.destroy');

// Passenger Credential Management
Route::put('/auth/passenger/password', [PassengerPasswordController::class, 'changePassword'])->name('auth.passenger.password.update');
