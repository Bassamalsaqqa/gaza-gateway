<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\PassengerProfile\PassengerProfileController;
use App\Http\Controllers\Identity\PassengerProfile\SavedTravelersController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Passenger Profile & Saved Travelers Routes (Phase 13B Package 02)
|--------------------------------------------------------------------------
|
| Governed by VerifyApplicationCsrfHeader middleware and IdentityOperationPolicies.
| Six exact operations:
| 1. GET    /auth/passenger/profile        getPassengerProfile
| 2. PUT    /auth/passenger/profile        putPassengerProfile
| 3. GET    /auth/passenger/travelers      getSavedTravelers
| 4. POST   /auth/passenger/travelers      postSavedTraveler
| 5. PATCH  /auth/passenger/travelers/{id} patchSavedTraveler
| 6. DELETE /auth/passenger/travelers/{id} deleteSavedTraveler
|
*/

Route::get('/auth/passenger/profile', [PassengerProfileController::class, 'getPassengerProfile'])
    ->name('auth.passenger.profile.get');

Route::put('/auth/passenger/profile', [PassengerProfileController::class, 'putPassengerProfile'])
    ->name('auth.passenger.profile.put');

Route::get('/auth/passenger/travelers', [SavedTravelersController::class, 'getSavedTravelers'])
    ->name('auth.passenger.travelers.get');

Route::post('/auth/passenger/travelers', [SavedTravelersController::class, 'postSavedTraveler'])
    ->name('auth.passenger.travelers.post');

Route::patch('/auth/passenger/travelers/{id}', [SavedTravelersController::class, 'patchSavedTraveler'])
    ->name('auth.passenger.travelers.patch');

Route::delete('/auth/passenger/travelers/{id}', [SavedTravelersController::class, 'deleteSavedTraveler'])
    ->name('auth.passenger.travelers.delete');
