<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityLifecycle;

use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Audit\Exceptions\AuditValidationException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;

class AuditEventsTest extends TestCase
{
    private AuditWriter $writer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->writer = new AuditWriter(DB::connection());
    }

    public function test_records_valid_audit_events_for_all_three_actors(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $staffId = LifecycleTestFactory::createStaffUser();

        // 1. Passenger actor
        $passengerEventId = $this->writer->record(
            actor: AuditActor::passenger($userId),
            action: 'postPassengerEmailVerify',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $userId,
            metadata: ['consumed' => true, 'status' => 'verified'],
        );

        $row1 = DB::table('audit_events')->where('id', $passengerEventId)->first();
        $this->assertNotNull($row1);
        $this->assertSame('passenger', $row1->realm);
        $this->assertSame($userId, $row1->passenger_id);
        $this->assertNull($row1->staff_id);
        $this->assertFalse($row1->is_system_actor);
        $this->assertSame('postPassengerEmailVerify', $row1->action);
        $this->assertSame('success', $row1->outcome);

        // 2. Staff actor
        $staffEventId = $this->writer->record(
            actor: AuditActor::staff($staffId),
            action: 'postStaffInvitationAccept',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::StaffUser,
            targetId: $staffId,
            metadata: ['status' => 'active'],
        );

        $row2 = DB::table('audit_events')->where('id', $staffEventId)->first();
        $this->assertNotNull($row2);
        $this->assertSame('staff', $row2->realm);
        $this->assertNull($row2->passenger_id);
        $this->assertSame($staffId, $row2->staff_id);
        $this->assertFalse($row2->is_system_actor);

        // 3. System actor
        $systemEventId = $this->writer->record(
            actor: AuditActor::system(),
            action: 'auth.security_dispatch_queued',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::SecurityDispatch,
            targetId: $userId,
            metadata: ['status' => 'active', 'count' => 1],
        );

        $row3 = DB::table('audit_events')->where('id', $systemEventId)->first();
        $this->assertNotNull($row3);
        $this->assertSame('system', $row3->realm);
        $this->assertNull($row3->passenger_id);
        $this->assertNull($row3->staff_id);
        $this->assertTrue($row3->is_system_actor);
    }

    public function test_unknown_login_subject_records_system_actor_without_identifier_disclosure(): void
    {
        $eventId = $this->writer->recordUnknownSubjectAttempt(
            action: 'auth.login_denied_unknown_subject'
        );

        $row = DB::table('audit_events')->where('id', $eventId)->first();
        $this->assertNotNull($row);
        $this->assertSame('system', $row->realm);
        $this->assertNull($row->passenger_id);
        $this->assertNull($row->staff_id);
        $this->assertTrue($row->is_system_actor);
        $this->assertSame('system', $row->target_type);
        $this->assertSame('none', $row->target_id);

        $metadata = json_decode($row->metadata, true);
        $this->assertSame('unknown_subject', $metadata['reason_code']);
        $this->assertSame('denied', $metadata['status']);

        // Assert zero PII or subject identifiers in metadata
        $this->assertArrayNotHasKey('email', $metadata);
        $this->assertArrayNotHasKey('username', $metadata);
        $this->assertArrayNotHasKey('subject', $metadata);
    }

    public function test_db_immutability_triggers_reject_update_and_delete(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $eventId = $this->writer->record(
            actor: AuditActor::passenger($userId),
            action: 'postPassengerRegister',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $userId,
        );

        // Direct SQL UPDATE must be rejected by trigger
        $updateFailed = false;
        try {
            DB::statement('UPDATE audit_events SET outcome = ? WHERE id = ?', ['failure', $eventId]);
        } catch (QueryException $e) {
            $updateFailed = true;
            $this->assertStringContainsString('audit_events is append-only: UPDATE and DELETE are prohibited', $e->getMessage());
        }
        $this->assertTrue($updateFailed, 'Expected PostgreSQL trigger to reject UPDATE on audit_events');

        // Direct SQL DELETE must be rejected by trigger
        $deleteFailed = false;
        try {
            DB::statement('DELETE FROM audit_events WHERE id = ?', [$eventId]);
        } catch (QueryException $e) {
            $deleteFailed = true;
            $this->assertStringContainsString('audit_events is append-only: UPDATE and DELETE are prohibited', $e->getMessage());
        }
        $this->assertTrue($deleteFailed, 'Expected PostgreSQL trigger to reject DELETE on audit_events');
    }

    public function test_pre_flight_metadata_validation_rejects_pii_before_db(): void
    {
        $userId = LifecycleTestFactory::createUser();

        $this->expectException(AuditValidationException::class);
        $this->expectExceptionMessage('Forbidden PII or secret key rejected in audit metadata.');

        $this->writer->record(
            actor: AuditActor::passenger($userId),
            action: 'postPassengerEmailVerify',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $userId,
            metadata: ['email' => 'leaked@example.com'],
        );
    }
}
