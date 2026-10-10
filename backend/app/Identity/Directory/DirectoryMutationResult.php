<?php

declare(strict_types=1);

namespace App\Identity\Directory;

use Carbon\CarbonImmutable;
use JsonSerializable;

/**
 * Closed, secret-free immutable outcome of a staff directory mutation.
 *
 * Exposes strictly finite safe fields:
 * - success (bool)
 * - errorCode (closed string constant or null)
 * - errorMessage (fixed closed message or null)
 * - eligibleAdminCount (nonnegative integer)
 * - mutatedAt (safe CarbonImmutable timestamp or null)
 *
 * Guarantees zero credential, hash, secret, recovery code, or arbitrary data leak
 * across JSON serialization, get_object_vars, direct property access, serialize, and debug info.
 */
final class DirectoryMutationResult implements JsonSerializable
{
    private function __construct(
        public readonly bool $success,
        public readonly ?string $errorCode,
        public readonly ?string $errorMessage,
        public readonly int $eligibleAdminCount,
        public readonly ?CarbonImmutable $mutatedAt = null,
    ) {
    }

    public static function success(
        int $eligibleAdminCount,
        ?CarbonImmutable $mutatedAt = null,
    ): self {
        return new self(
            success: true,
            errorCode: null,
            errorMessage: null,
            eligibleAdminCount: max(0, $eligibleAdminCount),
            mutatedAt: $mutatedAt ?? CarbonImmutable::now(),
        );
    }

    public static function failure(
        string $errorCode,
        int $eligibleAdminCount = 0,
    ): self {
        // Enforce closed finite error code and fixed message. Reject/sanitize unknown code without echoing input!
        $canonicalCode = DirectoryErrorCode::canonicalCode($errorCode);
        $fixedMessage = DirectoryErrorCode::messageFor($canonicalCode);

        return new self(
            success: false,
            errorCode: $canonicalCode,
            errorMessage: $fixedMessage,
            eligibleAdminCount: max(0, $eligibleAdminCount),
            mutatedAt: null,
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'success' => $this->success,
            'error_code' => $this->errorCode,
            'eligible_admin_count' => $this->eligibleAdminCount,
            'mutated_at' => $this->mutatedAt?->toIso8601String(),
        ];
    }

    public function __serialize(): array
    {
        return [
            'success' => $this->success,
            'errorCode' => $this->errorCode,
            'errorMessage' => $this->errorMessage,
            'eligibleAdminCount' => $this->eligibleAdminCount,
            'mutatedAt' => $this->mutatedAt?->toIso8601String(),
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of DirectoryMutationResult is prohibited.');
    }

    public function __debugInfo(): array
    {
        return [
            'success' => $this->success,
            'errorCode' => $this->errorCode,
            'eligibleAdminCount' => $this->eligibleAdminCount,
            'mutatedAt' => $this->mutatedAt?->toIso8601String(),
        ];
    }

    public function __toString(): string
    {
        return sprintf(
            'DirectoryMutationResult[success=%s, errorCode=%s, eligibleAdminCount=%d]',
            $this->success ? 'true' : 'false',
            $this->errorCode ?? 'none',
            $this->eligibleAdminCount
        );
    }
}
