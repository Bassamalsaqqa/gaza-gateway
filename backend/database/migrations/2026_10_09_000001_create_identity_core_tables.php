<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. users
        DB::statement('
            CREATE TABLE users (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                normalized_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin AS (LOWER(email)) STORED NOT NULL,
                password_hash TEXT NOT NULL,
                status VARCHAR(32) NOT NULL,
                email_verified_at DATETIME(6) NULL,
                credential_epoch INT NOT NULL,
                created_at DATETIME(6) NOT NULL,
                updated_at DATETIME(6) NOT NULL,
                CONSTRAINT uq_users_normalized_email UNIQUE (normalized_email),
                CONSTRAINT chk_users_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_users_status CHECK (status IN (\'unverified\',\'active\',\'suspended\')),
                CONSTRAINT chk_users_credential_epoch CHECK (credential_epoch >= 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 2. staff_users (without circular FK to staff_mfa_credentials initially)
        DB::statement('
            CREATE TABLE staff_users (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                username VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL,
                normalized_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin AS (LOWER(email)) STORED NOT NULL,
                full_name_en VARCHAR(128) NOT NULL,
                full_name_ar VARCHAR(128) NOT NULL,
                password_hash TEXT NULL,
                role VARCHAR(32) NOT NULL,
                status VARCHAR(32) NOT NULL,
                email_verified_at DATETIME(6) NULL,
                credential_epoch INT NOT NULL,
                mfa_version INT NULL,
                created_at DATETIME(6) NOT NULL,
                updated_at DATETIME(6) NOT NULL,
                CONSTRAINT uq_staff_users_normalized_email UNIQUE (normalized_email),
                CONSTRAINT chk_staff_users_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_users_role CHECK (role IN (\'admin\',\'editor\',\'viewer\')),
                CONSTRAINT chk_staff_users_status CHECK (status IN (\'invited\',\'pending_enrollment\',\'active\',\'suspended\',\'deactivated\')),
                CONSTRAINT chk_staff_users_credential_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_users_active_requirements CHECK (
                    status != \'active\' OR (email_verified_at IS NOT NULL AND password_hash IS NOT NULL AND mfa_version IS NOT NULL)
                )
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 3. staff_mfa_credentials
        DB::statement('
            CREATE TABLE staff_mfa_credentials (
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                version INT NOT NULL,
                encrypted_secret TEXT NOT NULL,
                confirmed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                PRIMARY KEY (staff_id, version),
                CONSTRAINT fk_staff_mfa_credentials_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_cred_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_credentials_version CHECK (version >= 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Circular FK: staff_users -> staff_mfa_credentials
        DB::statement('
            ALTER TABLE staff_users
            ADD CONSTRAINT fk_staff_users_mfa_version
            FOREIGN KEY (id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT;
        ');

        // 4. passenger_sessions
        DB::statement('
            CREATE TABLE passenger_sessions (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                lookup_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                auth_level VARCHAR(32) NOT NULL,
                credential_epoch INT NULL,
                encrypted_payload TEXT NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                absolute_expires_at DATETIME(6) NOT NULL,
                idle_expires_at DATETIME(6) NOT NULL,
                last_seen_at DATETIME(6) NOT NULL,
                revoked_at DATETIME(6) NULL,
                CONSTRAINT fk_passenger_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_passenger_sessions_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_passenger_sessions_user_uuid CHECK (user_id IS NULL OR REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_passenger_sessions_auth_level CHECK (auth_level IN (\'anonymous\',\'full\')),
                CONSTRAINT chk_passenger_sessions_absolute_expires CHECK (absolute_expires_at > issued_at),
                CONSTRAINT chk_passenger_sessions_idle_expires CHECK (idle_expires_at <= absolute_expires_at),
                CONSTRAINT chk_passenger_sessions_auth_user CHECK (((auth_level = \'full\') AND (user_id IS NOT NULL)) OR ((auth_level != \'full\') AND (user_id IS NULL))),
                CONSTRAINT chk_passenger_sessions_epoch CHECK (auth_level != \'full\' OR credential_epoch >= 1),
                CONSTRAINT chk_passenger_sessions_full_epoch_not_null CHECK (auth_level != \'full\' OR credential_epoch IS NOT NULL)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 5. staff_sessions
        DB::statement('
            CREATE TABLE staff_sessions (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                lookup_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                auth_level VARCHAR(32) NOT NULL,
                credential_epoch INT NULL,
                encrypted_payload TEXT NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                absolute_expires_at DATETIME(6) NOT NULL,
                idle_expires_at DATETIME(6) NOT NULL,
                last_seen_at DATETIME(6) NOT NULL,
                revoked_at DATETIME(6) NULL,
                mfa_version INT NULL,
                mfa_verified_at DATETIME(6) NULL,
                CONSTRAINT fk_staff_sessions_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_sessions_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_sessions_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_sessions_staff_uuid CHECK (staff_id IS NULL OR REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_sessions_auth_level CHECK (auth_level IN (\'anonymous\',\'full\')),
                CONSTRAINT chk_staff_sessions_absolute_expires CHECK (absolute_expires_at > issued_at),
                CONSTRAINT chk_staff_sessions_idle_expires CHECK (idle_expires_at <= absolute_expires_at),
                CONSTRAINT chk_staff_sessions_auth_staff CHECK (((auth_level = \'full\') AND (staff_id IS NOT NULL)) OR ((auth_level != \'full\') AND (staff_id IS NULL))),
                CONSTRAINT chk_staff_sessions_epoch CHECK (auth_level != \'full\' OR credential_epoch >= 1),
                CONSTRAINT chk_staff_sessions_full_epoch_not_null CHECK (auth_level != \'full\' OR credential_epoch IS NOT NULL),
                CONSTRAINT chk_staff_sessions_mfa CHECK (auth_level != \'full\' OR (mfa_version IS NOT NULL AND mfa_verified_at IS NOT NULL))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 6. staff_pending_auth
        DB::statement('
            CREATE TABLE staff_pending_auth (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                bound_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                purpose VARCHAR(32) NOT NULL,
                credential_epoch INT NOT NULL,
                failed_attempts INT NOT NULL,
                encrypted_staged_secret TEXT NULL,
                CONSTRAINT fk_staff_pending_auth_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_pending_auth_bound_session FOREIGN KEY (bound_session_id) REFERENCES staff_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_pending_auth_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_pending_auth_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_pending_auth_sess_uuid CHECK (REGEXP_LIKE(bound_session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_pending_auth_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_pending_auth_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_pending_auth_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_staff_pending_auth_purpose CHECK (purpose IN (\'login_mfa\',\'enroll_mfa\')),
                CONSTRAINT chk_staff_pending_auth_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
                CONSTRAINT chk_staff_pending_auth_epoch CHECK (credential_epoch >= 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 7. user_email_verifications
        DB::statement('
            CREATE TABLE user_email_verifications (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                purpose VARCHAR(64) NOT NULL,
                credential_epoch INT NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_user_email_verifications_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_user_email_verif_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_user_email_verif_user_uuid CHECK (REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_user_email_verif_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_user_email_verif_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_user_email_verif_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_user_email_verif_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_user_email_verif_purpose CHECK (purpose = \'passenger_email_verification\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 8. user_password_resets
        DB::statement('
            CREATE TABLE user_password_resets (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                purpose VARCHAR(64) NOT NULL,
                credential_epoch INT NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_user_password_resets_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_user_password_resets_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_user_password_resets_user_uuid CHECK (REGEXP_LIKE(user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_user_password_resets_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_user_password_resets_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_user_password_resets_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_user_password_resets_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_user_password_resets_purpose CHECK (purpose = \'passenger_password_reset\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 9. staff_invitations
        DB::statement('
            CREATE TABLE staff_invitations (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                invited_by_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
                purpose VARCHAR(64) NOT NULL,
                credential_epoch INT NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_staff_invitations_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_invitations_invited_by FOREIGN KEY (invited_by_staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_invitations_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_invitations_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_invitations_inv_by_uuid CHECK (invited_by_staff_id IS NULL OR REGEXP_LIKE(invited_by_staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_invitations_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_invitations_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_invitations_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_staff_invitations_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_invitations_purpose CHECK (purpose = \'staff_invitation\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 10. staff_password_resets
        DB::statement('
            CREATE TABLE staff_password_resets (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                requested_by_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                purpose VARCHAR(64) NOT NULL,
                credential_epoch INT NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_staff_password_resets_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_password_resets_req_by FOREIGN KEY (requested_by_staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_pwd_resets_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_pwd_resets_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_pwd_resets_req_by_uuid CHECK (requested_by_staff_id IS NULL OR REGEXP_LIKE(requested_by_staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_password_resets_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_password_resets_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_password_resets_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_staff_password_resets_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_password_resets_purpose CHECK (purpose = \'staff_password_reset\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 11. staff_mfa_replacements
        DB::statement('
            CREATE TABLE staff_mfa_replacements (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                token_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                prior_version INT NOT NULL,
                candidate_version INT NOT NULL,
                step_up_at DATETIME(6) NOT NULL,
                failed_attempts INT NOT NULL,
                CONSTRAINT fk_staff_mfa_repl_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_session_id FOREIGN KEY (session_id) REFERENCES staff_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_prior_ver FOREIGN KEY (staff_id, prior_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_cand_ver FOREIGN KEY (staff_id, candidate_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_repl_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_repl_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_repl_sess_uuid CHECK (REGEXP_LIKE(session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_repl_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_mfa_repl_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_mfa_repl_consumed CHECK (((state = \'consumed\') AND (consumed_at IS NOT NULL)) OR ((state != \'consumed\') AND (consumed_at IS NULL))),
                CONSTRAINT chk_staff_mfa_repl_candidate CHECK (candidate_version > prior_version),
                CONSTRAINT chk_staff_mfa_repl_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 12. staff_mfa_counter_consumptions
        DB::statement('
            CREATE TABLE staff_mfa_counter_consumptions (
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                mfa_version INT NOT NULL,
                counter_step BIGINT NOT NULL,
                consumed_at DATETIME(6) NOT NULL,
                PRIMARY KEY (staff_id, mfa_version, counter_step),
                CONSTRAINT fk_staff_mfa_counter_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_counter_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_counter_step CHECK (counter_step >= 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 13. staff_mfa_recovery_codes
        DB::statement('
            CREATE TABLE staff_mfa_recovery_codes (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                mfa_version INT NOT NULL,
                code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                consumed_at DATETIME(6) NULL,
                revoked_at DATETIME(6) NULL,
                CONSTRAINT uq_staff_mfa_recovery_codes UNIQUE (staff_id, mfa_version, code_digest),
                CONSTRAINT fk_staff_mfa_recovery_codes_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_rc_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_mfa_rc_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 14. staff_directory_control
        DB::statement('
            CREATE TABLE staff_directory_control (
                id INT PRIMARY KEY,
                last_mutated_at DATETIME(6) NOT NULL,
                mutated_by_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                CONSTRAINT fk_staff_dir_ctrl_mutated_by FOREIGN KEY (mutated_by_staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_dir_ctrl_staff_uuid CHECK (mutated_by_staff_id IS NULL OR REGEXP_LIKE(mutated_by_staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_staff_directory_control_id CHECK (id = 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Seed ONLY staff_directory_control singleton id 1 (not a staff account)
        DB::statement('
            INSERT INTO staff_directory_control (id, last_mutated_at, mutated_by_staff_id)
            VALUES (1, UTC_TIMESTAMP(6), NULL);
        ');

        // 15. security_rate_limits
        DB::statement('
            CREATE TABLE security_rate_limits (
                realm VARCHAR(32) NOT NULL,
                operation_id VARCHAR(64) NOT NULL,
                budget_id VARCHAR(64) NOT NULL,
                key_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                window_start DATETIME(6) NOT NULL,
                window_end DATETIME(6) NOT NULL,
                count INT NOT NULL,
                PRIMARY KEY (realm, operation_id, budget_id, key_digest, window_start),
                CONSTRAINT chk_security_rate_limits_count CHECK (count >= 0),
                CONSTRAINT chk_security_rate_limits_window CHECK (window_end > window_start)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Seed transactional sentinels for bootstrap admission serialization
        DB::statement('
            INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
            VALUES
                (\'passenger\', \'sentinel\', \'admission\', \'0000000000000000000000000000000000000000000000000000000000000000\', \'1970-01-01 00:00:00.000000\', \'9999-12-31 23:59:59.000000\', 0),
                (\'staff\', \'sentinel\', \'admission\', \'0000000000000000000000000000000000000000000000000000000000000000\', \'1970-01-01 00:00:00.000000\', \'9999-12-31 23:59:59.000000\', 0);
        ');
    }

    /**
     * Reverse the migrations.
     * Removes circular constraint first, then drops tables in exact reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        // 1. Remove circular constraint on staff_users
        DB::statement('ALTER TABLE staff_users DROP FOREIGN KEY fk_staff_users_mfa_version;');

        // 2. Drop tables in explicit reverse dependency order (strictly no CASCADE)
        DB::statement('DROP TABLE IF EXISTS security_rate_limits;');
        DB::statement('DROP TABLE IF EXISTS staff_directory_control;');
        DB::statement('DROP TABLE IF EXISTS staff_mfa_recovery_codes;');
        DB::statement('DROP TABLE IF EXISTS staff_mfa_counter_consumptions;');
        DB::statement('DROP TABLE IF EXISTS staff_mfa_replacements;');
        DB::statement('DROP TABLE IF EXISTS staff_password_resets;');
        DB::statement('DROP TABLE IF EXISTS staff_invitations;');
        DB::statement('DROP TABLE IF EXISTS user_password_resets;');
        DB::statement('DROP TABLE IF EXISTS user_email_verifications;');
        DB::statement('DROP TABLE IF EXISTS staff_pending_auth;');
        DB::statement('DROP TABLE IF EXISTS staff_sessions;');
        DB::statement('DROP TABLE IF EXISTS passenger_sessions;');
        DB::statement('DROP TABLE IF EXISTS staff_mfa_credentials;');
        DB::statement('DROP TABLE IF EXISTS staff_users;');
        DB::statement('DROP TABLE IF EXISTS users;');
    }
};
