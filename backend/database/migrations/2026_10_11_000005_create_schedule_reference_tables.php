<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE schedule_revision_control (
                domain VARCHAR(32) PRIMARY KEY CHECK (domain = 'schedules'),
                revision BIGINT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("INSERT INTO schedule_revision_control(domain) VALUES ('schedules');");

        DB::statement("
            CREATE TABLE schedules (
                id VARCHAR(160) PRIMARY KEY
                    CHECK (id <> '' AND (OCTET_LENGTH(CONVERT(id USING utf16)) / 2) <= 160 AND LOCATE(CHAR(0), id) = 0),
                number VARCHAR(32) NOT NULL
                    CHECK (number <> '' AND REGEXP_LIKE(number, '^[A-Z]{2}\\\\s?[0-9]{1,4}$', 'c')),
                direction VARCHAR(3) NOT NULL
                    CHECK (direction IN ('out', 'in')),
                destination VARCHAR(3) NOT NULL
                    CHECK (destination <> 'GZA'),
                days_json JSON NOT NULL
                    CHECK (JSON_TYPE(days_json) = 'ARRAY' AND JSON_LENGTH(days_json) BETWEEN 1 AND 7),
                depart_time VARCHAR(5) NOT NULL
                    CHECK (REGEXP_LIKE(depart_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')),
                arrive_time VARCHAR(5) NOT NULL
                    CHECK (REGEXP_LIKE(arrive_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')),
                aircraft VARCHAR(120) NOT NULL
                    CHECK (aircraft <> '' AND aircraft = TRIM(aircraft)),
                aircraft_id VARCHAR(64) NULL
                    CHECK (aircraft_id IS NULL OR REGEXP_LIKE(aircraft_id, '^[A-Za-z0-9_-]{1,64}$', 'c')),
                from_date DATE NOT NULL,
                until_date DATE NOT NULL,
                CHECK (from_date <= until_date),
                active BOOLEAN NOT NULL DEFAULT TRUE,
                exceptions_json JSON NOT NULL
                    CHECK (JSON_TYPE(exceptions_json) = 'ARRAY' AND JSON_LENGTH(exceptions_json) <= 100),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_schedules_destination FOREIGN KEY (destination) REFERENCES airports(code) ON DELETE RESTRICT,
                CONSTRAINT fk_schedules_aircraft_id FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER reference_schedule_validation_ins BEFORE INSERT ON schedules
            FOR EACH ROW
            BEGIN
                DECLARE num_days INT;
                DECLARE i INT DEFAULT 0;
                DECLARE day_val INT;
                DECLARE seen_days VARCHAR(64) DEFAULT ',';

                DECLARE num_exc INT;
                DECLARE j INT DEFAULT 0;
                DECLARE exc_elem JSON;
                DECLARE exc_id VARCHAR(255);
                DECLARE exc_date_str VARCHAR(32);
                DECLARE exc_date DATE;
                DECLARE exc_kind VARCHAR(32);
                DECLARE exc_detail TEXT;
                DECLARE exc_effect JSON;
                DECLARE weekday_val INT;

                DECLARE seen_exc_ids TEXT DEFAULT ',';
                DECLARE op_cancelled_dates TEXT DEFAULT ',';
                DECLARE op_extra_dates TEXT DEFAULT ',';
                DECLARE op_time_dates TEXT DEFAULT ',';
                DECLARE op_aircraft_dates TEXT DEFAULT ',';

                SET num_days = JSON_LENGTH(NEW.days_json);
                IF num_days < 1 OR num_days > 7 THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                END IF;

                WHILE i < num_days DO
                    IF JSON_TYPE(JSON_EXTRACT(NEW.days_json, CONCAT('$[', i, ']'))) != 'INTEGER' THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                    END IF;
                    SET day_val = JSON_EXTRACT(NEW.days_json, CONCAT('$[', i, ']'));
                    IF day_val < 0 OR day_val > 6 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                    END IF;
                    IF LOCATE(CONCAT(',', day_val, ','), seen_days) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate schedule day';
                    END IF;
                    SET seen_days = CONCAT(seen_days, day_val, ',');
                    SET i = i + 1;
                END WHILE;

                SET num_exc = JSON_LENGTH(NEW.exceptions_json);
                WHILE j < num_exc DO
                    SET exc_elem = JSON_EXTRACT(NEW.exceptions_json, CONCAT('$[', j, ']'));
                    IF JSON_TYPE(exc_elem) != 'OBJECT' THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule exception must be an object';
                    END IF;

                    SET exc_id = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.id'));
                    SET exc_date_str = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.date'));
                    SET exc_kind = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.kind'));
                    SET exc_detail = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.detail'));
                    SET exc_effect = JSON_EXTRACT(exc_elem, '$.effect');

                    IF exc_id IS NULL OR exc_id = '' OR CHAR_LENGTH(exc_id) > 160 OR LOCATE(CHAR(0), exc_id) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception id';
                    END IF;
                    IF LOCATE(CONCAT(',', exc_id, ','), seen_exc_ids) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate schedule exception id';
                    END IF;
                    SET seen_exc_ids = CONCAT(seen_exc_ids, exc_id, ',');

                    IF exc_date_str IS NULL OR NOT REGEXP_LIKE(exc_date_str, '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$', 'c') THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception date format';
                    END IF;

                    SET exc_date = STR_TO_DATE(exc_date_str, '%Y-%m-%d');
                    IF exc_date IS NULL OR DATE_FORMAT(exc_date, '%Y-%m-%d') != exc_date_str THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception calendar date';
                    END IF;

                    IF exc_kind NOT IN ('cancelled', 'time', 'aircraft', 'extra') THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception kind';
                    END IF;

                    IF exc_detail IS NULL OR CHAR_LENGTH(exc_detail) > 500 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception detail';
                    END IF;

                    IF exc_effect IS NOT NULL AND JSON_TYPE(exc_effect) != 'NULL' THEN
                        IF JSON_TYPE(exc_effect) != 'OBJECT' THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule exception effect must be an object';
                        END IF;

                        IF exc_date < NEW.from_date OR exc_date > NEW.until_date THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exception date out of active range';
                        END IF;

                        SET weekday_val = DAYOFWEEK(exc_date) - 1;

                        IF exc_kind = 'cancelled' THEN
                            IF JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.cancelled')) != 'true' THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid cancelled exception effect';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelled effect only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operational cancelled cannot coexist with other effects';
                            END IF;
                            SET op_cancelled_dates = CONCAT(op_cancelled_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'extra' THEN
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.departTime') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.departTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid extra departTime';
                            END IF;
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.arriveTime') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.arriveTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid extra arriveTime';
                            END IF;
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.aircraftId') != JSON_CONTAINS_PATH(exc_effect, 'one', '$.aircraft') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extra aircraft and aircraftId must be supplied together';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extra effect only on non-operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operational extra cannot coexist with other effects';
                            END IF;
                            SET op_extra_dates = CONCAT(op_extra_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'time' THEN
                            IF NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.departTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')
                               OR NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.arriveTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid time effect departTime or arriveTime';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Time adjustment only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Multiple time adjustments or coexistence conflict';
                            END IF;
                            SET op_time_dates = CONCAT(op_time_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'aircraft' THEN
                            IF JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraftId')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraftId')) = ''
                               OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraft')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraft')) = '' THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Aircraft effect requires aircraftId and aircraft';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Aircraft adjustment only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Multiple aircraft adjustments or coexistence conflict';
                            END IF;
                            SET op_aircraft_dates = CONCAT(op_aircraft_dates, exc_date_str, ',');
                        END IF;
                    END IF;

                    SET j = j + 1;
                END WHILE;
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER reference_schedule_validation_upd BEFORE UPDATE ON schedules
            FOR EACH ROW
            BEGIN
                DECLARE num_days INT;
                DECLARE i INT DEFAULT 0;
                DECLARE day_val INT;
                DECLARE seen_days VARCHAR(64) DEFAULT ',';

                DECLARE num_exc INT;
                DECLARE j INT DEFAULT 0;
                DECLARE exc_elem JSON;
                DECLARE exc_id VARCHAR(255);
                DECLARE exc_date_str VARCHAR(32);
                DECLARE exc_date DATE;
                DECLARE exc_kind VARCHAR(32);
                DECLARE exc_detail TEXT;
                DECLARE exc_effect JSON;
                DECLARE weekday_val INT;

                DECLARE seen_exc_ids TEXT DEFAULT ',';
                DECLARE op_cancelled_dates TEXT DEFAULT ',';
                DECLARE op_extra_dates TEXT DEFAULT ',';
                DECLARE op_time_dates TEXT DEFAULT ',';
                DECLARE op_aircraft_dates TEXT DEFAULT ',';

                IF NEW.id <> OLD.id
                   OR NEW.destination <> OLD.destination
                   OR NEW.direction <> OLD.direction THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable reference schedule identity';
                END IF;

                SET num_days = JSON_LENGTH(NEW.days_json);
                IF num_days < 1 OR num_days > 7 THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                END IF;

                WHILE i < num_days DO
                    IF JSON_TYPE(JSON_EXTRACT(NEW.days_json, CONCAT('$[', i, ']'))) != 'INTEGER' THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                    END IF;
                    SET day_val = JSON_EXTRACT(NEW.days_json, CONCAT('$[', i, ']'));
                    IF day_val < 0 OR day_val > 6 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule days specification';
                    END IF;
                    IF LOCATE(CONCAT(',', day_val, ','), seen_days) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate schedule day';
                    END IF;
                    SET seen_days = CONCAT(seen_days, day_val, ',');
                    SET i = i + 1;
                END WHILE;

                SET num_exc = JSON_LENGTH(NEW.exceptions_json);
                WHILE j < num_exc DO
                    SET exc_elem = JSON_EXTRACT(NEW.exceptions_json, CONCAT('$[', j, ']'));
                    IF JSON_TYPE(exc_elem) != 'OBJECT' THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule exception must be an object';
                    END IF;

                    SET exc_id = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.id'));
                    SET exc_date_str = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.date'));
                    SET exc_kind = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.kind'));
                    SET exc_detail = JSON_UNQUOTE(JSON_EXTRACT(exc_elem, '$.detail'));
                    SET exc_effect = JSON_EXTRACT(exc_elem, '$.effect');

                    IF exc_id IS NULL OR exc_id = '' OR CHAR_LENGTH(exc_id) > 160 OR LOCATE(CHAR(0), exc_id) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception id';
                    END IF;
                    IF LOCATE(CONCAT(',', exc_id, ','), seen_exc_ids) > 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate schedule exception id';
                    END IF;
                    SET seen_exc_ids = CONCAT(seen_exc_ids, exc_id, ',');

                    IF exc_date_str IS NULL OR NOT REGEXP_LIKE(exc_date_str, '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$', 'c') THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception date format';
                    END IF;

                    SET exc_date = STR_TO_DATE(exc_date_str, '%Y-%m-%d');
                    IF exc_date IS NULL OR DATE_FORMAT(exc_date, '%Y-%m-%d') != exc_date_str THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception calendar date';
                    END IF;

                    IF exc_kind NOT IN ('cancelled', 'time', 'aircraft', 'extra') THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception kind';
                    END IF;

                    IF exc_detail IS NULL OR CHAR_LENGTH(exc_detail) > 500 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid schedule exception detail';
                    END IF;

                    IF exc_effect IS NOT NULL AND JSON_TYPE(exc_effect) != 'NULL' THEN
                        IF JSON_TYPE(exc_effect) != 'OBJECT' THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule exception effect must be an object';
                        END IF;

                        IF exc_date < NEW.from_date OR exc_date > NEW.until_date THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exception date out of active range';
                        END IF;

                        SET weekday_val = DAYOFWEEK(exc_date) - 1;

                        IF exc_kind = 'cancelled' THEN
                            IF JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.cancelled')) != 'true' THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid cancelled exception effect';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelled effect only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operational cancelled cannot coexist with other effects';
                            END IF;
                            SET op_cancelled_dates = CONCAT(op_cancelled_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'extra' THEN
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.departTime') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.departTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid extra departTime';
                            END IF;
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.arriveTime') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.arriveTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid extra arriveTime';
                            END IF;
                            IF JSON_CONTAINS_PATH(exc_effect, 'one', '$.aircraftId') != JSON_CONTAINS_PATH(exc_effect, 'one', '$.aircraft') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extra aircraft and aircraftId must be supplied together';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extra effect only on non-operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operational extra cannot coexist with other effects';
                            END IF;
                            SET op_extra_dates = CONCAT(op_extra_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'time' THEN
                            IF NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.departTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c')
                               OR NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.arriveTime')), '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'c') THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid time effect departTime or arriveTime';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Time adjustment only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_time_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Multiple time adjustments or coexistence conflict';
                            END IF;
                            SET op_time_dates = CONCAT(op_time_dates, exc_date_str, ',');

                        ELSEIF exc_kind = 'aircraft' THEN
                            IF JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraftId')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraftId')) = ''
                               OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraft')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(exc_effect, '$.aircraft')) = '' THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Aircraft effect requires aircraftId and aircraft';
                            END IF;
                            IF LOCATE(CONCAT(',', weekday_val, ','), seen_days) = 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Aircraft adjustment only on operating days';
                            END IF;
                            IF LOCATE(CONCAT(',', exc_date_str, ','), op_cancelled_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_extra_dates) > 0
                               OR LOCATE(CONCAT(',', exc_date_str, ','), op_aircraft_dates) > 0 THEN
                                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Multiple aircraft adjustments or coexistence conflict';
                            END IF;
                            SET op_aircraft_dates = CONCAT(op_aircraft_dates, exc_date_str, ',');
                        END IF;
                    END IF;

                    SET j = j + 1;
                END WHILE;
            END;
        ");

        DB::statement("
            CREATE TABLE schedule_revisions (
                domain VARCHAR(32) NOT NULL,
                revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
                snapshot_json JSON NOT NULL,
                snapshot_bytes MEDIUMTEXT NOT NULL,
                snapshot_hash CHAR(64) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY(domain, revision),
                CONSTRAINT fk_sched_rev_domain FOREIGN KEY (domain) REFERENCES schedule_revision_control(domain),
                CONSTRAINT chk_sched_rev_json CHECK (JSON_TYPE(snapshot_json) = 'OBJECT'),
                CONSTRAINT chk_sched_rev_valid_bytes CHECK (JSON_VALID(snapshot_bytes) = 1),
                CONSTRAINT chk_sched_rev_hash CHECK (REGEXP_LIKE(snapshot_hash, '^[a-f0-9]{64}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER schedule_snapshot_hash BEFORE INSERT ON schedule_revisions
            FOR EACH ROW
            BEGIN
                SET NEW.snapshot_hash = LOWER(SHA2(NEW.snapshot_bytes, 256));
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER schedule_revisions_immutable_upd BEFORE UPDATE ON schedule_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER schedule_revisions_immutable_del BEFORE DELETE ON schedule_revisions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::statement("
            CREATE TABLE schedule_audit_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                domain VARCHAR(32) NOT NULL CHECK (domain = 'schedules'),
                revision BIGINT NOT NULL,
                staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                action VARCHAR(32) NOT NULL CHECK (action IN ('schedule.create', 'schedule.patch')),
                outcome VARCHAR(32) NOT NULL CHECK (outcome = 'success'),
                schedule_id VARCHAR(160) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT fk_sched_audit_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
                CONSTRAINT fk_sched_audit_sched FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE RESTRICT,
                CONSTRAINT fk_sched_audit_rev FOREIGN KEY (domain, revision) REFERENCES schedule_revisions(domain, revision) ON DELETE RESTRICT,
                CONSTRAINT uq_sched_audit_rev UNIQUE (domain, revision),
                CONSTRAINT chk_sched_audit_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_sched_audit_staff_id CHECK (REGEXP_LIKE(staff_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::unprepared("
            CREATE TRIGGER schedule_audit_immutable_upd BEFORE UPDATE ON schedule_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");

        DB::unprepared("
            CREATE TRIGGER schedule_audit_immutable_del BEFORE DELETE ON schedule_audit_events
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reference history is append only';
            END;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS schedule_audit_events;');
        DB::statement('DROP TABLE IF EXISTS schedule_revisions;');
        DB::statement('DROP TABLE IF EXISTS schedules;');
        DB::statement('DROP TABLE IF EXISTS schedule_revision_control;');
    }
};
