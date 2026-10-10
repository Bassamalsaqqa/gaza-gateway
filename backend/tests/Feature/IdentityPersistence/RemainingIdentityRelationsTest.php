<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;
use Tests\TestCase;

class RemainingIdentityRelationsTest extends TestCase
{
    public function test_booking_guest_challenges_closing_sql_unknown_loophole(): void
    {
        $session = PersistenceTestFactory::createPassengerSession();
        $booking = PersistenceTestFactory::createBooking();

        // 1. Decoy challenge with booking_id NULL and security_epoch NULL succeeds
        $decoyId = (string) Str::uuid();
        DB::statement('
            INSERT INTO booking_guest_challenges (
                id, booking_id, session_id, user_id, purpose, security_epoch,
                code_digest, pepper_version, state, failed_attempts, dispatch_status,
                issued_at, expires_at, consumed_at, revoked_at
            )
            VALUES (?, NULL, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ', [
            $decoyId,
            $session,
            'manage_booking',
            hash('sha256', 'decoy_code'),
            1,
            'issued',
            0,
            'queued',
            now()->toIso8601String(),
            now()->addMinutes(15)->toIso8601String(),
        ]);
        $this->assertDatabaseHas('booking_guest_challenges', ['id' => $decoyId]);

        // 2. Real challenge with booking_id NOT NULL but security_epoch NULL must fail (closed SQL UNKNOWN loophole)
        try {
            DB::statement('
                INSERT INTO booking_guest_challenges (
                    id, booking_id, session_id, user_id, purpose, security_epoch,
                    code_digest, pepper_version, state, failed_attempts, dispatch_status,
                    issued_at, expires_at, consumed_at, revoked_at
                )
                VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            ', [
                (string) Str::uuid(),
                $booking,
                $session,
                'manage_booking',
                hash('sha256', 'real_code'),
                1,
                'issued',
                0,
                'queued',
                now()->toIso8601String(),
                now()->addMinutes(15)->toIso8601String(),
            ]);
            $this->fail('Expected real challenge with null security_epoch to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_guest_challenges_real_epoch_not_null', $e->getMessage());
        }

        // 3. Purpose claim_booking requires user_id
        try {
            DB::statement('
                INSERT INTO booking_guest_challenges (
                    id, booking_id, session_id, user_id, purpose, security_epoch,
                    code_digest, pepper_version, state, failed_attempts, dispatch_status,
                    issued_at, expires_at, consumed_at, revoked_at
                )
                VALUES (?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            ', [
                (string) Str::uuid(),
                $booking,
                $session,
                'claim_booking',
                hash('sha256', 'claim_code'),
                1,
                'issued',
                0,
                'queued',
                now()->toIso8601String(),
                now()->addMinutes(15)->toIso8601String(),
            ]);
            $this->fail('Expected claim_booking without user_id to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_guest_challenges_claim_user', $e->getMessage());
        }

