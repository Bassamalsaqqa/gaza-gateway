<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Passenger;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Contracts\IdentityCommandValidator;
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

final class PassengerPasswordController extends Controller
{
    use HandlesIdentityResponses;

    public function __construct(
        private readonly PassengerAuthCoordinator $coordinator,
        private readonly IdentityCommandValidator $validator,
    ) {
    }

    /**
     * POST /api/v1/auth/password/forgot (postPassengerPasswordForgot) -> 202 Accepted
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerPasswordForgot', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $data = $this->coordinator->passwordForgot($payload, $ip, $requestId);
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

    /**
     * POST /api/v1/auth/password/reset (postPassengerPasswordReset) -> 200 OK
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('postPassengerPasswordReset', $request, $this->validator, $requestId)) {
            return $violationResponse;
        }

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $this->coordinator->passwordReset($payload, $ip, $requestId);

            $clearingCookie = CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER);

            return $this->successResponse(
                data: ['message' => 'Password has been successfully reset. Please log in with your new credentials.'],
                status: 200,
                requestId: $requestId,
                cookie: $clearingCookie
            );
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
        } catch (ProofConsumptionFailedException) {
            return $this->errorResponse(
                status: 422,
                code: 'validation_error',
                message: 'Invalid, expired, or previously used reset token.',
                requestId: $requestId,
                fields: ['token' => ['Invalid, expired, or previously used reset token.']]
            );
        }
    }

    /**
     * PUT /api/v1/auth/passenger/password (putPassengerPassword) -> 200 OK
     */
    public function changePassword(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);

        if ($violationResponse = $this->validateCommand('putPassengerPassword', $request, $this->validator, $requestId)) {
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

        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if ($ip === null) {
            return $this->errorResponse(400, 'bad_request', 'Unable to resolve client IP.', $requestId);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        try {
            $this->coordinator->changePassword($payload, $sessionContext, $ip, $requestId);

            // Invariant: password change revokes all old sessions and clears current cookie
            $clearingCookie = CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER);

            return $this->successResponse(
                data: ['changed' => true],
                status: 200,
                requestId: $requestId,
                cookie: $clearingCookie
            );
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
                fields: ['newPassword' => [$e->getMessage()]]
            );
        } catch (AuthenticationException) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Current password is incorrect.',
                requestId: $requestId
            );
        }
    }
}
