<?php

declare(strict_types=1);

namespace Tests\Unit\Analytics;

use App\Analytics\AnalyticsEventIngestor;
use App\Http\Controllers\Analytics\AnalyticsController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AnalyticsIngestTest extends TestCase
{
    private AnalyticsEventIngestor $ingestor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ingestor = new AnalyticsEventIngestor();
    }

    public function test_psr4_controller_resolves_under_matching_namespace(): void
    {
        $this->assertTrue(class_exists(AnalyticsController::class));
        $refClass = new \ReflectionClass(AnalyticsController::class);
        $this->assertSame('App\Http\Controllers\Analytics', $refClass->getNamespaceName());
        $this->assertSame('AnalyticsController', $refClass->getShortName());
    }

    public function test_allowed_event_types_are_strictly_defined(): void
    {
        $expected = [
            'page_view',
            'engagement',
            'search',
            'booking_start',
            'archive_explore',
        ];

        $this->assertSame($expected, AnalyticsEventIngestor::ALLOWED_EVENT_TYPES);
    }

    public function test_client_reported_conversions_are_strictly_forbidden(): void
    {
        $forbidden = [
            'booked',
            'booking_complete',
            'booking_confirmed',
            'contributed',
            'contribution_complete',
            'contribution_confirmed',
        ];

        foreach ($forbidden as $evt) {
            $this->assertContains($evt, AnalyticsEventIngestor::FORBIDDEN_CLIENT_EVENTS);
            $this->assertNotContains($evt, AnalyticsEventIngestor::ALLOWED_EVENT_TYPES);
        }
    }

    public function test_path_sanitizer_normalizes_allowed_public_routes_and_strips_queries(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'sanitizeAndValidatePath');

        $cases = [
            '/' => '/',
            '/ar' => '/ar',
            '/flights' => '/flights',
            '/flights?origin=GZA&dest=AMM' => '/flights',
            '/ar/flights?search=1#results' => '/ar/flights',
            '/destinations' => '/destinations',
            '/ar/destinations' => '/ar/destinations',
            '/book' => '/book',
            '/ar/book?step=1' => '/ar/book',
            '/airport' => '/airport',
            '/airport/past' => '/airport/past',
            '/airport/present' => '/airport/present',
            '/airport/future#vision' => '/airport/future',
            '/ar/airport/future' => '/ar/airport/future',
            '/gallery' => '/gallery',
            '/travel' => '/travel',
            '/contact' => '/contact',
            '/privacy' => '/privacy',
            '/terms' => '/terms',
            '/about' => '/about',
            '/ar/about' => '/ar/about',
        ];

        foreach ($cases as $input => $expected) {
            $clean = $refMethod->invoke($this->ingestor, $input);
            $this->assertSame($expected, $clean, "Input [{$input}] should normalize to [{$expected}].");
        }
    }

    public function test_dynamic_routes_normalize_without_storing_sensitive_variables(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'sanitizeAndValidatePath');

        $cases = [
            '/destinations/AMM' => '/destinations/:code',
            '/destinations/CAI?query=1' => '/destinations/:code',
            '/destinations/:code' => '/destinations/:code',
            '/ar/destinations/DXB' => '/ar/destinations/:code',
            '/ar/destinations/:code' => '/ar/destinations/:code',
            '/flight/PS204' => '/flight/:flightId',
            '/flight/PS-204?ref=SECRET_PNR' => '/flight/:flightId',
            '/flight/:flightId' => '/flight/:flightId',
            '/ar/flight/PS204' => '/ar/flight/:flightId',
            '/ar/flight/:flightId' => '/ar/flight/:flightId',
        ];

        foreach ($cases as $input => $expected) {
            $clean = $refMethod->invoke($this->ingestor, $input);
            $this->assertSame($expected, $clean, "Dynamic input [{$input}] should normalize to [{$expected}].");
        }
    }

    public function test_path_sanitizer_strictly_rejects_private_and_sensitive_paths(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'sanitizeAndValidatePath');

        $forbidden = [
            '/admin',
            '/ar/admin',
            '/admin/settings',
            '/api',
            '/ar/api',
            '/api/v1/auth/login',
            '/auth',
            '/ar/auth',
            '/boarding-pass',
            '/ar/boarding-pass',
            '/boarding-pass/GZA-1234/1/1',
            '/booking-confirmation',
            '/ar/booking-confirmation',
            '/manage',
            '/ar/manage',
            '/manage/GZA-7K8P',
            '/privatebooking',
            '/ar/privatebooking',
            '/account',
            '/ar/account',
            '/account/profile',
            '/signin',
            '/register',
            '/forgot-password',
            '/reset-password',
            '/verify-email',
            '/storage/private/tickets',
            '/_debugbar/open',
            '/telescope/requests',
            '/oauth/authorize',
            '/unrecognized-random-path',
        ];

        foreach ($forbidden as $path) {
            try {
                $refMethod->invoke($this->ingestor, $path);
                $this->fail("Expected path [{$path}] to be rejected with 403.");
            } catch (HttpException $e) {
                $this->assertSame(403, $e->getStatusCode(), "Path [{$path}] status code mismatch.");
            }
        }
    }

    public function test_bot_detection_identifies_crawlers_and_scripts(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'isBot');

        $bots = [
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'curl/7.88.1',
            'python-requests/2.31.0',
            'Wget/1.21.3',
            'PostmanRuntime/7.32.3',
            '', // empty UA is treated as bot
        ];

        foreach ($bots as $ua) {
            $req = \Illuminate\Http\Request::create('/api/v1/analytics/events', 'POST', [], [], [], [
                'HTTP_USER_AGENT' => $ua,
            ]);
            $isBot = $refMethod->invoke($this->ingestor, $req);
            $this->assertTrue($isBot, "User-Agent [{$ua}] should be detected as bot.");
        }

        $realBrowsers = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
        ];

        foreach ($realBrowsers as $ua) {
            $req = \Illuminate\Http\Request::create('/api/v1/analytics/events', 'POST', [], [], [], [
                'HTTP_USER_AGENT' => $ua,
            ]);
            $isBot = $refMethod->invoke($this->ingestor, $req);
            $this->assertFalse($isBot, "Legitimate browser [{$ua}] should not be detected as bot.");
        }
    }

    public function test_privacy_signals_are_detected(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'hasPrivacySignal');

        $dntReq = \Illuminate\Http\Request::create('/api/v1/analytics/events', 'POST', [], [], [], [
            'HTTP_DNT' => '1',
        ]);
        $this->assertTrue($refMethod->invoke($this->ingestor, $dntReq));

        $gpcReq = \Illuminate\Http\Request::create('/api/v1/analytics/events', 'POST', [], [], [], [
            'HTTP_SEC_GPC' => '1',
        ]);
        $this->assertTrue($refMethod->invoke($this->ingestor, $gpcReq));

        $normalReq = \Illuminate\Http\Request::create('/api/v1/analytics/events', 'POST', [], [], [], [
            'HTTP_DNT' => '0',
        ]);
        $this->assertFalse($refMethod->invoke($this->ingestor, $normalReq));
    }

    public function test_referrer_sanitizer_extracts_clean_host_only(): void
    {
        $refMethod = new \ReflectionMethod(AnalyticsEventIngestor::class, 'sanitizeReferrerHost');

        $cases = [
            'https://www.google.com/search?q=gaza+airport+flights' => 'www.google.com',
            'http://user:pass@news.example.com:8080/story/123' => 'news.example.com',
            'https://palestineairways.com/flights' => 'palestineairways.com',
            'not-a-valid-url' => null,
            'https://192.168.1.1/admin' => null, // IPs rejected
        ];

        foreach ($cases as $input => $expected) {
            $clean = $refMethod->invoke($this->ingestor, $input);
            $this->assertSame($expected, $clean);
        }
    }

    public function test_bounded_constants(): void
    {
        $this->assertSame(16384, AnalyticsEventIngestor::MAX_BODY_BYTES);
        $this->assertSame(60, AnalyticsEventIngestor::MAX_ENGAGEMENT_DELTA);
        $this->assertSame(30, AnalyticsEventIngestor::SESSION_IDLE_MINUTES);
        $this->assertSame(1800, AnalyticsEventIngestor::MAX_SESSION_ENGAGEMENT);
        $this->assertSame(10, AnalyticsEventIngestor::MAX_EVENTS_PER_BATCH);
        $this->assertSame(120, AnalyticsEventIngestor::IP_RATE_LIMIT_PER_MINUTE);
    }
}
