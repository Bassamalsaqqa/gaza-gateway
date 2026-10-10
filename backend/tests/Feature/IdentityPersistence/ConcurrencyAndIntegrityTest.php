<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPersistence\ConcurrencyWorkerProcess;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;
use Tests\TestCase;

class ConcurrencyAndIntegrityTest extends TestCase
{
    /**
     * Helper to poll PostgreSQL until a target backend PID is actively blocked by an expected blocker PID.
     * Times out safely after $timeoutMs.
     */
    private function assertBackendBlocked(int $blockedPid, int $expectedBlockerPid, int $timeoutMs = 3000): void
    {
        $start = microtime(true);
        $observedBlockers = [];

        while ((microtime(true) - $start) * 1000 < $timeoutMs) {
            $rows = DB::select('
                SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
                FROM pg_stat_activity
                WHERE pid = ?
            ', [$blockedPid]);

            if (!empty($rows)) {
                $blockerStr = trim($rows[0]->blockers, '{}');
                if ($blockerStr !== '') {
                    $observedBlockers = array_map('intval', explode(',', $blockerStr));
                    if (in_array($expectedBlockerPid, $observedBlockers, true)) {
                        $this->assertSame('Lock', $rows[0]->wait_event_type, 'Expected PostgreSQL wait_event_type to be Lock');
                        return;
                    }
                }
            }

            usleep(25000); // 25ms
        }

        $this->fail(sprintf(
            'Backend PID %d was not blocked by PID %d within %d ms (observed blockers: %s)',
            $blockedPid,
            $expectedBlockerPid,
            $timeoutMs,
            json_encode($observedBlockers)
        ));
    }

    public function test_two_process_competing_infant_links_exactly_one_commits(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $adult = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'adult',
            'passenger_index' => 0,
        ]);

        $infant1 = (string) Str::uuid();
        $infant2 = (string) Str::uuid();

        $w1 = new ConcurrencyWorkerProcess();
        $w2 = new ConcurrencyWorkerProcess();

