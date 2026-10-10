<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Exceptions\InvalidRecoveryCodeException;
use App\Identity\Mfa\RecoveryCode;
use BadMethodCallException;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for RecoveryCode primitive, canonicalization, information hiding,
 * and timing-safe digest verification.
 */
class RecoveryCodeTest extends TestCase
{
    private const string VALID_CODE_LOWER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    private const string VALID_CODE_UPPER = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

    /**
     * Generation creates 32-character canonical lowercase hexadecimal code.
     */
    public function test_generate_creates_canonical_code(): void
    {
        $code = RecoveryCode::generate();

        $raw = $code->revealPlaintextForEnrollmentOnly();
        $this->assertSame(32, strlen($raw));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/D', $raw);
        $this->assertSame(RecoveryCode::PURPOSE, $code->getPurpose());

        $digest = $code->getDigest();
        $this->assertSame(64, strlen($digest));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/D', $digest);
        $this->assertSame(hash('sha256', $raw), $digest);

        // Explicit 16 bytes parameter also succeeds
        $codeExplicit = RecoveryCode::generate(16);
        $this->assertSame(32, strlen($codeExplicit->revealPlaintextForEnrollmentOnly()));
    }

    /**
     * Generation strictly rejects any entropy size other than 16 bytes before allocation.
     * Prevents unbounded memory allocation for 0, 15, 17, PHP_INT_MAX, and negative values.
     */
    public function test_generate_rejects_invalid_entropy_sizes_without_allocating(): void
    {
        $invalidSizes = [0, 15, 17, -1, PHP_INT_MAX];

        foreach ($invalidSizes as $size) {
            try {
                RecoveryCode::generate($size);
                $this->fail("Expected InvalidRecoveryCodeException for entropy size: {$size}");
            } catch (InvalidRecoveryCodeException $e) {
                $this->assertSame('Recovery code generation requires exactly 16 bytes (128 bits) of entropy.', $e->getMessage());
            }
        }
    }

    /**
     * Instantiation from valid plaintext preserves canonical representation.
     */
    public function test_from_plaintext_canonicalizes_case(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_UPPER);

