<?php

declare(strict_types=1);

use App\Gallery\Controllers\GalleryPublishedController;
use App\Gallery\Controllers\GalleryStaffController;
use App\Editorial\Middleware\RequireEditorialStaffAuth;
use Illuminate\Support\Facades\Route;

if (config('gallery.enabled') === true) {
    Route::middleware('throttle:api')->group(function (): void {
        Route::get('/gallery/published', [GalleryPublishedController::class, 'show'])
            ->name('getGalleryPublished');

        Route::middleware(RequireEditorialStaffAuth::class)->group(function (): void {
            Route::get('/gallery/editorial', [GalleryStaffController::class, 'show'])
                ->name('getGalleryEditorial');

            Route::put('/gallery/editorial/draft', [GalleryStaffController::class, 'putDraft'])
                ->name('putGalleryDraft');

            Route::post('/gallery/editorial/discard', [GalleryStaffController::class, 'discardDraft'])
                ->name('postGalleryDiscard');

            Route::post('/gallery/editorial/publish', [GalleryStaffController::class, 'publish'])
                ->name('postGalleryPublish');

            Route::post('/gallery/editorial/unpublish', [GalleryStaffController::class, 'unpublish'])
                ->name('postGalleryUnpublish');

            Route::post('/gallery/editorial/restore', [GalleryStaffController::class, 'restore'])
                ->name('postGalleryRestore');
        });
    });
}
