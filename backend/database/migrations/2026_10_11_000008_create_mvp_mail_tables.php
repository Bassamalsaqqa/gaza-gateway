<?php
declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE mvp_mail_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1), revision BIGINT NOT NULL CHECK (revision > 0),
    encrypted_config TEXT NOT NULL, updated_by UUID NOT NULL REFERENCES staff_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mvp_mail_messages (
    id UUID PRIMARY KEY, intent_id UUID UNIQUE REFERENCES mvp_reservation_mail_intents(id),
    reservation_id UUID REFERENCES mvp_reservations(id), purpose TEXT NOT NULL CHECK (purpose IN ('booking','test')),
    encrypted_payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','captured_locally','accepted','failed','uncertain','cancelled')),
    generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0), attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    lease_id UUID, lease_until TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    accepted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((status = 'processing') = (lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE mvp_mail_attempts (
    id UUID PRIMARY KEY, message_id UUID NOT NULL REFERENCES mvp_mail_messages(id), generation INTEGER NOT NULL,
    attempt INTEGER NOT NULL, settings_revision BIGINT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('processing','captured_locally','accepted','failed','uncertain')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), finished_at TIMESTAMPTZ,
    UNIQUE(message_id, generation, attempt)
);
CREATE TABLE mvp_mail_resends (
    message_id UUID NOT NULL REFERENCES mvp_mail_messages(id), request_id UUID NOT NULL,
    actor_id UUID NOT NULL, generation INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(message_id, request_id)
);
CREATE INDEX mvp_mail_due ON mvp_mail_messages(next_attempt_at, created_at) WHERE status IN ('pending','failed');
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE mvp_mail_resends; DROP TABLE mvp_mail_attempts; DROP TABLE mvp_mail_messages; DROP TABLE mvp_mail_settings;');
    }
};
