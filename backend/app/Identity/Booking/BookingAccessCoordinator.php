<?php

declare(strict_types=1);

namespace App\Identity\Booking;

use App\Identity\Audit\{AuditActor, AuditOutcome, AuditTargetType, AuditWriter};
use App\Identity\Dispatch\OutboxService;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Proofs\{GuestOtpHelper, GuestOtpPepperRing};
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Staff\StaffOperationResult;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/** Owns closed passenger -> booking -> session -> proof -> outbox transactions. */
final class BookingAccessCoordinator
{
    public const OPERATIONS = ['postCreateGuestChallenge', 'postVerifyGuestChallenge', 'postCreateClaimChallenge',
        'postVerifyClaimChallenge', 'postClaimBookingToAccount'];
    public const GUEST_ACTIONS = ['getBookingByRef', 'patchBookingContact', 'putBookingSeats', 'putBookingExtras',
        'postCancelBooking', 'postCompleteCheckIn', 'postUndoCheckIn', 'getBoardingPasses'];

    public function __construct(private readonly ConnectionInterface $db, private readonly Encrypter $encrypter,
        private readonly GuestOtpPepperRing $peppers, private readonly DurableRateLimiter $limiter,
        private readonly OutboxService $outbox, private readonly AuditWriter $audit) {}

