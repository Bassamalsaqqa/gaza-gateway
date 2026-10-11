<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Passenger;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Exceptions\AuthenticationException;
use App\Identity\Passenger\Exceptions\SessionNotFoundException;
use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionContext;
use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PassengerSessionController extends Controller
{
    use HandlesIdentityResponses;

    public function __construct(
        private readonly PassengerAuthCoordinator $coordinator,
        private readonly IdentityCommandValidator $validator,
    ) {
    }

    /**
     * GET /api/v1/auth/passenger/sessions (getPassengerSessions) -> 200 OK
     */
    public function index(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('getPassengerSessions', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        /** @var PassengerSessionContext|null $sessionContext */
        $sessionContext = $request->attributes->get('identity_session_context');
        if ($sessionContext === null || $sessionContext->isAnonymous() || !$sessionContext->isFull()) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Authenticated passenger session required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        try {
            $sessions = $this->coordinator->listSessions($sessionContext);

            return $this->successResponse(
                data: ['sessions' => $sessions],
                status: 200,
                requestId: $requestId
            );
        } catch (AuthenticationException) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Authenticated passenger session required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }
    }

    /**
     * DELETE /api/v1/auth/passenger/sessions/{id} (deletePassengerSession) -> 200 OK
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('deletePassengerSession', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        /** @var PassengerSessionContext|null $sessionContext */
        $sessionContext = $request->attributes->get('identity_session_context');
        if ($sessionContext === null || $sessionContext->isAnonymous() || !$sessionContext->isFull()) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Authenticated passenger session required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        try {
            $isCurrent = $this->coordinator->deleteSession($id, $sessionContext, $requestId);

            $cookie = $isCurrent
                ? CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
                : null;

            return $this->successResponse(
                data: ['revoked' => true],
                status: 200,
                requestId: $requestId,
                cookie: $cookie
            );
        } catch (AuthenticationException) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Authenticated passenger session required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        } catch (SessionNotFoundException) {
            return $this->errorResponse(
                status: 404,
                code: 'not_found',
                message: 'Session not found.',
                requestId: $requestId
            );
        }
    }
}
