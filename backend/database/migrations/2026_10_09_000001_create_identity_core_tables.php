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
                id UUID PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                email_verified_at TIMESTAMPTZ,
                credential_epoch INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT chk_users_status CHECK (status IN (\'unverified\',\'active\',\'suspended\')),
                CONSTRAINT chk_users_credential_epoch CHECK (credential_epoch >= 1)
            );
        ');
        DB::statement('CREATE UNIQUE INDEX users_lower_email_idx ON users (lower(email));');

        // 2. staff_users (without circular FK to staff_mfa_credentials initially)
        DB::statement('
            CREATE TABLE staff_users (
                id UUID PRIMARY KEY,
                username VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL,
                full_name_en VARCHAR(128) NOT NULL,
                full_name_ar VARCHAR(128) NOT NULL,
                password_hash TEXT,
                role TEXT NOT NULL,
                status TEXT NOT NULL,
                email_verified_at TIMESTAMPTZ,
                credential_epoch INTEGER NOT NULL,
                mfa_version INTEGER,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT chk_staff_users_role CHECK (role IN (\'admin\',\'editor\',\'viewer\')),
                CONSTRAINT chk_staff_users_status CHECK (status IN (\'invited\',\'pending_enrollment\',\'active\',\'suspended\',\'deactivated\')),
                CONSTRAINT chk_staff_users_credential_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_users_active_requirements CHECK (
                    status != \'active\' OR (email_verified_at IS NOT NULL AND password_hash IS NOT NULL AND mfa_version IS NOT NULL)
                )
            );
        ');
        DB::statement('CREATE UNIQUE INDEX staff_users_lower_email_idx ON staff_users (lower(email));');

        // 3. staff_mfa_credentials
        DB::statement('
            CREATE TABLE staff_mfa_credentials (
                staff_id UUID NOT NULL,
                version INTEGER NOT NULL,
                encrypted_secret TEXT NOT NULL,
                confirmed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                PRIMARY KEY (staff_id, version),
                CONSTRAINT fk_staff_mfa_credentials_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_credentials_version CHECK (version >= 1)
            );
        ');

        // Circular FK: staff_users -> staff_mfa_credentials
        DB::statement('
            ALTER TABLE staff_users
            ADD CONSTRAINT fk_staff_users_mfa_version
            FOREIGN KEY (id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT;
        ');

        // 4. passenger_sessions
        // Note: PostgreSQL CHECK permits UNKNOWN (e.g. NULL >= 1 yields UNKNOWN, not FALSE).
        // To strictly guarantee that full sessions require a non-null credential_epoch, an explicit
        // non-contradictory NOT NULL check is added alongside the accepted manifest check.
        DB::statement('
            CREATE TABLE passenger_sessions (
                id UUID PRIMARY KEY,
                lookup_digest CHAR(64) NOT NULL UNIQUE,
                user_id UUID,
                auth_level TEXT NOT NULL,
                credential_epoch INTEGER,
                encrypted_payload TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                absolute_expires_at TIMESTAMPTZ NOT NULL,
                idle_expires_at TIMESTAMPTZ NOT NULL,
                last_seen_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                CONSTRAINT fk_passenger_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_passenger_sessions_auth_level CHECK (auth_level IN (\'anonymous\',\'full\')),
                CONSTRAINT chk_passenger_sessions_absolute_expires CHECK (absolute_expires_at > issued_at),
                CONSTRAINT chk_passenger_sessions_idle_expires CHECK (idle_expires_at <= absolute_expires_at),
                CONSTRAINT chk_passenger_sessions_auth_user CHECK ((auth_level = \'full\') = (user_id IS NOT NULL)),
                CONSTRAINT chk_passenger_sessions_epoch CHECK (auth_level != \'full\' OR credential_epoch >= 1),
                CONSTRAINT chk_passenger_sessions_full_epoch_not_null CHECK (auth_level != \'full\' OR credential_epoch IS NOT NULL)
            );
        ');

        // 5. staff_sessions
        // Note: Similarly, full staff sessions require credential_epoch IS NOT NULL alongside the manifest check.
        DB::statement('
            CREATE TABLE staff_sessions (
                id UUID PRIMARY KEY,
                lookup_digest CHAR(64) NOT NULL UNIQUE,
                staff_id UUID,
                auth_level TEXT NOT NULL,
                credential_epoch INTEGER,
                encrypted_payload TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                absolute_expires_at TIMESTAMPTZ NOT NULL,
                idle_expires_at TIMESTAMPTZ NOT NULL,
                last_seen_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                mfa_version INTEGER,
                mfa_verified_at TIMESTAMPTZ,
                CONSTRAINT fk_staff_sessions_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_sessions_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_sessions_auth_level CHECK (auth_level IN (\'anonymous\',\'full\')),
                CONSTRAINT chk_staff_sessions_absolute_expires CHECK (absolute_expires_at > issued_at),
                CONSTRAINT chk_staff_sessions_idle_expires CHECK (idle_expires_at <= absolute_expires_at),
                CONSTRAINT chk_staff_sessions_auth_staff CHECK ((auth_level = \'full\') = (staff_id IS NOT NULL)),
                CONSTRAINT chk_staff_sessions_epoch CHECK (auth_level != \'full\' OR credential_epoch >= 1),
                CONSTRAINT chk_staff_sessions_full_epoch_not_null CHECK (auth_level != \'full\' OR credential_epoch IS NOT NULL),
                CONSTRAINT chk_staff_sessions_mfa CHECK (auth_level != \'full\' OR (mfa_version IS NOT NULL AND mfa_verified_at IS NOT NULL))
            );
        ');

        // 6. staff_pending_auth
        DB::statement('
            CREATE TABLE staff_pending_auth (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                staff_id UUID NOT NULL,
                bound_session_id UUID NOT NULL,
                purpose TEXT NOT NULL,
                credential_epoch INTEGER NOT NULL,
                failed_attempts INTEGER NOT NULL,
                encrypted_staged_secret TEXT,
                CONSTRAINT fk_staff_pending_auth_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_pending_auth_bound_session FOREIGN KEY (bound_session_id) REFERENCES staff_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_pending_auth_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_pending_auth_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_pending_auth_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_staff_pending_auth_purpose CHECK (purpose IN (\'login_mfa\',\'enroll_mfa\')),
                CONSTRAINT chk_staff_pending_auth_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
                CONSTRAINT chk_staff_pending_auth_epoch CHECK (credential_epoch >= 1)
            );
        ');

        // 7. user_email_verifications
        DB::statement('
            CREATE TABLE user_email_verifications (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                user_id UUID NOT NULL,
                purpose TEXT NOT NULL,
                credential_epoch INTEGER NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_user_email_verifications_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_user_email_verif_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_user_email_verif_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_user_email_verif_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_user_email_verif_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_user_email_verif_purpose CHECK (purpose = \'passenger_email_verification\')
            );
        ');

        // 8. user_password_resets
        DB::statement('
            CREATE TABLE user_password_resets (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                user_id UUID NOT NULL,
                purpose TEXT NOT NULL,
                credential_epoch INTEGER NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_user_password_resets_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_user_password_resets_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_user_password_resets_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_user_password_resets_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_user_password_resets_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_user_password_resets_purpose CHECK (purpose = \'passenger_password_reset\')
            );
        ');

        // 9. staff_invitations
        DB::statement('
            CREATE TABLE staff_invitations (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                staff_id UUID NOT NULL,
                purpose TEXT NOT NULL,
                credential_epoch INTEGER NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_staff_invitations_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_invitations_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_invitations_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_invitations_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_staff_invitations_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_invitations_purpose CHECK (purpose = \'staff_invitation\')
            );
        ');

        // 10. staff_password_resets
        DB::statement('
            CREATE TABLE staff_password_resets (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                staff_id UUID NOT NULL,
                purpose TEXT NOT NULL,
                credential_epoch INTEGER NOT NULL,
                email_snapshot VARCHAR(255) NOT NULL,
                CONSTRAINT fk_staff_password_resets_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_password_resets_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_password_resets_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_password_resets_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_staff_password_resets_epoch CHECK (credential_epoch >= 1),
                CONSTRAINT chk_staff_password_resets_purpose CHECK (purpose = \'staff_password_reset\')
            );
        ');

        // 11. staff_mfa_replacements
        DB::statement('
            CREATE TABLE staff_mfa_replacements (
                id UUID PRIMARY KEY,
                token_digest CHAR(64) NOT NULL UNIQUE,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                staff_id UUID NOT NULL,
                session_id UUID NOT NULL,
                prior_version INTEGER NOT NULL,
                candidate_version INTEGER NOT NULL,
                step_up_at TIMESTAMPTZ NOT NULL,
                failed_attempts INTEGER NOT NULL,
                CONSTRAINT fk_staff_mfa_repl_staff_id FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_session_id FOREIGN KEY (session_id) REFERENCES staff_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_prior_ver FOREIGN KEY (staff_id, prior_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT fk_staff_mfa_repl_cand_ver FOREIGN KEY (staff_id, candidate_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_repl_state CHECK (state IN (\'issued\',\'consumed\',\'revoked\',\'expired\',\'exhausted\')),
                CONSTRAINT chk_staff_mfa_repl_expires CHECK (expires_at > issued_at),
                CONSTRAINT chk_staff_mfa_repl_consumed CHECK ((state = \'consumed\') = (consumed_at IS NOT NULL)),
                CONSTRAINT chk_staff_mfa_repl_candidate CHECK (candidate_version > prior_version),
                CONSTRAINT chk_staff_mfa_repl_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5)
            );
        ');

        // 12. staff_mfa_counter_consumptions
        DB::statement('
            CREATE TABLE staff_mfa_counter_consumptions (
                staff_id UUID NOT NULL,
                mfa_version INTEGER NOT NULL,
                counter_step BIGINT NOT NULL,
                consumed_at TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (staff_id, mfa_version, counter_step),
                CONSTRAINT fk_staff_mfa_counter_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_mfa_counter_step CHECK (counter_step >= 0)
            );
        ');

        // 13. staff_mfa_recovery_codes
        DB::statement('
            CREATE TABLE staff_mfa_recovery_codes (
                id UUID PRIMARY KEY,
                staff_id UUID NOT NULL,
                mfa_version INTEGER NOT NULL,
                code_digest CHAR(64) NOT NULL,
                consumed_at TIMESTAMPTZ,
                revoked_at TIMESTAMPTZ,
                CONSTRAINT uq_staff_mfa_recovery_codes UNIQUE (staff_id, mfa_version, code_digest),
                CONSTRAINT fk_staff_mfa_recovery_codes_mfa FOREIGN KEY (staff_id, mfa_version) REFERENCES staff_mfa_credentials (staff_id, version) ON DELETE RESTRICT
            );
        ');

        // 14. staff_directory_control
        DB::statement('
            CREATE TABLE staff_directory_control (
                id INTEGER PRIMARY KEY,
                last_mutated_at TIMESTAMPTZ NOT NULL,
                mutated_by_staff_id UUID,
                CONSTRAINT fk_staff_dir_ctrl_mutated_by FOREIGN KEY (mutated_by_staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT chk_staff_directory_control_id CHECK (id = 1)
            );
        ');

        // Seed ONLY staff_directory_control singleton id 1 (not a staff account)
        DB::statement('
            INSERT INTO staff_directory_control (id, last_mutated_at, mutated_by_staff_id)
            VALUES (1, NOW(), NULL);
        ');

        // 15. security_rate_limits
        DB::statement('
            CREATE TABLE security_rate_limits (
                realm TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                budget_id TEXT NOT NULL,
                key_digest CHAR(64) NOT NULL,
                window_start TIMESTAMPTZ NOT NULL,
                window_end TIMESTAMPTZ NOT NULL,
                count INTEGER NOT NULL,
                PRIMARY KEY (realm, operation_id, budget_id, key_digest, window_start),
                CONSTRAINT chk_security_rate_limits_count CHECK (count >= 0),
                CONSTRAINT chk_security_rate_limits_window CHECK (window_end > window_start)
            );
        ');
    }

    /**
     * Reverse the migrations.
     * Removes circular constraint first, then drops tables in exact reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        // 1. Remove circular constraint on staff_users
        DB::statement('ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS fk_staff_users_mfa_version;');

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
