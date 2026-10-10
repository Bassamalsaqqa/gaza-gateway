<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use DateTimeInterface;
use JsonSerializable;

final class PassengerSessionContext implements JsonSerializable
{
    private readonly \Closure $userIdHolder;
    private readonly \Closure $csrfTokenHolder;
    private readonly \Closure $payloadHolder;
    private readonly \Closure $userEmailHolder;

    public function __construct(
        public readonly string $sessionId,
        public readonly string $authLevel,
        #[\SensitiveParameter]
        ?string $userId,
        public readonly ?int $credentialEpoch,
        #[\SensitiveParameter]
        string $csrfToken,
        #[\SensitiveParameter]
        array $payload,
        public readonly DateTimeInterface $issuedAt,
        public readonly DateTimeInterface $absoluteExpiresAt,
        public readonly DateTimeInterface $idleExpiresAt,
        public readonly DateTimeInterface $lastSeenAt,
        #[\SensitiveParameter]
        ?string $userEmail = null,
        public readonly ?string $userStatus = null,
    ) {
        $this->userIdHolder = static fn(): ?string => $userId;
        $this->csrfTokenHolder = static fn(): string => $csrfToken;
        $this->payloadHolder = static fn(): array => $payload;
        $this->userEmailHolder = static fn(): ?string => $userEmail;
    }

    public function isAnonymous(): bool
    {
        return $this->authLevel === 'anonymous';
    }

    public function isFull(): bool
    {
        return $this->authLevel === 'full';
    }

    public function getUserId(): ?string
    {
        return ($this->userIdHolder)();
    }

    public function getCsrfToken(): string
    {
        return ($this->csrfTokenHolder)();
    }

    public function getPayload(): array
    {
        return ($this->payloadHolder)();
    }

    public function getUserEmail(): ?string
    {
        return ($this->userEmailHolder)();
    }

    public function __get(string $name): mixed
    {
        return match ($name) {
            'userId' => ($this->userIdHolder)(),
            'csrfToken' => ($this->csrfTokenHolder)(),
            'payload' => ($this->payloadHolder)(),
            'userEmail' => ($this->userEmailHolder)(),
            default => throw new \InvalidArgumentException("Undefined property: {$name}"),
        };
    }

    public function __isset(string $name): bool
    {
        return match ($name) {
            'userId' => ($this->userIdHolder)() !== null,
            'csrfToken' => true,
            'payload' => true,
            'userEmail' => ($this->userEmailHolder)() !== null,
            default => false,
        };
    }

    public function jsonSerialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'credentialEpoch' => $this->credentialEpoch,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'userStatus' => $this->userStatus,
        ];
    }

    public function __serialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'credentialEpoch' => $this->credentialEpoch,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'userStatus' => $this->userStatus,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of PassengerSessionContext is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'credentialEpoch' => $this->credentialEpoch,
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'userStatus' => $this->userStatus,
        ];
    }

    public function __toString(): string
    {
        return "PassengerSessionContext[sessionId={$this->sessionId}, authLevel={$this->authLevel}]";
    }
}