        // 4. Failed attempts > 5 rejected
        try {
            DB::statement('
                INSERT INTO booking_guest_challenges (
                    id, booking_id, session_id, user_id, purpose, security_epoch,
                    code_digest, pepper_version, state, failed_attempts, dispatch_status,
                    issued_at, expires_at, consumed_at, revoked_at
                )
                VALUES (?, ?, ?, NULL, ?, 1, ?, ?, ?, 6, ?, ?, ?, NULL, NULL)
            ', [
                (string) Str::uuid(),
                $booking,
                $session,
                'manage_booking',
                hash('sha256', 'code'),
                1,
                'issued',
                'queued',
                now()->toIso8601String(),
                now()->addMinutes(15)->toIso8601String(),
            ]);
            $this->fail('Expected failed_attempts 6 to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_guest_challenges_failed_attempts', $e->getMessage());
        }
    }

    public function test_booking_guest_grants_scope_version_and_action_allowlist(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $digest = hash('sha256', Str::random(32));

        // Valid grant succeeds
        $grantId = (string) Str::uuid();
        DB::statement('
            INSERT INTO booking_guest_grants (
                id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                issued_at, expires_at, revoked_at
            )
            VALUES (?, ?, ?, 1, ?::jsonb, 1, ?, ?, NULL)
        ', [
            $grantId,
            $digest,
            $booking,
            json_encode(['getBookingByRef', 'patchBookingContact']),
            now()->toIso8601String(),
            now()->addHours(2)->toIso8601String(),
        ]);
        $this->assertDatabaseHas('booking_guest_grants', ['id' => $grantId]);

        // Duplicate token_digest rejected
        try {
            DB::statement('
                INSERT INTO booking_guest_grants (
                    id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                    issued_at, expires_at, revoked_at
                )
                VALUES (?, ?, ?, 1, ?::jsonb, 1, ?, ?, NULL)
            ', [
                (string) Str::uuid(),
                $digest,
                $booking,
                json_encode(['getBookingByRef']),
                now()->toIso8601String(),
                now()->addHours(2)->toIso8601String(),
            ]);
            $this->fail('Expected duplicate token_digest to be rejected');
        } catch (QueryException $e) {
            $this->assertTrue(
                str_contains($e->getMessage(), 'booking_guest_grants_token_digest_key') ||
                str_contains($e->getMessage(), 'duplicate key value')
            );
        }

        // Scope version != 1 rejected
        try {
            DB::statement('
                INSERT INTO booking_guest_grants (
                    id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                    issued_at, expires_at, revoked_at
                )
                VALUES (?, ?, ?, 1, ?::jsonb, 2, ?, ?, NULL)
            ', [
                (string) Str::uuid(),
                hash('sha256', Str::random(32)),
                $booking,
                json_encode(['getBookingByRef']),
                now()->toIso8601String(),
                now()->addHours(2)->toIso8601String(),
            ]);
            $this->fail('Expected scope_version 2 to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_guest_grants_scope_version', $e->getMessage());
        }

        // Unapproved action rejected
        try {
            DB::statement('
                INSERT INTO booking_guest_grants (
                    id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                    issued_at, expires_at, revoked_at
                )
                VALUES (?, ?, ?, 1, ?::jsonb, 1, ?, ?, NULL)
            ', [
                (string) Str::uuid(),
                hash('sha256', Str::random(32)),
                $booking,
                json_encode(['unauthorizedAdminAction']),
                now()->toIso8601String(),
                now()->addHours(2)->toIso8601String(),
            ]);
            $this->fail('Expected unapproved action to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_guest_grants_allowed_actions', $e->getMessage());
        }
    }

    public function test_booking_receipt_grants_exact_get_booking_receipt_action(): void
    {
        $booking = PersistenceTestFactory::createBooking();

        // Valid receipt grant succeeds
        $receiptGrantId = (string) Str::uuid();
        DB::statement('
            INSERT INTO booking_receipt_grants (
                id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                issued_at, expires_at, revoked_at
            )
            VALUES (?, ?, ?, 1, ?::jsonb, 1, ?, ?, NULL)
        ', [
            $receiptGrantId,
            hash('sha256', Str::random(32)),
            $booking,
            json_encode(['getBookingReceipt']),
            now()->toIso8601String(),
            now()->addHours(48)->toIso8601String(),
        ]);
        $this->assertDatabaseHas('booking_receipt_grants', ['id' => $receiptGrantId]);

        // Action other than getBookingReceipt rejected
        try {
            DB::statement('
                INSERT INTO booking_receipt_grants (
                    id, token_digest, booking_id, security_epoch, allowed_actions, scope_version,
                    issued_at, expires_at, revoked_at
                )
                VALUES (?, ?, ?, 1, ?::jsonb, 1, ?, ?, NULL)
            ', [
                (string) Str::uuid(),
                hash('sha256', Str::random(32)),
                $booking,
                json_encode(['getBookingByRef']),
                now()->toIso8601String(),
                now()->addHours(48)->toIso8601String(),
            ]);
            $this->fail('Expected action other than getBookingReceipt to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_receipt_grants_allowed_actions', $e->getMessage());
        }
    }

    public function test_booking_claim_proofs_state_equivalence_and_epoch(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $user = PersistenceTestFactory::createUser();
        $session = PersistenceTestFactory::createPassengerSession(['user_id' => $user, 'auth_level' => 'full', 'credential_epoch' => 1]);

        // Consumed state with consumed_at NULL rejected
        try {
            DB::statement('
                INSERT INTO booking_claim_proofs (
                    id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
                    booking_id, user_id, session_id, security_epoch, purpose
                )
                VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
            ', [
                (string) Str::uuid(),
                hash('sha256', Str::random(32)),
                'consumed',
                now()->toIso8601String(),
                now()->addMinutes(15)->toIso8601String(),
                $booking,
                $user,
                $session,
                1,
                'booking_claim_proof',
            ]);
            $this->fail('Expected consumed state with NULL consumed_at to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_claim_proofs_consumed', $e->getMessage());
        }
    }

    public function test_security_dispatch_outbox_num_nonnulls_and_acceptance_guards(): void
    {
        $userVerifId = PersistenceTestFactory::createUserEmailVerification();
        $bookingChalId = PersistenceTestFactory::createBookingGuestChallenge();

        // 1. Zero proof FKs rejected by num_nonnulls = 1
        try {
            DB::statement('
                INSERT INTO security_dispatch_outbox (
                    id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                    booking_challenge_id, encrypted_payload, status, provider_message_id,
                    accepted_at, scrubbed_at, expires_at, attempts
                )
                VALUES (?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, 0)
            ', [
                (string) Str::uuid(),
                'ciphertext_payload',
                'queued',
                now()->addMinutes(10)->toIso8601String(),
            ]);
            $this->fail('Expected zero proof FKs to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_dispatch_outbox_num_nonnulls', $e->getMessage());
        }

        // 2. Two proof FKs rejected by num_nonnulls = 1
        try {
            DB::statement('
                INSERT INTO security_dispatch_outbox (
                    id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                    booking_challenge_id, encrypted_payload, status, provider_message_id,
                    accepted_at, scrubbed_at, expires_at, attempts
                )
                VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, ?, 0)
            ', [
                (string) Str::uuid(),
                $userVerifId,
                $bookingChalId,
                'ciphertext_payload',
                'queued',
                now()->addMinutes(10)->toIso8601String(),
            ]);
            $this->fail('Expected two proof FKs to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_dispatch_outbox_num_nonnulls', $e->getMessage());
        }

        // 3. Exactly one proof FK succeeds
        $outboxId = (string) Str::uuid();
        DB::statement('
            INSERT INTO security_dispatch_outbox (
                id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                booking_challenge_id, encrypted_payload, status, provider_message_id,
                accepted_at, scrubbed_at, expires_at, attempts
            )
            VALUES (?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, ?, 0)
        ', [
            $outboxId,
            $bookingChalId,
            'ciphertext_payload',
            'queued',
            now()->addMinutes(10)->toIso8601String(),
        ]);
        $this->assertDatabaseHas('security_dispatch_outbox', ['id' => $outboxId]);

        // 4. Status = accepted requires provider_message_id and accepted_at
        try {
            DB::statement('
                INSERT INTO security_dispatch_outbox (
                    id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                    booking_challenge_id, encrypted_payload, status, provider_message_id,
                    accepted_at, scrubbed_at, expires_at, attempts
                )
                VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, 0)
            ', [
                (string) Str::uuid(),
                $userVerifId,
                'ciphertext_payload',
                'accepted', // accepted without provider metadata!
                now()->addMinutes(10)->toIso8601String(),
            ]);
            $this->fail('Expected accepted status without provider metadata to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_dispatch_outbox_accepted', $e->getMessage());
        }

        // 5. Status = scrubbed requires encrypted_payload to be NULL
        try {
            DB::statement('
                INSERT INTO security_dispatch_outbox (
                    id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                    booking_challenge_id, encrypted_payload, status, provider_message_id,
                    accepted_at, scrubbed_at, expires_at, attempts
                )
                VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, ?, ?, 0)
            ', [
                (string) Str::uuid(),
                $userVerifId,
                'retained_ciphertext_violation',
                'scrubbed',
                now()->toIso8601String(),
                now()->addMinutes(10)->toIso8601String(),
            ]);
            $this->fail('Expected scrubbed status with ciphertext payload to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_security_dispatch_outbox_scrubbed_payload', $e->getMessage());
        }
    }
}
