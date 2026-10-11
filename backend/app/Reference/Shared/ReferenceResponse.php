<?php
declare(strict_types=1);

namespace App\Reference\Shared;

use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ReferenceResponse
{
    public static function success(Request $request, mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data, 'meta' => self::meta($request)], $status);
    }

    public static function error(Request $request, int $status, string $code): JsonResponse
    {
        $message = match ($code) {
            'unauthenticated' => 'Authentication is required.',
            'forbidden' => 'Operation is not permitted.',
            'validation_error' => 'Invalid fleet command.',
            'conflict' => 'Reference already exists.',
            'not_found' => 'Reference not found.',
            default => 'Operation failed.',
        };
        return response()->json(['success' => false, 'error' => ['code' => $code, 'message' => $message],
            'meta' => self::meta($request)], $status);
    }

    private static function meta(Request $request): array
    {
        return ['requestId' => RequestCorrelation::fromRequest($request), 'timestamp' => gmdate('Y-m-d\TH:i:s\Z')];
    }
}
