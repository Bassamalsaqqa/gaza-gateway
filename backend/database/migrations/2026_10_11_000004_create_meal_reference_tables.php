<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE meal_revision_control (
    domain TEXT PRIMARY KEY CHECK (domain = 'meals'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
    default_meal_id VARCHAR(64) NULL
);
INSERT INTO meal_revision_control(domain, revision, default_meal_id) VALUES ('meals', 0, NULL);

CREATE TABLE meal_options (
    id VARCHAR(64) COLLATE "C" PRIMARY KEY CHECK (id <> '' AND id = btrim(id) AND id ~ '^[A-Za-z0-9_-]{1,64}$'),
    label_en VARCHAR(500) NOT NULL CHECK (label_en <> '' AND label_en = btrim(label_en)),
    label_ar VARCHAR(500) NOT NULL CHECK (label_ar <> '' AND label_ar = btrim(label_ar)),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    order_num INTEGER NOT NULL CHECK (order_num >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE meal_revision_control
    ADD CONSTRAINT meal_default_fk FOREIGN KEY (default_meal_id) REFERENCES meal_options(id) ON DELETE RESTRICT;

CREATE FUNCTION reference_default_meal_active_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.default_meal_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM meal_options WHERE id = NEW.default_meal_id AND active = TRUE) THEN
            RAISE EXCEPTION 'Default meal must be an active meal' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_default_meal_active BEFORE INSERT OR UPDATE ON meal_revision_control
    FOR EACH ROW EXECUTE FUNCTION reference_default_meal_active_guard();

CREATE FUNCTION reference_immutable_meal_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Immutable reference meal identity' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_meal_id BEFORE UPDATE ON meal_options
    FOR EACH ROW EXECUTE FUNCTION reference_immutable_meal_id();

CREATE FUNCTION reference_meal_retirement_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.active = TRUE AND NEW.active = FALSE THEN
        IF EXISTS (SELECT 1 FROM meal_revision_control WHERE domain = 'meals' AND default_meal_id = OLD.id) THEN
            RAISE EXCEPTION 'Current default meal cannot retire until another active default selected' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reference_meal_retirement BEFORE UPDATE ON meal_options
    FOR EACH ROW EXECUTE FUNCTION reference_meal_retirement_guard();

CREATE TABLE meal_revisions (
    domain TEXT NOT NULL REFERENCES meal_revision_control(domain),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
    snapshot_bytes TEXT NOT NULL CHECK (snapshot_bytes::jsonb = snapshot_json),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(domain, revision)
);

CREATE FUNCTION meal_snapshot_digest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.snapshot_hash := encode(sha256(convert_to(NEW.snapshot_bytes, 'UTF8')), 'hex');
    RETURN NEW;
END $$;
CREATE TRIGGER meal_snapshot_hash BEFORE INSERT ON meal_revisions
    FOR EACH ROW EXECUTE FUNCTION meal_snapshot_digest();

CREATE TABLE meal_audit_events (
    id UUID PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain = 'meals'),
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('meal.create','meal.patch','meal.reorder','meal.default')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    meal_id VARCHAR(64) COLLATE "C" NULL REFERENCES meal_options(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(domain, revision) REFERENCES meal_revisions(domain, revision) ON DELETE RESTRICT,
    UNIQUE(domain, revision)
);

CREATE FUNCTION meal_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Reference history is append only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER meal_revisions_immutable BEFORE UPDATE OR DELETE ON meal_revisions
    FOR EACH ROW EXECUTE FUNCTION meal_history_immutable();
CREATE TRIGGER meal_revisions_no_truncate BEFORE TRUNCATE ON meal_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION meal_history_immutable();
CREATE TRIGGER meal_audit_immutable BEFORE UPDATE OR DELETE ON meal_audit_events
    FOR EACH ROW EXECUTE FUNCTION meal_history_immutable();
CREATE TRIGGER meal_audit_no_truncate BEFORE TRUNCATE ON meal_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION meal_history_immutable();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE meal_audit_events;
DROP TABLE meal_revisions;
ALTER TABLE meal_revision_control DROP CONSTRAINT meal_default_fk;
DROP TABLE meal_options;
DROP TABLE meal_revision_control;
DROP FUNCTION meal_history_immutable();
DROP FUNCTION meal_snapshot_digest();
DROP FUNCTION reference_meal_retirement_guard();
DROP FUNCTION reference_immutable_meal_id();
DROP FUNCTION reference_default_meal_active_guard();
SQL);
    }
};
