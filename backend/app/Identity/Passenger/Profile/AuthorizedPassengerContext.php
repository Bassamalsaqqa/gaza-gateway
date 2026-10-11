<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

use Carbon\CarbonImmutable;
use Closure;
use JsonSerializable;
use LogicException;

/**
 * Immutable value object holding authenticated and verified passenger context
 * derived freshly inside the active database lock transaction.
 *
 * Security & PII invariants:
 * - Public fields are strictly non-PII primitives: userId, sessionId, credentialEpoch, now.
 * - PII (userEmail) is encapsulated in a private closure-backed getter: getUserEmail().
 * - jsonSerialize() and __debugInfo() redact/omit PII.
 * - __serialize(), __unserialize(), and __set_state() deny serialization and state restoration.
 * - get_object_vars() from external scope exposes only public non-PII properties.
 */
final readonly class AuthorizedPassengerContext implements JsonSerializable
{
    public string $userId;
    public string $sessionId;
    public int $credentialEpoch;
    public CarbonImmutable $now;

    /** @var Closure(): string */
    private Closure $emailAccessor;

    public function __construct(
        string $userId,
        #[\SensitiveParameter] string $userEmail,
        string $sessionId,
        int $credentialEpoch,
        CarbonImmutable $now,
    ) {
        $this->userId = $userId;
        $this->sessionId = $sessionId;
        $this->credentialEpoch = $credentialEpoch;
        $this->now = $now;
        $this->emailAccessor = static fn(): string => $userEmail;
    }

    /**
     * Access verified passenger email securely without public property exposure.
     */
    public function getUserEmail(): string
    {
        return ($this->emailAccessor)();
    }

    /**
     * JSON serialization emits only safe public identifiers and timestamps.
     *
     * @return array{userId: string, sessionId: string, credentialEpoch: int, now: string}
     */
    public function jsonSerialize(): array
    {
        return [
            'userId' => $this->userId,
            'sessionId' => $this->sessionId,
            'credentialEpoch' => $this->credentialEpoch,
            'now' => $this->now->toIso8601String(),
        ];
    }

    /**
     * Var-dump and debugger representation redacts sensitive email.
     *
     * @return array<string, mixed>
     */
    public function __debugInfo(): array
    {
        return [
            'userId' => $this->userId,
            'sessionId' => $this->sessionId,
            'credentialEpoch' => $this->credentialEpoch,
            'now' => $this->now->toIso8601String(),
            'userEmail' => '[REDACTED]',
        ];
    }

    /**
     * Deny native PHP object serialization to prevent credential and PII leakage.
     */
    public function __serialize(): array
    {
        throw new LogicException('AuthorizedPassengerContext cannot be serialized.');
    }

    /**
     * Deny native PHP object unserialization.
     */
    public function __unserialize(array $data): void
    {
        throw new LogicException('AuthorizedPassengerContext cannot be unserialized.');
    }

    /**
     * Deny reconstruction from var_export __set_state.
     */
    public static function __set_state(array $an_array): never
    {
        throw new LogicException('AuthorizedPassengerContext cannot be restored from exported state.');
    }
}
