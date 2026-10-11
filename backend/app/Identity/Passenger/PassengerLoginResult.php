<?php

declare(strict_types=1);

namespace App\Identity\Passenger;

use Carbon\CarbonImmutable;
use Closure;
use JsonSerializable;
use LogicException;

/**
 * Capability-bearing result of a successful passenger authentication or session issuance.
 *
 * Conceals raw session token, CSRF token, and user identity from json_encode,
 * get_object_vars, serialize, and var_export via opaque private closure holders.
 * Rejects serialization and deserialization attempts with LogicException.
 */
final class PassengerLoginResult implements JsonSerializable
{
    private readonly Closure $userHolder;
    private readonly Closure $rawTokenHolder;
    private readonly Closure $csrfTokenHolder;
    private readonly Closure $expiresAtHolder;

    /**
     * @param array{id: string, email: string, firstName: string, lastName: string, emailVerified: bool} $user
     */
    public function __construct(
        #[\SensitiveParameter]
        array $user,
        #[\SensitiveParameter]
        string $rawToken,
        #[\SensitiveParameter]
        string $csrfToken,
        CarbonImmutable $absoluteExpiresAt,
    ) {
        $this->userHolder = static fn(): array => $user;
        $this->rawTokenHolder = static fn(): string => $rawToken;
        $this->csrfTokenHolder = static fn(): string => $csrfToken;
        $this->expiresAtHolder = static fn(): CarbonImmutable => $absoluteExpiresAt;
    }

    /**
     * Explicit getter for authenticated user payload.
     *
     * @return array{id: string, email: string, firstName: string, lastName: string, emailVerified: bool}
     */
    public function getUser(): array
    {
        return ($this->userHolder)();
    }

    /**
     * Explicit getter for raw session token.
     * Must only be used when minting the Set-Cookie HTTP header.
     */
    public function getRawToken(): string
    {
        return ($this->rawTokenHolder)();
    }

    /**
     * Explicit getter for CSRF token.
     */
    public function getCsrfToken(): string
    {
        return ($this->csrfTokenHolder)();
    }

    /**
     * Explicit getter for session absolute expiry.
     */
    public function getAbsoluteExpiresAt(): CarbonImmutable
    {
        return ($this->expiresAtHolder)();
    }

    public function jsonSerialize(): array
    {
        return [
            'status' => 'authenticated',
        ];
    }

    public function __serialize(): array
    {
        throw new LogicException('Serialization of PassengerLoginResult is prohibited.');
    }

    public function __unserialize(array $data): void
    {
        throw new LogicException('Deserialization of PassengerLoginResult is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'status' => 'authenticated',
        ];
    }

    public function __toString(): string
    {
        return 'PassengerLoginResult[status=authenticated]';
    }
}
