<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Base32Codec;
use App\Identity\Mfa\Exceptions\InvalidSecretException;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for strict RFC 4648 Base32 codec.
 */
class Base32CodecTest extends TestCase
{
    /**
     * Verify official RFC 4648 test vectors (unpadded canonical uppercase).
     */
    public function test_rfc4648_test_vectors_encode_and_decode(): void
    {
        $vectors = [
            'f' => 'MY',
            'fo' => 'MZXQ',
            'foo' => 'MZXW6',
            'foob' => 'MZXW6YQ',
            'fooba' => 'MZXW6YTB',
            'foobar' => 'MZXW6YTBOI',
            '12345678901234567890' => 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        ];

        foreach ($vectors as $raw => $expectedBase32) {
            $encoded = Base32Codec::encode($raw);
            $this->assertSame($expectedBase32, $encoded);

            $decoded = Base32Codec::decode($encoded);
            $this->assertSame($raw, $decoded);
        }
    }

    /**
     * Verify roundtrip fidelity across arbitrary byte lengths.
     */
    public function test_arbitrary_byte_roundtrip(): void
    {
        for ($len = 1; $len <= 35; $len++) {
            $bytes = random_bytes($len);
            $encoded = Base32Codec::encode($bytes);
            $decoded = Base32Codec::decode($encoded);

            $this->assertSame($bytes, $decoded);
        }
    }

    /**
     * Strict rejection of padding characters ('=').
     */
    public function test_rejects_padding_characters(): void
    {
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Base32 string contains invalid characters or padding.');

        Base32Codec::decode('MY======');
    }

    /**
     * Strict rejection of lowercase characters.
     */
    public function test_rejects_lowercase_characters(): void
    {
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Base32 string contains invalid characters or padding.');

        Base32Codec::decode('mzxw6ytboi');
    }

    /**
     * Strict rejection of ambiguous digits not in Base32 alphabet (0, 1, 8, 9).
     */
    public function test_rejects_non_base32_digits(): void
    {
        $invalidChars = ['0', '1', '8', '9'];

        foreach ($invalidChars as $char) {
            try {
                // 'MZXW6YT' is 7 chars. Appending $char makes it 8 chars (valid mod 8 = 0).
                Base32Codec::decode('MZXW6YT' . $char);
                $this->fail("Expected InvalidSecretException for character: {$char}");
            } catch (InvalidSecretException $e) {
                $this->assertSame('Base32 string contains invalid characters or padding.', $e->getMessage());
            }
        }
    }

    /**
     * Strict rejection of empty string on encode.
     */
    public function test_rejects_empty_data_on_encode(): void
    {
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Cannot Base32-encode empty data.');

        Base32Codec::encode('');
    }

    /**
     * Strict rejection of empty string on decode.
     */
    public function test_rejects_empty_string_on_decode(): void
    {
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Base32 string cannot be empty.');

        Base32Codec::decode('');
    }

    /**
     * Strict rejection of mathematically impossible unpadded Base32 lengths (mod 8 = 1, 3, 6).
     */
    public function test_rejects_invalid_unpadded_lengths_modulo_eight(): void
    {
        $invalidLengths = [1, 3, 6, 9, 11, 14];

        foreach ($invalidLengths as $len) {
            $candidate = str_repeat('A', $len);
            try {
                Base32Codec::decode($candidate);
                $this->fail("Expected InvalidSecretException for invalid unpadded length: {$len}");
            } catch (InvalidSecretException $e) {
                $this->assertSame('Base32 string has invalid unpadded length.', $e->getMessage());
            }
        }
    }

    /**
     * Strict rejection of non-canonical unused extra bits in the final character across all modulo lengths.
     */
    public function test_rejects_non_canonical_extra_bits_across_all_moduli(): void
    {
        // 1. Mod 2 (2 unused bits, mask 0x03): 'MY' -> last char 'Y' (11000). 'MZ' (11001) has bit 0 set.
        try {
            Base32Codec::decode('MZ');
            $this->fail('Expected InvalidSecretException for mod 2 extra bits');
        } catch (InvalidSecretException $e) {
            $this->assertSame('Base32 string contains non-canonical extra bits.', $e->getMessage());
        }

        // 2. Mod 4 (4 unused bits, mask 0x0F): 'MZXQ' -> last char 'Q' (10000). 'MZXR' (10001) has bit 0 set.
        try {
            Base32Codec::decode('MZXR');
            $this->fail('Expected InvalidSecretException for mod 4 extra bits');
        } catch (InvalidSecretException $e) {
            $this->assertSame('Base32 string contains non-canonical extra bits.', $e->getMessage());
        }

        // 3. Mod 5 (1 unused bit, mask 0x01): 'MZXW6' -> last char '6' (11110). 'MZXW7' (11111) has bit 0 set.
        try {
            Base32Codec::decode('MZXW7');
            $this->fail('Expected InvalidSecretException for mod 5 extra bits');
        } catch (InvalidSecretException $e) {
            $this->assertSame('Base32 string contains non-canonical extra bits.', $e->getMessage());
        }

        // 4. Mod 7 (3 unused bits, mask 0x07): 'MZXW6YQ' -> last char 'Q' (10000). 'MZXW6YR' (10001) has bit 0 set.
        try {
            Base32Codec::decode('MZXW6YR');
            $this->fail('Expected InvalidSecretException for mod 7 extra bits');
        } catch (InvalidSecretException $e) {
            $this->assertSame('Base32 string contains non-canonical extra bits.', $e->getMessage());
        }
    }

    /**
     * Rejection of oversized input.
     */
    public function test_rejects_oversized_input(): void
    {
        $oversizedBytes = str_repeat('A', 257);
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Input data exceeds maximum allowed Base32 encoding length.');

        Base32Codec::encode($oversizedBytes);
    }

    /**
     * Rejection of oversized Base32 string on decode.
     */
    public function test_rejects_oversized_base32_on_decode(): void
    {
        $oversizedBase32 = str_repeat('A', 513);
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('Base32 string exceeds maximum allowed length.');

        Base32Codec::decode($oversizedBase32);
    }

    /**
     * Cryptographic secret generation with >= 160 bits (>= 20 bytes).
     */
    public function test_generate_secret_satisfies_entropy_minimum(): void
    {
        $secret = Base32Codec::generateSecret();
        $this->assertSame(32, strlen($secret));

        $decoded = Base32Codec::decode($secret);
        $this->assertSame(20, strlen($decoded)); // 20 bytes = 160 bits
    }

    /**
     * Cryptographic secret generation rejects sub-160-bit parameters.
     */
    public function test_generate_secret_rejects_insufficient_byte_length(): void
    {
        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('MFA secret generation requires at least 20 bytes (160 bits) of entropy.');

        Base32Codec::generateSecret(19);
    }

    /**
     * Ensure exception messages never leak input secrets.
     */
    public function test_exception_messages_do_not_reflect_supplied_input(): void
    {
        $secretInput = 'MYSECRETVALUE123456789INVALID!';

        try {
            Base32Codec::decode($secretInput);
            $this->fail('Expected InvalidSecretException');
        } catch (InvalidSecretException $e) {
            $this->assertStringNotContainsString('MYSECRET', $e->getMessage());
            $this->assertStringNotContainsString('INVALID', $e->getMessage());
        }
    }
}
