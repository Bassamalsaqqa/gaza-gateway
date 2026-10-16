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

final class GuestReservationController
{
    public function __construct(
        private readonly GuestAccessCoordinator $guestCoordinator,
        private readonly ReservationCoordinator $reservationCoordinator,
    ) {}

    public function createEmailChallenge(Request $request): JsonResponse
    {
        $validation = $this->validateJsonRequest($request, ['email']);
        if ($validation instanceof JsonResponse) {
            return $validation;
        }

        $email = $validation['email'];
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->guestCoordinator->createEmailChallenge($email, $session);
            return ReferenceResponse::success($request, [
                'challengeId' => $result['challengeId'],
                'expiresInSeconds' => $result['expiresInSeconds'],
            ], 202);
        } catch (ReservationValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function verifyEmailChallenge(Request $request): JsonResponse
    {
        $validation = $this->validateJsonRequest($request, ['challengeId', 'code']);
        if ($validation instanceof JsonResponse) {
            return $validation;
        }

        $challengeId = $validation['challengeId'];
        $code = $validation['code'];

        if (!is_string($challengeId) || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $challengeId) !== 1) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($code) || preg_match('/\A\d{6}\z/', $code) !== 1) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->guestCoordinator->verifyEmailChallenge($challengeId, $code, $session);
            return ReferenceResponse::success($request, $result, 200);
        } catch (ReservationValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
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

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->reservationCoordinator->createGuestReservation(
                $command,
                $session,
                $request->attributes->get('reservation_authorize')
            );
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

    public function createAccessChallenge(Request $request): JsonResponse
    {
        $validation = $this->validateJsonRequest($request, ['reference', 'email']);
        if ($validation instanceof JsonResponse) {
            return $validation;
        }

        $reference = $validation['reference'];
        $email = $validation['email'];

        if (!is_string($reference) || strlen($reference) < 6 || strlen($reference) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $reference) !== 1) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->guestCoordinator->createAccessChallenge($reference, $email, $session);
            return ReferenceResponse::success($request, [
                'challengeId' => $result['challengeId'],
                'expiresInSeconds' => $result['expiresInSeconds'],
            ], 202);
        } catch (ReservationValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function verifyAccessChallenge(Request $request): JsonResponse
    {
        $validation = $this->validateJsonRequest($request, ['challengeId', 'code']);
        if ($validation instanceof JsonResponse) {
            return $validation;
        }

        $challengeId = $validation['challengeId'];
        $code = $validation['code'];

        if (!is_string($challengeId) || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $challengeId) !== 1) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($code) || preg_match('/\A\d{6}\z/', $code) !== 1) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $result = $this->guestCoordinator->verifyAccessChallenge($challengeId, $code, $session);
            return ReferenceResponse::success($request, $result, 200);
        } catch (ReservationValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ReservationSessionExpiredException) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden');
        } catch (Throwable) {
            return ReferenceResponse::error($request, 500, 'internal_error');
        }
    }

    public function show(Request $request, string $ref): JsonResponse
    {
        if (strlen($ref) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $ref) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->guestCoordinator->getReservationByRef($ref, $session);
            $response = ReferenceResponse::success($request, [
                'reservation' => $data['reservation'],
                'ticket' => $data['ticket'],
            ], 200);
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
            return $response;
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

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->guestCoordinator->getReservationTicket($ref, $session);
            $response = ReferenceResponse::success($request, $data, 200);
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
            return $response;
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

    public function cancel(Request $request, string $ref): JsonResponse
    {
        if (strlen($ref) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $ref) !== 1) {
            return ReferenceResponse::error($request, 400, 'bad_request');
        }

        $raw = $request->getContent();
        if (strlen($raw) > 32768) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $contentType = $request->header('Content-Type');
        if ($contentType !== null && !str_starts_with(strtolower(trim($contentType)), 'application/json')) {
            return ReferenceResponse::error($request, 415, 'unsupported_media_type');
        }

        if (trim($raw) !== '') {
            if ($contentType === null || !str_starts_with(strtolower(trim($contentType)), 'application/json')) {
                return ReferenceResponse::error($request, 415, 'unsupported_media_type');
            }
            try {
                $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                return ReferenceResponse::error($request, 422, 'validation_error');
            }
            if (!is_array($decoded) || !empty($decoded)) {
                return ReferenceResponse::error($request, 422, 'validation_error');
            }
        }

        $session = $this->resolveSession($request);
        if (!$session) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        try {
            $data = $this->guestCoordinator->cancelReservation(
                $ref,
                $session,
                $request->attributes->get('reservation_authorize')
            );
            $response = ReferenceResponse::success($request, $data, 200);
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
            return $response;
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

    private function validateJsonRequest(Request $request, array $allowedKeys): array|JsonResponse
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

        foreach (array_keys($decoded) as $key) {
            if (!in_array($key, $allowedKeys, true)) {
                return ReferenceResponse::error($request, 422, 'validation_error');
            }
        }

        foreach ($allowedKeys as $key) {
            if (!array_key_exists($key, $decoded)) {
                return ReferenceResponse::error($request, 422, 'validation_error');
            }
        }

        return $decoded;
    }

    private function resolveSession(Request $request): ?PassengerSessionContext
    {
        $session = $request->attributes->get('identity_session_context');
        if (!$session instanceof PassengerSessionContext) {
            return null;
        }
        return $session;
    }
}
