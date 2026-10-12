<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Sanitizes output to ensure no credentials, tokens, PII, raw hashes,
 * or sensitive filesystem paths leak into logs, stdout, or reports.
 */
class Sanitizer
{
    /**
     * @var list<string>
     */
    private array $customSecrets;

    /**
     * @param list<string> $customSecrets Explicit secrets (passwords, tokens) to redact
     */
    public function __construct(array $customSecrets = [])
    {
        $this->customSecrets = array_filter($customSecrets, fn($s) => is_string($s) && strlen(trim($s)) > 0);
    }

    /**
     * Add a secret string to the redaction list.
     */
    public function addSecret(string $secret): void
    {
        $trimmed = trim($secret);
        if ($trimmed !== '' && !in_array($trimmed, $this->customSecrets, true)) {
            $this->customSecrets[] = $trimmed;
        }
    }

    /**
     * Sanitize a string against known patterns and configured secrets.
     */
    public function sanitizeString(string $input): string
    {
        $output = $input;

        // Redact custom secrets first
        foreach ($this->customSecrets as $secret) {
            $output = str_replace($secret, '[REDACTED]', $output);
        }

        // Redact Argon2id password hash payloads
        $output = preg_replace(
            '/\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+\/]+={0,2}\$[A-Za-z0-9+\/]+={0,2}/',
            '[ARGON2ID_HASH_VERIFIED]',
            $output
        ) ?? $output;

        // Redact Bcrypt hashes
        $output = preg_replace(
            '/\$2[ayb]\$\d+\$[A-Za-z0-9\.\/]{53}/',
            '[BCRYPT_HASH_VERIFIED]',
            $output
        ) ?? $output;

        // Redact Authorization headers or Bearer tokens
        $output = preg_replace(
            '/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/i',
            'Bearer [REDACTED_TOKEN]',
            $output
        ) ?? $output;

        // Redact Basic Auth headers
        $output = preg_replace(
            '/Basic\s+[A-Za-z0-9\+\/]+=*/i',
            'Basic [REDACTED_CREDENTIALS]',
            $output
        ) ?? $output;

        // Redact email addresses to prevent PII leakage
        $output = preg_replace(
            '/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/',
            '[EMAIL_REDACTED]',
            $output
        ) ?? $output;

        // Redact cPanel / Unix user home paths: /home/username/... -> $HOME/...
        $output = preg_replace(
            '#/(?:home|home\d+|var/chroot/home)/[a-zA-Z0-9_-]+/#',
            '$HOME/',
            $output
        ) ?? $output;

        // Redact Windows user profile paths: C:\Users\username\... -> %USERPROFILE%\...
        $output = preg_replace(
            '#[A-Za-z]:\\\\Users\\\\[^\\\\/]+[\\\\/]#',
            '%USERPROFILE%/',
            $output
        ) ?? $output;

        return $output;
    }

    /**
     * Recursively sanitize an array.
     * Keys matching sensitive names are redacted directly.
     *
     * @param array<string|int, mixed> $data
     * @return array<string|int, mixed>
     */
    public function sanitizeArray(array $data): array
    {
        $sanitized = [];
        $sensitiveKeyPattern = '/^(password|pass|secret|token|auth|key|credential|jwt|salt|private_key|api_key|database_password)$/i';

        foreach ($data as $key => $value) {
            $keyString = (string)$key;

            if (preg_match($sensitiveKeyPattern, $keyString)) {
                $sanitized[$key] = '[REDACTED]';
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizeArray($value);
            } elseif (is_string($value)) {
                $sanitized[$key] = $this->sanitizeString($value);
            } else {
                $sanitized[$key] = $value;
            }
        }

        return $sanitized;
    }
}
