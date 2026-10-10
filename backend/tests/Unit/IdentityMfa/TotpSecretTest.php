<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Base32Codec;
use App\Identity\Mfa\Exceptions\InvalidSecretException;
use App\Identity\Mfa\TotpSecret;
use BadMethodCallException;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for TotpSecret value object and information hiding boundaries.
 */
class TotpSecretTest extends TestCase
{
    private const string VALID_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // 20 bytes = 160 bits

    /**
     * Successful instantiation from valid canonical Base32 string.
     */
    public function test_from_base32_creates_valid_secret(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);

        $this->assertSame(self::VALID_BASE32, $secret->revealBase32Secret());
        $this->assertSame('12345678901234567890', $secret->getBinarySecret());
        $this->assertSame(160, $secret->getEntropyBits());
    }

    /**
     * Cryptographic generation satisfies minimum entropy.
     */
    public function test_generate_creates_valid_random_secret(): void
    {
        $secret = TotpSecret::generate();

        $this->assertSame(160, $secret->getEntropyBits());
        $this->assertSame(32, strlen($secret->revealBase32Secret()));
        $this->assertSame(20, strlen($secret->getBinarySecret()));
    }

    /**
     * Rejection of sub-160-bit secret on instantiation.
     */
    public function test_rejects_sub_160_bit_secret(): void
    {
        // 16 bytes = 128 bits (too short for TOTP secret, which requires >= 160 bits)
        $shortBase32 = Base32Codec::encode(random_bytes(16));

        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('MFA secret provides insufficient entropy (minimum 160 bits required).');

        TotpSecret::fromBase32($shortBase32);
    }

    /**
     * Rejection of oversized secret on instantiation.
     */
    public function test_rejects_oversized_secret(): void
    {
        $oversizedBase32 = Base32Codec::encode(random_bytes(65));

        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('MFA secret exceeds maximum allowed length.');

        TotpSecret::fromBase32($oversizedBase32);
    }

    /**
     * Information hiding: var_export does not expose raw secret or Base32 text.
     */
    public function test_var_export_does_not_expose_secret(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);
        $exported = var_export($secret, true);

        $this->assertStringNotContainsString(self::VALID_BASE32, $exported);
        $this->assertStringNotContainsString('12345678901234567890', $exported);
    }

    /**
     * Information hiding: __debugInfo redacts secret.
     */
    public function test_debug_info_redacts_secret(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);
        $debug = $secret->__debugInfo();

        $this->assertSame('[REDACTED]', $debug['secret']);
        $this->assertSame(160, $debug['entropyBits']);
    }

    /**
     * Information hiding: jsonSerialize redacts secret.
     */
    public function test_json_serialize_redacts_secret(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);
        $json = json_encode($secret);

        $this->assertIsString($json);
        $this->assertStringNotContainsString(self::VALID_BASE32, $json);
        $this->assertStringContainsString('"secret":"[REDACTED]"', $json);
    }

    /**
     * Information hiding: string casting redacts secret.
     */
    public function test_to_string_redacts_secret(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);

        $this->assertSame('[REDACTED]', (string) $secret);
    }

    /**
     * Serialization is strictly prohibited.
     */
    public function test_serialization_is_prohibited(): void
    {
        $secret = TotpSecret::fromBase32(self::VALID_BASE32);

        $this->expectException(BadMethodCallException::class);
        $this->expectExceptionMessage('Serialization of MFA secret is prohibited.');

        serialize($secret);
    }
}
