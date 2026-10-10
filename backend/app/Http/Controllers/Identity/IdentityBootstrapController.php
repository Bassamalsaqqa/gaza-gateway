<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity;

use App\Http\Controllers\Controller;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use App\Support\RequestCorrelation;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PDOException;
use Symfony\Component\HttpFoundation\Response;

final class IdentityBootstrapController extends Controller
{
    public function __construct(
        private readonly PassengerSessionStore $passengerStore,
        private readonly StaffSessionStore $staffStore,
        private readonly AnonymousBootstrapAdmission $admission,
    ) {
    }

    /**
     * GET /api/v1/auth/csrf (getAuthCsrfBootstrap)
     * Bootstraps raw {csrfToken} for passenger realm.
     */
    public function passengerCsrf(Request $request): JsonResponse|Response
    {
        $requestId = RequestCorrelation::fromRequest($request);
        if (!$this->hasAllowedBootstrapOrigin($request)) {
            return $this->errorResponse(403, 'forbidden', 'Origin is not authorized for identity bootstrap.', $requestId);
        }

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

        // 2. Genuinely absent expected cookie -> create anonymous session via admission coordinator
        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_PASSENGER)) {
            try {
                $admissionResult = $this->admission->admitAndIssueAnonymous(
                    AnonymousBootstrapAdmission::REALM_PASSENGER,
                    $request
                );
            } catch (\Throwable) {
                // Outage, driver failure, or cleanup error -> safe canonical 503, no fallback, no cookie
                return $this->errorResponse(
                    status: 503,
                    code: 'service_unavailable',
                    message: 'Authentication service temporarily unavailable.',
                    requestId: $requestId
                );
            }

            if (!$admissionResult->allowed) {
                // Admission denial -> canonical 429 with bounded positive Retry-After, no token/cookie
                return $this->errorResponse(
                    status: 429,
                    code: 'rate_limited',
                    message: 'Too many requests. Please try again later.',
                    requestId: $requestId,
                    retryAfterSeconds: $admissionResult->retryAfterSeconds
                );
            }

            $receipt = $admissionResult->receipt;
            if ($receipt === null) {
                return $this->errorResponse(
                    status: 503,
                    code: 'service_unavailable',
                    message: 'Authentication service temporarily unavailable.',
                    requestId: $requestId
                );
            }

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
        } catch (QueryException|PDOException) {
            // Distinguish database outage from invalid session authority: safe canonical 503
            return $this->errorResponse(
                status: 503,
                code: 'service_unavailable',
                message: 'Database service unavailable.',
                requestId: $requestId
            );
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
        if (!$this->hasAllowedBootstrapOrigin($request)) {
            return $this->errorResponse(403, 'forbidden', 'Origin is not authorized for identity bootstrap.', $requestId);
        }

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

        // 2. Genuinely absent expected cookie -> create anonymous staff session via admission coordinator
        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF)) {
            try {
                $admissionResult = $this->admission->admitAndIssueAnonymous(
                    AnonymousBootstrapAdmission::REALM_STAFF,
                    $request
                );
            } catch (\Throwable) {
                // Outage, driver failure, or cleanup error -> safe canonical 503, no fallback, no cookie
                return $this->errorResponse(
                    status: 503,
                    code: 'service_unavailable',
                    message: 'Authentication service temporarily unavailable.',
                    requestId: $requestId
                );
            }

            if (!$admissionResult->allowed) {
                // Admission denial -> canonical 429 with bounded positive Retry-After, no token/cookie
                return $this->errorResponse(
                    status: 429,
                    code: 'rate_limited',
                    message: 'Too many requests. Please try again later.',
                    requestId: $requestId,
                    retryAfterSeconds: $admissionResult->retryAfterSeconds
                );
            }

            $receipt = $admissionResult->receipt;
            if ($receipt === null) {
                return $this->errorResponse(
                    status: 503,
                    code: 'service_unavailable',
                    message: 'Authentication service temporarily unavailable.',
                    requestId: $requestId
                );
            }

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
        } catch (QueryException|PDOException) {
            return $this->errorResponse(
                status: 503,
                code: 'service_unavailable',
                message: 'Database service unavailable.',
                requestId: $requestId
            );
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
        ?\Symfony\Component\HttpFoundation\Cookie $clearingCookie = null,
        ?int $retryAfterSeconds = null
    ): JsonResponse {
        $headers = [
            'Cache-Control' => 'no-store, private',
            'X-Request-Id' => $requestId,
        ];

        if ($retryAfterSeconds !== null) {
            $headers['Retry-After'] = (string) $retryAfterSeconds;
        }

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
        ], $status, $headers);

        if ($clearingCookie !== null) {
            $response->withCookie($clearingCookie);
        }

        return $response;
    }

    private function hasAllowedBootstrapOrigin(Request $request): bool
    {
        $origins = $request->headers->all('origin');
        // Safe direct GETs may omit Origin. A supplied origin must be exact and singular.
        return $origins === [] || (count($origins) === 1 && is_string($origins[0])
            && in_array($origins[0], (array) config('cors.allowed_origins', []), true));
    }
}
