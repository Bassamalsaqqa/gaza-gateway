<?php

declare(strict_types=1);

namespace App\Identity\Password;

final class PasswordValidationResult
{
    private function __construct(
        public readonly bool $isValid,
        public readonly ?string $errorMessage = null,
        public readonly ?string $errorCode = null,
    ) {
    }

    public static function valid(): self
    {
        return new self(isValid: true);
    }

    public static function invalid(string $message, string $code): self
    {
        return new self(isValid: false, errorMessage: $message, errorCode: $code);
    }
}
