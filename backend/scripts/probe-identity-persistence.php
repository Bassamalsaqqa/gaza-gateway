<?php

declare(strict_types=1);

/**
 * Focused dev-only catalog, fail-closed negative, concurrency, and rollback probe
 * for Phase 13B Identity Persistence.
 * Validates the 13 inert persistence relations against test PostgreSQL.
 * Usage: php scripts/probe-identity-persistence.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPersistence\ConcurrencyWorkerProcess;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;

echo "=== Gaza Gateway Phase 13B Identity Persistence Probe ===\n";

$processEnv = getenv('APP_ENV');
$configEnv = config('app.env');
$dbConnection = config('database.default');
$configuredDb = config("database.connections.{$dbConnection}.database");

if ($processEnv !== 'testing' || $configEnv !== 'testing') {
    fwrite(STDERR, "FATAL: Probe must run strictly under process APP_ENV=testing and configured app.env=testing (process: {$processEnv}, config: {$configEnv})\n");
    exit(1);
}

if ($dbConnection !== 'pgsql_test') {
    fwrite(STDERR, "FATAL: Probe must run strictly under DB connection pgsql_test (current: {$dbConnection})\n");
    exit(1);
}

if ($configuredDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "FATAL: Configured database must be gaza_gateway_test (current: {$configuredDb})\n");
    exit(1);
}

$dbLive = DB::selectOne('SELECT current_database() AS db')->db;
if ($dbLive !== 'gaza_gateway_test') {
    fwrite(STDERR, "FATAL: Probe must run against live database gaza_gateway_test (current: {$dbLive})\n");
    exit(1);
}

echo "Environment: {$configEnv} (process: {$processEnv}) | Connection: {$dbConnection} | Database: {$dbLive}\n\n";

$errors = [];
$stats = [
    'relations_verified' => 0,
    'manifest_columns_verified' => 0,
    'manifest_constraints_verified' => 0,
    'owned_fks_count' => 0,
    'total_schema_fks_count' => 0,
    'negative_probes_passed' => 0,
    'concurrency_probes_passed' => 0,
    'rollback_preservation_verified' => false,
];

$exact13Relations = [
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

if (in_array('--simulate-missing-relation', $argv ?? [], true)) {
    echo "  [TEST MODE] Injecting simulated missing relation to prove fail-closed non-zero exit...\n";
    $exact13Relations[] = 'missing_manifest_relation_sentinel';
}

// -----------------------------------------------------------------------------
// SECTION 1: Catalog Check of All 13 Relations & Detailed 5 Manifest Definitions
// -----------------------------------------------------------------------------
echo "[1/4] Catalog verification...\n";

$existingTables = array_column(
    DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    'table_name'
);

foreach ($exact13Relations as $rel) {
    if (in_array($rel, $existingTables, true)) {
        $stats['relations_verified']++;
    } else {
        $errors[] = "Missing required relation in catalog: {$rel}";
    }
}

// Foreign Key Distinction: Total Schema FKs vs 13 Owned Relations FKs
$allFkRows = DB::select("
    SELECT tc.table_name, tc.constraint_name, rc.delete_rule, ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
");

$stats['total_schema_fks_count'] = count($allFkRows);

$ownedFks = array_filter($allFkRows, function ($fk) use ($exact13Relations) {
    return in_array($fk->table_name, $exact13Relations, true);
});
$stats['owned_fks_count'] = count($ownedFks);

foreach ($ownedFks as $fk) {
    if ($fk->delete_rule !== 'RESTRICT') {
        $errors[] = "Owned FK {$fk->constraint_name} on {$fk->table_name} does not use ON DELETE RESTRICT (uses {$fk->delete_rule})";
    }
}

// Detailed Catalog Check for the 5 Remaining Identity Manifest Relations
$manifestExpected = [
    'booking_guest_challenges' => [
        'columns' => [
            'id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'booking_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'session_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'user_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'purpose' => ['type' => 'text', 'nullable' => 'NO'],
            'security_epoch' => ['type' => 'integer', 'nullable' => 'YES'],
            'code_digest' => ['type' => 'character', 'nullable' => 'NO'],
            'pepper_version' => ['type' => 'integer', 'nullable' => 'NO'],
            'state' => ['type' => 'text', 'nullable' => 'NO'],
            'failed_attempts' => ['type' => 'integer', 'nullable' => 'NO'],
            'dispatch_status' => ['type' => 'text', 'nullable' => 'NO'],
            'issued_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'expires_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'consumed_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
            'revoked_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
        ],
        'pk' => ['id'],
        'fk_targets' => ['bookings', 'passenger_sessions', 'users'],
    ],
    'booking_guest_grants' => [
        'columns' => [
            'id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'token_digest' => ['type' => 'character', 'nullable' => 'NO'],
            'booking_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'security_epoch' => ['type' => 'integer', 'nullable' => 'NO'],
            'allowed_actions' => ['type' => 'jsonb', 'nullable' => 'NO'],
            'scope_version' => ['type' => 'integer', 'nullable' => 'NO'],
            'issued_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'expires_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'revoked_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
        ],
        'pk' => ['id'],
        'fk_targets' => ['bookings'],
    ],
    'booking_receipt_grants' => [
        'columns' => [
            'id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'token_digest' => ['type' => 'character', 'nullable' => 'NO'],
            'booking_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'security_epoch' => ['type' => 'integer', 'nullable' => 'NO'],
            'allowed_actions' => ['type' => 'jsonb', 'nullable' => 'NO'],
            'scope_version' => ['type' => 'integer', 'nullable' => 'NO'],
            'issued_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'expires_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'revoked_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
        ],
        'pk' => ['id'],
        'fk_targets' => ['bookings'],
    ],
    'booking_claim_proofs' => [
        'columns' => [
            'id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'token_digest' => ['type' => 'character', 'nullable' => 'NO'],
            'state' => ['type' => 'text', 'nullable' => 'NO'],
            'issued_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'expires_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'consumed_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
            'revoked_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
            'booking_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'user_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'session_id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'security_epoch' => ['type' => 'integer', 'nullable' => 'NO'],
            'purpose' => ['type' => 'text', 'nullable' => 'NO'],
        ],
        'pk' => ['id'],
        'fk_targets' => ['bookings', 'passenger_sessions', 'users'],
    ],
    'security_dispatch_outbox' => [
        'columns' => [
            'id' => ['type' => 'uuid', 'nullable' => 'NO'],
            'user_verification_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'user_reset_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'staff_invitation_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'staff_reset_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'booking_challenge_id' => ['type' => 'uuid', 'nullable' => 'YES'],
            'encrypted_payload' => ['type' => 'text', 'nullable' => 'YES'],
            'status' => ['type' => 'text', 'nullable' => 'NO'],
            'provider_message_id' => ['type' => 'text', 'nullable' => 'YES'],
            'accepted_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
            'scrubbed_at' => ['type' => 'timestamp with time zone', 'nullable' => 'YES'],
            'expires_at' => ['type' => 'timestamp with time zone', 'nullable' => 'NO'],
            'attempts' => ['type' => 'integer', 'nullable' => 'NO'],
        ],
        'pk' => ['id'],
        'fk_targets' => ['booking_guest_challenges', 'staff_invitations', 'staff_password_resets', 'user_email_verifications', 'user_password_resets'],
    ],
];

foreach ($manifestExpected as $table => $def) {
    $colRows = DB::select("
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?
    ", [$table]);

    $actualCols = [];
    foreach ($colRows as $cr) {
        $actualCols[$cr->column_name] = [
            'type' => $cr->data_type,
            'nullable' => $cr->is_nullable,
        ];
    }

    foreach ($def['columns'] as $colName => $expectedCol) {
        if (!isset($actualCols[$colName])) {
            $errors[] = "Manifest table {$table} missing column {$colName}";
        } else {
            if ($actualCols[$colName]['type'] !== $expectedCol['type']) {
                $errors[] = "Manifest table {$table}.{$colName} type mismatch: expected {$expectedCol['type']}, got {$actualCols[$colName]['type']}";
            }
            if ($actualCols[$colName]['nullable'] !== $expectedCol['nullable']) {
                $errors[] = "Manifest table {$table}.{$colName} nullable mismatch: expected {$expectedCol['nullable']}, got {$actualCols[$colName]['nullable']}";
            }
            $stats['manifest_columns_verified']++;
        }
    }

    // Verify PK
    $pkCols = array_column(DB::select("
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = ? AND tc.constraint_type = 'PRIMARY KEY'
    ", [$table]), 'column_name');

    if ($pkCols !== $def['pk']) {
        $errors[] = "Manifest table {$table} PK mismatch";
    } else {
        $stats['manifest_constraints_verified']++;
    }

    // Verify FK targets
    $fkTargets = array_values(array_unique(array_column(DB::select("
        SELECT ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = ? AND tc.constraint_type = 'FOREIGN KEY'
    ", [$table]), 'foreign_table_name')));
    sort($fkTargets);
    $expectedFk = $def['fk_targets'];
    sort($expectedFk);
    if ($fkTargets !== $expectedFk) {
        $errors[] = "Manifest table {$table} FK targets mismatch: expected " . implode(',', $expectedFk) . ", got " . implode(',', $fkTargets);
    } else {
        $stats['manifest_constraints_verified']++;
    }
}

echo "  -> Relations verified: {$stats['relations_verified']}/13\n";
echo "  -> Manifest columns verified: {$stats['manifest_columns_verified']}\n";
echo "  -> Manifest constraints verified: {$stats['manifest_constraints_verified']}\n";
echo "  -> Schema FKs total: {$stats['total_schema_fks_count']} (Owned by 13 relations: {$stats['owned_fks_count']})\n\n";

// -----------------------------------------------------------------------------
// SECTION 2: Fail-Closed Semantic Probes with SAVEPOINTs and Exact Assertions
// -----------------------------------------------------------------------------
echo "[2/4] Fail-closed semantic probes (savepoint-isolated, exact SQLSTATE & constraint tag)...\n";

/**
 * Executes a probe test inside an isolated SAVEPOINT.
 * Enforces exact SQLSTATE and constraint tag matching.
 * Emits fixed numeric diagnostics without raw PII or exception details.
 */
