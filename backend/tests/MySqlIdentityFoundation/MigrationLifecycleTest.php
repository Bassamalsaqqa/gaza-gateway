<?php

declare(strict_types=1);

namespace Tests\MySqlIdentityFoundation;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MigrationLifecycleTest extends MySqlTestCase
{
    private const IDENTITY_MIGRATION_PATH = 'database/migrations/identity';

    private const EXPECTED_TABLES = [
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'users',
        'staff_users',
        'staff_mfa_credentials',
        'passenger_sessions',
        'staff_sessions',
        'staff_pending_auth',
        'user_email_verifications',
        'user_password_resets',
        'staff_invitations',
        'staff_password_resets',
        'staff_mfa_replacements',
        'staff_mfa_counter_consumptions',
        'staff_mfa_recovery_codes',
        'staff_directory_control',
        'security_rate_limits',
        'fare_products',
        'quotes',
        'capacity_holds',
        'bookings',
        'booking_passengers',
        'booking_guest_challenges',
        'booking_guest_grants',
        'booking_receipt_grants',
        'booking_claim_proofs',
        'security_dispatch_outbox',
        'passenger_profiles',
        'saved_travelers',
        'audit_events',
    ];

    public function testMigrationLifecycleUpRollbackAndReapply(): void
    {
        $connection = DB::connection('mysql_test');

        // 1. Ensure migrations are up
        $exitCode = Artisan::call('migrate', [
            '--database' => 'mysql_test',
            '--path' => self::IDENTITY_MIGRATION_PATH,
            '--force' => true,
        ]);
        $this->assertSame(0, $exitCode, 'Migration up should succeed.');

        foreach (self::EXPECTED_TABLES as $table) {
            $this->assertTrue(
                Schema::connection('mysql_test')->hasTable($table),
                "Table [{$table}] must exist after migrate up."
            );
        }

        // Verify seeded sentinel
        $sentinel = $connection->table('staff_directory_control')->where('id', 1)->first();
        $this->assertNotNull($sentinel, 'staff_directory_control id=1 must be seeded on migrate up.');

        // 2. Rollback the 7 migrations
        $rollbackExit = Artisan::call('migrate:rollback', [
            '--database' => 'mysql_test',
            '--path' => self::IDENTITY_MIGRATION_PATH,
            '--step' => 7,
            '--force' => true,
        ]);
        $this->assertSame(0, $rollbackExit, 'Migration rollback should succeed.');

        foreach (self::EXPECTED_TABLES as $table) {
            $this->assertFalse(
                Schema::connection('mysql_test')->hasTable($table),
                "Table [{$table}] must be dropped after rollback."
            );
        }

        // 3. Reapply migrations
        $reapplyExit = Artisan::call('migrate', [
            '--database' => 'mysql_test',
            '--path' => self::IDENTITY_MIGRATION_PATH,
            '--force' => true,
        ]);
        $this->assertSame(0, $reapplyExit, 'Migration reapply should succeed.');

        foreach (self::EXPECTED_TABLES as $table) {
            $this->assertTrue(
                Schema::connection('mysql_test')->hasTable($table),
                "Table [{$table}] must exist after migrate reapply."
            );
        }

        // Verify seeded sentinel again
        $sentinelReapplied = $connection->table('staff_directory_control')->where('id', 1)->first();
        $this->assertNotNull($sentinelReapplied, 'staff_directory_control id=1 must be reseeded.');
    }
}
