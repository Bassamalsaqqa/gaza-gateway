<?php

declare(strict_types=1);

namespace App\SharedHosting;

/**
 * Shared hosting runtime profile validator and authority constraints for HostPapa shared cPanel.
 *
 * Enforces non-negotiable architectural invariants:
 * - Explicit HOSTPAPA_SHARED_ENABLED master toggle; defaults OFF / mock.
 * - Proper APP_ENV=production or staging; no local masquerade on live site.
 * - Same-origin production frontend www.gazaairport.com and approved apex gazaairport.com.
 * - Canonical site ROOT APP_URL https://www.gazaairport.com. No new subdomain DNS required.
 * - Private local disk storage outside public_html is the chosen authority in shared deployment.
 * - Mail fail-closed until encrypted operator SMTP settings exist; local file capture is NEVER deployed SMTP success.
 * - Exact operator SMTP allowlist mail.gazaairport.com:465 (implicit TLS) or 587 (STARTTLS with explicit approved config).
 * - No plaintext SMTP in production/staging; no arbitrary Admin SMTP SSRF locations.
 */
final class SharedHostingProfile
{
    public const CANONICAL_PRODUCTION_HOST = 'www.gazaairport.com';
    public const APPROVED_APEX_HOST = 'gazaairport.com';
    public const CANONICAL_PRODUCTION_URL = 'https://www.gazaairport.com';

    public const CANONICAL_STAGING_HOST = 'staging.gazaairport.com';
    public const CANONICAL_STAGING_URL = 'https://staging.gazaairport.com';

    public const APPROVED_PRODUCTION_HOSTS = [
        'www.gazaairport.com',
        'gazaairport.com',
    ];

    public const APPROVED_PRODUCTION_URLS = [
        'https://www.gazaairport.com',
        'https://gazaairport.com',
    ];

    public const APPROVED_PRODUCTION_ORIGINS = [
        'https://www.gazaairport.com',
        'https://gazaairport.com',
    ];

    public const APPROVED_STAGING_HOSTS = [
        'staging.gazaairport.com',
    ];

    public const APPROVED_STAGING_URLS = [
        'https://staging.gazaairport.com',
    ];

    public const APPROVED_STAGING_ORIGINS = [
        'https://staging.gazaairport.com',
    ];

    public const OPERATOR_SMTP_HOST = 'mail.gazaairport.com';
    public const OPERATOR_SMTP_PORT_IMPLICIT_TLS = 465;
    public const OPERATOR_SMTP_PORT_STARTTLS = 587;

    public const DEFAULT_CRON_CADENCE_MINUTES = 15;
    public const MAX_CRON_WALL_SECONDS = 25.0;

