<?php

declare(strict_types=1);

namespace App\Contracts\Storage;

use App\Contracts\Storage\Exceptions\InvalidStorageKeyException;

/**
 * Validates and encapsulates a bounded opaque storage key.
 *
 * Enforces strict grammar with zero directory traversal, user paths, or path separators.
 */
final readonly class StorageKey
{
    public const int MAX_KEY_LENGTH = 128;
    private const string PATTERN = '/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]{0,127}$/';

    public string $value;

    public function __construct(string $key, int $maxLength = self::MAX_KEY_LENGTH)
    {
        $this->value = self::validate($key, $maxLength);
    }

    public static function validate(string $key, int $maxLength = self::MAX_KEY_LENGTH): string
    {
        $trimmed = trim($key);

        if ($trimmed === '') {
            throw new InvalidStorageKeyException('Storage key cannot be empty.');
        }

        if (strlen($trimmed) > $maxLength) {
            throw new InvalidStorageKeyException(
                "Storage key length exceeds maximum allowed bound of {$maxLength} characters."
            );
        }

        // Strictly reject path separators, null bytes, and traversal tokens
        if (
            str_contains($trimmed, '/') ||
            str_contains($trimmed, '\\') ||
            str_contains($trimmed, "\0") ||
            str_contains($trimmed, '..')
        ) {
            throw new InvalidStorageKeyException('Storage key contains forbidden traversal or separator characters.');
        }

        // Strictly reject leading or trailing dots
        if (str_starts_with($trimmed, '.') || str_ends_with($trimmed, '.')) {
            throw new InvalidStorageKeyException('Storage key cannot start or end with a dot.');
        }

        // Validate strictly against regex pattern
        if (!preg_match(self::PATTERN, $trimmed)) {
            throw new InvalidStorageKeyException('Storage key violates the allowed opaque character grammar.');
        }

        return $trimmed;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
