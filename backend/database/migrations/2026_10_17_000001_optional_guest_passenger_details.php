<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Consolidated atomic ALTER TABLE relaxing optional columns and updating name check constraint
        DB::statement(<<<'SQL'
ALTER TABLE mvp_reservation_passengers
    DROP CHECK chk_passenger_name,
    MODIFY COLUMN last_name VARCHAR(120) NULL,
    MODIFY COLUMN dob DATE NULL,
    MODIFY COLUMN nationality VARCHAR(120) NULL,
    MODIFY COLUMN document VARCHAR(120) NULL,
    ADD CONSTRAINT chk_passenger_name CHECK ((first_name IS NOT NULL AND first_name <> '') OR (last_name IS NOT NULL AND last_name <> ''));
SQL
        );
    }

    public function down(): void
    {
        // Safe rollback refusal: refuse if passenger rows with null optional details exist
        $nullCount = DB::table('mvp_reservation_passengers')
            ->whereNull('last_name')
            ->orWhereNull('dob')
            ->orWhereNull('nationality')
            ->orWhereNull('document')
            ->count();

        if ($nullCount > 0) {
            throw new \RuntimeException("Refusing to rollback optional passenger details migration: {$nullCount} passenger(s) with null optional details exist.");
        }

        // Consolidated atomic ALTER TABLE restoring NOT NULL and original check constraint
        DB::statement(<<<'SQL'
ALTER TABLE mvp_reservation_passengers
    DROP CHECK chk_passenger_name,
    MODIFY COLUMN document VARCHAR(120) NOT NULL,
    MODIFY COLUMN nationality VARCHAR(120) NOT NULL,
    MODIFY COLUMN dob DATE NOT NULL,
    MODIFY COLUMN last_name VARCHAR(120) NOT NULL,
    ADD CONSTRAINT chk_passenger_name CHECK (first_name <> '' OR last_name <> '');
SQL
        );
    }
};
