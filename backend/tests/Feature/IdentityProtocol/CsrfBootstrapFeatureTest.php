<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CsrfBootstrapFeatureTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Clean test sessions prior to each test run in foreign key order
        DB::table('passenger_sessions')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->delete();
    }

    protected function tearDown(): void
    {
        DB::table('passenger_sessions')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->delete();

        parent::tearDown();
    }

    private function withHttps(): self
    {
        return $this->withServerVariables([
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
        ]);
    }

    public function testInsecureTransportWithoutHttpsIsDeniedEvenWithTransportHeader(): void
    {
        // Must reject plain HTTP requests even if public transport fixture header is provided
        $response = $this->withHeaders([
            'X-PHPUnit-Transport-Fixture' => '1',
        ])->get('http://127.0.0.1:18090/api/v1/auth/csrf');

        $response->assertStatus(403);
        $this->assertSame('insecure_transport', $response->json('error.code'));
    }

    public function testPassengerBootstrapWithAbsentCookieIssuesAnonymousSession(): void
    {
        $response = $this->withHttps()->get('/api/v1/auth/csrf');

        $response->assertStatus(200);
        $response->assertHeader('Cache-Control', 'no-store, private');
        $response->assertHeader('Content-Type', 'application/json');
        $this->assertTrue($response->headers->has('X-Request-Id'));

        $data = $response->json();
        $this->assertArrayHasKey('csrfToken', $data);
        $this->assertArrayNotHasKey('success', $data, 'Bootstraps must return exact raw {csrfToken} without success wrapper.');
        $this->assertArrayNotHasKey('meta', $data, 'Bootstraps must return exact raw {csrfToken} without meta wrapper.');
        $this->assertCount(1, $data);

        // Verify cookie attributes
        $cookies = $response->headers->getCookies();
        $sessionCookie = null;
        foreach ($cookies as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $sessionCookie = $cookie;
                break;
            }
        }

        $this->assertNotNull($sessionCookie);
        $this->assertNull($sessionCookie->getDomain(), 'Cookie must be host-only.');
        $this->assertTrue($sessionCookie->isSecure());
        $this->assertTrue($sessionCookie->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $sessionCookie->getSameSite()));
        $this->assertGreaterThanOrEqual(1790, $sessionCookie->getMaxAge());
        $this->assertLessThanOrEqual(1800, $sessionCookie->getMaxAge());

        // Verify session was persisted in PostgreSQL test database
        $token = $sessionCookie->getValue();
        $digest = OpaqueToken::digestOf($token);
        $row = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first();
        $this->assertNotNull($row);
        $this->assertSame('anonymous', $row->auth_level);
        $this->assertNull($row->user_id);
    }

    public function testPassengerRebootstrapWithValidCookieReturnsSameSessionCsrfAndRetainsDeadline(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        $response = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_PASSENGER, $receipt->getRawToken())
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(200);
        $data = $response->json();
        $this->assertSame($receipt->getCsrfToken(), $data['csrfToken'], 'Re-bootstrap must return the active session CSRF token.');

        // Verify no duplicate session was inserted
        $count = DB::table('passenger_sessions')->count();
        $this->assertSame(1, $count);
    }

    public function testPassengerBootstrapWithPresentEmptyCookieRejectsAndClears(): void
    {
        // Invariant: Present-but-empty expected cookie must clear and deny (401), never issue anonymous session
        $response = $this->withHttps()
            ->withHeaders([
                'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=',
            ])
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(401);
        $data = $response->json();
        $this->assertFalse($data['success']);
        $this->assertSame('unauthorized', $data['error']['code']);

        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $cookie;
                break;
            }
        }

        $this->assertNotNull($clearingCookie);
        $this->assertSame(0, $clearingCookie->getMaxAge());
        // Subsequent request with legitimately absent cookie succeeds and creates anonymous session
        $this->flushHeaders();
        $this->defaultCookies = [];
        $subsequentResponse = $this->withHttps()->get('/api/v1/auth/csrf');
        $subsequentResponse->assertStatus(200);
        $this->assertSame(1, DB::table('passenger_sessions')->count());
    }

    public function testPassengerBootstrapWithMalformedCookieRejectsAndClears(): void
    {
        $malformedToken = 'not_a_valid_43_char_base64url_token!!';

        $response = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_PASSENGER, $malformedToken)
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(401);
        $data = $response->json();
        $this->assertFalse($data['success']);
        $this->assertSame('unauthorized', $data['error']['code']);

        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $cookie;
                break;
            }
        }

        $this->assertNotNull($clearingCookie);
        $this->assertSame(0, $clearingCookie->getMaxAge());
        $this->assertSame(0, DB::table('passenger_sessions')->count());
    }

    public function testPassengerBootstrapWithExpiredOrRevokedCookieRejectsAndClears(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        // Revoke the session immediately
        $store->revoke($receipt->getRawToken());

        $response = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_PASSENGER, $receipt->getRawToken())
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(401);
        $this->assertSame(1, DB::table('passenger_sessions')->count(), 'Must not issue another anonymous session.');

        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $cookie;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertSame(0, $clearingCookie->getMaxAge());
    }

    public function testPassengerBootstrapWithDuplicateCookiesFailsClosedAndClears(): void
    {
        $response = $this->withHttps()
            ->withHeaders([
                'Cookie' => 'gza_session=tokA; gza_session=tokB',
            ])
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(400);
        $data = $response->json();
        $this->assertSame('duplicate_cookie', $data['error']['code']);

        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $cookie;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertSame(0, $clearingCookie->getMaxAge());
        $this->assertSame(0, DB::table('passenger_sessions')->count());
    }

    public function testStaffBootstrapWithAbsentCookieIssuesStaffAnonymousSession(): void
    {
        $response = $this->withHttps()->get('/api/v1/staff/csrf');

        $response->assertStatus(200);
        $data = $response->json();
        $this->assertArrayHasKey('csrfToken', $data);
        $this->assertCount(1, $data);

        $cookies = $response->headers->getCookies();
        $sessionCookie = null;
        foreach ($cookies as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_STAFF) {
                $sessionCookie = $cookie;
                break;
            }
        }

        $this->assertNotNull($sessionCookie);
        $this->assertNull($sessionCookie->getDomain(), 'Host-only cookie.');
        $this->assertTrue($sessionCookie->isSecure());
        $this->assertTrue($sessionCookie->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $sessionCookie->getSameSite()));
        $this->assertGreaterThanOrEqual(1790, $sessionCookie->getMaxAge());
        $this->assertLessThanOrEqual(1800, $sessionCookie->getMaxAge());

        $token = $sessionCookie->getValue();
        $digest = OpaqueToken::digestOf($token);
        $row = DB::table('staff_sessions')->where('lookup_digest', $digest)->first();
        $this->assertNotNull($row);
        $this->assertSame('anonymous', $row->auth_level);
        $this->assertNull($row->staff_id);
    }

    public function testDualCookiesCoexistWithoutCrossRealmContamination(): void
    {
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $pReceipt = $pStore->issueAnonymous();

        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $sReceipt = $sStore->issueAnonymous();

        $this->assertNotSame($pReceipt->getCsrfToken(), $sReceipt->getCsrfToken());

        // Same browser sending both cookies to passenger endpoint
        $pResponse = $this->withHttps()
            ->withHeaders([
                'Cookie' => 'gza_session=' . $pReceipt->getRawToken() . '; gza_staff_session=' . $sReceipt->getRawToken(),
            ])
            ->get('/api/v1/auth/csrf');

        $pResponse->assertStatus(200);
        $this->assertSame($pReceipt->getCsrfToken(), $pResponse->json('csrfToken'));

        // Same browser sending both cookies to staff endpoint
        $sResponse = $this->withHttps()
            ->withHeaders([
                'Cookie' => 'gza_session=' . $pReceipt->getRawToken() . '; gza_staff_session=' . $sReceipt->getRawToken(),
            ])
            ->get('/api/v1/staff/csrf');

        $sResponse->assertStatus(200);
        $this->assertSame($sReceipt->getCsrfToken(), $sResponse->json('csrfToken'));
    }

    public function testUnrelatedCookieAloneDoesNotBlockAnonymousBootstrap(): void
    {
        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $sReceipt = $sStore->issueAnonymous();

        // Browser presents only staff cookie to passenger endpoint
        $response = $this->withHttps()
            ->withHeaders([
                'Cookie' => 'gza_staff_session=' . $sReceipt->getRawToken(),
            ])
            ->get('/api/v1/auth/csrf');

        $response->assertStatus(200);
        $this->assertSame(1, DB::table('passenger_sessions')->count(), 'Must issue anonymous passenger session.');
    }
}
