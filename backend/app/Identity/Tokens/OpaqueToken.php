<?php

declare(strict_types=1);

namespace App\Identity\Tokens;

use JsonSerializable;

final class OpaqueToken implements JsonSerializable
{
    public const TOKEN_BYTES = 32;
    public const CANONICAL_LENGTH = 43;

    public const VALID_PAIRS = [
        'passenger' => [
            'session',
            'anonymous_session',
            'full_session',
            'csrf',
            'proof',
            'dispatch',
            'passenger_email_verification',
            'passenger_password_reset',
        ],
        'staff' => [
            'session',
            'anonymous_session',
            'full_session',
            'csrf',
            'proof',
            'dispatch',
            'login_mfa',
            'enroll_mfa',
            'step_up',
            'staff_invitation',
            'staff_password_reset',
            'staff_mfa_replacement',
        ],
    ];

    private readonly \Closure $secretTokenHolder;
    private readonly \Closure $digestHolder;

    private function __construct(
        public readonly string $realm,
        public readonly string $purpose,
        #[\SensitiveParameter]
        string $secretToken,
        #[\SensitiveParameter]
        string $digest,
    ) {
        $this->secretTokenHolder = static fn(): string => $secretToken;
        $this->digestHolder = static fn(): string => $digest;
    }

    public static function validateCanonicalBearer(#[\SensitiveParameter] string $secretToken): void
    {
        if (strlen($secretToken) !== self::CANONICAL_LENGTH) {
            throw new \InvalidArgumentException('Secret token must be exactly 43 characters.');
        }

        if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $secretToken)) {
            throw new \InvalidArgumentException('Secret token contains non-base64url characters.');
        }

        $decoded = base64_decode(strtr($secretToken, '-_', '+/'), true);
        if ($decoded === false || strlen($decoded) !== self::TOKEN_BYTES) {
            throw new \InvalidArgumentException('Secret token failed base64url 32-byte decoding.');
        }

        $reencoded = rtrim(strtr(base64_encode($decoded), '+/', '-_'), '=');
        if (!hash_equals($secretToken, $reencoded)) {
            throw new \InvalidArgumentException('Secret token is not in canonical base64url representation.');
        }
    }

    public static function validatePair(string $realm, string $purpose): void
    {
        $allowedPurposes = self::VALID_PAIRS[$realm] ?? null;
        if ($allowedPurposes === null || !in_array($purpose, $allowedPurposes, true)) {
            throw new \InvalidArgumentException('Invalid realm and purpose pair.');
        }
    }

    /**
     * Generate a new cryptographically random 32-byte opaque token.
     */
    public static function generate(string $realm, string $purpose): self
    {
        self::validatePair($realm, $purpose);

        $rawBytes = random_bytes(self::TOKEN_BYTES);
        $encoded = rtrim(strtr(base64_encode($rawBytes), '+/', '-_'), '=');
        $digest = hash('sha256', $encoded);

        return new self(
            realm: $realm,
            purpose: $purpose,
            secretToken: $encoded,
            digest: $digest,
        );
    }

    /**
     * Reconstruct token reference from provided secret.
     */
    public static function fromSecret(
        string $realm,
        string $purpose,
        #[\SensitiveParameter] string $secretToken
    ): self {
        self::validatePair($realm, $purpose);
        self::validateCanonicalBearer($secretToken);

        $digest = hash('sha256', $secretToken);

        return new self(
            realm: $realm,
            purpose: $purpose,
            secretToken: $secretToken,
            digest: $digest,
        );
    }

    /**
     * Compute SHA-256 lookup digest for any raw token after validating canonical form.
     */
    public static function digestOf(#[\SensitiveParameter] string $secretToken): string
    {
        self::validateCanonicalBearer($secretToken);
        return hash('sha256', $secretToken);
    }

    /**
     * Explicit getter for raw secret token.
     * Must ONLY be used when delivering newly issued tokens to legitimate recipients.
     */
    public function getSecretToken(): string
    {
        return ($this->secretTokenHolder)();
    }

    public function getRawToken(): string
    {
        return ($this->secretTokenHolder)();
    }

    public function getDigest(): string
    {
        return ($this->digestHolder)();
    }

    public function __get(string $name): mixed
    {
        if ($name === 'digest') {
            return ($this->digestHolder)();
        }
        throw new \InvalidArgumentException("Undefined property: {$name}");
    }

    public function jsonSerialize(): array
    {
        return [
            'realm' => $this->realm,
            'purpose' => $this->purpose,
        ];
    }

    public function __serialize(): array
    {
        return [
            'realm' => $this->realm,
            'purpose' => $this->purpose,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of OpaqueToken is prohibited.');
    }

    /**
     * Diagnostics never include secret or lookup digest.
     */
    public function __debugInfo(): array
    {
        return [
            'realm' => $this->realm,
            'purpose' => $this->purpose,
        ];
    }

    public function __toString(): string
    {
        return "OpaqueToken[realm={$this->realm}, purpose={$this->purpose}]";
    }
}
