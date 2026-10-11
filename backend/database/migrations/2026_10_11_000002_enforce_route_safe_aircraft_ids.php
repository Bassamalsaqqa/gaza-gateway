<?php
declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Fail on existing unsafe IDs; immutable identities must never be silently renamed.
        DB::statement("ALTER TABLE aircraft ADD CONSTRAINT aircraft_route_safe_id CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$')");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE aircraft DROP CONSTRAINT aircraft_route_safe_id');
    }
};
