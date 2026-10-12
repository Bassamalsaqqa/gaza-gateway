<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE network_revision_control (
                domain VARCHAR(32) PRIMARY KEY CHECK (domain = 'network'),
                revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("INSERT INTO network_revision_control(domain) VALUES ('network');");

        DB::statement("
            CREATE TABLE reference_iana_timezones (
                name VARCHAR(80) PRIMARY KEY
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        $timezones = array_unique(array_merge(\DateTimeZone::listIdentifiers(\DateTimeZone::ALL_WITH_BC), ['UTC']));
        sort($timezones);
        foreach (array_chunk($timezones, 100) as $chunk) {
            $rows = array_map(fn(string $tz) => ['name' => $tz], $chunk);
            DB::table('reference_iana_timezones')->insert($rows);
        }

        DB::unprepared("
            CREATE TRIGGER trg_reference_iana_timezones_no_ins BEFORE INSERT ON reference_iana_timezones
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable timezone lookup';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER trg_reference_iana_timezones_no_upd BEFORE UPDATE ON reference_iana_timezones
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable timezone lookup';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER trg_reference_iana_timezones_no_del BEFORE DELETE ON reference_iana_timezones
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable timezone lookup';
            END;
        ");

        DB::statement("
            CREATE TABLE airports (
                code VARCHAR(3) PRIMARY KEY
                    CHECK (code IN ('GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH')),
                airport_name_en VARCHAR(160) NOT NULL
                    CHECK (airport_name_en <> '' AND airport_name_en = TRIM(airport_name_en)),
                airport_name_ar VARCHAR(160) NOT NULL
                    CHECK (airport_name_ar <> '' AND airport_name_ar = TRIM(airport_name_ar)),
                city_en VARCHAR(160) NOT NULL
                    CHECK (city_en <> '' AND city_en = TRIM(city_en)),
                city_ar VARCHAR(160) NOT NULL
                    CHECK (city_ar <> '' AND city_ar = TRIM(city_ar)),
                country_en VARCHAR(160) NOT NULL
                    CHECK (country_en <> '' AND country_en = TRIM(country_en)),
                country_ar VARCHAR(160) NOT NULL
                    CHECK (country_ar <> '' AND country_ar = TRIM(country_ar)),
                timezone VARCHAR(80) NOT NULL
                    CHECK (timezone <> '' AND timezone = TRIM(timezone)),
                block_minutes INT NOT NULL
                    CHECK (block_minutes BETWEEN 20 AND 600),
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_airports_timezone FOREIGN KEY (timezone)
                    REFERENCES reference_iana_timezones (name) ON UPDATE RESTRICT ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE UNIQUE INDEX airports_code_lower_idx ON airports((LOWER(code)));');

        DB::unprepared("
            CREATE TRIGGER reference_airport_code BEFORE UPDATE ON airports
            FOR EACH ROW
            BEGIN
                IF NEW.code <> OLD.code THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable reference identity';
                END IF;
            END;
        ");

        DB::statement("
            CREATE VIEW routes AS
            SELECT
                CONCAT('GZA-', d.code, '-out') AS id,
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
                CONCAT(d.code, '-GZA-in') AS id,
                d.code AS origin_code,
                'GZA' AS destination_code,
                'in' AS direction,
                d.block_minutes,
                (d.active AND b.active) AS active
            FROM airports d
            CROSS JOIN airports b
            WHERE d.code <> 'GZA' AND b.code = 'GZA';
        ");

        DB::statement("
            CREATE TABLE network_revisions (
                domain VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
                snapshot_json JSON NOT NULL,
                snapshot_bytes MEDIUMTEXT NOT NULL,
                snapshot_hash CHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(domain, revision),
                CONSTRAINT fk_network_rev_domain FOREIGN KEY (domain) REFERENCES network_revision_control(domain),
                CONSTRAINT chk_net_rev_json CHECK (JSON_TYPE(snapshot_json) = 'OBJECT'),
                CONSTRAINT chk_net_rev_valid_bytes CHECK (JSON_VALID(snapshot_bytes) = 1),
                CONSTRAINT chk_net_rev_hash CHECK (REGEXP_LIKE(snapshot_hash, '^[a-f0-9]{64}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER network_snapshot_hash BEFORE INSERT ON network_revisions
            FOR EACH ROW
            BEGIN
                SET NEW.snapshot_hash = LOWER(SHA2(NEW.snapshot_bytes, 256));
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER network_revisions_immutable_upd BEFORE UPDATE ON network_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER network_revisions_immutable_del BEFORE DELETE ON network_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::statement("
            CREATE TABLE network_audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                domain VARCHAR(32) NOT NULL CHECK (domain = 'network'),
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(32) NOT NULL CHECK (action IN ('airport.create', 'airport.patch')),
                outcome VARCHAR(32) NOT NULL CHECK (outcome = 'success'),
                airport_code VARCHAR(3) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_net_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_net_audit_airport FOREIGN KEY (airport_code) REFERENCES airports(code) ON DELETE RESTRICT,
                CONSTRAINT fk_net_audit_rev FOREIGN KEY (domain, revision) REFERENCES network_revisions(domain, revision) ON DELETE RESTRICT,
                CONSTRAINT uq_net_audit_rev UNIQUE (domain, revision),
                CONSTRAINT chk_net_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_net_audit_staff_id CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER network_audit_immutable_upd BEFORE UPDATE ON network_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER network_audit_immutable_del BEFORE DELETE ON network_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS network_audit_events;');
        DB::statement('DROP TABLE IF EXISTS network_revisions;');
        DB::statement('DROP VIEW IF EXISTS routes;');
        DB::statement('DROP TABLE IF EXISTS airports;');
        DB::statement('DROP TABLE IF EXISTS reference_iana_timezones;');
        DB::statement('DROP TABLE IF EXISTS network_revision_control;');
    }
};
