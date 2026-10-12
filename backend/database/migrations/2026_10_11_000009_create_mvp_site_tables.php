<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE contact_messages (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                submission_id VARCHAR(200) NOT NULL UNIQUE CHECK(CHAR_LENGTH(submission_id) BETWEEN 1 AND 200),
                payload_hash CHAR(64) NOT NULL CHECK(REGEXP_LIKE(payload_hash, '^[a-f0-9]{64}$', 'c')),
                sender_name TEXT NOT NULL,
                email VARCHAR(254) NOT NULL,
                topic VARCHAR(32) NOT NULL CHECK(topic IN ('booking','baggage','accessibility','archive','media','other')),
                message MEDIUMTEXT NOT NULL,
                language VARCHAR(8) NOT NULL CHECK(language IN ('en','ar')),
                booking_ref VARCHAR(32) NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'new' CHECK(status IN ('new','open','resolved','spam')),
                assigned_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                reply_draft MEDIUMTEXT NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_contact_msg_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_contact_msg_staff CHECK (assigned_staff_id IS NULL OR REGEXP_LIKE(assigned_staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_contact_msg_staff FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE contact_notes (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                body MEDIUMTEXT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_contact_notes_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_contact_notes_msg CHECK (REGEXP_LIKE(message_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_contact_notes_staff CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_contact_notes_msg FOREIGN KEY (message_id) REFERENCES contact_messages(id) ON DELETE RESTRICT,
                CONSTRAINT fk_contact_notes_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE contact_audits (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_contact_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_contact_audit_msg CHECK (REGEXP_LIKE(message_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_contact_audit_staff CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_contact_audit_msg FOREIGN KEY (message_id) REFERENCES contact_messages(id) ON DELETE RESTRICT,
                CONSTRAINT fk_contact_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_site_documents (
                slug VARCHAR(32) PRIMARY KEY CHECK(slug = 'contact'),
                revision BIGINT NOT NULL DEFAULT 0 CHECK(revision >= 0),
                draft JSON NULL,
                published_revision BIGINT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("INSERT INTO mvp_site_documents (slug, revision, draft, published_revision) VALUES ('contact', 0, NULL, NULL);");

        DB::statement("
            CREATE TABLE mvp_site_revisions (
                slug VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL,
                payload JSON NOT NULL,
                author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(slug, revision),
                CONSTRAINT chk_site_rev_author CHECK (REGEXP_LIKE(author_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_site_rev_slug FOREIGN KEY (slug) REFERENCES mvp_site_documents(slug) ON DELETE RESTRICT,
                CONSTRAINT fk_site_rev_author FOREIGN KEY (author_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            ALTER TABLE mvp_site_documents
                ADD CONSTRAINT site_publication_fk
                FOREIGN KEY (slug, published_revision) REFERENCES mvp_site_revisions(slug, revision)
                ON DELETE RESTRICT;
        ");

        DB::unprepared("
            CREATE TRIGGER immutable_site_revision_upd BEFORE UPDATE ON mvp_site_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable published site revision';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER immutable_site_revision_del BEFORE DELETE ON mvp_site_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable published site revision';
            END;
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE mvp_site_documents DROP FOREIGN KEY site_publication_fk;');
        DB::statement('DROP TABLE IF EXISTS mvp_site_revisions;');
        DB::statement('DROP TABLE IF EXISTS mvp_site_documents;');
        DB::statement('DROP TABLE IF EXISTS contact_audits;');
        DB::statement('DROP TABLE IF EXISTS contact_notes;');
        DB::statement('DROP TABLE IF EXISTS contact_messages;');
    }
};
