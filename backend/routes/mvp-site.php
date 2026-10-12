<?php
use App\Mvp\Site\SiteController;
use App\Mvp\Site\RequireSiteStaffAuth;
use Illuminate\Support\Facades\Route;
if (config('mvp-site.enabled') === true) {
    Route::get('/site/contact',[SiteController::class,'published'])->middleware('throttle:api');
    Route::post('/contact',[SiteController::class,'submit'])->middleware('throttle:contact_submission');
    Route::middleware([RequireSiteStaffAuth::class,'throttle:api'])->group(function () {
        Route::get('/admin/settings/contact',[SiteController::class,'settings']);
        Route::put('/admin/settings/contact/draft',[SiteController::class,'settings']);
        Route::post('/admin/settings/contact/publish',[SiteController::class,'settings']);
        Route::post('/admin/settings/contact/discard',[SiteController::class,'settings']);
        Route::get('/admin/contact/inbox',[SiteController::class,'inbox']);
        Route::get('/admin/contact/inbox/{id}',[SiteController::class,'detail'])->whereUuid('id');
        Route::patch('/admin/contact/inbox/{id}/status',[SiteController::class,'mutate'])->whereUuid('id');
        Route::patch('/admin/contact/inbox/{id}/assign',[SiteController::class,'mutate'])->whereUuid('id');
        Route::post('/admin/contact/inbox/{id}/notes',[SiteController::class,'mutate'])->whereUuid('id');
        Route::put('/admin/contact/inbox/{id}/reply-draft',[SiteController::class,'mutate'])->whereUuid('id');
    });
}
