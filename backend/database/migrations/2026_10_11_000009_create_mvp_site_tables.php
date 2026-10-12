<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
return new class extends Migration {
    public function up(): void { DB::unprepared(<<<'SQL'
CREATE TABLE contact_messages (
 id UUID PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE CHECK(length(submission_id) BETWEEN 1 AND 200), payload_hash CHAR(64) NOT NULL,
 sender_name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL CHECK(topic IN ('booking','baggage','accessibility','archive','media','other')),
 message TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('en','ar')), booking_ref TEXT,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','open','resolved','spam')), assigned_staff_id UUID REFERENCES staff_users(id),
 reply_draft TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE contact_notes (id UUID PRIMARY KEY, message_id UUID NOT NULL REFERENCES contact_messages(id), body TEXT NOT NULL, staff_id UUID NOT NULL REFERENCES staff_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE contact_audits (id UUID PRIMARY KEY, message_id UUID NOT NULL REFERENCES contact_messages(id), staff_id UUID NOT NULL REFERENCES staff_users(id), action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE mvp_site_documents (slug TEXT PRIMARY KEY CHECK(slug='contact'), revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0), draft JSONB, published_revision BIGINT);
CREATE TABLE mvp_site_revisions (slug TEXT NOT NULL REFERENCES mvp_site_documents(slug), revision BIGINT NOT NULL, payload JSONB NOT NULL, author_id UUID NOT NULL REFERENCES staff_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(slug,revision));
ALTER TABLE mvp_site_documents ADD CONSTRAINT site_publication_fk FOREIGN KEY(slug,published_revision) REFERENCES mvp_site_revisions(slug,revision);
CREATE FUNCTION reject_site_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable published site revision'; END $$;
CREATE TRIGGER immutable_site_revision BEFORE UPDATE OR DELETE ON mvp_site_revisions FOR EACH ROW EXECUTE FUNCTION reject_site_revision_mutation();
SQL); }
    public function down(): void { DB::unprepared('DROP TABLE mvp_site_documents CASCADE; DROP TABLE mvp_site_revisions; DROP FUNCTION reject_site_revision_mutation(); DROP TABLE contact_audits; DROP TABLE contact_notes; DROP TABLE contact_messages;'); }
};
