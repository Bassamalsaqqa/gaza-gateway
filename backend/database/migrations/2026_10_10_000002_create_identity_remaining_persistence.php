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
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                purpose VARCHAR(32) NOT NULL,
                security_epoch INT NULL,
                code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                pepper_version INT NOT NULL,
                state VARCHAR(32) NOT NULL,
                failed_attempts INT NOT NULL,
                dispatch_status VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                CONSTRAINT fk_booking_guest_challenges_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_guest_challenges_session FOREIGN KEY (session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_guest_challenges_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_bgc_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bgc_booking_uuid CHECK (booking_id IS NULL OR REGEXP_LIKE(booking_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bgc_session_uuid CHECK (REGEXP_LIKE(session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bgc_user_uuid CHECK (user_id IS NULL OR REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_booking_guest_challenges_state CHECK (state IN (\'issued\', \'consumed\', \'revoked\', \'expired\', \'exhausted\')),
                CONSTRAINT chk_booking_guest_challenges_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_guest_challenges_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_booking_guest_challenges_purpose CHECK (purpose IN (\'manage_booking\', \'claim_booking\')),
                CONSTRAINT chk_booking_guest_challenges_claim_user CHECK (purpose != \'claim_booking\' OR user_id IS NOT NULL),
                CONSTRAINT chk_booking_guest_challenges_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
                CONSTRAINT chk_booking_guest_challenges_dispatch_status CHECK (dispatch_status IN (\'queued\', \'accepted\', \'failed\', \'scrubbed\')),
                CONSTRAINT chk_booking_guest_challenges_epoch CHECK (booking_id IS NULL OR security_epoch >= 1),
                CONSTRAINT chk_booking_guest_challenges_real_epoch_not_null CHECK (booking_id IS NULL OR security_epoch IS NOT NULL),
                CONSTRAINT chk_booking_guest_challenges_code_digest CHECK (code_digest REGEXP \'^[0-9a-f]{64}$\'),
                CONSTRAINT chk_booking_guest_challenges_pepper_version CHECK (pepper_version >= 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 7. booking_guest_grants (Approved operation scope arrays with scope_version 1)
        DB::statement('
            CREATE TABLE booking_guest_grants (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                security_epoch INT NOT NULL,
                allowed_actions JSON NOT NULL,
                scope_version INT NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                revoked_at DATETIME(6) NULL,
                CONSTRAINT fk_booking_guest_grants_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT chk_bgg_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bgg_booking_uuid CHECK (REGEXP_LIKE(booking_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_booking_guest_grants_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_guest_grants_scope_version CHECK (scope_version = 1),
                CONSTRAINT chk_booking_guest_grants_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_guest_grants_allowed_actions CHECK (
                    JSON_TYPE(allowed_actions) = \'ARRAY\' AND
                    JSON_LENGTH(allowed_actions) > 0 AND
                    JSON_SCHEMA_VALID(\'{"type":"array","minItems":1,"items":{"type":"string","enum":["getBookingByRef","patchBookingContact","putBookingSeats","putBookingExtras","postCancelBooking","postCompleteCheckIn","postUndoCheckIn","getBoardingPasses"]}}\', allowed_actions)
                ),
                CONSTRAINT chk_booking_guest_grants_token_digest CHECK (token_digest REGEXP \'^[0-9a-f]{64}$\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 8. booking_receipt_grants (Single-purpose receipt verification grant)
        DB::statement('
            CREATE TABLE booking_receipt_grants (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                security_epoch INT NOT NULL,
                allowed_actions JSON NOT NULL,
                scope_version INT NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                revoked_at DATETIME(6) NULL,
                CONSTRAINT fk_booking_receipt_grants_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT chk_brg_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_brg_booking_uuid CHECK (REGEXP_LIKE(booking_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_booking_receipt_grants_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_receipt_grants_scope_version CHECK (scope_version = 1),
                CONSTRAINT chk_booking_receipt_grants_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_receipt_grants_allowed_actions CHECK (
                    JSON_TYPE(allowed_actions) = \'ARRAY\' AND
                    JSON_LENGTH(allowed_actions) > 0 AND
                    JSON_SCHEMA_VALID(\'{"type":"array","minItems":1,"items":{"type":"string","enum":["getBookingReceipt"]}}\', allowed_actions)
                ),
                CONSTRAINT chk_booking_receipt_grants_token_digest CHECK (token_digest REGEXP \'^[0-9a-f]{64}$\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 9. booking_claim_proofs (Bound user claim proofs with strict state & timestamp equivalence)
        DB::statement('
            CREATE TABLE booking_claim_proofs (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                security_epoch INT NOT NULL,
                purpose VARCHAR(64) NOT NULL,
                CONSTRAINT fk_booking_claim_proofs_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_claim_proofs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_booking_claim_proofs_session FOREIGN KEY (session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT chk_bcp_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bcp_booking_uuid CHECK (REGEXP_LIKE(booking_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bcp_user_uuid CHECK (REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bcp_session_uuid CHECK (REGEXP_LIKE(session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_booking_claim_proofs_state CHECK (state IN (\'issued\', \'consumed\', \'revoked\', \'expired\', \'exhausted\')),
                CONSTRAINT chk_booking_claim_proofs_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_booking_claim_proofs_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_booking_claim_proofs_purpose CHECK (purpose = \'booking_claim_proof\'),
                CONSTRAINT chk_booking_claim_proofs_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_booking_claim_proofs_token_digest CHECK (token_digest REGEXP \'^[0-9a-f]{64}$\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 10. security_dispatch_outbox (Exactly one of five proof FKs, bounded payload lifetime)
        DB::statement('
            CREATE TABLE security_dispatch_outbox (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                user_verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                user_reset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                staff_invitation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                staff_reset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                booking_challenge_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                encrypted_payload TEXT NULL,
                status VARCHAR(32) NOT NULL,
                provider_message_id TEXT NULL,
                accepted_at DATETIME(6) NULL,
                scrubbed_at DATETIME(6) NULL,
                expires_at DATETIME(6) NOT NULL,
                attempts INT NOT NULL,
                CONSTRAINT fk_security_dispatch_outbox_user_verif FOREIGN KEY (user_verification_id) REFERENCES user_email_verifications (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_user_reset FOREIGN KEY (user_reset_id) REFERENCES user_password_resets (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_staff_inv FOREIGN KEY (staff_invitation_id) REFERENCES staff_invitations (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_staff_reset FOREIGN KEY (staff_reset_id) REFERENCES staff_password_resets (id) ON DELETE RESTRICT,
                CONSTRAINT fk_security_dispatch_outbox_booking_chal FOREIGN KEY (booking_challenge_id) REFERENCES booking_guest_challenges (id) ON DELETE RESTRICT,
                CONSTRAINT chk_sdo_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_sdo_uverif_uuid CHECK (user_verification_id IS NULL OR REGEXP_LIKE(user_verification_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_sdo_ureset_uuid CHECK (user_reset_id IS NULL OR REGEXP_LIKE(user_reset_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_sdo_sinv_uuid CHECK (staff_invitation_id IS NULL OR REGEXP_LIKE(staff_invitation_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_sdo_sreset_uuid CHECK (staff_reset_id IS NULL OR REGEXP_LIKE(staff_reset_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_sdo_bchal_uuid CHECK (booking_challenge_id IS NULL OR REGEXP_LIKE(booking_challenge_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_security_dispatch_outbox_num_nonnulls CHECK (
                    ((user_verification_id IS NOT NULL) +
                     (user_reset_id IS NOT NULL) +
                     (staff_invitation_id IS NOT NULL) +
                     (staff_reset_id IS NOT NULL) +
                     (booking_challenge_id IS NOT NULL)) = 1
                ),
                CONSTRAINT chk_security_dispatch_outbox_status CHECK (status IN (\'queued\', \'accepted\', \'failed\', \'expired\', \'scrubbed\')),
                CONSTRAINT chk_security_dispatch_outbox_accepted CHECK (status != \'accepted\' OR (provider_message_id IS NOT NULL AND accepted_at IS NOT NULL)),
                CONSTRAINT chk_security_dispatch_outbox_scrubbed_payload CHECK (status NOT IN (\'scrubbed\', \'expired\') OR encrypted_payload IS NULL),
                CONSTRAINT chk_security_dispatch_outbox_attempts CHECK (attempts >= 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
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
