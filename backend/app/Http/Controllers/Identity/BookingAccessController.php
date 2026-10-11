<?php

declare(strict_types=1);

namespace App\Http\Controllers\Identity;

use App\Http\Controllers\Identity\Concerns\HandlesIdentityResponses;
use App\Identity\Booking\{BookingAccessCoordinator, BookingAccessException};
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use App\Identity\Sessions\PassengerSessionContext;
use App\Support\RequestCorrelation;
use Illuminate\Http\{JsonResponse, Request};

final class BookingAccessController
{
    use HandlesIdentityResponses;

    public function __construct(private readonly BookingAccessCoordinator $coordinator, private readonly IdentityCommandValidator $validator) {}

    public function handle(Request $request): JsonResponse
    {
        $requestId = RequestCorrelation::fromRequest($request);
        $operation = $request->attributes->get('operation_policy', [])['operationId'] ?? '';
        if (!in_array($operation, BookingAccessCoordinator::OPERATIONS, true)) {
            return $this->errorResponse(403, 'forbidden', 'Booking access operation is not permitted.', $requestId);
        }
        if ($invalid = $this->validateCommand($operation, $request, $this->validator, $requestId)) { return $invalid; }
        $context = $request->attributes->get('identity_session_context');
        $cookie = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER);
        $csrf = $request->header('X-CSRF-TOKEN');
        $ip = AnonymousBootstrapAdmission::resolveCanonicalSourceIp($request);
        if (!$context instanceof PassengerSessionContext || $cookie === null || !is_string($csrf) || $ip === null) {
            return $this->errorResponse(401, 'unauthorized', 'Booking access is not valid.', $requestId);
        }
        try {
            $input = json_decode($request->getContent(), true, 32, JSON_THROW_ON_ERROR);
            $result = $this->coordinator->execute($operation, $input, $request->route('ref'), $context, $cookie, $csrf, $ip, $requestId);
            return $this->successResponse($result->data(), in_array($operation,
                ['postCreateGuestChallenge', 'postCreateClaimChallenge'], true) ? 202 : 200, $requestId);
        } catch (BookingAccessException $error) {
            return $this->errorResponse($error->status, $error->errorCode, 'Booking access is not valid.', $requestId);
        } catch (RateLimitExceededException $error) {
            return $this->errorResponse(429, 'too_many_requests', 'Too many booking access attempts.', $requestId,
                retryAfterSeconds: $error->retryAfterSeconds);
        }
    }
}
