<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE archive_contributions
                ADD COLUMN chapter VARCHAR(32) NULL,
                ADD COLUMN approximate_date VARCHAR(100) NULL,
                ADD COLUMN location VARCHAR(200) NULL,
                ADD COLUMN credit VARCHAR(254) NULL,
                ADD COLUMN rights_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
                ADD COLUMN source_note MEDIUMTEXT NULL,
                ADD COLUMN reference_url VARCHAR(2000) NULL,
                ADD CONSTRAINT chk_arc_contrib_chapter CHECK (chapter IS NULL OR chapter IN ('historical', 'contemporary', 'imagined_future')),
                ADD CONSTRAINT chk_arc_contrib_rights CHECK (rights_status IN ('owned_authorized', 'reference_unconfirmed', 'unknown'));
        ");

        DB::statement('CREATE INDEX arc_contrib_chapter ON archive_contributions(chapter);');
        DB::statement('CREATE INDEX arc_contrib_rights ON archive_contributions(rights_status);');
    }

    public function down(): void
    {
        // Guard against destructive rollback if populated contribution metadata exists
        $hasPopulated = DB::table('archive_contributions')
            ->whereNotNull('chapter')
            ->orWhereNotNull('approximate_date')
            ->orWhereNotNull('location')
            ->orWhereNotNull('credit')
            ->orWhereNotNull('source_note')
            ->orWhereNotNull('reference_url')
            ->orWhere('rights_status', '<>', 'unknown')
            ->exists();

        if ($hasPopulated) {
            throw new \RuntimeException(
                'Archive contribution metadata contraction refused: populated contribution metadata exists. Release rollback must use guarded backups.'
            );
        }

        DB::statement('DROP INDEX arc_contrib_rights ON archive_contributions;');
        DB::statement('DROP INDEX arc_contrib_chapter ON archive_contributions;');

        DB::statement("
            ALTER TABLE archive_contributions
                DROP CHECK chk_arc_contrib_rights,
                DROP CHECK chk_arc_contrib_chapter,
                DROP COLUMN reference_url,
                DROP COLUMN source_note,
                DROP COLUMN rights_status,
                DROP COLUMN credit,
                DROP COLUMN location,
                DROP COLUMN approximate_date,
                DROP COLUMN chapter;
        ");
    }
};
