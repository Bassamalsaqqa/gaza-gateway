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
                CONSTRAINT chk_passenger_profiles_user_uuid CHECK (REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_passenger_profiles_title CHECK (title IS NULL OR title IN (\'Mr\', \'Mrs\', \'Ms\', \'Dr\')),
                CONSTRAINT chk_passenger_profiles_seat_pref CHECK (seat_preference IS NULL OR seat_preference IN (\'none\', \'window\', \'aisle\'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
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
                CONSTRAINT chk_saved_travelers_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_saved_travelers_owner_uuid CHECK (REGEXP_LIKE(owner_user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_saved_travelers_external_id CHECK (LENGTH(TRIM(external_id)) > 0),
                CONSTRAINT chk_saved_travelers_name CHECK (LENGTH(TRIM(first_name)) > 0 OR LENGTH(TRIM(last_name)) > 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
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
                CONSTRAINT chk_audit_events_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_audit_events_pass_uuid CHECK (passenger_id IS NULL OR REGEXP_LIKE(passenger_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_audit_events_staff_uuid CHECK (staff_id IS NULL OR REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_audit_events_req_uuid CHECK (REGEXP_LIKE(request_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
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
                        \'getStaffUsersDirectory\', \'postStaffUserInvite\', \'postStaffUserInviteReissue\', \'postStaffUserInviteRevoke\', \'patchStaffUser\', \'deleteStaffUser\',
                        \'postStaffMfaReset\', \'postStaffForceLogout\', \'postStaffReactivate\',
                        \'outboxDispatch\', \'outboxScrub\',
                        \'anonymousBootstrapAdmission\', \'cleanExpiredAnonymousSessions\',
                        \'cleanExpiredChallengesAndGrants\', \'cleanStaleRateLimits\'
                    )
                ),
                CONSTRAINT chk_audit_events_metadata CHECK (JSON_TYPE(metadata) = \'OBJECT\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Immutability triggers on audit_events: reject UPDATE and DELETE
        DB::unprepared('
            CREATE TRIGGER trg_audit_events_reject_update
            BEFORE UPDATE ON audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'audit_events table is strictly append-only: updates prohibited\';
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_audit_events_reject_delete
            BEFORE DELETE ON audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'audit_events table is strictly append-only: deletes prohibited\';
            END;
        ');
    }

    /**
     * Reverse the migrations.
     * Drops triggers and tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_events_reject_delete;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_events_reject_update;');
        DB::statement('DROP TABLE IF EXISTS audit_events;');
        DB::statement('DROP TABLE IF EXISTS saved_travelers;');
        DB::statement('DROP TABLE IF EXISTS passenger_profiles;');
    }
};
