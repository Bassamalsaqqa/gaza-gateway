<?php

declare(strict_types=1);

namespace Tests\Unit\Analytics;

use App\Analytics\AnalyticsAggregator;
use App\Analytics\AnalyticsReportRenderer;
use App\Analytics\AnalyticsReportSettingsService;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class AnalyticsMonthlyReportTest extends TestCase
{
    private AnalyticsAggregator $aggregator;
    private AnalyticsReportRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->aggregator = new AnalyticsAggregator();
        $this->renderer = new AnalyticsReportRenderer();
    }

    public function test_previous_month_date_range_in_asia_hebron_timezone(): void
    {
        $tz = new DateTimeZone('Asia/Hebron');
        // Reference time: 2026-10-23 10:27:05 Asia/Hebron
        $now = new DateTimeImmutable('2026-10-23 10:27:05', $tz);

        $range = $this->aggregator->resolveDateRange('previous_month', $now);

        $this->assertSame('previous_month', $range['period_key']);
        $this->assertSame('2026-09', $range['period_identifier']);

        // In Asia/Hebron (Daylight saving UTC+3 in September/October):
        // 2026-09-01 00:00:00 Asia/Hebron = 2026-08-31 21:00:00 UTC
        // 2026-10-01 00:00:00 Asia/Hebron = 2026-09-30 21:00:00 UTC (half-open interval [start, end))
        $this->assertSame('2026-08-31 21:00:00', $range['start_utc']->format('Y-m-d H:i:s'));
        $this->assertSame('2026-09-30 21:00:00', $range['end_utc']->format('Y-m-d H:i:s'));
    }

    public function test_standard_periods_are_resolved(): void
    {
        $tz = new DateTimeZone('Asia/Hebron');
        $now = new DateTimeImmutable('2026-10-23 12:00:00', $tz);

        $p7 = $this->aggregator->resolveDateRange('7', $now);
        $this->assertSame('7d', $p7['period_key']);
        $this->assertSame('2026-10-16 09:00:00', $p7['start_utc']->format('Y-m-d H:i:s'));

        $p30 = $this->aggregator->resolveDateRange('30', $now);
        $this->assertSame('30d', $p30['period_key']);
        $this->assertSame('2026-09-23 09:00:00', $p30['start_utc']->format('Y-m-d H:i:s'));

        $p90 = $this->aggregator->resolveDateRange('90', $now);
        $this->assertSame('90d', $p90['period_key']);
        $this->assertSame('2026-07-25 09:00:00', $p90['start_utc']->format('Y-m-d H:i:s'));
    }

    public function test_invalid_period_throws_exception(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unsupported analytics period');
        $this->aggregator->resolveDateRange('invalid_period');
    }

    public function test_branded_html_email_rendering(): void
    {
        $summary = [
            'traffic' => [
                'pageViews' => 2540,
                'uniqueSessions' => 610,
                'uniqueVisitors' => 520,
                'totalEngagementSeconds' => 78200,
                'avgEngagementSecondsPerSession' => 128.2,
            ],
            'authoritativeBusinessSuccess' => [
                'confirmedBookings' => 84,
                'archiveContributions' => 32,
                'bookingConversionRate' => 0.1615,
                'archiveConversionRate' => 0.0615,
            ],
            'interactions' => [
                'searches' => 210,
                'bookingStarts' => 185,
                'archiveExplores' => 140,
            ],
            'topPages' => [
                ['path' => '/', 'views' => 950, 'engagementSeconds' => 24000],
                ['path' => '/ar', 'views' => 620, 'engagementSeconds' => 18000],
                ['path' => '/flights', 'views' => 450, 'engagementSeconds' => 14000],
                ['path' => '/archive', 'views' => 310, 'engagementSeconds' => 11000],
            ],
            'countries' => [
                ['country' => 'PS', 'views' => 1450],
                ['country' => 'JO', 'views' => 420],
                ['country' => 'XX', 'views' => 670],
            ],
        ];

        $html = $this->renderer->renderHtml($summary, '2026-09');

        // Verify authentic brand tokens and inline styles
        $this->assertStringContainsString('https://www.gazaairport.com/admin/analytics', $html);
        $this->assertStringNotContainsString('Delivery Status: Accepted', $html);
        $this->assertStringContainsString('#1b3323', $html); // Brand deep olive
        $this->assertStringContainsString('#b85838', $html); // Brand terracotta/clay
        $this->assertStringContainsString('#fbf8f3', $html); // Warm limestone/sand
        $this->assertStringContainsString('#f5efe4', $html); // Soft sand container
        $this->assertStringContainsString('#1c211e', $html); // Dark ink

        // Verify authentic bilingual naming
        $this->assertStringContainsString('Gaza International Airport', $html);
        $this->assertStringContainsString('مطار غزة الدولي', $html);
        $this->assertStringContainsString('Palestine Airways Limited', $html);
        $this->assertStringContainsString('الخطوط الجوية الفلسطينية', $html);

        // Verify rendered metrics
        $this->assertStringContainsString('2,540', $html);
        $this->assertStringContainsString('610', $html);
        $this->assertStringContainsString('84', $html);
        $this->assertStringContainsString('32', $html);
        $this->assertStringContainsString('210', $html);
        $this->assertStringContainsString('185', $html);

        // Verify top pages
        $this->assertStringContainsString('/flights', $html);
        $this->assertStringContainsString('/archive', $html);

        // Verify zero PII (no personal email addresses, phone numbers, raw IPs)
        $this->assertStringNotContainsString('@example.com', $html);
        $this->assertStringNotContainsString('192.168.', $html);
        $this->assertStringNotContainsString('10.0.0.', $html);

        // Verify bilingual subject
        $subject = $this->renderer->buildSubject('2026-09');
        $this->assertStringContainsString('2026-09', $subject);
        $this->assertStringContainsString('Gaza Airport', $subject);
        $this->assertStringContainsString('مطار غزة الدولي', $subject);
    }

    public function test_settings_validation_rejects_malformed_inputs(): void
    {
        $service = new AnalyticsReportSettingsService();

        // Missing expectedRevision
        try {
            $service->save(['enabled' => true, 'recipientEmail' => 'valid@gazaairport.com'], '00000000-0000-0000-0000-000000000000');
            $this->fail('Expected exception for missing expectedRevision');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('expectedRevision', $e->getMessage());
        }

        // Invalid email
        try {
            $service->save(['expectedRevision' => 1, 'enabled' => true, 'recipientEmail' => 'not-an-email'], '00000000-0000-0000-0000-000000000000');
            $this->fail('Expected exception for invalid email');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('recipientEmail', $e->getMessage());
        }

        // CRLF injection attempt
        try {
            $service->save([
                'expectedRevision' => 1,
                'enabled' => true,
                'recipientEmail' => "admin@gazaairport.com\r\nBcc: evil@attacker.com",
            ], '00000000-0000-0000-0000-000000000000');
            $this->fail('Expected exception for CRLF header injection');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('injection', $e->getMessage());
        }
    }
}
