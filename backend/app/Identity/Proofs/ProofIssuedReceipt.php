<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

use Carbon\CarbonImmutable;
use Closure;
use JsonSerializable;
use LogicException;

/**
 * Immutable receipt issued when a durable proof is persisted.
 *
 * Strictly redacts all delivery secrets and contact identifiers (raw token,
 * lookup digest, email snapshot) across ALL diagnostic and serialization channels:
 * - jsonSerialize(): redacted
 * - __debugInfo(): redacted
 * - serialize(): prohibited
 * - get_object_vars(): only non-sensitive public identifiers exposed
 *
 * Sensitive delivery values are accessible strictly via explicit named trusted getters.
 */
final class ProofIssuedReceipt implements JsonSerializable
{
    private readonly Closure $emailSnapshotHolder;
    private readonly Closure $tokenDigestHolder;
    private readonly Closure $secretTokenHolder;

    public function __construct(
        public readonly string $proofId,
        public readonly ProofPurpose $purpose,
        public readonly string $principalId,
        public readonly int $credentialEpoch,
        public readonly CarbonImmutable $issuedAt,
        public readonly CarbonImmutable $expiresAt,
        #[\SensitiveParameter]
        string $emailSnapshot,
        #[\SensitiveParameter]
        string $tokenDigest,
        #[\SensitiveParameter]
        string $rawSecretToken,
    ) {
        $this->emailSnapshotHolder = static fn(): string => $emailSnapshot;
        $this->tokenDigestHolder = static fn(): string => $tokenDigest;
        $this->secretTokenHolder = static fn(): string => $rawSecretToken;
    }

    /**
     * Explicit named getter for raw secret token.
     * Must only be used when delivering newly issued tokens to legitimate recipients.
     */
    public function getRawToken(): string
    {
        return ($this->secretTokenHolder)();
    }

    public function getSecretToken(): string
    {
        return ($this->secretTokenHolder)();
    }

    /**
     * Explicit named getter for delivery email snapshot.
     */
    public function getEmailSnapshot(): string
    {
        return ($this->emailSnapshotHolder)();
    }

    /**
     * Explicit named getter for database lookup digest.
     */
    public function getTokenDigest(): string
    {
        return ($this->tokenDigestHolder)();
    }

    public function jsonSerialize(): array
    {
        return [
            'proof_id' => $this->proofId,
            'purpose' => $this->purpose->value,
            'principal_id' => $this->principalId,
            'credential_epoch' => $this->credentialEpoch,
            'issued_at' => $this->issuedAt->toIso8601String(),
            'expires_at' => $this->expiresAt->toIso8601String(),
            'email_snapshot' => '[REDACTED]',
            'token_digest' => '[REDACTED]',
            'raw_token' => '[REDACTED]',
        ];
    }

    public function __serialize(): array
    {
        throw new LogicException('Serialization of ProofIssuedReceipt is prohibited.');
    }

    public function __unserialize(array $data): void
    {
        throw new LogicException('Deserialization of ProofIssuedReceipt is prohibited.');
    }

    public function __debugInfo(): array
    {
        return $this->jsonSerialize();
    }

    public function __toString(): string
    {
        return sprintf(
            'ProofIssuedReceipt[id=%s, purpose=%s, principal=%s]',
            $this->proofId,
            $this->purpose->value,
            $this->principalId
        );
    }
}
