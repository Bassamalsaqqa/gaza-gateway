<?php

declare(strict_types=1);

namespace App\Gallery\Shared;

use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class GalleryResponse
{
    public static function success(Request $request, mixed $data, int $status = 200, array $headers = []): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => self::meta($request),
        ], $status, array_merge([
            'Cache-Control' => 'no-store, private',
        ], $headers));
    }

    public static function error(
        Request $request,
        int $status,
        string $code,
        ?string $message = null,
        ?array $fields = null,
        array $headers = []
    ): JsonResponse {
        $defaultMessage = match ($code) {
            'unauthenticated' => 'Authentication is required.',
            'forbidden' => 'Operation is not permitted.',
            'not_found' => 'Resource not found.',
            'unpublished' => 'Gallery configuration is unpublished.',
            'conflict' => 'Stale revision conflict.',
            'validation_error' => 'Invalid gallery configuration structure.',
            'bad_request' => 'Bad request.',
            'internal_error' => 'Internal server error.',
            default => 'Operation failed.',
        };

        $errorData = [
            'code' => $code,
            'message' => $message ?? $defaultMessage,
        ];

        if ($fields !== null) {
            $errorData['fields'] = $fields;
        }

        return response()->json([
            'success' => false,
            'error' => $errorData,
            'meta' => self::meta($request),
        ], $status, array_merge([
            'Cache-Control' => 'no-store',
        ], $headers));
    }

    private static function meta(Request $request): array
    {
        return [
            'requestId' => RequestCorrelation::fromRequest($request),
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }
}
