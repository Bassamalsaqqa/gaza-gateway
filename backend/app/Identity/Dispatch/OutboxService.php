<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Identity\Dispatch\Exceptions\DispatchException;
use App\Identity\Proofs\GuestOtpHelper;
use App\Identity\Proofs\GuestOtpPepperRing;
use App\Identity\Proofs\ProofIssuedReceipt;
use App\Identity\Proofs\ProofPurpose;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Service for transactional enqueueing of security dispatches.
 *
 * Enforces:
 * - Authoritative database binding under transaction locks:
 *   Derives preliminary identity, then acquires locks in strict hierarchy:
 *   Principal -> Proof (matching ProofService to prevent 40P01 deadlocks).
 *   Booking -> Challenge (preventing challenge->booking inversions).
 * - Revalidates all persisted identities, purpose, raw token digest, email snapshot,
 *   credential epoch, state, and deadline strictly AFTER acquiring locks.
 * - Validates issued receipts against persisted records, rejecting forged tokens,
 *   principals, or extended expiry attempts.
 * - Guest challenge OTP verification against versioned HMAC pepper ring with GuestOtpHelper.
 * - Rejection of unauthorized recipient email overrides (delivery strictly to booking contact).
 * - Exactly one of five concrete proof FKs per outbox entry.
 * - Binds authoritative persisted expiry deadline.
 * - Plaintext recipient, subject, body, and token strictly sealed inside encrypted payload.
 * - Zero plaintext PII or secrets stored in table columns.
 * - Fully participates in caller transactions for atomic mutations.
 */
class OutboxService
{
    public function __construct(
        private readonly Encrypter $encrypter,
        private readonly ?ConnectionInterface $db = null,
        private readonly ?GuestOtpPepperRing $guestPepperRing = null,
    ) {
    }

    private function getDb(?ConnectionInterface $override = null): ConnectionInterface
    {
        return $override ?? $this->db ?? DB::connection();
    }

    private function executeInTransaction(?ConnectionInterface $conn, Closure $callback): mixed
    {
        $targetDb = $conn ?? $this->getDb();

        if ($conn !== null && $conn->transactionLevel() > 0) {
            return $callback($conn);
        }

        return $targetDb->transaction(function (ConnectionInterface $tx) use ($callback) {
            return $callback($tx);
        });
    }

