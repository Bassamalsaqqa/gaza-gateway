<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE editorial_documents (
    slug VARCHAR(64) COLLATE "C" PRIMARY KEY CHECK (slug IN (
        'home', 'travel', 'airport.past', 'airport.present',
        'airport.future', 'destinations.presentation',
        'destinations.editorial', 'pages.information'
    )),
    kind VARCHAR(64) COLLATE "C" NOT NULL CHECK (kind = slug),
    status VARCHAR(32) NOT NULL CHECK (status IN ('draft', 'published', 'unpublished')),
    current_revision BIGINT NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
    published_revision BIGINT NULL CHECK (published_revision IS NULL OR published_revision > 0),
    draft_revision BIGINT NULL CHECK (draft_revision IS NULL OR draft_revision > 0),
    tombstoned BOOLEAN NOT NULL DEFAULT FALSE,
    tombstoned_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE editorial_revisions (
    slug VARCHAR(64) COLLATE "C" NOT NULL REFERENCES editorial_documents(slug) ON DELETE RESTRICT,
    revision BIGINT NOT NULL CHECK (revision >= 1),
    snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
    snapshot_bytes TEXT NOT NULL CHECK (snapshot_bytes::jsonb = snapshot_json),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(slug, revision)
);

CREATE FUNCTION editorial_snapshot_digest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.snapshot_hash := encode(sha256(convert_to(NEW.snapshot_bytes, 'UTF8')), 'hex');
    RETURN NEW;
END $$;

CREATE TRIGGER editorial_snapshot_hash BEFORE INSERT ON editorial_revisions
    FOR EACH ROW EXECUTE FUNCTION editorial_snapshot_digest();

CREATE TABLE editorial_published_revisions (
    slug VARCHAR(64) COLLATE "C" NOT NULL,
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(slug, revision),
    FOREIGN KEY(slug, revision) REFERENCES editorial_revisions(slug, revision) ON DELETE RESTRICT
);

ALTER TABLE editorial_documents
    ADD CONSTRAINT editorial_documents_published_rev_fk
    FOREIGN KEY (slug, published_revision) REFERENCES editorial_published_revisions(slug, revision)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE editorial_documents
    ADD CONSTRAINT editorial_documents_draft_rev_fk
    FOREIGN KEY (slug, draft_revision) REFERENCES editorial_revisions(slug, revision)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE editorial_audit_events (
    id UUID PRIMARY KEY,
    slug VARCHAR(64) COLLATE "C" NOT NULL REFERENCES editorial_documents(slug) ON DELETE RESTRICT,
    revision BIGINT NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('draft.save', 'draft.discard', 'publish', 'unpublish', 'restore')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    restored_from_revision BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(slug, revision) REFERENCES editorial_revisions(slug, revision) ON DELETE RESTRICT,
    FOREIGN KEY(slug, restored_from_revision) REFERENCES editorial_published_revisions(slug, revision) ON DELETE RESTRICT,
    CHECK ((action = 'restore' AND restored_from_revision IS NOT NULL) OR (action <> 'restore' AND restored_from_revision IS NULL))
);

CREATE FUNCTION editorial_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Editorial history is append only' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER editorial_revisions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON editorial_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION editorial_history_immutable();

CREATE TRIGGER editorial_published_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON editorial_published_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION editorial_history_immutable();

CREATE TRIGGER editorial_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON editorial_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION editorial_history_immutable();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE editorial_audit_events;
ALTER TABLE editorial_documents DROP CONSTRAINT IF EXISTS editorial_documents_draft_rev_fk;
ALTER TABLE editorial_documents DROP CONSTRAINT IF EXISTS editorial_documents_published_rev_fk;
DROP TABLE editorial_published_revisions;
DROP TABLE editorial_revisions;
DROP TABLE editorial_documents;
DROP FUNCTION editorial_history_immutable();
DROP FUNCTION editorial_snapshot_digest();
SQL);
    }
};
