<?php

declare(strict_types=1);

namespace App\Identity\Guards;

use Illuminate\Contracts\Auth\Authenticatable;
use JsonSerializable;

final class IdentityPrincipal implements Authenticatable, JsonSerializable
{
    public function __construct(
        public readonly string $id,
        public readonly string $realm,
        public readonly string $authLevel,
        public readonly string $sessionId,
        public readonly ?int $credentialEpoch = null,
        public readonly ?string $role = null,
        public readonly array $permissions = [],
    ) {
    }

    public function isAnonymous(): bool
    {
        return $this->authLevel === 'anonymous';
    }

    public function isFull(): bool
    {
        return $this->authLevel === 'full';
    }

    public function isPassenger(): bool
    {
        return $this->realm === 'passenger';
    }

    public function isStaff(): bool
    {
        return $this->realm === 'staff';
    }

    public function hasPermission(string $permission): bool
    {
        return in_array($permission, $this->permissions, true);
    }

    // -------------------------------------------------------------------------
    // Illuminate\Contracts\Auth\Authenticatable implementation
    // -------------------------------------------------------------------------

    public function getAuthIdentifierName(): string
    {
        return 'id';
    }

    public function getAuthIdentifier(): mixed
    {
        return $this->id;
    }

    public function getAuthPassword(): string
    {
        // Invariant: Never expose password hashes through Authenticatable wrapper
        return '';
    }

    public function getAuthPasswordName(): string
    {
        return '';
    }

    public function getRememberToken(): ?string
    {
        return null;
    }

    public function setRememberToken($value): void
    {
        // Invariant: Remember tokens are prohibited in Gaza Gateway identity architecture
    }

    public function getRememberTokenName(): ?string
    {
        return null;
    }

    // -------------------------------------------------------------------------
    // Diagnostics & Serialization Protection
    // -------------------------------------------------------------------------

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'sessionId' => $this->sessionId,
            'role' => $this->role,
        ];
    }

    public function __debugInfo(): array
    {
        return [
            'id' => $this->id,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'sessionId' => $this->sessionId,
            'role' => $this->role,
        ];
    }

    public function __serialize(): array
    {
        return [
            'id' => $this->id,
            'realm' => $this->realm,
            'authLevel' => $this->authLevel,
            'sessionId' => $this->sessionId,
            'role' => $this->role,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of IdentityPrincipal is prohibited.');
    }

    public function __toString(): string
    {
        return "IdentityPrincipal[id={$this->id}, realm={$this->realm}, authLevel={$this->authLevel}]";
    }
}
