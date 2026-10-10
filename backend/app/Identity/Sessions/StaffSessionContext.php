<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use DateTimeInterface;
use JsonSerializable;

final class StaffSessionContext implements JsonSerializable
{
    private readonly \Closure $staffIdHolder;
    private readonly \Closure $csrfTokenHolder;
    private readonly \Closure $payloadHolder;
    private readonly \Closure $usernameHolder;

    public function __construct(
        public readonly string $sessionId,
        public readonly string $authLevel,
        #[\SensitiveParameter]
        ?string $staffId,
        public readonly ?int $credentialEpoch,
        #[\SensitiveParameter]
        string $csrfToken,
        #[\SensitiveParameter]
        array $payload,
        public readonly DateTimeInterface $issuedAt,
        public readonly DateTimeInterface $absoluteExpiresAt,
        public readonly DateTimeInterface $idleExpiresAt,
        public readonly DateTimeInterface $lastSeenAt,
        public readonly ?int $mfaVersion = null,
        public readonly ?DateTimeInterface $mfaVerifiedAt = null,
        public readonly ?string $role = null,
        #[\SensitiveParameter]
        ?string $username = null,
        public readonly ?string $staffStatus = null,
    ) {
        $this->staffIdHolder = static fn(): ?string => $staffId;
        $this->csrfTokenHolder = static fn(): string => $csrfToken;
        $this->payloadHolder = static fn(): array => $payload;
        $this->usernameHolder = static fn(): ?string => $username;
    }

    public function isAnonymous(): bool
    {
        return $this->authLevel === 'anonymous';
    }

    public function isFull(): bool
    {
        return $this->authLevel === 'full';
    }

    public function getStaffId(): ?string
    {
        return ($this->staffIdHolder)();
    }

    public function getCsrfToken(): string
    {
        return ($this->csrfTokenHolder)();
    }

    public function getPayload(): array
    {
        return ($this->payloadHolder)();
    }

    public function getUsername(): ?string
    {
        return ($this->usernameHolder)();
    }

    public function __get(string $name): mixed
    {
        return match ($name) {
            'staffId' => ($this->staffIdHolder)(),
            'csrfToken' => ($this->csrfTokenHolder)(),
            'payload' => ($this->payloadHolder)(),
            'username' => ($this->usernameHolder)(),
            default => throw new \InvalidArgumentException("Undefined property: {$name}"),
        };
    }

    public function __isset(string $name): bool
    {
        return match ($name) {
            'staffId' => ($this->staffIdHolder)() !== null,
            'csrfToken' => true,
            'payload' => true,
            'username' => ($this->usernameHolder)() !== null,
            default => false,
        };
    }

    public function jsonSerialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'role' => $this->role,
            'credentialEpoch' => $this->credentialEpoch,
            'mfaVersion' => $this->mfaVersion,
            'mfaVerifiedAt' => $this->mfaVerifiedAt?->format(DateTimeInterface::ATOM),
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'staffStatus' => $this->staffStatus,
        ];
    }

    public function __serialize(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'role' => $this->role,
            'credentialEpoch' => $this->credentialEpoch,
            'mfaVersion' => $this->mfaVersion,
            'mfaVerifiedAt' => $this->mfaVerifiedAt?->format(DateTimeInterface::ATOM),
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'staffStatus' => $this->staffStatus,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of StaffSessionContext is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'sessionId' => $this->sessionId,
            'authLevel' => $this->authLevel,
            'role' => $this->role,
            'credentialEpoch' => $this->credentialEpoch,
            'mfaVersion' => $this->mfaVersion,
            'mfaVerifiedAt' => $this->mfaVerifiedAt?->format(DateTimeInterface::ATOM),
            'issuedAt' => $this->issuedAt->format(DateTimeInterface::ATOM),
            'absoluteExpiresAt' => $this->absoluteExpiresAt->format(DateTimeInterface::ATOM),
            'idleExpiresAt' => $this->idleExpiresAt->format(DateTimeInterface::ATOM),
            'lastSeenAt' => $this->lastSeenAt->format(DateTimeInterface::ATOM),
            'staffStatus' => $this->staffStatus,
        ];
    }

    public function __toString(): string
    {
        return "StaffSessionContext[sessionId={$this->sessionId}, authLevel={$this->authLevel}, role={$this->role}]";
    }
}
