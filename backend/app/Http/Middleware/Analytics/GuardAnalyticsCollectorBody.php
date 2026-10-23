<?php

declare(strict_types=1);

namespace App\Http\Middleware\Analytics;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class GuardAnalyticsCollectorBody
{
    public const MAX_BODY_BYTES = 16384; // 16 KiB

    public function handle(Request $request, Closure $next): Response
    {
        $path = rawurldecode($request->path());
        $isCollector = $path === 'api/v1/analytics/events';

        if (!$isCollector) {
            return $next($request);
        }

        // 1. Content-Length header guard
        $clHeader = $request->header('Content-Length');
        if ($clHeader !== null && is_numeric($clHeader) && (int) $clHeader > self::MAX_BODY_BYTES) {
            return response('Payload exceeds 16KiB limit.', 413);
        }

        // 2. Strict Origin check: reject missing, null, or empty Origin
        $origin = $request->header('Origin');
        if ($origin === null || trim($origin) === '' || $origin === 'null') {
            return response('Missing or empty Origin header.', 403);
        }

        $allowedOrigins = (array) config('cors.allowed_origins', []);
        $appUrl = (string) config('app.url', '');
        $parsedAppUrl = parse_url($appUrl);
        $appOrigin = ($parsedAppUrl['scheme'] ?? 'https') . '://' . ($parsedAppUrl['host'] ?? 'localhost') . (isset($parsedAppUrl['port']) ? ':' . $parsedAppUrl['port'] : '');

        $isOriginAllowed = in_array($origin, $allowedOrigins, true)
            || ($appOrigin !== '' && hash_equals($appOrigin, $origin));

        if (!$isOriginAllowed) {
            return response('Cross-origin analytics submission is forbidden.', 403);
        }

        // 3. Content-Type check
        $contentType = (string) $request->header('Content-Type', '');
        if (preg_match('/^application\/json(?:\s*;|$)/i', $contentType) !== 1) {
            return response('Content-Type must be application/json.', 415);
        }

        // 4. Stream read bounded to 16KiB + 1
        $stream = $request->getContent(true);
        $rawContent = is_resource($stream)
            ? (string) stream_get_contents($stream, self::MAX_BODY_BYTES + 1)
            : '';

        if (strlen($rawContent) > self::MAX_BODY_BYTES) {
            return response('Payload exceeds 16KiB size limit.', 413);
        }

        $request->attributes->set('analytics_raw_body', $rawContent);

        return $next($request);
    }
}
