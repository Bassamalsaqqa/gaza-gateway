<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity\Staff;

use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Staff\{StaffDirectoryCoordinator, StaffDirectoryException, StaffAuthenticationException};
use App\Support\RequestCorrelation;
use Illuminate\Http\{JsonResponse, Request};

final class StaffDirectoryController
{
    use HandlesIdentityResponses;

    public function __construct(private readonly StaffDirectoryCoordinator $coordinator, private readonly IdentityCommandValidator $validator) {}

    public function handle(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);
        $operation = $request->attributes->get('operation_policy', [])['operationId'] ?? '';
        if (!in_array($operation, StaffDirectoryCoordinator::OPERATIONS, true)) {
            return $this->errorResponse(403, 'forbidden', 'Staff directory operation is not permitted.', $requestId);
        }
        if ($invalid = $this->validateCommand($operation, $request, $this->validator, $requestId)) { return $invalid; }
        $context = $request->attributes->get('identity_session_context');
        $cookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if (!$context instanceof StaffSessionContext || $cookie === null || $ip === null) {
            return $this->errorResponse(401, 'unauthorized', 'Staff authentication is not valid.', $requestId);
        }
        $body = $request->getContent(); $input = $body === '' ? [] : json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        try {
            $result = $this->coordinator->execute($operation, $input, $request->attributes->get('route_params', [])['id'] ?? null,
                $context, $cookie, $request->header('X-CSRF-TOKEN'), $ip, $requestId);
            $response = $this->successResponse($result->data(), $operation === 'postStaffUserInvite' ? 201 : 200, $requestId);
            if ($operation === 'postStaffMfaSetupConfirm') {
                $response->withCookie(CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF));
                $response->withCookie(CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING));
            }
            return $response;
        } catch (StaffAuthenticationException) {
            return $this->errorResponse(401, 'unauthorized', 'Staff authentication is not valid.', $requestId);
        } catch (StaffDirectoryException $error) {
            return $this->errorResponse($error->status, $error->errorCode, 'Staff directory operation could not be completed.', $requestId);
        } catch (RateLimitExceededException $error) {
            return $this->errorResponse(429, 'too_many_requests', 'Too many authentication attempts.', $requestId,
                retryAfterSeconds: $error->retryAfterSeconds);
        } catch (LastAdminConflictException) {
            return $this->errorResponse(409, 'last_admin_conflict', 'An eligible administrator must remain.', $requestId);
        } catch (\InvalidArgumentException) {
            return $this->errorResponse(422, 'validation_error', 'Staff directory policy validation failed.', $requestId);
        }
    }
}
