<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\PassengerProfile;

use App\Http\Controllers\Controller;
use App\Identity\Passenger\Profile\Exceptions\PassengerProfileException;
use App\Identity\Passenger\Profile\Exceptions\ProfileValidationException;
use App\Identity\Passenger\Profile\SavedTravelerCoordinator;
use App\Support\RequestCorrelation;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;
use Throwable;

final class SavedTravelersController extends Controller
{
    public function __construct(
        private readonly SavedTravelerCoordinator $coordinator,
    ) {
    }

    /**
     * GET /auth/passenger/travelers (getSavedTravelers)
     * Returns 200 SavedTravelersResponse
     */
    public function getSavedTravelers(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        try {
            $data = $this->coordinator->getSavedTravelers($request);
            return $this->successResponse($data, $requestId, 200);
        } catch (PassengerProfileException $e) {
            return $this->handleProfileException($e, $requestId);
        } catch (Throwable) {
            return $this->errorResponse(500, 'internal_error', 'An unexpected internal error occurred.', $requestId);
        }
    }

    /**
     * POST /auth/passenger/travelers (postSavedTraveler)
     * Returns 201 SavedTravelerResponse
     */
    public function postSavedTraveler(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        try {
            $data = $this->coordinator->createTraveler($request);
            return $this->successResponse($data, $requestId, 201);
        } catch (JsonException) {
            return $this->errorResponse(
                422,
                'validation_error',
                'Malformed JSON request body.',
                $requestId,
                ['payload' => ['Malformed JSON syntax']]
            );
        } catch (PassengerProfileException $e) {
            return $this->handleProfileException($e, $requestId);
        } catch (Throwable) {
            return $this->errorResponse(500, 'internal_error', 'An unexpected internal error occurred.', $requestId);
        }
    }

    /**
     * PATCH /auth/passenger/travelers/{id} (patchSavedTraveler)
     * Returns 200 SavedTravelerResponse
     */
    public function patchSavedTraveler(Request $request, string $id): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        try {
            $data = $this->coordinator->patchTraveler($request, $id);
            return $this->successResponse($data, $requestId, 200);
        } catch (JsonException) {
            return $this->errorResponse(
                422,
                'validation_error',
                'Malformed JSON request body.',
                $requestId,
                ['payload' => ['Malformed JSON syntax']]
            );
        } catch (PassengerProfileException $e) {
            return $this->handleProfileException($e, $requestId);
        } catch (Throwable) {
            return $this->errorResponse(500, 'internal_error', 'An unexpected internal error occurred.', $requestId);
        }
    }

    /**
     * DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler)
     * Returns 200 DeleteTravelerResponse or 404
     */
    public function deleteSavedTraveler(Request $request, string $id): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        try {
            $data = $this->coordinator->deleteTraveler($request, $id);
            return $this->successResponse($data, $requestId, 200);
        } catch (PassengerProfileException $e) {
            return $this->handleProfileException($e, $requestId);
        } catch (Throwable) {
            return $this->errorResponse(500, 'internal_error', 'An unexpected internal error occurred.', $requestId);
        }
    }

    private function successResponse(mixed $data, string $requestId, int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => CarbonImmutable::now()->toIso8601ZuluString(),
            ],
        ], $status, [
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ]);
    }

    private function handleProfileException(PassengerProfileException $e, string $requestId): JsonResponse
    {
        $fields = ($e instanceof ProfileValidationException) ? $e->getFields() : null;
        return $this->errorResponse(
            status: $e->getStatusCode(),
            code: $e->getErrorCode(),
            message: $e->getMessage(),
            requestId: $requestId,
            fields: $fields
        );
    }

    /**
     * @param array<string, list<string>>|null $fields
     */
    private function errorResponse(
        int $status,
        string $code,
        string $message,
        string $requestId,
        ?array $fields = null
    ): JsonResponse {
        $body = [
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => CarbonImmutable::now()->toIso8601ZuluString(),
            ],
        ];

        if ($fields !== null) {
            $body['error']['fields'] = $fields;
        }

        return response()->json($body, $status, [
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ]);
    }
}
