<?php

declare(strict_types=1);

namespace App\Identity\Guards;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Http\Request;

final class PassengerSessionGuard implements Guard
{
    private ?IdentityPrincipal $user = null;
    private ?PassengerSessionContext $context = null;
    private bool $resolved = false;
    private bool $cookieInvalid = false;
    private ?Closure $cookieTokenHolder = null;
    private Closure $storeHolder;
    private Closure $requestHolder;

    public function __construct(
        #[\SensitiveParameter]
        PassengerSessionStore $store,
        #[\SensitiveParameter]
        Request $request,
    ) {
        $this->storeHolder = static fn(): PassengerSessionStore => $store;
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
        // Guard resolves durable records via session cookies, not arbitrary credentials
        return false;
    }

    public function hasUser(): bool
    {
        return $this->user !== null;
    }

    /**
     * Set the current authenticated user.
     * Invariant: setUser cannot manufacture or upgrade authority absent a valid exact persisted session.
     * Caller cannot substitute or upgrade auth level or credential epoch.
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
            $this->user = new IdentityPrincipal(
                id: $this->context->getUserId(),
                realm: PassengerSessionStore::REALM,
                authLevel: 'full',
                sessionId: $this->context->sessionId,
                credentialEpoch: $this->context->credentialEpoch,
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

    /**
     * Get underlying PassengerSessionContext (available for both anonymous and full sessions).
     */
    public function getSessionContext(): ?PassengerSessionContext
    {
        $this->resolve();
        return $this->context;
    }

    /**
     * Indicates whether an expected cookie was present but invalid/expired/revoked/malformed.
     */
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

    private function getStore(): PassengerSessionStore
    {
        return ($this->storeHolder)();
    }

    private function getRequest(): Request
    {
        return ($this->requestHolder)();
    }

    /**
     * Resolve incoming request cookie against PassengerSessionStore.
     */
    private function resolve(): void
    {
        if ($this->resolved) {
            return;
        }
        $this->resolved = true;

        $request = $this->getRequest();

        if (CookieSecurity::hasDuplicateCookie($request, CookieSecurity::COOKIE_PASSENGER)) {
            $this->cookieInvalid = true;
            return;
        }

        if (!CookieSecurity::isCookiePresent($request, CookieSecurity::COOKIE_PASSENGER)) {
            // Legitimately absent cookie
            return;
        }

        $rawToken = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER);
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

        if ($context->isFull() && $context->getUserId() !== null) {
            $this->user = new IdentityPrincipal(
                id: $context->getUserId(),
                realm: PassengerSessionStore::REALM,
                authLevel: 'full',
                sessionId: $context->sessionId,
                credentialEpoch: $context->credentialEpoch,
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
            'userId' => $this->id(),
            'isCookieInvalid' => $this->cookieInvalid,
        ];
    }

    public function __serialize(): array
    {
        return [
            'resolved' => $this->resolved,
            'hasUser' => $this->hasUser(),
            'userId' => $this->id(),
            'isCookieInvalid' => $this->cookieInvalid,
        ];
    }

    public function __unserialize(array $data): void
    {
        throw new \LogicException('Deserialization of PassengerSessionGuard is prohibited.');
    }
}