    /**
     * Strict boolean parser. Only strict boolean true or string 'true'/'1' is considered true.
     * All invalid strings or non-boolean values fail closed to false.
     */
    public static function parseStrictBoolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            $trimmed = strtolower(trim($value));
            if ($trimmed === 'true' || $trimmed === '1') {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether the HostPapa shared hosting runtime profile is enabled.
     * Authoritative cached config only; raw environment fallback is strictly disallowed.
     */
    public static function isEnabled(): bool
    {
        return self::parseStrictBoolean(config('foundation-services.shared_hosting_enabled'));
    }

    /** Check all existing ancestors before creating private storage directories. */
    public static function assertPrivateStorageRoot(string $root): void
    {
        $normalized = str_replace('\\', '/', $root);
        if (!preg_match('#^(?:/|[A-Za-z]:/)#', $normalized)
            || preg_match('#/(?:\.{1,2}|public_html|public)(?:/|$)#i', $normalized)
            || str_contains($normalized, "\0")) {
            throw new \RuntimeException('Shared hosting storage requires a private absolute path outside public_html.');
        }
        $cursor = rtrim($root, '/\\');
        while ($cursor !== '' && dirname($cursor) !== $cursor) {
            if (is_link($cursor)) {
                throw new \RuntimeException('Shared hosting private storage forbids symlink ancestors.');
            }
            $resolved = realpath($cursor);
            if ($resolved !== false
                && preg_match('#/(?:public_html|public)(?:/|$)#i', str_replace('\\', '/', $resolved))) {
                throw new \RuntimeException('Shared hosting storage must remain outside public_html.');
            }
            $cursor = dirname($cursor);
        }
    }

    /**
     * Validate an environment string.
     * Rejects ambiguous, blank, or unsupported environment strings.
     */
    public static function validateEnvironment(string $env): string
    {
        $normalized = strtolower(trim($env));
        if (!in_array($normalized, ['production', 'staging', 'testing', 'local'], true)) {
            throw new \RuntimeException("SharedHosting error: Unsupported or ambiguous environment profile [{$env}].");
        }
        return $normalized;
    }

    /**
     * Validate that production or staging deployment configuration complies strictly with HostPapa shared-hosting rules.
     *
     * @param array<string, mixed> $config
     * @throws \RuntimeException
     */
    public static function validateDeploymentProfile(array $config, string $env): void
    {
        $normalizedEnv = self::validateEnvironment($env);
        $isDeployment = in_array($normalizedEnv, ['production', 'staging'], true);

        if (!$isDeployment) {
            return;
        }

        // 1. Debug mode must be strictly disabled
        $debug = self::parseStrictBoolean($config['app']['debug'] ?? false);
        if ($debug) {
            throw new \RuntimeException("SharedHosting security error: [app.debug] must be false in deployment.");
        }

        // 2. Validate APP_URL and host allowlist
        $appUrl = trim((string) ($config['app']['url'] ?? ''));
        $allowedHosts = (array) ($config['app']['allowed_hosts'] ?? []);

        if ($normalizedEnv === 'production') {
            if (!in_array($appUrl, self::APPROVED_PRODUCTION_URLS, true)) {
                throw new \RuntimeException("SharedHosting error: [app.url] must match canonical production URL (https://www.gazaairport.com or https://gazaairport.com).");
            }

            if (empty($allowedHosts)) {
                throw new \RuntimeException("SharedHosting error: [app.allowed_hosts] cannot be empty in production.");
            }

            foreach ($allowedHosts as $host) {
                $hostLower = strtolower(trim((string) $host));
                if (!in_array($hostLower, self::APPROVED_PRODUCTION_HOSTS, true)) {
                    throw new \RuntimeException("SharedHosting security error: Unauthorized host [{$hostLower}] in production allowlist.");
                }
            }
        } elseif ($normalizedEnv === 'staging') {
            if (!in_array($appUrl, self::APPROVED_STAGING_URLS, true)) {
                throw new \RuntimeException("SharedHosting error: [app.url] must match canonical staging URL (https://staging.gazaairport.com).");
            }

            if (empty($allowedHosts)) {
                throw new \RuntimeException("SharedHosting error: [app.allowed_hosts] cannot be empty in staging.");
            }

            foreach ($allowedHosts as $host) {
                $hostLower = strtolower(trim((string) $host));
                if (!in_array($hostLower, self::APPROVED_STAGING_HOSTS, true)) {
                    throw new \RuntimeException("SharedHosting security error: Unauthorized host [{$hostLower}] in staging allowlist.");
                }
            }
        }

        // 3. CORS origin validation
        $allowedOrigins = (array) ($config['cors']['allowed_origins'] ?? []);
        if (empty($allowedOrigins)) {
            throw new \RuntimeException("SharedHosting security error: [cors.allowed_origins] cannot be empty in deployment.");
        }

        $expectedOrigins = $normalizedEnv === 'production'
            ? self::APPROVED_PRODUCTION_ORIGINS
            : self::APPROVED_STAGING_ORIGINS;

        foreach ($allowedOrigins as $origin) {
            $originStr = trim((string) $origin);
            if (!in_array($originStr, $expectedOrigins, true)) {
                throw new \RuntimeException("SharedHosting security error: Unauthorized CORS origin [{$originStr}] in deployment.");
            }
        }

        // 4. Insecure transport rejection
        if (str_starts_with($appUrl, 'http://')) {
            throw new \RuntimeException("SharedHosting security error: Insecure HTTP transport is strictly prohibited in deployment.");
        }

        // 5. Storage root validation: private local disk outside public_html and public
        $storageRoot = (string) ($config['foundation-services']['storage']['local_root'] ?? '');
        if ($storageRoot !== '') {
            $normalizedRoot = str_replace('\\', '/', $storageRoot);
            if (preg_match('#/(?:public_html|public)(?:/|$)#i', $normalizedRoot) || str_ends_with($normalizedRoot, '/public') || str_ends_with($normalizedRoot, '/public_html')) {
                throw new \RuntimeException("SharedHosting security error: Storage root must be outside public_html and public directories: {$storageRoot}");
            }
        }
    }

    /**
     * Validate operator SMTP configuration against strict security rules.
     *
     * In deployment (production/staging):
     * - Host must strictly be mail.gazaairport.com.
     * - Port must strictly be 465 (implicit TLS) or 587 (STARTTLS).
     * - Plaintext (tls='none' or port 25) is strictly prohibited.
     * - Arbitrary hosts are strictly prohibited (SSRF prevention).
     */
    public static function validateSmtpConfiguration(string $host, int $port, string $tls, string $env): void
    {
        $normalizedEnv = self::validateEnvironment($env);
        $isDeployment = in_array($normalizedEnv, ['production', 'staging'], true);

        if ($isDeployment) {
            $hostLower = strtolower(trim($host));
            if ($hostLower !== self::OPERATOR_SMTP_HOST) {
                throw new \InvalidArgumentException("SharedHosting mail security error: SMTP host must strictly be [" . self::OPERATOR_SMTP_HOST . "] in deployment; arbitrary SSRF host is prohibited.");
            }

            if ($tls === 'none') {
                throw new \InvalidArgumentException("SharedHosting mail security error: Plaintext SMTP transport is strictly prohibited in deployment.");
            }

            if ($port === self::OPERATOR_SMTP_PORT_IMPLICIT_TLS) {
                if ($tls !== 'tls' && $tls !== 'ssl') {
                    throw new \InvalidArgumentException("SharedHosting mail security error: Port 465 requires implicit TLS (tls='tls' or tls='ssl').");
                }
            } elseif ($port === self::OPERATOR_SMTP_PORT_STARTTLS) {
                if ($tls !== 'starttls' && $tls !== 'tls') {
                    throw new \InvalidArgumentException("SharedHosting mail security error: Port 587 requires STARTTLS (tls='starttls' or tls='tls').");
                }
            } else {
                throw new \InvalidArgumentException("SharedHosting mail security error: Port [{$port}] is not authorized for operator SMTP in deployment; allowed ports are 465 (TLS) and 587 (STARTTLS).");
            }
        } else {
            // Local/testing: allow mailpit on port 1025 with tls='none' or operator host
            if ($tls === 'none' && ($host !== 'mailpit' || $port !== 1025)) {
                throw new \InvalidArgumentException("SharedHosting mail security error: Insecure plaintext SMTP transport is only permitted for mailpit:1025 in local/testing.");
            }
        }
    }

    /**
     * Validate an origin URL string for the given environment.
     */
    public static function validateOrigin(string $origin, string $env): bool
    {
        try {
            $normalizedEnv = self::validateEnvironment($env);
        } catch (\Throwable) {
            return false;
        }

        $expectedOrigins = $normalizedEnv === 'production'
            ? self::APPROVED_PRODUCTION_ORIGINS
            : self::APPROVED_STAGING_ORIGINS;

        // Origin format check: must be valid https URL without userinfo, query, fragment, or custom port
        if (!preg_match('/^https:\/\/[a-z0-9.-]+$/i', $origin)) {
            return false;
        }

        return in_array($origin, $expectedOrigins, true);
    }

    /**
     * Validate and normalize a base URL string for the given environment.
     * Returns normalized URL (ending in /api/v1) or null if invalid.
     */
    public static function validateBaseUrl(string $url, string $env): ?string
    {
        try {
            $normalizedEnv = self::validateEnvironment($env);
        } catch (\Throwable) {
            return null;
        }

        $trimmed = trim($url);

        if (!preg_match('/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?(?:\/[a-zA-Z0-9_.-]*)*$/i', $trimmed)) {
            return null;
        }

        $parsed = parse_url($trimmed);
        if ($parsed === false || !isset($parsed['scheme'], $parsed['host'])) {
            return null;
        }

        if (strtolower($parsed['scheme']) !== 'https') {
            return null;
        }

        if (isset($parsed['user']) || isset($parsed['pass']) || isset($parsed['query']) || isset($parsed['fragment'])) {
            return null;
        }

        $host = strtolower($parsed['host']);
        if ($normalizedEnv === 'production') {
            if (!in_array($host, self::APPROVED_PRODUCTION_HOSTS, true)) {
                return null;
            }
            if (isset($parsed['port']) && (int) $parsed['port'] !== 443) {
                return null;
            }
        } elseif ($normalizedEnv === 'staging') {
            if (!in_array($host, self::APPROVED_STAGING_HOSTS, true)) {
                return null;
            }
            if (isset($parsed['port']) && (int) $parsed['port'] !== 443) {
                return null;
            }
        } else {
            return null;
        }

        $path = $parsed['path'] ?? '/';
        if (str_contains($path, '//')) {
            return null;
        }

        if ($path === '' || $path === '/' || $path === '/api/v1' || $path === '/api/v1/') {
            return "https://{$host}/api/v1";
        }

        return null;
    }

    /**
     * Boolean helper to validate operator SMTP parameters.
     */
    public static function validateSmtp(string $host, int $port, ?string $tls, string $env): bool
    {
        try {
            self::validateSmtpConfiguration($host, $port, (string) $tls, $env);
            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
