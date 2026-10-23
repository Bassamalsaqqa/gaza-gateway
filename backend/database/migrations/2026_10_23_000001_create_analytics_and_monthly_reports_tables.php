<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Inspect the installed CHECK name; Batch 02 used an automatically named constraint.
        $checks = DB::select("SELECT cc.CONSTRAINT_NAME AS constraint_name, cc.CHECK_CLAUSE AS clause
            FROM information_schema.CHECK_CONSTRAINTS cc
            JOIN information_schema.TABLE_CONSTRAINTS tc
              ON cc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'archive_mail_outbox'
              AND tc.CONSTRAINT_TYPE = 'CHECK'");
        $purposeChecks = array_values(array_filter($checks,
            fn ($check) => str_contains(strtolower($check->clause), 'purpose')));
        if (count($purposeChecks) !== 1 || !preg_match('/^[a-zA-Z0-9_]+$/', $purposeChecks[0]->constraint_name)) {
            throw new RuntimeException('Unexpected archive outbox purpose constraint; migration stopped.');
        }
        $name = $purposeChecks[0]->constraint_name;
        DB::statement("ALTER TABLE archive_mail_outbox DROP CHECK `{$name}`,
            ADD CONSTRAINT chk_arc_mail_purpose
            CHECK (purpose IN ('archive_ack', 'archive_notify', 'contact_notify', 'analytics_report', 'analytics_preview'))");

        // 2. Compact session anchor table for atomic dedupe & session engagement capping (visitor_id is unique anchor)
        DB::statement("
            CREATE TABLE analytics_sessions (
                visitor_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                session_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                total_engagement_seconds INT NOT NULL DEFAULT 0 CHECK (total_engagement_seconds BETWEEN 0 AND 1800),
                event_count INT NOT NULL DEFAULT 0 CHECK (event_count >= 0),
                last_event_at DATETIME(6) NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX idx_analytics_sess_last_event ON analytics_sessions(last_event_at);');

        // 3. Privacy-conscious first-party analytics events table
        DB::statement("
            CREATE TABLE analytics_events (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                visitor_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                session_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('page_view', 'engagement', 'search', 'booking_start', 'archive_explore')),
                path VARCHAR(128) NOT NULL,
                search_route VARCHAR(7) CHARACTER SET ascii COLLATE ascii_bin NULL,
                engagement_seconds INT NOT NULL DEFAULT 0 CHECK (engagement_seconds BETWEEN 0 AND 60),
                country_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'XX',
                referrer_host VARCHAR(253) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_analytics_evt_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_analytics_evt_cc CHECK (REGEXP_LIKE(country_code, '^[A-Z]{2}$', 'c')),
                CONSTRAINT fk_analytics_evt_visitor FOREIGN KEY (visitor_id) REFERENCES analytics_sessions(visitor_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement('CREATE INDEX idx_analytics_created ON analytics_events(created_at);');
        DB::statement('CREATE INDEX idx_analytics_type_created ON analytics_events(event_type, created_at);');
        DB::statement('CREATE INDEX idx_analytics_visitor_created ON analytics_events(visitor_id, created_at);');
        DB::statement('CREATE INDEX idx_analytics_session_created ON analytics_events(session_id, created_at);');
        DB::statement('CREATE INDEX idx_analytics_path_created ON analytics_events(path, created_at);');

        // 4. Report configuration & opt-in routing table
        DB::statement("
            CREATE TABLE analytics_report_settings (
                id SMALLINT PRIMARY KEY CHECK (id = 1),
                revision BIGINT NOT NULL CHECK (revision > 0),
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                recipient_email VARCHAR(254) NOT NULL,
                updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_analytics_set_email CHECK (CHAR_LENGTH(recipient_email) BETWEEN 3 AND 254),
                CONSTRAINT chk_analytics_set_staff CHECK (REGEXP_LIKE(updated_by, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c'))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");

        DB::statement("
            INSERT INTO analytics_report_settings (id, revision, enabled, recipient_email, updated_by, updated_at)
            VALUES (1, 1, FALSE, 'notifications@gazaairport.com', '00000000-0000-0000-0000-000000000000', UTC_TIMESTAMP(6));
        ");

        // 5. Monthly report unique period tracking linking to existing archive_mail_outbox
        DB::statement("
            CREATE TABLE analytics_monthly_reports (
                id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                period VARCHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
                period_start DATETIME(6) NOT NULL,
                period_end DATETIME(6) NOT NULL,
                recipient VARCHAR(254) NOT NULL,
                outbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
                summary_payload MEDIUMTEXT NOT NULL,
                created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
                CONSTRAINT chk_analytics_rep_id CHECK (REGEXP_LIKE(id, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')),
                CONSTRAINT chk_analytics_rep_period CHECK (REGEXP_LIKE(period, '^[0-9]{4}-[0-9]{2}$', 'c')),
                CONSTRAINT fk_analytics_rep_outbox FOREIGN KEY (outbox_id) REFERENCES archive_mail_outbox(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
        ");
    }

    public function down(): void
    {
        // Guard against destructive rollback if analytics records or non-default settings exist
        if (Schema::hasTable('analytics_events') && DB::table('analytics_events')->exists()) {
            throw new \RuntimeException('Destructive rollback refused: analytics records exist. To protect owner data, tables cannot be dropped blindly.');
        }

        if (Schema::hasTable('analytics_monthly_reports') && DB::table('analytics_monthly_reports')->exists()) {
            throw new \RuntimeException('Destructive rollback refused: monthly report records exist. To protect owner data, tables cannot be dropped blindly.');
        }

        if (Schema::hasTable('analytics_sessions') && DB::table('analytics_sessions')->exists()) {
            throw new \RuntimeException('Destructive rollback refused: analytics sessions exist. To protect owner data, tables cannot be dropped blindly.');
        }

        if (Schema::hasTable('analytics_report_settings')) {
            $hasCustom = DB::table('analytics_report_settings')
                ->where('id', 1)
                ->where(function ($q) {
                    $q->where('enabled', true)
                      ->orWhere('recipient_email', '<>', 'notifications@gazaairport.com')
                      ->orWhere('revision', '>', 1)
                      ->orWhere('updated_by', '<>', '00000000-0000-0000-0000-000000000000');
                })
                ->exists();
            if ($hasCustom) {
                throw new \RuntimeException('Destructive rollback refused: non-default analytics report settings exist.');
            }
        }

        if (Schema::hasTable('archive_mail_outbox') && DB::table('archive_mail_outbox')->whereIn('purpose', ['analytics_report', 'analytics_preview'])->exists()) {
            throw new \RuntimeException('Destructive rollback refused: analytics outbox records exist in archive_mail_outbox.');
        }

        // Restore original purpose check atomically BEFORE dropping tables (errors propagate)
        if (Schema::hasTable('archive_mail_outbox') && DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE `archive_mail_outbox`
                DROP CHECK `chk_arc_mail_purpose`,
                ADD CONSTRAINT `chk_arc_mail_purpose`
                CHECK (purpose IN ('archive_ack', 'archive_notify', 'contact_notify'))
            ");
        }

        DB::statement('DROP TABLE IF EXISTS analytics_monthly_reports;');
        DB::statement('DROP TABLE IF EXISTS analytics_report_settings;');
        DB::statement('DROP TABLE IF EXISTS analytics_events;');
        DB::statement('DROP TABLE IF EXISTS analytics_sessions;');
    }
};
