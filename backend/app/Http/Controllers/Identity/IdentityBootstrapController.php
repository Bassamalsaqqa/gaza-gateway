<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity;

use App\Http\Controllers\Controller;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class IdentityBootstrapController extends Controller
{
    public function __construct(
        private readonly PassengerSessionStore $passengerStore,
        private readonly StaffSessionStore $staffStore,
    ) {
    }

    /**
     * GET /api/v1/auth/csrf (getAuthCsrfBootstrap)
     * Bootstraps raw {csrfToken} for passenger realm.
     */
    public function passengerCsrf(Request $request): JsonResponse|Response
    {
        $requestId = RequestCorrelation::fromRequest($request);

        // 1. Check for duplicate expected cookie header -> fail closed
        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_PASSENGER)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate session cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        // 2. Genuinely absent expected cookie -> create anonymous session
        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_PASSENGER)) {
            $receipt = $this->passengerStore->issueAnonymous();
            $cookie = CookieSecurity::createCookie(
                name: CookieSecurity::COOKIE_PASSENGER,
                value: $receipt->getRawToken(),
                ttlSecondsOrTimestamp: CookieSecurity::ANONYMOUS_TTL
            );

            return response()
                ->json(['csrfToken' => $receipt->getCsrfToken()], 200, [
                    'Cache-Control' => 'no-store, private',
                    'X-Request-Id' => $requestId,
                ])
                ->withCookie($cookie);
        }

        // 3. Expected cookie present -> extract value
        $rawCookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER);
        if ($rawCookie === null || $rawCookie === '') {
            // Present but empty or invalid: must reject and clear, never silently establish anonymous
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed or invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        // Validate canonical format
        try {
            OpaqueToken::validateCanonicalBearer($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed or invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        // 4. Resolve current valid same-realm session
        try {
            $context = $this->passengerStore->read($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Failed to resolve session authority.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        // Expired, revoked, stale epoch, or inactive principal -> reject and clear
        if ($context === null) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session has expired, been revoked, or is invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        // Cookie lifetime strictly bounded to original absolute deadline; never extended past it
        $remainingSeconds = max(0, $context->absoluteExpiresAt->getTimestamp() - time());
        if ($remainingSeconds <= 0) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session has reached its absolute lifetime.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        $cookie = CookieSecurity::createCookie(
            name: CookieSecurity::COOKIE_PASSENGER,
            value: $rawCookie,
            ttlSecondsOrTimestamp: $context->absoluteExpiresAt->getTimestamp(),
            isTimestamp: true
        );

        return response()
            ->json(['csrfToken' => $context->getCsrfToken()], 200, [
                'Cache-Control' => 'no-store, private',
                'X-Request-Id' => $requestId,
            ])
            ->withCookie($cookie);
    }

    /**
     * GET /api/v1/staff/csrf (getStaffCsrfBootstrap)
     * Bootstraps raw {csrfToken} for staff administration realm.
     */
    public function staffCsrf(Request $request): JsonResponse|Response
    {
        $requestId = RequestCorrelation::fromRequest($request);

        // 1. Check for duplicate expected cookie header -> fail closed
        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_STAFF)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate staff session cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        // 2. Genuinely absent expected cookie -> create anonymous staff session
        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF)) {
            $receipt = $this->staffStore->issueAnonymous();
            $cookie = CookieSecurity::createCookie(
                name: CookieSecurity::COOKIE_STAFF,
                value: $receipt->getRawToken(),
                ttlSecondsOrTimestamp: CookieSecurity::ANONYMOUS_TTL
            );

            return response()
                ->json(['csrfToken' => $receipt->getCsrfToken()], 200, [
                    'Cache-Control' => 'no-store, private',
                    'X-Request-Id' => $requestId,
                ])
                ->withCookie($cookie);
        }

        // 3. Expected cookie present -> extract value
        $rawCookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        if ($rawCookie === null || $rawCookie === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Staff session cookie is malformed or invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        // Validate canonical format
        try {
            OpaqueToken::validateCanonicalBearer($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Staff session cookie is malformed or invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        // 4. Resolve current valid same-realm staff session
        try {
            $context = $this->staffStore->read($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Failed to resolve staff session authority.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        if ($context === null) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Staff session has expired, been revoked, or is invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        $remainingSeconds = max(0, $context->absoluteExpiresAt->getTimestamp() - time());
        if ($remainingSeconds <= 0) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Staff session has reached its absolute lifetime.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        $cookie = CookieSecurity::createCookie(
            name: CookieSecurity::COOKIE_STAFF,
            value: $rawCookie,
            ttlSecondsOrTimestamp: $context->absoluteExpiresAt->getTimestamp(),
            isTimestamp: true
        );

        return response()
            ->json(['csrfToken' => $context->getCsrfToken()], 200, [
                'Cache-Control' => 'no-store, private',
                'X-Request-Id' => $requestId,
            ])
            ->withCookie($cookie);
    }

    /**
     * Standardized JSON error response matching OpenAPI ErrorResponse schema.
     */
    private function errorResponse(
        int $status,
        string $code,
        string $message,
        string $requestId,
        ?\Symfony\Component\HttpFoundation\Cookie $clearingCookie = null
    ): JsonResponse {
        $response = response()->json([
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            ],
        ], $status, [
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ]);

        if ($clearingCookie !== null) {
            $response->withCookie($clearingCookie);
        }

        return $response;
    }
}
