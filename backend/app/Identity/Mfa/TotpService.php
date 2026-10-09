<?php

declare(strict_types=1);

namespace App\Identity\Mfa;

use App\Identity\Mfa\Exceptions\InvalidOtpException;
use App\Identity\Mfa\Exceptions\InvalidSecretException;
use SensitiveParameter;

/**
 * Pure RFC 6238 TOTP and RFC 4226 HOTP cryptographic primitive.
 *
 * Invariants:
 * - HMAC-SHA1 only, 6 decimal digits, 30-second time step.
 * - Non-configurable: no widening of SHA algorithm, digits, or skew window.
 * - Skew window strictly -1, 0, +1 counter steps (excluding negative counters).
 * - Safe integer time arithmetic (intdiv) with strict rejection of negative timestamps.
 * - match() returns ALL matching counter integers in stable order, never a boolean inventing replay safety.
 * - Dynamic truncation per RFC 4226, 6-digit zero-padding, hash_equals timing-safe comparison.
 * - Zero secrets or OTP codes reflected in logs, debug info, or exceptions.
 */
class TotpService
{
    public const int DIGITS = 6;
    public const int PERIOD = 30;
    public const string ALGORITHM = 'sha1';
    public const int SKEW_STEPS = 1;
    public const int MIN_SECRET_BYTES = 20; // 160 bits
    public const int MAX_SECRET_BYTES = 64; // 512 bits

    /**
     * Calculate HOTP code for an exact counter integer per RFC 4226.
     *
     * @throws InvalidOtpException|InvalidSecretException
     */
    public function hotp(
        #[SensitiveParameter] string|TotpSecret $secret,
        int $counter
    ): string {
        if ($counter < 0) {
            throw new InvalidOtpException('Counter must be a non-negative integer.');
        }

        $binarySecret = $this->resolveBinarySecret($secret);

        // Pack 64-bit integer into 8-byte big-endian binary string
        $packedCounter = pack('J', $counter);

        $hash = hash_hmac(self::ALGORITHM, $packedCounter, $binarySecret, true);

        // RFC 4226 dynamic truncation: lower 4 bits of the 20th byte (index 19)
        $offset = ord($hash[19]) & 0x0F;

        $binaryCode = ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF);

        $otp = $binaryCode % (10 ** self::DIGITS);

        return str_pad((string) $otp, self::DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * Calculate authoritative TOTP code for a given non-negative unix timestamp per RFC 6238.
     *
     * @throws InvalidOtpException|InvalidSecretException
     */
    public function totp(
        #[SensitiveParameter] string|TotpSecret $secret,
        int $timestamp
    ): string {
        $step = $this->calculateStep($timestamp);

        return $this->hotp($secret, $step);
    }

    /**
     * Calculate 30-second counter step for a unix timestamp using pure integer arithmetic.
     *
     * @throws InvalidOtpException
     */
    public function calculateStep(int $timestamp): int
    {
        if ($timestamp < 0) {
            throw new InvalidOtpException('Timestamp must be a non-negative integer.');
        }

        return intdiv($timestamp, self::PERIOD);
    }

    /**
     * Match a supplied OTP code against current and adjacent counter steps within the accepted window.
     *
     * Returns ALL matching counter step integers in stable ascending order.
     * Never returns a boolean pretending replay safety.
     *
     * Future durable integration direction (Codex architectural invariant):
     * - Downstream database integration must lock credential authorization, then evaluate ALL returned matches.
     * - Do NOT fall through from an already-consumed match to another collision match for the same OTP.
     * - If ANY matching counter step in the returned set has already been consumed, the OTP is a replay and MUST be rejected.
     * - Otherwise, downstream must atomically consume EVERY matching counter step in the set together
     *   (with unique staff/version/counter constraints and purpose/session binding).
     * - Pure mathematical match tests are not database replay proof.
     *
     * @return list<int> Complete set of matched counter integers in ascending order (empty list if no match)
     *
     * @throws InvalidOtpException|InvalidSecretException
     */
    public function match(
        #[SensitiveParameter] string|TotpSecret $secret,
        #[SensitiveParameter] string $code,
        int $timestamp
    ): array {
        // Strict ASCII 6-digit validation before cryptographic operations
        if (strlen($code) !== self::DIGITS || !ctype_digit($code)) {
            throw new InvalidOtpException('Supplied OTP must be exactly 6 ASCII digits.');
        }

        $step = $this->calculateStep($timestamp);

        // Candidate steps within exact window [-1, 0, +1], excluding negative steps
        $candidateSteps = [];
        for ($offset = -self::SKEW_STEPS; $offset <= self::SKEW_STEPS; $offset++) {
            $candidate = $step + $offset;
            if ($candidate >= 0) {
                $candidateSteps[] = $candidate;
            }
        }

        $matchingSteps = [];
        foreach ($candidateSteps as $candidateStep) {
            $expectedOtp = $this->hotp($secret, $candidateStep);

            if (hash_equals($expectedOtp, $code)) {
                $matchingSteps[] = $candidateStep;
            }
        }

        return $matchingSteps;
    }

    /**
     * Resolve raw binary secret bytes from string or TotpSecret object.
     * Enforces identical bounded secret policy [20..64 bytes] across both forms.
     *
     * @throws InvalidSecretException
     */
    private function resolveBinarySecret(#[SensitiveParameter] string|TotpSecret $secret): string
    {
        if ($secret instanceof TotpSecret) {
            return $secret->getBinarySecret();
        }

        $binary = Base32Codec::decode($secret);
        $len = strlen($binary);
        if ($len < self::MIN_SECRET_BYTES || $len > self::MAX_SECRET_BYTES) {
            throw new InvalidSecretException(
                "MFA secret length must be between " . self::MIN_SECRET_BYTES . " and " . self::MAX_SECRET_BYTES . " bytes, got {$len} bytes."
            );
        }

        return $binary;
    }
}
