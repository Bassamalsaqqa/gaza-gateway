<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MigrationLifecycleTest extends TestCase
{
    private const EXACT_13_RELATIONS = [
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

    private const CORE_15_RELATIONS = [
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
    ];

    public function test_all_13_persistence_relations_exist_after_migration(): void
    {
        $tables = DB::select("
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        ");

        $tableNames = array_column($tables, 'table_name');

        foreach (self::EXACT_13_RELATIONS as $relation) {
            $this->assertContains($relation, $tableNames, "Expected relation {$relation} to exist.");
        }

        foreach (self::CORE_15_RELATIONS as $coreRelation) {
            $this->assertContains($coreRelation, $tableNames, "Expected core relation {$coreRelation} to exist.");
        }
    }

    public function test_rollback_removes_13_relations_leaving_core_and_infrastructure_intact(): void
    {
        // Rollback the 3 persistence migrations (3 batches or 3 steps)
        Artisan::call('migrate:rollback', ['--step' => 3]);

        $tablesAfterRollback = DB::select("
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        ");
        $tableNamesAfter = array_column($tablesAfterRollback, 'table_name');

        // All 13 persistence relations must be removed
        foreach (self::EXACT_13_RELATIONS as $relation) {
            $this->assertNotContains($relation, $tableNamesAfter, "Expected relation {$relation} to be dropped on rollback.");
        }

        // All 15 core relations must remain intact
        foreach (self::CORE_15_RELATIONS as $coreRelation) {
            $this->assertContains($coreRelation, $tableNamesAfter, "Expected core relation {$coreRelation} to remain intact.");
        }

        // Infrastructure tables (cache, jobs) must remain intact
        $this->assertContains('cache', $tableNamesAfter, 'Expected cache table to remain intact.');
        $this->assertContains('jobs', $tableNamesAfter, 'Expected jobs table to remain intact.');

        // Re-apply the migrations for remaining tests
        Artisan::call('migrate');

        $tablesAfterReapply = DB::select("
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        ");
        $tableNamesReapplied = array_column($tablesAfterReapply, 'table_name');

        foreach (self::EXACT_13_RELATIONS as $relation) {
            $this->assertContains($relation, $tableNamesReapplied, "Expected relation {$relation} to exist after reapply.");
        }
    }
}
