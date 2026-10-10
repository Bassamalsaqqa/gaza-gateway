<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Establishes profile, companion traveler, and immutable append-only audit persistence:
     * 11. passenger_profiles
     * 12. saved_travelers
     * 13. audit_events
     */
    public function up(): void
    {
        // 11. passenger_profiles (User owner PK/FK, name/contact fields, optional registration title with exact allowlist)
        DB::statement('
            CREATE TABLE passenger_profiles (
                user_id UUID PRIMARY KEY,
                title TEXT,
                first_name TEXT NOT NULL DEFAULT \'\',
                last_name TEXT NOT NULL DEFAULT \'\',
                phone TEXT NOT NULL DEFAULT \'\',
                seat_preference TEXT,
                meal_preference TEXT,
                newsletter BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT fk_passenger_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_passenger_profiles_title CHECK (title IS NULL OR title IN (\'Mr\', \'Mrs\', \'Ms\', \'Dr\')),
                CONSTRAINT chk_passenger_profiles_seat_pref CHECK (seat_preference IS NULL OR seat_preference IN (\'none\', \'window\', \'aisle\'))
            );
        ');

        // 12. saved_travelers (Companion travelers with stable opaque owner-scoped external IDs and single-name support)
        DB::statement('
            CREATE TABLE saved_travelers (
                id UUID PRIMARY KEY,
                owner_user_id UUID NOT NULL,
                external_id TEXT NOT NULL,
                first_name TEXT NOT NULL DEFAULT \'\',
                last_name TEXT NOT NULL DEFAULT \'\',
                dob DATE,
                nationality TEXT,
                encrypted_document TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT fk_saved_travelers_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT uq_saved_travelers_owner_external UNIQUE (owner_user_id, external_id),
                CONSTRAINT chk_saved_travelers_external_id CHECK (length(trim(external_id)) > 0),
                CONSTRAINT chk_saved_travelers_name CHECK (length(trim(first_name)) > 0 OR length(trim(last_name)) > 0)
            );
        ');

        // 13. audit_events (Append-only security and identity audit log with trigger-enforced immutability)
        DB::statement('
            CREATE TABLE audit_events (
                id UUID PRIMARY KEY,
                realm TEXT NOT NULL,
                action TEXT NOT NULL,
                outcome TEXT NOT NULL,
                passenger_id UUID,
                staff_id UUID,
                is_system_actor BOOLEAN NOT NULL DEFAULT FALSE,
                request_id UUID NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT,
                metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT fk_audit_events_passenger FOREIGN KEY (passenger_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_audit_events_staff FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_audit_events_realm CHECK (realm IN (\'passenger\', \'staff\', \'system\')),
                CONSTRAINT chk_audit_events_outcome CHECK (outcome IN (\'success\', \'failure\', \'denied\')),
                CONSTRAINT chk_audit_events_actor CHECK (
                    (realm = \'passenger\' AND passenger_id IS NOT NULL AND staff_id IS NULL AND is_system_actor = FALSE) OR
                    (realm = \'staff\' AND passenger_id IS NULL AND staff_id IS NOT NULL AND is_system_actor = FALSE) OR
                    (realm = \'system\' AND passenger_id IS NULL AND staff_id IS NULL AND is_system_actor = TRUE)
                ),
                CONSTRAINT chk_audit_events_action CHECK (
                    action IN (
                        \'postPassengerRegister\', \'postPassengerLogin\', \'postPassengerLogout\',
                        \'postPassengerPasswordForgot\', \'postPassengerPasswordReset\',
                        \'postPassengerEmailVerify\', \'postPassengerEmailResend\',
                        \'getPassengerProfile\', \'putPassengerProfile\',
                        \'getSavedTravelers\', \'postSavedTraveler\', \'patchSavedTraveler\', \'deleteSavedTraveler\',
                        \'getPassengerSessions\', \'deletePassengerSession\', \'putPassengerPassword\',
                        \'postCreateGuestChallenge\', \'postVerifyGuestChallenge\',
                        \'postCreateClaimChallenge\', \'postVerifyClaimChallenge\', \'postClaimBookingToAccount\',
                        \'getAccountBookingsList\', \'getBookingReceipt\',
                        \'postStaffLogin\', \'postStaffLogout\', \'postStaffPasswordForgot\', \'postStaffPasswordReset\',
                        \'putStaffPassword\', \'postStaffInvitationAccept\',
                        \'postStaffMfaSetup\', \'postStaffMfaSetupConfirm\',
                        \'postStaffMfaChallenge\', \'postStaffMfaVerify\',
                        \'postStaffMfaEnrollmentSetup\', \'postStaffMfaEnrollmentConfirm\',
                        \'postStaffMfaRecoveryCodesRegenerate\', \'postStaffStepUp\',
                        \'getStaffSessions\', \'deleteStaffSession\',
                        \'getStaffUsersDirectory\', \'postStaffUserInvite\', \'patchStaffUser\', \'deleteStaffUser\',
                        \'postStaffUserInviteReissue\', \'postStaffUserInviteRevoke\',
                        \'auth.login_denied_unknown_subject\', \'auth.rate_limit_exceeded\',
                        \'auth.session_revoked\', \'auth.session_expired\',
                        \'auth.proof_exhausted\', \'auth.proof_revoked\',
                        \'auth.security_dispatch_queued\', \'auth.security_dispatch_expired\', \'auth.security_dispatch_scrubbed\'
                    )
                ),
                CONSTRAINT chk_audit_events_target_type CHECK (
                    target_type IN (
                        \'user\', \'staff_user\', \'passenger_session\', \'staff_session\',
                        \'booking\', \'booking_challenge\', \'booking_claim_proof\',
                        \'saved_traveler\', \'security_dispatch\', \'system\'
                    )
                ),
                CONSTRAINT chk_audit_events_target_id CHECK (
                    (target_type = \'system\' AND (target_id IS NULL OR target_id = \'none\')) OR
                    (target_type != \'system\' AND (target_id IS NULL OR target_id ~* \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\'))
                ),
                CONSTRAINT chk_audit_events_metadata_object CHECK (jsonb_typeof(metadata) = \'object\'),
                CONSTRAINT chk_audit_events_metadata_no_pii CHECK (
                    NOT jsonb_exists_any(metadata, ARRAY[\'email\', \'password\', \'password_hash\', \'token\', \'token_digest\', \'code_digest\', \'digest\', \'secret\', \'otp\', \'document\', \'body\', \'url\', \'ip\'])
                ),
                CONSTRAINT chk_audit_events_metadata_keys CHECK (
                    metadata - ARRAY[\'attempt_count\', \'failed_attempts\', \'reason_code\', \'revoked\', \'consumed\', \'is_new\', \'version\', \'count\', \'status\', \'epoch\', \'success\', \'code\', \'error_code\'] = \'{}\'::jsonb
                ),
                CONSTRAINT chk_audit_events_metadata_values CHECK (
                    (NOT jsonb_exists(metadata, \'attempt_count\') OR (
                        jsonb_typeof(metadata->\'attempt_count\') = \'number\' AND
                        CASE WHEN jsonb_typeof(metadata->\'attempt_count\') = \'number\'
                             THEN (metadata->>\'attempt_count\')::numeric >= 0
                                  AND (metadata->>\'attempt_count\')::numeric = floor((metadata->>\'attempt_count\')::numeric)
                                  AND (metadata->>\'attempt_count\')::numeric <= 2147483647
                             ELSE false END
                    )) AND
                    (NOT jsonb_exists(metadata, \'failed_attempts\') OR (
                        jsonb_typeof(metadata->\'failed_attempts\') = \'number\' AND
                        CASE WHEN jsonb_typeof(metadata->\'failed_attempts\') = \'number\'
                             THEN (metadata->>\'failed_attempts\')::numeric >= 0
                                  AND (metadata->>\'failed_attempts\')::numeric = floor((metadata->>\'failed_attempts\')::numeric)
                                  AND (metadata->>\'failed_attempts\')::numeric <= 2147483647
                             ELSE false END
                    )) AND
                    (NOT jsonb_exists(metadata, \'count\') OR (
                        jsonb_typeof(metadata->\'count\') = \'number\' AND
                        CASE WHEN jsonb_typeof(metadata->\'count\') = \'number\'
                             THEN (metadata->>\'count\')::numeric >= 0
                                  AND (metadata->>\'count\')::numeric = floor((metadata->>\'count\')::numeric)
                                  AND (metadata->>\'count\')::numeric <= 2147483647
                             ELSE false END
                    )) AND
                    (NOT jsonb_exists(metadata, \'version\') OR (
                        jsonb_typeof(metadata->\'version\') = \'number\' AND
                        CASE WHEN jsonb_typeof(metadata->\'version\') = \'number\'
                             THEN (metadata->>\'version\')::numeric >= 0
                                  AND (metadata->>\'version\')::numeric = floor((metadata->>\'version\')::numeric)
                                  AND (metadata->>\'version\')::numeric <= 2147483647
                             ELSE false END
                    )) AND
                    (NOT jsonb_exists(metadata, \'epoch\') OR (
                        jsonb_typeof(metadata->\'epoch\') = \'number\' AND
                        CASE WHEN jsonb_typeof(metadata->\'epoch\') = \'number\'
                             THEN (metadata->>\'epoch\')::numeric >= 0
                                  AND (metadata->>\'epoch\')::numeric = floor((metadata->>\'epoch\')::numeric)
                                  AND (metadata->>\'epoch\')::numeric <= 2147483647
                             ELSE false END
                    )) AND
                    (NOT jsonb_exists(metadata, \'revoked\') OR jsonb_typeof(metadata->\'revoked\') = \'boolean\') AND
                    (NOT jsonb_exists(metadata, \'consumed\') OR jsonb_typeof(metadata->\'consumed\') = \'boolean\') AND
                    (NOT jsonb_exists(metadata, \'is_new\') OR jsonb_typeof(metadata->\'is_new\') = \'boolean\') AND
                    (NOT jsonb_exists(metadata, \'success\') OR jsonb_typeof(metadata->\'success\') = \'boolean\') AND
                    (NOT jsonb_exists(metadata, \'reason_code\') OR (jsonb_typeof(metadata->\'reason_code\') = \'string\' AND metadata->>\'reason_code\' IN (\'invalid_credentials\', \'account_locked\', \'session_expired\', \'session_revoked\', \'proof_exhausted\', \'proof_revoked\', \'rate_limited\', \'challenge_failed\', \'mfa_required\', \'step_up_required\', \'user_not_found\', \'token_expired\', \'unknown_subject\', \'guest_mismatch\', \'already_claimed\', \'none\'))) AND
                    (NOT jsonb_exists(metadata, \'status\') OR (jsonb_typeof(metadata->\'status\') = \'string\' AND metadata->>\'status\' IN (\'active\', \'pending\', \'revoked\', \'expired\', \'consumed\', \'exhausted\', \'verified\', \'locked\', \'success\', \'failure\', \'denied\'))) AND
                    (NOT jsonb_exists(metadata, \'error_code\') OR (jsonb_typeof(metadata->\'error_code\') = \'string\' AND metadata->>\'error_code\' IN (\'ERR_INVALID_CREDENTIALS\', \'ERR_ACCOUNT_LOCKED\', \'ERR_RATE_LIMIT\', \'ERR_SESSION_EXPIRED\', \'ERR_SESSION_REVOKED\', \'ERR_PROOF_EXHAUSTED\', \'ERR_PROOF_REVOKED\', \'ERR_CHALLENGE_FAILED\', \'ERR_MFA_REQUIRED\', \'ERR_STEP_UP_REQUIRED\', \'ERR_NOT_FOUND\', \'ERR_UNAUTHORIZED\', \'ERR_FORBIDDEN\', \'ERR_CONFLICT\', \'ERR_VALIDATION\'))) AND
                    (NOT jsonb_exists(metadata, \'code\') OR (jsonb_typeof(metadata->\'code\') = \'string\' AND metadata->>\'code\' IN (\'INVALID_CREDENTIALS\', \'ACCOUNT_LOCKED\', \'RATE_LIMITED\', \'SESSION_EXPIRED\', \'SESSION_REVOKED\', \'PROOF_EXHAUSTED\', \'PROOF_REVOKED\', \'CHALLENGE_FAILED\', \'MFA_REQUIRED\', \'STEP_UP_REQUIRED\', \'NOT_FOUND\', \'UNAUTHORIZED\', \'FORBIDDEN\', \'CONFLICT\', \'VALIDATION_ERROR\')))
                )
            );
        ');

        // Immutability triggers rejecting UPDATE and DELETE
        DB::statement('
            CREATE OR REPLACE FUNCTION trg_audit_events_immutable()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION \'audit_events is append-only: UPDATE and DELETE are prohibited\';
            END;
            $$ LANGUAGE plpgsql;
        ');

        DB::statement('
            CREATE TRIGGER trg_audit_events_prevent_mutation
            BEFORE UPDATE OR DELETE ON audit_events
            FOR EACH ROW
            EXECUTE FUNCTION trg_audit_events_immutable();
        ');

        // Immutability trigger rejecting TRUNCATE
        DB::statement('
            CREATE OR REPLACE FUNCTION trg_audit_events_prevent_truncate()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION \'audit_events is append-only: TRUNCATE is prohibited\';
            END;
            $$ LANGUAGE plpgsql;
        ');

        DB::statement('
            CREATE TRIGGER trg_audit_events_prevent_truncate
            BEFORE TRUNCATE ON audit_events
            FOR EACH STATEMENT
            EXECUTE FUNCTION trg_audit_events_prevent_truncate();
        ');
    }

    /**
     * Reverse the migrations.
     * Drops triggers, functions, and tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_audit_events_prevent_truncate ON audit_events;');
        DB::statement('DROP FUNCTION IF EXISTS trg_audit_events_prevent_truncate();');
        DB::statement('DROP TRIGGER IF EXISTS trg_audit_events_prevent_mutation ON audit_events;');
        DB::statement('DROP FUNCTION IF EXISTS trg_audit_events_immutable();');
        DB::statement('DROP TABLE IF EXISTS audit_events;');
        DB::statement('DROP TABLE IF EXISTS saved_travelers;');
        DB::statement('DROP TABLE IF EXISTS passenger_profiles;');
    }
};