function runSavepointProbe(int $testId, callable $fn, string $expectedSqlState, string $expectedTag, array &$errors, array &$stats): void
{
    $spName = "sp_probe_{$testId}";
    DB::statement("SAVEPOINT {$spName}");

    $actualSqlState = null;
    $tagMatched = false;
    $exceptionThrown = false;

    try {
        $fn();
    } catch (\Throwable $e) {
        $exceptionThrown = true;
        $actualSqlState = (string) $e->getCode();
        $msg = $e->getMessage();
        if ($expectedSqlState === '23514') {
            $tagMatched = preg_match('/violates check constraint "([a-z0-9_]+)"/', $msg, $match) === 1
                && $match[1] === $expectedTag;
        } else {
            $tagMatched = str_contains($msg, 'ERROR:  ' . $expectedTag . "\n");
        }
    } finally {
        DB::statement("ROLLBACK TO SAVEPOINT {$spName}");
        DB::statement("RELEASE SAVEPOINT {$spName}");
    }

    $pass = $exceptionThrown && ($actualSqlState === $expectedSqlState) && $tagMatched;

    // Fixed numeric diagnostic: no raw queries, parameters, or PII exposed
    printf("  [PROBE %02d] EXPECTED_SQLSTATE=%s ACTUAL_SQLSTATE=%s TAG_MATCH=%d -> %s\n",
        $testId,
        $expectedSqlState,
        $actualSqlState ?? 'NONE',
        $tagMatched ? 1 : 0,
        $pass ? 'PASS' : 'FAIL'
    );

    if ($pass) {
        $stats['negative_probes_passed']++;
    } else {
        $errors[] = sprintf(
            'Probe %02d failed: expected SQLSTATE %s with tag "%s", got SQLSTATE %s (tag_match: %d)',
            $testId,
            $expectedSqlState,
            $expectedTag,
            $actualSqlState ?? 'NONE',
            $tagMatched ? 1 : 0
        );
    }
}

