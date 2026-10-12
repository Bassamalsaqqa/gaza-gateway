<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE security_smtp_attempts (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                outbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                status VARCHAR(32) NOT NULL CHECK (status IN ('processing', 'accepted', 'failed', 'uncertain', 'scrubbed')),
                attempt INT NOT NULL CHECK (attempt BETWEEN 1 AND 5),
                deadline DATETIME(6) NOT NULL,
                next_attempt_at DATETIME(6) NULL,
                provider_message_id TEXT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_smtp_att_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_smtp_att_outbox CHECK (REGEXP_LIKE(outbox_id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT fk_smtp_att_outbox FOREIGN KEY (outbox_id) REFERENCES security_dispatch_outbox(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX idx_security_smtp_attempts_status ON security_smtp_attempts(status, next_attempt_at);');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS security_smtp_attempts;');
    }
};
