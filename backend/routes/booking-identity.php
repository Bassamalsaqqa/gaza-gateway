<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\BookingAccessController;
use Illuminate\Support\Facades\Route;

Route::post('/bookings/{ref}/challenge', [BookingAccessController::class, 'handle']);
Route::post('/bookings/{ref}/verify-challenge', [BookingAccessController::class, 'handle']);
Route::post('/account/bookings/claim/challenge', [BookingAccessController::class, 'handle']);
Route::post('/account/bookings/claim/verify', [BookingAccessController::class, 'handle']);
Route::post('/account/bookings/claim', [BookingAccessController::class, 'handle']);