// Disposable fixtures for negative probes
$pUserId = PersistenceTestFactory::createUser();
$pStaffId = PersistenceTestFactory::createStaffUser();
$pSessionId = PersistenceTestFactory::createPassengerSession(['user_id' => $pUserId]);
$pBookingId = PersistenceTestFactory::createBooking();
$pAdultId = PersistenceTestFactory::createBookingPassenger([
    'booking_id' => $pBookingId,
    'type' => 'adult',
    'passenger_index' => 0,
]);

DB::beginTransaction();

// Probe 01: Real guest challenge requires security_epoch >= 1 (SQL UNKNOWN loophole probe)
runSavepointProbe(1, function () use ($pBookingId, $pSessionId) {
    DB::statement('
        INSERT INTO booking_guest_challenges (
            id, booking_id, session_id, user_id, purpose, security_epoch,
            code_digest, pepper_version, state, failed_attempts, dispatch_status,
            issued_at, expires_at
        )
        VALUES (?, ?, ?, NULL, \'manage_booking\', NULL, ?, 1, \'issued\', 0, \'queued\', NOW(), NOW() + INTERVAL \'15 min\')
    ', [(string) Str::uuid(), $pBookingId, $pSessionId, str_repeat('a', 64)]);
}, '23514', 'chk_booking_guest_challenges_real_epoch_not_null', $errors, $stats);

// Probe 02: Outbox requires num_nonnulls = 1 (Probe 0: num_nonnulls = 0)
runSavepointProbe(2, function () {
    DB::statement('
        INSERT INTO security_dispatch_outbox (
            id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
            booking_challenge_id, encrypted_payload, status, provider_message_id,
            accepted_at, scrubbed_at, expires_at, attempts
        )
        VALUES (?, NULL, NULL, NULL, NULL, NULL, \'cipher\', \'queued\', NULL, NULL, NULL, NOW() + INTERVAL \'15 min\', 0)
    ', [(string) Str::uuid()]);
}, '23514', 'chk_security_dispatch_outbox_num_nonnulls', $errors, $stats);

// Probe 03: Outbox requires num_nonnulls = 1 (Probe 2: num_nonnulls = 2)
runSavepointProbe(3, function () use ($pBookingId, $pSessionId) {
    $chal = (string) Str::uuid();
    DB::statement('
        INSERT INTO booking_guest_challenges (
            id, booking_id, session_id, user_id, purpose, security_epoch,
            code_digest, pepper_version, state, failed_attempts, dispatch_status,
            issued_at, expires_at
        )
        VALUES (?, ?, ?, NULL, \'manage_booking\', 1, ?, 1, \'issued\', 0, \'queued\', NOW(), NOW() + INTERVAL \'15 min\')
    ', [$chal, $pBookingId, $pSessionId, str_repeat('b', 64)]);

    DB::statement('
        INSERT INTO security_dispatch_outbox (
            id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
            booking_challenge_id, encrypted_payload, status, provider_message_id,
            accepted_at, scrubbed_at, expires_at, attempts
        )
        VALUES (?, ?, NULL, NULL, NULL, ?, \'cipher\', \'queued\', NULL, NULL, NULL, NOW() + INTERVAL \'15 min\', 0)
    ', [(string) Str::uuid(), (string) Str::uuid(), $chal]);
}, '23514', 'chk_security_dispatch_outbox_num_nonnulls', $errors, $stats);

// Probe 04: Claim proof consumed-state requires consumed_at IS NOT NULL
runSavepointProbe(4, function () use ($pBookingId, $pUserId, $pSessionId) {
    DB::statement('
        INSERT INTO booking_claim_proofs (
            id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
            booking_id, user_id, session_id, security_epoch, purpose
        )
        VALUES (?, ?, \'consumed\', NOW(), NOW() + INTERVAL \'1 hour\', NULL, NULL, ?, ?, ?, 1, \'booking_claim_proof\')
    ', [(string) Str::uuid(), str_repeat('c', 64), $pBookingId, $pUserId, $pSessionId]);
}, '23514', 'chk_booking_claim_proofs_consumed', $errors, $stats);

// Probe 05: Audit event rejects obsolete/invented action name
runSavepointProbe(5, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postAuthLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid(), $pUserId]);
}, '23514', 'chk_audit_events_action', $errors, $stats);

// Probe 06: Audit event enforces realm/actor consistency (passenger realm with staff actor rejected)
runSavepointProbe(6, function () use ($pStaffId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postStaffLogin\', \'success\', NULL, ?, false, ?, \'staff_user\', ?, \'{}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pStaffId, (string) Str::uuid(), $pStaffId]);
}, '23514', 'chk_audit_events_actor', $errors, $stats);

// Probe 07: Audit event rejects unapproved target_type
runSavepointProbe(7, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'credit_card\', ?, \'{}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid(), $pUserId]);
}, '23514', 'chk_audit_events_target_type', $errors, $stats);

// Probe 08: Audit event rejects non-UUID target_id on user target
runSavepointProbe(8, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', \'not-a-valid-uuid\', \'{}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid()]);
}, '23514', 'chk_audit_events_target_id', $errors, $stats);

// Probe 09: Audit metadata rejects negative integer sentinel in attempt_count
runSavepointProbe(9, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{"attempt_count": -1}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid(), $pUserId]);
}, '23514', 'chk_audit_events_metadata_values', $errors, $stats);

// Probe 10: Audit metadata rejects string where number expected (safe CASE type evaluation)
runSavepointProbe(10, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{"attempt_count": "string_not_number"}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid(), $pUserId]);
}, '23514', 'chk_audit_events_metadata_values', $errors, $stats);

