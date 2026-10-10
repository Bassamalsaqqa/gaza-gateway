<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use JsonSerializable;
use Stringable;

/**
 * Immutable validation result.
 */
final class CommandValidationResult implements JsonSerializable, Stringable
{
    /**
     * @param list<CommandViolation> $violations
     */
    public function __construct(
        private readonly bool $valid,
        private readonly array $violations = [],
    ) {
    }

    public static function success(): self
    {
        return new self(true, []);
    }

    /**
     * @param list<CommandViolation> $violations
     */
    public static function failure(array $violations): self
    {
        return new self(false, array_values($violations));
    }

    public static function singleViolation(string $path, string $code, string $message): self
    {
        return new self(false, [new CommandViolation($path, $code, $message)]);
    }

    public function isValid(): bool
    {
        return $this->valid;
    }

    public function hasViolations(): bool
    {
        return !empty($this->violations);
    }

    /**
     * @return list<CommandViolation>
     */
    public function getViolations(): array
    {
        return $this->violations;
    }

    /**
     * @return list<string>
     */
    public function getViolationCodes(): array
    {
        return array_map(static fn (CommandViolation $v): string => $v->getCode(), $this->violations);
    }

    public function hasViolationCode(string $code): bool
    {
        foreach ($this->violations as $violation) {
            if ($violation->getCode() === $code) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<CommandViolation>
     */
    public function getViolationsForPath(string $path): array
    {
        return array_values(
            array_filter($this->violations, static fn (CommandViolation $v): bool => $v->getPath() === $path)
        );
    }

    /**
     * @return array{valid: bool, violations: list<array{path: string, code: string, message: string}>}
     */
    public function toArray(): array
    {
        return [
            'valid' => $this->valid,
            'violations' => array_map(static fn (CommandViolation $v): array => $v->toArray(), $this->violations),
        ];
    }

    /**
     * @return array{valid: bool, violations: list<array{path: string, code: string, message: string}>}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    public function __toString(): string
    {
        if ($this->valid) {
            return 'Valid';
        }

        $lines = array_map(static fn (CommandViolation $v): string => (string) $v, $this->violations);

        return implode('; ', $lines);
    }
}
