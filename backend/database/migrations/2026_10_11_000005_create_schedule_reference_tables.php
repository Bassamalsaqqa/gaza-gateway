<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE schedule_revision_control (
    domain TEXT PRIMARY KEY CHECK (domain = 'schedules'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
INSERT INTO schedule_revision_control(domain) VALUES ('schedules');

CREATE FUNCTION reference_schedule_utf16_length(value TEXT) RETURNS INTEGER
LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT COALESCE(sum(CASE WHEN ascii(ch) > 65535 THEN 2 ELSE 1 END), 0)::integer
    FROM regexp_split_to_table(value, '') ch
$$;

CREATE TABLE schedules (
    id TEXT COLLATE "C" PRIMARY KEY
        CHECK (id <> '' AND reference_schedule_utf16_length(id) <= 160 AND id !~ '\x00'),
    number VARCHAR(32) NOT NULL
        CHECK (number <> '' AND number ~ '^[A-Z]{2}\s?[0-9]{1,4}$'),
    direction VARCHAR(3) NOT NULL
        CHECK (direction IN ('out', 'in')),
    destination VARCHAR(3) COLLATE "C" NOT NULL
        REFERENCES airports(code) ON DELETE RESTRICT
        CHECK (destination <> 'GZA'),
    days_json JSONB NOT NULL
        CHECK (jsonb_typeof(days_json) = 'array' AND jsonb_array_length(days_json) BETWEEN 1 AND 7),
    depart_time VARCHAR(5) NOT NULL
        CHECK (depart_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    arrive_time VARCHAR(5) NOT NULL
        CHECK (arrive_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    aircraft VARCHAR(120) NOT NULL
        CHECK (aircraft <> '' AND aircraft = btrim(aircraft)),
    aircraft_id VARCHAR(64) COLLATE "C" NULL
        REFERENCES aircraft(id) ON DELETE RESTRICT
        CHECK (aircraft_id IS NULL OR aircraft_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    from_date DATE NOT NULL,
    until_date DATE NOT NULL
        CHECK (from_date <= until_date),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    exceptions_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(exceptions_json) = 'array' AND jsonb_array_length(exceptions_json) <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION reference_immutable_schedule_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.direction IS DISTINCT FROM OLD.direction THEN
        RAISE EXCEPTION 'Immutable reference schedule identity' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_schedule_identity BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION reference_immutable_schedule_identity();

CREATE FUNCTION reference_validate_schedule() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    elem JSONB;
    val INTEGER;
    seen_days INTEGER[] := '{}';
    seen_exc_ids TEXT[] := '{}';
    exc_id TEXT;
    exc_date_str TEXT;
    exc_date DATE;
    exc_kind TEXT;
    exc_detail TEXT;
    exc_effect JSONB;
    weekday INTEGER;
    op_cancelled_dates TEXT[] := '{}';
    op_extra_dates TEXT[] := '{}';
    op_time_dates TEXT[] := '{}';
    op_aircraft_dates TEXT[] := '{}';
BEGIN
    -- Validate days_json
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.days_json) LOOP
        IF jsonb_typeof(elem) <> 'number' OR (elem #>> '{}') !~ '^[0-6]$' THEN
            RAISE EXCEPTION 'Invalid schedule days specification' USING ERRCODE = '23514';
        END IF;
        val := (elem #>> '{}')::integer;
        IF val = ANY(seen_days) THEN
            RAISE EXCEPTION 'Duplicate schedule day' USING ERRCODE = '23514';
        END IF;
        seen_days := array_append(seen_days, val);
    END LOOP;

    -- Validate exceptions_json
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.exceptions_json) LOOP
        IF jsonb_typeof(elem) <> 'object' THEN
            RAISE EXCEPTION 'Schedule exception must be an object' USING ERRCODE = '23514';
        END IF;

        exc_id := elem ->> 'id';
        exc_date_str := elem ->> 'date';
        exc_kind := elem ->> 'kind';
        exc_detail := elem ->> 'detail';
        exc_effect := elem -> 'effect';

        IF exc_id IS NULL OR exc_id = '' OR length(exc_id) > 160 OR exc_id ~ '\x00' THEN
            RAISE EXCEPTION 'Invalid schedule exception id' USING ERRCODE = '23514';
        END IF;
        IF exc_id = ANY(seen_exc_ids) THEN
            RAISE EXCEPTION 'Duplicate schedule exception id' USING ERRCODE = '23514';
        END IF;
        seen_exc_ids := array_append(seen_exc_ids, exc_id);

        IF exc_date_str IS NULL OR exc_date_str !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
            RAISE EXCEPTION 'Invalid schedule exception date format' USING ERRCODE = '23514';
        END IF;
        BEGIN
            exc_date := exc_date_str::date;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid schedule exception calendar date' USING ERRCODE = '23514';
        END;

        IF exc_kind NOT IN ('cancelled', 'time', 'aircraft', 'extra') THEN
            RAISE EXCEPTION 'Invalid schedule exception kind' USING ERRCODE = '23514';
        END IF;

        IF exc_detail IS NULL OR length(exc_detail) > 500 THEN
            RAISE EXCEPTION 'Invalid schedule exception detail' USING ERRCODE = '23514';
        END IF;

        -- Check structured effect if present
        IF exc_effect IS NOT NULL AND jsonb_typeof(exc_effect) <> 'null' THEN
            IF jsonb_typeof(exc_effect) <> 'object' THEN
                RAISE EXCEPTION 'Schedule exception effect must be an object' USING ERRCODE = '23514';
            END IF;

            -- Exception date must be within [from_date, until_date]
            IF exc_date < NEW.from_date OR exc_date > NEW.until_date THEN
                RAISE EXCEPTION 'Exception date out of active range' USING ERRCODE = '23514';
            END IF;

            weekday := EXTRACT(DOW FROM exc_date)::integer;

            IF exc_kind = 'cancelled' THEN
                IF (exc_effect ->> 'cancelled') <> 'true' THEN
                    RAISE EXCEPTION 'Invalid cancelled exception effect' USING ERRCODE = '23514';
                END IF;
                IF NOT (weekday = ANY(seen_days)) THEN
                    RAISE EXCEPTION 'Cancelled effect only on operating days' USING ERRCODE = '23514';
                END IF;
                IF exc_date_str = ANY(op_cancelled_dates) OR exc_date_str = ANY(op_extra_dates)
                   OR exc_date_str = ANY(op_time_dates) OR exc_date_str = ANY(op_aircraft_dates) THEN
                    RAISE EXCEPTION 'Operational cancelled cannot coexist with other effects' USING ERRCODE = '23514';
                END IF;
                op_cancelled_dates := array_append(op_cancelled_dates, exc_date_str);

            ELSIF exc_kind = 'extra' THEN
                IF exc_effect ? 'departTime' AND (exc_effect ->> 'departTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
                    RAISE EXCEPTION 'Invalid extra departTime' USING ERRCODE = '23514';
                END IF;
                IF exc_effect ? 'arriveTime' AND (exc_effect ->> 'arriveTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
                    RAISE EXCEPTION 'Invalid extra arriveTime' USING ERRCODE = '23514';
                END IF;
                IF (exc_effect ? 'aircraftId') <> (exc_effect ? 'aircraft') THEN
                    RAISE EXCEPTION 'Extra aircraft and aircraftId must be supplied together' USING ERRCODE = '23514';
                END IF;
                IF weekday = ANY(seen_days) THEN
                    RAISE EXCEPTION 'Extra effect only on non-operating days' USING ERRCODE = '23514';
                END IF;
                IF exc_date_str = ANY(op_cancelled_dates) OR exc_date_str = ANY(op_extra_dates)
                   OR exc_date_str = ANY(op_time_dates) OR exc_date_str = ANY(op_aircraft_dates) THEN
                    RAISE EXCEPTION 'Operational extra cannot coexist with other effects' USING ERRCODE = '23514';
                END IF;
                op_extra_dates := array_append(op_extra_dates, exc_date_str);

            ELSIF exc_kind = 'time' THEN
                IF (exc_effect ->> 'departTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                   OR (exc_effect ->> 'arriveTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
                    RAISE EXCEPTION 'Invalid time effect departTime or arriveTime' USING ERRCODE = '23514';
                END IF;
                IF NOT (weekday = ANY(seen_days)) THEN
                    RAISE EXCEPTION 'Time adjustment only on operating days' USING ERRCODE = '23514';
                END IF;
                IF exc_date_str = ANY(op_cancelled_dates) OR exc_date_str = ANY(op_extra_dates)
                   OR exc_date_str = ANY(op_time_dates) THEN
                    RAISE EXCEPTION 'Multiple time adjustments or coexistence conflict' USING ERRCODE = '23514';
                END IF;
                op_time_dates := array_append(op_time_dates, exc_date_str);

            ELSIF exc_kind = 'aircraft' THEN
                IF (exc_effect ->> 'aircraftId') IS NULL OR (exc_effect ->> 'aircraftId') = ''
                   OR (exc_effect ->> 'aircraft') IS NULL OR (exc_effect ->> 'aircraft') = '' THEN
                    RAISE EXCEPTION 'Aircraft effect requires aircraftId and aircraft' USING ERRCODE = '23514';
                END IF;
                IF NOT (weekday = ANY(seen_days)) THEN
                    RAISE EXCEPTION 'Aircraft adjustment only on operating days' USING ERRCODE = '23514';
                END IF;
                IF exc_date_str = ANY(op_cancelled_dates) OR exc_date_str = ANY(op_extra_dates)
                   OR exc_date_str = ANY(op_aircraft_dates) THEN
                    RAISE EXCEPTION 'Multiple aircraft adjustments or coexistence conflict' USING ERRCODE = '23514';
                END IF;
                op_aircraft_dates := array_append(op_aircraft_dates, exc_date_str);
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END $$;
CREATE TRIGGER reference_schedule_validation BEFORE INSERT OR UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION reference_validate_schedule();

CREATE TABLE schedule_revisions (
    domain TEXT NOT NULL REFERENCES schedule_revision_control(domain),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
    snapshot_bytes TEXT NOT NULL CHECK (snapshot_bytes::jsonb = snapshot_json),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(domain, revision)
);

CREATE FUNCTION schedule_snapshot_digest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.snapshot_hash := encode(sha256(convert_to(NEW.snapshot_bytes, 'UTF8')), 'hex');
    RETURN NEW;
END $$;
CREATE TRIGGER schedule_snapshot_hash BEFORE INSERT ON schedule_revisions
    FOR EACH ROW EXECUTE FUNCTION schedule_snapshot_digest();

CREATE TABLE schedule_audit_events (
    id UUID PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain = 'schedules'),
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('schedule.create', 'schedule.patch')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    schedule_id TEXT COLLATE "C" NOT NULL REFERENCES schedules(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(domain, revision) REFERENCES schedule_revisions(domain, revision) ON DELETE RESTRICT,
    UNIQUE(domain, revision)
);

CREATE FUNCTION schedule_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Reference history is append only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER schedule_revisions_immutable BEFORE UPDATE OR DELETE ON schedule_revisions
    FOR EACH ROW EXECUTE FUNCTION schedule_history_immutable();
CREATE TRIGGER schedule_revisions_no_truncate BEFORE TRUNCATE ON schedule_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION schedule_history_immutable();
CREATE TRIGGER schedule_audit_immutable BEFORE UPDATE OR DELETE ON schedule_audit_events
    FOR EACH ROW EXECUTE FUNCTION schedule_history_immutable();
CREATE TRIGGER schedule_audit_no_truncate BEFORE TRUNCATE ON schedule_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION schedule_history_immutable();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE schedule_audit_events;
DROP TABLE schedule_revisions;
DROP TABLE schedules;
DROP TABLE schedule_revision_control;
DROP FUNCTION schedule_history_immutable();
DROP FUNCTION schedule_snapshot_digest();
DROP FUNCTION reference_validate_schedule();
DROP FUNCTION reference_immutable_schedule_identity();
DROP FUNCTION reference_schedule_utf16_length(TEXT);
SQL);
    }
};
