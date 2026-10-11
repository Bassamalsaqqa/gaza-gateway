<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Concerns;

use App\Identity\Contracts\IdentityCommandValidator;
use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

trait HandlesIdentityResponses
{
    /**
     * Validate incoming request against server-owned identity command contract.
     */
    protected function validateCommand(
        string $operationId,
        Request $request,
        IdentityCommandValidator $validator,
        string $requestId
    ): ?JsonResponse {
        $rawBody = $request->getContent();
        /** @var array<string, mixed> $routeParams */
        $routeParams = $request->attributes->get('route_params', []);

        $result = $validator->validateJson($operationId, $rawBody, $routeParams);
        if ($result->isValid()) {
            return null;
        }

        $fields = [];
        foreach ($result->getViolations() as $violation) {
            $path = $violation->getPath() !== '' ? $violation->getPath() : '_root';
            $fields[$path][] = $violation->getMessage();
        }

        return $this->errorResponse(
            status: 422,
            code: 'validation_error',
            message: 'Input schema validation failure',
            requestId: $requestId,
            fields: $fields
        );
    }

    /**
     * Standardized JSON success response matching OpenAPI schemas.
     *
     * @param array<string, mixed> $data
     * @param array<string, string> $extraHeaders
     */
    protected function successResponse(
        array $data,
        int $status,
        string $requestId,
        ?Cookie $cookie = null,
        array $extraHeaders = []
    ): JsonResponse {
        $headers = array_merge([
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ], $extraHeaders);

        $response = response()->json([
            'success' => true,
            'data' => $data,
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            ],
        ], $status, $headers);

        if ($cookie !== null) {
            $response->withCookie($cookie);
        }

        return $response;
    }

    /**
     * Standardized JSON error response matching OpenAPI ErrorResponse schema.
     *
     * @param array<string, list<string>>|null $fields
     */
    protected function errorResponse(
        int $status,
        string $code,
        string $message,
        string $requestId,
        ?array $fields = null,
        ?Cookie $clearingCookie = null,
        ?int $retryAfterSeconds = null
    ): JsonResponse {
        $headers = [
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ];

        if ($retryAfterSeconds !== null) {
            $headers['Retry-After'] = (string) $retryAfterSeconds;
        }

        $errorData = [
            'code' => $code,
            'message' => $message,
        ];

        if ($fields !== null && !empty($fields)) {
            $errorData['fields'] = $fields;
        }

        $response = response()->json([
            'success' => false,
            'error' => $errorData,
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            ],
        ], $status, $headers);

        if ($clearingCookie !== null) {
            $response->withCookie($clearingCookie);
        }

        return $response;
    }
}
