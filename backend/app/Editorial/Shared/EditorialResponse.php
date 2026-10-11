<?php

declare(strict_types=1);

namespace App\Editorial\Shared;

use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EditorialResponse
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
            'unpublished' => 'Document is unpublished.',
            'conflict' => 'Stale revision conflict.',
            'validation_error' => 'Invalid content document structure.',
            'bad_request' => 'Bad request.',
            default => 'Operation failed.',
        };

        $errorData = [
            'code' => $code,
            'message' => $defaultMessage,
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
