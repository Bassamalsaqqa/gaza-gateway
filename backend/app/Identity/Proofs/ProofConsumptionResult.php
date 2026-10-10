<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

use Carbon\CarbonImmutable;
use Closure;
use JsonSerializable;

/**
 * Result returned from a proof consumption attempt.
 *
 * Avoids throwing rollback exceptions on valid verification denials,
 * ensuring caller can atomically record audit events and rate charges.
 *
 * Strictly conceals email snapshot from json_encode, __debugInfo,
 * get_object_vars, serialize, and var_export via an opaque closure holder.
 */
final class ProofConsumptionResult implements JsonSerializable
{
    private readonly ?Closure $emailHolder;
    public readonly ?string $failureReason;

    public function __construct(
        public readonly ProofConsumptionOutcome $outcome,
        public readonly ?string $proofId = null,
        public readonly ?string $principalId = null,
        #[\SensitiveParameter]
        ?string $emailSnapshot = null,
        public readonly ?int $credentialEpoch = null,
        public readonly ?CarbonImmutable $consumedAt = null,
        ?string $failureReason = null,
    ) {
        $this->emailHolder = $emailSnapshot !== null ? static fn(): string => $emailSnapshot : null;

        if ($outcome->isSuccess()) {
            $this->failureReason = null;
        } else {
            // Finite outcome-derived message only:
            // Reject/redact arbitrary strings across all channels (direct constructor and deserialization included).
            $canonical = $outcome->description();
            $allowed = [$outcome->value, $canonical];
            $this->failureReason = ($failureReason !== null && in_array($failureReason, $allowed, true))
                ? $failureReason
                : $canonical;
        }
    }

    public static function success(
        string $proofId,
        string $principalId,
        #[\SensitiveParameter]
        string $emailSnapshot,
        int $credentialEpoch,
        CarbonImmutable $consumedAt,
    ): self {
        return new self(
            outcome: ProofConsumptionOutcome::Success,
            proofId: $proofId,
            principalId: $principalId,
            emailSnapshot: $emailSnapshot,
            credentialEpoch: $credentialEpoch,
            consumedAt: $consumedAt,
            failureReason: null,
        );
    }

    public static function failure(ProofConsumptionOutcome $outcome, ?string $reason = null): self
    {
        return new self(
            outcome: $outcome,
            failureReason: $reason,
        );
    }

    public function isSuccess(): bool
    {
        return $this->outcome->isSuccess();
    }

    /**
     * Explicit trusted getter for verified email snapshot.
     */
    public function getEmailSnapshot(): ?string
    {
        return $this->emailHolder !== null ? ($this->emailHolder)() : null;
    }

    public function jsonSerialize(): array
    {
        return [
            'outcome' => $this->outcome->value,
            'success' => $this->isSuccess(),
            'proof_id' => $this->proofId,
            'principal_id' => $this->principalId,
            'email_snapshot' => $this->emailHolder !== null ? '[REDACTED]' : null,
            'credential_epoch' => $this->credentialEpoch,
            'consumed_at' => $this->consumedAt?->toIso8601String(),
            'failure_reason' => $this->failureReason,
        ];
    }

    public function __debugInfo(): array
    {
        return $this->jsonSerialize();
    }

    public function __serialize(): array
    {
        return [
            'outcome' => $this->outcome->value,
            'proof_id' => $this->proofId,
            'principal_id' => $this->principalId,
            'credential_epoch' => $this->credentialEpoch,
            'consumed_at' => $this->consumedAt?->toIso8601String(),
            'failure_reason' => $this->failureReason,
        ];
    }

    public function __unserialize(array $data): void
    {
        // Deserialization restores non-sensitive diagnostics only; email closure remains null
        $outcome = ProofConsumptionOutcome::from($data['outcome']);
        $this->outcome = $outcome;
        $this->proofId = $data['proof_id'] ?? null;
        $this->principalId = $data['principal_id'] ?? null;
        $this->credentialEpoch = $data['credential_epoch'] ?? null;
        $this->consumedAt = isset($data['consumed_at']) ? CarbonImmutable::parse($data['consumed_at']) : null;
        if ($outcome->isSuccess()) {
            $this->failureReason = null;
        } else {
            $canonical = $outcome->description();
            $allowed = [$outcome->value, $canonical];
            $incoming = $data['failure_reason'] ?? null;
            $this->failureReason = ($incoming !== null && in_array($incoming, $allowed, true))
                ? $incoming
                : $canonical;
        }
        $this->emailHolder = null;
    }
}

