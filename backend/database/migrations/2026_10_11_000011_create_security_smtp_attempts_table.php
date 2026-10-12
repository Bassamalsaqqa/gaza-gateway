<?php
declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE security_smtp_attempts (
    id UUID PRIMARY KEY,
    outbox_id UUID NOT NULL UNIQUE REFERENCES security_dispatch_outbox(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('processing', 'accepted', 'failed', 'uncertain', 'scrubbed')),
    attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 5),
    deadline TIMESTAMPTZ NOT NULL,
    next_attempt_at TIMESTAMPTZ,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_security_smtp_attempts_status ON security_smtp_attempts(status, next_attempt_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS security_smtp_attempts;');
    }
};