        $this->assertSame(self::VALID_CODE_LOWER, $code->revealPlaintextForEnrollmentOnly());
        $this->assertSame(hash('sha256', self::VALID_CODE_LOWER), $code->getDigest());
    }

    /**
     * Constant-time comparison positive and negative controls.
     */
    public function test_verify_digest_positive_and_negative_controls(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);
        $digest = $code->getDigest();

        // Positive control: exact matching code
        $this->assertTrue(RecoveryCode::verifyDigest($digest, self::VALID_CODE_LOWER));

        // Positive control: uppercase version matches due to strict ASCII canonicalization
        $this->assertTrue(RecoveryCode::verifyDigest($digest, self::VALID_CODE_UPPER));

        // Negative control: altered code
        $alteredCode = 'b1b2c3d4e5f60718293a4b5c6d7e8f90';
        $this->assertFalse(RecoveryCode::verifyDigest($digest, $alteredCode));

        // Negative control: malformed code
        $this->assertFalse(RecoveryCode::verifyDigest($digest, 'invalid_malformed'));

        // Negative control: altered digest
        $tamperedDigest = substr_replace($digest, '0', 0, 1);
        $this->assertFalse(RecoveryCode::verifyDigest($tamperedDigest, self::VALID_CODE_LOWER));

        // Negative control: wrong digest length
        $this->assertFalse(RecoveryCode::verifyDigest('short_digest', self::VALID_CODE_LOWER));
    }

    /**
     * Strict rejection of whitespace (leading, trailing, interior space/tab/newline).
     */
    public function test_rejects_whitespace(): void
    {
        $whitespaceInputs = [
            ' ' . self::VALID_CODE_LOWER,
            self::VALID_CODE_LOWER . ' ',
            substr(self::VALID_CODE_LOWER, 0, 16) . ' ' . substr(self::VALID_CODE_LOWER, 16),
            "\t" . self::VALID_CODE_LOWER,
            self::VALID_CODE_LOWER . "\n",
        ];

        foreach ($whitespaceInputs as $input) {
            try {
                RecoveryCode::canonicalize($input);
                $this->fail('Expected InvalidRecoveryCodeException for whitespace input');
            } catch (InvalidRecoveryCodeException $e) {
                $this->assertNotEmpty($e->getMessage());
            }
        }
    }

    /**
     * Strict rejection of hyphens/dashes.
     */
    public function test_rejects_dashes_or_separators(): void
    {
        $dashed = 'a1b2-c3d4-e5f6-0718-293a-4b5c-6d7e-8f90';

        $this->expectException(InvalidRecoveryCodeException::class);
        RecoveryCode::canonicalize($dashed);
    }

    /**
     * Strict rejection of non-hex characters and lookalikes.
     */
    public function test_rejects_non_hex_characters_and_lookalikes(): void
    {
        $lookalikes = [
            'o1b2c3d4e5f60718293a4b5c6d7e8f90', // letter 'o' instead of '0'
            'l1b2c3d4e5f60718293a4b5c6d7e8f90', // letter 'l' instead of '1'
            'g1b2c3d4e5f60718293a4b5c6d7e8f90', // letter 'g'
            'z1b2c3d4e5f60718293a4b5c6d7e8f90', // letter 'z'
        ];

        foreach ($lookalikes as $input) {
            try {
                RecoveryCode::canonicalize($input);
                $this->fail("Expected InvalidRecoveryCodeException for input: {$input}");
            } catch (InvalidRecoveryCodeException $e) {
                $this->assertSame('Supplied recovery code contains invalid characters or lookalikes.', $e->getMessage());
            }
        }
    }

    /**
     * Strict rejection of Unicode homoglyphs.
     */
    public function test_rejects_unicode_homoglyphs(): void
    {
        // Cyrillic small 'а' (U+0430) instead of ASCII 'a'
        $cyrillicA = "\xD0\xB0" . substr(self::VALID_CODE_LOWER, 1);

        $this->expectException(InvalidRecoveryCodeException::class);
        RecoveryCode::canonicalize($cyrillicA);
    }

    /**
     * Strict rejection of wrong length.
     */
    public function test_rejects_wrong_length(): void
    {
        $short = substr(self::VALID_CODE_LOWER, 0, 31);
        $long = self::VALID_CODE_LOWER . 'a';

        try {
            RecoveryCode::canonicalize($short);
            $this->fail('Expected exception for short code');
        } catch (InvalidRecoveryCodeException $e) {
            $this->assertSame('Supplied recovery code must be exactly 32 characters.', $e->getMessage());
        }

        try {
            RecoveryCode::canonicalize($long);
            $this->fail('Expected exception for long code');
        } catch (InvalidRecoveryCodeException $e) {
            $this->assertSame('Supplied recovery code must be exactly 32 characters.', $e->getMessage());
        }
    }

    /**
     * Information hiding: var_export does not expose plaintext code or persistent digest.
     */
    public function test_var_export_does_not_expose_code_or_digest(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);
        $digest = $code->getDigest();
        $exported = var_export($code, true);

        $this->assertStringNotContainsString(self::VALID_CODE_LOWER, $exported);
        $this->assertStringNotContainsString($digest, $exported);
    }

    /**
     * Information hiding: __debugInfo redacts both plaintext code and persistent digest.
     */
    public function test_debug_info_redacts_code_and_digest(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);
        $digest = $code->getDigest();
        $debug = $code->__debugInfo();

        $this->assertSame('[REDACTED]', $debug['code']);
        $this->assertSame('[REDACTED]', $debug['digest']);
        $this->assertSame(RecoveryCode::PURPOSE, $debug['purpose']);

        $debugDump = print_r($code, true);
        $this->assertStringNotContainsString(self::VALID_CODE_LOWER, $debugDump);
        $this->assertStringNotContainsString($digest, $debugDump);
    }

    /**
     * Information hiding: jsonSerialize redacts both plaintext code and persistent digest.
     */
    public function test_json_serialize_redacts_code_and_digest(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);
        $digest = $code->getDigest();
        $json = json_encode($code);

        $this->assertIsString($json);
        $this->assertStringNotContainsString(self::VALID_CODE_LOWER, $json);
        $this->assertStringNotContainsString($digest, $json);
        $this->assertStringContainsString('"code":"[REDACTED]"', $json);
        $this->assertStringContainsString('"digest":"[REDACTED]"', $json);
    }

    /**
     * Information hiding: string casting redacts code.
     */
    public function test_to_string_redacts_code(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);

        $this->assertSame('[REDACTED]', (string) $code);
    }

    /**
     * Prohibit PHP serialization.
     */
    public function test_serialization_is_prohibited(): void
    {
        $code = RecoveryCode::fromPlaintext(self::VALID_CODE_LOWER);

        $this->expectException(BadMethodCallException::class);
        $this->expectExceptionMessage('Serialization of MFA recovery code is prohibited.');

        serialize($code);
    }

    /**
     * Exception messages must never reflect supplied candidate code.
     */
    public function test_exception_messages_do_not_reflect_code(): void
    {
        $secretCode = 'INVALIDSECRETCODEVALUETOBEKEPT12';

        try {
            RecoveryCode::canonicalize($secretCode);
            $this->fail('Expected exception');
        } catch (InvalidRecoveryCodeException $e) {
            $this->assertStringNotContainsString('INVALIDSECRET', $e->getMessage());
        }
    }
}
