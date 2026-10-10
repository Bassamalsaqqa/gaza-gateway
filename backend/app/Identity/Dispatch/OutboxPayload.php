<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Identity\Dispatch\Exceptions\DispatchException;
use Closure;
use JsonSerializable;
use LogicException;
use Throwable;

/**
 * Immutable bounded payload for encrypted outbox storage.
 *
 * All plaintext recipient, body, and secret contents remain confined within
 * the encrypted payload. Serialization for logging strictly redacts PII and secrets.
 *
 * Enforces:
 * - Closed JSON object with exact keys: recipient, subject, body, purpose, token_or_code.
 * - Strict non-coercive string types for all fields (rejects arrays, ints, nulls).
 * - Finite server-defined dispatch purpose validation.
 * - Bounded length checks and strict UTF-8 validation.
 * - Zero raw exception or stack trace leakage in diagnostic messages.
 */
final class OutboxPayload implements JsonSerializable
{
    public const int MAX_PAYLOAD_JSON_BYTES = 131072;
    public const int MAX_RECIPIENT_BYTES = 255;
    public const int MAX_SUBJECT_BYTES = 255;
    public const int MAX_BODY_BYTES = 65536;
    public const int MAX_TOKEN_BYTES = 255;

    private readonly Closure $recipientHolder;
    private readonly Closure $subjectHolder;
    private readonly Closure $tokenHolder;
    private readonly Closure $bodyHolder;

    public function __construct(
        #[\SensitiveParameter]
        string $recipient,
        #[\SensitiveParameter]
        string $subject,
        #[\SensitiveParameter]
        string $body,
        public readonly string $purpose,
        #[\SensitiveParameter]
        string $tokenOrCode,
    ) {
        $this->recipientHolder = static fn(): string => $recipient;
        $this->subjectHolder = static fn(): string => $subject;
        $this->tokenHolder = static fn(): string => $tokenOrCode;
        $this->bodyHolder = static fn(): string => $body;
    }

    public function getRecipient(): string
    {
        return ($this->recipientHolder)();
    }

    public function getSubject(): string
    {
        return ($this->subjectHolder)();
    }

    public function getBody(): string
    {
        return ($this->bodyHolder)();
    }

    public function getTokenOrCode(): string
    {
        return ($this->tokenHolder)();
    }

    public function toJson(): string
    {
        try {
            return json_encode([
                'recipient' => $this->getRecipient(),
                'subject' => $this->getSubject(),
                'body' => $this->getBody(),
                'purpose' => $this->purpose,
                'token_or_code' => $this->getTokenOrCode(),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (Throwable) {
            throw new DispatchException('Failed to serialize outbox payload to JSON.');
        }
    }

    public static function fromJson(string $json): self
    {
        if (strlen($json) > self::MAX_PAYLOAD_JSON_BYTES) {
            throw new DispatchException('Outbox payload JSON exceeds maximum allowed size.');
        }

        try {
            $data = json_decode($json, true, 4, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new DispatchException('Malformed outbox payload JSON.');
        }

        if (!is_array($data) || array_is_list($data)) {
            throw new DispatchException('Outbox payload must be a JSON object.');
        }

        $expectedKeys = ['recipient', 'subject', 'body', 'purpose', 'token_or_code'];
        if (count($data) !== 5) {
            throw new DispatchException('Outbox payload contains unexpected or missing keys.');
        }

        foreach ($expectedKeys as $key) {
            if (!array_key_exists($key, $data)) {
                throw new DispatchException("Outbox payload is missing required field [{$key}].");
            }
            if (!is_string($data[$key])) {
                throw new DispatchException("Outbox payload field [{$key}] must be a string.");
            }
            if (!mb_check_encoding($data[$key], 'UTF-8')) {
                throw new DispatchException("Outbox payload field [{$key}] contains invalid UTF-8 encoding.");
            }
        }

        if (DispatchPurpose::tryFrom($data['purpose']) === null) {
            throw new DispatchException('Invalid outbox payload purpose.');
        }

        if (strlen($data['recipient']) < 3 || strlen($data['recipient']) > self::MAX_RECIPIENT_BYTES) {
            throw new DispatchException('Outbox payload recipient length exceeds bounds.');
        }

        if (strlen($data['subject']) === 0 || strlen($data['subject']) > self::MAX_SUBJECT_BYTES) {
            throw new DispatchException('Outbox payload subject length exceeds bounds.');
        }

        if (strlen($data['body']) === 0 || strlen($data['body']) > self::MAX_BODY_BYTES) {
            throw new DispatchException('Outbox payload body length exceeds bounds.');
        }

        if (strlen($data['token_or_code']) === 0 || strlen($data['token_or_code']) > self::MAX_TOKEN_BYTES) {
            throw new DispatchException('Outbox payload token_or_code length exceeds bounds.');
        }

        return new self(
            recipient: $data['recipient'],
            subject: $data['subject'],
            body: $data['body'],
            purpose: $data['purpose'],
            tokenOrCode: $data['token_or_code'],
        );
    }

    public function jsonSerialize(): array
    {
        return [
            'purpose' => $this->purpose,
            'subject' => '[REDACTED]',
            'recipient' => '[REDACTED]',
            'body_bytes' => strlen($this->getBody()),
            'token_or_code' => '[REDACTED]',
        ];
    }

    public function __debugInfo(): array
    {
        return $this->jsonSerialize();
    }

    public function __serialize(): array
    {
        throw new LogicException('Direct serialization of OutboxPayload is prohibited; use toJson().');
    }

    public function __unserialize(array $data): void
    {
        throw new LogicException('Direct deserialization of OutboxPayload is prohibited; use fromJson().');
    }
}
