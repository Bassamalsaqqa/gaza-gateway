<?php

declare(strict_types=1);

namespace App\Identity\Protocol;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

final class CookieSecurity
{
    public const COOKIE_PASSENGER = 'gza_session';
    public const COOKIE_STAFF = 'gza_staff_session';
    public const COOKIE_STAFF_PENDING = 'gza_staff_pending';
    public const COOKIE_PATH = '/api/v1';

    public const ANONYMOUS_TTL = 1800;             // 30 minutes
    public const PASSENGER_FULL_ABSOLUTE_TTL = 604800; // 7 days
    public const STAFF_FULL_ABSOLUTE_TTL = 28800;      // 8 hours
    public const PENDING_TTL = 300;                // 5 minutes

    /**
     * Inspect raw Cookie headers and Symfony jar to determine if cookie was presented.
     * Accurately distinguishes present-but-empty from genuinely absent cookies.
     */
    public static function isCookiePresent(Request $request, string $cookieName): bool
    {
        if ($request->cookies->has($cookieName)) {
            return true;
        }

        $cookieHeaders = self::extractRawCookieHeaders($request);
        foreach ($cookieHeaders as $headerLine) {
            $parts = explode(';', (string) $headerLine);
            foreach ($parts as $part) {
                $part = trim($part);
                if ($part === $cookieName || str_starts_with($part, $cookieName . '=')) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Inspect raw Cookie headers to detect duplicate cookie keys.
     * Prevents HTTP parameter pollution / cookie confusion attacks.
     */
    public static function hasDuplicateCookie(Request $request, string $cookieName): bool
    {
        $cookieHeaders = self::extractRawCookieHeaders($request);
        $count = 0;
        foreach ($cookieHeaders as $headerLine) {
            $parts = explode(';', (string) $headerLine);
            foreach ($parts as $part) {
                $part = trim($part);
                if ($part === $cookieName || str_starts_with($part, $cookieName . '=')) {
                    $count++;
                    if ($count > 1) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Extract cookie value.
     * Returns null strictly if absent or duplicate.
     * Returns string (including empty string '' if present-but-empty) if present.
     */
    public static function getCookieValue(Request $request, string $cookieName): ?string
    {
        if (self::hasDuplicateCookie($request, $cookieName)) {
            return null;
        }

        $cookieHeaders = self::extractRawCookieHeaders($request);
        foreach ($cookieHeaders as $headerLine) {
            $parts = explode(';', (string) $headerLine);
            foreach ($parts as $part) {
                $part = trim($part);
                if (str_starts_with($part, $cookieName . '=')) {
                    return substr($part, strlen($cookieName) + 1);
                }
                if ($part === $cookieName) {
                    return '';
                }
            }
        }

        // Fallback to Symfony cookie jar
        if ($request->cookies->has($cookieName)) {
            $val = $request->cookies->get($cookieName);
            return is_string($val) ? $val : '';
        }

        return null;
    }

    /**
     * Helper to retrieve all raw cookie header lines.
     *
     * @return list<string>
     */
    private static function extractRawCookieHeaders(Request $request): array
    {
        $headers = $request->headers->all('cookie');
        if (empty($headers)) {
            $rawHeader = $request->server->get('HTTP_COOKIE');
            if (is_string($rawHeader) && trim($rawHeader) !== '') {
                $headers = [$rawHeader];
            }
        }

        return $headers;
    }

    /**
     * Create host-only, Secure, HttpOnly, SameSite=Lax cookie with Path=/api/v1.
     * Bounded to given lifetime or absolute deadline.
     *
     * Invariant: No Domain attribute (host-only).
     */
    public static function createCookie(
        string $name,
        string $value,
        int $ttlSecondsOrTimestamp,
        bool $isTimestamp = false
    ): Cookie {
        $now = time();
        if ($isTimestamp) {
            $expireTimestamp = $ttlSecondsOrTimestamp;
            $maxAge = max(0, $expireTimestamp - $now);
        } else {
            $maxAge = max(0, $ttlSecondsOrTimestamp);
            $expireTimestamp = $now + $maxAge;
        }

        return new Cookie(
            name: $name,
            value: $value,
            expire: $expireTimestamp,
            path: self::COOKIE_PATH,
            domain: null, // Host-only: strictly omit Domain attribute
            secure: true, // Secure
            httpOnly: true, // HttpOnly
            raw: false,
            sameSite: Cookie::SAMESITE_LAX // SameSite=Lax
        );
    }

    /**
     * Create expired cookie to clear client-side authority.
     * Retains same Host-only, Secure, HttpOnly, SameSite=Lax, Path=/api/v1 parameters.
     */
    public static function createClearingCookie(string $name): Cookie
    {
        return new Cookie(
            name: $name,
            value: '',
            expire: 1, // 1970-01-01 00:00:01 GMT
            path: self::COOKIE_PATH,
            domain: null, // Host-only
            secure: true,
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX
        );
    }
}
