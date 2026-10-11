<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE reference_revision_control (
    domain TEXT PRIMARY KEY CHECK (domain = 'fleet'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
INSERT INTO reference_revision_control(domain) VALUES ('fleet');
CREATE TABLE aircraft (
    id VARCHAR(64) COLLATE "C" PRIMARY KEY CHECK (id <> '' AND id = btrim(id)),
    model VARCHAR(120) NOT NULL CHECK (model <> '' AND model = btrim(model)),
    registration_normalized VARCHAR(32) NOT NULL
        CHECK (registration_normalized = upper(btrim(registration_normalized))
            AND registration_normalized ~ '^[A-Z0-9]{1,4}-[A-Z0-9]{1,5}$'),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX aircraft_registration_unique ON aircraft(lower(registration_normalized));
CREATE TABLE seat_layouts (
    aircraft_id VARCHAR(64) COLLATE "C" PRIMARY KEY REFERENCES aircraft(id) ON DELETE RESTRICT,
    rows INTEGER NOT NULL CHECK (rows BETWEEN 1 AND 60),
    letters_json JSONB NOT NULL,
    aisle_after INTEGER NOT NULL,
    zones_json JSONB NOT NULL,
    extra_legroom_rows_json JSONB NOT NULL,
    unavailable_json JSONB NOT NULL,
    capacity INTEGER GENERATED ALWAYS AS
        (rows * jsonb_array_length(letters_json) - jsonb_array_length(unavailable_json)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION reference_validate_layout() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    value JSONB; seen TEXT[]; cabin_ids TEXT[] := '{}';
    next_row INTEGER := 1; first_row INTEGER; last_row INTEGER; seat_row INTEGER;
BEGIN
    IF jsonb_typeof(NEW.letters_json) <> 'array'
        OR jsonb_typeof(NEW.zones_json) <> 'array'
        OR jsonb_typeof(NEW.extra_legroom_rows_json) <> 'array'
        OR jsonb_typeof(NEW.unavailable_json) <> 'array' THEN
        RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
    END IF;
    IF jsonb_array_length(NEW.letters_json) NOT BETWEEN 2 AND 10
        OR NEW.aisle_after < 1 OR NEW.aisle_after >= jsonb_array_length(NEW.letters_json)
        OR jsonb_array_length(NEW.zones_json) NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
    END IF;
    seen := '{}';
    FOR value IN SELECT * FROM jsonb_array_elements(NEW.letters_json) LOOP
        IF jsonb_typeof(value) <> 'string' OR (value #>> '{}') !~ '^[A-Z]$'
            OR (value #>> '{}') = ANY(seen) THEN
            RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
        END IF;
        seen := array_append(seen, value #>> '{}');
    END LOOP;
    FOR value IN SELECT * FROM jsonb_array_elements(NEW.zones_json) LOOP
        IF jsonb_typeof(value) <> 'object' OR NOT value ?& ARRAY['id','firstRow','lastRow']
            OR value - ARRAY['id','firstRow','lastRow'] <> '{}'::jsonb
            OR jsonb_typeof(value->'id') <> 'string'
            OR (value->>'id') NOT IN ('economy','premium','business')
            OR (value->>'id') = ANY(cabin_ids)
            OR jsonb_typeof(value->'firstRow') <> 'number' OR jsonb_typeof(value->'lastRow') <> 'number'
            OR (value->>'firstRow') !~ '^[1-9][0-9]?$' OR (value->>'lastRow') !~ '^[1-9][0-9]?$' THEN
            RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
        END IF;
        first_row := (value->>'firstRow')::integer; last_row := (value->>'lastRow')::integer;
        IF first_row <> next_row OR last_row < first_row OR last_row > NEW.rows THEN
            RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
        END IF;
        cabin_ids := array_append(cabin_ids, value->>'id'); next_row := last_row + 1;
    END LOOP;
    IF next_row <> NEW.rows + 1 THEN
        RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
    END IF;
    seen := '{}';
    FOR value IN SELECT * FROM jsonb_array_elements(NEW.extra_legroom_rows_json) LOOP
        IF jsonb_typeof(value) <> 'number' OR (value #>> '{}') !~ '^[1-9][0-9]?$'
            OR (value #>> '{}')::integer > NEW.rows OR (value #>> '{}') = ANY(seen) THEN
            RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
        END IF;
        seen := array_append(seen, value #>> '{}');
    END LOOP;
    seen := '{}';
    FOR value IN SELECT * FROM jsonb_array_elements(NEW.unavailable_json) LOOP
        IF jsonb_typeof(value) <> 'string' OR (value #>> '{}') !~ '^[1-9][0-9]?[A-Z]$'
            OR NOT NEW.letters_json ? right(value #>> '{}', 1) OR (value #>> '{}') = ANY(seen) THEN
            RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514';
        END IF;
        seat_row := left(value #>> '{}', length(value #>> '{}') - 1)::integer;
        IF seat_row > NEW.rows THEN RAISE EXCEPTION 'Invalid reference layout' USING ERRCODE = '23514'; END IF;
        seen := array_append(seen, value #>> '{}');
    END LOOP;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_layout_geometry BEFORE INSERT OR UPDATE ON seat_layouts
    FOR EACH ROW EXECUTE FUNCTION reference_validate_layout();
CREATE FUNCTION reference_immutable_aircraft_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'aircraft' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Immutable reference identity' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.aircraft_id IS DISTINCT FROM OLD.aircraft_id THEN
            RAISE EXCEPTION 'Immutable reference identity' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_aircraft_id BEFORE UPDATE ON aircraft
    FOR EACH ROW EXECUTE FUNCTION reference_immutable_aircraft_id();
CREATE TRIGGER reference_layout_id BEFORE UPDATE ON seat_layouts
    FOR EACH ROW EXECUTE FUNCTION reference_immutable_aircraft_id();
CREATE FUNCTION reference_require_layout() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
    IF TG_TABLE_NAME = 'aircraft' THEN target := NEW.id; ELSE target := OLD.aircraft_id; END IF;
    IF EXISTS (SELECT 1 FROM aircraft WHERE id = target)
        AND NOT EXISTS (SELECT 1 FROM seat_layouts WHERE aircraft_id = target) THEN
        RAISE EXCEPTION 'Aircraft requires one layout' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reference_aircraft_layout AFTER INSERT OR UPDATE ON aircraft
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reference_require_layout();
CREATE CONSTRAINT TRIGGER reference_layout_required AFTER DELETE ON seat_layouts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reference_require_layout();
CREATE TABLE reference_revisions (
    domain TEXT NOT NULL REFERENCES reference_revision_control(domain),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
    snapshot_bytes TEXT NOT NULL CHECK (snapshot_bytes::jsonb = snapshot_json),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(domain, revision)
);
CREATE FUNCTION reference_snapshot_digest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.snapshot_hash := encode(sha256(convert_to(NEW.snapshot_bytes, 'UTF8')), 'hex');
    RETURN NEW;
END $$;
CREATE TRIGGER reference_snapshot_hash BEFORE INSERT ON reference_revisions
    FOR EACH ROW EXECUTE FUNCTION reference_snapshot_digest();
CREATE TABLE reference_audit_events (
    id UUID PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain = 'fleet'),
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('aircraft.create','aircraft.patch','layout.put')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    aircraft_id VARCHAR(64) COLLATE "C" NOT NULL REFERENCES aircraft(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(domain,revision) REFERENCES reference_revisions(domain,revision) ON DELETE RESTRICT,
    UNIQUE(domain,revision)
);
CREATE FUNCTION reference_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Reference history is append only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER reference_revisions_immutable BEFORE UPDATE OR DELETE ON reference_revisions
    FOR EACH ROW EXECUTE FUNCTION reference_history_immutable();
CREATE TRIGGER reference_revisions_no_truncate BEFORE TRUNCATE ON reference_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION reference_history_immutable();
CREATE TRIGGER reference_audit_immutable BEFORE UPDATE OR DELETE ON reference_audit_events
    FOR EACH ROW EXECUTE FUNCTION reference_history_immutable();
CREATE TRIGGER reference_audit_no_truncate BEFORE TRUNCATE ON reference_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION reference_history_immutable();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE reference_audit_events;
DROP TABLE reference_revisions;
DROP TABLE seat_layouts;
DROP TABLE aircraft;
DROP TABLE reference_revision_control;
DROP FUNCTION reference_snapshot_digest();
DROP FUNCTION reference_history_immutable();
DROP FUNCTION reference_require_layout();
DROP FUNCTION reference_immutable_aircraft_id();
DROP FUNCTION reference_validate_layout();
SQL);
    }
};
