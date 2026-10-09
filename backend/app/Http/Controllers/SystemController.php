<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Illuminate\Validation\ValidationException;

class SystemController extends Controller
{
    /**
     * GET /api/v1/version (getSystemVersion)
     * Injected from trusted configuration / environment.
     */
    public function version(Request $request): JsonResponse
    {
        $requestId = $request->attributes->get('request_id');
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $version = (string) config('app.version', '1.0.0-foundation');
        $commit = (string) config('app.commit', 'unreleased-local');

        $schemaVersion = 0;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('migrations')) {
                $applied = \Illuminate\Support\Facades\DB::table('migrations')->pluck('migration')->all();
                $foundationMigrations = [
                    '0001_01_01_000001_create_cache_table',
                    '0001_01_01_000002_create_jobs_table',
                ];
                $allApplied = count(array_intersect($foundationMigrations, $applied)) === count($foundationMigrations);
                if ($allApplied) {
                    $schemaVersion = 1;
                }
            }
        } catch (\Throwable) {
            $schemaVersion = 0;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'version' => $version,
                'commit' => $commit,
                'schemaVersion' => $schemaVersion,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => $now,
            ],
        ], 200, [
            'Cache-Control' => 'no-store',
            'X-Request-Id' => $requestId,
        ]);
    }

    /**
     * Canonical error formatter for exceptions across the API
     */
    public static function formatExceptionResponse(\Throwable $e, Request $request): JsonResponse
    {
        $requestId = \App\Support\RequestCorrelation::fromRequest($request);
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $statusCode = 500;
        $code = 'internal_error';
        $message = 'An unexpected internal error occurred.';
        $fields = null;

        if ($e instanceof HttpExceptionInterface) {
            $statusCode = $e->getStatusCode();
            switch ($statusCode) {
                case 400:
                    $code = 'bad_request';
                    $message = 'Bad request.';
                    break;
                case 403:
                    $code = 'forbidden';
                    $message = 'Forbidden.';
                    break;
                case 404:
                    $code = 'not_found';
                    $message = 'Route or resource not found.';
                    break;
                case 405:
                    $code = 'method_not_allowed';
                    $message = 'HTTP method not allowed for this route.';
                    break;
                case 429:
                    $code = 'too_many_requests';
                    $message = 'Too many requests. Please retry later.';
                    break;
                case 503:
                    $code = 'service_unavailable';
                    $message = 'Service unavailable.';
                    break;
                default:
                    $code = 'http_error';
                    $message = 'An HTTP error occurred.';
            }
        } elseif ($e instanceof \Illuminate\Database\QueryException || $e instanceof \PDOException) {
            $statusCode = 503;
            $code = 'service_unavailable';
            $message = 'Service dependencies are unavailable.';
        } elseif ($e instanceof ValidationException) {
            $statusCode = 422;
            $code = 'validation_error';
            $message = 'The given data was invalid.';
            $fields = $e->errors();
        }

        $errorData = [
            'code' => $code,
            'message' => $message,
        ];
        if ($fields !== null) {
            $errorData['fields'] = $fields;
        }

        $headers = [
            'Cache-Control' => 'no-store',
            'X-Request-Id' => $requestId,
        ];

        if ($statusCode === 405 && $e instanceof HttpExceptionInterface) {
            $httpHeaders = $e->getHeaders();
            $headers['Allow'] = $httpHeaders['Allow'] ?? 'GET, HEAD, OPTIONS';
        }

        if ($statusCode === 429 && $e instanceof HttpExceptionInterface) {
            $httpHeaders = $e->getHeaders();
            if (isset($httpHeaders['Retry-After'])) {
                $headers['Retry-After'] = $httpHeaders['Retry-After'];
            }
        }

        return response()->json([
            'success' => false,
            'error' => $errorData,
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => $now,
            ],
        ], $statusCode, $headers);
    }
}
