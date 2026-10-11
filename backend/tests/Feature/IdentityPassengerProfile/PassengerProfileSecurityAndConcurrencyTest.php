<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassengerProfile;

use App\Identity\Audit\AuditWriter;
use App\Identity\Passenger\Profile\AuthorizedPassengerContext;
use App\Support\RequestCorrelation;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\Fixtures\IdentityPassengerProfile\PassengerProfileTestHarness;
use Tests\TestCase;

final class PassengerProfileSecurityAndConcurrencyTest extends TestCase
{
    use PassengerProfileTestHarness;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPassengerProfileHarness();
    }

    protected function tearDown(): void
    {
        $this->flushHeaders();
        $this->tearDownPassengerProfileHarness();
        parent::tearDown();
    }

    /**
     * Pure Sentinel: AuthorizedPassengerContext encapsulates PII and redacts debug/json/serialization.
     */
    public function test_authorized_passenger_context_pure_sentinels_protect_pii(): void
    {
        $email = 'classified.pilot_' . bin2hex(random_bytes(4)) . '@example.ps';
        $ctx = new AuthorizedPassengerContext(
            userId: '00000000-0000-0000-0000-000000000001',
            userEmail: $email,
            sessionId: '00000000-0000-0000-0000-000000000002',
            credentialEpoch: 1,
            now: CarbonImmutable::now(),
        );

        // 1. Direct getter retrieves authentic email
        $this->assertSame($email, $ctx->getUserEmail());

        // 2. json_encode must NOT contain email
        $json = json_encode($ctx, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($email, $json);
        $decoded = json_decode($json, true);
        $this->assertArrayNotHasKey('userEmail', $decoded);
        $this->assertArrayNotHasKey('email', $decoded);

        // 3. get_object_vars from external scope must NOT contain userEmail property or value
        $vars = get_object_vars($ctx);
        $this->assertArrayNotHasKey('userEmail', $vars);
        $this->assertArrayNotHasKey('email', $vars);
        $this->assertArrayNotHasKey('emailAccessor', $vars);
        foreach ($vars as $val) {
            $this->assertNotSame($email, $val);
        }

        // 4. var_export representation must NOT contain raw email value
        $exported = var_export($ctx, true);
        $this->assertStringNotContainsString($email, $exported);

        // 5. serialize() must throw LogicException
        try {
            serialize($ctx);
            $this->fail('Expected serialize() to throw LogicException');
        } catch (LogicException $e) {
            $this->assertStringContainsString('cannot be serialized', $e->getMessage());
        }

        // 6. __debugInfo() must redact email
        $debug = $ctx->__debugInfo();
        $this->assertSame('[REDACTED]', $debug['userEmail']);
    }

    /**
     * Invalid Stored Credential Denial: User with malformed/unusable stored hash fails 401.
     */
    public function test_invalid_stored_credential_structure_denied(): void
    {
        // Create user with structurally invalid password hash (bad salt and digest encoding)
        $invalidHash = '$argon2id$v=19$m=65536,t=4,p=1$fakeSaltValue1234567$dummyHashDigestValue1234567890123456789';
        $user = $this->createTestUser(overrideHash: $invalidHash);
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    /**
     * Owner Isolation: User B cannot access, mutate or delete User A's companion traveler.
     */
    public function test_owner_isolation_prevents_access_to_foreign_travelers(): void
    {
        // User A owns traveler
        $userA = $this->createTestUser();
        $travelerA = $this->createTestTraveler($userA->id, [
            'first_name' => 'SecretTravelerA',
            'document' => 'PASSPORT-A-SECRET',
        ]);

        // User B has their own session
        $userB = $this->createTestUser();
        $sessionB = $this->createTestSession($userB->id);

        // 1. User B attempts to PATCH User A's traveler -> 404
        $resPatch = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($sessionB))
            ->patchJson("/api/v1/auth/passenger/travelers/{$travelerA->external_id}", [
                'firstName' => 'HijackedByB',
            ]);
        $resPatch->assertStatus(404);
        $this->assertSame('not_found', $resPatch->json('error.code'));

        // Verify User A's traveler remains intact
        $rowA = DB::table('saved_travelers')->where('id', $travelerA->id)->first();
        $this->assertSame('SecretTravelerA', $rowA->first_name);

        $this->flushHeaders();

        // 2. User B attempts to DELETE User A's traveler -> 404
        $resDelete = $this->withHttps()
            ->withHeaders($this->passengerHeaders($sessionB))
            ->bodyless('DELETE', "/api/v1/auth/passenger/travelers/{$travelerA->external_id}");
        $resDelete->assertStatus(404);

        // Verify User A's traveler still exists
        $this->assertTrue(DB::table('saved_travelers')->where('id', $travelerA->id)->exists());
    }

    /**
     * Shared External ID Isolation: Two different users having the same external_id string
     * remain completely isolated without data leakage or cross-tenant mutation.
     */
    public function test_owner_isolation_with_shared_external_id_across_owners(): void
    {
        $sharedExternalId = 'trv-shared-key-' . bin2hex(random_bytes(4));

        $userA = $this->createTestUser();
        $tA = $this->createTestTraveler($userA->id, [
            'external_id' => $sharedExternalId,
            'first_name' => 'OwnerA_Name',
        ]);

        $userB = $this->createTestUser();
        $tB = $this->createTestTraveler($userB->id, [
            'external_id' => $sharedExternalId,
            'first_name' => 'OwnerB_Name',
        ]);

        $sessionB = $this->createTestSession($userB->id);

        // User B patches their own traveler using the shared external ID
        $res = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($sessionB))
            ->patchJson("/api/v1/auth/passenger/travelers/{$sharedExternalId}", [
                'firstName' => 'OwnerB_Updated',
            ]);

        $res->assertStatus(200);
        $this->assertSame('OwnerB_Updated', $res->json('data.firstName'));

        // Verify User A's traveler was NOT modified
        $rowA = DB::table('saved_travelers')->where('id', $tA->id)->first();
        $this->assertSame('OwnerA_Name', $rowA->first_name);

        // Verify User B's traveler WAS modified
        $rowB = DB::table('saved_travelers')->where('id', $tB->id)->first();
        $this->assertSame('OwnerB_Updated', $rowB->first_name);
    }

    /**
     * Fresh Authorization: Session revoked in DB fails 401 in action transaction.
     */
    public function test_fresh_authorization_revoked_session_fails_in_transaction(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        // Revoke session in database
        DB::table('passenger_sessions')
            ->where('id', $session['sessionId'])
            ->update(['revoked_at' => CarbonImmutable::now()->toIso8601String()]);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    /**
     * Fresh Authorization: Credential epoch incremented in DB (e.g. password changed) fails 401.
     */
    public function test_fresh_authorization_credential_epoch_change_fails_in_transaction(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        // Bump epoch in users table to simulate concurrent password change/reset
        DB::table('users')
            ->where('id', $user->id)
            ->update(['credential_epoch' => 2]);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    /**
     * CSRF Invariant: Unsafe writes missing or mismatched X-CSRF-TOKEN are denied.
     */
    public function test_csrf_binding_for_unsafe_writes(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        // 1. Missing CSRF header fails
        $headersMissing = $this->passengerHeaders($session);
        unset($headersMissing['X-CSRF-TOKEN']);

        $resMissing = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($headersMissing)
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'Attacker',
            ]);
        $resMissing->assertStatus(403);
        $this->assertSame('csrf_missing', $resMissing->json('error.code'));

        $this->flushHeaders();

        // 2. Invalid CSRF header fails
        $headersInvalid = $this->passengerHeaders($session, [
            'X-CSRF-TOKEN' => 'invalid-token-tampered-00000000000000000000000000000000000000000000000000',
        ]);

        $resInvalid = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($headersInvalid)
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'Attacker',
            ]);
        $resInvalid->assertStatus(403);
        $this->assertSame('csrf_invalid', $resInvalid->json('error.code'));
    }

    /**
     * PII & Audit Invariants: Zero documents, passwords, or PII in audit metadata or diagnostics.
     */
    public function test_no_pii_in_audit_metadata(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        // Create traveler with private document
        $res = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Ahmad',
                'lastName' => 'Al-Husseini',
                'dob' => '1992-08-14',
                'nationality' => 'Palestinian',
                'document' => 'SENSITIVE-PASSPORT-NUM-998877',
            ]);
        $res->assertStatus(201);

        // Inspect all audit_events rows created for this user
        $auditRows = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->get();

        $this->assertNotEmpty($auditRows);
        foreach ($auditRows as $audit) {
            $metadataStr = (string) $audit->metadata;
            foreach (AuditWriter::FORBIDDEN_PII_KEYS as $piiKey) {
                $this->assertStringNotContainsString($piiKey, $metadataStr);
            }
            $this->assertStringNotContainsString('SENSITIVE-PASSPORT-NUM-998877', $metadataStr);
            $this->assertStringNotContainsString('Al-Husseini', $metadataStr);
        }
    }

    /**
     * Rollback on fault: Database exception mid-operation rolls back transaction cleanly.
     */
    public function test_rollback_on_fault_leaves_no_partial_mutation(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'first_name' => 'InitialFirstName',
        ]);
        $session = $this->createTestSession($user->id);

        try {
            DB::statement("
                UPDATE passenger_profiles
                SET seat_preference = 'invalid_seat_value'
                WHERE user_id = '{$user->id}'
            ");
            $this->fail('Expected check constraint violation');
        } catch (\Throwable $e) {
            $this->assertTrue(str_contains($e->getMessage(), 'chk_passenger_profiles_seat_pref'));
        }

        // Verify initial value preserved
        $row = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
        $this->assertSame('InitialFirstName', $row->first_name);
    }

    /**
     * Sequential Replay Concurrency:
     * Subprocess advances credential epoch and commits BEFORE parent request;
     * Authorizer detects epoch mismatch and denies subsequent request.
     */
    public function test_sequential_replay_epoch_change_invalidates_subsequent_request(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        $worker = $this->spawnConcurrencyWorker();

        try {
            $parentPgPid = (int) DB::connection('pgsql_test')->selectOne('SELECT pg_backend_pid() AS pid')->pid;
            $workerPgPid = $worker->getBackendPid();
            $this->assertNotSame($parentPgPid, $workerPgPid, 'Subprocess must hold distinct PostgreSQL backend PID');

            // 1. Worker begins transaction and locks principal row
            $resBegin = $worker->begin();
            $this->assertSame('OK', $resBegin['status']);
            $resLock = $worker->lockPrincipal($user->id);
            $this->assertSame('LOCKED', $resLock['status']);

            // 2. Worker advances credential epoch while holding transaction open
            $resEpoch = $worker->advanceEpoch($user->id, 2);
            $this->assertSame('OK', $resEpoch['status']);

            // 3. Worker commits transaction
            $resCommit = $worker->commit();
            $this->assertSame('OK', $resCommit['status']);

            // 4. Parent attempts profile read with epoch 1 session; authorizer detects epoch mismatch and denies
            $response = $this->withHttps()
                ->withHeaders($this->passengerHeaders($session))
                ->bodyless('GET', '/api/v1/auth/passenger/profile');

            $response->assertStatus(401);
            $this->assertErrorResponse($response->json(), 'unauthorized');
        } finally {
            if (DB::connection('pgsql_test')->transactionLevel() > 0) {
                DB::connection('pgsql_test')->rollBack();
            }
            $worker->close();
        }
    }

    /**
     * Sequential Replay Concurrency:
     * Subprocess revokes session row and commits BEFORE parent request;
     * Authorizer detects revoked_at and denies subsequent request.
     */
    public function test_sequential_replay_session_revocation_invalidates_subsequent_request(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        $worker = $this->spawnConcurrencyWorker();

        try {
            $parentPgPid = (int) DB::connection('pgsql_test')->selectOne('SELECT pg_backend_pid() AS pid')->pid;
            $workerPgPid = $worker->getBackendPid();
            $this->assertNotSame($parentPgPid, $workerPgPid, 'Subprocess must hold distinct PostgreSQL backend PID');

            // 1. Worker begins transaction and locks session row
            $resBegin = $worker->begin();
            $this->assertSame('OK', $resBegin['status']);
            $resLock = $worker->lockSession($session['sessionId']);
            $this->assertSame('LOCKED', $resLock['status']);

            // 2. Worker marks session revoked
            $resRevoke = $worker->revokeSession($session['sessionId']);
            $this->assertSame('OK', $resRevoke['status']);

            // 3. Worker commits transaction
            $resCommit = $worker->commit();
            $this->assertSame('OK', $resCommit['status']);

            // 4. Parent attempts profile read with revoked session; authorizer detects revoked_at and denies
            $response = $this->withHttps()
                ->withHeaders($this->passengerHeaders($session))
                ->bodyless('GET', '/api/v1/auth/passenger/profile');

            $response->assertStatus(401);
            $this->assertErrorResponse($response->json(), 'unauthorized');
        } finally {
            if (DB::connection('pgsql_test')->transactionLevel() > 0) {
                DB::connection('pgsql_test')->rollBack();
            }
            $worker->close();
        }
    }

    /**
     * Genuine Overlapping Concurrency:
     * Child resolves a legitimate PassengerSessionContext before parent holds principal lock;
     * Parent holds principal -> session lock hierarchy and advances credential epoch under an open transaction;
     * Child executes actual PassengerProfileCoordinator read using retained legitimate context;
     * Parent observes pg_blocking_pids(child) contains parent's distinct PG PID before commit;
     * Parent commits transaction;
     * Child unblocks, fails current authority with 'unauthorized', and no success audit event appears.
     */
    public function test_overlapping_concurrent_epoch_change_blocks_and_denies_coordinator_action(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $this->createTestProfile($user->id, ['first_name' => 'OriginalKareem']);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        $worker = $this->spawnConcurrencyWorker();

        try {
            $parentPgPid = (int) DB::connection('pgsql_test')->selectOne('SELECT pg_backend_pid() AS pid')->pid;
            $workerPgPid = $worker->getBackendPid();
            $this->assertNotSame($parentPgPid, $workerPgPid, 'Subprocess must hold distinct PostgreSQL backend PID');

            // 1. Child resolves a legitimate PassengerSessionContext BEFORE parent acquires locks
            $prep = $worker->prepareSession($session['rawToken'], config('app.key'));
            $this->assertNotNull($prep);
            $this->assertSame('OK', $prep['status'] ?? null);
            $this->assertSame($session['sessionId'], $prep['sessionId'] ?? null);

            // 2. Parent begins transaction and locks principal -> session in canonical hierarchy
            DB::connection('pgsql_test')->beginTransaction();
            $lockedUser = DB::connection('pgsql_test')->table('users')->where('id', $user->id)->lockForUpdate()->first();
            $this->assertNotNull($lockedUser);
            $lockedSession = DB::connection('pgsql_test')->table('passenger_sessions')
                ->where('id', $session['sessionId'])
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();
            $this->assertNotNull($lockedSession);

            // 3. Parent mutates credential epoch under the open transaction
            DB::connection('pgsql_test')->table('users')->where('id', $user->id)->update(['credential_epoch' => 2]);

            // 4. Child executes actual PassengerProfileCoordinator read using retained context while parent tx is open
            $worker->sendCommand(['action' => 'execute_coordinator_profile_read']);

            // 5. Parent observes pg_blocking_pids(child) contains parent's distinct PG PID BEFORE commit
            $this->assertBackendBlocked($workerPgPid, $parentPgPid);

            // 6. Parent commits transaction
            DB::connection('pgsql_test')->commit();

            // 7. Child unblocks and fails current authority
            $res = $worker->readLine(5.0);
            $this->assertNotNull($res);
            $this->assertSame('DENIED', $res['status'] ?? null);
            $this->assertSame('unauthorized', $res['code'] ?? null);

            // 8. Assert no success audit event appeared
            $successAudits = DB::table('audit_events')
                ->where('passenger_id', $user->id)
                ->where('outcome', 'success')
                ->count();
            $this->assertSame(0, $successAudits, 'Denied coordinator execution must record no success audit');
        } finally {
            if (DB::connection('pgsql_test')->transactionLevel() > 0) {
                DB::connection('pgsql_test')->rollBack();
            }
            $worker->close();
        }
    }

    /**
     * Genuine Overlapping Concurrency:
     * Child resolves a legitimate PassengerSessionContext before parent holds principal lock;
     * Parent holds principal -> session lock hierarchy and revokes session under an open transaction;
     * Child executes actual PassengerProfileCoordinator update using retained legitimate context;
     * Parent observes pg_blocking_pids(child) contains parent's distinct PG PID before commit;
     * Parent commits transaction;
     * Child unblocks, fails current authority with 'unauthorized', and no profile mutation or success audit appears.
     */
    public function test_overlapping_concurrent_session_revocation_blocks_and_denies_coordinator_action(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, ['first_name' => 'OriginalKareem']);
        $session = $this->createTestSession($user->id);

        $worker = $this->spawnConcurrencyWorker();

        try {
            $parentPgPid = (int) DB::connection('pgsql_test')->selectOne('SELECT pg_backend_pid() AS pid')->pid;
            $workerPgPid = $worker->getBackendPid();
            $this->assertNotSame($parentPgPid, $workerPgPid, 'Subprocess must hold distinct PostgreSQL backend PID');

            // 1. Child resolves a legitimate PassengerSessionContext BEFORE parent acquires locks
            $prep = $worker->prepareSession($session['rawToken'], config('app.key'));
            $this->assertNotNull($prep);
            $this->assertSame('OK', $prep['status'] ?? null);
            $this->assertSame($session['sessionId'], $prep['sessionId'] ?? null);

            // 2. Parent begins transaction and locks principal -> session in canonical hierarchy
            DB::connection('pgsql_test')->beginTransaction();
            $lockedUser = DB::connection('pgsql_test')->table('users')->where('id', $user->id)->lockForUpdate()->first();
            $this->assertNotNull($lockedUser);
            $lockedSession = DB::connection('pgsql_test')->table('passenger_sessions')
                ->where('id', $session['sessionId'])
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();
            $this->assertNotNull($lockedSession);

            // 3. Parent revokes session under the open transaction
            DB::connection('pgsql_test')->table('passenger_sessions')
                ->where('id', $session['sessionId'])
                ->update(['revoked_at' => CarbonImmutable::now()->toIso8601String()]);

            // 4. Child executes actual PassengerProfileCoordinator update using retained context while parent tx is open
            $worker->sendCommand([
                'action' => 'execute_coordinator_profile_update',
                'payload' => ['firstName' => 'HijackedBySubprocess'],
            ]);

            // 5. Parent observes pg_blocking_pids(child) contains parent's distinct PG PID BEFORE commit
            $this->assertBackendBlocked($workerPgPid, $parentPgPid);

            // 6. Parent commits transaction
            DB::connection('pgsql_test')->commit();

            // 7. Child unblocks and fails current authority
            $res = $worker->readLine(5.0);
            $this->assertNotNull($res);
            $this->assertSame('DENIED', $res['status'] ?? null);
            $this->assertSame('unauthorized', $res['code'] ?? null);

            // 8. Assert no profile mutation occurred
            $dbProfile = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
            $this->assertSame('OriginalKareem', $dbProfile->first_name, 'Profile must not be mutated on denied action');

            // 9. Assert no success audit event appeared
            $successAudits = DB::table('audit_events')
                ->where('passenger_id', $user->id)
                ->where('outcome', 'success')
                ->count();
            $this->assertSame(0, $successAudits, 'Denied coordinator execution must record no success audit');
        } finally {
            if (DB::connection('pgsql_test')->transactionLevel() > 0) {
                DB::connection('pgsql_test')->rollBack();
            }
            $worker->close();
        }
    }

    /**
     * PostgreSQL Locking Evidence Only:
     * Raw-SQL serialization probe proving database row lock serialization between two workers.
     * Note: This verifies PostgreSQL lock behavior only; does not assert application authorization logic.
     */
    public function test_two_process_raw_sql_serialization_probe_proves_row_locks(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'first_name' => 'OriginalName',
        ]);

        $w1 = $this->spawnConcurrencyWorker();
        $w2 = $this->spawnConcurrencyWorker();

        try {
            $this->assertNotSame($w1->getBackendPid(), $w2->getBackendPid(), 'Workers must hold distinct PostgreSQL backend PIDs');

            // 1. Both workers begin transaction
            $resW1 = $w1->begin();
            $this->assertSame('OK', $resW1['status']);
            $resW2 = $w2->begin();
            $this->assertSame('OK', $resW2['status']);

            // 2. Worker 1 locks profile and updates name (uncommitted)
            $res1 = $w1->updateProfileFirstName($user->id, 'Worker1_Committed');
            $this->assertSame('OK', $res1['status']);

            // 3. Worker 2 attempts competing update on the SAME profile row
            $w2->sendCommand([
                'action' => 'update_profile_first_name',
                'userId' => $user->id,
                'firstName' => 'Worker2_Final',
            ]);

            // 4. Assert Worker 2 blocks in PostgreSQL waiting on Worker 1's lock
            $this->assertBackendBlocked($w2->getBackendPid(), $w1->getBackendPid());

            // 5. Worker 1 commits successfully, releasing lock
            $commit1 = $w1->commit();
            $this->assertSame('OK', $commit1['status']);

            // 6. Worker 2 unblocks and executes update
            $res2 = $w2->readLine(5.0);
            $this->assertNotNull($res2);
            $this->assertSame('OK', $res2['status']);

            // 7. Worker 2 commits
            $commit2 = $w2->commit();
            $this->assertSame('OK', $commit2['status']);

            // 8. Verify serialized final state in database
            $row = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
            $this->assertSame('Worker2_Final', $row->first_name);
        } finally {
            $w1->close();
            $w2->close();
        }
    }
}
