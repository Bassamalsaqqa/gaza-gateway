<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE mvp_services (
    id TEXT COLLATE "C" PRIMARY KEY CHECK (id <> '' AND id = btrim(id)),
    schedule_id TEXT COLLATE "C" NOT NULL REFERENCES schedules(id) ON DELETE RESTRICT,
    service_date DATE NOT NULL,
    flight_number VARCHAR(32) NOT NULL CHECK (flight_number <> ''),
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('out', 'in')),
    origin_code VARCHAR(3) NOT NULL CHECK (origin_code ~ '^[A-Z]{3}$'),
    destination_code VARCHAR(3) NOT NULL CHECK (destination_code ~ '^[A-Z]{3}$'),
    depart_time VARCHAR(5) NOT NULL CHECK (depart_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    arrive_time VARCHAR(5) NOT NULL CHECK (arrive_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    aircraft_id VARCHAR(64) COLLATE "C" NOT NULL REFERENCES aircraft(id) ON DELETE RESTRICT,
    aircraft_snapshot JSONB NOT NULL,
    layout_snapshot JSONB NOT NULL,
    reference_revisions JSONB NOT NULL,
    classification VARCHAR(32) NOT NULL DEFAULT 'commemorative' CHECK (classification = 'commemorative'),
    price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION mvp_enforce_service_immutability() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
        OR NEW.service_date IS DISTINCT FROM OLD.service_date
        OR NEW.flight_number IS DISTINCT FROM OLD.flight_number
        OR NEW.direction IS DISTINCT FROM OLD.direction
        OR NEW.origin_code IS DISTINCT FROM OLD.origin_code
        OR NEW.destination_code IS DISTINCT FROM OLD.destination_code
        OR NEW.aircraft_id IS DISTINCT FROM OLD.aircraft_id
        OR NEW.aircraft_snapshot IS DISTINCT FROM OLD.aircraft_snapshot
        OR NEW.layout_snapshot IS DISTINCT FROM OLD.layout_snapshot
        OR NEW.depart_time IS DISTINCT FROM OLD.depart_time
        OR NEW.arrive_time IS DISTINCT FROM OLD.arrive_time
        OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
        OR NEW.reference_revisions IS DISTINCT FROM OLD.reference_revisions
        OR NEW.classification IS DISTINCT FROM OLD.classification
        OR NEW.price_minor IS DISTINCT FROM OLD.price_minor THEN
        RAISE EXCEPTION 'mvp_services immutable snapshot' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER mvp_service_immutability BEFORE UPDATE ON mvp_services
    FOR EACH ROW EXECUTE FUNCTION mvp_enforce_service_immutability();

CREATE TABLE mvp_reservations (
    id UUID PRIMARY KEY,
    reference VARCHAR(16) NOT NULL UNIQUE CHECK (reference ~ '^[A-Z0-9_-]{6,16}$'),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    service_id TEXT COLLATE "C" NOT NULL REFERENCES mvp_services(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
    contact_email VARCHAR(254) NOT NULL CHECK (contact_email <> ''),
    contact_phone VARCHAR(32) NOT NULL,
    passenger_count INTEGER NOT NULL CHECK (passenger_count BETWEEN 1 AND 9),
    flight_snapshot JSONB NOT NULL,
    ticket_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    cancelled_at TIMESTAMPTZ NULL,
    UNIQUE (id, service_id),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX mvp_reservations_owner_idx ON mvp_reservations(owner_user_id, created_at DESC);
CREATE INDEX mvp_reservations_service_idx ON mvp_reservations(service_id);

CREATE FUNCTION mvp_enforce_reservation_immutability() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.reference IS DISTINCT FROM OLD.reference
        OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
        OR NEW.service_id IS DISTINCT FROM OLD.service_id
        OR NEW.ticket_snapshot IS DISTINCT FROM OLD.ticket_snapshot
        OR NEW.flight_snapshot IS DISTINCT FROM OLD.flight_snapshot THEN
        RAISE EXCEPTION 'mvp_reservations core snapshots are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Cannot uncancel reservation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER mvp_reservation_immutability BEFORE UPDATE ON mvp_reservations
    FOR EACH ROW EXECUTE FUNCTION mvp_enforce_reservation_immutability();

CREATE TABLE mvp_reservation_submissions (
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submission_id UUID NOT NULL,
    command_fingerprint VARCHAR(64) NOT NULL CHECK (length(command_fingerprint) = 64),
    reservation_id UUID NOT NULL REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (owner_user_id, submission_id)
);

CREATE FUNCTION mvp_enforce_submission_immutability() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'mvp_reservation_submissions rows are immutable' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER mvp_submission_immutability BEFORE UPDATE ON mvp_reservation_submissions
    FOR EACH ROW EXECUTE FUNCTION mvp_enforce_submission_immutability();

CREATE TABLE mvp_reservation_passengers (
    id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    passenger_client_id VARCHAR(64) NOT NULL CHECK (passenger_client_id <> ''),
    type VARCHAR(16) NOT NULL CHECK (type IN ('adult', 'child')),
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    dob DATE NOT NULL,
    nationality VARCHAR(120) NOT NULL CHECK (nationality <> ''),
    document VARCHAR(120) NOT NULL CHECK (document <> ''),
    seat_code VARCHAR(8) NOT NULL CHECK (seat_code ~ '^(?:[1-9]|[1-5][0-9]|60)[A-Z]$'),
    meal_id VARCHAR(64) NULL REFERENCES meal_options(id) ON DELETE RESTRICT,
    meal_snapshot JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (id, reservation_id, seat_code),
    UNIQUE (reservation_id, passenger_client_id),
    UNIQUE (reservation_id, seat_code),
    CONSTRAINT chk_passenger_name CHECK (first_name <> '' OR last_name <> '')
);

CREATE FUNCTION mvp_enforce_passenger_immutability() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'mvp_reservation_passengers rows are immutable' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER mvp_passenger_immutability BEFORE UPDATE ON mvp_reservation_passengers
    FOR EACH ROW EXECUTE FUNCTION mvp_enforce_passenger_immutability();

CREATE TABLE mvp_reservation_seat_claims (
    service_id TEXT COLLATE "C" NOT NULL REFERENCES mvp_services(id) ON DELETE RESTRICT,
    seat_code VARCHAR(8) NOT NULL CHECK (seat_code ~ '^(?:[1-9]|[1-5][0-9]|60)[A-Z]$'),
    reservation_id UUID NOT NULL REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES mvp_reservation_passengers(id) ON DELETE RESTRICT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (service_id, seat_code),
    UNIQUE (passenger_id),
    FOREIGN KEY (reservation_id, service_id) REFERENCES mvp_reservations(id, service_id) ON DELETE RESTRICT,
    FOREIGN KEY (passenger_id, reservation_id, seat_code) REFERENCES mvp_reservation_passengers(id, reservation_id, seat_code) ON DELETE RESTRICT
);

CREATE TABLE mvp_reservation_seat_claim_history (
    id BIGSERIAL PRIMARY KEY,
    service_id TEXT COLLATE "C" NOT NULL REFERENCES mvp_services(id) ON DELETE RESTRICT,
    seat_code VARCHAR(8) NOT NULL,
    reservation_id UUID NOT NULL REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('claimed', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE mvp_reservation_mail_intents (
    id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL UNIQUE REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    recipient_email VARCHAR(254) NOT NULL CHECK (recipient_email <> ''),
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE mvp_reservation_audits (
    id BIGSERIAL PRIMARY KEY,
    reservation_id UUID NOT NULL REFERENCES mvp_reservations(id) ON DELETE RESTRICT,
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('passenger', 'staff', 'system')),
    actor_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('created', 'cancelled')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TRIGGER IF EXISTS mvp_passenger_immutability ON mvp_reservation_passengers;
DROP FUNCTION IF EXISTS mvp_enforce_passenger_immutability();
DROP TRIGGER IF EXISTS mvp_submission_immutability ON mvp_reservation_submissions;
DROP FUNCTION IF EXISTS mvp_enforce_submission_immutability();
DROP TRIGGER IF EXISTS mvp_reservation_immutability ON mvp_reservations;
DROP FUNCTION IF EXISTS mvp_enforce_reservation_immutability();
DROP TRIGGER IF EXISTS mvp_service_immutability ON mvp_services;
DROP FUNCTION IF EXISTS mvp_enforce_service_immutability();

DROP TABLE IF EXISTS mvp_reservation_audits CASCADE;
DROP TABLE IF EXISTS mvp_reservation_mail_intents CASCADE;
DROP TABLE IF EXISTS mvp_reservation_seat_claim_history CASCADE;
DROP TABLE IF EXISTS mvp_reservation_seat_claims CASCADE;
DROP TABLE IF EXISTS mvp_reservation_passengers CASCADE;
DROP TABLE IF EXISTS mvp_reservation_submissions CASCADE;
DROP TABLE IF EXISTS mvp_reservations CASCADE;
DROP TABLE IF EXISTS mvp_services CASCADE;
SQL);
    }
};
