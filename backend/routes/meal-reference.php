<?php

use App\Reference\Meals\MealController;
use App\Reference\Meals\RequireMealStaffAuth;
use Illuminate\Support\Facades\Route;

if (config('meals.enabled') === true) {
    Route::middleware('throttle:reference')->group(function (): void {
        Route::get('/meals', [MealController::class, 'index'])->name('getMeals');
        Route::middleware(RequireMealStaffAuth::class)->group(function (): void {
            Route::get('/admin/meals', [MealController::class, 'adminIndex'])->name('getAdminMeals');
            Route::post('/admin/meals', [MealController::class, 'create'])->name('postAdminMeal');
            Route::patch('/admin/meals/{id}', [MealController::class, 'patch'])->name('patchAdminMeal');
            Route::put('/admin/meals/order', [MealController::class, 'reorder'])->name('putAdminMealsOrder');
            Route::put('/admin/meals/default', [MealController::class, 'setDefault'])->name('putAdminMealsDefault');
        });
    });
}
