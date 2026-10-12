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
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                title VARCHAR(32) NULL,
                first_name VARCHAR(128) NOT NULL DEFAULT \'\',
                last_name VARCHAR(128) NOT NULL DEFAULT \'\',
                phone VARCHAR(64) NOT NULL DEFAULT \'\',
                seat_preference VARCHAR(32) NULL,
                meal_preference VARCHAR(64) NULL,
                newsletter BOOLEAN NOT NULL DEFAULT FALSE,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_passenger_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_passenger_profiles_title CHECK (title IS NULL OR title IN (\'Mr\', \'Mrs\', \'Ms\', \'Dr\')),
                CONSTRAINT chk_passenger_profiles_seat_pref CHECK (seat_preference IS NULL OR seat_preference IN (\'none\', \'window\', \'aisle\'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        ');

        // 12. saved_travelers (Companion travelers with stable opaque owner-scoped external IDs and single-name support)
        DB::statement('
            CREATE TABLE saved_travelers (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                external_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
                first_name VARCHAR(128) NOT NULL DEFAULT \'\',
                last_name VARCHAR(128) NOT NULL DEFAULT \'\',
                dob DATE NULL,
                nationality VARCHAR(64) NULL,
                encrypted_document TEXT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_saved_travelers_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT uq_saved_travelers_owner_external UNIQUE (owner_user_id, external_id),
                CONSTRAINT chk_saved_travelers_external_id CHECK (LENGTH(TRIM(external_id)) > 0),
                CONSTRAINT chk_saved_travelers_name CHECK (LENGTH(TRIM(first_name)) > 0 OR LENGTH(TRIM(last_name)) > 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        ');

        // 13. audit_events (Append-only security and identity audit log with trigger-enforced immutability)
        DB::statement('
            CREATE TABLE audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                realm VARCHAR(32) NOT NULL,
                action VARCHAR(64) NOT NULL,
                outcome VARCHAR(32) NOT NULL,
                passenger_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                is_system_actor BOOLEAN NOT NULL DEFAULT FALSE,
                request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                target_type VARCHAR(64) NOT NULL,
                target_id VARCHAR(64) NULL,
                metadata JSON NOT NULL,
                occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
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
                    (target_type != \'system\' AND (target_id IS NULL OR target_id REGEXP \'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$\'))
                ),
                CONSTRAINT chk_audit_events_metadata_object CHECK (JSON_TYPE(metadata) = \'OBJECT\'),
                CONSTRAINT chk_audit_events_metadata_no_pii CHECK (
                    JSON_CONTAINS_PATH(metadata, \'one\',
                        \'$.email\', \'$.password\', \'$.password_hash\', \'$.token\',
                        \'$.token_digest\', \'$.code_digest\', \'$.digest\', \'$.secret\',
                        \'$.otp\', \'$.document\', \'$.body\', \'$.url\', \'$.ip\'
                    ) = 0
                ),
                CONSTRAINT chk_audit_events_metadata_schema CHECK (
                    JSON_SCHEMA_VALID(\'{"type":"object","additionalProperties":false,"properties":{"attempt_count":{"type":"integer","minimum":0,"maximum":2147483647},"failed_attempts":{"type":"integer","minimum":0,"maximum":2147483647},"count":{"type":"integer","minimum":0,"maximum":2147483647},"version":{"type":"integer","minimum":0,"maximum":2147483647},"epoch":{"type":"integer","minimum":0,"maximum":2147483647},"revoked":{"type":"boolean"},"consumed":{"type":"boolean"},"is_new":{"type":"boolean"},"success":{"type":"boolean"},"reason_code":{"type":"string","enum":["invalid_credentials","account_locked","session_expired","session_revoked","proof_exhausted","proof_revoked","rate_limited","challenge_failed","mfa_required","step_up_required","user_not_found","token_expired","unknown_subject","guest_mismatch","already_claimed","none"]},"status":{"type":"string","enum":["active","pending","revoked","expired","consumed","exhausted","verified","locked","success","failure","denied"]},"error_code":{"type":"string","enum":["ERR_INVALID_CREDENTIALS","ERR_ACCOUNT_LOCKED","ERR_RATE_LIMIT","ERR_SESSION_EXPIRED","ERR_SESSION_REVOKED","ERR_PROOF_EXHAUSTED","ERR_PROOF_REVOKED","ERR_CHALLENGE_FAILED","ERR_MFA_REQUIRED","ERR_STEP_UP_REQUIRED","ERR_NOT_FOUND","ERR_UNAUTHORIZED","ERR_FORBIDDEN","ERR_CONFLICT","ERR_VALIDATION"]},"code":{"type":"string","enum":["INVALID_CREDENTIALS","ACCOUNT_LOCKED","RATE_LIMITED","SESSION_EXPIRED","SESSION_REVOKED","PROOF_EXHAUSTED","PROOF_REVOKED","CHALLENGE_FAILED","MFA_REQUIRED","STEP_UP_REQUIRED","NOT_FOUND","UNAUTHORIZED","FORBIDDEN","CONFLICT","VALIDATION_ERROR"]}}}\', metadata)
                )
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        ');

        // Immutability triggers rejecting UPDATE and DELETE
        DB::unprepared('
            CREATE TRIGGER trg_audit_events_prevent_update
            BEFORE UPDATE ON audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'audit_events is append-only: UPDATE is prohibited\';
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_audit_events_prevent_delete
            BEFORE DELETE ON audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'audit_events is append-only: DELETE is prohibited\';
            END;
        ');
    }

    /**
     * Reverse the migrations.
     * Drops triggers and tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_events_prevent_delete;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_events_prevent_update;');
        DB::statement('DROP TABLE IF EXISTS audit_events;');
        DB::statement('DROP TABLE IF EXISTS saved_travelers;');
        DB::statement('DROP TABLE IF EXISTS passenger_profiles;');
    }
};
