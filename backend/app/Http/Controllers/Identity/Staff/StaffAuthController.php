<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Staff;

use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Staff\{StaffAuthCoordinator, StaffAuthenticationException};
use App\Support\RequestCorrelation;
use Illuminate\Http\{JsonResponse, Request};

final class StaffAuthController
{
    use HandlesIdentityResponses;

    public function __construct(private readonly StaffAuthCoordinator $coordinator, private readonly IdentityCommandValidator $validator) {}

    public function handle(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);
        $policy = $request->attributes->get('operation_policy');
        $operation = is_array($policy) ? ($policy['operationId'] ?? '') : '';
        if (!in_array($operation, ['postStaffLogin', 'postStaffMfaChallenge', 'postStaffMfaVerify',
            'postStaffLogout', 'getStaffMe', 'getStaffSessions', 'deleteStaffSession', 'postStaffStepUp'], true)) {
            return $this->errorResponse(403, 'forbidden', 'Staff operation is not permitted.', $requestId);
        }
        if ($invalid = $this->validateCommand($operation, $request, $this->validator, $requestId)) { return $invalid; }
        $context = $request->attributes->get('identity_session_context');
        $cookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        $csrf = $request->header('X-CSRF-TOKEN');
        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if (!$context instanceof StaffSessionContext || $cookie === null || $ip === null) {
            return $this->errorResponse(401, 'unauthorized', 'Staff authentication is not valid.', $requestId);
        }
        $raw = $request->getContent();
        $input = $raw === '' ? [] : json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        try {
            if ($operation === 'postStaffLogin') {
                $result = $this->coordinator->login($input, $context, $cookie, (string) $csrf, $ip,
                    (string) $request->userAgent(), $requestId);
            } elseif (in_array($operation, ['postStaffMfaChallenge', 'postStaffMfaVerify'], true)) {
                $pending = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF_PENDING);
                if ($pending === null) { throw new StaffAuthenticationException(); }
                $result = $this->coordinator->pending($operation, $input, $context, $cookie, (string) $csrf,
                    $pending, $ip, (string) $request->userAgent(), $requestId);
            } else {
                $result = $this->coordinator->full($operation, $input, $context, $cookie, $csrf,
                    $request->attributes->get('route_params', [])['id'] ?? null, $ip, $requestId);
            }
            $response = $this->successResponse($result->data(), 200, $requestId);
            if ($result->pendingToken() !== null) {
                $response->withCookie(CookieSecurity::createCookie(CookieSecurity::COOKIE_STAFF_PENDING,
                    $result->pendingToken(), strtotime($result->data()['expiresAt']), true));
                // Non-authorizing identifier needed by the accepted challenge command.
                $response->headers->set('X-Staff-Challenge-Id', $result->challengeId);
            }
            if ($result->session() !== null) {
                $receipt = $result->session();
                $response->withCookie(CookieSecurity::createCookie(CookieSecurity::COOKIE_STAFF,
                    $receipt->getRawToken(), $receipt->absoluteExpiresAt->getTimestamp(), true));
                $response->withCookie(CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING));
            }
            if ($operation === 'postStaffLogout' || ($operation === 'deleteStaffSession'
                && ($request->attributes->get('route_params', [])['id'] ?? null) === $context->sessionId)) {
                $response->withCookie(CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF));
                $response->withCookie(CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING));
            }
            return $response;
        } catch (StaffAuthenticationException) {
            return $this->errorResponse(401, 'unauthorized', 'Staff authentication is not valid.', $requestId);
        } catch (RateLimitExceededException $exception) {
            return $this->errorResponse(429, 'too_many_requests', 'Too many authentication attempts.', $requestId,
                retryAfterSeconds: $exception->retryAfterSeconds);
        }
    }
}
