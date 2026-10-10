<?php

declare(strict_types=1);

namespace App\Http\Middleware\Identity;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Protocol\IdentityOperationPolicies;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use App\Support\RequestCorrelation;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

final class VerifyApplicationCsrfHeader
{
    public function __construct(
        private readonly PassengerSessionStore $passengerStore,
        private readonly StaffSessionStore $staffStore,
        private readonly ?RbacPolicy $rbacPolicy = null,
        private readonly ?ConnectionInterface $db = null,
    ) {
    }

    /**
     * Handle incoming request through unconditional identity protocol validation.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $rawUri = $request->getRequestUri();
        $rawPath = parse_url($rawUri, PHP_URL_PATH) ?? $request->getPathInfo();
        $decodedPath = '/' . ltrim($request->decodedPath(), '/');
        $requestId = RequestCorrelation::fromRequest($request);

        // Check if either raw path or framework-decoded path targets identity namespaces (/auth/* or /staff/*)
        $isIdentitySegment = static function (string $p): bool {
            $trimmed = '/' . ltrim($p, '/');
            if (str_starts_with($trimmed, '/api/v1/')) {
                $trimmed = substr($trimmed, 7);
            } elseif ($trimmed === '/api/v1') {
                return false;
            }
            $segments = explode('/', ltrim($trimmed, '/'));
            $first = $segments[0] ?? '';
            if ($first === 'auth' || $first === 'staff') {
                return true;
            }
            $decodedFirst = rawurldecode($first);
            return $decodedFirst === 'auth' || $decodedFirst === 'staff';
        };

        if (!$isIdentitySegment($rawPath) && !$isIdentitySegment($decodedPath)) {
            return $next($request);
        }

        // Reject null bytes, traversal, double slashes, and slash injection on identity candidates
        if (str_contains($rawPath, chr(0)) || str_contains($decodedPath, chr(0)) || str_contains($rawUri, '%00')
            || str_contains($rawPath, '/../') || str_contains($rawPath, '/./') || str_ends_with($rawPath, '/..') || str_ends_with($rawPath, '/.')
            || str_contains($decodedPath, '/../') || str_contains($decodedPath, '/./') || str_ends_with($decodedPath, '/..') || str_ends_with($decodedPath, '/.')
            || str_contains($rawPath, '\\') || str_contains($decodedPath, '\\') || preg_match('/%5c/i', $rawPath)
            || preg_match('/(^|\/)(\.\.|\%2e\%2e|\.\%2e|\%2e\.)(\/|$)/i', $rawPath)
            || preg_match('/(^|\/)(\.|\%2e)(\/|$)/i', $rawPath)
            || preg_match('/%2f/i', $rawPath)
            || str_contains($rawPath, '//') || str_contains($decodedPath, '//')
        ) {
            return $this->errorResponse(
                status: 403,
                code: 'forbidden',
                message: 'Operation path is invalid or prohibited.',
                requestId: $requestId
            );
        }

        $normalizedPath = IdentityOperationPolicies::normalizePath($rawPath);

        if ($normalizedPath === null) {
            return $this->errorResponse(
                status: 403,
                code: 'forbidden',
                message: 'Operation path is invalid or prohibited.',
                requestId: $requestId
            );
        }

        // Only govern identity routes under /auth/* and /staff/*
        if (!str_starts_with($normalizedPath, '/auth/') &&
            !str_starts_with($normalizedPath, '/staff/') &&
            $normalizedPath !== '/auth' &&
            $normalizedPath !== '/staff'
        ) {
            return $next($request);
        }

        // 1. Resolve closed server-owned operation policy strictly from registry using rawPath
        $policy = IdentityOperationPolicies::find($request->method(), $rawPath);

        if ($policy === null) {
            // Refuse invalid, unsupported or unmapped operation metadata
            return $this->errorResponse(
                status: 403,
                code: 'forbidden',
                message: 'Operation is not permitted under server policy.',
                requestId: $requestId
            );
        }

        // Bind trusted server-resolved operation policy & extracted path parameters
        $request->attributes->set('operation_policy', $policy);
        $request->attributes->set('route_params', $policy['params'] ?? []);

        // 2. Enforce HTTPS transport unconditionally; no request-controlled bypass
        if (!$request->isSecure()) {
            return $this->errorResponse(
                status: 403,
                code: 'insecure_transport',
                message: 'HTTPS is strictly required for identity operations.',
                requestId: $requestId
            );
        }

        $method = strtoupper($request->method());
        $isSafeMethod = in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);

        // 3. Safe read operations (GET/HEAD)
        if ($isSafeMethod) {
            $allowedSecurity = $policy['allowedSecurity'] ?? [];
            if (empty($allowedSecurity)) {
                // Public/bootstrap GET operation (e.g. GET /auth/csrf, GET /staff/csrf)
                return $next($request);
            }

            // Protected safe GET: requires full-realm session authority
            $getAuthResult = $this->verifyProtectedGetAuthority($request, $policy, $requestId);
            if ($getAuthResult !== null) {
                return $getAuthResult;
            }

            return $next($request);
        }

        // 4. Unsafe operations: enforce exact allowlisted Origin
        $originResult = $this->verifyOrigin($request);
        if ($originResult !== null) {
            return $this->errorResponse(
                status: 403,
                code: 'origin_forbidden',
                message: $originResult,
                requestId: $requestId
            );
        }

        // 5. Unsafe operations: enforce CSRF header & valid matching realm session
        if ($policy['requiresCsrf'] ?? true) {
            $csrfResult = $this->verifyCsrfAndSession($request, $policy, $requestId);
            if ($csrfResult !== null) {
                return $csrfResult;
            }
        }

        return $next($request);
    }

    /**
     * Verify authority for protected safe GET operations.
     */
    private function verifyProtectedGetAuthority(Request $request, array $policy, string $requestId): ?JsonResponse
    {
        $realm = $policy['realm'] ?? 'passenger';
        $path = $policy['path'] ?? '';
        $isPassengerRealm = ($realm === 'passenger') || ($realm === 'anonymous' && str_starts_with($path, '/auth/'));
        $cookieName = $isPassengerRealm ? CookieSecurity::COOKIE_PASSENGER : CookieSecurity::COOKIE_STAFF;

        if (CookieSecurity::hasDuplicateCookie($request, $cookieName)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate session cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        if (!CookieSecurity::isCookiePresent($request, $cookieName)) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Authenticated session is required.',
                requestId: $requestId
            );
        }

