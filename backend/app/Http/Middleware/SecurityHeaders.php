<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    /**
     * Outermost response finalization middleware.
     * Enforces correlation IDs, security headers, no-store cache control,
     * and safe error-path CORS headers on every response (early returns, exceptions, preflights, successes).
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // 1. Mandatory security headers
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->removeCacheControlDirective('private');

        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        // 2. Correlation ID propagation
        $requestId = $request->attributes->get('request_id') ?: $response->headers->get('X-Request-Id');
        if (!$requestId || !is_string($requestId)) {
            $requestId = \Illuminate\Support\Str::uuid()->toString();
        }
        $response->headers->set('X-Request-Id', $requestId);

        // 3. Error-path and universal CORS attachment for allowed origins
        $origin = $request->header('Origin');
        if ($origin !== null) {
            $response->headers->set('Vary', 'Origin', false);

            $allowedOrigins = config('cors.allowed_origins', []);
            $isAllowed = in_array($origin, $allowedOrigins, true);

            if ($isAllowed) {
                $response->headers->set('Access-Control-Allow-Origin', $origin);
                $response->headers->set('Access-Control-Allow-Credentials', 'true');
                $exposedHeaders = config('cors.exposed_headers', [
                    'X-Request-Id',
                    'ETag',
                    'Idempotency-Replay',
                    'Retry-After',
                    'Content-Length',
                    'Content-Type',
                ]);
                $response->headers->set('Access-Control-Expose-Headers', implode(', ', $exposedHeaders));
            } else {
                // Denied origins must NEVER receive Access-Control-Allow-Origin
                $response->headers->remove('Access-Control-Allow-Origin');
            }
        }

        // 4. Status code specific invariants
        $status = $response->getStatusCode();
        if ($status === 204) {
            $response->setContent('');
        } elseif ($status === 405 && !$response->headers->has('Allow')) {
            $response->headers->set('Allow', 'GET, HEAD, OPTIONS');
        }

        return $response;
    }
}
