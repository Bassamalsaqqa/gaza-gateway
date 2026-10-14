<?php
declare(strict_types=1);
namespace App\Mvp\Admin;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Shared\ReferenceResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequireAdminRead
{
    public function __construct(private readonly StaffSessionStore $sessions, private readonly RbacPolicy $rbac) {}
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        if (!$request->isSecure() || !$request->isMethod('GET')
            || !in_array($permission, ['dashboard.view', 'commercial.view', 'admin.manage'], true)) {
            return ReferenceResponse::error($request, 403, 'forbidden');
        }
        if (CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF_PENDING)) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }
        $token = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        $session = $token ? $this->sessions->read($token) : null;
        if (!$session?->isFull() || !$session->getStaffId()) return ReferenceResponse::error($request, 401, 'unauthenticated');
        if (!$this->rbac->hasPermission($session->role ?? '', $permission)) return ReferenceResponse::error($request, 403, 'forbidden');
        $request->attributes->set('identity_session_context', $session);
        return $next($request);
    }
}
