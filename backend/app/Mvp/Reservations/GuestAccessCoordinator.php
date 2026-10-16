<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Sessions\PassengerSessionContext;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Mvp\Reservations\Exceptions\ReservationSessionExpiredException;
use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use App\Support\DatabaseClock;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class GuestAccessCoordinator
{
    public function __construct(
        private readonly Encrypter $encrypter,
        private readonly ReservationCoordinator $coordinator,
    ) {}

    public function createEmailChallenge(string $email, PassengerSessionContext $session): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            throw new ReservationValidationException('Invalid email address format.');
        }

        $now = DatabaseClock::now();
        $challengeId = (string) Str::uuid();
        $code = sprintf('%06d', random_int(0, 999999));
        $codeDigest = $this->computeEmailCodeDigest($challengeId, $email, $session->sessionId, $code);

        $sessionAbsoluteExpiry = CarbonImmutable::parse($session->absoluteExpiresAt);
        $expiresAt = $now->addSeconds(600);
        if ($expiresAt->greaterThan($sessionAbsoluteExpiry)) {
            $expiresAt = $sessionAbsoluteExpiry;
        }

        $payload = [
            'type' => 'email_verification',
            'recipient' => $email,
            'code' => $code,
        ];
        $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        DB::transaction(function () use ($challengeId, $session, $email, $codeDigest, $now, $expiresAt, $encryptedPayload): void {
            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Session expired.');
            }

            DB::table('mvp_guest_email_challenges')->insert([
                'id' => $challengeId,
                'session_id' => $session->sessionId,
                'email' => $email,
                'code_digest' => $codeDigest,
                'failed_attempts' => 0,
                'state' => 'issued',
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'consumed_at' => null,
            ]);

            DB::table('mvp_guest_mail_outbox')->insert([
                'id' => (string) Str::uuid(),
                'challenge_type' => 'email_verification',
                'challenge_id' => $challengeId,
                'recipient_email' => $email,
                'encrypted_payload' => $encryptedPayload,
                'status' => 'queued',
                'attempts' => 0,
                'provider_message_id' => null,
                'accepted_at' => null,
                'expires_at' => $expiresAt->toIso8601String(),
                'created_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);
        });

        $remainingSeconds = max(0, $expiresAt->getTimestamp() - $now->getTimestamp());

        return [
            'challengeId' => $challengeId,
            'expiresInSeconds' => $remainingSeconds,
        ];
    }

    public function verifyEmailChallenge(string $challengeId, string $code, PassengerSessionContext $session): array
    {
        if (strlen($code) !== 6 || !ctype_digit($code)) {
            throw new ReservationValidationException('Verification code must be 6 digits.');
        }

        $outcome = DB::transaction(function () use ($challengeId, $code, $session): array {
            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                return ['status' => 'session_revoked'];
            }
            $now = DatabaseClock::now();
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->idle_expires_at))) {
                return ['status' => 'session_expired'];
            }

            $challenge = DB::table('mvp_guest_email_challenges')
                ->where('id', $challengeId)
                ->where('session_id', $session->sessionId)
                ->lockForUpdate()
                ->first();

            if (!$challenge) {
                return ['status' => 'not_found'];
            }

            $expiresAt = CarbonImmutable::parse($challenge->expires_at);

            if ($challenge->state !== 'issued' || $now->greaterThanOrEqualTo($expiresAt) || (int) $challenge->failed_attempts >= 5) {
                if ($challenge->state === 'issued' && $now->greaterThanOrEqualTo($expiresAt)) {
                    DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->update(['state' => 'expired']);
                }
                return ['status' => 'invalid_or_expired'];
            }

            $expectedDigest = $this->computeEmailCodeDigest($challengeId, (string) $challenge->email, $session->sessionId, $code);

            if (!hash_equals((string) $challenge->code_digest, $expectedDigest)) {
                $failed = (int) $challenge->failed_attempts + 1;
                DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->update([
                    'failed_attempts' => $failed,
                    'state' => $failed >= 5 ? 'exhausted' : 'issued',
                ]);
                return ['status' => 'invalid_code'];
            }

            // Valid code: consume challenge
            DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->update([
                'state' => 'consumed',
                'consumed_at' => $now->toIso8601String(),
            ]);

            $sessionAbsoluteExpiry = CarbonImmutable::parse($sessionRow->absolute_expires_at);
            $grantExpiresAt = $now->addSeconds(1800);
            if ($grantExpiresAt->greaterThan($sessionAbsoluteExpiry)) {
                $grantExpiresAt = $sessionAbsoluteExpiry;
            }

            $existingGrant = DB::table('mvp_guest_email_grants')
                ->where('session_id', $session->sessionId)
                ->whereRaw('LOWER(email) = ?', [strtolower(trim((string) $challenge->email))])
                ->first();

            if ($existingGrant) {
                DB::table('mvp_guest_email_grants')->where('id', $existingGrant->id)->update([
                    'challenge_id' => $challengeId,
                    'verified_at' => $now->toIso8601String(),
                    'expires_at' => $grantExpiresAt->toIso8601String(),
                ]);
            } else {
                DB::table('mvp_guest_email_grants')->insert([
                    'id' => (string) Str::uuid(),
                    'session_id' => $session->sessionId,
                    'email' => strtolower(trim((string) $challenge->email)),
                    'challenge_id' => $challengeId,
                    'verified_at' => $now->toIso8601String(),
                    'expires_at' => $grantExpiresAt->toIso8601String(),
                ]);
            }

            return [
                'status' => 'success',
                'data' => ['verified' => true],
            ];
        });

        if ($outcome['status'] === 'session_revoked') {
            throw new ReservationSessionExpiredException('Session revoked.');
        }
        if ($outcome['status'] === 'session_expired') {
            throw new ReservationSessionExpiredException('Session expired while waiting for lock.');
        }
        if ($outcome['status'] === 'not_found') {
            throw new ReservationValidationException('Verification challenge not found.');
        }
        if ($outcome['status'] === 'invalid_or_expired') {
            throw new ReservationValidationException('Verification challenge is invalid or expired.');
        }
        if ($outcome['status'] === 'invalid_code') {
            throw new ReservationValidationException('Invalid verification code.');
        }

        return $outcome['data'];
    }

    public function isEmailVerified(string $sessionId, string $email): bool
    {
        $normalizedEmail = strtolower(trim($email));
        $now = DatabaseClock::now();

        return DB::table('mvp_guest_email_grants')
            ->where('session_id', $sessionId)
            ->whereRaw('LOWER(email) = ?', [$normalizedEmail])
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', $now->toIso8601String())
            ->exists();
    }

    public function createAccessChallenge(string $reference, string $email, PassengerSessionContext $session): array
    {
        $reference = trim($reference);
        $email = strtolower(trim($email));

        if (strlen($reference) < 6 || strlen($reference) > 16 || preg_match('/\A[A-Za-z0-9_-]{6,16}\z/', $reference) !== 1) {
            throw new ReservationValidationException('Invalid reservation reference format.');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            throw new ReservationValidationException('Invalid email address format.');
        }

        $now = DatabaseClock::now();
        $challengeId = (string) Str::uuid();
        $code = sprintf('%06d', random_int(0, 999999));
        $codeDigest = $this->computeAccessCodeDigest($challengeId, $reference, $email, $session->sessionId, $code);

        $sessionAbsoluteExpiry = CarbonImmutable::parse($session->absoluteExpiresAt);
        $expiresAt = $now->addSeconds(600);
        if ($expiresAt->greaterThan($sessionAbsoluteExpiry)) {
            $expiresAt = $sessionAbsoluteExpiry;
        }

        // Look up reservation by reference without exposing existence
        $res = DB::table('mvp_reservations')->where('reference', $reference)->first();
        $matches = $res !== null && strtolower(trim((string) $res->contact_email)) === $email;

        DB::transaction(function () use ($challengeId, $session, $res, $matches, $reference, $email, $codeDigest, $code, $now, $expiresAt): void {
            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Session expired.');
            }

            DB::table('mvp_guest_access_challenges')->insert([
                'id' => $challengeId,
                'reservation_id' => $matches ? (string) $res->id : null,
                'session_id' => $session->sessionId,
                'reference_candidate' => $reference,
                'email_candidate' => $email,
                'code_digest' => $codeDigest,
                'failed_attempts' => 0,
                'state' => 'issued',
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'consumed_at' => null,
            ]);

            if ($matches && $res !== null) {
                $payload = [
                    'type' => 'access_challenge',
                    'recipient' => (string) $res->contact_email,
                    'reference' => $reference,
                    'code' => $code,
                ];
                $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

                DB::table('mvp_guest_mail_outbox')->insert([
                    'id' => (string) Str::uuid(),
                    'challenge_type' => 'access_challenge',
                    'challenge_id' => $challengeId,
                    'recipient_email' => (string) $res->contact_email,
                    'encrypted_payload' => $encryptedPayload,
                    'status' => 'queued',
                    'attempts' => 0,
                    'provider_message_id' => null,
                    'accepted_at' => null,
                    'expires_at' => $expiresAt->toIso8601String(),
                    'created_at' => $now->toIso8601String(),
                    'updated_at' => $now->toIso8601String(),
                ]);
            }
        });

        $remainingSeconds = max(0, $expiresAt->getTimestamp() - $now->getTimestamp());

        return [
            'challengeId' => $challengeId,
            'expiresInSeconds' => $remainingSeconds,
        ];
    }

    public function verifyAccessChallenge(string $challengeId, string $code, PassengerSessionContext $session): array
    {
        if (strlen($code) !== 6 || !ctype_digit($code)) {
            throw new ReservationValidationException('Verification code must be 6 digits.');
        }

        $outcome = DB::transaction(function () use ($challengeId, $code, $session): array {
            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                return ['status' => 'session_revoked'];
            }
            $now = DatabaseClock::now();
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($sessionRow->idle_expires_at))) {
                return ['status' => 'session_expired'];
            }

            $challenge = DB::table('mvp_guest_access_challenges')
                ->where('id', $challengeId)
                ->where('session_id', $session->sessionId)
                ->lockForUpdate()
                ->first();

            if (!$challenge) {
                return ['status' => 'not_found'];
            }

            $expiresAt = CarbonImmutable::parse($challenge->expires_at);

            if ($challenge->state !== 'issued' || $now->greaterThanOrEqualTo($expiresAt) || (int) $challenge->failed_attempts >= 5) {
                if ($challenge->state === 'issued' && $now->greaterThanOrEqualTo($expiresAt)) {
                    DB::table('mvp_guest_access_challenges')->where('id', $challengeId)->update(['state' => 'expired']);
                }
                return ['status' => 'invalid_or_expired'];
            }

            $expectedDigest = $this->computeAccessCodeDigest(
                $challengeId,
                (string) $challenge->reference_candidate,
                (string) $challenge->email_candidate,
                $session->sessionId,
                $code
            );

            // Decoys or wrong code fail closed identically
            if ($challenge->reservation_id === null || !hash_equals((string) $challenge->code_digest, $expectedDigest)) {
                $failed = (int) $challenge->failed_attempts + 1;
                DB::table('mvp_guest_access_challenges')->where('id', $challengeId)->update([
                    'failed_attempts' => $failed,
                    'state' => $failed >= 5 ? 'exhausted' : 'issued',
                ]);
                return ['status' => 'invalid_code'];
            }

            // Valid genuine challenge: consume and grant access
            DB::table('mvp_guest_access_challenges')->where('id', $challengeId)->update([
                'state' => 'consumed',
                'consumed_at' => $now->toIso8601String(),
            ]);

            $sessionAbsoluteExpiry = CarbonImmutable::parse($sessionRow->absolute_expires_at);
            $grantExpiresAt = $now->addSeconds(1800);
            if ($grantExpiresAt->greaterThan($sessionAbsoluteExpiry)) {
                $grantExpiresAt = $sessionAbsoluteExpiry;
            }

            $existingGrant = DB::table('mvp_guest_access_grants')
                ->where('session_id', $session->sessionId)
                ->where('reservation_id', $challenge->reservation_id)
                ->first();

            if ($existingGrant) {
                DB::table('mvp_guest_access_grants')->where('id', $existingGrant->id)->update([
                    'reference' => (string) $challenge->reference_candidate,
                    'allowed_actions' => json_encode(['show', 'ticket', 'cancel'], JSON_THROW_ON_ERROR),
                    'issued_at' => $now->toIso8601String(),
                    'expires_at' => $grantExpiresAt->toIso8601String(),
                ]);
            } else {
                DB::table('mvp_guest_access_grants')->insert([
                    'id' => (string) Str::uuid(),
                    'session_id' => $session->sessionId,
                    'reservation_id' => (string) $challenge->reservation_id,
                    'reference' => (string) $challenge->reference_candidate,
                    'allowed_actions' => json_encode(['show', 'ticket', 'cancel'], JSON_THROW_ON_ERROR),
                    'issued_at' => $now->toIso8601String(),
                    'expires_at' => $grantExpiresAt->toIso8601String(),
                ]);
            }

            return [
                'status' => 'success',
                'data' => [
                    'verified' => true,
                    'reference' => (string) $challenge->reference_candidate,
                ],
            ];
        });

        if ($outcome['status'] === 'session_revoked') {
            throw new ReservationSessionExpiredException('Session revoked.');
        }
        if ($outcome['status'] === 'session_expired') {
            throw new ReservationSessionExpiredException('Session expired while waiting for lock.');
        }
        if ($outcome['status'] === 'not_found') {
            throw new ReservationValidationException('Access challenge not found.');
        }
        if ($outcome['status'] === 'invalid_or_expired') {
            throw new ReservationValidationException('Access challenge is invalid or expired.');
        }
        if ($outcome['status'] === 'invalid_code') {
            throw new ReservationValidationException('Invalid verification code.');
        }

        return $outcome['data'];
    }

    public function grantAccessImmediately(string $sessionId, string $reservationId, string $reference, CarbonImmutable $now, CarbonImmutable $sessionAbsoluteExpiry): void
    {
        $grantExpiresAt = $now->addSeconds(1800);
        if ($grantExpiresAt->greaterThan($sessionAbsoluteExpiry)) {
            $grantExpiresAt = $sessionAbsoluteExpiry;
        }

        $existingGrant = DB::table('mvp_guest_access_grants')
            ->where('session_id', $sessionId)
            ->where('reservation_id', $reservationId)
            ->first();

        if ($existingGrant) {
            DB::table('mvp_guest_access_grants')->where('id', $existingGrant->id)->update([
                'reference' => $reference,
                'allowed_actions' => json_encode(['show', 'ticket', 'cancel'], JSON_THROW_ON_ERROR),
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $grantExpiresAt->toIso8601String(),
            ]);
        } else {
            DB::table('mvp_guest_access_grants')->insert([
                'id' => (string) Str::uuid(),
                'session_id' => $sessionId,
                'reservation_id' => $reservationId,
                'reference' => $reference,
                'allowed_actions' => json_encode(['show', 'ticket', 'cancel'], JSON_THROW_ON_ERROR),
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $grantExpiresAt->toIso8601String(),
            ]);
        }
    }

    public function getReservationByRef(string $ref, PassengerSessionContext $session): array
    {
        $grant = $this->assertValidAccessGrant($ref, $session, 'show');
        return $this->coordinator->formatReservationResponse((string) $grant->reservation_id, false);
    }

    public function getReservationTicket(string $ref, PassengerSessionContext $session): array
    {
        $grant = $this->assertValidAccessGrant($ref, $session, 'ticket');
        $row = DB::table('mvp_reservations')->where('id', $grant->reservation_id)->first();
        if (!$row) {
            throw new ReservationNotFoundException();
        }

        $ticket = json_decode((string) $row->ticket_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $ticket['status'] = (string) $row->status;
        foreach ($ticket['tickets'] as &$t) {
            $t['status'] = (string) $row->status;
        }
        unset($t);

        return [
            'reference' => (string) $row->reference,
            'status' => (string) $row->status,
            'tickets' => $ticket['tickets'],
        ];
    }

    public function cancelReservation(string $ref, PassengerSessionContext $session, ?Closure $authorize = null): array
    {
        if (!$authorize) {
            throw new HttpException(401);
        }

        $grant = $this->assertValidAccessGrant($ref, $session, 'cancel');

        return DB::transaction(function () use ($ref, $grant, $session, $authorize): array {
            $resRow = DB::table('mvp_reservations')->where('id', $grant->reservation_id)->first();
            if (!$resRow || $resRow->reference !== $ref) {
                throw new ReservationNotFoundException();
            }

            // 1. Lock session row first
            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }

            // 2. Lock domain revision controls in canonical order: fleet -> network -> schedule
            DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();

            // 3. Service and reservation lock in canonical order: service -> reservation
            DB::table('mvp_services')->where('id', $resRow->service_id)->lockForUpdate()->first();
            $lockedRes = DB::table('mvp_reservations')->where('id', $grant->reservation_id)->lockForUpdate()->first();
            if (!$lockedRes) {
                throw new ReservationNotFoundException();
            }

            // 4. Fresh time & session check AFTER locks
            $now = DatabaseClock::now();

            $freshSession = DB::table('passenger_sessions')->where('id', $session->sessionId)->first();
            if (!$freshSession || $freshSession->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Session expired while waiting for lock.');
            }

            // Mandatory authorize closure recheck
            if (!$authorize || $authorize()->sessionId !== $session->sessionId) {
                throw new HttpException(401);
            }

            // Recheck active correct reservation grant fresh AFTER wait and AFTER locks
            $freshGrant = DB::table('mvp_guest_access_grants')
                ->where('session_id', $session->sessionId)
                ->where('reservation_id', $lockedRes->id)
                ->where('reference', $ref)
                ->whereNotNull('expires_at')
                ->where('expires_at', '>', $now->toIso8601String())
                ->first();

            if (!$freshGrant) {
                throw new ReservationNotFoundException('Reservation access not authorized or expired.');
            }

            $allowedActions = json_decode((string) $freshGrant->allowed_actions, true);
            if (!is_array($allowedActions) || !in_array('cancel', $allowedActions, true)) {
                throw new ReservationNotFoundException('Action not authorized.');
            }

            if ($lockedRes->status === 'cancelled') {
                return [
                    'reference' => $ref,
                    'status' => 'cancelled',
                    'changed' => false,
                    'cancelledAt' => $lockedRes->cancelled_at,
                ];
            }

            $claims = DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->get();
            foreach ($claims as $claim) {
                DB::table('mvp_reservation_seat_claim_history')->insert([
                    'service_id' => $claim->service_id,
                    'seat_code' => $claim->seat_code,
                    'reservation_id' => $claim->reservation_id,
                    'passenger_id' => $claim->passenger_id,
                    'action' => 'released',
                    'created_at' => $now->toIso8601String(),
                ]);
            }
            DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->delete();

            DB::table('mvp_reservations')->where('id', $lockedRes->id)->update([
                'status' => 'cancelled',
                'cancelled_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);

            DB::table('mvp_reservation_audits')->insert([
                'reservation_id' => $lockedRes->id,
                'actor_type' => 'passenger',
                'actor_id' => $session->sessionId,
                'action' => 'cancelled',
                'details' => json_encode(['actor' => 'guest'], JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
            ]);

            return [
                'reference' => $ref,
                'status' => 'cancelled',
                'changed' => true,
                'cancelledAt' => $now->toIso8601String(),
            ];
        });
    }

    private function assertValidAccessGrant(string $ref, PassengerSessionContext $session, string $action = 'show'): object
    {
        $now = DatabaseClock::now();
        $grant = DB::table('mvp_guest_access_grants')
            ->where('session_id', $session->sessionId)
            ->where('reference', $ref)
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', $now->toIso8601String())
            ->first();

        if (!$grant) {
            throw new ReservationNotFoundException('Reservation access not authorized or expired.');
        }

        $allowedActions = json_decode((string) $grant->allowed_actions, true);
        if (!is_array($allowedActions) || !in_array($action, $allowedActions, true)) {
            throw new ReservationNotFoundException('Action not authorized.');
        }

        return $grant;
    }

    private function computeEmailCodeDigest(string $challengeId, string $email, string $sessionId, string $code): string
    {
        $key = $this->resolveVerificationKey();
        return hash_hmac('sha256', json_encode(['gza-guest-email-code:v1', $challengeId, $email, $sessionId, $code], JSON_THROW_ON_ERROR), $key);
    }

    private function computeAccessCodeDigest(string $challengeId, string $reference, string $email, string $sessionId, string $code): string
    {
        $key = $this->resolveVerificationKey();
        return hash_hmac('sha256', json_encode(['gza-guest-access-code:v1', $challengeId, $reference, $email, $sessionId, $code], JSON_THROW_ON_ERROR), $key);
    }

    private function resolveVerificationKey(): string
    {
        $key = config('app.key');
        if (!is_string($key) || !str_starts_with($key, 'base64:')) {
            throw new \LogicException('Verification key is not configured.');
        }
        $decoded = base64_decode(substr($key, 7), true);
        if (!is_string($decoded) || strlen($decoded) !== 32) {
            throw new \LogicException('Verification key is not configured.');
        }
        return $decoded;
    }
}
