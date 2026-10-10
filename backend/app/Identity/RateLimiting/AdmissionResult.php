<?php

declare(strict_types=1);

namespace App\Identity\RateLimiting;

use App\Identity\Sessions\SessionReceipt;
use JsonSerializable;

final class AdmissionResult implements JsonSerializable
{
    public function __construct(
        public readonly bool $allowed,
        public readonly int $retryAfterSeconds,
        public readonly ?SessionReceipt $receipt = null,
        public readonly ?string $reason = null,
        public readonly array $budgetDetails = [],
    ) {
    }

    public static function admitted(SessionReceipt $receipt, array $budgetDetails = []): self
    {
        return new self(
            allowed: true,
            retryAfterSeconds: 0,
            receipt: $receipt,
            reason: null,
            budgetDetails: $budgetDetails,
        );
    }

    public static function denied(int $retryAfterSeconds, string $reason, array $budgetDetails = []): self
    {
        return new self(
            allowed: false,
            retryAfterSeconds: max(1, $retryAfterSeconds),
            receipt: null,
            reason: $reason,
            budgetDetails: $budgetDetails,
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'reason' => $this->reason,
        ];
    }

    public function __serialize(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'reason' => $this->reason,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of AdmissionResult is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'reason' => $this->reason,
        ];
    }
}
