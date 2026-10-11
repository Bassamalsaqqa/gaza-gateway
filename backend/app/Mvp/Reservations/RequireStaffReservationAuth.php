<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Shared\ReferenceResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class RequireStaffReservationAuth
{
    public function __construct(
        private readonly StaffSessionStore $sessions,
        private readonly RbacPolicy $rbac,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $isRead = $request->isMethod('GET');

        if (!$request->isSecure()) {
            return ReferenceResponse::error($request, 403, 'forbidden');
        }

        if (!$isRead) {
            $origin = $request->header('Origin');
            if ($origin === null || !in_array($origin, config('cors.allowed_origins', []), true)) {
                return ReferenceResponse::error($request, 403, 'forbidden');
            }
        }

        if (CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF_PENDING)) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        $token = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        if ($token === null || $token === '') {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        $requiredPermission = $isRead ? 'commercial.view' : 'commercial.edit';

        $authorize = function () use ($token, $request, $isRead, $requiredPermission): StaffSessionContext {
            $session = $this->sessions->read($token);
            if (!$session?->isFull() || $session->getStaffId() === null) {
                throw new HttpException(401);
            }
            if (!$this->rbac->hasPermission($session->role ?? '', $requiredPermission)) {
                throw new HttpException(403);
            }
            if (!$isRead) {
                $csrf = $request->headers->all('x-csrf-token');
                if (count($csrf) !== 1 || !is_string($csrf[0]) || !hash_equals($session->getCsrfToken(), $csrf[0])) {
                    throw new HttpException(403);
                }
            }
            return $session;
        };

        try {
            if ($isRead) {
                $session = $authorize();
                $request->attributes->set('identity_session_context', $session);
                return $next($request);
            }

            return DB::transaction(function () use ($authorize, $request, $next): Response {
                $session = $authorize();
                $request->attributes->set('identity_session_context', $session);
                $request->attributes->set('reservation_authorize', $authorize);
                return $next($request);
            });
        } catch (HttpException $e) {
            if (!in_array($e->getStatusCode(), [401, 403], true)) {
                throw $e;
            }
            return ReferenceResponse::error(
                $request,
                $e->getStatusCode(),
                $e->getStatusCode() === 401 ? 'unauthenticated' : 'forbidden'
            );
        }
    }
}
