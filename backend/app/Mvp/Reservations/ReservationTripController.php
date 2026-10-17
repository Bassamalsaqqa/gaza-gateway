<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Sessions\PassengerSessionContext;
use App\Mvp\Reservations\Exceptions\ReservationAuthorityUnavailableException;
use App\Mvp\Reservations\Exceptions\ReservationConflictException;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Mvp\Reservations\Exceptions\ReservationReferenceChangedException;
use App\Mvp\Reservations\Exceptions\ReservationSessionExpiredException;
use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use JsonException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

final class ReservationTripController
{
    private const MAX_BODY_BYTES = 65536; // Bounded 64 KB

    public function __construct(
        private readonly ReservationTripCoordinator $coordinator,
    ) {}

    public function create(Request $request): JsonResponse
    {
        return $this->handleCreate($request, isGuest: false);
    }

    public function createGuest(Request $request): JsonResponse
    {
        return $this->handleCreate($request, isGuest: true);
    }

    private function handleCreate(Request $request, bool $isGuest): JsonResponse
    {
        $raw = $request->getContent();
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $contentType = $request->header('Content-Type');
        if ($contentType === null || !str_starts_with(strtolower(trim($contentType)), 'application/json')) {
            return ReferenceResponse::error($request, 415, 'unsupported_media_type');
        }

        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_array($decoded) || array_is_list($decoded)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        try {
            $command = $isGuest
                ? ReservationTripCommand::parseGuest($decoded)
                : ReservationTripCommand::parse($decoded);
        } catch (InvalidArgumentException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        $authorize = $request->attributes->get('reservation_authorize');

        try {
            $result = $isGuest
                ? $this->coordinator->createGuestTrip($command, $session, $authorize)
                : $this->coordinator->createTrip($command, $session, $authorize);

            $status = ($result['isNew'] ?? false) ? 201 : 200;

            return ReferenceResponse::success($request, [
                'reservations' => $result['reservations'],
            ], $status);
        } catch (ReservationValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ReservationConflictException) {
            return ReferenceResponse::error($request, 409, 'conflict');
        } catch (ReservationReferenceChangedException) {
            return ReferenceResponse::error($request, 409, 'reference_changed');
        } catch (ReservationNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (ReservationAuthorityUnavailableException) {
            return ReferenceResponse::error($request, 503, 'service_unavailable');
        } catch (HttpException $e) {
            return ReferenceResponse::error(
                $request,
                $e->getStatusCode(),
                $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden'
            );
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }
}
