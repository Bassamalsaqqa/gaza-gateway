<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE gallery_documents (
                slug VARCHAR(64) PRIMARY KEY CHECK (slug IN ('default', 'gallery')),
                kind VARCHAR(64) NOT NULL,
                CHECK (kind = slug),
                status VARCHAR(32) NOT NULL CHECK (status IN ('draft', 'published', 'unpublished')),
                current_revision BIGINT NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
                published_revision BIGINT NULL CHECK (published_revision IS NULL OR published_revision > 0),
                draft_revision BIGINT NULL CHECK (draft_revision IS NULL OR draft_revision > 0),
                tombstoned BOOLEAN NOT NULL DEFAULT FALSE,
                tombstoned_at DATETIME(6) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE gallery_revisions (
                slug VARCHAR(64) NOT NULL,
                revision BIGINT NOT NULL CHECK (revision >= 1),
                snapshot_json JSON NOT NULL,
                snapshot_bytes MEDIUMTEXT NOT NULL,
                snapshot_hash CHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(slug, revision),
                CONSTRAINT fk_gal_rev_slug FOREIGN KEY (slug) REFERENCES gallery_documents(slug) ON DELETE RESTRICT,
                CONSTRAINT chk_gal_rev_json CHECK (JSON_TYPE(snapshot_json) = 'OBJECT'),
                CONSTRAINT chk_gal_rev_valid_bytes CHECK (JSON_VALID(snapshot_bytes) = 1),
                CONSTRAINT chk_gal_rev_hash CHECK (REGEXP_LIKE(snapshot_hash, '^[a-f0-9]{64}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_snapshot_hash BEFORE INSERT ON gallery_revisions
            FOR EACH ROW
            BEGIN
                SET NEW.snapshot_hash = LOWER(SHA2(NEW.snapshot_bytes, 256));
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_revisions_immutable_upd BEFORE UPDATE ON gallery_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_revisions_immutable_del BEFORE DELETE ON gallery_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");

        DB::statement("
            CREATE TABLE gallery_published_revisions (
                slug VARCHAR(64) NOT NULL,
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                published_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(slug, revision),
                CONSTRAINT fk_gal_pub_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_gal_pub_rev FOREIGN KEY (slug, revision) REFERENCES gallery_revisions(slug, revision) ON DELETE RESTRICT,
                CONSTRAINT chk_gal_pub_staff_id CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_published_immutable_upd BEFORE UPDATE ON gallery_published_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_published_immutable_del BEFORE DELETE ON gallery_published_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");

        DB::statement("
            ALTER TABLE gallery_documents
                ADD CONSTRAINT gallery_documents_published_rev_fk
                FOREIGN KEY (slug, published_revision) REFERENCES gallery_published_revisions(slug, revision)
                ON DELETE RESTRICT;
        ");

        DB::statement("
            ALTER TABLE gallery_documents
                ADD CONSTRAINT gallery_documents_draft_rev_fk
                FOREIGN KEY (slug, draft_revision) REFERENCES gallery_revisions(slug, revision)
                ON DELETE RESTRICT;
        ");

        DB::statement("
            CREATE TABLE gallery_audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                slug VARCHAR(64) NOT NULL,
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(32) NOT NULL CHECK (action IN ('draft.save', 'draft.discard', 'publish', 'unpublish', 'restore')),
                outcome VARCHAR(32) NOT NULL CHECK (outcome = 'success'),
                restored_from_revision BIGINT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_gal_audit_slug FOREIGN KEY (slug) REFERENCES gallery_documents(slug) ON DELETE RESTRICT,
                CONSTRAINT fk_gal_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_gal_audit_rev FOREIGN KEY (slug, revision) REFERENCES gallery_revisions(slug, revision) ON DELETE RESTRICT,
                CONSTRAINT fk_gal_audit_restored FOREIGN KEY (slug, restored_from_revision) REFERENCES gallery_published_revisions(slug, revision) ON DELETE RESTRICT,
                CONSTRAINT chk_gal_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gal_audit_staff_id CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_gal_audit_restore CHECK ((action = 'restore' AND restored_from_revision IS NOT NULL) OR (action <> 'restore' AND restored_from_revision IS NULL))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_audit_immutable_upd BEFORE UPDATE ON gallery_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER gallery_audit_immutable_del BEFORE DELETE ON gallery_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gallery history is append only';
            END;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS gallery_audit_events;');
        DB::statement('ALTER TABLE gallery_documents DROP FOREIGN KEY gallery_documents_draft_rev_fk;');
        DB::statement('ALTER TABLE gallery_documents DROP FOREIGN KEY gallery_documents_published_rev_fk;');
        DB::statement('DROP TABLE IF EXISTS gallery_published_revisions;');
        DB::statement('DROP TABLE IF EXISTS gallery_revisions;');
        DB::statement('DROP TABLE IF EXISTS gallery_documents;');
    }
};
