<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceNetwork;

use App\Reference\Network\NetworkValidator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class MemorialNetworkExpansionTest extends TestCase
{
    private function row(string $code, int $duration): array
    {
        return ['code' => $code, 'airport_name_en' => 'Synthetic airport', 'airport_name_ar' => 'مطار اختباري',
            'city_en' => 'Synthetic city', 'city_ar' => 'مدينة اختبارية', 'country_en' => 'Synthetic country', 'country_ar' => 'بلد اختباري',
            'timezone' => 'UTC', 'block_minutes' => $duration, 'active' => true];
    }

    public function test_all_twenty_destinations_have_real_database_admission(): void
    {
        $this->assertCount(21, NetworkValidator::ACCEPTED_CODES);
        $this->assertCount(20, NetworkValidator::DESTINATION_CODES);
        foreach (NetworkValidator::ACCEPTED_CODES as $code) {
            DB::table('airports')->insertOrIgnore($this->row($code, 750));
            $this->assertTrue(DB::table('airports')->where('code', $code)->exists());
        }
    }

    public function test_invalid_codes_and_durations_fail_at_the_database(): void
    {
        foreach ([['XYZ', 60], ['AMM', 19], ['AMM', 1441]] as [$code, $duration]) {
            try {
                if ($code === 'AMM') DB::table('airports')->where('code', 'AMM')->update(['block_minutes' => $duration]);
                else DB::table('airports')->insert($this->row($code, $duration));
                $this->fail('Invalid network reference bypassed a database check.');
            } catch (QueryException $e) {
                $this->assertSame(3819, (int) ($e->errorInfo[1] ?? 0));
            }
        }
        $this->assertFalse(DB::table('airports')->where('code', 'XYZ')->exists());
    }

    public function test_narrowing_refuses_without_losing_records_or_other_checks(): void
    {
        $migration = require database_path('migrations/2026_10_14_000002_expand_memorial_network.php');
        $before = DB::table('airports')->count();
        try { $migration->down(); $this->fail('Unsafe contraction succeeded.'); }
        catch (\RuntimeException) { $this->addToAssertionCount(1); }
        $this->assertSame($before, DB::table('airports')->count());
        $this->assertSame('InnoDB', DB::selectOne('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [DB::getDatabaseName(), 'airports'])->ENGINE);
        try { DB::table('airports')->where('code', 'AMM')->update(['airport_name_en' => '']); $this->fail('An unrelated airport check was lost.'); }
        catch (QueryException $e) { $this->assertSame(3819, (int) ($e->errorInfo[1] ?? 0)); }
    }
}
