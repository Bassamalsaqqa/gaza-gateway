<?php

namespace App\Http\Middleware;

use App\Http\Controllers\SystemController;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomCorsGuard
{
    /**
     * Handle an incoming request.
     * Enforces strict environment-specific CORS rules with Vary: Origin and credential capability.
     * Single authority backed by config/cors.php. Exact string equality on origins (no slash-trimming).
     */
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');
        $allowedOrigins = config('cors.allowed_origins', []);
        $allowedMethods = config('cors.allowed_methods', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
        $allowedHeaders = config('cors.allowed_headers', [
            'Accept',
            'Authorization',
            'Content-Type',
            'Origin',
            'X-Requested-With',
            'X-Request-Id',
            'X-CSRF-TOKEN',
            'X-Booking-Token',
            'X-Booking-Receipt',
            'Idempotency-Key',
            'If-Match',
        ]);
        $exposedHeaders = config('cors.exposed_headers', [
            'X-Request-Id',
            'ETag',
            'Idempotency-Replay',
            'Retry-After',
            'Content-Length',
            'Content-Type',
        ]);

        // Exact string equality comparison
        $isAllowed = is_string($origin) && in_array($origin, $allowedOrigins, true);

        // Preflight OPTIONS handling
        if ($request->isMethod('OPTIONS')) {
            if ($origin !== null && !$isAllowed) {
                return SystemController::formatExceptionResponse(
                    new HttpException(403, 'CORS origin not allowed.'),
                    $request
                );
            }

            // Validate requested preflight method if supplied
            $requestedMethod = $request->header('Access-Control-Request-Method');
            if ($requestedMethod !== null && !in_array(strtoupper(trim($requestedMethod)), $allowedMethods, true)) {
                return SystemController::formatExceptionResponse(
                    new HttpException(403, 'CORS preflight method not allowed.'),
                    $request
                );
            }

            // Validate requested preflight headers if supplied
            $requestedHeadersRaw = $request->header('Access-Control-Request-Headers');
            if ($requestedHeadersRaw !== null && trim($requestedHeadersRaw) !== '') {
                $requestedList = array_map('trim', explode(',', $requestedHeadersRaw));
                $allowedLower = array_map('strtolower', $allowedHeaders);
                foreach ($requestedList as $reqH) {
                    if (!in_array(strtolower($reqH), $allowedLower, true)) {
                        return SystemController::formatExceptionResponse(
                            new HttpException(403, 'CORS preflight header not allowed: ' . $reqH),
                            $request
                        );
                    }
                }
            }

            $headers = [
                'Vary' => 'Origin',
                'Access-Control-Allow-Methods' => implode(', ', $allowedMethods),
                'Access-Control-Allow-Headers' => implode(', ', $allowedHeaders),
                'Access-Control-Max-Age' => (string) config('cors.max_age', 86400),
                'Cache-Control' => 'no-store',
            ];

            if ($isAllowed) {
                $headers['Access-Control-Allow-Origin'] = $origin;
                $headers['Access-Control-Allow-Credentials'] = 'true';
            }

            $requestId = $request->attributes->get('request_id');
            if ($requestId) {
                $headers['X-Request-Id'] = $requestId;
            }

            return response('', 204, $headers);
        }

        $response = $next($request);

        if ($origin !== null) {
            $response->headers->set('Vary', 'Origin', false);
            if ($isAllowed) {
                $response->headers->set('Access-Control-Allow-Origin', $origin);
                $response->headers->set('Access-Control-Allow-Credentials', 'true');
                $response->headers->set('Access-Control-Expose-Headers', implode(', ', $exposedHeaders));
            }
        }

        return $response;
    }
}
