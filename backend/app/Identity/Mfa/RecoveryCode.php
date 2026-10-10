<?php

declare(strict_types=1);

namespace App\Identity\Mfa;

use App\Identity\Mfa\Exceptions\InvalidRecoveryCodeException;
use BadMethodCallException;
use Closure;
use JsonSerializable;
use SensitiveParameter;

/**
 * Immutable staff MFA recovery code primitive with strict canonical representation and information hiding.
 *
 * Invariants:
 * - Minimum 128 bits (16 bytes) of cryptographic randomness.
 * - Encoded as canonical unambiguous 32-character lowercase hexadecimal.
 * - Strict bounded validation/canonicalization: rejects whitespace, symbols, Unicode lookalikes, and lossy normalization.
 * - Closed explicit purpose: staff_mfa_recovery.
 * - Digest: SHA-256 (64 hex characters) persisted for database lookup.
 * - Constant-time comparison helper (hash_equals).
 * - Plaintext held exclusively in an opaque Closure; never exposed via var_export, __debugInfo, jsonSerialize, or string casting.
 * - Prohibits PHP serialization to eliminate credential serialization attack surfaces.
 */
final class RecoveryCode implements JsonSerializable
{
    public const string PURPOSE = 'staff_mfa_recovery';
    public const int ENTROPY_BYTES = 16;     // 128 bits
    public const int MIN_ENTROPY_BYTES = 16; // 128 bits (alias)
    public const int CODE_LENGTH = 32;       // 32 hex characters

    private readonly Closure $secretHolder;

    private function __construct(#[SensitiveParameter] string $canonicalPlaintext)
    {
        $digest = hash('sha256', $canonicalPlaintext);

        // Opaque closure holding both plaintext and digest in scope, defeating generic var_export property reflection
        $this->secretHolder = static fn(): array => [$canonicalPlaintext, $digest];
    }

    /**
     * Generate a fresh recovery code with exactly 128 bits (16 bytes) of entropy.
     * Bounded check prevents unbounded allocation before random_bytes() is invoked.
     *
     * @throws InvalidRecoveryCodeException
     */
    public static function generate(int $entropyBytes = self::ENTROPY_BYTES): self
    {
        if ($entropyBytes !== self::ENTROPY_BYTES) {
            throw new InvalidRecoveryCodeException('Recovery code generation requires exactly 16 bytes (128 bits) of entropy.');
        }

        $bytes = random_bytes(self::ENTROPY_BYTES);
        $canonical = bin2hex($bytes);

        return new self($canonical);
    }

    /**
     * Create an instance from validated plaintext.
     *
     * @throws InvalidRecoveryCodeException
     */
    public static function fromPlaintext(#[SensitiveParameter] string $plaintext): self
    {
        $canonical = self::canonicalize($plaintext);

        return new self($canonical);
    }

    /**
     * Strict bounded validation and canonicalization of supplied recovery code.
     *
     * Rejects:
     * - Any whitespace (leading, trailing, or internal).
     * - Any punctuation, separators, dashes, or non-hex characters.
     * - Any Unicode characters or homoglyph lookalikes.
     * - Invalid lengths (< 32 or > 32).
     *
     * Returns strictly canonical lowercase 32-hex string.
     *
     * @throws InvalidRecoveryCodeException
     */
    public static function canonicalize(#[SensitiveParameter] string $code): string
    {
        if (strlen($code) !== self::CODE_LENGTH) {
            throw new InvalidRecoveryCodeException('Supplied recovery code must be exactly 32 characters.');
        }

        // Strict ASCII hex pattern without multiline bypass (/D)
        if (!preg_match('/^[0-9a-fA-F]{32}$/D', $code)) {
            throw new InvalidRecoveryCodeException('Supplied recovery code contains invalid characters or lookalikes.');
        }

        return strtolower($code);
    }

    /**
     * Calculate persistent SHA-256 digest of supplied code.
     *
     * @throws InvalidRecoveryCodeException
     */
    public static function digest(#[SensitiveParameter] string $code): string
    {
        $canonical = self::canonicalize($code);

        return hash('sha256', $canonical);
    }

    /**
     * Constant-time comparison of a known persisted digest against a supplied candidate recovery code.
     */
    public static function verifyDigest(
        string $knownDigest,
        #[SensitiveParameter] string $suppliedCode
    ): bool {
        if (strlen($knownDigest) !== 64 || !preg_match('/^[0-9a-f]{64}$/D', $knownDigest)) {
            return false;
        }

        try {
            $candidateDigest = self::digest($suppliedCode);
        } catch (InvalidRecoveryCodeException) {
            return false;
        }

        return hash_equals($knownDigest, $candidateDigest);
    }

    /**
     * Explicit raw access to the plaintext recovery code.
     * Strictly intended for one-time display during initial enrollment or credential replacement.
     */
    public function revealPlaintextForEnrollmentOnly(): string
    {
        return ($this->secretHolder)()[0];
    }

    /**
     * Persistent SHA-256 digest (64 hex characters) for database storage and indexing.
     */
    public function getDigest(): string
    {
        return ($this->secretHolder)()[1];
    }

    /**
     * Closed explicit purpose constant.
     */
    public function getPurpose(): string
    {
        return self::PURPOSE;
    }

    /**
     * Redacted debug info to prevent secret leakage in var_dump / print_r.
     * Both plaintext code and persistent digest are redacted from ordinary views.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return [
            'purpose' => self::PURPOSE,
            'code' => '[REDACTED]',
            'digest' => '[REDACTED]',
        ];
    }

    /**
     * Redacted JSON representation to prevent secret leakage in logs or API responses.
     * Both plaintext code and persistent digest are redacted from ordinary views.
     *
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'purpose' => self::PURPOSE,
            'code' => '[REDACTED]',
            'digest' => '[REDACTED]',
        ];
    }

    /**
     * Redacted string representation.
     */
    public function __toString(): string
    {
        return '[REDACTED]';
    }

    /**
     * Prohibit PHP serialization.
     */
    public function __serialize(): array
    {
        throw new BadMethodCallException('Serialization of MFA recovery code is prohibited.');
    }

    /**
     * Prohibit PHP unserialization.
     */
    public function __unserialize(array $data): void
    {
        throw new BadMethodCallException('Unserialization of MFA recovery code is prohibited.');
    }
}
