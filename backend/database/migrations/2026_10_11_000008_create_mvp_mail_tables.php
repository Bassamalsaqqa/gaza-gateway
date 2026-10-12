<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE mvp_mail_sentinel (
                id SMALLINT PRIMARY KEY CHECK (id = 1)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
        DB::statement('INSERT INTO mvp_mail_sentinel (id) VALUES (1);');

        DB::statement("
            CREATE TABLE mvp_mail_settings (
                id SMALLINT PRIMARY KEY CHECK (id = 1),
                revision BIGINT NOT NULL CHECK (revision > 0),
                encrypted_config MEDIUMTEXT NOT NULL,
                updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_mail_settings_user CHECK (REGEXP_LIKE(updated_by, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mail_settings_user FOREIGN KEY (updated_by) REFERENCES staff_users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_mail_messages (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                intent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
                reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('booking', 'test')),
                encrypted_payload MEDIUMTEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'captured_locally', 'accepted', 'failed', 'uncertain', 'cancelled')),
                generation INT NOT NULL DEFAULT 1 CHECK (generation > 0),
                attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
                lease_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                lease_until DATETIME(6) NULL,
                next_attempt_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                accepted_at DATETIME(6) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_mail_msg_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_msg_intent CHECK (intent_id IS NULL OR REGEXP_LIKE(intent_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_msg_res CHECK (reservation_id IS NULL OR REGEXP_LIKE(reservation_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_msg_lease CHECK (lease_id IS NULL OR REGEXP_LIKE(lease_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mvp_mail_processing CHECK ((status = 'processing' AND lease_id IS NOT NULL AND lease_until IS NOT NULL) OR (status <> 'processing' AND lease_id IS NULL AND lease_until IS NULL)),
                CONSTRAINT fk_mail_msg_intent FOREIGN KEY (intent_id) REFERENCES mvp_reservation_mail_intents(id) ON DELETE RESTRICT,
                CONSTRAINT fk_mail_msg_res FOREIGN KEY (reservation_id) REFERENCES mvp_reservations(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX mvp_mail_due ON mvp_mail_messages(status, next_attempt_at, created_at);');

        DB::statement("
            CREATE TABLE mvp_mail_attempts (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                generation INT NOT NULL,
                attempt INT NOT NULL,
                settings_revision BIGINT NOT NULL,
                outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('processing', 'captured_locally', 'accepted', 'failed', 'uncertain')),
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                finished_at DATETIME(6) NULL,
                UNIQUE (message_id, generation, attempt),
                CONSTRAINT chk_mail_att_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_att_msg CHECK (REGEXP_LIKE(message_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mail_att_msg FOREIGN KEY (message_id) REFERENCES mvp_mail_messages(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            CREATE TABLE mvp_mail_resends (
                message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                generation INT NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                PRIMARY KEY (message_id, request_id),
                CONSTRAINT chk_mail_resend_msg CHECK (REGEXP_LIKE(message_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_resend_req CHECK (REGEXP_LIKE(request_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_mail_resend_actor CHECK (REGEXP_LIKE(actor_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_mail_resend_msg FOREIGN KEY (message_id) REFERENCES mvp_mail_messages(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS mvp_mail_resends;');
        DB::statement('DROP TABLE IF EXISTS mvp_mail_attempts;');
        DB::statement('DROP TABLE IF EXISTS mvp_mail_messages;');
        DB::statement('DROP TABLE IF EXISTS mvp_mail_settings;');
        DB::statement('DROP TABLE IF EXISTS mvp_mail_sentinel;');
    }
};
