<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use JsonSerializable;
use Stringable;

/**
 * Immutable closed/safe representation of a single contract violation.
 *
 * Security Invariants:
 * - Contains ONLY authentic declared field paths and fixed local violation codes.
 * - NEVER contains input values, arbitrary unknown property names, raw bodies,
 *   passwords, proofs, tokens, documents, or emails.
 * - Diagnostic serialization is strictly safe.
 */
final class CommandViolation implements JsonSerializable, Stringable
{
    // Fixed local violation codes
    public const UNKNOWN_OPERATION = 'UNKNOWN_OPERATION';
    public const UNEXPECTED_BODY = 'UNEXPECTED_BODY';
    public const BODY_REQUIRED = 'BODY_REQUIRED';
    public const INVALID_TYPE = 'INVALID_TYPE';
    public const REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING';
    public const ADDITIONAL_PROPERTIES_DISALLOWED = 'ADDITIONAL_PROPERTIES_DISALLOWED';
    public const STRING_TOO_SHORT = 'STRING_TOO_SHORT';
    public const STRING_TOO_LONG = 'STRING_TOO_LONG';
    public const PATTERN_MISMATCH = 'PATTERN_MISMATCH';
    public const INVALID_FORMAT = 'INVALID_FORMAT';
    public const INVALID_ENUM = 'INVALID_ENUM';
    public const CONST_MISMATCH = 'CONST_MISMATCH';
    public const ONE_OF_FAILED = 'ONE_OF_FAILED';
    public const ALL_OF_FAILED = 'ALL_OF_FAILED';
    public const ANY_OF_FAILED = 'ANY_OF_FAILED';
    public const NOT_FAILED = 'NOT_FAILED';
    public const NUMBER_TOO_SMALL = 'NUMBER_TOO_SMALL';
    public const NUMBER_TOO_LARGE = 'NUMBER_TOO_LARGE';
    public const NOT_MULTIPLE_OF = 'NOT_MULTIPLE_OF';
    public const ARRAY_TOO_FEW_ITEMS = 'ARRAY_TOO_FEW_ITEMS';
    public const ARRAY_TOO_MANY_ITEMS = 'ARRAY_TOO_MANY_ITEMS';
    public const ARRAY_DUPLICATE_ITEMS = 'ARRAY_DUPLICATE_ITEMS';
    public const MALFORMED_UTF8 = 'MALFORMED_UTF8';
    public const MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED';
    public const INVALID_JSON = 'INVALID_JSON';
    public const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';

    public function __construct(
        private readonly string $path,
        private readonly string $code,
        private readonly string $message,
    ) {
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function getMessage(): string
    {
        return $this->message;
    }

    /**
     * @return array{path: string, code: string, message: string}
     */
    public function toArray(): array
    {
        return [
            'path' => $this->path,
            'code' => $this->code,
            'message' => $this->message,
        ];
    }

    /**
     * @return array{path: string, code: string, message: string}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    public function __toString(): string
    {
        return $this->path === ''
            ? "[{$this->code}] {$this->message}"
            : "{$this->path}: [{$this->code}] {$this->message}";
    }
}
