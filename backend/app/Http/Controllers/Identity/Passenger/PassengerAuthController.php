<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Passenger;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Exceptions\AccountSuspendedException;
use App\Identity\Passenger\Exceptions\AuthenticationException;
use App\Identity\Passenger\Exceptions\InvalidPasswordException;
use App\Identity\Passenger\Exceptions\ProofConsumptionFailedException;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\PassengerSessionContext;
use App\Support\RequestCorrelation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PassengerAuthController extends Controller
{
    use HandlesIdentityResponses;

    public function __construct(
        private readonly PassengerAuthCoordinator $coordinator,
        private readonly IdentityCommandValidator $validator,
    ) {
    }

    /**
     * POST /api/v1/auth/register (postPassengerRegister) -> 202 Accepted
     */
    public function register(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerRegister', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $data = $this->coordinator->register($payload, $ip, $requestId);
            return $this->successResponse($data, 202, $requestId);
        } catch (RateLimitExceededException $e) {
            return $this->errorResponse(
                status: 429,
                code: 'too_many_requests',
                message: $e->getMessage(),
                requestId: $requestId,
                retryAfterSeconds: $e->retryAfterSeconds
            );
        } catch (InvalidPasswordException $e) {
            return $this->errorResponse(
                status: 422,
                code: 'validation_error',
                message: $e->getMessage(),
                requestId: $requestId,
                fields: ['password' => [$e->getMessage()]]
            );
        }
    }

    /**
     * POST /api/v1/auth/login (postPassengerLogin) -> 200 OK
     */
    public function login(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerLogin', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        $userAgent = (string) ($request->header('User-Agent') ?? 'unknown');
        $incomingCookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER);
        $rawCsrf = (string) ($request->header('X-CSRF-TOKEN') ?? '');
        /** @var PassengerSessionContext|null $sessionContext */
        $sessionContext = $request->attributes->get('identity_session_context');

        if ($sessionContext === null || $incomingCookie === null || $incomingCookie === '' || $rawCsrf === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Valid session and CSRF token required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER)
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $result = $this->coordinator->login(
                payload: $payload,
                ip: $ip,
                userAgent: $userAgent,
                sessionContext: $sessionContext,
                rawCsrfToken: $rawCsrf,
                incomingRawCookie: $incomingCookie,
                requestId: $requestId
            );

            $cookie = CookieSecurity::createCookie(
                name: CookieSecurity::COOKIE_PASSENGER,
                value: $result->getRawToken(),
                ttlSecondsOrTimestamp: $result->getAbsoluteExpiresAt()->getTimestamp(),
                isTimestamp: true
            );

            return $this->successResponse(
                data: ['user' => $result->getUser()],
                status: 200,
                requestId: $requestId,
                cookie: $cookie
            );
        } catch (RateLimitExceededException $e) {
            return $this->errorResponse(
                status: 429,
                code: 'too_many_requests',
                message: $e->getMessage(),
                requestId: $requestId,
                retryAfterSeconds: $e->retryAfterSeconds
            );
        } catch (AuthenticationException) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Invalid email or password.',
                requestId: $requestId
            );
        }
    }

    /**
     * POST /api/v1/auth/logout (postPassengerLogout) -> 200 OK
     */
    public function logout(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerLogout', $request, $this->validator, $requestId)) {
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
            $this->coordinator->logout($sessionContext, $requestId);
        } catch (AuthenticationException) {
            return $this->errorResponse(401, 'unauthorized', 'Authenticated passenger session required.', $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER));
        }

        $clearingCookie = CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER);

        return $this->successResponse(
            data: ['message' => 'Successfully logged out.'],
            status: 200,
            requestId: $requestId,
            cookie: $clearingCookie
        );
    }

    /**
     * POST /api/v1/auth/email/verify (postPassengerEmailVerify) -> 200 OK
     */
    public function verifyEmail(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerEmailVerify', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $verified = $this->coordinator->emailVerify($payload, $ip, $requestId);
            return $this->successResponse(['verified' => $verified], 200, $requestId);
        } catch (RateLimitExceededException $e) {
            return $this->errorResponse(
                status: 429,
                code: 'too_many_requests',
                message: $e->getMessage(),
                requestId: $requestId,
                retryAfterSeconds: $e->retryAfterSeconds
            );
        } catch (ProofConsumptionFailedException) {
            return $this->errorResponse(
                status: 422,
                code: 'validation_error',
                message: 'Invalid, expired, or previously used verification token.',
                requestId: $requestId,
                fields: ['token' => ['Invalid, expired, or previously used verification token.']]
            );
        } catch (AccountSuspendedException) {
            return $this->errorResponse(
                status: 403,
                code: 'forbidden',
                message: 'Account is suspended.',
                requestId: $requestId
            );
        }
    }

    /**
     * POST /api/v1/auth/email/resend (postPassengerEmailResend) -> 202 Accepted
     */
    public function resendEmail(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerEmailResend', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $data = $this->coordinator->emailResend($payload, $ip, $requestId);
            return $this->successResponse($data, 202, $requestId);
        } catch (RateLimitExceededException $e) {
            return $this->errorResponse(
                status: 429,
                code: 'too_many_requests',
                message: $e->getMessage(),
                requestId: $requestId,
                retryAfterSeconds: $e->retryAfterSeconds
            );
        }
    }
}
