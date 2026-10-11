<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\Staff\StaffAuthController;
use App\Http\Controllers\Identity\Staff\StaffLifecycleController;
use App\Http\Controllers\Identity\Staff\StaffDirectoryController;
use Illuminate\Support\Facades\Route;

Route::post('/staff/login', [StaffAuthController::class, 'handle']);
Route::post('/staff/mfa/challenge', [StaffAuthController::class, 'handle']);
Route::post('/staff/mfa/verify', [StaffAuthController::class, 'handle']);
Route::post('/staff/logout', [StaffAuthController::class, 'handle']);
Route::get('/staff/me', [StaffAuthController::class, 'handle']);
Route::get('/staff/sessions', [StaffAuthController::class, 'handle']);
Route::delete('/staff/sessions/{id}', [StaffAuthController::class, 'handle']);
Route::post('/staff/step-up', [StaffAuthController::class, 'handle']);
Route::post('/staff/password/forgot', [StaffLifecycleController::class, 'handle']);
Route::post('/staff/password/reset', [StaffLifecycleController::class, 'handle']);
Route::put('/staff/password', [StaffLifecycleController::class, 'handle']);
Route::post('/staff/invitations/accept', [StaffLifecycleController::class, 'handle']);
Route::post('/staff/mfa/enrollment/setup', [StaffLifecycleController::class, 'handle']);
Route::post('/staff/mfa/enrollment/confirm', [StaffLifecycleController::class, 'handle']);
Route::get('/staff/users', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/users', [StaffDirectoryController::class, 'handle']);
Route::patch('/staff/users/{id}', [StaffDirectoryController::class, 'handle']);
Route::delete('/staff/users/{id}', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/users/{id}/invite/reissue', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/users/{id}/invite/revoke', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/mfa/setup', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/mfa/setup/confirm', [StaffDirectoryController::class, 'handle']);
Route::post('/staff/mfa/recovery-codes/regenerate', [StaffDirectoryController::class, 'handle']);
