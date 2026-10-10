<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Narrowly scoped indexes for anonymous session cleanup and rate limit pruning.
     */
    public function up(): void
    {
        DB::statement('
            CREATE INDEX IF NOT EXISTS idx_passenger_sessions_anonymous_cleanup
            ON passenger_sessions (id, absolute_expires_at, idle_expires_at)
            WHERE user_id IS NULL AND auth_level = \'anonymous\';
        ');

        DB::statement('
            CREATE INDEX IF NOT EXISTS idx_staff_sessions_anonymous_cleanup
            ON staff_sessions (id, absolute_expires_at, idle_expires_at)
            WHERE staff_id IS NULL AND auth_level = \'anonymous\';
        ');

        DB::statement('
            CREATE INDEX IF NOT EXISTS idx_security_rate_limits_window_end
            ON security_rate_limits (operation_id, window_end);
        ');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_security_rate_limits_window_end;');
        DB::statement('DROP INDEX IF EXISTS idx_staff_sessions_anonymous_cleanup;');
        DB::statement('DROP INDEX IF EXISTS idx_passenger_sessions_anonymous_cleanup;');
    }
};
