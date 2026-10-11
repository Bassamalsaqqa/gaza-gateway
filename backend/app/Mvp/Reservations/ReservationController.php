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

final class ReservationController
{
    public function __construct(
        private readonly ReservationCoordinator $coordinator,
    ) {}

    public function seats(Request $request, string $id): JsonResponse
    {
        if (strlen($id) > 1024 || preg_match('/\Asvc1-([A-Za-z0-9_-]+)-(\d{4}-\d{2}-\d{2})\z/', $id) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        try {
            $data = $this->coordinator->getOfferingSeats($id);
            return ReferenceResponse::success($request, $data, 200);
        } catch (ReservationNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        } catch (ReservationAuthorityUnavailableException) {
            return ReferenceResponse::error($request, 503, 'service_unavailable');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function create(Request $request): JsonResponse
    {
        $raw = $request->getContent();
        if (strlen($raw) > 32768) {
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
            $command = ReservationCommand::parse($decoded);
        } catch (InvalidArgumentException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->coordinator->createReservation($command, $session, $request->attributes->get('reservation_authorize'));
            $status = $result['isNew'] ? 201 : 200;
            return ReferenceResponse::success($request, [
                'reservation' => $result['reservation'],
                'ticket' => $result['ticket'],
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
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function index(Request $request): JsonResponse
    {
        $pageParam = $request->query('page', '1');
        $limitParam = $request->query('limit', '20');

        if (!is_string($pageParam) || !ctype_digit($pageParam) || (int) $pageParam < 1
            || !is_string($limitParam) || !ctype_digit($limitParam) || (int) $limitParam < 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->coordinator->getReservations($session, (int) $pageParam, (int) $limitParam);
            return ReferenceResponse::success($request, $data, 200);
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function show(Request $request, string $ref): JsonResponse
    {
        if (strlen($ref) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $ref) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->coordinator->getReservationByRef($ref, $session);
            return ReferenceResponse::success($request, [
                'reservation' => $data['reservation'],
                'ticket' => $data['ticket'],
            ], 200);
        } catch (ReservationNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function cancel(Request $request, string $ref): JsonResponse
    {
        if (strlen($ref) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $ref) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->coordinator->cancelReservation($ref, $session, $request->attributes->get('reservation_authorize'));
            return ReferenceResponse::success($request, $data, 200);
        } catch (ReservationNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function ticket(Request $request, string $ref): JsonResponse
    {
        if (strlen($ref) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $ref) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->coordinator->getReservationTicket($ref, $session);
            return ReferenceResponse::success($request, $data, 200);
        } catch (ReservationNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }
}
