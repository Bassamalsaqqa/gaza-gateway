<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\Staff\StaffAuthController;
use Illuminate\Support\Facades\Route;

Route::post('/staff/login', [StaffAuthController::class, 'handle']);
Route::post('/staff/mfa/challenge', [StaffAuthController::class, 'handle']);
Route::post('/staff/mfa/verify', [StaffAuthController::class, 'handle']);
Route::post('/staff/logout', [StaffAuthController::class, 'handle']);
Route::get('/staff/me', [StaffAuthController::class, 'handle']);
Route::get('/staff/sessions', [StaffAuthController::class, 'handle']);
Route::delete('/staff/sessions/{id}', [StaffAuthController::class, 'handle']);
Route::post('/staff/step-up', [StaffAuthController::class, 'handle']);
