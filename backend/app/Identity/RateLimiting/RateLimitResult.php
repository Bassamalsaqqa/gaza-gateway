<?php

declare(strict_types=1);

namespace App\Identity\RateLimiting;

use JsonSerializable;

final class RateLimitResult implements JsonSerializable
{
    public function __construct(
        public readonly bool $allowed,
        public readonly int $retryAfterSeconds,
        public readonly int $remaining,
        public readonly int $limit,
        public readonly string $operationId,
        public readonly array $budgetDetails = [],
    ) {
    }

    public static function allowed(int $remaining, int $limit, string $operationId, array $budgetDetails = []): self
    {
        return new self(
            allowed: true,
            retryAfterSeconds: 0,
            remaining: max(0, $remaining),
            limit: $limit,
            operationId: $operationId,
            budgetDetails: $budgetDetails,
        );
    }

    public static function denied(int $retryAfterSeconds, int $limit, string $operationId, array $budgetDetails = []): self
    {
        return new self(
            allowed: false,
            retryAfterSeconds: max(1, $retryAfterSeconds),
            remaining: 0,
            limit: $limit,
            operationId: $operationId,
            budgetDetails: $budgetDetails,
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'retry_after_seconds' => $this->retryAfterSeconds,
            'remaining' => $this->remaining,
            'limit' => $this->limit,
            'operationId' => $this->operationId,
        ];
    }

    public function __serialize(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'retry_after_seconds' => $this->retryAfterSeconds,
            'remaining' => $this->remaining,
            'limit' => $this->limit,
            'operationId' => $this->operationId,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of RateLimitResult is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'allowed' => $this->allowed,
            'retryAfterSeconds' => $this->retryAfterSeconds,
            'remaining' => $this->remaining,
            'limit' => $this->limit,
            'operationId' => $this->operationId,
        ];
    }

    public function __toString(): string
    {
        return "RateLimitResult[allowed=" . ($this->allowed ? 'true' : 'false') . ", remaining={$this->remaining}, limit={$this->limit}]";
    }
}
