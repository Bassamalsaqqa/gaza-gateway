<?php

namespace App\Http\Middleware;

use App\Http\Controllers\SystemController;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StrictHostGuard
{
    /**
     * Handle an incoming request.
     * Enforces strict host validation and rejects non-empty X-Forwarded-Host headers.
     * Safe fixed error messages (never echo request-supplied host names).
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Reject non-empty X-Forwarded-Host
        if ($request->headers->has('X-Forwarded-Host')) {
            $forwardedHost = trim((string) $request->headers->get('X-Forwarded-Host'));
            if ($forwardedHost !== '') {
                return SystemController::formatExceptionResponse(
                    new HttpException(400, 'Untrusted forwarded host rejected.'),
                    $request
                );
            }
        }

        // 2. Validate request host against strict allowlist
        $allowedHosts = config('app.allowed_hosts', []);

        // Check raw Host header if present
        $rawHost = $request->header('Host');
        if ($rawHost !== null && $rawHost !== '') {
            $hostPart = strtolower(explode(':', $rawHost)[0]);
            if (!in_array($hostPart, $allowedHosts, true)) {
                return SystemController::formatExceptionResponse(
                    new HttpException(400, 'Invalid or untrusted host header.'),
                    $request
                );
            }
        }

        // Check canonical getHost()
        $host = strtolower($request->getHost());
        if (!in_array($host, $allowedHosts, true)) {
            return SystemController::formatExceptionResponse(
                new HttpException(400, 'Invalid or untrusted host header.'),
                $request
            );
        }

        return $next($request);
    }
}
