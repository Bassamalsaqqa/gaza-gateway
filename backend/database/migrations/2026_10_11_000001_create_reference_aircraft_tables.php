<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Revision control singleton
        DB::statement('
            CREATE TABLE reference_revision_control (
                domain VARCHAR(32) PRIMARY KEY,
                revision BIGINT NOT NULL DEFAULT 0,
                CONSTRAINT chk_ref_rev_domain CHECK (domain = \'fleet\'),
                CONSTRAINT chk_ref_rev_revision CHECK (revision BETWEEN 0 AND 9007199254740991)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        DB::statement('
            INSERT INTO reference_revision_control (domain, revision) VALUES (\'fleet\', 0);
        ');

        // 2. Consolidated aircraft table: physical layout columns directly on aircraft
        DB::statement('
            CREATE TABLE aircraft (
                id VARCHAR(64) PRIMARY KEY,
                model VARCHAR(120) NOT NULL,
                registration_normalized VARCHAR(32) NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                `rows` INT NOT NULL,
                letters_json JSON NOT NULL,
                aisle_after INT NOT NULL,
                zones_json JSON NOT NULL,
                extra_legroom_rows_json JSON NOT NULL,
                unavailable_json JSON NOT NULL,
                capacity INT GENERATED ALWAYS AS (`rows` * JSON_LENGTH(letters_json) - JSON_LENGTH(unavailable_json)) STORED NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT uq_aircraft_registration UNIQUE (registration_normalized),
                CONSTRAINT chk_aircraft_id CHECK (CHAR_LENGTH(id) > 0 AND id = TRIM(id)),
                CONSTRAINT chk_aircraft_model CHECK (CHAR_LENGTH(model) > 0 AND model = TRIM(model)),
                CONSTRAINT chk_aircraft_reg CHECK (
                    registration_normalized = UPPER(TRIM(registration_normalized))
                    AND REGEXP_LIKE(registration_normalized, \'^[A-Z0-9]{1,4}-[A-Z0-9]{1,5}$\', \'c\')
                ),
                CONSTRAINT chk_aircraft_rows CHECK (`rows` BETWEEN 1 AND 60)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        // Geometry validation triggers on aircraft
        DB::unprepared('
            CREATE TRIGGER trg_aircraft_validate_geometry_ins
            BEFORE INSERT ON aircraft
            FOR EACH ROW
            BEGIN
                DECLARE n INT;
                DECLARE i INT DEFAULT 0;
                DECLARE val VARCHAR(32);
                DECLARE seen_letters TEXT DEFAULT \',\';
                DECLARE next_row INT DEFAULT 1;
                DECLARE seen_cabins TEXT DEFAULT \',\';
                DECLARE zone_id VARCHAR(32);
                DECLARE f_row INT;
                DECLARE l_row INT;
                DECLARE seen_legroom TEXT DEFAULT \',\';
                DECLARE r_val INT;
                DECLARE seen_unavail TEXT DEFAULT \',\';
                DECLARE u_seat VARCHAR(32);
                DECLARE seat_letter VARCHAR(8);
                DECLARE seat_row INT;

                IF JSON_TYPE(NEW.letters_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.zones_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.extra_legroom_rows_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.unavailable_json) != \'ARRAY\' THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET n = JSON_LENGTH(NEW.letters_json);
                IF n < 2 OR n > 10 OR NEW.aisle_after < 1 OR NEW.aisle_after >= n THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                WHILE i < n DO
                    SET val = JSON_UNQUOTE(JSON_EXTRACT(NEW.letters_json, CONCAT(\'$[\', i, \']\')));
                    IF NOT REGEXP_LIKE(val, \'^[A-Z]$\', \'c\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', val, \',\'), seen_letters) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_letters = CONCAT(seen_letters, val, \',\');
                    SET i = i + 1;
                END WHILE;

                SET n = JSON_LENGTH(NEW.zones_json);
                IF n < 1 OR n > 3 THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET i = 0;
                WHILE i < n DO
                    IF JSON_LENGTH(JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \']\'))) != 3 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET zone_id = JSON_UNQUOTE(JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].id\')));
                    SET f_row = JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].firstRow\'));
                    SET l_row = JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].lastRow\'));
                    IF zone_id NOT IN (\'economy\', \'premium\', \'business\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', zone_id, \',\'), seen_cabins) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_cabins = CONCAT(seen_cabins, zone_id, \',\');
                    IF f_row IS NULL OR l_row IS NULL OR f_row != next_row OR l_row < f_row OR l_row > NEW.`rows` THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET next_row = l_row + 1;
                    SET i = i + 1;
                END WHILE;

                IF next_row != NEW.`rows` + 1 THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET n = JSON_LENGTH(NEW.extra_legroom_rows_json);
                SET i = 0;
                WHILE i < n DO
                    SET r_val = JSON_EXTRACT(NEW.extra_legroom_rows_json, CONCAT(\'$[\', i, \']\'));
                    IF r_val IS NULL OR r_val < 1 OR r_val > NEW.`rows` THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', r_val, \',\'), seen_legroom) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_legroom = CONCAT(seen_legroom, r_val, \',\');
                    SET i = i + 1;
                END WHILE;

                SET n = JSON_LENGTH(NEW.unavailable_json);
                SET i = 0;
                WHILE i < n DO
                    SET u_seat = JSON_UNQUOTE(JSON_EXTRACT(NEW.unavailable_json, CONCAT(\'$[\', i, \']\')));
                    IF NOT REGEXP_LIKE(u_seat, \'^[1-9][0-9]?[A-Z]$\', \'c\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seat_letter = RIGHT(u_seat, 1);
                    SET seat_row = CAST(LEFT(u_seat, CHAR_LENGTH(u_seat) - 1) AS UNSIGNED);
                    IF seat_row > NEW.`rows` OR LOCATE(CONCAT(\',\', seat_letter, \',\'), seen_letters) = 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', u_seat, \',\'), seen_unavail) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_unavail = CONCAT(seen_unavail, u_seat, \',\');
                    SET i = i + 1;
                END WHILE;
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_aircraft_validate_geometry_upd
            BEFORE UPDATE ON aircraft
            FOR EACH ROW
            BEGIN
                DECLARE n INT;
                DECLARE i INT DEFAULT 0;
                DECLARE val VARCHAR(32);
                DECLARE seen_letters TEXT DEFAULT \',\';
                DECLARE next_row INT DEFAULT 1;
                DECLARE seen_cabins TEXT DEFAULT \',\';
                DECLARE zone_id VARCHAR(32);
                DECLARE f_row INT;
                DECLARE l_row INT;
                DECLARE seen_legroom TEXT DEFAULT \',\';
                DECLARE r_val INT;
                DECLARE seen_unavail TEXT DEFAULT \',\';
                DECLARE u_seat VARCHAR(32);
                DECLARE seat_letter VARCHAR(8);
                DECLARE seat_row INT;

                IF NEW.id != OLD.id THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Immutable reference identity\';
                END IF;

                IF JSON_TYPE(NEW.letters_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.zones_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.extra_legroom_rows_json) != \'ARRAY\'
                    OR JSON_TYPE(NEW.unavailable_json) != \'ARRAY\' THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET n = JSON_LENGTH(NEW.letters_json);
                IF n < 2 OR n > 10 OR NEW.aisle_after < 1 OR NEW.aisle_after >= n THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                WHILE i < n DO
                    SET val = JSON_UNQUOTE(JSON_EXTRACT(NEW.letters_json, CONCAT(\'$[\', i, \']\')));
                    IF NOT REGEXP_LIKE(val, \'^[A-Z]$\', \'c\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', val, \',\'), seen_letters) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_letters = CONCAT(seen_letters, val, \',\');
                    SET i = i + 1;
                END WHILE;

                SET n = JSON_LENGTH(NEW.zones_json);
                IF n < 1 OR n > 3 THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET i = 0;
                WHILE i < n DO
                    IF JSON_LENGTH(JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \']\'))) != 3 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET zone_id = JSON_UNQUOTE(JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].id\')));
                    SET f_row = JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].firstRow\'));
                    SET l_row = JSON_EXTRACT(NEW.zones_json, CONCAT(\'$[\', i, \'].lastRow\'));
                    IF zone_id NOT IN (\'economy\', \'premium\', \'business\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', zone_id, \',\'), seen_cabins) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_cabins = CONCAT(seen_cabins, zone_id, \',\');
                    IF f_row IS NULL OR l_row IS NULL OR f_row != next_row OR l_row < f_row OR l_row > NEW.`rows` THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET next_row = l_row + 1;
                    SET i = i + 1;
                END WHILE;

                IF next_row != NEW.`rows` + 1 THEN
                    SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                END IF;

                SET n = JSON_LENGTH(NEW.extra_legroom_rows_json);
                SET i = 0;
                WHILE i < n DO
                    SET r_val = JSON_EXTRACT(NEW.extra_legroom_rows_json, CONCAT(\'$[\', i, \']\'));
                    IF r_val IS NULL OR r_val < 1 OR r_val > NEW.`rows` THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', r_val, \',\'), seen_legroom) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_legroom = CONCAT(seen_legroom, r_val, \',\');
                    SET i = i + 1;
                END WHILE;

                SET n = JSON_LENGTH(NEW.unavailable_json);
                SET i = 0;
                WHILE i < n DO
                    SET u_seat = JSON_UNQUOTE(JSON_EXTRACT(NEW.unavailable_json, CONCAT(\'$[\', i, \']\')));
                    IF NOT REGEXP_LIKE(u_seat, \'^[1-9][0-9]?[A-Z]$\', \'c\') THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seat_letter = RIGHT(u_seat, 1);
                    SET seat_row = CAST(LEFT(u_seat, CHAR_LENGTH(u_seat) - 1) AS UNSIGNED);
                    IF seat_row > NEW.`rows` OR LOCATE(CONCAT(\',\', seat_letter, \',\'), seen_letters) = 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    IF LOCATE(CONCAT(\',\', u_seat, \',\'), seen_unavail) > 0 THEN
                        SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Invalid reference layout\';
                    END IF;
                    SET seen_unavail = CONCAT(seen_unavail, u_seat, \',\');
                    SET i = i + 1;
                END WHILE;
            END;
        ');

        // 3. Read-compatibility VIEW seat_layouts over aircraft
        DB::statement('
            CREATE VIEW seat_layouts AS
            SELECT
                id AS aircraft_id,
                `rows`,
                letters_json,
                aisle_after,
                zones_json,
                extra_legroom_rows_json,
                unavailable_json,
                capacity,
                created_at,
                updated_at
            FROM aircraft;
        ');

        // 4. Reference revisions
        DB::statement('
            CREATE TABLE reference_revisions (
                domain VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL,
                snapshot_json JSON NOT NULL,
                snapshot_bytes LONGTEXT NOT NULL,
                snapshot_hash CHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL,
                PRIMARY KEY (domain, revision),
                CONSTRAINT fk_ref_rev_domain FOREIGN KEY (domain) REFERENCES reference_revision_control (domain) ON DELETE RESTRICT,
                CONSTRAINT chk_ref_rev_num CHECK (revision BETWEEN 1 AND 9007199254740991),
                CONSTRAINT chk_ref_rev_hash CHECK (REGEXP_LIKE(snapshot_hash, \'^[a-f0-9]{64}$\', \'c\'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_reference_revisions_digest_ins
            BEFORE INSERT ON reference_revisions
            FOR EACH ROW
            BEGIN
                SET NEW.snapshot_hash = LOWER(SHA2(NEW.snapshot_bytes, 256));
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_reference_revisions_immutable_upd
            BEFORE UPDATE ON reference_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Reference history is append only\';
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_reference_revisions_immutable_del
            BEFORE DELETE ON reference_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Reference history is append only\';
            END;
        ');

        // 5. Reference audit events
        DB::statement('
            CREATE TABLE reference_audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                domain VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(32) NOT NULL,
                outcome VARCHAR(32) NOT NULL,
                aircraft_id VARCHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL,
                CONSTRAINT uq_reference_audit_domain_rev UNIQUE (domain, revision),
                CONSTRAINT fk_reference_audit_rev FOREIGN KEY (domain, revision) REFERENCES reference_revisions (domain, revision) ON DELETE RESTRICT,
                CONSTRAINT fk_reference_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE RESTRICT,
                CONSTRAINT fk_reference_audit_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft (id) ON DELETE RESTRICT,
                CONSTRAINT chk_ref_audit_id_uuid CHECK (REGEXP_LIKE(id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_ref_audit_staff_uuid CHECK (REGEXP_LIKE(staff_id, \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\', \'c\')),
                CONSTRAINT chk_ref_audit_domain CHECK (domain = \'fleet\'),
                CONSTRAINT chk_ref_audit_action CHECK (action IN (\'aircraft.create\', \'aircraft.patch\', \'layout.put\')),
                CONSTRAINT chk_ref_audit_outcome CHECK (outcome = \'success\')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_reference_audit_immutable_upd
            BEFORE UPDATE ON reference_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Reference history is append only\';
            END;
        ');

        DB::unprepared('
            CREATE TRIGGER trg_reference_audit_immutable_del
            BEFORE DELETE ON reference_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = \'Reference history is append only\';
            END;
        ');
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reference_audit_immutable_del;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reference_audit_immutable_upd;');
        DB::statement('DROP TABLE IF EXISTS reference_audit_events;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reference_revisions_immutable_del;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reference_revisions_immutable_upd;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reference_revisions_digest_ins;');
        DB::statement('DROP TABLE IF EXISTS reference_revisions;');
        DB::statement('DROP VIEW IF EXISTS seat_layouts;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_aircraft_validate_geometry_upd;');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_aircraft_validate_geometry_ins;');
        DB::statement('DROP TABLE IF EXISTS aircraft;');
        DB::statement('DROP TABLE IF EXISTS reference_revision_control;');
    }
};
