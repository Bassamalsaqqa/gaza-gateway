<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityLifecycle;

use App\Identity\Audit\AuditAction;
use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Audit\Exceptions\AuditValidationException;
use PHPUnit\Framework\TestCase;

class AuditWriterValidationTest extends TestCase
{
    private AuditWriter $writer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->writer = new AuditWriter();
    }

    public function test_rejects_forbidden_pii_and_secret_keys(): void
    {
        $forbiddenKeys = [
            'email' => 'user@example.com',
            'password' => 'secret123',
            'password_hash' => '$argon2id$...',
            'token' => 'abc',
            'token_digest' => 'def',
            'code_digest' => '123',
            'digest' => '456',
            'secret' => 'topsecret',
            'otp' => '123456',
            'document' => 'passport_xyz',
            'body' => 'message body',
            'url' => 'https://example.com/confirm',
            'ip' => '192.168.1.1',
        ];

        foreach ($forbiddenKeys as $k => $v) {
            try {
                $this->writer->validateMetadata([$k => $v]);
                $this->fail("Expected AuditValidationException for forbidden key [{$k}]");
            } catch (AuditValidationException $e) {
                $this->assertStringContainsString('Forbidden PII or secret key', $e->getMessage());
            }
        }
    }

    public function test_rejects_arbitrary_unapproved_metadata_keys(): void
    {
        $this->expectException(AuditValidationException::class);
        $this->expectExceptionMessage('Unapproved key rejected in audit metadata.');
        $this->writer->validateMetadata(['arbitrary_field' => 'value']);
    }

    public function test_validates_approved_numeric_keys_and_ranges(): void
    {
        // Negative count should fail
        try {
            $this->writer->validateMetadata(['attempt_count' => -1]);
            $this->fail('Expected failure for negative attempt_count');
        } catch (AuditValidationException $e) {
            $this->assertStringContainsString('Numeric metadata key violates bounded integer constraints.', $e->getMessage());
        }

        // Float should fail
        try {
            $this->writer->validateMetadata(['attempt_count' => 2.5]);
            $this->fail('Expected failure for float attempt_count');
        } catch (AuditValidationException $e) {
            $this->assertStringContainsString('Numeric metadata key violates bounded integer constraints.', $e->getMessage());
        }

        // String representation of integer should fail
        try {
            $this->writer->validateMetadata(['attempt_count' => '5']);
            $this->fail('Expected failure for string attempt_count');
        } catch (AuditValidationException $e) {
            $this->assertStringContainsString('Numeric metadata key violates bounded integer constraints.', $e->getMessage());
        }

        // Valid integers pass
        $this->writer->validateMetadata([
            'attempt_count' => 3,
            'failed_attempts' => 1,
            'count' => 10,
            'version' => 1,
            'epoch' => 2,
        ]);
        $this->assertTrue(true);
    }

    public function test_validates_approved_boolean_keys(): void
    {
        try {
            $this->writer->validateMetadata(['revoked' => 'true']);
            $this->fail('Expected failure for string boolean');
        } catch (AuditValidationException $e) {
            $this->assertStringContainsString('Boolean metadata key violates boolean constraint.', $e->getMessage());
        }

        $this->writer->validateMetadata([
            'revoked' => true,
            'consumed' => false,
            'is_new' => true,
            'success' => true,
        ]);
        $this->assertTrue(true);
    }

    public function test_validates_closed_reason_and_status_codes(): void
    {
        try {
            $this->writer->validateMetadata(['reason_code' => 'fake_unauthorized_reason']);
            $this->fail('Expected failure for invalid reason_code');
        } catch (AuditValidationException $e) {
            $this->assertStringContainsString('is not in approved list', $e->getMessage());
        }

        $this->writer->validateMetadata([
            'reason_code' => 'invalid_credentials',
            'status' => 'denied',
            'error_code' => 'ERR_INVALID_CREDENTIALS',
            'code' => 'INVALID_CREDENTIALS',
        ]);
        $this->assertTrue(true);
    }

    public function test_audit_actor_enforces_uuid_and_realm_consistency(): void
    {
        $userId = '00000000-0000-0000-0000-000000000001';
        $passenger = AuditActor::passenger($userId);
        $this->assertSame('passenger', $passenger->realm);
        $this->assertSame($userId, $passenger->passengerId);
        $this->assertNull($passenger->staffId);
        $this->assertFalse($passenger->isSystemActor);

        $staffId = '00000000-0000-0000-0000-000000000002';
        $staff = AuditActor::staff($staffId);
        $this->assertSame('staff', $staff->realm);
        $this->assertNull($staff->passengerId);
        $this->assertSame($staffId, $staff->staffId);
        $this->assertFalse($staff->isSystemActor);

        $system = AuditActor::system();
        $this->assertSame('system', $system->realm);
        $this->assertNull($system->passengerId);
        $this->assertNull($system->staffId);
        $this->assertTrue($system->isSystemActor);

        // Non-UUID passenger throws
        $this->expectException(AuditValidationException::class);
        AuditActor::passenger('not-a-uuid');
    }
}
