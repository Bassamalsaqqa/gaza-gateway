<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE network_revision_control (
    domain TEXT PRIMARY KEY CHECK (domain = 'network'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
INSERT INTO network_revision_control(domain) VALUES ('network');

CREATE FUNCTION reference_valid_iana_timezone(tz TEXT) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
    PERFORM clock_timestamp() AT TIME ZONE tz;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END $$;

CREATE TABLE airports (
    code VARCHAR(3) COLLATE "C" PRIMARY KEY
        CHECK (code IN ('GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH')),
    airport_name_en VARCHAR(160) NOT NULL
        CHECK (airport_name_en <> '' AND airport_name_en = btrim(airport_name_en)),
    airport_name_ar VARCHAR(160) NOT NULL
        CHECK (airport_name_ar <> '' AND airport_name_ar = btrim(airport_name_ar)),
    city_en VARCHAR(160) NOT NULL
        CHECK (city_en <> '' AND city_en = btrim(city_en)),
    city_ar VARCHAR(160) NOT NULL
        CHECK (city_ar <> '' AND city_ar = btrim(city_ar)),
    country_en VARCHAR(160) NOT NULL
        CHECK (country_en <> '' AND country_en = btrim(country_en)),
    country_ar VARCHAR(160) NOT NULL
        CHECK (country_ar <> '' AND country_ar = btrim(country_ar)),
    timezone VARCHAR(80) NOT NULL
        CHECK (timezone <> '' AND timezone = btrim(timezone)
            AND timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'
            AND reference_valid_iana_timezone(timezone) = TRUE),
    block_minutes INTEGER NOT NULL
        CHECK (block_minutes BETWEEN 20 AND 600),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX airports_code_lower_idx ON airports(lower(code));

CREATE FUNCTION reference_immutable_airport_code() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'Immutable reference identity' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_airport_code BEFORE UPDATE ON airports
    FOR EACH ROW EXECUTE FUNCTION reference_immutable_airport_code();

CREATE VIEW routes AS
SELECT
    'GZA-' || d.code || '-out' AS id,
    'GZA' AS origin_code,
    d.code AS destination_code,
    'out' AS direction,
    d.block_minutes,
    (d.active AND b.active) AS active
FROM airports d
CROSS JOIN airports b
WHERE d.code <> 'GZA' AND b.code = 'GZA'
UNION ALL
SELECT
    d.code || '-GZA-in' AS id,
    d.code AS origin_code,
    'GZA' AS destination_code,
    'in' AS direction,
    d.block_minutes,
    (d.active AND b.active) AS active
FROM airports d
CROSS JOIN airports b
WHERE d.code <> 'GZA' AND b.code = 'GZA';

CREATE TABLE network_revisions (
    domain TEXT NOT NULL REFERENCES network_revision_control(domain),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
    snapshot_bytes TEXT NOT NULL CHECK (snapshot_bytes::jsonb = snapshot_json),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(domain, revision)
);

CREATE FUNCTION network_snapshot_digest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.snapshot_hash := encode(sha256(convert_to(NEW.snapshot_bytes, 'UTF8')), 'hex');
    RETURN NEW;
END $$;
CREATE TRIGGER network_snapshot_hash BEFORE INSERT ON network_revisions
    FOR EACH ROW EXECUTE FUNCTION network_snapshot_digest();

CREATE TABLE network_audit_events (
    id UUID PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain = 'network'),
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('airport.create', 'airport.patch')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    airport_code VARCHAR(3) COLLATE "C" NOT NULL REFERENCES airports(code) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(domain, revision) REFERENCES network_revisions(domain, revision) ON DELETE RESTRICT,
    UNIQUE(domain, revision)
);

CREATE FUNCTION network_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Reference history is append only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER network_revisions_immutable BEFORE UPDATE OR DELETE ON network_revisions
    FOR EACH ROW EXECUTE FUNCTION network_history_immutable();
CREATE TRIGGER network_revisions_no_truncate BEFORE TRUNCATE ON network_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION network_history_immutable();
CREATE TRIGGER network_audit_immutable BEFORE UPDATE OR DELETE ON network_audit_events
    FOR EACH ROW EXECUTE FUNCTION network_history_immutable();
CREATE TRIGGER network_audit_no_truncate BEFORE TRUNCATE ON network_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION network_history_immutable();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE network_audit_events;
DROP TABLE network_revisions;
DROP VIEW routes;
DROP TABLE airports;
DROP TABLE network_revision_control;
DROP FUNCTION network_history_immutable();
DROP FUNCTION network_snapshot_digest();
DROP FUNCTION reference_immutable_airport_code();
DROP FUNCTION reference_valid_iana_timezone(TEXT);
SQL);
    }
};
