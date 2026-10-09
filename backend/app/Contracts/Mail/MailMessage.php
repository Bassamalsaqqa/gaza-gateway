<?php

declare(strict_types=1);

namespace App\Contracts\Mail;

use App\Contracts\Mail\Exceptions\InvalidMailMessageException;

/**
 * Immutable DTO for a bounded plain-text mail message.
 *
 * Rejects header injection (CRLF), non-UTF-8 payloads, and oversized inputs before I/O.
 */
final readonly class MailMessage
{
    public const int MAX_RECIPIENT_LENGTH = 254;
    public const int MAX_SUBJECT_LENGTH = 255;
    public const int MAX_BODY_BYTES = 65536; // 64 KiB

    public string $recipient;
    public string $subject;
    public string $body;

    public function __construct(
        string $recipient,
        string $subject,
        string $body,
        int $maxRecipientLength = self::MAX_RECIPIENT_LENGTH,
        int $maxSubjectLength = self::MAX_SUBJECT_LENGTH,
        int $maxBodyBytes = self::MAX_BODY_BYTES,
    ) {
        if ($maxRecipientLength > self::MAX_RECIPIENT_LENGTH || $maxRecipientLength < 1) {
            throw new InvalidMailMessageException(
                'Custom max recipient length cannot exceed architectural ceiling of ' . self::MAX_RECIPIENT_LENGTH . '.'
            );
        }
        if ($maxSubjectLength > self::MAX_SUBJECT_LENGTH || $maxSubjectLength < 1) {
            throw new InvalidMailMessageException(
                'Custom max subject length cannot exceed architectural ceiling of ' . self::MAX_SUBJECT_LENGTH . '.'
            );
        }
        if ($maxBodyBytes > self::MAX_BODY_BYTES || $maxBodyBytes < 1) {
            throw new InvalidMailMessageException(
                'Custom max body bytes cannot exceed architectural ceiling of ' . self::MAX_BODY_BYTES . '.'
            );
        }

        $this->recipient = self::validateRecipient($recipient, $maxRecipientLength);
        $this->subject = self::validateSubject($subject, $maxSubjectLength);
        $this->body = self::validateBody($body, $maxBodyBytes);
    }

    private static function validateRecipient(string $recipient, int $maxLength): string
    {
        // Header injection guards: reject any carriage return, newline, or null byte anywhere in raw input
        if (str_contains($recipient, "\r") || str_contains($recipient, "\n") || str_contains($recipient, "\0")) {
            throw new InvalidMailMessageException('Recipient email contains forbidden control or CRLF characters.');
        }

        $trimmed = trim($recipient);

        if ($trimmed === '') {
            throw new InvalidMailMessageException('Recipient email cannot be empty.');
        }

        if (strlen($trimmed) > $maxLength) {
            throw new InvalidMailMessageException(
                "Recipient email length exceeds maximum allowed bound of {$maxLength} characters."
            );
        }

        // Validate standard RFC format without filter flags that allow local aliases with newlines
        if (filter_var($trimmed, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidMailMessageException('Recipient is not a valid email address.');
        }

        return $trimmed;
    }

    private static function validateSubject(string $subject, int $maxLength): string
    {
        // Header injection guards: subject must be strictly single-line with no CRLF or null bytes anywhere
        if (str_contains($subject, "\r") || str_contains($subject, "\n") || str_contains($subject, "\0")) {
            throw new InvalidMailMessageException('Subject contains forbidden control or CRLF characters.');
        }

        if (!mb_check_encoding($subject, 'UTF-8')) {
            throw new InvalidMailMessageException('Subject must be valid UTF-8 encoding.');
        }

        $trimmed = trim($subject);

        if ($trimmed === '') {
            throw new InvalidMailMessageException('Subject cannot be empty.');
        }

        if (mb_strlen($trimmed, 'UTF-8') > $maxLength) {
            throw new InvalidMailMessageException(
                "Subject length exceeds maximum allowed bound of {$maxLength} characters."
            );
        }

        return $trimmed;
    }

    private static function validateBody(string $body, int $maxBytes): string
    {
        if (str_contains($body, "\0")) {
            throw new InvalidMailMessageException('Message body contains forbidden null byte characters.');
        }

        if (!mb_check_encoding($body, 'UTF-8')) {
            throw new InvalidMailMessageException('Message body must be valid UTF-8 encoding.');
        }

        if (strlen($body) > $maxBytes) {
            throw new InvalidMailMessageException(
                "Message body size exceeds maximum allowed bound of {$maxBytes} bytes."
            );
        }

        return $body;
    }

    /**
     * Prevents accidental exposure of recipient PII and body content in debuggers or exception dumps.
     */
    public function __debugInfo(): array
    {
        return [
            'recipient' => '[REDACTED]',
            'subject' => '[REDACTED]',
            'body_bytes' => strlen($this->body),
        ];
    }
}
