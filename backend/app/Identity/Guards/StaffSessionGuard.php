<?php

declare(strict_types=1);

namespace App\Identity\Guards;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Http\Request;

final class StaffSessionGuard implements Guard
{
    private ?IdentityPrincipal $user = null;
    private ?StaffSessionContext $context = null;
    private bool $resolved = false;
    private bool $cookieInvalid = false;
    private ?Closure $cookieTokenHolder = null;
    private Closure $storeHolder;
    private Closure $rbacPolicyHolder;
    private Closure $requestHolder;

    public function __construct(
        #[\SensitiveParameter]
        StaffSessionStore $store,
        #[\SensitiveParameter]
        RbacPolicy $rbacPolicy,
        #[\SensitiveParameter]
        Request $request,
    ) {
        $this->storeHolder = static fn(): StaffSessionStore => $store;
        $this->rbacPolicyHolder = static fn(): RbacPolicy => $rbacPolicy;
        $this->requestHolder = static fn(): Request => $request;
    }

    public function check(): bool
    {
        return $this->user() !== null;
    }

    public function guest(): bool
    {
        return !$this->check();
    }

    public function user(): ?Authenticatable
    {
        $this->resolve();
        return $this->user;
    }

    public function id(): mixed
    {
        return $this->user()?->getAuthIdentifier();
    }

    public function validate(array $credentials = []): bool
    {
        return false;
    }

    public function hasUser(): bool
    {
        return $this->user !== null;
    }

    /**
     * Set the current authenticated staff user.
     * Invariant: setUser cannot manufacture or upgrade authority absent a valid exact persisted session.
     * Caller cannot substitute or upgrade role, permissions, auth level, or credential epoch.
     */
    public function setUser(Authenticatable $user): void
    {
        $this->resolve();
        if ($this->context !== null &&
            $this->context->isFull() &&
            $this->user !== null &&
            $user instanceof IdentityPrincipal &&
            $user->id === $this->user->id &&
            $user->realm === $this->user->realm &&
            $user->sessionId === $this->user->sessionId
        ) {
            $role = $this->context->role ?? 'viewer';
            $permissions = $this->getRbacPolicy()->getPermissionsForRole($role);

            $this->user = new IdentityPrincipal(
                id: $this->context->getStaffId(),
                realm: StaffSessionStore::REALM,
                authLevel: 'full',
                sessionId: $this->context->sessionId,
                credentialEpoch: $this->context->credentialEpoch,
                role: $role,
                permissions: $permissions,
            );
        }
    }

    /**
     * Rebind request instance and reset all cached authentication state.
     * Registered with Laravel container via $app->refresh('request', $guard, 'setRequest').
     */
    public function setRequest(Request $request): self
    {
        $this->requestHolder = static fn(): Request => $request;
        $this->user = null;
        $this->context = null;
        $this->resolved = false;
        $this->cookieInvalid = false;
        $this->cookieTokenHolder = null;

        return $this;
    }

    public function getSessionContext(): ?StaffSessionContext
    {
        $this->resolve();
        return $this->context;
    }

    public function isCookieInvalid(): bool
    {
        $this->resolve();
        return $this->cookieInvalid;
    }

    /**
     * Returns raw bearer token from cookie if one was present.
     * Retained strictly for trusted test verification; never exposed through diagnostics.
     */
    public function getRawToken(): ?string
    {
        $this->resolve();
        return $this->cookieTokenHolder !== null ? ($this->cookieTokenHolder)() : null;
    }

    private function getStore(): StaffSessionStore
    {
        return ($this->storeHolder)();
    }

    private function getRbacPolicy(): RbacPolicy
    {
        return ($this->rbacPolicyHolder)();
    }

    private function getRequest(): Request
    {
        return ($this->requestHolder)();
    }

    private function resolve(): void
    {
        if ($this->resolved) {
            return;
        }
        $this->resolved = true;

        $request = $this->getRequest();

        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_STAFF)) {
            $this->cookieInvalid = true;
            return;
        }

        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_STAFF)) {
            return;
        }

        $rawToken = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_STAFF);
        if ($rawToken === null || $rawToken === '') {
            $this->cookieInvalid = true;
            return;
        }

        $this->cookieTokenHolder = static fn(): string => $rawToken;

        try {
            OpaqueToken::validateCanonicalBearer($rawToken);
        } catch (\Throwable) {
            $this->cookieInvalid = true;
            return;
        }

        try {
            $context = $this->getStore()->read($rawToken);
        } catch (\Throwable) {
            $this->cookieInvalid = true;
            return;
        }

        if ($context === null) {
            $this->cookieInvalid = true;
            return;
        }

        $this->context = $context;

        if ($context->isFull() && $context->getStaffId() !== null) {
            $role = $context->role ?? 'viewer';
            $permissions = $this->getRbacPolicy()->getPermissionsForRole($role);

            $this->user = new IdentityPrincipal(
                id: $context->getStaffId(),
                realm: StaffSessionStore::REALM,
                authLevel: 'full',
                sessionId: $context->sessionId,
                credentialEpoch: $context->credentialEpoch,
                role: $role,
                permissions: $permissions,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Diagnostics & Serialization Hygiene
    // -------------------------------------------------------------------------

    public function __debugInfo(): array
    {
        return [
            'resolved' => $this->resolved,
            'hasUser' => $this->hasUser(),
            'staffId' => $this->id(),
            'role' => $this->context?->role,
            'isCookieInvalid' => $this->cookieInvalid,
        ];
    }

    public function __serialize(): array
    {
        return [
            'resolved' => $this->resolved,
            'hasUser' => $this->hasUser(),
            'staffId' => $this->id(),
            'role' => $this->context?->role,
            'isCookieInvalid' => $this->cookieInvalid,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of StaffSessionGuard is prohibited.');
    }
}
