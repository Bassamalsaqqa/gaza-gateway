<?php

declare(strict_types=1);

namespace App\Mvp\Archive;

/**
 * Contract for rendering commemorative archive luggage tag documents.
 * Real implementation with Arabic shaping is owned by shared document renderer.
 */
interface ArchiveDocumentRendererContract
{
    /**
     * Render commemorative thank-you document as PNG bytes.
     *
     * @param array{
     *   contributorName: string,
     *   contributorNameArabic?: string|null,
     *   archiveId?: string,
     *   reference?: string
     * } $payload
     * @return string Binary PNG bytes
     */
    public function renderArchiveThankYou(array $payload): string;
}
