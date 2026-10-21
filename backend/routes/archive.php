<?php

declare(strict_types=1);

use App\Mvp\Archive\ArchiveController;
use App\Mvp\Site\RequireSiteStaffAuth;
use Illuminate\Support\Facades\Route;

Route::post('/archive/contributions', [ArchiveController::class, 'submit'])
    ->middleware('throttle:archive_submission');

Route::middleware([RequireSiteStaffAuth::class, 'throttle:api'])->group(function () {
    Route::get('/admin/archive/contributions', [ArchiveController::class, 'index']);
    Route::get('/admin/archive/contributions/{id}', [ArchiveController::class, 'show'])->whereUuid('id');
    Route::patch('/admin/archive/contributions/{id}/status', [ArchiveController::class, 'updateStatus'])->whereUuid('id');
    Route::patch('/admin/archive/contributions/{id}/assign', [ArchiveController::class, 'assignStaff'])->whereUuid('id');
    Route::post('/admin/archive/contributions/{id}/notes', [ArchiveController::class, 'saveNotes'])->whereUuid('id');
    Route::get('/admin/archive/contributions/{id}/files/{fileId}/download', [ArchiveController::class, 'downloadFile'])
        ->whereUuid('id')
        ->whereUuid('fileId');
});
