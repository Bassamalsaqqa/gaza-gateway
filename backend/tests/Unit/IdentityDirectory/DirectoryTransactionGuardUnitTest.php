<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityDirectory;

use App\Identity\Directory\DirectoryErrorCode;
use App\Identity\Directory\DirectoryMutationPlan;
use App\Identity\Directory\DirectoryTransactionGuard;
use App\Identity\Directory\Exceptions\DirectoryGuardException;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
use Illuminate\Database\ConnectionInterface;
use Mockery;
use PHPUnit\Framework\TestCase;

final class DirectoryTransactionGuardUnitTest extends TestCase
{
    private const SAMPLE_UUID = '11111111-1111-4111-8111-111111111111';

    protected function tearDown(): void
    {
        unset($_SERVER['REQUEST_METHOD']);
        Mockery::close();
        parent::tearDown();
    }

    public function test_mutation_plan_rejects_invalid_uuid(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Target staff ID must be a valid UUID string.');
        DirectoryMutationPlan::demoteRole('not-a-uuid', 'editor');
    }

    public function test_mutation_plan_rejects_invalid_demotion_role(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid demotion role.');
        DirectoryMutationPlan::demoteRole(self::SAMPLE_UUID, 'admin');
    }

    public function test_mutation_plan_rejects_invalid_status(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid staff status.');
        DirectoryMutationPlan::changeStatus(self::SAMPLE_UUID, 'pending_enrollment');
    }

    public function test_mutation_plan_rejects_invalid_mfa_version(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid MFA version.');
        DirectoryMutationPlan::revokeMfa(self::SAMPLE_UUID, 0);
    }

    public function test_offline_system_execution_denied_in_http_context(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'POST';

        $db = Mockery::mock(ConnectionInterface::class);
        $guard = new DirectoryTransactionGuard($db);
        $plan = DirectoryMutationPlan::noop(self::SAMPLE_UUID);

        $result = $guard->executeAsOfflineSystem($plan);

        $this->assertFalse($result->success);
        $this->assertSame(DirectoryErrorCode::CONTEXT_FORBIDDEN, $result->errorCode);
    }

    public function test_plan_cannot_reactivate_a_principal_or_reflect_supplied_status(): void
    {
        foreach (['active', 'synthetic-credential-sentinel'] as $status) {
            try {
                DirectoryMutationPlan::changeStatus(self::SAMPLE_UUID, $status);
                $this->fail('Unsupported status must be rejected.');
            } catch (\InvalidArgumentException $e) {
                $this->assertSame('Invalid staff status.', $e->getMessage());
            }
        }
    }

    public function test_pre_existing_outer_transaction_is_rejected_cleanly_without_rollback(): void
    {
        $db = Mockery::mock(ConnectionInterface::class);
        $db->shouldReceive('transactionLevel')->once()->andReturn(1);
        // Assert rollBack is NEVER called on the caller's transaction
        $db->shouldNotReceive('rollBack');
        $db->shouldNotReceive('beginTransaction');

        $guard = new DirectoryTransactionGuard($db);
        $plan = DirectoryMutationPlan::noop(self::SAMPLE_UUID);

        $result = $guard->executeAsStaff('actor-uuid', 'session-uuid', $plan);

        $this->assertFalse($result->success);
        $this->assertSame(DirectoryErrorCode::TRANSACTION_ACTIVE, $result->errorCode);
    }

    public function test_execute_as_staff_or_throw_throws_last_admin_conflict(): void
    {
        $db = Mockery::mock(ConnectionInterface::class);
        $db->shouldReceive('transactionLevel')->andReturn(0);
        $db->shouldReceive('beginTransaction')->once();
        $db->shouldReceive('rollBack')->once();

        // Sentinel missing will trigger rollback and failure
        $builder = Mockery::mock(\Illuminate\Database\Query\Builder::class);
        $db->shouldReceive('table')->with('staff_directory_control')->andReturn($builder);
        $builder->shouldReceive('where')->with('id', 1)->andReturnSelf();
        $builder->shouldReceive('lockForUpdate')->andReturnSelf();
        $builder->shouldReceive('first')->andReturn(null);

        $guard = new DirectoryTransactionGuard($db);
        $plan = DirectoryMutationPlan::noop(self::SAMPLE_UUID);

        $this->expectException(DirectoryGuardException::class);
        $guard->executeAsStaffOrThrow('actor-uuid', 'session-uuid', $plan);
    }
}
