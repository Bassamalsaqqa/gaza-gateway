<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RequestCorrelation
{
    private const UUID_REGEX = '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/';

    /**
     * Check if a string is a valid UUID format.
     */
    public static function isValidUuid(?string $value): bool
    {
        if ($value === null || strlen($value) > 64) {
            return false;
        }

        $trimmed = trim($value);

        return preg_match(self::UUID_REGEX, $trimmed) === 1;
    }

    /**
     * Normalize an input into a valid lowercase UUID, or generate a fresh UUID.
     * Never returns null or unchecked text.
     */
    public static function resolve(?string $value): string
    {
        if (self::isValidUuid($value)) {
            return strtolower(trim((string) $value));
        }

        return Str::uuid()->toString();
    }

    /**
     * Resolve correlation UUID from an incoming request or generate a new one.
     * Inspects trusted attribute first, then unvalidated header through strict UUID validation.
     * Never returns unchecked header text. Boot/CLI exceptions (null request) receive a fresh safe UUID.
     */
    public static function fromRequest(?Request $request): string
    {
        if ($request === null) {
            return Str::uuid()->toString();
        }

        $attributeId = $request->attributes->get('request_id');
        if (is_string($attributeId) && self::isValidUuid($attributeId)) {
            return strtolower(trim($attributeId));
        }

        $headerId = $request->header('X-Request-Id');
        if (is_string($headerId) && self::isValidUuid($headerId)) {
            return strtolower(trim($headerId));
        }

        return Str::uuid()->toString();
    }
}