        $rawCookie = CookieSecurity::getCookieValue($request, $cookieName);
        if ($rawCookie === null || $rawCookie === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        try {
            OpaqueToken::validateCanonicalBearer($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        try {
            $sessionContext = $isPassengerRealm
                ? $this->passengerStore->read($rawCookie)
                : $this->staffStore->read($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Failed to verify session.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        if ($sessionContext === null || $sessionContext->isAnonymous() || !$sessionContext->isFull()) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: $isPassengerRealm
                    ? 'Authenticated passenger session required.'
                    : 'Authenticated staff session required.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        // Check required staff permission if applicable
        if (!$isPassengerRealm && !empty($policy['requiredPermission'])) {
            $permission = (string) $policy['requiredPermission'];
            $role = (string) ($sessionContext->role ?? '');
            if ($this->rbacPolicy === null || !$this->rbacPolicy->hasPermission($role, $permission)) {
                return $this->errorResponse(
                    status: 403,
                    code: 'forbidden',
                    message: 'Insufficient staff permissions for operation.',
                    requestId: $requestId
                );
            }
        }

        $request->attributes->set('identity_session_context', $sessionContext);
        return null;
    }

    /**
     * Verify Origin header strictly against configured CORS allowlist.
     */
    private function verifyOrigin(Request $request): ?string
    {
        $originHeaders = $request->headers->all('origin');
        if (empty($originHeaders)) {
            $rawOrigin = $request->server->get('HTTP_ORIGIN');
            if (is_string($rawOrigin) && trim($rawOrigin) !== '') {
                $originHeaders = [$rawOrigin];
            }
        }

        if (empty($originHeaders)) {
            return 'Origin header is required for identity operations.';
        }

        if (count($originHeaders) > 1) {
            return 'Multiple Origin headers are not permitted.';
        }

        $origin = trim((string) $originHeaders[0]);
        if ($origin === '' || $origin === 'null' || str_contains($origin, ',')) {
            return 'Origin header is malformed or invalid.';
        }

        $allowedOrigins = (array) config('cors.allowed_origins', []);
        if (!in_array($origin, $allowedOrigins, true)) {
            return 'Origin is not authorized for identity operations.';
        }

        return null;
    }

    /**
     * Verify raw X-CSRF-TOKEN header and session authority for unsafe operations.
     */
    private function verifyCsrfAndSession(Request $request, array $policy, string $requestId): ?JsonResponse
    {
        $csrfHeader = $policy['csrfHeader'] ?? 'X-CSRF-TOKEN';
        $providedCsrf = $request->header($csrfHeader);

        if (!is_string($providedCsrf) || trim($providedCsrf) === '') {
            return $this->errorResponse(
                status: 403,
                code: 'csrf_missing',
                message: 'CSRF token header is required.',
                requestId: $requestId
            );
        }

        try {
            OpaqueToken::validateCanonicalBearer($providedCsrf);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 403,
                code: 'csrf_invalid',
                message: 'CSRF token is malformed.',
                requestId: $requestId
            );
        }

        // Handle StaffPreAuthCookieAuth (pending staff operations)
        if ($this->isStaffPreAuthOperation($policy)) {
            return $this->verifyStaffPendingAuthority($request, $policy, $providedCsrf, $requestId);
        }

        $realm = $policy['realm'] ?? 'passenger';
        $path = $policy['path'] ?? '';
        $isPassengerRealm = ($realm === 'passenger') || ($realm === 'anonymous' && str_starts_with($path, '/auth/'));
        $cookieName = $isPassengerRealm ? CookieSecurity::COOKIE_PASSENGER : CookieSecurity::COOKIE_STAFF;

        // Check duplicate cookie header
        if (CookieSecurity::hasDuplicateCookie($request, $cookieName)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate session cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        if (!CookieSecurity::isCookiePresent($request, $cookieName)) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is required for CSRF validation.',
                requestId: $requestId
            );
        }

        $rawCookie = CookieSecurity::getCookieValue($request, $cookieName);
        if ($rawCookie === null || $rawCookie === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        try {
            OpaqueToken::validateCanonicalBearer($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        // Read active session from exact realm store
        try {
            $sessionContext = $isPassengerRealm
                ? $this->passengerStore->read($rawCookie)
                : $this->staffStore->read($rawCookie);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Failed to verify session.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        if ($sessionContext === null) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Session has expired, been revoked, or is invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie($cookieName)
            );
        }

        // Constant-time CSRF equality check against active decrypted session CSRF token
        if (!hash_equals($sessionContext->getCsrfToken(), $providedCsrf)) {
            return $this->errorResponse(
                status: 403,
                code: 'csrf_invalid',
                message: 'CSRF token does not match active session.',
                requestId: $requestId
            );
        }

        // Check required auth level: if operation requires full session, anonymous is not sufficient
        $allowedSecurity = $policy['allowedSecurity'] ?? [];
        if (!empty($allowedSecurity)) {
            if ($sessionContext->isAnonymous()) {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: $isPassengerRealm
                        ? 'Authenticated passenger session required.'
                        : 'Authenticated staff session required.',
                    requestId: $requestId
                );
            }

            // Enforce staff domain permissions
            if (!$isPassengerRealm && !empty($policy['requiredPermission'])) {
                $permission = (string) $policy['requiredPermission'];
                $role = (string) ($sessionContext->role ?? '');
                if ($this->rbacPolicy === null || !$this->rbacPolicy->hasPermission($role, $permission)) {
                    return $this->errorResponse(
                        status: 403,
                        code: 'forbidden',
                        message: 'Insufficient staff permissions for operation.',
                        requestId: $requestId
                    );
                }
            }

            // Enforce recent step-up authentication (< 300s window)
            if (!$isPassengerRealm && !empty($policy['requiresRecentStepUp'])) {
                if ($this->rbacPolicy === null || !$this->rbacPolicy->hasRecentStepUp($sessionContext)) {
                    return $this->errorResponse(
                        status: 403,
                        code: 'forbidden',
                        message: 'Recent step-up authentication is required.',
                        requestId: $requestId
                    );
                }
            }
        }

        $request->attributes->set('identity_session_context', $sessionContext);
        return null;
    }

    /**
     * Determine if operation policy declares StaffPreAuthCookieAuth scheme.
     */
    private function isStaffPreAuthOperation(array $policy): bool
    {
        $allowedSecurity = $policy['allowedSecurity'] ?? [];
        foreach ($allowedSecurity as $schemeMap) {
            if (isset($schemeMap['StaffPreAuthCookieAuth'])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Verify authority for StaffPreAuthCookieAuth operations.
     */
    private function verifyStaffPendingAuthority(
        Request $request,
        array $policy,
        string $providedCsrf,
        string $requestId
    ): ?JsonResponse {
        // 1. Pending cookie is strictly required
        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_STAFF_PENDING)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate pending authentication cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF_PENDING)) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication cookie is required.',
                requestId: $requestId
            );
        }

        $rawPendingToken = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF_PENDING);
        if ($rawPendingToken === null || $rawPendingToken === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        try {
            OpaqueToken::validateCanonicalBearer($rawPendingToken);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        // 2. Bound staff session cookie is strictly required
        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_STAFF)) {
            return $this->errorResponse(
                status: 400,
                code: 'duplicate_cookie',
                message: 'Duplicate staff session cookie detected.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF)) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Bound staff session cookie is required.',
                requestId: $requestId
            );
        }

        $rawStaffToken = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        if ($rawStaffToken === null || $rawStaffToken === '') {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Bound staff session cookie is malformed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        try {
            $staffContext = $this->staffStore->read($rawStaffToken);
        } catch (\Throwable) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Failed to verify bound staff session.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        if ($staffContext === null) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Bound staff session has expired, been revoked, or is invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF)
            );
        }

        // Invariant: Full staff cookie alone must NOT substitute; must be anonymous staff session
        if (!$staffContext->isAnonymous()) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Full staff session cannot substitute for pending authentication authority.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        // 3. CSRF check: CSRF for pending is bound anonymous staff CSRF
        if (!hash_equals($staffContext->getCsrfToken(), $providedCsrf)) {
            return $this->errorResponse(
                status: 403,
                code: 'csrf_invalid',
                message: 'CSRF token does not match bound anonymous staff session.',
                requestId: $requestId
            );
        }

        // 4. Verify staff_pending_auth record in PostgreSQL
        if ($this->db === null) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Database connection required for pending authentication verification.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        $pendingDigest = hash('sha256', $rawPendingToken);
        $pendingRecord = $this->db->table('staff_pending_auth')
            ->where('token_digest', $pendingDigest)
            ->first();

        if ($pendingRecord === null ||
            $pendingRecord->state !== 'issued' ||
            $pendingRecord->consumed_at !== null ||
            $pendingRecord->revoked_at !== null
        ) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication token has expired, been consumed, or is invalid.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        if ((int) $pendingRecord->failed_attempts >= 5) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication token attempts exhausted.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        $now = CarbonImmutable::now();
        if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($pendingRecord->expires_at))) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication token has expired.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        // Verify bound session match
        if ($pendingRecord->bound_session_id !== $staffContext->sessionId) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication token is not bound to this session.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        // Verify purpose against branch conditions
        $expectedPurpose = null;
        $branchConditions = $policy['branchConditions'] ?? [];
        foreach ($branchConditions as $cond) {
            if (($cond['scheme'] ?? null) === 'StaffPreAuthCookieAuth' && isset($cond['purpose'])) {
                $expectedPurpose = $cond['purpose'];
                break;
            }
        }

        if ($expectedPurpose !== null && $pendingRecord->purpose !== $expectedPurpose) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Pending authentication token purpose mismatch.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        // Verify staff user lifecycle and epoch match
        $staffUser = $this->db->table('staff_users')
            ->where('id', $pendingRecord->staff_id)
            ->first();

        if ($staffUser === null || (int) $staffUser->credential_epoch !== (int) $pendingRecord->credential_epoch) {
            return $this->errorResponse(
                status: 401,
                code: 'unauthorized',
                message: 'Staff user is inactive or credentials have changed.',
                requestId: $requestId,
                clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
            );
        }

        if ($pendingRecord->purpose === 'enroll_mfa') {
            // Enrollment requires staff user in pending_enrollment status
            if ($staffUser->status !== 'pending_enrollment') {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user is not eligible for MFA enrollment setup.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }
        } elseif ($pendingRecord->purpose === 'login_mfa') {
            // Login MFA requires active staff, verified email, usable Argon2id password, and confirmed MFA
            if ($staffUser->status !== 'active') {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user is not active.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }

            if ($staffUser->email_verified_at === null) {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user email is not verified.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }

            if (!\App\Identity\Password\Argon2idPasswordHasher::isValidStoredHashStructure($staffUser->password_hash)) {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user password credential is invalid.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }

            if ($staffUser->mfa_version === null) {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user has no confirmed MFA credential.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }

            $mfaCred = $this->db->table('staff_mfa_credentials')
                ->where('staff_id', $staffUser->id)
                ->where('version', $staffUser->mfa_version)
                ->first();

            if ($mfaCred === null || $mfaCred->confirmed_at === null || $mfaCred->revoked_at !== null) {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Current confirmed MFA credential required for login challenge.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }
        } else {
            if ($staffUser->status !== 'active') {
                return $this->errorResponse(
                    status: 401,
                    code: 'unauthorized',
                    message: 'Staff user is not active.',
                    requestId: $requestId,
                    clearingCookie: CookieSecurity::createClearingCookie(CookieSecurity::COOKIE_STAFF_PENDING)
                );
            }
        }

        $request->attributes->set('staff_pending_record', $pendingRecord);
        $request->attributes->set('identity_session_context', $staffContext);

        return null;
    }

    /**
     * Standardized JSON error response matching OpenAPI ErrorResponse schema.
     */
    private function errorResponse(
        int $status,
        string $code,
        string $message,
        string $requestId,
        ?Cookie $clearingCookie = null
    ): JsonResponse {
        $response = response()->json([
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
            'meta' => [
                'requestId' => $requestId,
                'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            ],
        ], $status, [
            'Cache-Control' => 'no-store',
            'X-Request-Id' => $requestId,
        ]);

        if ($clearingCookie !== null) {
            $response->withCookie($clearingCookie);
        }

        return $response;
    }
}
