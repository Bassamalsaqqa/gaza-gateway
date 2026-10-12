<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE mvp_services (
                id VARCHAR(160) PRIMARY KEY CHECK (id <> '' AND id = TRIM(id)),
                schedule_id VARCHAR(160) NOT NULL,
                service_date DATE NOT NULL,
                flight_number VARCHAR(32) NOT NULL CHECK (flight_number <> ''),
                direction VARCHAR(16) NOT NULL CHECK (direction IN ('out', 'in')),
                origin_code VARCHAR(3) NOT NULL CHECK (REGEXP_LIKE(origin_code, '^[A-Z]{3}$', 'c')),
                destination_code VARCHAR(3) NOT NULL CHECK (REGEXP_LIKE(destination_code, '^[A-Z]{3}$', 'c')),
                depart_time VARCHAR(5) NOT NULL CHECK (REGEXP_LIKE(depart_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')),
                arrive_time VARCHAR(5) NOT NULL CHECK (REGEXP_LIKE(arrive_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')),
                duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
                aircraft_id VARCHAR(64) NOT NULL,
                aircraft_snapshot JSON NOT NULL,
                layout_snapshot JSON NOT NULL,
                reference_revisions JSON NOT NULL,
                classification VARCHAR(32) NOT NULL DEFAULT 'commemorative' CHECK (classification = 'commemorative'),
                price_minor INT NOT NULL DEFAULT 0 CHECK (price_minor = 0),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_mvp_services_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE RESTRICT,
                CONSTRAINT fk_mvp_services_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER mvp_service_immutability BEFORE UPDATE ON mvp_services
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_services immutable snapshot';
            END;
        ");

        DB::statement("
            CREATE TABLE mvp_reservations (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                reference VARCHAR(16) NOT NULL UNIQUE CHECK (REGEXP_LIKE(reference, '^[A-Z0-9_-]{6,16}$', 'c')),
                owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                service_id VARCHAR(160) NOT NULL,
                status VARCHAR(16) NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
                contact_email VARCHAR(254) NOT NULL CHECK (contact_email <> ''),
                contact_phone VARCHAR(32) NOT NULL,
                passenger_count INT NOT NULL CHECK (passenger_count BETWEEN 1 AND 9),
                flight_snapshot JSON NOT NULL,
                ticket_snapshot JSON NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                cancelled_at DATETIME(6) NULL,
                UNIQUE (id, service_id),
                CONSTRAINT chk_mvp_res_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_res_owner CHECK (REGEXP_LIKE(owner_user_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_res_cancelled CHECK ((status = 'cancelled' AND cancelled_at IS NOT NULL) OR (status <> 'cancelled' AND cancelled_at IS NULL)),
                CONSTRAINT fk_mvp_res_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_mvp_res_service FOREIGN KEY (service_id) REFERENCES mvp_services(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX mvp_reservations_owner_idx ON mvp_reservations(owner_user_id, created_at DESC);');
        DB::statement('CREATE INDEX mvp_reservations_service_idx ON mvp_reservations(service_id);');

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

        DB::statement("
            CREATE TABLE mvp_reservation_submissions (
                owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                command_fingerprint VARCHAR(64) NOT NULL CHECK (CHAR_LENGTH(command_fingerprint) = 64),
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY (owner_user_id, submission_id),
                CONSTRAINT chk_mvp_sub_owner CHECK (REGEXP_LIKE(owner_user_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_sub_sub CHECK (REGEXP_LIKE(submission_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_sub_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mvp_sub_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_mvp_sub_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER mvp_submission_immutability BEFORE UPDATE ON mvp_reservation_submissions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_reservation_submissions rows are immutable';
            END;
        ");

        DB::statement("
            CREATE TABLE mvp_reservation_passengers (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                passenger_client_id VARCHAR(64) NOT NULL CHECK (passenger_client_id <> ''),
                type VARCHAR(16) NOT NULL CHECK (type IN ('adult', 'child')),
                first_name VARCHAR(120) NOT NULL,
                last_name VARCHAR(120) NOT NULL,
                dob DATE NOT NULL,
                nationality VARCHAR(120) NOT NULL CHECK (nationality <> ''),
                document VARCHAR(120) NOT NULL CHECK (document <> ''),
                seat_code VARCHAR(8) NOT NULL CHECK (REGEXP_LIKE(seat_code, '^(?:[1-9]|[1-5][0-9]|60)[A-Z]$', 'c')),
                meal_id VARCHAR(64) NULL,
                meal_snapshot JSON NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                UNIQUE (id, reservation_id, seat_code),
                UNIQUE (reservation_id, passenger_client_id),
                UNIQUE (reservation_id, seat_code),
                CONSTRAINT chk_mvp_pass_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_pass_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_passenger_name CHECK (first_name <> '' OR last_name <> ''),
                CONSTRAINT fk_mvp_pass_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
                CONSTRAINT fk_mvp_pass_meal FOREIGN KEY (meal_id) REFERENCES meal_options(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER mvp_passenger_immutability BEFORE UPDATE ON mvp_reservation_passengers
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mvp_reservation_passengers rows are immutable';
            END;
        ");

        DB::statement("
            CREATE TABLE mvp_reservation_seat_claims (
                service_id VARCHAR(160) NOT NULL,
                seat_code VARCHAR(8) NOT NULL CHECK (REGEXP_LIKE(seat_code, '^(?:[1-9]|[1-5][0-9]|60)[A-Z]$', 'c')),
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                passenger_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                claimed_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY (service_id, seat_code),
                UNIQUE (passenger_id),
                CONSTRAINT chk_mvp_claim_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_claim_pass CHECK (REGEXP_LIKE(passenger_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_claim_res_service FOREIGN KEY (reservation_id, service_id) REFERENCES mvp_reservations(id, service_id) ON DELETE RESTRICT,
                CONSTRAINT fk_claim_pass_res_seat FOREIGN KEY (passenger_id, reservation_id, seat_code) REFERENCES mvp_reservation_passengers(id, reservation_id, seat_code) ON DELETE RESTRICT,
                CONSTRAINT fk_claim_service FOREIGN KEY (service_id) REFERENCES mvp_services(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_reservation_seat_claim_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                service_id VARCHAR(160) NOT NULL,
                seat_code VARCHAR(8) NOT NULL,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                passenger_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(16) NOT NULL CHECK (action IN ('claimed', 'released')),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_mvp_hist_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_hist_pass CHECK (REGEXP_LIKE(passenger_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_claim_hist_service FOREIGN KEY (service_id) REFERENCES mvp_services(id) ON DELETE RESTRICT,
                CONSTRAINT fk_claim_hist_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_reservation_mail_intents (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                recipient_email VARCHAR(254) NOT NULL CHECK (recipient_email <> ''),
                status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
                payload JSON NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_mvp_intent_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_intent_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mvp_intent_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_reservation_audits (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('passenger', 'staff', 'system')),
                actor_id VARCHAR(64) NOT NULL,
                action VARCHAR(32) NOT NULL CHECK (action IN ('created', 'cancelled')),
                details JSON NOT NULL DEFAULT (JSON_OBJECT()),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_mvp_audit_res CHECK (REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mvp_audit_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_audits;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_mail_intents;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_seat_claim_history;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_seat_claims;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_passengers;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservation_submissions;');
        DB::statement('DROP TABLE IF EXISTS mvp_reservations;');
        DB::statement('DROP TABLE IF EXISTS mvp_services;');
    }
};