        try {
            $this->assertNotSame($w1->getBackendPid(), $w2->getBackendPid());

            // 1. Both workers begin transaction
            $resW1 = $w1->begin();
            $this->assertSame('OK', $resW1['status']);
            $resW2 = $w2->begin();
            $this->assertSame('OK', $resW2['status']);

            // 2. Worker 1 inserts infant 1 linking adult (uncommitted)
            $res1 = $w1->execute(
                'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'Infant1\', \'Fam\', ?, NOW(), NOW())',
                [$infant1, $booking, 'req_inf_1', $adult]
            );
            $this->assertSame('OK', $res1['status']);

            // 3. Worker 2 attempts competing insert of infant 2 linking the SAME adult
            $w2->sendCommand([
                'action' => 'exec',
                'sql' => 'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 2, \'infant\', \'Infant2\', \'Fam\', ?, NOW(), NOW())',
                'params' => [$infant2, $booking, 'req_inf_2', $adult],
            ]);

            // 4. Assert Worker 2 blocks in PostgreSQL waiting on Worker 1's lock
            $this->assertBackendBlocked($w2->getBackendPid(), $w1->getBackendPid());

            // 5. Worker 1 commits successfully
            $commit1 = $w1->commit();
            $this->assertSame('OK', $commit1['status']);

            // 6. Worker 2 unblocks and fails with unique constraint violation (23505 on uq_booking_passengers_infant_adult)
            $res2 = $w2->readLine(5.0);
            $this->assertNotNull($res2);
            $this->assertSame('ERROR', $res2['status']);
            $this->assertSame('23505', $res2['sqlstate']);
            $this->assertSame('uq_booking_passengers_infant_adult', $res2['tag'] ?? null);

            $w2->rollback();

            // 7. Invalid final state check: exactly one infant committed, zero infants with conflicting adult
            $infants = DB::table('booking_passengers')
                ->where('booking_id', $booking)
                ->where('type', 'infant')
                ->get();
            $this->assertCount(1, $infants);
            $this->assertSame($infant1, $infants[0]->id);
        } finally {
            $w1->close();
            $w2->close();
        }
    }

    public function test_two_process_interleaving_infant_insertion_blocks_adult_type_mutation(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $adult = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'adult',
            'passenger_index' => 0,
        ]);

        $infant = (string) Str::uuid();

        $w1 = new ConcurrencyWorkerProcess();
        $w2 = new ConcurrencyWorkerProcess();

        try {
            $w1->begin();
            $w2->begin();

            // 1. Worker 1 inserts infant linked to Adult
            $res1 = $w1->execute(
                'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'Infant1\', \'Fam\', ?, NOW(), NOW())',
                [$infant, $booking, 'req_inf_1', $adult]
            );
            $this->assertSame('OK', $res1['status']);

            // Force deferred trigger to run immediately in Worker 1, acquiring FOR NO KEY UPDATE on Adult
            $resLock = $w1->execute('SET CONSTRAINTS trg_booking_passengers_adult_target IMMEDIATE');
            $this->assertSame('OK', $resLock['status']);

            // 2. Worker 2 concurrently attempts to mutate Adult type from 'adult' to 'child'
            $w2->sendCommand([
                'action' => 'exec',
                'sql' => 'UPDATE booking_passengers SET type = \'child\' WHERE id = ? AND booking_id = ?',
                'params' => [$adult, $booking],
            ]);

            // 3. Worker 2 BLOCKS on Adult row lock held by Worker 1
            $this->assertBackendBlocked($w2->getBackendPid(), $w1->getBackendPid());

            // 4. Worker 1 commits infant
            $commit1 = $w1->commit();
            $this->assertSame('OK', $commit1['status']);

            // 5. Worker 2 unblocks, trigger sees newly committed infant, and aborts adult modification with P0001
            $res2 = $w2->readLine(5.0);
            if ($res2 && $res2['status'] === 'OK') {
                // If update executed, deferred trigger fires on commit
                $w2->sendCommand(['action' => 'commit']);
                $res2 = $w2->readLine(5.0);
            }
            $this->assertNotNull($res2);
            $this->assertSame('ERROR', $res2['status']);
            $this->assertSame('P0001', $res2['sqlstate']);
            $this->assertSame('Cannot modify or delete adult passenger linked by an infant', $res2['tag'] ?? null);

            $w2->rollback();

            // 6. Invalid final state check: Adult remains 'adult', no infant linked to non-adult
            $invalidCount = DB::selectOne('
                SELECT count(*) AS cnt
                FROM booking_passengers i
                JOIN booking_passengers a ON i.linked_adult_passenger_id = a.id AND i.booking_id = a.booking_id
                WHERE i.type = \'infant\' AND a.type != \'adult\'
            ')->cnt;
            $this->assertSame(0, (int) $invalidCount);

            $adultRow = DB::table('booking_passengers')->where('id', $adult)->first();
            $this->assertSame('adult', $adultRow->type);
        } finally {
            $w1->close();
            $w2->close();
        }
    }

    public function test_two_process_interleaving_adult_type_mutation_blocks_infant_insertion(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $adult = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'adult',
            'passenger_index' => 0,
        ]);

        $infant = (string) Str::uuid();

        $w1 = new ConcurrencyWorkerProcess();
        $w2 = new ConcurrencyWorkerProcess();

        try {
            $w1->begin();
            $w2->begin();

            // 1. Worker 2 mutates Adult type to 'child' (acquires exclusive row lock on Adult, uncommitted)
            $res2 = $w2->execute(
                'UPDATE booking_passengers SET type = \'child\' WHERE id = ? AND booking_id = ?',
                [$adult, $booking]
            );
            $this->assertSame('OK', $res2['status']);

            // 2. Worker 1 inserts infant and forces constraint check (trigger attempts SELECT ... FOR NO KEY UPDATE on Adult)
            $resInf = $w1->execute(
                'INSERT INTO booking_passengers (id, booking_id, request_local_id, passenger_index, type, first_name, last_name, linked_adult_passenger_id, created_at, updated_at) VALUES (?, ?, ?, 1, \'infant\', \'Infant1\', \'Fam\', ?, NOW(), NOW())',
                [$infant, $booking, 'req_inf_1', $adult]
            );
            $this->assertSame('OK', $resInf['status']);

            // Trigger adult validation which attempts SELECT ... FOR NO KEY UPDATE on Adult
            $w1->sendCommand([
                'action' => 'exec',
                'sql' => 'SET CONSTRAINTS trg_booking_passengers_adult_target IMMEDIATE',
            ]);

            // 3. Worker 1 BLOCKS on Adult row lock held by Worker 2
            $this->assertBackendBlocked($w1->getBackendPid(), $w2->getBackendPid());

            // 4. Worker 2 commits Adult as 'child'
            $commit2 = $w2->commit();
            $this->assertSame('OK', $commit2['status']);

            // 5. Worker 1 unblocks, re-evaluates Adult row, observes target is 'child' != 'adult', aborts with P0001
            $res1 = $w1->readLine(5.0);
            $this->assertNotNull($res1);
            $this->assertSame('ERROR', $res1['status']);
            $this->assertSame('P0001', $res1['sqlstate']);
            $this->assertSame('Infant passenger must link to an adult passenger in the same booking', $res1['tag'] ?? null);

            $w1->rollback();

            // 6. Invalid final state check: Adult is 'child', Infant was not inserted, no invalid state
            $invalidCount = DB::selectOne('
                SELECT count(*) AS cnt
                FROM booking_passengers i
                JOIN booking_passengers a ON i.linked_adult_passenger_id = a.id AND i.booking_id = a.booking_id
                WHERE i.type = \'infant\' AND a.type != \'adult\'
            ')->cnt;
            $this->assertSame(0, (int) $invalidCount);

            $this->assertDatabaseMissing('booking_passengers', ['id' => $infant]);
        } finally {
            $w1->close();
            $w2->close();
        }
    }

    public function test_deferred_same_transaction_valid_adult_and_infant_insertion(): void
    {
        $booking = PersistenceTestFactory::createBooking();
        $adultId = (string) Str::uuid();
        $infantId = (string) Str::uuid();

        // Inserting infant while adult is temporarily 'child', then updating adult to 'adult' before commit succeeds
        DB::transaction(function () use ($booking, $adultId, $infantId) {
            DB::statement('
                INSERT INTO booking_passengers (
                    id, booking_id, request_local_id, passenger_index, type, first_name, last_name,
                    linked_adult_passenger_id, created_at, updated_at
                )
                VALUES (?, ?, \'req_adl_def\', 0, \'child\', \'AdultDef\', \'Fam\', NULL, NOW(), NOW())
            ', [$adultId, $booking]);

            DB::statement('
                INSERT INTO booking_passengers (
                    id, booking_id, request_local_id, passenger_index, type, first_name, last_name,
                    linked_adult_passenger_id, created_at, updated_at
                )
                VALUES (?, ?, \'req_inf_def\', 1, \'infant\', \'InfantDef\', \'Fam\', ?, NOW(), NOW())
            ', [$infantId, $booking, $adultId]);

            // Fix adult type to 'adult' prior to commit
            DB::statement('UPDATE booking_passengers SET type = \'adult\' WHERE id = ?', [$adultId]);
        });

        $this->assertDatabaseHas('booking_passengers', ['id' => $infantId, 'type' => 'infant']);
        $this->assertDatabaseHas('booking_passengers', ['id' => $adultId, 'type' => 'adult']);
    }

    public function test_physical_staff_deletion_cannot_erase_audit_provenance(): void
    {
        $staff = PersistenceTestFactory::createStaffUser();
        $auditId = (string) Str::uuid();

        DB::statement('
            INSERT INTO audit_events (
                id, realm, action, outcome, passenger_id, staff_id, is_system_actor,
                request_id, target_type, target_id, metadata, occurred_at
            )
            VALUES (?, \'staff\', \'postStaffLogin\', \'success\', NULL, ?, false, ?, \'staff_user\', ?, \'{}\'::jsonb, NOW())
        ', [$auditId, $staff, (string) Str::uuid(), $staff]);

        // Attempting to physically delete staff_user must be rejected by foreign key RESTRICT
        try {
            DB::statement('DELETE FROM staff_users WHERE id = ?', [$staff]);
            $this->fail('Expected physical staff deletion to be rejected by ON DELETE RESTRICT foreign key');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_audit_events_staff', $e->getMessage());
        }
    }

    public function test_outbox_wrong_purpose_or_invalid_fk_binding(): void
    {
        $nonExistentProofId = (string) Str::uuid();

        // Attempting to reference non-existent challenge ID rejected by FK
        try {
            DB::statement('
                INSERT INTO security_dispatch_outbox (
                    id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id,
                    booking_challenge_id, encrypted_payload, status, provider_message_id,
                    accepted_at, scrubbed_at, expires_at, attempts
                )
                VALUES (?, NULL, NULL, NULL, NULL, ?, \'payload\', \'queued\', NULL, NULL, NULL, NOW() + INTERVAL \'10 minutes\', 0)
            ', [(string) Str::uuid(), $nonExistentProofId]);
            $this->fail('Expected foreign key violation on invalid booking_challenge_id');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_security_dispatch_outbox_booking_chal', $e->getMessage());
        }
    }

    public function test_concurrency_worker_rejects_non_testing_app_env(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('ConcurrencyWorker failed to initialize safely');

        new ConcurrencyWorkerProcess(['APP_ENV' => 'production']);
    }

    public function test_concurrency_worker_rejects_non_test_database_target_and_leaves_targets_untouched(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('ConcurrencyWorker failed to initialize safely');

        new ConcurrencyWorkerProcess(['DB_TEST_DATABASE' => 'gaza_gateway_dev']);
    }

    public function test_concurrency_worker_rejects_missing_credentials(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('ConcurrencyWorker failed to initialize safely');

        new ConcurrencyWorkerProcess(['DB_PASSWORD' => '']);
    }
}
