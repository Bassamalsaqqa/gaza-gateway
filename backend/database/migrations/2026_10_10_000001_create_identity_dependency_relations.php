<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Establishes the 5 inert domain dependency relations:
     * 1. fare_products
     * 2. quotes
     * 3. capacity_holds
     * 4. bookings
     * 5. booking_passengers
     */
    public function up(): void
    {
        // 1. fare_products (Commercial Fare Families)
        DB::statement('
            CREATE TABLE fare_products (
                id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
                name_en VARCHAR(64) NOT NULL,
                name_ar VARCHAR(64) NOT NULL,
                multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
                checked_bags INT NOT NULL,
                seat_selection_en VARCHAR(128) NOT NULL,
                seat_selection_ar VARCHAR(128) NOT NULL,
                changes_en VARCHAR(128) NOT NULL,
                changes_ar VARCHAR(128) NOT NULL,
                refund_en VARCHAR(128) NOT NULL,
                refund_ar VARCHAR(128) NOT NULL,
                flexibility_en VARCHAR(128) NOT NULL,
                flexibility_ar VARCHAR(128) NOT NULL,
                allowed_cabins JSON NOT NULL,
                order_index INT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT chk_fare_products_multiplier CHECK (multiplier > 0),
                CONSTRAINT chk_fare_products_checked_bags CHECK (checked_bags >= 0),
                CONSTRAINT chk_fare_products_order_index CHECK (order_index >= 0),
                CONSTRAINT chk_fare_products_allowed_cabins CHECK (
                    JSON_TYPE(allowed_cabins) = \'ARRAY\' AND
                    JSON_LENGTH(allowed_cabins) > 0 AND
                    JSON_SCHEMA_VALID(\'{"type":"array","minItems":1,"items":{"type":"string","enum":["economy","premium","business"]}}\', allowed_cabins)
                )
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 2. quotes (5-minute immutable quote with composite checkout_session integrity)
        DB::statement('
            CREATE TABLE quotes (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                checkout_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                fare_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
                cabin VARCHAR(32) NOT NULL,
                pax_count INT NOT NULL,
                infant_count INT NOT NULL,
                seat_count INT NOT NULL,
                service_ids JSON NOT NULL,
                base_minor BIGINT NOT NULL,
                total_minor BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT \'USD\',
                pricing_snapshot JSON NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                CONSTRAINT fk_quotes_checkout_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_quotes_fare_id FOREIGN KEY (fare_id) REFERENCES fare_products (id) ON DELETE RESTRICT,
                CONSTRAINT uq_quotes_id_session UNIQUE (id, checkout_session_id),
                CONSTRAINT chk_quotes_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_quotes_session_uuid CHECK (REGEXP_LIKE(checkout_session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_quotes_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_quotes_pax_count CHECK (pax_count BETWEEN 1 AND 9),
                CONSTRAINT chk_quotes_infant_count CHECK (infant_count >= 0 AND infant_count <= pax_count),
                CONSTRAINT chk_quotes_seat_count CHECK (seat_count = pax_count - infant_count AND seat_count >= 1),
                CONSTRAINT chk_quotes_service_ids CHECK (JSON_TYPE(service_ids) = \'ARRAY\' AND JSON_LENGTH(service_ids) > 0),
                CONSTRAINT chk_quotes_base_minor CHECK (base_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_quotes_total_minor CHECK (total_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_quotes_currency CHECK (currency = \'USD\'),
                CONSTRAINT chk_quotes_expires_at CHECK (expires_at > issued_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 3. capacity_holds (10-minute hold with composite quote & session integrity)
        DB::statement('
            CREATE TABLE capacity_holds (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                checkout_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                cabin VARCHAR(32) NOT NULL,
                seat_count INT NOT NULL,
                state VARCHAR(32) NOT NULL,
                issued_at DATETIME(6) NOT NULL,
                expires_at DATETIME(6) NOT NULL,
                CONSTRAINT fk_capacity_holds_quote_session FOREIGN KEY (quote_id, checkout_session_id) REFERENCES quotes (id, checkout_session_id) ON DELETE RESTRICT,
                CONSTRAINT fk_capacity_holds_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT uq_capacity_holds_id_quote_session UNIQUE (id, quote_id, checkout_session_id),
                CONSTRAINT chk_holds_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_holds_quote_uuid CHECK (REGEXP_LIKE(quote_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_holds_session_uuid CHECK (REGEXP_LIKE(checkout_session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_capacity_holds_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_capacity_holds_seat_count CHECK (seat_count BETWEEN 1 AND 9),
                CONSTRAINT chk_capacity_holds_state CHECK (state IN (\'active\', \'attached\', \'converted\', \'released\', \'expired\')),
                CONSTRAINT chk_capacity_holds_expires_at CHECK (expires_at > issued_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 4. bookings (Full commercial booking schema with immutable snapshots and exact contact fields)
        DB::statement('
            CREATE TABLE bookings (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                pnr VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                hold_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                checkout_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                security_epoch INT NOT NULL,
                channel VARCHAR(32) NOT NULL,
                status VARCHAR(32) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                contact_email VARCHAR(255) NOT NULL,
                contact_phone VARCHAR(64) NOT NULL,
                fare_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
                cabin VARCHAR(32) NOT NULL,
                pricing_snapshot_json JSON NOT NULL,
                seat_layouts_snapshot_json JSON NOT NULL,
                total_minor BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT \'USD\',
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_bookings_hold_quote_session FOREIGN KEY (hold_id, quote_id, checkout_session_id) REFERENCES capacity_holds (id, quote_id, checkout_session_id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_fare FOREIGN KEY (fare_id) REFERENCES fare_products (id) ON DELETE RESTRICT,
                CONSTRAINT uq_bookings_id_hold UNIQUE (id, hold_id),
                CONSTRAINT uq_bookings_id_total_currency UNIQUE (id, total_minor, currency),
                CONSTRAINT chk_bookings_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bookings_hold_uuid CHECK (REGEXP_LIKE(hold_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bookings_quote_uuid CHECK (REGEXP_LIKE(quote_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bookings_session_uuid CHECK (REGEXP_LIKE(checkout_session_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bookings_owner_uuid CHECK (owner_user_id IS NULL OR REGEXP_LIKE(owner_user_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bookings_pnr CHECK (LENGTH(TRIM(pnr)) > 0),
                CONSTRAINT chk_bookings_security_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_bookings_channel CHECK (channel IN (\'web\', \'desk\')),
                CONSTRAINT chk_bookings_status CHECK (status IN (\'pending_payment\', \'confirmed\', \'compensation_pending\', \'cancelled\')),
                CONSTRAINT chk_bookings_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_bookings_total_minor CHECK (total_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_bookings_currency CHECK (currency = \'USD\'),
                CONSTRAINT chk_bookings_contact_email CHECK (LENGTH(TRIM(contact_email)) > 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // 5. booking_passengers (Authentic passengers with same-booking infant/adult constraints)
        DB::statement('
            CREATE TABLE booking_passengers (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                request_local_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
                passenger_index INT NOT NULL,
                type VARCHAR(32) NOT NULL,
                first_name VARCHAR(128) NOT NULL,
                last_name VARCHAR(128) NOT NULL,
                title VARCHAR(32) NULL,
                dob DATE NULL,
                nationality VARCHAR(64) NULL,
                encrypted_document_metadata TEXT NULL,
                linked_adult_passenger_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                infant_adult_unique_key VARCHAR(73) CHARACTER SET ascii COLLATE ascii_bin AS (
                    CASE WHEN type = \'infant\' AND linked_adult_passenger_id IS NOT NULL
                    THEN CONCAT(booking_id, \':\', linked_adult_passenger_id)
                    ELSE NULL END
                ) STORED NULL,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_booking_passengers_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT uq_booking_passengers_id_booking UNIQUE (id, booking_id),
                CONSTRAINT fk_booking_passengers_linked_adult FOREIGN KEY (linked_adult_passenger_id, booking_id) REFERENCES booking_passengers (id, booking_id) ON DELETE RESTRICT,
                CONSTRAINT uq_booking_passengers_booking_request_local UNIQUE (booking_id, request_local_id),
                CONSTRAINT uq_booking_passengers_booking_index UNIQUE (booking_id, passenger_index),
                CONSTRAINT uq_booking_passengers_infant_adult UNIQUE (infant_adult_unique_key),
                CONSTRAINT chk_bp_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bp_booking_uuid CHECK (REGEXP_LIKE(booking_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_bp_adult_uuid CHECK (linked_adult_passenger_id IS NULL OR REGEXP_LIKE(linked_adult_passenger_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_booking_passengers_type CHECK (type IN (\'adult\', \'child\', \'infant\')),
                CONSTRAINT chk_booking_passengers_infant_link CHECK (((type = \'infant\') AND (linked_adult_passenger_id IS NOT NULL)) OR ((type != \'infant\') AND (linked_adult_passenger_id IS NULL))),
                CONSTRAINT chk_booking_passengers_no_self_link CHECK (linked_adult_passenger_id IS NULL OR linked_adult_passenger_id != id),
                CONSTRAINT chk_booking_passengers_passenger_index CHECK (passenger_index >= 0),
                CONSTRAINT chk_booking_passengers_title CHECK (title IS NULL OR title IN (\'Mr\', \'Mrs\', \'Ms\', \'Dr\', \'Master\', \'Miss\')),
                CONSTRAINT chk_booking_passengers_first_name CHECK (LENGTH(TRIM(first_name)) > 0),
                CONSTRAINT chk_booking_passengers_last_name CHECK (LENGTH(TRIM(last_name)) > 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Triggers verifying linked adult target type and preventing deletion/type mutation
        DB::unprepared('
            CREATE TRIGGER trg_booking_passengers_adult_target_ins
            BEFORE INSERT ON booking_passengers
            FOR EACH ROW
            BEGIN
                IF NEW.type = \'infant\' AND NEW.linked_adult_passenger_id IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM booking_passengers
                        WHERE id = NEW.linked_adult_passenger_id AND booking_id = NEW.booking_id AND type = \'adult\'
                    ) THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Infant passenger must link to an adult passenger in the same booking\';
                    END IF;
                END IF;
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_booking_passengers_adult_target_upd
            BEFORE UPDATE ON booking_passengers
            FOR EACH ROW
            BEGIN
                IF NEW.type = \'infant\' AND NEW.linked_adult_passenger_id IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM booking_passengers
                        WHERE id = NEW.linked_adult_passenger_id AND booking_id = NEW.booking_id AND type = \'adult\'
                    ) THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Infant passenger must link to an adult passenger in the same booking\';
                    END IF;
                END IF;

                IF (NEW.type != \'adult\' OR NEW.id != OLD.id) THEN
                    IF EXISTS (
                        SELECT 1 FROM booking_passengers
                        WHERE linked_adult_passenger_id = OLD.id AND booking_id = OLD.booking_id
                    ) THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Cannot modify or delete adult passenger linked by an infant\';
                    END IF;
                END IF;
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_booking_passengers_adult_target_del
            BEFORE DELETE ON booking_passengers
            FOR EACH ROW
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM booking_passengers
                    WHERE linked_adult_passenger_id = OLD.id AND booking_id = OLD.booking_id
                ) THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Cannot modify or delete adult passenger linked by an infant\';
                END IF;
            END;
        ');
    }

    /**
     * Reverse the migrations.
     * Drops triggers and tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_booking_passengers_adult_target_del;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_booking_passengers_adult_target_upd;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_booking_passengers_adult_target_ins;');
        DB::statement('DROP TABLE IF EXISTS booking_passengers;');
        DB::statement('DROP TABLE IF EXISTS bookings;');
        DB::statement('DROP TABLE IF EXISTS capacity_holds;');
        DB::statement('DROP TABLE IF EXISTS quotes;');
        DB::statement('DROP TABLE IF EXISTS fare_products;');
    }
};
