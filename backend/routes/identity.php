<?php

declare(strict_types=1);

use App\Http\Controllers\Identity\IdentityBootstrapController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Identity Protocol Routes (Phase 13B Package 02)
|--------------------------------------------------------------------------
|
| Bounded production CSRF bootstraps for passenger and staff realms.
| Login lifecycles, MFA and directory endpoints remain reserved for later packages.
|
*/

Route::get('/auth/csrf', [IdentityBootstrapController::class, 'passengerCsrf'])->name('auth.csrf');
Route::get('/staff/csrf', [IdentityBootstrapController::class, 'staffCsrf'])->name('staff.csrf');
