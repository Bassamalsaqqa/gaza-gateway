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
                id VARCHAR(32) PRIMARY KEY,
                name_en VARCHAR(64) NOT NULL,
                name_ar VARCHAR(64) NOT NULL,
                multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
                checked_bags INTEGER NOT NULL,
                seat_selection_en VARCHAR(128) NOT NULL,
                seat_selection_ar VARCHAR(128) NOT NULL,
                changes_en VARCHAR(128) NOT NULL,
                changes_ar VARCHAR(128) NOT NULL,
                refund_en VARCHAR(128) NOT NULL,
                refund_ar VARCHAR(128) NOT NULL,
                flexibility_en VARCHAR(128) NOT NULL,
                flexibility_ar VARCHAR(128) NOT NULL,
                allowed_cabins TEXT[] NOT NULL,
                order_index INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT chk_fare_products_multiplier CHECK (multiplier > 0),
                CONSTRAINT chk_fare_products_checked_bags CHECK (checked_bags >= 0),
                CONSTRAINT chk_fare_products_order_index CHECK (order_index >= 0),
                CONSTRAINT chk_fare_products_allowed_cabins CHECK (
                    cardinality(allowed_cabins) > 0 AND allowed_cabins <@ ARRAY[\'economy\'::text, \'premium\'::text, \'business\'::text]
                )
            );
        ');

        // 2. quotes (5-minute immutable quote with composite checkout_session integrity)
        DB::statement('
            CREATE TABLE quotes (
                id UUID PRIMARY KEY,
                checkout_session_id UUID NOT NULL,
                fare_id VARCHAR(32) NOT NULL,
                cabin TEXT NOT NULL,
                pax_count INTEGER NOT NULL,
                infant_count INTEGER NOT NULL,
                seat_count INTEGER NOT NULL,
                service_ids TEXT[] NOT NULL,
                base_minor BIGINT NOT NULL,
                total_minor BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT \'USD\',
                pricing_snapshot JSONB NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT fk_quotes_checkout_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_quotes_fare_id FOREIGN KEY (fare_id) REFERENCES fare_products (id) ON DELETE RESTRICT,
                CONSTRAINT uq_quotes_id_session UNIQUE (id, checkout_session_id),
                CONSTRAINT chk_quotes_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_quotes_pax_count CHECK (pax_count BETWEEN 1 AND 9),
                CONSTRAINT chk_quotes_infant_count CHECK (infant_count >= 0 AND infant_count <= pax_count),
                CONSTRAINT chk_quotes_seat_count CHECK (seat_count = pax_count - infant_count AND seat_count >= 1),
                CONSTRAINT chk_quotes_service_ids CHECK (cardinality(service_ids) > 0),
                CONSTRAINT chk_quotes_base_minor CHECK (base_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_quotes_total_minor CHECK (total_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_quotes_currency CHECK (currency = \'USD\'),
                CONSTRAINT chk_quotes_expires_at CHECK (expires_at > issued_at)
            );
        ');

        // 3. capacity_holds (10-minute hold with composite quote & session integrity)
        DB::statement('
            CREATE TABLE capacity_holds (
                id UUID PRIMARY KEY,
                quote_id UUID NOT NULL,
                checkout_session_id UUID NOT NULL,
                cabin TEXT NOT NULL,
                seat_count INTEGER NOT NULL,
                state TEXT NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT fk_capacity_holds_quote_session FOREIGN KEY (quote_id, checkout_session_id) REFERENCES quotes (id, checkout_session_id) ON DELETE RESTRICT,
                CONSTRAINT fk_capacity_holds_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT uq_capacity_holds_id_quote_session UNIQUE (id, quote_id, checkout_session_id),
                CONSTRAINT chk_capacity_holds_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_capacity_holds_seat_count CHECK (seat_count BETWEEN 1 AND 9),
                CONSTRAINT chk_capacity_holds_state CHECK (state IN (\'active\', \'attached\', \'converted\', \'released\', \'expired\')),
                CONSTRAINT chk_capacity_holds_expires_at CHECK (expires_at > issued_at)
            );
        ');

        // 4. bookings (Full commercial booking schema with immutable snapshots and exact contact fields)
        DB::statement('
            CREATE TABLE bookings (
                id UUID PRIMARY KEY,
                pnr VARCHAR(8) NOT NULL UNIQUE,
                hold_id UUID NOT NULL UNIQUE,
                quote_id UUID NOT NULL,
                checkout_session_id UUID NOT NULL,
                owner_user_id UUID,
                security_epoch INTEGER NOT NULL,
                channel TEXT NOT NULL,
                status TEXT NOT NULL,
                contact_name TEXT NOT NULL,
                contact_email VARCHAR(255) NOT NULL,
                contact_phone TEXT NOT NULL,
                fare_id VARCHAR(32) NOT NULL,
                cabin TEXT NOT NULL,
                pricing_snapshot_json JSONB NOT NULL,
                seat_layouts_snapshot_json JSONB NOT NULL,
                total_minor BIGINT NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT \'USD\',
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT fk_bookings_hold_quote_session FOREIGN KEY (hold_id, quote_id, checkout_session_id) REFERENCES capacity_holds (id, quote_id, checkout_session_id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_session FOREIGN KEY (checkout_session_id) REFERENCES passenger_sessions (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bookings_fare FOREIGN KEY (fare_id) REFERENCES fare_products (id) ON DELETE RESTRICT,
                CONSTRAINT uq_bookings_id_hold UNIQUE (id, hold_id),
                CONSTRAINT uq_bookings_id_total_currency UNIQUE (id, total_minor, currency),
                CONSTRAINT chk_bookings_pnr CHECK (length(trim(pnr)) > 0),
                CONSTRAINT chk_bookings_security_epoch CHECK (security_epoch >= 1),
                CONSTRAINT chk_bookings_channel CHECK (channel IN (\'web\', \'desk\')),
                CONSTRAINT chk_bookings_status CHECK (status IN (\'pending_payment\', \'confirmed\', \'compensation_pending\', \'cancelled\')),
                CONSTRAINT chk_bookings_cabin CHECK (cabin IN (\'economy\', \'premium\', \'business\')),
                CONSTRAINT chk_bookings_total_minor CHECK (total_minor BETWEEN 0 AND 9007199254740991),
                CONSTRAINT chk_bookings_currency CHECK (currency = \'USD\'),
                CONSTRAINT chk_bookings_contact_email CHECK (length(trim(contact_email)) > 0)
            );
        ');

        // 5. booking_passengers (Authentic passengers with same-booking infant/adult constraints)
        DB::statement('
            CREATE TABLE booking_passengers (
                id UUID PRIMARY KEY,
                booking_id UUID NOT NULL,
                request_local_id TEXT NOT NULL,
                passenger_index INTEGER NOT NULL,
                type TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                title TEXT,
                dob DATE,
                nationality TEXT,
                encrypted_document_metadata TEXT,
                linked_adult_passenger_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                CONSTRAINT fk_booking_passengers_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
                CONSTRAINT uq_booking_passengers_id_booking UNIQUE (id, booking_id),
                CONSTRAINT fk_booking_passengers_linked_adult FOREIGN KEY (linked_adult_passenger_id, booking_id) REFERENCES booking_passengers (id, booking_id) ON DELETE RESTRICT,
                CONSTRAINT uq_booking_passengers_booking_request_local UNIQUE (booking_id, request_local_id),
                CONSTRAINT uq_booking_passengers_booking_index UNIQUE (booking_id, passenger_index),
                CONSTRAINT chk_booking_passengers_type CHECK (type IN (\'adult\', \'child\', \'infant\')),
                CONSTRAINT chk_booking_passengers_infant_link CHECK ((type = \'infant\') = (linked_adult_passenger_id IS NOT NULL)),
                CONSTRAINT chk_booking_passengers_no_self_link CHECK (linked_adult_passenger_id IS NULL OR linked_adult_passenger_id != id),
                CONSTRAINT chk_booking_passengers_passenger_index CHECK (passenger_index >= 0),
                CONSTRAINT chk_booking_passengers_title CHECK (title IS NULL OR title IN (\'Mr\', \'Mrs\', \'Ms\', \'Dr\', \'Master\', \'Miss\')),
                CONSTRAINT chk_booking_passengers_first_name CHECK (length(trim(first_name)) > 0),
                CONSTRAINT chk_booking_passengers_last_name CHECK (length(trim(last_name)) > 0)
            );
        ');

        // Partial unique index: at most one infant per adult in the same booking
        DB::statement('
            CREATE UNIQUE INDEX uq_booking_passengers_infant_adult
            ON booking_passengers (booking_id, linked_adult_passenger_id)
            WHERE type = \'infant\' AND linked_adult_passenger_id IS NOT NULL;
        ');

        // Deferred constraint trigger verifying linked adult target type and preventing deletion/type mutation
        DB::statement('
            CREATE OR REPLACE FUNCTION check_booking_passenger_adult_target()
            RETURNS TRIGGER AS $$
            DECLARE
                target_type TEXT;
            BEGIN
                IF (TG_OP = \'INSERT\' OR TG_OP = \'UPDATE\') THEN
                    IF NEW.type = \'infant\' AND NEW.linked_adult_passenger_id IS NOT NULL THEN
                        SELECT type INTO target_type
                        FROM booking_passengers
                        WHERE id = NEW.linked_adult_passenger_id AND booking_id = NEW.booking_id
                        FOR NO KEY UPDATE;

                        IF target_type IS NULL OR target_type != \'adult\' THEN
                            RAISE EXCEPTION \'Infant passenger must link to an adult passenger in the same booking\';
                        END IF;
                    END IF;
                END IF;

                IF (TG_OP = \'UPDATE\' OR TG_OP = \'DELETE\') THEN
                    IF (TG_OP = \'DELETE\' OR (TG_OP = \'UPDATE\' AND (NEW.type != \'adult\' OR NEW.id != OLD.id))) THEN
                        PERFORM 1
                        FROM booking_passengers
                        WHERE linked_adult_passenger_id = OLD.id AND booking_id = OLD.booking_id;

                        IF FOUND THEN
                            RAISE EXCEPTION \'Cannot modify or delete adult passenger linked by an infant\';
                        END IF;
                    END IF;
                END IF;

                IF TG_OP = \'DELETE\' THEN
                    RETURN OLD;
                ELSE
                    RETURN NEW;
                END IF;
            END;
            $$ LANGUAGE plpgsql;
        ');

        DB::statement('
            CREATE CONSTRAINT TRIGGER trg_booking_passengers_adult_target
            AFTER INSERT OR UPDATE OR DELETE ON booking_passengers
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW
            EXECUTE FUNCTION check_booking_passenger_adult_target();
        ');
    }

    /**
     * Reverse the migrations.
     * Drops triggers, functions, and tables in strict reverse dependency order without CASCADE.
     */
    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_booking_passengers_adult_target ON booking_passengers;');
        DB::statement('DROP FUNCTION IF EXISTS check_booking_passenger_adult_target();');
        DB::statement('DROP INDEX IF EXISTS uq_booking_passengers_infant_adult;');
        DB::statement('DROP TABLE IF EXISTS booking_passengers;');
        DB::statement('DROP TABLE IF EXISTS bookings;');
        DB::statement('DROP TABLE IF EXISTS capacity_holds;');
        DB::statement('DROP TABLE IF EXISTS quotes;');
        DB::statement('DROP TABLE IF EXISTS fare_products;');
    }
};