    /**
     * Enqueue a dispatch for a verified persisted proof token or issued receipt.
     */
    public function enqueueProof(
        ProofIssuedReceipt|ProofPurpose $purposeOrReceipt,
        string|ConnectionInterface|null $proofIdOrConn = null,
        #[\SensitiveParameter]
        ?string $rawSecretToken = null,
        ?ConnectionInterface $conn = null,
    ): string {
        $receipt = null;
        if ($purposeOrReceipt instanceof ProofIssuedReceipt) {
            $receipt = $purposeOrReceipt;
            $purpose = $receipt->purpose;
            $proofId = $receipt->proofId;
            $token = $receipt->getRawToken();
            $targetConn = $proofIdOrConn instanceof ConnectionInterface ? $proofIdOrConn : null;
            $expectedPrincipalId = $receipt->principalId;
            $expectedEpoch = $receipt->credentialEpoch;
        } else {
            $purpose = $purposeOrReceipt;
            $proofId = (string) $proofIdOrConn;
            $token = (string) $rawSecretToken;
            $targetConn = $conn;
            $expectedPrincipalId = null;
            $expectedEpoch = null;
        }

        return $this->executeInTransaction($targetConn, function (ConnectionInterface $tx) use (
            $purpose,
            $proofId,
            $token,
            $expectedPrincipalId,
            $expectedEpoch,
            $receipt
        ) {
            // 1. Non-authoritative preliminary lookup to derive principal ID
            $prelimRow = $tx->table($purpose->table())
                ->where('id', $proofId)
                ->first(['id', $purpose->principalColumn(), 'purpose', 'expires_at']);

            if (!$prelimRow) {
                throw new DispatchException('Persisted proof record was not found.');
            }

            $principalId = (string) $prelimRow->{$purpose->principalColumn()};
            if ($expectedPrincipalId !== null && $principalId !== $expectedPrincipalId) {
                throw new DispatchException('Principal identifier mismatch.');
            }

            // 2. Lock principal row FIRST in common lock hierarchy (Principal -> Proof)
            $principal = $tx->table($purpose->principalTable())
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id', 'email', 'credential_epoch', 'status']);

            if (!$principal) {
                throw new DispatchException('Target principal account was not found.');
            }

            // 3. Lock proof row SECOND in common lock hierarchy
            $proofRow = $tx->table($purpose->table())
                ->where('id', $proofId)
                ->lockForUpdate()
                ->first();

            if (!$proofRow) {
                throw new DispatchException('Persisted proof record was not found.');
            }

            // 4. Revalidate all persisted bindings strictly AFTER acquiring locks
            if ((string) $proofRow->{$purpose->principalColumn()} !== $principalId) {
                throw new DispatchException('Principal identifier mismatch.');
            }

            if ($proofRow->state !== 'issued') {
                throw new DispatchException('Proof record is not in an issued state.');
            }

            if ($proofRow->purpose !== $purpose->value) {
                throw new DispatchException('Proof purpose mismatch.');
            }

            // 5. Validate presented raw token matches stored digest
            $computedDigest = hash('sha256', $token);
            if (!hash_equals((string) $proofRow->token_digest, $computedDigest)) {
                throw new DispatchException('Provided token does not match persisted proof digest.');
            }

            // 6. Validate credential epoch
            if ((int) $principal->credential_epoch !== (int) $proofRow->credential_epoch) {
                throw new DispatchException('Credential epoch mismatch on proof principal.');
            }

            if ($expectedEpoch !== null && (int) $proofRow->credential_epoch !== $expectedEpoch) {
                throw new DispatchException('Credential epoch mismatch on proof receipt.');
            }

            // 7. Validate email snapshot
            if ((string) $principal->email !== (string) $proofRow->email_snapshot) {
                throw new DispatchException('Email snapshot mismatch on proof principal.');
            }

            // 8. If receipt provided, verify receipt against persisted authoritative values
            if ($receipt !== null) {
                if (!hash_equals((string) $proofRow->token_digest, $receipt->getTokenDigest())) {
                    throw new DispatchException('Receipt token digest mismatch.');
                }
                if ((string) $proofRow->email_snapshot !== $receipt->getEmailSnapshot()) {
                    throw new DispatchException('Receipt email snapshot mismatch.');
                }
                if ($receipt->expiresAt->greaterThan(CarbonImmutable::parse($proofRow->expires_at))) {
                    throw new DispatchException('Receipt expiry extension detected.');
                }
            }

            // 9. Derive live time and check expiry
            $nowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $liveNow = CarbonImmutable::parse($nowRow->now);
            $expiresAt = CarbonImmutable::parse($proofRow->expires_at);

            if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                throw new DispatchException('Proof record has already expired.');
            }

            // 10. Authoritative snapshot binding
            $authoritativeEmail = (string) $proofRow->email_snapshot;
            $authoritativeExpiry = $expiresAt->toIso8601String();

            $dispatchPurpose = match ($purpose) {
                ProofPurpose::PassengerEmailVerification => DispatchPurpose::PassengerEmailVerification,
                ProofPurpose::PassengerPasswordReset => DispatchPurpose::PassengerPasswordReset,
                ProofPurpose::StaffInvitation => DispatchPurpose::StaffInvitation,
                ProofPurpose::StaffPasswordReset => DispatchPurpose::StaffPasswordReset,
            };

            $body = $this->renderProofBody($purpose, $token, $authoritativeExpiry);

            $payload = new OutboxPayload(
                recipient: $authoritativeEmail,
                subject: $dispatchPurpose->defaultSubject(),
                body: $body,
                purpose: $dispatchPurpose->value,
                tokenOrCode: $token,
            );

            $encryptedPayload = $this->encrypter->encrypt($payload->toJson());
            $outboxId = (string) Str::uuid();

            $record = [
                'id' => $outboxId,
                'user_verification_id' => $dispatchPurpose === DispatchPurpose::PassengerEmailVerification ? $proofId : null,
                'user_reset_id' => $dispatchPurpose === DispatchPurpose::PassengerPasswordReset ? $proofId : null,
                'staff_invitation_id' => $dispatchPurpose === DispatchPurpose::StaffInvitation ? $proofId : null,
                'staff_reset_id' => $dispatchPurpose === DispatchPurpose::StaffPasswordReset ? $proofId : null,
                'booking_challenge_id' => null,
                'encrypted_payload' => $encryptedPayload,
                'status' => 'queued',
                'provider_message_id' => null,
                'accepted_at' => null,
                'scrubbed_at' => null,
                'expires_at' => $authoritativeExpiry,
                'attempts' => 0,
            ];

            $tx->table('security_dispatch_outbox')->insert($record);

            return $outboxId;
        });
    }

    /**
     * Enqueue a dispatch from an issued receipt by validating its persisted row authoritatively.
     */
    public function enqueueProofReceipt(
        ProofIssuedReceipt $receipt,
        ?ConnectionInterface $conn = null,
    ): string {
        return $this->enqueueProof($receipt, $conn);
    }

    /**
     * Enqueue a dispatch for a verified persisted guest challenge OTP.
     */
    public function enqueueGuestChallenge(
        string $challengeId,
        #[\SensitiveParameter]
        string $otpCode,
        ?string $recipientEmailOverride = null,
        ?ConnectionInterface $conn = null,
    ): string {
        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($challengeId, $otpCode, $recipientEmailOverride) {
            // 1. Preliminary lookup to derive related entity IDs
            $prelim = $tx->table('booking_guest_challenges')
                ->where('id', $challengeId)
                ->first(['id', 'booking_id', 'session_id', 'user_id', 'purpose', 'security_epoch']);

            if (!$prelim) {
                throw new DispatchException('Persisted challenge record was not found.');
            }

            // Forbid decoys: decoy challenges cannot be enqueued for dispatch
            if ($prelim->booking_id === null) {
                throw new DispatchException('Decoy challenges cannot be enqueued for dispatch.');
            }

            // 2. Lock entities in common lock hierarchy:
            // Claim Passenger Principal (if any) -> Booking -> Bound Session -> Challenge
            $user = null;
            if ($prelim->user_id !== null) {
                $user = $tx->table('users')
                    ->where('id', $prelim->user_id)
                    ->lockForUpdate()
                    ->first(['id', 'email', 'credential_epoch', 'status', 'email_verified_at', 'password_hash']);

                if (!$user) {
                    throw new DispatchException('Target claim user was not found.');
                }
                if ($user->status !== 'active') {
                    throw new DispatchException('Target claim user account is not active.');
                }
                if ($user->email_verified_at === null) {
                    throw new DispatchException('Target claim user email is not verified.');
                }
                if ($user->password_hash === null || $user->password_hash === '') {
                    throw new DispatchException('Target claim user lacks a usable credential.');
                }
                if ($user->credential_epoch === null || (int) $user->credential_epoch < 1) {
                    throw new DispatchException('Target claim user has invalid credential epoch.');
                }
            }

            $booking = $tx->table('bookings')
                ->where('id', $prelim->booking_id)
                ->lockForUpdate()
                ->first(['id', 'contact_email', 'security_epoch']);

            if (!$booking) {
                throw new DispatchException('Target booking was not found.');
            }

            $session = $tx->table('passenger_sessions')
                ->where('id', $prelim->session_id)
                ->lockForUpdate()
                ->first();

            if (!$session) {
                throw new DispatchException('Bound passenger session was not found.');
            }

            // 3. Lock challenge record FOR UPDATE
            $chal = $tx->table('booking_guest_challenges')
                ->where('id', $challengeId)
                ->lockForUpdate()
                ->first();

            if (!$chal) {
                throw new DispatchException('Persisted challenge record was not found.');
            }

            if ($chal->booking_id === null) {
                throw new DispatchException('Decoy challenges cannot be enqueued for dispatch.');
            }

            if ($chal->state !== 'issued') {
                throw new DispatchException('Challenge is not in an issued state.');
            }

            if ((int) $chal->failed_attempts >= 5 || $chal->state === 'exhausted') {
                throw new DispatchException('Challenge attempts exhausted.');
            }

            // 4. Verify live time and expiry strictly AFTER locks
            $nowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $liveNow = CarbonImmutable::parse($nowRow->now);
            $expiresAt = CarbonImmutable::parse($chal->expires_at);

            if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                throw new DispatchException('Challenge record has already expired.');
            }

            // 5. Verify bound session status, revocation, expiry, and bindings
            if ($session->revoked_at !== null) {
                throw new DispatchException('Bound passenger session is revoked.');
            }

            $sessionAbsoluteExpiry = CarbonImmutable::parse($session->absolute_expires_at);
            $sessionIdleExpiry = CarbonImmutable::parse($session->idle_expires_at);
            if ($liveNow->greaterThanOrEqualTo($sessionAbsoluteExpiry) || $liveNow->greaterThanOrEqualTo($sessionIdleExpiry)) {
                throw new DispatchException('Bound passenger session is expired.');
            }

            if ($chal->purpose === 'claim_booking') {
                if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id || $session->auth_level !== 'full') {
                    throw new DispatchException('Session binding mismatch for claim booking challenge.');
                }
                if ($user === null || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                    throw new DispatchException('Credential epoch mismatch on bound session.');
                }
            } else {
                if ($session->auth_level === 'anonymous') {
                    if ($session->user_id !== null || $chal->user_id !== null) {
                        throw new DispatchException('Session binding mismatch for anonymous guest booking challenge.');
                    }
                } elseif ($session->auth_level === 'full') {
                    if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id) {
                        throw new DispatchException('Session binding mismatch for authenticated passenger booking challenge.');
                    }
                    if ($user === null || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                        throw new DispatchException('Credential epoch mismatch on bound passenger session.');
                    }
                } else {
                    throw new DispatchException('Unsupported session auth level for challenge.');
                }
            }

            // 6. Booking epoch validation
            if ($chal->security_epoch !== null && (int) $booking->security_epoch !== (int) $chal->security_epoch) {
                throw new DispatchException('Booking security epoch mismatch.');
            }

            // 6. Derive authoritative recipient email (delivery strictly to persisted booking contact)
            $authoritativeEmail = null;
            if ($booking !== null && isset($booking->contact_email)) {
                $authoritativeEmail = (string) $booking->contact_email;
            }

            if ($authoritativeEmail === null || trim($authoritativeEmail) === '') {
                throw new DispatchException('Unable to resolve authoritative recipient email for challenge.');
            }

            // 7. Enforce recipient email authority: reject arbitrary recipient redirection
            if ($recipientEmailOverride !== null && $recipientEmailOverride !== $authoritativeEmail) {
                throw new DispatchException('Recipient email override does not match authoritative booking contact email.');
            }

            $deliveryRecipient = $authoritativeEmail;

            // 8. Validate submitted 6-digit OTP code against persisted versioned HMAC digest
            if ($this->guestPepperRing === null) {
                throw new DispatchException('Guest OTP pepper ring is unconfigured.');
            }

            $validOtp = GuestOtpHelper::verifyCode(
                storedDigest: (string) $chal->code_digest,
                challengeId: (string) $chal->id,
                purpose: (string) $chal->purpose,
                bookingId: $chal->booking_id !== null ? (string) $chal->booking_id : null,
                sessionId: (string) $chal->session_id,
                securityEpoch: $chal->security_epoch !== null ? (int) $chal->security_epoch : null,
                candidateCode: $otpCode,
                pepperVersion: (int) $chal->pepper_version,
                pepperRing: $this->guestPepperRing,
            );

            if (!$validOtp) {
                throw new DispatchException('Provided OTP code does not match challenge digest.');
            }

            $dispatchPurpose = DispatchPurpose::BookingGuestChallenge;
            $body = sprintf(
                "Palestinian Airlines Booking Verification\n\nYour 6-digit verification code is: %s\n\nThis verification code expires at %s.\nIf you did not request this code, please disregard this message.",
                $otpCode,
                $expiresAt->toIso8601String()
            );

            $payload = new OutboxPayload(
                recipient: $deliveryRecipient,
                subject: $dispatchPurpose->defaultSubject(),
                body: $body,
                purpose: $dispatchPurpose->value,
                tokenOrCode: $otpCode,
            );

            $encryptedPayload = $this->encrypter->encrypt($payload->toJson());
            $outboxId = (string) Str::uuid();

            $record = [
                'id' => $outboxId,
                'user_verification_id' => null,
                'user_reset_id' => null,
                'staff_invitation_id' => null,
                'staff_reset_id' => null,
                'booking_challenge_id' => $challengeId,
                'encrypted_payload' => $encryptedPayload,
                'status' => 'queued',
                'provider_message_id' => null,
                'accepted_at' => null,
                'scrubbed_at' => null,
                'expires_at' => $expiresAt->toIso8601String(),
                'attempts' => 0,
            ];

            $tx->table('security_dispatch_outbox')->insert($record);

            return $outboxId;
        });
    }

    private function renderProofBody(ProofPurpose $purpose, string $rawToken, string $expires): string
    {
        return match ($purpose) {
            ProofPurpose::PassengerEmailVerification => sprintf(
                "Dear Passenger,\n\nPlease verify your email address with Palestinian Airlines using this verification token:\n\n%s\n\nThis token expires at %s.\nIf you did not create an account, please disregard this email.",
                $rawToken,
                $expires
            ),
            ProofPurpose::PassengerPasswordReset => sprintf(
                "Dear Passenger,\n\nA password reset request was received for your Palestinian Airlines account.\n\nReset token: %s\n\nThis token expires at %s.\nIf you did not request this reset, please review your account security.",
                $rawToken,
                $expires
            ),
            ProofPurpose::StaffInvitation => sprintf(
                "Welcome to Palestinian Airlines.\n\nYou have been invited to register for the staff portal.\n\nInvitation token: %s\n\nThis invitation expires at %s.",
                $rawToken,
                $expires
            ),
            ProofPurpose::StaffPasswordReset => sprintf(
                "Palestinian Airlines Staff Security Notice\n\nA password reset was requested for your staff portal account.\n\nReset token: %s\n\nThis token expires at %s.\nIf you did not request this, please notify an administrator immediately.",
                $rawToken,
                $expires
            ),
        };
    }
}
