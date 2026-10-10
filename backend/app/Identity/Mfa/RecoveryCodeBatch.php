<?php

declare(strict_types=1);

namespace App\Identity\Mfa;

use App\Identity\Mfa\Exceptions\InvalidRecoveryCodeException;
use BadMethodCallException;
use Countable;
use JsonSerializable;

/**
 * Encapsulated collection representing exactly 10 independent MFA recovery codes.
 *
 * Invariants:
 * - Exactly 10 codes generated per batch (matching database schema and OpenAPI specifications).
 * - Guaranteed uniqueness among all 10 generated codes.
 * - Minimum 128 bits of entropy per code.
 * - Closed explicit purpose: staff_mfa_recovery.
 * - Redacted debug, JSON, and string views; prohibited PHP serialization.
 * - Explicit reveal method for one-time enrollment/replacement presentation.
 */
final class RecoveryCodeBatch implements Countable, JsonSerializable
{
    public const int BATCH_SIZE = 10;

    /**
     * @var list<RecoveryCode>
     */
    private readonly array $codes;

    /**
     * @param list<RecoveryCode> $codes
     *
     * @throws InvalidRecoveryCodeException
     */
    private function __construct(array $codes)
    {
        if (count($codes) !== self::BATCH_SIZE) {
            throw new InvalidRecoveryCodeException('Recovery code batch must contain exactly 10 codes.');
        }

        // Verify pairwise uniqueness across all code digests
        $digests = [];
        foreach ($codes as $code) {
            $digest = $code->getDigest();
            if (isset($digests[$digest])) {
                throw new InvalidRecoveryCodeException('Duplicate recovery code detected in batch.');
            }
            $digests[$digest] = true;
        }

        $this->codes = array_values($codes);
    }

    /**
     * Generate a new batch of exactly 10 independent, unique recovery codes.
     * Bounded to exactly 10 codes with 128 bits entropy each; no public override.
     *
     * @throws InvalidRecoveryCodeException
     */
    public static function generate(): self
    {
        $codes = [];
        $seenDigests = [];

        while (count($codes) < self::BATCH_SIZE) {
            $candidate = RecoveryCode::generate();
            $digest = $candidate->getDigest();

            if (!isset($seenDigests[$digest])) {
                $seenDigests[$digest] = true;
                $codes[] = $candidate;
            }
        }

        return new self($codes);
    }

    /**
     * Explicit raw access to the 10 plaintext recovery codes.
     * Strictly intended for one-time display during initial enrollment or replacement.
     *
     * @return list<string> Exactly 10 canonical plaintext codes
     */
    public function revealPlaintextCodesForEnrollmentOnly(): array
    {
        return array_map(
            static fn(RecoveryCode $code): string => $code->revealPlaintextForEnrollmentOnly(),
            $this->codes
        );
    }

    /**
     * Get all 10 SHA-256 persistent digests for database persistence.
     *
     * @return list<string> Exactly 10 64-hex SHA-256 digests
     */
    public function getDigests(): array
    {
        return array_map(
            static fn(RecoveryCode $code): string => $code->getDigest(),
            $this->codes
        );
    }

    /**
     * @return list<RecoveryCode>
     */
    public function getCodes(): array
    {
        return $this->codes;
    }

    /**
     * Closed explicit purpose.
     */
    public function getPurpose(): string
    {
        return RecoveryCode::PURPOSE;
    }

    /**
     * Number of codes in the batch (always 10).
     */
    public function count(): int
    {
        return count($this->codes);
    }

    /**
     * Redacted debug info to prevent secret leakage in var_dump / print_r.
     * Both plaintexts and persistent digests are redacted from ordinary views.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return [
            'purpose' => RecoveryCode::PURPOSE,
            'count' => count($this->codes),
            'codes' => '[REDACTED]',
            'digests' => '[REDACTED]',
        ];
    }

    /**
     * Redacted JSON representation to prevent secret leakage in logs or API responses.
     * Both plaintexts and persistent digests are redacted from ordinary views.
     *
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'purpose' => RecoveryCode::PURPOSE,
            'count' => count($this->codes),
            'codes' => '[REDACTED]',
            'digests' => '[REDACTED]',
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
        throw new BadMethodCallException('Serialization of MFA recovery code batch is prohibited.');
    }

    /**
     * Prohibit PHP unserialization.
     */
    public function __unserialize(array $data): void
    {
        throw new BadMethodCallException('Unserialization of MFA recovery code batch is prohibited.');
    }
}
