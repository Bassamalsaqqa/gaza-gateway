<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Establishes the 5 remaining identity manifest relations:
     * 6. booking_guest_challenges
     * 7. booking_guest_grants
     * 8. booking_receipt_grants
     * 9. booking_claim_proofs
     * 10. security_dispatch_outbox
     */
    public function up(): void
    {
        // 6. booking_guest_challenges (Guest decoys and real challenges with closed SQL UNKNOWN loophole)
        DB::statement('
            CREATE TABLE booking_guest_challenges (
                id UUID PRIMARY KEY,
                booking_id UUID,
                session_id UUID NOT NULL,
                user_id UUID,
                purpose TEXT NOT NULL,
                security_epoch INTEGER,
                code_digest CHAR(64) NOT NULL,
                pepper_version INTEGER NOT NULL,
                state TEXT NOT NULL,
                failed_attempts INTEGER NOT NULL,
                dispatch_status TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                CONSTRAINT fk_booking_guest_challenges_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_guest_challenges_session FOREIGN KEY (session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_guest_challenges_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_booking_guest_challenges_state CHECK (state IN (\'issued\', \'consumed\', \'revoked\', \'expired\', \'exhausted\')),
                CONSTRAINT chk_booking_guest_challenges_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_guest_challenges_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_booking_guest_challenges_purpose CHECK (purpose IN (\'manage_booking\', \'claim_booking\')),
                CONSTRAINT chk_booking_guest_challenges_claim_user CHECK (purpose != \'claim_booking\' OR user_id IS NOT NULL),
                CONSTRAINT chk_booking_guest_challenges_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
                CONSTRAINT chk_booking_guest_challenges_dispatch_status CHECK (dispatch_status IN (\'queued\', \'accepted\', \'failed\', \'scrubbed\')),
                CONSTRAINT chk_booking_guest_challenges_epoch CHECK (booking_id IS NULL OR security_epoch >= 1),
                CONSTRAINT chk_booking_guest_challenges_real_epoch_not_null CHECK (booking_id IS NULL OR security_epoch IS NOT NULL),
                CONSTRAINT chk_booking_guest_challenges_code_digest CHECK (code_digest ~ \'^[0-9a-f]{64}$\'),
                CONSTRAINT chk_booking_guest_challenges_pepper_version CHECK (pepper_version >= 1)
            );
        ');

        // 7. booking_guest_grants (Approved operation scope arrays with scope_version 1)
        DB::statement('
            CREATE TABLE booking_guest_grants (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL,
                booking_id UUID NOT NULL,
                security_epoch INTEGER NOT NULL,
                allowed_actions JSONB NOT NULL,
                scope_version INTEGER NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                CONSTRAINT uq_booking_guest_grants_token_digest UNIQUE (token_digest),
                CONSTRAINT fk_booking_guest_grants_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT chk_booking_guest_grants_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_guest_grants_scope_version CHECK (scope_version = 1),
                CONSTRAINT chk_booking_guest_grants_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_guest_grants_allowed_actions CHECK (
                    jsonb_typeof(allowed_actions) = \'array\' AND
                    jsonb_array_length(allowed_actions) > 0 AND
                    allowed_actions <@ \'["getBookingByRef","patchBookingContact","putBookingSeats","putBookingExtras","postCancelBooking","postCompleteCheckIn","postUndoCheckIn","getBoardingPasses"]\'::jsonb
                ),
                CONSTRAINT chk_booking_guest_grants_token_digest CHECK (token_digest ~ \'^[0-9a-f]{64}$\')
            );
        ');

        // 8. booking_receipt_grants (Single-purpose receipt verification grant)
        DB::statement('
            CREATE TABLE booking_receipt_grants (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL,
                booking_id UUID NOT NULL,
                security_epoch INTEGER NOT NULL,
                allowed_actions JSONB NOT NULL,
                scope_version INTEGER NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                CONSTRAINT uq_booking_receipt_grants_token_digest UNIQUE (token_digest),
                CONSTRAINT fk_booking_receipt_grants_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT chk_booking_receipt_grants_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_receipt_grants_scope_version CHECK (scope_version = 1),
                CONSTRAINT chk_booking_receipt_grants_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_receipt_grants_allowed_actions CHECK (
                    jsonb_typeof(allowed_actions) = \'array\' AND
                    jsonb_array_length(allowed_actions) > 0 AND
                    allowed_actions <@ \'["getBookingReceipt"]\'::jsonb
                ),
                CONSTRAINT chk_booking_receipt_grants_token_digest CHECK (token_digest ~ \'^[0-9a-f]{64}$\')
            );
        ');

        // 9. booking_claim_proofs (Bound user claim proofs with strict state & timestamp equivalence)
        DB::statement('
            CREATE TABLE booking_claim_proofs (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                booking_id UUID NOT NULL,
                user_id UUID NOT NULL,
                session_id UUID NOT NULL,
                security_epoch INTEGER NOT NULL,
                purpose TEXT NOT NULL,
                CONSTRAINT uq_booking_claim_proofs_token_digest UNIQUE (token_digest),
                CONSTRAINT fk_booking_claim_proofs_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_claim_proofs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_claim_proofs_session FOREIGN KEY (session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT chk_booking_claim_proofs_state CHECK (state IN (\'issued\', \'consumed\', \'revoked\', \'expired\', \'exhausted\')),
                CONSTRAINT chk_booking_claim_proofs_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_claim_proofs_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_booking_claim_proofs_purpose CHECK (purpose = \'booking_claim_proof\'),
                CONSTRAINT chk_booking_claim_proofs_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_claim_proofs_token_digest CHECK (token_digest ~ \'^[0-9a-f]{64}$\')
            );
        ');

        // 10. security_dispatch_outbox (Exactly one of five proof FKs, bounded payload lifetime)
        DB::statement('
            CREATE TABLE security_dispatch_outbox (
                id UUID PRIMARY KEY,
                user_verification_id UUID,
                user_reset_id UUID,
                staff_invitation_id UUID,
                staff_reset_id UUID,
                booking_challenge_id UUID,
                encrypted_payload TEXT,
                status TEXT NOT NULL,
                provider_message_id TEXT,
                accepted_at TIMESTAMPTZ,
                scrubbed_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ NOT NULL,
                attempts INTEGER NOT NULL,
                CONSTRAINT fk_security_dispatch_outbox_user_verif FOREIGN KEY (user_verification_id) REFERENCES user_email_verifications (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_user_reset FOREIGN KEY (user_reset_id) REFERENCES user_password_resets (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_staff_inv FOREIGN KEY (staff_invitation_id) REFERENCES staff_invitations (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_staff_reset FOREIGN KEY (staff_reset_id) REFERENCES staff_password_resets (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_booking_chal FOREIGN KEY (booking_challenge_id) REFERENCES booking_guest_challenges (id) ON DELETE RESTRICT,
                CONSTRAINT chk_security_dispatch_outbox_num_nonnulls CHECK (
                    num_nonnulls(user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id, booking_challenge_id) = 1
                ),
                CONSTRAINT chk_security_dispatch_outbox_status CHECK (status IN (\'queued\', \'accepted\', \'failed\', \'expired\', \'scrubbed\')),
                CONSTRAINT chk_security_dispatch_outbox_accepted CHECK (status != \'accepted\' OR (provider_message_id IS NOT NULL AND accepted_at IS NOT NULL)),
                CONSTRAINT chk_security_dispatch_outbox_scrubbed_payload CHECK (status NOT IN (\'scrubbed\', \'expired\') OR encrypted_payload IS NULL),
                CONSTRAINT chk_security_dispatch_outbox_attempts CHECK (attempts >= 0)
            );
        ');
    }

    /**
     * Reverse the migrations.
     * Drops tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS security_dispatch_outbox;');
        DB::statement('DROP TABLE IF EXISTS booking_claim_proofs;');
        DB::statement('DROP TABLE IF EXISTS booking_receipt_grants;');
        DB::statement('DROP TABLE IF EXISTS booking_guest_grants;');
        DB::statement('DROP TABLE IF EXISTS booking_guest_challenges;');
    }
};
