<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Sessions\StaffSessionContext;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Mvp\Reservations\Exceptions\ReservationSessionExpiredException;
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

final class AdminReservationController
{
    public function __construct(
        private readonly ReservationCoordinator $coordinator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $pageParam = $request->query('page', '1');
        $limitParam = $request->query('limit', '20');

        if (!is_string($pageParam) || !ctype_digit($pageParam) || (int) $pageParam < 1
            || !is_string($limitParam) || !ctype_digit($limitParam) || (int) $limitParam < 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $search = $request->query('search');
        if ($search !== null && (!is_string($search) || strlen($search) > 100)) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        try {
            $data = $this->coordinator->getAdminReservations((int) $pageParam, (int) $limitParam, $search);
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

        try {
            $data = $this->coordinator->getAdminReservationByRef($ref);
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
        if (!$session instanceof StaffSessionContext) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->coordinator->cancelAdminReservation($ref, $session, $request->attributes->get('reservation_authorize'));
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
}
