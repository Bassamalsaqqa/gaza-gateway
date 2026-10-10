<?php

declare(strict_types=1);

namespace App\Identity\Mfa;

use App\Identity\Mfa\Exceptions\InvalidSecretException;
use SensitiveParameter;

/**
 * Strict RFC 4648 Base32 codec (unpadded, canonical uppercase).
 *
 * Invariants:
 * - Rejects any padding characters ('=').
 * - Rejects lowercase characters, ambiguous symbols, and non-Base32 characters.
 * - Rejects non-canonical extra bits in the final character.
 * - Rejects unpadded lengths modulo 8 of 1, 3, or 6 (mathematically impossible for byte data).
 * - Strictly bounds input size to prevent memory exhaustion.
 * - Parameter marked SensitiveParameter and never leaked in exception messages.
 */
final class Base32Codec
{
    private const string ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    private const int MAX_ENCODE_BYTES = 256;
    private const int MAX_DECODE_CHARS = 512;
    private const int MIN_SECRET_BYTES = 20; // 160 bits

    /**
     * Decode mapping table for RFC 4648 alphabet.
     *
     * @var array<string, int>
     */
    private const array DECODE_MAP = [
        'A' => 0,  'B' => 1,  'C' => 2,  'D' => 3,  'E' => 4,  'F' => 5,  'G' => 6,  'H' => 7,
        'I' => 8,  'J' => 9,  'K' => 10, 'L' => 11, 'M' => 12, 'N' => 13, 'O' => 14, 'P' => 15,
        'Q' => 16, 'R' => 17, 'S' => 18, 'T' => 19, 'U' => 20, 'V' => 21, 'W' => 22, 'X' => 23,
        'Y' => 24, 'Z' => 25, '2' => 26, '3' => 27, '4' => 28, '5' => 29, '6' => 30, '7' => 31,
    ];

    /**
     * Encode binary string into unpadded canonical uppercase Base32.
     *
     * @throws InvalidSecretException
     */
    public static function encode(#[SensitiveParameter] string $bytes): string
    {
        $len = strlen($bytes);
        if ($len === 0) {
            throw new InvalidSecretException('Cannot Base32-encode empty data.');
        }
        if ($len > self::MAX_ENCODE_BYTES) {
            throw new InvalidSecretException('Input data exceeds maximum allowed Base32 encoding length.');
        }

        $buffer = 0;
        $bitsLeft = 0;
        $output = '';

        for ($i = 0; $i < $len; $i++) {
            $buffer = ($buffer << 8) | ord($bytes[$i]);
            $bitsLeft += 8;

            while ($bitsLeft >= 5) {
                $bitsLeft -= 5;
                $val = ($buffer >> $bitsLeft) & 0x1F;
                $output .= self::ALPHABET[$val];
            }
        }

        if ($bitsLeft > 0) {
            $val = ($buffer << (5 - $bitsLeft)) & 0x1F;
            $output .= self::ALPHABET[$val];
        }

        return $output;
    }

    /**
     * Decode unpadded canonical uppercase Base32 string into binary bytes.
     *
     * @throws InvalidSecretException
     */
    public static function decode(#[SensitiveParameter] string $base32): string
    {
        $len = strlen($base32);
        if ($len === 0) {
            throw new InvalidSecretException('Base32 string cannot be empty.');
        }
        if ($len > self::MAX_DECODE_CHARS) {
            throw new InvalidSecretException('Base32 string exceeds maximum allowed length.');
        }

        // Validate length modulo 8 for unpadded encoding
        $mod = $len % 8;
        if ($mod === 1 || $mod === 3 || $mod === 6) {
            throw new InvalidSecretException('Base32 string has invalid unpadded length.');
        }

        $unusedBits = match ($mod) {
            0 => 0,
            2 => 2,
            4 => 4,
            5 => 1,
            7 => 3,
        };

        $buffer = 0;
        $bitsLeft = 0;
        $output = '';

        for ($i = 0; $i < $len; $i++) {
            $char = $base32[$i];

            if (!isset(self::DECODE_MAP[$char])) {
                throw new InvalidSecretException('Base32 string contains invalid characters or padding.');
            }

            $val = self::DECODE_MAP[$char];

            // If last character and unused bits exist, verify non-canonical extra bits are strictly zero
            if ($i === $len - 1 && $unusedBits > 0) {
                $mask = (1 << $unusedBits) - 1;
                if (($val & $mask) !== 0) {
                    throw new InvalidSecretException('Base32 string contains non-canonical extra bits.');
                }
            }

            $buffer = ($buffer << 5) | $val;
            $bitsLeft += 5;

            if ($bitsLeft >= 8) {
                $bitsLeft -= 8;
                $output .= chr(($buffer >> $bitsLeft) & 0xFF);
            }
        }

        return $output;
    }

    /**
     * Generate a cryptographically secure Base32 secret with >= 160 bits (>= 20 bytes).
     *
     * @throws InvalidSecretException
     */
    public static function generateSecret(int $byteLength = self::MIN_SECRET_BYTES): string
    {
        if ($byteLength < self::MIN_SECRET_BYTES) {
            throw new InvalidSecretException('MFA secret generation requires at least 20 bytes (160 bits) of entropy.');
        }
        if ($byteLength > self::MAX_ENCODE_BYTES) {
            throw new InvalidSecretException('MFA secret generation exceeds maximum allowed byte length.');
        }

        $randomBytes = random_bytes($byteLength);

        return self::encode($randomBytes);
    }
}
