<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class DisposableDatabaseGuardTest extends TestCase
{
    public function test_fixture_guard_rejects_non_testing_environment_without_writes(): void
    {
        $priorEnv = getenv('APP_ENV');
        try {
            putenv('APP_ENV=local');
            $this->expectException(\RuntimeException::class);
            $this->expectExceptionMessage('Fixture admission requires the testing environment.');
            $this->assertDisposableDatabaseTarget();
        } finally {
            putenv('APP_ENV=' . $priorEnv);
        }
    }

    public function test_testing_label_cannot_admit_the_live_development_database(): void
    {
        $original = config('database.connections.pgsql_test');
        try {
            config([
                'database.connections.pgsql_test.url' => null,
                'database.connections.pgsql_test.database' => 'gaza_gateway_dev',
            ]);
            DB::purge('pgsql_test');
            $this->expectException(\RuntimeException::class);
            $this->expectExceptionMessage('Fixture admission rejected the live database target.');
            // The guard runs SELECT only; this test creates, updates and deletes no records.
            $this->assertDisposableDatabaseTarget();
        } finally {
            DB::purge('pgsql_test');
            config(['database.connections.pgsql_test' => $original]);
        }
    }
}
