<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

use App\Identity\Proofs\Exceptions\InvalidPepperException;
use Closure;
use JsonSerializable;

/**
 * Immutable validated pepper ring for versioned HMAC-SHA256 guest OTP digests.
 *
 * Strictly enforces:
 * - Each pepper secret is >= 256 bits (32 bytes).
 * - Version numbers are positive integers (>= 1).
 * - No fallback to APP_KEY or default keys.
 * - Redacts pepper secrets in debugInfo, jsonSerialize, and string casting.
 */
final class GuestOtpPepperRing implements JsonSerializable
{
    public const int MIN_PEPPER_BYTES = 32;

    /** @var array<int, Closure> */
    private readonly array $pepperHolders;
    private readonly int $activeVersion;

    /**
     * @param array<int, string> $peppers Map of version => secret string (>= 32 bytes)
     * @param int|null $activeVersion Active version for newly generated digests
     */
    public function __construct(
        #[\SensitiveParameter]
        array $peppers,
        ?int $activeVersion = null,
    ) {
        if (empty($peppers)) {
            throw new InvalidPepperException('Pepper ring must contain at least one configured pepper version.');
        }

        $holders = [];
        foreach ($peppers as $version => $pepper) {
            if (!is_int($version) || $version < 1) {
                throw new InvalidPepperException("Pepper version must be a positive integer (>= 1), got: [{$version}].");
            }
            if (!is_string($pepper) || strlen($pepper) < self::MIN_PEPPER_BYTES) {
                $actual = is_string($pepper) ? strlen($pepper) : 0;
                throw new InvalidPepperException(
                    "Pepper for version {$version} must be at least " . self::MIN_PEPPER_BYTES . " bytes (256 bits), got {$actual} bytes."
                );
            }

            $secret = $pepper;
            $holders[$version] = static fn(): string => $secret;
        }

        $this->pepperHolders = $holders;

        $targetActive = $activeVersion ?? (int) max(array_keys($holders));
        if (!isset($this->pepperHolders[$targetActive])) {
            throw new InvalidPepperException("Active pepper version [{$targetActive}] does not exist in configured pepper ring.");
        }

        $this->activeVersion = $targetActive;
    }

    public function getActiveVersion(): int
    {
        return $this->activeVersion;
    }

    public function getActivePepper(): string
    {
        return ($this->pepperHolders[$this->activeVersion])();
    }

    public function getPepper(int $version): string
    {
        if (!isset($this->pepperHolders[$version])) {
            throw new InvalidPepperException("Pepper version [{$version}] is not available in configured ring.");
        }

        return ($this->pepperHolders[$version])();
    }

    public function hasVersion(int $version): bool
    {
        return isset($this->pepperHolders[$version]);
    }

    public function jsonSerialize(): array
    {
        return [
            'active_version' => $this->activeVersion,
            'configured_versions' => array_keys($this->pepperHolders),
        ];
    }

    public function __debugInfo(): array
    {
        return [
            'active_version' => $this->activeVersion,
            'configured_versions' => array_keys($this->pepperHolders),
            'peppers' => '[REDACTED]',
        ];
    }
}
