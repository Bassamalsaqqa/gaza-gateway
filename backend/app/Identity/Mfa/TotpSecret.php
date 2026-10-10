<?php

declare(strict_types=1);

namespace App\Identity\Mfa;

use App\Identity\Mfa\Exceptions\InvalidSecretException;
use BadMethodCallException;
use Closure;
use JsonSerializable;
use SensitiveParameter;

/**
 * Encapsulated MFA TOTP secret value object with strict information-hiding boundaries.
 *
 * Invariants:
 * - Requires >= 160 bits (>= 20 bytes) of entropy.
 * - Stores raw secrets inside an opaque Closure to prevent exposure in var_export() or object dumps.
 * - Redacts secrets from __debugInfo(), jsonSerialize(), and __toString().
 * - Rejects PHP serialization (__serialize, __unserialize) to prevent serialization leaks.
 * - SensitiveParameter attribute used on sensitive inputs.
 */
final class TotpSecret implements JsonSerializable
{
    public const int MIN_SECRET_BYTES = 20;   // 160 bits
    public const int MIN_ENTROPY_BYTES = 20; // 160 bits (alias)
    public const int MAX_SECRET_BYTES = 64;   // 512 bits

    private readonly Closure $secretAccessor;
    private readonly Closure $base32Accessor;
    private readonly int $entropyBits;

    private function __construct(
        #[SensitiveParameter] string $binarySecret,
        #[SensitiveParameter] string $base32Secret
    ) {
        $byteLength = strlen($binarySecret);
        if ($byteLength < self::MIN_ENTROPY_BYTES) {
            throw new InvalidSecretException('MFA secret provides insufficient entropy (minimum 160 bits required).');
        }
        if ($byteLength > self::MAX_SECRET_BYTES) {
            throw new InvalidSecretException('MFA secret exceeds maximum allowed length.');
        }

        $this->entropyBits = $byteLength * 8;

        // Opaque closures holding secrets in scope, defeating generic var_export property reflection
        $this->secretAccessor = static fn(): string => $binarySecret;
        $this->base32Accessor = static fn(): string => $base32Secret;
    }

    /**
     * Create from validated canonical Base32 string.
     *
     * @throws InvalidSecretException
     */
    public static function fromBase32(#[SensitiveParameter] string $base32): self
    {
        $binary = Base32Codec::decode($base32);

        return new self($binary, $base32);
    }

    /**
     * Generate a fresh cryptographically random secret with >= 160 bits.
     *
     * @throws InvalidSecretException
     */
    public static function generate(int $entropyBytes = self::MIN_ENTROPY_BYTES): self
    {
        if ($entropyBytes < self::MIN_ENTROPY_BYTES) {
            throw new InvalidSecretException('MFA secret generation requires at least 20 bytes (160 bits) of entropy.');
        }
        if ($entropyBytes > self::MAX_SECRET_BYTES) {
            throw new InvalidSecretException('MFA secret generation exceeds maximum allowed length.');
        }

        $randomBytes = random_bytes($entropyBytes);
        $base32 = Base32Codec::encode($randomBytes);

        return new self($randomBytes, $base32);
    }

    /**
     * Explicit raw Base32 secret access for initial enrollment or replacement display.
     */
    public function revealBase32Secret(): string
    {
        return ($this->base32Accessor)();
    }

    /**
     * Binary secret bytes for HMAC calculation.
     */
    public function getBinarySecret(): string
    {
        return ($this->secretAccessor)();
    }

    /**
     * Entropy length in bits.
     */
    public function getEntropyBits(): int
    {
        return $this->entropyBits;
    }

    /**
     * Redacted debug info to prevent secret leakage in var_dump / print_r.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return [
            'entropyBits' => $this->entropyBits,
            'secret' => '[REDACTED]',
        ];
    }

    /**
     * Redacted JSON representation to prevent secret leakage in logs or JSON encoders.
     *
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'entropyBits' => $this->entropyBits,
            'secret' => '[REDACTED]',
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
        throw new BadMethodCallException('Serialization of MFA secret is prohibited.');
    }

    /**
     * Prohibit PHP unserialization.
     */
    public function __unserialize(array $data): void
    {
        throw new BadMethodCallException('Unserialization of MFA secret is prohibited.');
    }
}
