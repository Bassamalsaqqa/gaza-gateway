<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Update mvp_reservations to permit nullable owner_user_id strictly for guest reservations
        DB::statement('ALTER TABLE mvp_reservations DROP CHECK chk_mvp_res_owner;');
        DB::statement('ALTER TABLE mvp_reservations MODIFY COLUMN owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;');
        DB::statement("ALTER TABLE mvp_reservations ADD CONSTRAINT chk_mvp_res_owner CHECK (owner_user_id IS NULL OR REGEXP_LIKE(owner_user_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'));");

        // 2. Update immutability trigger with null-safe comparison <=>
        DB::statement('DROP TRIGGER IF EXISTS mvp_reservation_immutability;');
        DB::unprepared("
            CREATE TRIGGER mvp_reservation_immutability BEFORE UPDATE ON mvp_reservations
            FOR EACH ROW
            BEGIN
                IF NEW.id <> OLD.id
                    OR NEW.reference <> OLD.reference
                    OR NOT (NEW.owner_user_id <=> OLD.owner_user_id)
                    OR NEW.service_id <> OLD.service_id
                    OR NEW.ticket_snapshot <> OLD.ticket_snapshot
                    OR NEW.flight_snapshot <> OLD.flight_snapshot THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_reservations core snapshots are immutable';
                END IF;
                IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot uncancel reservation';
                END IF;
            END;
        ");

        // 3. Guest pre-booking email challenges table
        DB::statement("
            CREATE TABLE mvp_guest_email_challenges (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                email VARCHAR(254) NOT NULL CHECK (email <> ''),
                code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
                state VARCHAR(16) NOT NULL DEFAULT 'issued' CHECK (state IN ('issued', 'consumed', 'exhausted', 'expired')),
                issued_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                CONSTRAINT chk_gec_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gec_session CHECK (REGEXP_LIKE(session_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_gec_session FOREIGN KEY (session_id) REFERENCES passenger_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('CREATE INDEX mvp_gec_session_idx ON mvp_guest_email_challenges(session_id, email, state);');
        DB::statement('CREATE INDEX mvp_gec_expires_idx ON mvp_guest_email_challenges(expires_at);');

        // 4. Guest email verification grants table (session-bound)
        DB::statement("
            CREATE TABLE mvp_guest_email_grants (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                email VARCHAR(254) NOT NULL CHECK (email <> ''),
                challenge_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                verified_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                expires_at DATETIME(6) NOT NULL,
                UNIQUE (session_id, email),
                CONSTRAINT chk_geg_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_geg_session CHECK (REGEXP_LIKE(session_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_geg_challenge CHECK (REGEXP_LIKE(challenge_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_geg_session FOREIGN KEY (session_id) REFERENCES passenger_sessions(id) ON DELETE CASCADE,
                CONSTRAINT fk_geg_challenge FOREIGN KEY (challenge_id) REFERENCES mvp_guest_email_challenges(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('CREATE INDEX mvp_geg_expires_idx ON mvp_guest_email_grants(expires_at);');

        // 5. Guest reservation submissions table (session-bound idempotency)
        DB::statement("
            CREATE TABLE mvp_guest_reservation_submissions (
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                command_fingerprint VARCHAR(64) NOT NULL CHECK (CHAR_LENGTH(command_fingerprint) = 64),
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY (session_id, submission_id),
                CONSTRAINT chk_mvp_gsub_session CHECK (REGEXP_LIKE(session_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_gsub_sub CHECK (REGEXP_LIKE(submission_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_gsub_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mvp_gsub_session FOREIGN KEY (session_id) REFERENCES passenger_sessions(id) ON DELETE CASCADE,
                CONSTRAINT fk_mvp_gsub_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::unprepared("
            CREATE TRIGGER mvp_guest_submission_immutability BEFORE UPDATE ON mvp_guest_reservation_submissions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_guest_reservation_submissions rows are immutable';
            END;
        ");

        // 6. Guest access challenges table (for retrieve/manage booking by ref + email)
        DB::statement("
            CREATE TABLE mvp_guest_access_challenges (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                reference_candidate VARCHAR(16) NOT NULL,
                email_candidate VARCHAR(254) NOT NULL,
                code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
                state VARCHAR(16) NOT NULL DEFAULT 'issued' CHECK (state IN ('issued', 'consumed', 'exhausted', 'expired')),
                issued_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                expires_at DATETIME(6) NOT NULL,
                consumed_at DATETIME(6) NULL,
                CONSTRAINT chk_gac_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gac_res CHECK (reservation_id IS NULL OR REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gac_session CHECK (REGEXP_LIKE(session_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_gac_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
                CONSTRAINT fk_gac_session FOREIGN KEY (session_id) REFERENCES passenger_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('CREATE INDEX mvp_gac_session_idx ON mvp_guest_access_challenges(session_id, state);');
        DB::statement('CREATE INDEX mvp_gac_expires_idx ON mvp_guest_access_challenges(expires_at);');

        // 7. Guest access grants table (session-bound verified reservation management grant)
        DB::statement("
            CREATE TABLE mvp_guest_access_grants (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                reference VARCHAR(16) NOT NULL,
                allowed_actions JSON NOT NULL,
                issued_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                expires_at DATETIME(6) NOT NULL,
                UNIQUE (session_id, reservation_id),
                CONSTRAINT chk_gag_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gag_session CHECK (REGEXP_LIKE(session_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gag_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_gag_session FOREIGN KEY (session_id) REFERENCES passenger_sessions(id) ON DELETE CASCADE,
                CONSTRAINT fk_gag_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('CREATE INDEX mvp_gag_session_ref_idx ON mvp_guest_access_grants(session_id, reference);');
        DB::statement('CREATE INDEX mvp_gag_expires_idx ON mvp_guest_access_grants(expires_at);');

        // 8. Guest mail outbox for asynchronous SMTP cron dispatch
        DB::statement("
            CREATE TABLE mvp_guest_mail_outbox (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                challenge_type VARCHAR(32) NOT NULL CHECK (challenge_type IN ('email_verification', 'access_challenge')),
                challenge_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                recipient_email VARCHAR(254) NOT NULL CHECK (recipient_email <> ''),
                encrypted_payload MEDIUMTEXT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'accepted', 'failed', 'expired', 'uncertain', 'scrubbed', 'captured_locally')),
                attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                claim_nonce CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                claim_deadline DATETIME(6) NULL,
                next_attempt_at DATETIME(6) NULL,
                provider_message_id VARCHAR(255) NULL,
                accepted_at DATETIME(6) NULL,
                expires_at DATETIME(6) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_gmo_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gmo_challenge CHECK (REGEXP_LIKE(challenge_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gmo_claim_nonce CHECK (claim_nonce IS NULL OR REGEXP_LIKE(claim_nonce, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('CREATE INDEX mvp_gmo_status_idx ON mvp_guest_mail_outbox(status, expires_at);');
        DB::statement('CREATE INDEX mvp_gmo_claim_idx ON mvp_guest_mail_outbox(status, claim_deadline);');
        DB::statement('CREATE INDEX mvp_gmo_due_idx ON mvp_guest_mail_outbox(status, next_attempt_at, created_at);');
    }

    public function down(): void
    {
        // Safe rollback refusal: refuse if genuinely guest reservations exist
        $guestCount = DB::table('mvp_reservations')->whereNull('owner_user_id')->count();
        if ($guestCount > 0) {
            throw new \RuntimeException("Refusing to rollback guest reservations migration: {$guestCount} guest reservation(s) exist.");
        }

        DB::statement('DROP TABLE IF EXISTS mvp_guest_mail_outbox;');
        DB::statement('DROP TABLE IF EXISTS mvp_guest_access_grants;');
        DB::statement('DROP TABLE IF EXISTS mvp_guest_access_challenges;');
        DB::statement('DROP TRIGGER IF EXISTS mvp_guest_submission_immutability;');
        DB::statement('DROP TABLE IF EXISTS mvp_guest_reservation_submissions;');
        DB::statement('DROP TABLE IF EXISTS mvp_guest_email_grants;');
        DB::statement('DROP TABLE IF EXISTS mvp_guest_email_challenges;');

        // Restore original trigger
        DB::statement('DROP TRIGGER IF EXISTS mvp_reservation_immutability;');
        DB::unprepared("
            CREATE TRIGGER mvp_reservation_immutability BEFORE UPDATE ON mvp_reservations
            FOR EACH ROW
            BEGIN
                IF NEW.id <> OLD.id
                    OR NEW.reference <> OLD.reference
                    OR NEW.owner_user_id <> OLD.owner_user_id
                    OR NEW.service_id <> OLD.service_id
                    OR NEW.ticket_snapshot <> OLD.ticket_snapshot
                    OR NEW.flight_snapshot <> OLD.flight_snapshot THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_reservations core snapshots are immutable';
                END IF;
                IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot uncancel reservation';
                END IF;
            END;
        ");

        // Restore NOT NULL on owner_user_id
        DB::statement('ALTER TABLE mvp_reservations DROP CHECK chk_mvp_res_owner;');
        DB::statement('ALTER TABLE mvp_reservations DROP FOREIGN KEY fk_mvp_res_owner;');
        DB::statement('ALTER TABLE mvp_reservations MODIFY COLUMN owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;');
        DB::statement('ALTER TABLE mvp_reservations ADD CONSTRAINT fk_mvp_res_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;');
        DB::statement("ALTER TABLE mvp_reservations ADD CONSTRAINT chk_mvp_res_owner CHECK (REGEXP_LIKE(owner_user_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'));");
    }
};
