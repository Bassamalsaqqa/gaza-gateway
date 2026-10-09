<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class StructuredRequestLogging
{
    /**
     * Handle an incoming request.
     * Records structured request logs with timing and correlation IDs.
     * Strictly omits raw URL queries, arbitrary request paths containing secrets,
     * request bodies, cookies, authorization/grant/CSRF headers, and PII.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startTime = microtime(true);

        $response = $next($request);

        $durationMs = round((microtime(true) - $startTime) * 1000, 2);
        $requestId = \App\Support\RequestCorrelation::fromRequest($request);

        // Bounded route identity: use matched route uri pattern or fixed unmatched marker
        $route = $request->route();
        $routeIdentity = $route ? ('/' . ltrim($route->uri(), '/')) : '/unmatched_route';

        // Bounded method
        $rawMethod = strtoupper($request->method());
        $method = in_array($rawMethod, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], true)
            ? $rawMethod
            : 'UNKNOWN';

        Log::info('http_request', [
            'category' => 'http_request',
            'requestId' => $requestId,
            'method' => $method,
            'route' => $routeIdentity,
            'status' => $response->getStatusCode(),
            'duration_ms' => $durationMs,
        ]);

        return $response;
    }
}
