<?php

declare(strict_types=1);

namespace App\Gallery\Controllers;

use App\Gallery\Exceptions\GalleryCorruptSnapshotException;
use App\Gallery\Exceptions\GalleryNotFoundException;
use App\Gallery\Exceptions\GalleryUnpublishedException;
use App\Gallery\Services\GalleryCoordinator;
use App\Gallery\Shared\GalleryResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class GalleryPublishedController extends Controller
{
    private const MAX_BODY_BYTES = 262144; // 256 KiB

    public function __construct(
        private readonly GalleryCoordinator $coordinator
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        if (strlen($request->getContent()) > self::MAX_BODY_BYTES) {
            return GalleryResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.');
        }

        foreach ($request->headers->all() as $values) {
            foreach ((array) $values as $val) {
                if (strlen((string) $val) > 8192) {
                    return GalleryResponse::error($request, 400, 'bad_request', 'Header size exceeds limit.');
                }
            }
        }

        try {
            $data = $this->coordinator->getPublished();
            return GalleryResponse::success($request, $data, 200, [
                'Cache-Control' => 'public, max-age=60',
            ]);
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (GalleryUnpublishedException $e) {
            return GalleryResponse::error($request, 410, 'unpublished', $e->getMessage());
        } catch (GalleryCorruptSnapshotException $e) {
            return GalleryResponse::error($request, 500, 'internal_error', 'Published gallery snapshot integrity failure.');
        }
    }
}