    public function execute(string $operation, #[\SensitiveParameter] array $input, ?string $ref, PassengerSessionContext $context,
        #[\SensitiveParameter] string $cookie, #[\SensitiveParameter] string $csrf, string $ip, string $requestId): StaffOperationResult
    {
        if (!in_array($operation, self::OPERATIONS, true) || $this->db->transactionLevel() !== 0) {
            throw new \LogicException('Booking access requires a closed operation and owned transaction.');
        }
        $create = in_array($operation, ['postCreateGuestChallenge', 'postCreateClaimChallenge'], true);
        $claim = str_contains($operation, 'Claim');
        $ref = $ref ?? $input['ref'] ?? null;
        $keys = $create ? ['reference' => $ref ?? '', 'session_id' => $context->sessionId, 'ip' => $ip]
            : ['subject' => $input['challengeId'] ?? $input['claimProof'] ?? '', 'ip' => $ip];
        $charge = $this->limiter->charge('booking', $create ? 'challenge' : 'proof', $keys);
        if (!$charge->allowed) { throw new RateLimitExceededException($charge->retryAfterSeconds); }
        $challengeStarted = $create ? hrtime(true) : null;
        $result = $this->db->transaction(function () use ($operation, $input, $ref, $context, $cookie, $csrf, $create, $claim, $requestId) {
            $this->db->statement("SET LOCAL lock_timeout = '3000ms'");
            $this->db->statement("SET LOCAL statement_timeout = '5000ms'");
            $user = $context->getUserId() === null ? null : $this->db->table('users')->where('id', $context->getUserId())->lockForUpdate()->first();
            $candidate = isset($input['challengeId']) ? $this->db->table('booking_guest_challenges')->where('id', $input['challengeId'])->first() : null;
            $booking = $candidate?->booking_id !== null ? $this->db->table('bookings')->where('id', $candidate->booking_id)->lockForUpdate()->first()
                : ($ref === null ? null : $this->db->table('bookings')->where('pnr', $ref)
                    // A contended lookup is a decoy, not a timing oracle. No booking
                    // authority is issued. Verification/claim still require blocking locks.
                    ->lock($create ? 'FOR UPDATE SKIP LOCKED' : 'FOR UPDATE')->first());
            $session = $this->db->table('passenger_sessions')->where('id', $context->sessionId)->lockForUpdate()->first();
            $now = $this->now();
            $this->authorize($session, $user, $context, $cookie, $csrf, $now, $claim);
            if ($create) {
                // Surname is a lookup candidate, never authority; no contact destination from caller.
                $matches = $booking !== null && $this->db->table('booking_passengers')->where('booking_id', $booking->id)
                    ->whereRaw('lower(last_name) = ?', [mb_strtolower(trim($input['surname']))])->exists();
                $id = (string) Str::uuid(); $purpose = $claim ? 'claim_booking' : 'manage_booking';
                $code = GuestOtpHelper::generateCode(); $version = $this->peppers->getActiveVersion();
                $bookingId = $matches ? $booking->id : null; $epoch = $matches ? (int) $booking->security_epoch : null;
                $expires = $now->addSeconds(600)->min(CarbonImmutable::parse($session->absolute_expires_at))
                    ->min(CarbonImmutable::parse($session->idle_expires_at));
                $this->db->table('booking_guest_challenges')->insert(['id' => $id, 'booking_id' => $bookingId,
                    'session_id' => $session->id, 'user_id' => $claim ? $user->id : null, 'purpose' => $purpose,
                    'security_epoch' => $epoch, 'code_digest' => GuestOtpHelper::computeDigest($id, $purpose, $bookingId,
                        $session->id, $epoch, $code, $version, $this->peppers), 'pepper_version' => $version,
                    'state' => 'issued', 'failed_attempts' => 0, 'dispatch_status' => 'queued', 'issued_at' => $now, 'expires_at' => $expires]);
                if ($matches) { $this->outbox->enqueueGuestChallenge($id, $code, null, $this->db); }
                $this->event($operation, $claim ? $user->id : null, null, $requestId);
                return new StaffOperationResult(['challengeId' => $id, 'expiresAt' => $expires->toIso8601String(),
                    'message' => 'If the booking details match, verification instructions have been queued for dispatch.']);
            }
            if ($operation === 'postClaimBookingToAccount') {
                return $this->claim($booking, $user, $session, $input['claimProof'], $now, $requestId);
            }
            $challenge = $candidate === null ? null : $this->db->table('booking_guest_challenges')->where('id', $candidate->id)->lockForUpdate()->first();
            $now = $this->now();
            $this->authorize($session, $user, $context, $cookie, $csrf, $now, $claim);
            if (!$challenge || $challenge->session_id !== $session->id || $challenge->purpose !== ($claim ? 'claim_booking' : 'manage_booking')
                || ($claim ? $challenge->user_id !== $user->id : $challenge->user_id !== null)
                || $challenge->state !== 'issued' || $challenge->revoked_at !== null || $challenge->consumed_at !== null
                || (int) $challenge->failed_attempts >= 5 || $now->greaterThanOrEqualTo(CarbonImmutable::parse($challenge->expires_at))) { return null; }
            $outbox = $this->db->table('security_dispatch_outbox')->where('booking_challenge_id', $challenge->id)->lockForUpdate()->first();
            $now = $this->now();
            $this->authorize($session, $user, $context, $cookie, $csrf, $now, $claim);
            $valid = GuestOtpHelper::verifyCode($challenge->code_digest, $challenge->id, $challenge->purpose,
                $challenge->booking_id, $session->id, $challenge->security_epoch === null ? null : (int) $challenge->security_epoch,
                $input['code'], (int) $challenge->pepper_version, $this->peppers);
            // Local capture is intentionally insufficient: only persisted provider acceptance grants authority.
            if (!$valid || !$booking || $now->greaterThanOrEqualTo(CarbonImmutable::parse($challenge->expires_at)) || ($ref !== null && $booking->pnr !== $ref)
                || (int) $booking->security_epoch !== (int) $challenge->security_epoch
                || $challenge->dispatch_status !== 'accepted' || !$outbox || $outbox->status !== 'accepted'
                || $outbox->accepted_at === null || !is_string($outbox->provider_message_id) || $outbox->provider_message_id === '') {
                $attempts = (int) $challenge->failed_attempts + 1;
                $this->db->table('booking_guest_challenges')->where('id', $challenge->id)->update([
                    'failed_attempts' => $attempts, 'state' => $attempts >= 5 ? 'exhausted' : 'issued']);
                return null;
            }
            $this->db->table('booking_guest_challenges')->where('id', $challenge->id)->update(['state' => 'consumed', 'consumed_at' => $now]);
            $token = OpaqueToken::generate($claim ? 'passenger' : 'booking', $claim ? 'booking_claim_proof' : 'booking_guest_grant');
            $expires = $now->addSeconds($claim ? 300 : 900);
            if ($claim) {
                $expires = $expires->min(CarbonImmutable::parse($session->absolute_expires_at))->min(CarbonImmutable::parse($session->idle_expires_at));
                $this->db->table('booking_claim_proofs')->insert(['id' => (string) Str::uuid(), 'token_digest' => $token->getDigest(),
                    'state' => 'issued', 'issued_at' => $now, 'expires_at' => $expires, 'booking_id' => $booking->id,
                    'user_id' => $user->id, 'session_id' => $session->id, 'security_epoch' => $booking->security_epoch, 'purpose' => 'booking_claim_proof']);
                $data = ['claimProof' => $token->getSecretToken(), 'expiresAt' => $expires->toIso8601String()];
            } else {
                $this->db->table('booking_guest_grants')->insert(['id' => (string) Str::uuid(), 'token_digest' => $token->getDigest(),
                    'booking_id' => $booking->id, 'security_epoch' => $booking->security_epoch,
                    'allowed_actions' => json_encode(self::GUEST_ACTIONS, JSON_THROW_ON_ERROR), 'scope_version' => 1,
                    'issued_at' => $now, 'expires_at' => $expires]);
                $data = ['bookingToken' => $token->getSecretToken(), 'pnr' => $booking->pnr,
                    'expiresAt' => $expires->toIso8601String(), 'allowedActions' => self::GUEST_ACTIONS];
            }
            $this->event($operation, $claim ? $user->id : null, $booking->id, $requestId);
            return new StaffOperationResult($data);
        });
        if ($challengeStarted !== null && $result !== null) {
            // After admission and commit, obscure ordinary real/decoy enqueue latency.
            // Never retain database locks while waiting. Slow/failed transactions are
            // not disguised; remote timing and edge admission remain exposure gates.
            $remainingMicros = 250_000 - intdiv(hrtime(true) - $challengeStarted, 1000);
            if ($remainingMicros > 0) { usleep($remainingMicros); }
        }
        return $result ?? throw new BookingAccessException();
    }

    private function authorize(?object $session, ?object $user, PassengerSessionContext $context,
        #[\SensitiveParameter] string $cookie, #[\SensitiveParameter] string $csrf, CarbonImmutable $now, bool $claim): void
    {
        try { OpaqueToken::validateCanonicalBearer($cookie); OpaqueToken::validateCanonicalBearer($csrf); }
        catch (\Throwable) { throw new BookingAccessException(); }
        if (!$session || $session->auth_level !== ($claim ? 'full' : 'anonymous') || $session->user_id !== $context->getUserId()
            || $session->revoked_at !== null || !hash_equals($session->lookup_digest, OpaqueToken::digestOf($cookie))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) { throw new BookingAccessException(); }
        if ($claim && (!$user || $user->status !== 'active' || $user->email_verified_at === null
            || !Argon2idPasswordHasher::isValidStoredHashStructure($user->password_hash)
            || (int) $session->credential_epoch !== (int) $user->credential_epoch)) { throw new BookingAccessException(); }
        try { $payload = json_decode($this->encrypter->decrypt($session->encrypted_payload), true, 32, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { throw new BookingAccessException(); }
        if (!is_string($payload['csrf_token'] ?? null) || !hash_equals($payload['csrf_token'], $csrf)) { throw new BookingAccessException(); }
    }

    private function claim(?object $booking, object $user, object $session, #[\SensitiveParameter] string $token,
        CarbonImmutable $now, string $requestId): ?StaffOperationResult
    {
        if (!$booking) { return null; }
        try { OpaqueToken::validateCanonicalBearer($token); } catch (\Throwable) { return null; }
        $proof = $this->db->table('booking_claim_proofs')->where('token_digest', OpaqueToken::digestOf($token))->lockForUpdate()->first();
        $now = $this->now();
        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) { return null; }
        if (!$proof || $proof->state !== 'issued' || $proof->revoked_at !== null || $proof->consumed_at !== null
            || $proof->purpose !== 'booking_claim_proof' || $proof->booking_id !== $booking->id || $proof->user_id !== $user->id
            || $proof->session_id !== $session->id || (int) $proof->security_epoch !== (int) $booking->security_epoch
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($proof->expires_at))) { return null; }
        if ($booking->owner_user_id !== null && $booking->owner_user_id !== $user->id) { throw new BookingAccessException(409, 'conflict'); }
        $this->db->table('booking_claim_proofs')->where('id', $proof->id)->update(['state' => 'consumed', 'consumed_at' => $now]);
        if ($booking->owner_user_id === null) {
            $this->db->table('bookings')->where('id', $booking->id)->update(['owner_user_id' => $user->id,
                'security_epoch' => (int) $booking->security_epoch + 1, 'updated_at' => $now]);
            foreach (['booking_guest_grants', 'booking_receipt_grants'] as $table) {
                $this->db->table($table)->where('booking_id', $booking->id)->whereNull('revoked_at')->update(['revoked_at' => $now]);
            }
            foreach (['booking_guest_challenges', 'booking_claim_proofs'] as $table) {
                $this->db->table($table)->where('booking_id', $booking->id)->where('state', 'issued')
                    ->update(['state' => 'revoked', 'revoked_at' => $now]);
            }
        }
        $this->event('postClaimBookingToAccount', $user->id, $booking->id, $requestId);
        return new StaffOperationResult($this->detail($booking));
    }

    private function detail(object $booking): array
    {
        $passengers = $this->db->table('booking_passengers')->where('booking_id', $booking->id)->orderBy('passenger_index')->get()
            ->map(fn ($p) => array_filter(['id' => $p->id, 'title' => $p->title, 'firstName' => $p->first_name,
                'lastName' => $p->last_name, 'type' => $p->type, 'linkedAdultPassengerId' => $p->linked_adult_passenger_id], fn ($v) => $v !== null))->all();
        // No fabricated itinerary. Booking legs are a later domain package; absent persisted legs are an empty collection.
        return ['id' => $booking->id, 'pnr' => $booking->pnr, 'status' => $booking->status, 'contactName' => $booking->contact_name,
            'contactEmail' => $booking->contact_email, 'contactPhone' => $booking->contact_phone, 'fareId' => $booking->fare_id,
            'cabin' => $booking->cabin, 'totalAmountMinor' => (int) $booking->total_minor, 'currency' => $booking->currency,
            'passengers' => $passengers, 'legs' => [], 'createdAt' => CarbonImmutable::parse($booking->created_at)->toIso8601String()];
    }

    private function event(string $action, ?string $userId, ?string $bookingId, string $requestId): void
    {
        $this->audit->record($userId === null ? AuditActor::system() : AuditActor::passenger($userId), $action,
            AuditOutcome::Success, AuditTargetType::Booking, $bookingId, ['success' => true], $requestId, $this->db);
    }

    private function now(): CarbonImmutable { return CarbonImmutable::parse($this->db->selectOne('SELECT clock_timestamp() AS now')->now); }
}
