<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityDirectory;

use App\Identity\Directory\DirectoryErrorCode;
use App\Identity\Directory\DirectoryMutationResult;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

final class DirectoryMutationResultTest extends TestCase
{
    public function test_success_result_structure(): void
    {
        $now = CarbonImmutable::parse('2026-10-10T12:00:00+00:00');
        $result = DirectoryMutationResult::success(2, $now);

        $this->assertTrue($result->success);
        $this->assertNull($result->errorCode);
        $this->assertNull($result->errorMessage);
        $this->assertSame(2, $result->eligibleAdminCount);
        $this->assertSame($now, $result->mutatedAt);

        $json = json_encode($result);
        $this->assertIsString($json);
        $decoded = json_decode($json, true);

        $this->assertSame([
            'success' => true,
            'error_code' => null,
            'eligible_admin_count' => 2,
            'mutated_at' => '2026-10-10T12:00:00+00:00',
        ], $decoded);
    }

    public function test_failure_result_uses_canonical_code_and_fixed_message(): void
    {
        $result = DirectoryMutationResult::failure(
            errorCode: DirectoryErrorCode::LAST_ADMIN_CONFLICT,
            eligibleAdminCount: 0
        );

        $this->assertFalse($result->success);
        $this->assertSame(DirectoryErrorCode::LAST_ADMIN_CONFLICT, $result->errorCode);
        $this->assertSame(
            'Directory mutation rejected: at least one eligible administrator must remain active and fully configured.',
            $result->errorMessage
        );
        $this->assertSame(0, $result->eligibleAdminCount);
        $this->assertNull($result->mutatedAt);

        $decoded = json_decode(json_encode($result), true);
        $this->assertSame([
            'success' => false,
            'error_code' => DirectoryErrorCode::LAST_ADMIN_CONFLICT,
            'eligible_admin_count' => 0,
            'mutated_at' => null,
        ], $decoded);
    }

    public function test_arbitrary_error_code_sentinel_is_sanitized_and_never_leaked(): void
    {
        $credentialSentinel = 'SECRET_PASSWORD_SENTINEL_XYZ_12345';
        $result = DirectoryMutationResult::failure($credentialSentinel);

        // Must map to unknown_error, never reflecting the sentinel
        $this->assertSame(DirectoryErrorCode::UNKNOWN_ERROR, $result->errorCode);
        $this->assertSame('An unknown directory error occurred.', $result->errorMessage);

        // 1. json_encode probe
        $json = (string) json_encode($result);
        $this->assertStringNotContainsString($credentialSentinel, $json);

        // 2. get_object_vars probe
        $vars = get_object_vars($result);
        $this->assertStringNotContainsString($credentialSentinel, var_export($vars, true));
        $this->assertSame(DirectoryErrorCode::UNKNOWN_ERROR, $vars['errorCode']);

        // 3. direct property probes
        $this->assertStringNotContainsString($credentialSentinel, (string) $result->errorCode);
        $this->assertStringNotContainsString($credentialSentinel, (string) $result->errorMessage);

        // 4. serialize / debug probes
        $serialized = serialize($result);
        $this->assertStringNotContainsString($credentialSentinel, $serialized);

        $debug = var_export($result->__debugInfo(), true);
        $this->assertStringNotContainsString($credentialSentinel, $debug);

        // 5. string cast probe
        $this->assertStringNotContainsString($credentialSentinel, (string) $result);
    }

    public function test_negative_eligible_admin_count_is_clamped_to_zero(): void
    {
        $result = DirectoryMutationResult::failure(DirectoryErrorCode::LAST_ADMIN_CONFLICT, -5);
        $this->assertSame(0, $result->eligibleAdminCount);

        $success = DirectoryMutationResult::success(-3);
        $this->assertSame(0, $success->eligibleAdminCount);
    }

    public function test_deserialization_is_prohibited(): void
    {
        $result = DirectoryMutationResult::success(1);
        $serialized = serialize($result);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Deserialization of DirectoryMutationResult is prohibited.');
        unserialize($serialized);
    }

    public function test_to_string_summary(): void
    {
        $result = DirectoryMutationResult::failure(DirectoryErrorCode::STALE_ACTOR, 1);
        $string = (string) $result;

        $this->assertStringContainsString('DirectoryMutationResult', $string);
        $this->assertStringContainsString('stale_actor', $string);
        $this->assertStringContainsString('eligibleAdminCount=1', $string);
    }
}
