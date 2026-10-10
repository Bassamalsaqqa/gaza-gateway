<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Exceptions\InvalidRecoveryCodeException;
use App\Identity\Mfa\RecoveryCode;
use App\Identity\Mfa\RecoveryCodeBatch;
use BadMethodCallException;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for RecoveryCodeBatch collection and invariants.
 */
class RecoveryCodeBatchTest extends TestCase
{
    /**
     * Generation produces exactly 10 independent, unique recovery codes.
     */
    public function test_generate_creates_ten_unique_codes(): void
    {
        $batch = RecoveryCodeBatch::generate();

        $this->assertCount(10, $batch);
        $this->assertSame(10, $batch->count());
        $this->assertSame(RecoveryCode::PURPOSE, $batch->getPurpose());

        $plaintexts = $batch->revealPlaintextCodesForEnrollmentOnly();
        $this->assertCount(10, $plaintexts);

        // Verify pairwise uniqueness across plaintexts
        $uniquePlaintexts = array_unique($plaintexts);
        $this->assertCount(10, $uniquePlaintexts, 'All 10 generated recovery codes must be strictly unique.');

        $digests = $batch->getDigests();
        $this->assertCount(10, $digests);

        // Verify pairwise uniqueness across digests
        $uniqueDigests = array_unique($digests);
        $this->assertCount(10, $uniqueDigests, 'All 10 generated code digests must be strictly unique.');

        // Verify all codes conform to canonical format
        foreach ($plaintexts as $code) {
            $this->assertSame(32, strlen($code));
            $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/D', $code);
        }

        foreach ($digests as $digest) {
            $this->assertSame(64, strlen($digest));
            $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/D', $digest);
        }

        // Verify getCodes() consistency
        $codeObjects = $batch->getCodes();
        $this->assertCount(10, $codeObjects);
        for ($i = 0; $i < 10; $i++) {
            $this->assertSame($plaintexts[$i], $codeObjects[$i]->revealPlaintextForEnrollmentOnly());
            $this->assertSame($digests[$i], $codeObjects[$i]->getDigest());
        }
    }

    /**
     * Rejection if batch constructor receives count other than exactly 10.
     */
    public function test_rejects_non_ten_count_in_constructor(): void
    {
        $nineCodes = array_map(static fn() => RecoveryCode::generate(), range(1, 9));

        $refClass = new \ReflectionClass(RecoveryCodeBatch::class);
        $constructor = $refClass->getConstructor();
        $this->assertNotNull($constructor);

        $this->expectException(InvalidRecoveryCodeException::class);
        $this->expectExceptionMessage('Recovery code batch must contain exactly 10 codes.');

        $instance = $refClass->newInstanceWithoutConstructor();
        $constructor->invoke($instance, $nineCodes);
    }

    /**
     * Rejection if duplicate codes are present in candidate set.
     */
    public function test_rejects_duplicate_codes_in_batch(): void
    {
        // Reflection to instantiate private constructor with duplicate codes
        $singleCode = RecoveryCode::generate();
        $duplicateArray = array_fill(0, 10, $singleCode);

        $refClass = new \ReflectionClass(RecoveryCodeBatch::class);
        $constructor = $refClass->getConstructor();
        $this->assertNotNull($constructor);

        $this->expectException(InvalidRecoveryCodeException::class);
        $this->expectExceptionMessage('Duplicate recovery code detected in batch.');

        $instance = $refClass->newInstanceWithoutConstructor();
        $constructor->invoke($instance, $duplicateArray);
    }

    /**
     * Information hiding: var_export does not expose plaintext codes or digests.
     */
    public function test_var_export_does_not_expose_codes_or_digests(): void
    {
        $batch = RecoveryCodeBatch::generate();
        $plaintexts = $batch->revealPlaintextCodesForEnrollmentOnly();
        $digests = $batch->getDigests();
        $exported = var_export($batch, true);

        foreach ($plaintexts as $code) {
            $this->assertStringNotContainsString($code, $exported);
        }
        foreach ($digests as $digest) {
            $this->assertStringNotContainsString($digest, $exported);
        }
    }

    /**
     * Information hiding: __debugInfo redacts both codes and digests.
     */
    public function test_debug_info_redacts_codes_and_digests(): void
    {
        $batch = RecoveryCodeBatch::generate();
        $plaintexts = $batch->revealPlaintextCodesForEnrollmentOnly();
        $digests = $batch->getDigests();
        $debug = $batch->__debugInfo();

        $this->assertSame('[REDACTED]', $debug['codes']);
        $this->assertSame('[REDACTED]', $debug['digests']);
        $this->assertSame(10, $debug['count']);
        $this->assertSame(RecoveryCode::PURPOSE, $debug['purpose']);

        $debugString = print_r($batch, true);
        foreach ($plaintexts as $code) {
            $this->assertStringNotContainsString($code, $debugString);
        }
        foreach ($digests as $digest) {
            $this->assertStringNotContainsString($digest, $debugString);
        }
    }

    /**
     * Information hiding: jsonSerialize redacts both codes and digests.
     */
    public function test_json_serialize_redacts_codes_and_digests(): void
    {
        $batch = RecoveryCodeBatch::generate();
        $plaintexts = $batch->revealPlaintextCodesForEnrollmentOnly();
        $digests = $batch->getDigests();
        $json = json_encode($batch);

        $this->assertIsString($json);
        $this->assertStringContainsString('"codes":"[REDACTED]"', $json);
        $this->assertStringContainsString('"digests":"[REDACTED]"', $json);

        foreach ($plaintexts as $code) {
            $this->assertStringNotContainsString($code, $json);
        }
        foreach ($digests as $digest) {
            $this->assertStringNotContainsString($digest, $json);
        }
    }

    /**
     * Information hiding: string casting redacts codes.
     */
    public function test_to_string_redacts_codes(): void
    {
        $batch = RecoveryCodeBatch::generate();

        $this->assertSame('[REDACTED]', (string) $batch);
    }

    /**
     * Prohibit PHP serialization.
     */
    public function test_serialization_is_prohibited(): void
    {
        $batch = RecoveryCodeBatch::generate();

        $this->expectException(BadMethodCallException::class);
        $this->expectExceptionMessage('Serialization of MFA recovery code batch is prohibited.');

        serialize($batch);
    }
}
