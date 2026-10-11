<?php

declare(strict_types=1);

namespace App\Editorial\Controllers;

use App\Editorial\Exceptions\EditorialNotFoundException;
use App\Editorial\Exceptions\EditorialUnpublishedException;
use App\Editorial\Services\EditorialCoordinator;
use App\Editorial\Shared\EditorialResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EditorialPublishedController extends Controller
{
    private const MAX_BODY_BYTES = 262144; // 256 KiB

    public function __construct(
        private readonly EditorialCoordinator $coordinator
    ) {
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        if (strlen($request->getContent()) > self::MAX_BODY_BYTES) {
            return EditorialResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.');
        }

        foreach ($request->headers->all() as $values) {
            foreach ((array) $values as $val) {
                if (strlen((string) $val) > 8192) {
                    return EditorialResponse::error($request, 400, 'bad_request', 'Header size exceeds limit.');
                }
            }
        }

        try {
            $data = $this->coordinator->getPublished($slug);
            return EditorialResponse::success($request, $data, 200, [
                'Cache-Control' => 'public, max-age=60',
            ]);
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (EditorialUnpublishedException $e) {
            return EditorialResponse::error($request, 410, 'unpublished', $e->getMessage());
        }
    }
}
