<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Archive Contributions Core Table
        DB::statement("
            CREATE TABLE archive_contributions (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                public_reference VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                submission_id VARCHAR(200) NOT NULL UNIQUE CHECK(CHAR_LENGTH(submission_id) BETWEEN 1 AND 200),
                payload_hash CHAR(64) NOT NULL CHECK(REGEXP_LIKE(payload_hash, '^[a-f0-9]{64}$', 'c')),
                contributor_name VARCHAR(120) NOT NULL,
                contributor_name_ar VARCHAR(120) NULL,
                email VARCHAR(254) NOT NULL,
                contribution_type VARCHAR(32) NOT NULL CHECK(contribution_type IN ('photograph', 'document', 'video_reference', 'oral_history', 'artifact', 'future_concept', 'design', 'other')),
                description MEDIUMTEXT NOT NULL,
                permission_consent BOOLEAN NOT NULL DEFAULT FALSE,
                status VARCHAR(32) NOT NULL DEFAULT 'received' CHECK(status IN ('received', 'under_review', 'accepted', 'declined', 'archived')),
                curator_notes MEDIUMTEXT NOT NULL,
                assigned_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_arc_contrib_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_contrib_staff CHECK (assigned_staff_id IS NULL OR REGEXP_LIKE(assigned_staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_arc_contrib_staff FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX arc_contrib_status ON archive_contributions(status, created_at);');
        DB::statement('CREATE INDEX arc_contrib_email ON archive_contributions(email);');

        // 2. Archive Contribution Files (Private Storage Records)
        DB::statement("
            CREATE TABLE archive_contribution_files (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                contribution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                storage_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                original_filename VARCHAR(255) NOT NULL,
                file_bytes BIGINT NOT NULL CHECK (file_bytes > 0),
                mime_type VARCHAR(100) NOT NULL,
                sha256 CHAR(64) NOT NULL CHECK(REGEXP_LIKE(sha256, '^[a-f0-9]{64}$', 'c')),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_arc_file_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_file_contrib CHECK (REGEXP_LIKE(contribution_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_arc_file_contrib FOREIGN KEY (contribution_id) REFERENCES archive_contributions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX arc_file_contrib ON archive_contribution_files(contribution_id);');

        // 3. Archive Contribution Audits (Curator / Staff Action History)
        DB::statement("
            CREATE TABLE archive_contribution_audits (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                contribution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(64) NOT NULL,
                details MEDIUMTEXT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_arc_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_audit_contrib CHECK (REGEXP_LIKE(contribution_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_audit_staff CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_arc_audit_contrib FOREIGN KEY (contribution_id) REFERENCES archive_contributions(id) ON DELETE CASCADE,
                CONSTRAINT fk_arc_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX arc_audit_contrib ON archive_contribution_audits(contribution_id, created_at);');

        // 4. Archive & Contact Mail Outbox (Bounded Outbox Architecture)
        DB::statement("
            CREATE TABLE archive_mail_outbox (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                purpose VARCHAR(32) NOT NULL CHECK(purpose IN ('archive_ack', 'archive_notify', 'contact_notify')),
                contribution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                contact_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                recipient VARCHAR(254) NOT NULL,
                cc_recipient VARCHAR(254) NULL,
                encrypted_payload MEDIUMTEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'captured_locally', 'accepted', 'failed', 'uncertain', 'cancelled')),
                generation INT NOT NULL DEFAULT 1 CHECK (generation > 0),
                attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
                lease_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                lease_until DATETIME(6) NULL,
                next_attempt_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                accepted_at DATETIME(6) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_arc_mail_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_mail_contrib CHECK (contribution_id IS NULL OR REGEXP_LIKE(contribution_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_arc_mail_contact CHECK (contact_id IS NULL OR REGEXP_LIKE(contact_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_arc_mail_contrib FOREIGN KEY (contribution_id) REFERENCES archive_contributions(id) ON DELETE CASCADE,
                CONSTRAINT fk_arc_mail_contact FOREIGN KEY (contact_id) REFERENCES contact_messages(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX arc_mail_due ON archive_mail_outbox(status, next_attempt_at, created_at);');
    }

    public function down(): void
    {
        throw new RuntimeException(
            'Archive contraction refused: release rollback must use guarded backups; contributions, private file records and mail evidence were not changed.'
        );
    }
};
