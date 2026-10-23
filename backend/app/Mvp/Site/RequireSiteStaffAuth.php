<?php

declare(strict_types=1);

namespace App\Mvp\Site;

use App\Editorial\Shared\EditorialResponse;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Sessions\StaffSessionStore;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Strict cross-domain lock protocol across staff site/inbox operations:
 * 1. Principal row: staff_users (WHERE id = ? FOR UPDATE) via StaffSessionStore::read().
 * 2. Session row: staff_sessions (WHERE id = ? FOR UPDATE) via StaffSessionStore::read().
 * 3. Site-settings advisory lock followed by the site document row, or the inbox row.
 *
 * Wrapping authorize + coordinator operation in one database transaction ensures principal
 * and session locks are acquired first and retained throughout the entire request, preventing
 * distributed lock-inversion deadlocks and preserving consistent lock hierarchy across domains.
 */
final class RequireSiteStaffAuth
{
    public function __construct(
        private readonly StaffSessionStore $sessions,
        private readonly RbacPolicy $rbac,
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        // 1. Enforce max header size limit (protection against header overflow)
        foreach ($request->headers->all() as $values) {
            foreach ((array) $values as $val) {
                if (strlen((string) $val) > 8192) {
                    return EditorialResponse::error($request, 400, 'bad_request', 'Header size exceeds limit.');
                }
            }
        }

        // 2. Enforce HTTPS across all staff endpoints
        if (!$request->isSecure() || $request->server->get('HTTPS') === 'off') {
            return EditorialResponse::error($request, 403, 'forbidden');
        }

        $isUnsafe = in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true);

        // 3. Unsafe writes require exact Origin in allowed_origins
        if ($isUnsafe) {
            $origin = $request->header('Origin');
            if ($origin === null || !in_array($origin, config('cors.allowed_origins', []), true)) {
                return EditorialResponse::error($request, 403, 'forbidden');
            }
        }

        // 4. Extract staff cookie
        $token = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        if ($token === null || $token === '') {
            return EditorialResponse::error($request, 401, 'unauthenticated');
        }

        // 5. Derive required permission server-side based on route/action
        $requiredPermission = $this->deriveRequiredPermission($request);

        // 6. Authorizer closure that re-verifies session and principal under locks
        $authorize = function () use ($token, $request, $isUnsafe, $requiredPermission): StaffSessionContext {
            $session = $this->sessions->read($token);
            if (!$session?->isFull() || $session->getStaffId() === null) {
                throw new HttpException(401);
            }

            if (!$this->rbac->hasPermission($session->role ?? '', $requiredPermission)) {
                throw new HttpException(403);
            }

            if ($isUnsafe) {
                $csrf = $request->headers->all('x-csrf-token');
                if (count($csrf) !== 1 || !is_string($csrf[0]) || !hash_equals($session->getCsrfToken(), $csrf[0])) {
                    throw new HttpException(403);
                }
            }

            return $session;
        };

        try {
            return DB::transaction(function () use ($request, $next, $authorize) {
                $session = $authorize();
                $request->attributes->set('editorial_staff_session', $session);
                $request->attributes->set('editorial_authorizer', $authorize);
                return $next($request);
            });
        } catch (HttpException $e) {
            $status = $e->getStatusCode();
            if (!in_array($status, [401, 403], true)) {
                throw $e;
            }
            return EditorialResponse::error(
                $request,
                $status,
                $status === 401 ? 'unauthenticated' : 'forbidden'
            );
        }
    }

    private function deriveRequiredPermission(Request $request): string
    {
        $path = $request->path();
        if (str_contains($path, '/settings/') || str_starts_with($path, 'api/v1/admin/analytics/reports/')) {
            return 'admin.manage';
        }
        return $request->isMethod('GET') ? 'engagement.view' : 'engagement.edit';
    }
}
