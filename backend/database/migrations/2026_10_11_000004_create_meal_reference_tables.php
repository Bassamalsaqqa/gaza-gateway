<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE meal_revision_control (
                domain VARCHAR(32) PRIMARY KEY CHECK (domain = 'meals'),
                revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
                default_meal_id VARCHAR(64) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("INSERT INTO meal_revision_control(domain, revision, default_meal_id) VALUES ('meals', 0, NULL);");

        DB::statement("
            CREATE TABLE meal_options (
                id VARCHAR(64) PRIMARY KEY CHECK (id <> '' AND id = TRIM(id) AND REGEXP_LIKE(id, '^[A-Za-z0-9_-]{1,64}$', 'c')),
                label_en VARCHAR(500) NOT NULL CHECK (label_en <> '' AND label_en = TRIM(label_en)),
                label_ar VARCHAR(500) NOT NULL CHECK (label_ar <> '' AND label_ar = TRIM(label_ar)),
                active BOOLEAN NOT NULL DEFAULT TRUE,
                order_num INT NOT NULL CHECK (order_num >= 0),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('
            ALTER TABLE meal_revision_control
                ADD CONSTRAINT meal_default_fk FOREIGN KEY (default_meal_id) REFERENCES meal_options(id) ON DELETE RESTRICT;
        ');

        DB::unprepared("
            CREATE TRIGGER reference_default_meal_active_ins BEFORE INSERT ON meal_revision_control
            FOR EACH ROW
            BEGIN
                IF NEW.default_meal_id IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM meal_options WHERE id = NEW.default_meal_id AND active = TRUE) THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Default meal must be an active meal';
                    END IF;
                END IF;
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER reference_default_meal_active_upd BEFORE UPDATE ON meal_revision_control
            FOR EACH ROW
            BEGIN
                IF NEW.default_meal_id IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM meal_options WHERE id = NEW.default_meal_id AND active = TRUE) THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Default meal must be an active meal';
                    END IF;
                END IF;
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER reference_meal_options_upd BEFORE UPDATE ON meal_options
            FOR EACH ROW
            BEGIN
                IF NEW.id <> OLD.id THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable reference meal identity';
                END IF;
                IF OLD.active = TRUE AND NEW.active = FALSE THEN
                    IF EXISTS (SELECT 1 FROM meal_revision_control WHERE domain = 'meals' AND default_meal_id = OLD.id) THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Current default meal cannot retire until another active default selected';
                    END IF;
                END IF;
            END;
        ");

        DB::statement("
            CREATE TABLE meal_revisions (
                domain VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
                snapshot_json JSON NOT NULL,
                snapshot_bytes MEDIUMTEXT NOT NULL,
                snapshot_hash CHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(domain, revision),
                CONSTRAINT fk_meal_rev_domain FOREIGN KEY (domain) REFERENCES meal_revision_control(domain),
                CONSTRAINT chk_meal_rev_json CHECK (JSON_TYPE(snapshot_json) = 'OBJECT'),
                CONSTRAINT chk_meal_rev_valid_bytes CHECK (JSON_VALID(snapshot_bytes) = 1),
                CONSTRAINT chk_meal_rev_hash CHECK (REGEXP_LIKE(snapshot_hash, '^[a-f0-9]{64}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER meal_snapshot_hash BEFORE INSERT ON meal_revisions
            FOR EACH ROW
            BEGIN
                SET NEW.snapshot_hash = LOWER(SHA2(NEW.snapshot_bytes, 256));
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER meal_revisions_immutable_upd BEFORE UPDATE ON meal_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER meal_revisions_immutable_del BEFORE DELETE ON meal_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::statement("
            CREATE TABLE meal_audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                domain VARCHAR(32) NOT NULL CHECK (domain = 'meals'),
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(32) NOT NULL CHECK (action IN ('meal.create','meal.patch','meal.reorder','meal.default')),
                outcome VARCHAR(32) NOT NULL CHECK (outcome = 'success'),
                meal_id VARCHAR(64) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_meal_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_meal_audit_meal FOREIGN KEY (meal_id) REFERENCES meal_options(id) ON DELETE RESTRICT,
                CONSTRAINT fk_meal_audit_rev FOREIGN KEY (domain, revision) REFERENCES meal_revisions(domain, revision) ON DELETE RESTRICT,
                CONSTRAINT uq_meal_audit_rev UNIQUE (domain, revision),
                CONSTRAINT chk_meal_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_meal_audit_staff_id CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER meal_audit_immutable_upd BEFORE UPDATE ON meal_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER meal_audit_immutable_del BEFORE DELETE ON meal_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS meal_audit_events;');
        DB::statement('DROP TABLE IF EXISTS meal_revisions;');
        DB::statement('ALTER TABLE meal_revision_control DROP FOREIGN KEY meal_default_fk;');
        DB::statement('DROP TABLE IF EXISTS meal_options;');
        DB::statement('DROP TABLE IF EXISTS meal_revision_control;');
    }
};
