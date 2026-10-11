<?php

declare(strict_types=1);

use App\Editorial\Controllers\EditorialPublishedController;
use App\Editorial\Controllers\EditorialStaffController;
use App\Editorial\Middleware\RequireEditorialStaffAuth;
use Illuminate\Support\Facades\Route;

if (config('editorial.enabled') === true) {
    Route::middleware('throttle:api')->group(function (): void {
        Route::get('/cms/published/{slug}', [EditorialPublishedController::class, 'show'])
            ->name('getCmsPublishedBySlug')
            ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

        Route::middleware(RequireEditorialStaffAuth::class)->group(function (): void {
            Route::get('/cms/editorial/{slug}', [EditorialStaffController::class, 'show'])
                ->name('getCmsEditorialBySlug')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

            Route::put('/cms/editorial/{slug}/draft', [EditorialStaffController::class, 'putDraft'])
                ->name('putCmsEditorialDraft')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

            Route::post('/cms/editorial/{slug}/discard', [EditorialStaffController::class, 'discardDraft'])
                ->name('postCmsEditorialDiscard')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

            Route::post('/cms/editorial/{slug}/publish', [EditorialStaffController::class, 'publish'])
                ->name('postCmsEditorialPublish')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

            Route::post('/cms/editorial/{slug}/unpublish', [EditorialStaffController::class, 'unpublish'])
                ->name('postCmsEditorialUnpublish')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');

            Route::post('/cms/editorial/{slug}/restore', [EditorialStaffController::class, 'restore'])
                ->name('postCmsEditorialRestore')
                ->where('slug', 'home|travel|airport\.(past|present|future)|destinations\.(presentation|editorial)|pages\.information');
        });
    });
}
