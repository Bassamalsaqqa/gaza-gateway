<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Identity\Protocol\CookieSecurity;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AnalyticsEventIngestor
{
    public const ALLOWED_EVENT_TYPES = [
        'page_view',
        'engagement',
        'search',
        'booking_start',
        'archive_explore',
    ];

    public const FORBIDDEN_CLIENT_EVENTS = [
        'booked',
        'booking_complete',
        'booking_confirmed',
        'contributed',
        'contribution_complete',
        'contribution_confirmed',
    ];

    public const CANONICAL_PUBLIC_ROUTES = [
        '/',
        '/ar',
        '/flights',
        '/ar/flights',
        '/destinations',
        '/ar/destinations',
        '/destinations/:code',
        '/ar/destinations/:code',
        '/flight/:flightId',
        '/ar/flight/:flightId',
        '/book',
        '/ar/book',
        '/airport',
        '/ar/airport',
        '/airport/past',
        '/ar/airport/past',
        '/airport/present',
        '/ar/airport/present',
        '/airport/future',
        '/ar/airport/future',
        '/gallery',
        '/ar/gallery',
        '/travel',
        '/ar/travel',
        '/contact',
        '/ar/contact',
        '/privacy',
        '/ar/privacy',
        '/terms',
        '/ar/terms',
        '/about',
        '/ar/about',
    ];

    public const MAX_BODY_BYTES = 16384; // 16 KiB
    public const MAX_ENGAGEMENT_DELTA = 60; // 60 seconds
    public const SESSION_IDLE_MINUTES = 30; // 30 minutes inactivity
    public const MAX_SESSION_ENGAGEMENT = 1800; // 30 minutes max engagement per session
    public const MAX_EVENTS_PER_SESSION = 200;
    public const MAX_EVENTS_PER_BATCH = 10;
    public const IP_RATE_LIMIT_PER_MINUTE = 120;

    /**
     * Process an incoming analytics ingestion request.
     *
     * @return array{status: string, count: int}
     */
    public function ingest(Request $request): array
    {
        // 1. Feature flag
        if (config('analytics.enabled', true) !== true) {
            return ['status' => 'disabled', 'count' => 0];
        }

        // 2. Transport & strict same-origin checks
        $this->assertTransportSecurity($request);

        // 3. Reject staff cookie if present (never track staff administrative sessions)
        if (CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF)
            || CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF_PENDING)) {
            return ['status' => 'staff_cookie_ignored', 'count' => 0];
        }

        // 4. User Privacy Preferences: DNT and GPC (Global Privacy Control)
        if ($this->hasPrivacySignal($request)) {
            return ['status' => 'privacy_signal_respected', 'count' => 0];
        }

        // 5. Bot & Crawler rejection
        if ($this->isBot($request)) {
            return ['status' => 'bot_rejected', 'count' => 0];
        }

        // 6. Atomic Transient IP Rate Limiting (No raw IP or UA is ever stored)
        $this->assertTransientRateLimit($request);

        // 7. Request stream read bounded 16KiB + 1 and strict validation
        $events = $this->parseAndValidateBody($request);
        if (empty($events)) {
            return ['status' => 'empty', 'count' => 0];
        }

        // 8. Ingest and persist events with atomic session anchor & engagement cap
        $count = $this->persistEvents($events);

        return ['status' => 'recorded', 'count' => $count];
    }

    private function assertTransportSecurity(Request $request): void
    {
        // Require HTTPS in non-local environments
        $isLocalOrTesting = app()->environment('local', 'testing');
        if (!$isLocalOrTesting && (!$request->isSecure() || $request->server->get('HTTPS') === 'off')) {
            throw new HttpException(403, 'HTTPS required.');
        }

        // Mandatory exact same-origin Origin: reject missing, null, or empty Origin
        $origin = $request->header('Origin');
        if ($origin === null || trim($origin) === '' || $origin === 'null') {
            throw new HttpException(403, 'Missing or empty Origin header.');
        }

        $allowedOrigins = (array) config('cors.allowed_origins', []);
        $appUrl = (string) config('app.url', '');
        $parsedAppUrl = parse_url($appUrl);
        $appOrigin = ($parsedAppUrl['scheme'] ?? 'https') . '://' . ($parsedAppUrl['host'] ?? 'localhost') . (isset($parsedAppUrl['port']) ? ':' . $parsedAppUrl['port'] : '');

        $isOriginAllowed = in_array($origin, $allowedOrigins, true)
            || ($appOrigin !== '' && hash_equals($appOrigin, $origin));

        if (!$isOriginAllowed) {
            throw new HttpException(403, 'Cross-origin analytics submission is forbidden.');
        }

        // Sec-Fetch Metadata Checks: reject cross-site
        $secFetchSite = $request->header('Sec-Fetch-Site');
        if ($secFetchSite !== null && in_array($secFetchSite, ['cross-site'], true)) {
            throw new HttpException(403, 'Cross-site fetch rejected.');
        }

        // Content-Type must be application/json
        $contentType = (string) $request->header('Content-Type', '');
        if (!str_contains(strtolower($contentType), 'application/json')) {
            throw new HttpException(415, 'Content-Type must be application/json.');
        }
    }

    private function hasPrivacySignal(Request $request): bool
    {
        $dnt = $request->header('DNT');
        if ($dnt === '1') {
            return true;
        }

        $gpc = $request->header('Sec-GPC');
        if ($gpc === '1') {
            return true;
        }

        return false;
    }

    private function isBot(Request $request): bool
    {
        $ua = (string) $request->header('User-Agent', '');
        if ($ua === '') {
            return true;
        }

        $botPattern = '/(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|curl|wget|python|scanner|headless|phantom|postman|insomnia)/i';
        return preg_match($botPattern, $ua) === 1;
    }

    private function assertTransientRateLimit(Request $request): void
    {
        $ip = (string) ($request->ip() ?? '127.0.0.1');
        $key = 'analytics_rate_' . hash('sha256', $ip . (string) config('app.key', 'gaza_key'));

        $attempts = RateLimiter::hit($key, 60);
        if ($attempts > self::IP_RATE_LIMIT_PER_MINUTE) {
            throw new HttpException(429, 'Rate limit exceeded.');
        }

    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function parseAndValidateBody(Request $request): array
    {
        // 1. Read bounded body from early middleware cache or stream
        $rawContent = $request->attributes->get('analytics_raw_body');
        if (!is_string($rawContent)) {
            $stream = $request->getContent(true);
            $rawContent = is_resource($stream)
                ? (string) stream_get_contents($stream, self::MAX_BODY_BYTES + 1) : '';
        }

        if (strlen($rawContent) > self::MAX_BODY_BYTES) {
            throw new HttpException(413, 'Payload exceeds 16KiB size limit.');
        }

        $decoded = json_decode($rawContent, true);
        if (!is_array($decoded)) {
            throw new HttpException(400, 'Invalid JSON payload.');
        }

        // Handle single event object vs batch array of events
        $items = isset($decoded[0]) && is_array($decoded[0]) ? $decoded : [$decoded];

        if (count($items) > self::MAX_EVENTS_PER_BATCH) {
            throw new HttpException(422, 'Batch exceeds maximum events per request limit.');
        }

        $allowedKeys = [
            'visitorId',
            'eventId',
            'eventType',
            'path',
            'engagementSeconds',
            'referrer',
            'searchRoute',
        ];

        $validated = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                throw new HttpException(422, 'Malformed event item.');
            }

            // Strict closed keys check: reject unrecognized keys
            foreach (array_keys($item) as $key) {
                if (!in_array($key, $allowedKeys, true)) {
                    throw new HttpException(422, "Unrecognized key [{$key}] in event item.");
                }
            }

            // Strict required fields
            if (!isset($item['visitorId'], $item['eventId'], $item['eventType'], $item['path'])) {
                throw new HttpException(422, 'Missing required event fields.');
            }

            // Strict types before casts
            $rawVisitorId = $item['visitorId'];
            if (!is_string($rawVisitorId) || !preg_match('/^[a-zA-Z0-9_\-]{16,64}$/', $rawVisitorId)) {
                throw new HttpException(422, 'Invalid visitor identifier.');
            }

            $rawEventId = $item['eventId'];
            if (!is_string($rawEventId) || !preg_match('/^[a-zA-Z0-9_\-]{16,64}$/', $rawEventId)) {
                throw new HttpException(422, 'Invalid event identifier.');
            }

            $rawEventType = $item['eventType'];
            if (!is_string($rawEventType)) {
                throw new HttpException(422, 'Invalid event type.');
            }

            // Explicit rejection of client-reported conversions
            if (in_array(strtolower($rawEventType), self::FORBIDDEN_CLIENT_EVENTS, true)) {
                throw new HttpException(422, 'Client-claimed conversion events are forbidden.');
            }

            // Allowlist check
            if (!in_array($rawEventType, self::ALLOWED_EVENT_TYPES, true)) {
                throw new HttpException(422, 'Unknown or disallowed event type.');
            }

            $rawPath = $item['path'];
            if (!is_string($rawPath)) {
                throw new HttpException(422, 'Invalid path.');
            }
            $cleanPath = $this->sanitizeAndValidatePath($rawPath);

            $rawEngagement = $item['engagementSeconds'] ?? 0;
            // Strict integer check: rejects floats, strings, bools, arrays
            if (!is_int($rawEngagement)) {
                throw new HttpException(422, 'engagementSeconds must be strictly an integer.');
            }

            if ($rawEngagement < 0 || $rawEngagement > self::MAX_ENGAGEMENT_DELTA) {
                throw new HttpException(422, 'engagementSeconds out of bounded range (0..60).');
            }

            if ($rawEventType === 'engagement' && $rawEngagement === 0) {
                throw new HttpException(422, 'Engagement event requires positive engagementSeconds between 1 and 60.');
            }

            $cleanReferrerHost = null;
            if (array_key_exists('referrer', $item) && $item['referrer'] !== null) {
                if (!is_string($item['referrer'])) {
                    throw new HttpException(422, 'Referrer must be a string or null.');
                }
                $cleanReferrerHost = $this->sanitizeReferrerHost($item['referrer']);
            }

            $searchRoute = $item['searchRoute'] ?? null;
            if ($searchRoute !== null) {
                if ($rawEventType !== 'search' || !is_string($searchRoute)
                    || preg_match('/^[A-Z]{3}-[A-Z]{3}$/', $searchRoute) !== 1) {
                    throw new HttpException(422, 'Invalid search route.');
                }
                [$origin, $destination] = explode('-', $searchRoute);
                if ($origin === $destination || ($origin !== 'GZA' && $destination !== 'GZA')
                    || DB::table('airports')->whereIn('code', [$origin, $destination])->count() !== 2) {
                    throw new HttpException(422, 'Unknown search route.');
                }
            }

            $validated[] = [
                'visitor_id' => $rawVisitorId,
                'event_id' => $rawEventId,
                'event_type' => $rawEventType,
                'path' => $cleanPath,
                'engagement_seconds' => $rawEngagement,
                'referrer_host' => $cleanReferrerHost,
                'search_route' => $searchRoute,
            ];
        }

        return $validated;
    }

    private function sanitizeAndValidatePath(string $rawPath): string
    {
        // 1. Strip query parameters and fragment
        $path = explode('?', $rawPath)[0];
        $path = explode('#', $path)[0];
        $path = trim($path);

        $path = '/' . ltrim($path, '/');

        if (strlen($path) > 128) {
            $path = substr($path, 0, 128);
        }

        // 2. Reject private / administrative / sensitive routes including /ar/admin, /ar/api, boarding-pass, privatebooking
        $forbiddenPrefixes = [
            '/admin',
            '/ar/admin',
            '/api',
            '/ar/api',
            '/auth',
            '/ar/auth',
            '/boarding-pass',
            '/ar/boarding-pass',
            '/booking-confirmation',
            '/ar/booking-confirmation',
            '/manage',
            '/ar/manage',
            '/privatebooking',
            '/ar/privatebooking',
            '/account',
            '/ar/account',
            '/signin',
            '/ar/signin',
            '/register',
            '/ar/register',
            '/forgot-password',
            '/ar/forgot-password',
            '/reset-password',
            '/ar/reset-password',
            '/verify-email',
            '/ar/verify-email',
            '/storage',
            '/ar/storage',
            '/_debugbar',
            '/telescope',
            '/oauth',
        ];

        $lower = strtolower($path);
        foreach ($forbiddenPrefixes as $prefix) {
            if ($lower === $prefix || str_starts_with($lower, $prefix . '/')) {
                throw new HttpException(403, 'Tracking of private paths is forbidden.');
            }
        }

        $trimmed = $path === '/' ? '/' : rtrim($path, '/');

        // 3. Validate against server canonical public route allowlist
        if (in_array($trimmed, self::CANONICAL_PUBLIC_ROUTES, true)) {
            return $trimmed;
        }

        // 4. Validate dynamic routes with safe identifier patterns while NEVER storing dynamic sensitive segments
        // /destinations/:code and /ar/destinations/:code (valid IATA airport code e.g. AMM, CAI, DXB)
        if (preg_match('#^/(ar/)?destinations/([a-zA-Z]{3,4}|:code)$#i', $trimmed, $matches)) {
            $isAr = !empty($matches[1]);
            return $isAr ? '/ar/destinations/:code' : '/destinations/:code';
        }

        // /flight/:flightId and /ar/flight/:flightId (valid flight identifier e.g. PS204, PS-204)
        if (preg_match('#^/(ar/)?flight/([a-zA-Z0-9\-]{2,12}|:flightId)$#i', $trimmed, $matches)) {
            $isAr = !empty($matches[1]);
            return $isAr ? '/ar/flight/:flightId' : '/flight/:flightId';
        }

        throw new HttpException(403, 'Path does not match canonical public route allowlist.');
    }

    private function sanitizeReferrerHost(string $referrer): ?string
    {
        if (strlen($referrer) > 1024) {
            return null;
        }

        $host = str_contains($referrer, '://') ? parse_url($referrer, PHP_URL_HOST) : $referrer;
        if (!is_string($host) || $host === '' || !str_contains($host, '.')) {
            return null;
        }

        $host = strtolower(trim($host));
        if (strlen($host) > 253) {
            return null;
        }

        // Reject raw IPv4 and IPv6 addresses
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return null;
        }

        // Reject IPs, userinfo, and malformed hostnames
        if (!preg_match('/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/', $host)) {
            return null;
        }

        return $host;
    }

    /**
     * Atomically persist events with session anchor locking and engagement capping.
     *
     * @param array<int, array<string, mixed>> $events
     */
    private function persistEvents(array $events): int
    {
        $now = CarbonImmutable::now('UTC');
        $nowMicro = $now->format('Y-m-d H:i:s.u');
        $persisted = 0;

        foreach ($events as $evt) {
            $inserted = DB::transaction(function () use ($evt, $now, $nowMicro): bool {
                $visitorId = $evt['visitor_id'];

                // 1. Atomic unique visitor anchor with insertOrIgnore to prevent race conditions
                $newSessionId = (string) Str::uuid();
                DB::table('analytics_sessions')->insertOrIgnore([
                    'visitor_id' => $visitorId,
                    'session_id' => $newSessionId,
                    'total_engagement_seconds' => 0,
                    'event_count' => 0,
                    'last_event_at' => $nowMicro,
                    'created_at' => $nowMicro,
                    'updated_at' => $nowMicro,
                ]);

                // 2. Lock the visitor's session row for update
                $session = DB::table('analytics_sessions')
                    ->where('visitor_id', $visitorId)
                    ->lockForUpdate()
                    ->first();

                if ($session === null) {
                    return false;
                }

                // 3. Duplicate check under lock BEFORE updating counters
                $exists = DB::table('analytics_events')
                    ->where('event_id', $evt['event_id'])
                    ->exists();

                if ($exists) {
                    // Replay: do not modify session counters
                    return false;
                }

                // 4. Session idle expiry check (30 minutes)
                $lastEventAt = CarbonImmutable::parse($session->last_event_at, 'UTC');
                $createdAt = CarbonImmutable::parse($session->created_at, 'UTC');
                $isIdleExpired = $lastEventAt->diffInMinutes($now, false) >= self::SESSION_IDLE_MINUTES;

                if ($isIdleExpired || (int) $session->event_count === 0) {
                    $sessionId = ((int) $session->event_count === 0) ? (string) $session->session_id : (string) Str::uuid();
                    $sessionCreatedAt = $now;
                    $currentTotalEngagement = 0;
                    $currentEventCount = 0;
                } else {
                    $sessionId = (string) $session->session_id;
                    $sessionCreatedAt = $createdAt;
                    $currentTotalEngagement = (int) $session->total_engagement_seconds;
                    $currentEventCount = (int) $session->event_count;

                    // Event count cap per session
                    if ($currentEventCount >= self::MAX_EVENTS_PER_SESSION) {
                        return false;
                    }
                }

                // 5. Engagement bound by server elapsed wall time across session and session cap (1800s)
                $serverElapsedSeconds = max(0, (int) $sessionCreatedAt->diffInSeconds($now, false));
                $maxEngagementAllowedByTime = max(0, $serverElapsedSeconds - $currentTotalEngagement);
                $remainingAllowance = max(0, self::MAX_SESSION_ENGAGEMENT - $currentTotalEngagement);
                $requestedEngagement = (int) ($evt['engagement_seconds'] ?? 0);
                $effectiveEngagement = min($requestedEngagement, $maxEngagementAllowedByTime, $remainingAllowance);

                // 6. Insert event with unique event_id deduplication
                $eventInserted = false;
                try {
                    DB::table('analytics_events')->insert([
                        'id' => (string) Str::uuid(),
                        'visitor_id' => $visitorId,
                        'event_id' => $evt['event_id'],
                        'session_id' => $sessionId,
                        'event_type' => $evt['event_type'],
                        'path' => $evt['path'],
                        'engagement_seconds' => $effectiveEngagement,
                        'country_code' => 'XX', // Always Unknown (no geo guessing, no trusted proxy on this host)
                        'referrer_host' => $evt['referrer_host'],
                        'search_route' => $evt['search_route'],
                        'created_at' => $nowMicro,
                    ]);
                    $eventInserted = true;
                } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                    return false;
                }

                // 7. Successful insert: update session counters under lock
                if ($eventInserted) {
                    DB::table('analytics_sessions')
                        ->where('visitor_id', $visitorId)
                        ->update([
                            'session_id' => $sessionId,
                            'total_engagement_seconds' => $currentTotalEngagement + $effectiveEngagement,
                            'event_count' => $currentEventCount + 1,
                            'last_event_at' => $nowMicro,
                            'created_at' => $sessionCreatedAt->format('Y-m-d H:i:s.u'),
                            'updated_at' => $nowMicro,
                        ]);
                    return true;
                }

                return false;
            });

            if ($inserted) {
                $persisted++;
            }
        }

        return $persisted;
    }
}
