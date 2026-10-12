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
            CREATE INDEX idx_passenger_sessions_anonymous_cleanup
            ON passenger_sessions (id, absolute_expires_at, idle_expires_at);
        ');

        DB::statement('
            CREATE INDEX idx_staff_sessions_anonymous_cleanup
            ON staff_sessions (id, absolute_expires_at, idle_expires_at);
        ');

        DB::statement('
            CREATE INDEX idx_security_rate_limits_window_end
            ON security_rate_limits (operation_id, window_end);
        ');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX idx_security_rate_limits_window_end ON security_rate_limits;');
        DB::statement('DROP INDEX idx_staff_sessions_anonymous_cleanup ON staff_sessions;');
        DB::statement('DROP INDEX idx_passenger_sessions_anonymous_cleanup ON passenger_sessions;');
    }
};
