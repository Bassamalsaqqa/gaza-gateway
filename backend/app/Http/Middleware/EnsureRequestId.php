<?php

namespace App\Http\Middleware;

use App\Support\RequestCorrelation;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRequestId
{
    /**
     * Handle an incoming request.
     * Validates incoming X-Request-Id header. Accepts only valid UUIDs.
     * Generates a new UUID if missing, invalid, or oversized to prevent CRLF/log injection.
     * Propagates request_id in request attributes and response headers.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = RequestCorrelation::fromRequest($request);

        $request->attributes->set('request_id', $requestId);

        $response = $next($request);

        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }
}
