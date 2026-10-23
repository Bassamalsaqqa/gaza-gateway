<?php

declare(strict_types=1);

namespace App\Analytics;

use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class AnalyticsAggregator
{
    public const TIMEZONE = 'Asia/Hebron';

    /**
     * Compute summary metrics for a given period.
     *
     * @param string $period '7', '30', '90', or 'previous_month'
     * @param DateTimeImmutable|null $referenceTime Optional reference time for testing
     * @return array<string, mixed>
     */
    public function getSummary(string $period, ?DateTimeImmutable $referenceTime = null): array
    {
        $range = $this->resolveDateRange($period, $referenceTime);
        $startUtc = $range['start_utc']->format('Y-m-d H:i:s.u');
        $endUtc = $range['end_utc']->format('Y-m-d H:i:s.u');

        // Half-open interval [start, end) preserving fractional seconds
        $eventsQuery = DB::table('analytics_events')
            ->where('created_at', '>=', $startUtc)
            ->where('created_at', '<', $endUtc);

        // 1. Traffic & Engagement
        $trafficRow = (clone $eventsQuery)
            ->selectRaw("
                COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views,
                COUNT(DISTINCT session_id) as unique_sessions,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COALESCE(SUM(CASE WHEN event_type = 'engagement' THEN engagement_seconds ELSE 0 END), 0) as total_engagement_seconds
            ")
            ->first();

        $pageViews = (int) ($trafficRow->page_views ?? 0);
        $uniqueSessions = (int) ($trafficRow->unique_sessions ?? 0);
        $uniqueVisitors = (int) ($trafficRow->unique_visitors ?? 0);
        $totalEngagement = (int) ($trafficRow->total_engagement_seconds ?? 0);
        $avgEngagement = $uniqueSessions > 0 ? round($totalEngagement / $uniqueSessions, 1) : 0.0;

        // 2. Specific allowed interaction events
        $interactionsRow = (clone $eventsQuery)
            ->selectRaw("
                COUNT(CASE WHEN event_type = 'search' THEN 1 END) as searches,
                COUNT(CASE WHEN event_type = 'booking_start' THEN 1 END) as booking_starts,
                COUNT(CASE WHEN event_type = 'archive_explore' THEN 1 END) as archive_explores
            ")
            ->first();

        $searches = (int) ($interactionsRow->searches ?? 0);
        $bookingStarts = (int) ($interactionsRow->booking_starts ?? 0);
        $archiveExplores = (int) ($interactionsRow->archive_explores ?? 0);

        // 3. Authoritative Business Records (reported separately; zero invented conversion rate)
        // Authoritative sources verified from codebase: mvp_reservations (MVP commemorative reservations)
        $confirmedBookings = 0;
        if (DB::getSchemaBuilder()->hasTable('mvp_reservations')) {
            $confirmedBookings = DB::table('mvp_reservations')
                ->where('status', 'confirmed')
                ->where('created_at', '>=', $startUtc)
                ->where('created_at', '<', $endUtc)
                ->count();
        }

        $archiveContributions = 0;
        if (DB::getSchemaBuilder()->hasTable('archive_contributions')) {
            $archiveContributions = DB::table('archive_contributions')
                ->where('created_at', '>=', $startUtc)
                ->where('created_at', '<', $endUtc)
                ->count();
        }

        // 4. Top visited pages (aggregating page views AND engagement seconds per canonical page)
        $topPages = (clone $eventsQuery)
            ->groupBy('path')
            ->selectRaw("
                path,
                COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as views,
                COALESCE(SUM(CASE WHEN event_type = 'engagement' THEN engagement_seconds ELSE 0 END), 0) as engagement_seconds
            ")
            ->havingRaw("views > 0 OR engagement_seconds > 0")
            ->orderByDesc('views')
            ->orderByDesc('engagement_seconds')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'path' => (string) $r->path,
                'views' => (int) $r->views,
                'engagementSeconds' => (int) $r->engagement_seconds,
            ])
            ->all();

        // 5. Geographic distribution (explicitly labeled pageViews)
        $countries = (clone $eventsQuery)
            ->groupBy('country_code')
            ->selectRaw("country_code as country, COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views")
            ->orderByDesc('page_views')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'country' => (string) $r->country,
                'pageViews' => (int) $r->page_views,
            ])
            ->all();

        // 6. Referrer Hostnames (bounded top 10, page views only)
        $referrerHosts = (clone $eventsQuery)
            ->whereNotNull('referrer_host')
            ->groupBy('referrer_host')
            ->selectRaw("referrer_host as host, COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views")
            ->havingRaw('page_views > 0')
            ->orderByDesc('page_views')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'host' => (string) $r->host,
                'pageViews' => (int) $r->page_views,
            ])
            ->all();

        // 7. Daily Trend across the period (UTC bucketing)
        $dailyTrend = (clone $eventsQuery)
            ->selectRaw("
                DATE(created_at) as event_date,
                COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COALESCE(SUM(CASE WHEN event_type = 'engagement' THEN engagement_seconds ELSE 0 END), 0) as engagement_seconds
            ")
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy(DB::raw('DATE(created_at)'))
            ->get()
            ->map(fn ($r) => [
                'date' => (string) $r->event_date,
                'dateUtc' => (string) $r->event_date,
                'pageViews' => (int) $r->page_views,
                'uniqueVisitors' => (int) $r->unique_visitors,
                'engagementSeconds' => (int) $r->engagement_seconds,
            ])
            ->all();

        $routeSearches = (clone $eventsQuery)->where('event_type', 'search')->whereNotNull('search_route')
            ->selectRaw('search_route AS route, COUNT(*) AS searches')->groupBy('search_route')
            ->orderByDesc('searches')->limit(20)->get()
            ->map(fn ($row) => ['route' => $row->route, 'count' => (int) $row->searches])->all();
        $bookingRoutes = DB::table('mvp_reservations AS r')->join('mvp_services AS s', 's.id', '=', 'r.service_id')
            ->where('r.status', 'confirmed')->where('r.created_at', '>=', $startUtc)->where('r.created_at', '<', $endUtc)
            ->selectRaw("CONCAT(s.origin_code, '-', s.destination_code) AS route, COUNT(*) AS bookings")
            ->groupBy('s.origin_code', 's.destination_code')->orderByDesc('bookings')->limit(20)->get()
            ->map(fn ($row) => ['route' => $row->route, 'count' => (int) $row->bookings])->all();

        // Earliest captured event date
        $earliest = DB::table('analytics_events')->min('created_at');

        return [
            'period' => $range['period_key'],
            'periodStart' => $range['start_utc']->format('Y-m-d\TH:i:s.u\Z'),
            'periodEnd' => $range['end_utc']->format('Y-m-d\TH:i:s.u\Z'),
            'timezone' => self::TIMEZONE,
            'traffic' => [
                'pageViews' => $pageViews,
                'uniqueSessions' => $uniqueSessions,
                'uniqueVisitors' => $uniqueVisitors,
                'totalEngagementSeconds' => $totalEngagement,
                'avgEngagementSecondsPerSession' => $avgEngagement,
            ],
            'interactions' => [
                'searches' => $searches,
                'bookingStarts' => $bookingStarts,
                'archiveExplores' => $archiveExplores,
            ],
            'authoritativeBusinessSuccess' => [
                'confirmedBookings' => $confirmedBookings,
                'archiveContributions' => $archiveContributions,
                'conversionRate' => null,
                'conversionRateNotice' => 'unsupported (authoritative business records are independent of first-party client analytics)',
            ],
            'topPages' => $topPages,
            'countries' => $countries,
            'referrerHosts' => $referrerHosts,
            'dailyTrend' => $dailyTrend,
            'dailyTrendTimezone' => 'UTC',
            'routeSearches' => $routeSearches,
            'bookingRoutes' => $bookingRoutes,
            'metadata' => [
                'retentionPolicy' => 'raw events eligible for bounded deletion after 90 days',
                'rawRetentionDays' => 90,
                'captureSince' => $earliest ? (string) $earliest : null,
                'dataCoverage' => 'opt-in session estimates; bounded 90-day retention target',
            ],
        ];
    }

    /**
     * Resolve period key to UTC date boundaries using a half-open interval [start, end).
     *
     * @return array{period_key: string, start_utc: DateTimeImmutable, end_utc: DateTimeImmutable, period_identifier: string}
     */
    public function resolveDateRange(string $period, ?DateTimeImmutable $referenceTime = null): array
    {
        $tz = new DateTimeZone(self::TIMEZONE);
        $utc = new DateTimeZone('UTC');

        $now = $referenceTime ?? new DateTimeImmutable('now', $tz);
        if ($now->getTimezone()->getName() !== self::TIMEZONE) {
            $now = $now->setTimezone($tz);
        }

        $canonicalPeriod = strtolower(trim($period));

        if (in_array($canonicalPeriod, ['7', '7d', 'week'], true)) {
            $start = $now->modify('-7 days');
            return [
                'period_key' => '7d',
                'start_utc' => $start->setTimezone($utc),
                'end_utc' => $now->setTimezone($utc),
                'period_identifier' => 'last_7_days',
            ];
        }

        if (in_array($canonicalPeriod, ['30', '30d', 'month'], true)) {
            $start = $now->modify('-30 days');
            return [
                'period_key' => '30d',
                'start_utc' => $start->setTimezone($utc),
                'end_utc' => $now->setTimezone($utc),
                'period_identifier' => 'last_30_days',
            ];
        }

        if (in_array($canonicalPeriod, ['90', '90d', 'quarter'], true)) {
            $start = $now->modify('-90 days');
            return [
                'period_key' => '90d',
                'start_utc' => $start->setTimezone($utc),
                'end_utc' => $now->setTimezone($utc),
                'period_identifier' => 'last_90_days',
            ];
        }

        if (in_array($canonicalPeriod, ['previous_month', 'last_month', 'previousmonth'], true)) {
            // Start of current month 00:00:00 in Asia/Hebron
            $firstOfThisMonth = $now->modify('first day of this month 00:00:00');
            // Start of previous month 00:00:00 in Asia/Hebron
            $startOfPrevMonth = $firstOfThisMonth->modify('-1 month');

            // Half-open interval [startOfPrevMonth, firstOfThisMonth) in Asia/Hebron
            return [
                'period_key' => 'previous_month',
                'start_utc' => $startOfPrevMonth->setTimezone($utc),
                'end_utc' => $firstOfThisMonth->setTimezone($utc),
                'period_identifier' => $startOfPrevMonth->format('Y-m'),
            ];
        }

        throw new InvalidArgumentException("Unsupported analytics period: [{$period}]. Valid: 7, 30, 90, previous_month.");
    }
}
