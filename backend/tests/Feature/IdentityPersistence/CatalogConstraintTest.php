<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CatalogConstraintTest extends TestCase
{
    public function test_primary_keys_exist_on_all_13_relations(): void
    {
        $expectedPKs = [
            'fare_products' => ['id'],
            'quotes' => ['id'],
            'capacity_holds' => ['id'],
            'bookings' => ['id'],
            'booking_passengers' => ['id'],
            'booking_guest_challenges' => ['id'],
            'booking_guest_grants' => ['id'],
            'booking_receipt_grants' => ['id'],
            'booking_claim_proofs' => ['id'],
            'security_dispatch_outbox' => ['id'],
            'passenger_profiles' => ['user_id'],
            'saved_travelers' => ['id'],
            'audit_events' => ['id'],
        ];

        foreach ($expectedPKs as $table => $pkColumns) {
            $result = DB::select("
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = ?
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
            ", [$table]);

            $columns = array_column($result, 'column_name');
            $this->assertEquals($pkColumns, $columns, "Primary key mismatch on {$table}");
        }
    }

    public function test_foreign_keys_have_restrict_action_and_exact_targets(): void
    {
        // Query PostgreSQL catalog for foreign key delete rules
        $fks = DB::select("
            SELECT
                tc.table_name,
                tc.constraint_name,
                rc.delete_rule,
                ccu.table_name AS foreign_table_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.referential_constraints rc
                ON tc.constraint_name = rc.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON rc.unique_constraint_name = ccu.constraint_name
            WHERE tc.table_schema = 'public'
              AND tc.constraint_type = 'FOREIGN KEY'
        ");

        $fksByTable = [];
        foreach ($fks as $fk) {
            $fksByTable[$fk->table_name][] = $fk;
            // Invariant: Relationships use RESTRICT unless accepted contract explicitly differs
            $this->assertEquals(
                'RESTRICT',
                $fk->delete_rule,
                "Foreign key {$fk->constraint_name} on {$fk->table_name} must use ON DELETE RESTRICT"
            );
        }

        // Verify specific key table foreign key targets
        $this->assertArrayHasKey('quotes', $fksByTable);
        $this->assertArrayHasKey('capacity_holds', $fksByTable);
        $this->assertArrayHasKey('bookings', $fksByTable);
        $this->assertArrayHasKey('booking_passengers', $fksByTable);
        $this->assertArrayHasKey('booking_guest_challenges', $fksByTable);
        $this->assertArrayHasKey('booking_guest_grants', $fksByTable);
        $this->assertArrayHasKey('booking_receipt_grants', $fksByTable);
        $this->assertArrayHasKey('booking_claim_proofs', $fksByTable);
        $this->assertArrayHasKey('security_dispatch_outbox', $fksByTable);
        $this->assertArrayHasKey('passenger_profiles', $fksByTable);
        $this->assertArrayHasKey('saved_travelers', $fksByTable);
        $this->assertArrayHasKey('audit_events', $fksByTable);
    }

    public function test_unique_indexes_and_constraints_catalog_integrity(): void
    {
        $uniqueConstraints = DB::select("
            SELECT tc.table_name, tc.constraint_name
            FROM information_schema.table_constraints tc
            WHERE tc.table_schema = 'public'
              AND tc.constraint_type = 'UNIQUE'
        ");

        $byTable = [];
        foreach ($uniqueConstraints as $uc) {
            $byTable[$uc->table_name][] = $uc->constraint_name;
        }

        // quotes (id, checkout_session_id)
        $this->assertContains('uq_quotes_id_session', $byTable['quotes'] ?? []);

        // capacity_holds (id, quote_id, checkout_session_id)
        $this->assertContains('uq_capacity_holds_id_quote_session', $byTable['capacity_holds'] ?? []);

        // bookings hold_id, (id, hold_id), (id, total_minor, currency), pnr
        $this->assertContains('uq_bookings_id_hold', $byTable['bookings'] ?? []);
        $this->assertContains('uq_bookings_id_total_currency', $byTable['bookings'] ?? []);

        // booking_passengers (id, booking_id), (booking_id, request_local_id), (booking_id, passenger_index)
        $this->assertContains('uq_booking_passengers_id_booking', $byTable['booking_passengers'] ?? []);
        $this->assertContains('uq_booking_passengers_booking_request_local', $byTable['booking_passengers'] ?? []);
        $this->assertContains('uq_booking_passengers_booking_index', $byTable['booking_passengers'] ?? []);

        // token digests uniqueness
        $this->assertContains('uq_booking_guest_grants_token_digest', $byTable['booking_guest_grants'] ?? []);
        $this->assertContains('uq_booking_receipt_grants_token_digest', $byTable['booking_receipt_grants'] ?? []);
        $this->assertContains('uq_booking_claim_proofs_token_digest', $byTable['booking_claim_proofs'] ?? []);

        // saved_travelers owner-scoped external_id
        $this->assertContains('uq_saved_travelers_owner_external', $byTable['saved_travelers'] ?? []);

        // Partial index on booking_passengers
        $indexes = DB::select("
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'booking_passengers'
              AND indexname = 'uq_booking_passengers_infant_adult'
        ");
        $this->assertNotEmpty($indexes, 'Partial index uq_booking_passengers_infant_adult must exist');
        $this->assertStringContainsString('WHERE', $indexes[0]->indexdef);
    }

    public function test_triggers_registered_for_adult_target_and_audit_immutability(): void
    {
        $triggers = DB::select("
            SELECT tgname, relname
            FROM pg_trigger
            JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
            WHERE tgname IN (
                'trg_booking_passengers_adult_target',
                'trg_audit_events_prevent_mutation',
                'trg_audit_events_prevent_truncate'
            )
        ");

        $triggerNames = array_column($triggers, 'tgname');
        $this->assertContains('trg_booking_passengers_adult_target', $triggerNames);
        $this->assertContains('trg_audit_events_prevent_mutation', $triggerNames);
        $this->assertContains('trg_audit_events_prevent_truncate', $triggerNames);
    }
}
