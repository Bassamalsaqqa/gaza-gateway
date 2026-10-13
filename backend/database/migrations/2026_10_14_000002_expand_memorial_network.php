<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const ORIGINAL = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH'];
    private const EXPANDED = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];

    public function up(): void
    {
        $this->replaceChecks(self::EXPANDED, 1440);
    }

    public function down(): void
    {
        if (DB::table('airports')->whereNotIn('code', self::ORIGINAL)->orWhere('block_minutes', '>', 600)->exists()
            || DB::table('schedules')->whereNotIn('destination', array_diff(self::ORIGINAL, ['GZA']))->exists()) {
            throw new RuntimeException('Network contraction refused: expanded references remain. No rows were changed.');
        }
        $this->replaceChecks(self::ORIGINAL, 600);
    }

    private function replaceChecks(array $codes, int $maximum): void
    {
        // Resolve MySQL's generated names without guessing ordinal names or swallowing errors.
        // Both old constraints and their replacements change in ONE atomic MySQL ALTER.
        $checks = DB::select('SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
            FROM information_schema.TABLE_CONSTRAINTS tc
            JOIN information_schema.CHECK_CONSTRAINTS cc
              ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.TABLE_NAME = ? AND tc.CONSTRAINT_TYPE = ?',
            [DB::getDatabaseName(), 'airports', 'CHECK']);
        $codeChecks = []; $minuteChecks = [];
        foreach ($checks as $check) {
            $clause = strtolower(str_replace('`', '', $check->CHECK_CLAUSE));
            if (preg_match('/\bcode\b\s+in\s*\(/', $clause)) $codeChecks[] = $check->CONSTRAINT_NAME;
            if (preg_match('/\bblock_minutes\b/', $clause)) $minuteChecks[] = $check->CONSTRAINT_NAME;
        }
        if (count($codeChecks) !== 1 || count($minuteChecks) !== 1) {
            throw new RuntimeException('Expected airport constraints were not found; no changes applied.');
        }
        foreach ([$codeChecks[0], $minuteChecks[0]] as $name) {
            if (!preg_match('/^[A-Za-z0-9_]+$/D', $name)) throw new RuntimeException('Unexpected constraint identifier.');
        }
        $allowed = "'" . implode("','", $codes) . "'";
        DB::statement("ALTER TABLE airports
            DROP CHECK `{$codeChecks[0]}`, DROP CHECK `{$minuteChecks[0]}`,
            ADD CONSTRAINT chk_airports_code CHECK (code IN ({$allowed})),
            ADD CONSTRAINT chk_airports_block_minutes CHECK (block_minutes BETWEEN 20 AND {$maximum})");
    }
};
