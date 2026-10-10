<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use DateTimeInterface;
use JsonSerializable;

final class SessionReceipt implements JsonSerializable
{
    private readonly \Closure $rawTokenHolder;
    private readonly \Closure $csrfTokenHolder;
    private readonly \Closure $principalIdHolder;

    public function __construct(
        #[\SensitiveParameter]
        string $rawToken,
        #[\SensitiveParameter]
        string $csrfToken,
        public readonly string $sessionId,
        public readonly string $realm,
        public readonly string $authLevel,
        #[\SensitiveParameter]
        ?string $principalId,
        public readonly DateTimeInterface $issuedAt,
        public readonly DateTimeInterface $absoluteExpiresAt,
        public readonly DateTimeInterface $idleExpiresAt,
    ) {
        $this->rawTokenHolder = static fn(): string => $rawToken;
        $this->csrfTokenHolder = static fn(): string => $csrfToken;
        $this->principalIdHolder = static fn(): ?string => $principalId;
    }

    public function getRawToken(): string
    {
        return ($this->rawTokenHolder)();
    }

    public function getCsrfToken(): string
    {
        return ($this->csrfTokenHolder)();
    }

    public function getPrincipalId(): ?string
    {
        return ($this->principalIdHolder)();
    }

    public function __get(string $name): mixed
    {
        if ($name === 'principalId') {
            return ($this->principalIdHolder)();
        }
        throw new \InvalidArgumentException("Undefined property: {$name}");
    }

    public function __isset(string $name): bool
    {
        if ($name === 'principalId') {
            return ($this->principalIdHolder)() !== null;
        }
        return false;
    }

    public function jsonSerialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
        ];
    }

    public function __serialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of SessionReceipt is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
        ];
    }

    public function __toString(): string
    {
        return "SessionReceipt[sessionId={$this->sessionId}, realm={$this->realm}, authLevel={$this->authLevel}]";
    }
}