// Probe 11: Audit metadata rejects PII keys
runSavepointProbe(11, function () use ($pUserId) {
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{"email": "user@example.com"}\'::jsonb, NOW())
    ', [(string) Str::uuid(), $pUserId, (string) Str::uuid(), $pUserId]);
}, '23514', 'chk_audit_events_metadata_keys', $errors, $stats);

// Probe 12: Audit immutability trigger blocks UPDATE
runSavepointProbe(12, function () use ($pUserId) {
    $auditId = (string) Str::uuid();
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, NOW())
    ', [$auditId, $pUserId, (string) Str::uuid(), $pUserId]);

    DB::statement("UPDATE audit_events SET outcome = 'failure' WHERE id = ?", [$auditId]);
}, 'P0001', 'audit_events is append-only: UPDATE and DELETE are prohibited', $errors, $stats);

// Probe 13: Audit immutability trigger blocks DELETE
runSavepointProbe(13, function () use ($pUserId) {
    $auditId = (string) Str::uuid();
    DB::statement('
        INSERT INTO audit_events (
            id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
            request_id, target_type, target_id, metadata, occurred_at
        )
        VALUES (?, \'passenger\', \'postPassengerLogin\', \'success\', ?, NULL, false, ?, \'user\', ?, \'{}\'::jsonb, NOW())
    ', [$auditId, $pUserId, (string) Str::uuid(), $pUserId]);

    DB::statement("DELETE FROM audit_events WHERE id = ?", [$auditId]);
}, 'P0001', 'audit_events is append-only: UPDATE and DELETE are prohibited', $errors, $stats);

// Probe 14: Audit immutability trigger blocks TRUNCATE
runSavepointProbe(14, function () {
    DB::statement('TRUNCATE TABLE audit_events');
}, 'P0001', 'audit_events is append-only: TRUNCATE is prohibited', $errors, $stats);

// Probe 15: Saved travelers requires at least one trimmed name
runSavepointProbe(15, function () use ($pUserId) {
    DB::statement('
        INSERT INTO saved_travelers (
            id, owner_user_id, external_id, first_name, last_name, created_at, updated_at
        )
        VALUES (?, ?, \'ext-001\', \'\', \'\', NOW(), NOW())
    ', [(string) Str::uuid(), $pUserId]);
}, '23514', 'chk_saved_travelers_name', $errors, $stats);

DB::rollBack();

echo "\n";

// -----------------------------------------------------------------------------
// SECTION 3: Genuine Two-Process Concurrency Proof
// -----------------------------------------------------------------------------
echo "[3/4] Genuine two-process PostgreSQL concurrency barrier...\n";

/**
 * Asserts in pg_stat_activity that $blockedPid is blocked by $blockerPid.
 */
function assertBlocked(int $blockedPid, int $blockerPid): bool
{
    for ($i = 0; $i < 40; $i++) {
        $rows = DB::select('
            SELECT pid, wait_event_type, pg_blocking_pids(pid) AS blockers
            FROM pg_stat_activity
            WHERE pid = ?
        ', [$blockedPid]);

        if (!empty($rows)) {
            $blockerStr = trim($rows[0]->blockers, '{}');
            if ($blockerStr !== '') {
                $blockerList = array_map('intval', explode(',', $blockerStr));
                if (in_array($blockerPid, $blockerList, true)) {
                    return true;
                }
            }
        }
        usleep(25000);
    }
    return false;
}

// 3A. Competing Infant Links on Same Adult
$cBooking = PersistenceTestFactory::createBooking();
$cAdult = PersistenceTestFactory::createBookingPassenger([
    'booking_id' => $cBooking,
    'type' => 'adult',
    'passenger_index' => 0,
]);

$cInfant1 = (string) Str::uuid();
$cInfant2 = (string) Str::uuid();

$w1 = new ConcurrencyWorkerProcess();
$w2 = new ConcurrencyWorkerProcess();

try {
    $w1->begin();
    $w2->begin();

    // Worker 1 inserts infant 1 (uncommitted)
    $w1->execute(
        'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'Inf1\', \'Fam\', ?, NOW(), NOW())',
        [$cInfant1, $cBooking, 'req_c_1', $cAdult]
    );

    // Worker 2 attempts competing infant 2 on same adult
    $w2->sendCommand([
        'action' => 'exec',
        'sql' => 'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 2, \'infant\', \'Inf2\', \'Fam\', ?, NOW(), NOW())',
        'params' => [$cInfant2, $cBooking, 'req_c_2', $cAdult],
    ]);

    // Observe Worker 2 blocked in PostgreSQL pg_stat_activity
    if (assertBlocked($w2->getBackendPid(), $w1->getBackendPid())) {
        echo "  [3A] Observed Worker 2 (PID {$w2->getBackendPid()}) blocked by Worker 1 (PID {$w1->getBackendPid()}) on competing infant link.\n";
    } else {
        $errors[] = "Two-process concurrency probe 3A failed: Worker 2 did not block on Worker 1 in PostgreSQL";
    }

    // Worker 1 commits
    $w1->commit();

    // Worker 2 unblocks with 23505 unique violation
    $res2 = $w2->readLine(5.0);
    $w2->rollback();

    if ($res2 && $res2['status'] === 'ERROR' && $res2['sqlstate'] === '23505' && ($res2['tag'] ?? '') === 'uq_booking_passengers_infant_adult') {
        echo "  [3A] Worker 2 unblocked and failed with expected SQLSTATE 23505 (uq_booking_passengers_infant_adult).\n";
        $stats['concurrency_probes_passed']++;
    } else {
        $errors[] = "Two-process concurrency probe 3A failed: Worker 2 did not raise 23505 on competing infant link";
    }

    // Final state query
    $infantCnt = DB::table('booking_passengers')
        ->where('booking_id', $cBooking)
        ->where('type', 'infant')
        ->count();

    if ($infantCnt === 1) {
        echo "  [3A] Invalid final state query confirmed exactly 1 infant committed in database.\n";
    } else {
        $errors[] = "Invalid final state 3A: expected 1 infant, found {$infantCnt}";
    }
} finally {
    $w1->close();
    $w2->close();
}

// 3B. Infant Insertion Blocks Concurrent Adult Type Mutation
$bBooking = PersistenceTestFactory::createBooking();
$bAdult = PersistenceTestFactory::createBookingPassenger([
    'booking_id' => $bBooking,
    'type' => 'adult',
    'passenger_index' => 0,
]);
$bInfant = (string) Str::uuid();

$w1 = new ConcurrencyWorkerProcess();
$w2 = new ConcurrencyWorkerProcess();

try {
    $w1->begin();
    $w2->begin();

    $w1->execute(
        'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'InfB\', \'Fam\', ?, NOW(), NOW())',
        [$bInfant, $bBooking, 'req_b_1', $bAdult]
    );
    $w1->execute('SET CONSTRAINTS trg_booking_passengers_adult_target IMMEDIATE');

    // Worker 2 attempts to mutate adult type to child
    $w2->sendCommand([
        'action' => 'exec',
        'sql' => 'UPDATE booking_passengers SET type = \'child\' WHERE id = ? AND booking_id = ?',
        'params' => [$bAdult, $bBooking],
    ]);

    if (assertBlocked($w2->getBackendPid(), $w1->getBackendPid())) {
        echo "  [3B] Observed Worker 2 (PID {$w2->getBackendPid()}) blocked by Worker 1 (PID {$w1->getBackendPid()}) on adult row lock.\n";
    } else {
        $errors[] = "Two-process concurrency probe 3B failed: Worker 2 did not block on adult lock in PostgreSQL";
    }

    $w1->commit();

    $res2 = $w2->readLine(5.0);
    if ($res2 && $res2['status'] === 'OK') {
        $w2->sendCommand(['action' => 'commit']);
        $res2 = $w2->readLine(5.0);
    }
    $w2->rollback();

    if ($res2 && $res2['status'] === 'ERROR' && $res2['sqlstate'] === 'P0001' && ($res2['tag'] ?? '') === 'Cannot modify or delete adult passenger linked by an infant') {
        echo "  [3B] Worker 2 unblocked and aborted with expected SQLSTATE P0001 (adult protected by committed infant).\n";
        $stats['concurrency_probes_passed']++;
    } else {
        $errors[] = "Two-process concurrency probe 3B failed: Worker 2 did not raise P0001 on adult mutation";
    }

    $invalidCnt = (int) DB::selectOne('
        SELECT count(*) AS cnt
        FROM booking_passengers i
        JOIN booking_passengers a ON i.linked_adult_passenger_id = a.id AND i.booking_id = a.booking_id
        WHERE i.type = \'infant\' AND a.type != \'adult\'
    ')->cnt;

    if ($invalidCnt === 0) {
        echo "  [3B] Invalid final state query confirmed 0 infants linked to non-adults.\n";
    } else {
        $errors[] = "Invalid final state 3B: found {$invalidCnt} infants linked to non-adult";
    }
} finally {
    $w1->close();
    $w2->close();
}

// 3C. Adult Type Mutation Blocks Concurrent Infant Insertion
$cBooking3 = PersistenceTestFactory::createBooking();
$cAdult3 = PersistenceTestFactory::createBookingPassenger([
    'booking_id' => $cBooking3,
    'type' => 'adult',
    'passenger_index' => 0,
]);
$cInfant3 = (string) Str::uuid();

$w1 = new ConcurrencyWorkerProcess();
$w2 = new ConcurrencyWorkerProcess();

try {
    $w1->begin();
    $w2->begin();

    // Worker 2 mutates adult type to child (uncommitted)
    $w2->execute(
        'UPDATE booking_passengers SET type = \'child\' WHERE id = ? AND booking_id = ?',
        [$cAdult3, $cBooking3]
    );

    // Worker 1 inserts infant and evaluates deferred trigger immediately
    $w1->execute(
        'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'InfC\', \'Fam\', ?, NOW(), NOW())',
        [$cInfant3, $cBooking3, 'req_c_3', $cAdult3]
    );
    $w1->sendCommand([
        'action' => 'exec',
        'sql' => 'SET CONSTRAINTS trg_booking_passengers_adult_target IMMEDIATE',
    ]);

    if (assertBlocked($w1->getBackendPid(), $w2->getBackendPid())) {
        echo "  [3C] Observed Worker 1 (PID {$w1->getBackendPid()}) blocked by Worker 2 (PID {$w2->getBackendPid()}) on adult row lock.\n";
    } else {
        $errors[] = "Two-process concurrency probe 3C failed: Worker 1 did not block on adult lock in PostgreSQL";
    }

    $w2->commit();

    $res1 = $w1->readLine(5.0);
    $w1->rollback();

    if ($res1 && $res1['status'] === 'ERROR' && $res1['sqlstate'] === 'P0001' && ($res1['tag'] ?? '') === 'Infant passenger must link to an adult passenger in the same booking') {
        echo "  [3C] Worker 1 unblocked and aborted with expected SQLSTATE P0001 (observed committed adult is now child).\n";
        $stats['concurrency_probes_passed']++;
    } else {
        $errors[] = "Two-process concurrency probe 3C failed: Worker 1 did not raise P0001 on infant insertion against non-adult";
    }

    $invalidCnt3 = (int) DB::selectOne('
        SELECT count(*) AS cnt
        FROM booking_passengers i
        JOIN booking_passengers a ON i.linked_adult_passenger_id = a.id AND i.booking_id = a.booking_id
        WHERE i.type = \'infant\' AND a.type != \'adult\'
    ')->cnt;

    if ($invalidCnt3 === 0) {
        echo "  [3C] Invalid final state query confirmed 0 infants linked to non-adults.\n\n";
    } else {
        $errors[] = "Invalid final state 3C: found {$invalidCnt3} infants linked to non-adult";
    }
} finally {
    $w1->close();
    $w2->close();
}

// -----------------------------------------------------------------------------
// SECTION 4: 3-Migration Rollback and Preservation Verification
// -----------------------------------------------------------------------------
echo "[4/4] 3-Migration rollback and preservation verification...\n";

$core15Tables = [
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

$foundation6Tables = [
    'migrations',
    'cache',
    'cache_locks',
    'jobs',
    'job_batches',
    'failed_jobs',
];

// 1. Rollback our 3 migrations
Artisan::call('migrate:rollback', ['--step' => 3, '--database' => 'pgsql_test', '--env' => 'testing']);

$tablesAfterRollback = array_column(
    DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    'table_name'
);

$all15CorePreserved = true;
foreach ($core15Tables as $ct) {
    if (!in_array($ct, $tablesAfterRollback, true)) {
        $all15CorePreserved = false;
        $errors[] = "Rollback defect: core table {$ct} was dropped";
    }
}

$all6FoundationPreserved = true;
foreach ($foundation6Tables as $ft) {
    if (!in_array($ft, $tablesAfterRollback, true)) {
        $all6FoundationPreserved = false;
        $errors[] = "Rollback defect: foundation table {$ft} was dropped";
    }
}

$all13RelationsDropped = true;
foreach ($exact13Relations as $rel) {
    if (in_array($rel, $tablesAfterRollback, true)) {
        $all13RelationsDropped = false;
        $errors[] = "Rollback defect: relation {$rel} was not dropped by down()";
    }
}

if ($all15CorePreserved && $all6FoundationPreserved && $all13RelationsDropped) {
    $stats['rollback_preservation_verified'] = true;
    echo "  -> Rollback verified: All 15 core tables and 6 foundation tables preserved intact.\n";
    echo "  -> All 13 Phase 13B persistence relations cleanly removed.\n";
} else {
    $errors[] = "3-Migration rollback failed preservation check";
}

// 2. Re-apply our 3 migrations to leave database in clean working state
Artisan::call('migrate', ['--database' => 'pgsql_test', '--env' => 'testing']);

$tablesAfterReapply = array_column(
    DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    'table_name'
);

$all13Reapplied = true;
foreach ($exact13Relations as $rel) {
    if (!in_array($rel, $tablesAfterReapply, true)) {
        $all13Reapplied = false;
        $errors[] = "Re-migration defect: relation {$rel} missing after re-apply";
    }
}

if ($all13Reapplied) {
    echo "  -> Re-migration verified: All 13 relations re-created and active.\n\n";
}

// -----------------------------------------------------------------------------
// FINAL SUMMARY & EXIT
// -----------------------------------------------------------------------------
$success = empty($errors);
echo "=== Probe Summary ===\n";
echo "Status: " . ($success ? "SUCCESS" : "FAILED") . "\n";
echo "Relations Verified: {$stats['relations_verified']}/13\n";
echo "Owned FKs: {$stats['owned_fks_count']} | Total Schema FKs: {$stats['total_schema_fks_count']}\n";
echo "Negative Probes: {$stats['negative_probes_passed']}/15 passed\n";
echo "Concurrency Probes: {$stats['concurrency_probes_passed']}/3 passed\n";
echo "Rollback Preservation: " . ($stats['rollback_preservation_verified'] ? "VERIFIED" : "FAILED") . "\n";

if (!$success) {
    echo "\nERRORS ENCOUNTERED:\n";
    foreach ($errors as $err) {
        echo "  - {$err}\n";
    }
    exit(1);
}

exit(0);
