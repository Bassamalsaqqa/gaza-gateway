<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityProtocol;

use App\Identity\Protocol\CookieSecurity;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

final class CookieSecurityTest extends TestCase
{
    public function testDetectsDuplicateCookieInRawHeader(): void
    {
        $request = Request::create('/api/v1/auth/csrf', 'GET', [], [], [], [
            'HTTP_COOKIE' => 'gza_session=tokenA; gza_session=tokenB',
        ]);

        $this->assertTrue(CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_PASSENGER));
        $this->assertFalse(CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_STAFF));
        $this->assertNull(CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER));
    }

    public function testExtractsSingleCookieValueSuccessfully(): void
    {
        $request = Request::create('/api/v1/auth/csrf', 'GET', [], [], [], [
            'HTTP_COOKIE' => 'other_cookie=xyz; gza_session=valid_token_value; another=123',
        ]);

        $this->assertFalse(CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_PASSENGER));
        $this->assertSame('valid_token_value', CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER));
        $this->assertNull(CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF));
    }

    public function testIsCookiePresentDistinguishesPresentEmptyFromAbsent(): void
    {
        // 1. Genuinely absent
        $absentReq = Request::create('/api/v1/auth/csrf', 'GET');
        $this->assertFalse(CookieSecurity::isCookiePresent($absentReq, CookieSecurity::COOKIE_PASSENGER));
        $this->assertNull(CookieSecurity::getCookieValue($absentReq, CookieSecurity::COOKIE_PASSENGER));

        // 2. Present-but-empty via raw header (gza_session=)
        $emptyHeaderReq = Request::create('/api/v1/auth/csrf', 'GET', [], [], [], [
            'HTTP_COOKIE' => 'gza_session=',
        ]);
        $this->assertTrue(CookieSecurity::isCookiePresent($emptyHeaderReq, CookieSecurity::COOKIE_PASSENGER));
        $this->assertSame('', CookieSecurity::getCookieValue($emptyHeaderReq, CookieSecurity::COOKIE_PASSENGER));

        // 3. Present without value via raw header (gza_session)
        $noValReq = Request::create('/api/v1/auth/csrf', 'GET', [], [], [], [
            'HTTP_COOKIE' => 'gza_session',
        ]);
        $this->assertTrue(CookieSecurity::isCookiePresent($noValReq, CookieSecurity::COOKIE_PASSENGER));
        $this->assertSame('', CookieSecurity::getCookieValue($noValReq, CookieSecurity::COOKIE_PASSENGER));

        // 4. Present in Symfony jar with empty string
        $symfonyJarReq = Request::create('/api/v1/auth/csrf', 'GET', [], [
            'gza_session' => '',
        ]);
        $this->assertTrue(CookieSecurity::isCookiePresent($symfonyJarReq, CookieSecurity::COOKIE_PASSENGER));
        $this->assertSame('', CookieSecurity::getCookieValue($symfonyJarReq, CookieSecurity::COOKIE_PASSENGER));

        // 5. Unrelated realm cookie does not mark expected cookie as present
        $unrelatedReq = Request::create('/api/v1/auth/csrf', 'GET', [], [], [], [
            'HTTP_COOKIE' => 'gza_staff_session=some_staff_token',
        ]);
        $this->assertFalse(CookieSecurity::isCookiePresent($unrelatedReq, CookieSecurity::COOKIE_PASSENGER));
        $this->assertTrue(CookieSecurity::isCookiePresent($unrelatedReq, CookieSecurity::COOKIE_STAFF));
    }

    public function testCreatesHostOnlySecureHttpOnlyLaxCookie(): void
    {
        $cookie = CookieSecurity::createCookie(
            name: CookieSecurity::COOKIE_PASSENGER,
            value: 'canonical_test_bearer_token',
            ttlSecondsOrTimestamp: 1800
        );

        $this->assertSame(CookieSecurity::COOKIE_PASSENGER, $cookie->getName());
        $this->assertSame('canonical_test_bearer_token', $cookie->getValue());
        $this->assertNull($cookie->getDomain(), 'Host-only cookie must omit Domain attribute.');
        $this->assertSame('/api/v1', $cookie->getPath());
        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $cookie->getSameSite()));
        $this->assertSame(1800, $cookie->getMaxAge());
    }

    public function testCreatesClearingCookieWithMaxAgeZero(): void
    {
        $cookie = CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_PASSENGER);

        $this->assertSame(CookieSecurity::COOKIE_PASSENGER, $cookie->getName());
        $this->assertSame('', $cookie->getValue());
        $this->assertSame(1, $cookie->getExpiresTime());
        $this->assertSame(0, $cookie->getMaxAge());
        $this->assertNull($cookie->getDomain());
        $this->assertSame('/api/v1', $cookie->getPath());
        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $cookie->getSameSite()));
    }

    public function testCreatesCookieBoundedToTimestamp(): void
    {
        $futureTime = time() + 3600;
        $cookie = CookieSecurity::createCookie(
            name: CookieSecurity::COOKIE_STAFF,
            value: 'staff_bearer',
            ttlSecondsOrTimestamp: $futureTime,
            isTimestamp: true
        );

        $this->assertSame($futureTime, $cookie->getExpiresTime());
        $this->assertGreaterThanOrEqual(3595, $cookie->getMaxAge());
        $this->assertLessThanOrEqual(3600, $cookie->getMaxAge());
    }
}
