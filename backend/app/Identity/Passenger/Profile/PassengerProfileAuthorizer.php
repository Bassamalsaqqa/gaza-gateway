<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

use App\Identity\Passenger\Profile\Exceptions\CsrfValidationException;
use App\Identity\Passenger\Profile\Exceptions\UnauthorizedPassengerException;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Tokens\OpaqueToken;
use App\Support\DatabaseClock;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

/**
 * Closed, typed authorizer coordinator for passenger profile and traveler operations.
 *
 * Invariants:
 * 1. Sole owner authority is current PassengerSessionContext resolved by accepted middleware.
 * 2. Rejects caller-owned outer transactions (coordinator owns transaction and commit).
 * 3. Finite SET LOCAL statement_timeout (8000ms) and lock_timeout (5000ms).
 * 4. Canonical lock order: principal (users) -> owner-scoped session -> profile/traveler.
 * 5. Fresh clock_timestamp derived AFTER lock acquisition.
 * 6. Full re-validation of active verified principal, structural Argon2id credential, credential epoch, revocation, deadlines.
 * 7. Unsafe writes bind raw X-CSRF-TOKEN to current encrypted session and trusted context.
 * 8. Zero public arbitrary closures or extension hooks; authority execution is strictly typed to closed package coordinators.
 */
final class PassengerProfileAuthorizer
{
    public function __construct(
        private readonly ?ConnectionInterface $db = null,
        private readonly ?Encrypter $encrypter = null,
    ) {
    }

    private function getDb(): ConnectionInterface
    {
        return $this->db ?? DB::connection();
    }

    private function getEncrypter(): Encrypter
    {
        return $this->encrypter ?? app(Encrypter::class);
    }

    /**
     * Operation 1: GET /auth/passenger/profile (getPassengerProfile)
     *
     * @return array{
     *     email: string,
     *     firstName: string,
     *     lastName: string,
     *     phone: string,
     *     seatPreference: string,
     *     mealPreference: string,
     *     newsletter: bool
     * }
     */
    public function executeProfileRead(Request $request, PassengerProfileCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            false,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeProfileReadInternal($ctx, $tx, $request)
        );
    }

    /**
     * Operation 2: PUT /auth/passenger/profile (putPassengerProfile)
     *
     * @param array<string, mixed> $validatedPayload
     * @return array{
     *     changed: bool,
     *     account: array{
     *         email: string,
     *         firstName: string,
     *         lastName: string,
     *         phone: string,
     *         seatPreference: string,
     *         mealPreference: string,
     *         newsletter: bool
     *     }
     * }
     */
    public function executeProfileUpdate(Request $request, array $validatedPayload, PassengerProfileCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            true,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeProfileUpdateInternal($ctx, $tx, $validatedPayload, $request)
        );
    }

    /**
     * Operation 3: GET /auth/passenger/travelers (getSavedTravelers)
     *
     * @return list<array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }>
     */
    public function executeTravelersList(Request $request, SavedTravelerCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            false,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeTravelersListInternal($ctx, $tx, $request)
        );
    }

    /**
     * Operation 4: POST /auth/passenger/travelers (postSavedTraveler)
     *
     * @param array<string, mixed> $validatedPayload
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function executeTravelerCreate(Request $request, array $validatedPayload, SavedTravelerCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            true,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeTravelerCreateInternal($ctx, $tx, $validatedPayload, $request)
        );
    }

    /**
     * Operation 5: PATCH /auth/passenger/travelers/{id} (patchSavedTraveler)
     *
     * @param array<string, mixed> $validatedPayload
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function executeTravelerPatch(Request $request, string $externalId, array $validatedPayload, SavedTravelerCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            true,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeTravelerPatchInternal($ctx, $tx, $externalId, $validatedPayload, $request)
        );
    }

    /**
     * Operation 6: DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler)
     *
     * @return array{deleted: bool}
     */
    public function executeTravelerDelete(Request $request, string $externalId, SavedTravelerCoordinator $coordinator): array
    {
        return $this->executeInternal(
            $request,
            true,
            static fn (AuthorizedPassengerContext $ctx, ConnectionInterface $tx) => $coordinator->executeTravelerDeleteInternal($ctx, $tx, $externalId, $request)
        );
    }

    /**
     * Internal transaction and canonical locking boundary.
     * Hidden from external callers to ensure zero arbitrary database execution on authority context.
     *
     * @template T
     * @param Closure(AuthorizedPassengerContext, ConnectionInterface): T $action
     * @return T
     */
    private function executeInternal(Request $request, bool $isUnsafeWrite, Closure $action): mixed
    {
        $db = $this->getDb();

        // Invariant: Reject caller-owned outer transactions
        if ($db->transactionLevel() > 0) {
            throw new LogicException(
                'Caller-owned outer transaction is prohibited; authorizer coordinator owns transaction and commit.'
            );
        }

        return $db->transaction(function (ConnectionInterface $tx) use ($request, $isUnsafeWrite, $action) {
            // 1. Set finite local query and lock timeouts
            \App\Support\DatabaseFailure::applyTimeouts($tx, 8000, 5000);

            // 2. Resolve trusted session context from middleware
            $context = $request->attributes->get('identity_session_context');
            if (!$context instanceof PassengerSessionContext || !$context->isFull()) {
                throw new UnauthorizedPassengerException(
                    'Authenticated passenger session required.',
                    'unauthorized'
                );
            }

            $userId = $context->getUserId();
            if ($userId === null || !Str::isUuid($userId)) {
                throw new UnauthorizedPassengerException(
                    'Invalid passenger principal ID in session context.',
                    'unauthorized'
                );
            }

            $sessionId = $context->sessionId;
            if (!Str::isUuid($sessionId)) {
                throw new UnauthorizedPassengerException(
                    'Invalid session ID in session context.',
                    'unauthorized'
                );
            }

            $contextEpoch = $context->credentialEpoch;
            if ($contextEpoch === null || $contextEpoch < 1) {
                throw new UnauthorizedPassengerException(
                    'Invalid credential epoch in session context.',
                    'unauthorized'
                );
            }

            // 3. Lock principal row (users) in canonical order
            $user = $tx->table('users')
                ->where('id', $userId)
                ->lockForUpdate()
                ->first(['id', 'email', 'status', 'email_verified_at', 'credential_epoch', 'password_hash']);

            if (!$user) {
                throw new UnauthorizedPassengerException('Principal not found.', 'unauthorized');
            }

            if ($user->status !== 'active') {
                throw new UnauthorizedPassengerException('User account is not active.', 'unauthorized');
            }

            if ($user->email_verified_at === null) {
                throw new UnauthorizedPassengerException('User email is not verified.', 'unauthorized');
            }

            // Reuse Argon2idPasswordHasher::isValidStoredHashStructure under current locked principal
            if (!is_string($user->password_hash) || !Argon2idPasswordHasher::isValidStoredHashStructure($user->password_hash)) {
                throw new UnauthorizedPassengerException(
                    'User stored credential is not structurally usable.',
                    'unauthorized'
                );
            }

            $userEpoch = (int) $user->credential_epoch;
            if ($userEpoch !== (int) $contextEpoch) {
                throw new UnauthorizedPassengerException('User credential epoch has changed.', 'unauthorized');
            }

            // 4. Lock current owner-scoped session row in canonical order
            $session = $tx->table('passenger_sessions')
                ->where('id', $sessionId)
                ->where('user_id', $userId)
                ->lockForUpdate()
                ->first([
                    'id', 'user_id', 'auth_level', 'credential_epoch',
                    'encrypted_payload', 'issued_at', 'absolute_expires_at',
                    'idle_expires_at', 'last_seen_at', 'revoked_at'
                ]);

            if (!$session) {
                throw new UnauthorizedPassengerException('Passenger session not found.', 'unauthorized');
            }

            if ($session->auth_level !== 'full' || $session->user_id !== $userId) {
                throw new UnauthorizedPassengerException(
                    'Session ownership or auth level mismatch.',
                    'unauthorized'
                );
            }

            if ((int) $session->credential_epoch !== $userEpoch) {
                throw new UnauthorizedPassengerException(
                    'Session credential epoch mismatch.',
                    'unauthorized'
                );
            }

            if ($session->revoked_at !== null) {
                throw new UnauthorizedPassengerException('Session has been revoked.', 'unauthorized');
            }

            // 5. Derive fresh UTC_TIMESTAMP(6) AFTER lock acquisition
            $now = DatabaseClock::now($tx);

            $absoluteExpiresAt = CarbonImmutable::parse($session->absolute_expires_at);
            if ($now->greaterThanOrEqualTo($absoluteExpiresAt)) {
                throw new UnauthorizedPassengerException(
                    'Session has reached its absolute lifetime.',
                    'unauthorized'
                );
            }

            $idleExpiresAt = CarbonImmutable::parse($session->idle_expires_at);
            if ($now->greaterThanOrEqualTo($idleExpiresAt)) {
                throw new UnauthorizedPassengerException(
                    'Session has reached its idle lifetime.',
                    'unauthorized'
                );
            }

            // 6. For unsafe writes: bind raw X-CSRF-TOKEN to current encrypted session & context
            if ($isUnsafeWrite) {
                $rawCsrfHeader = $request->header('X-CSRF-TOKEN');
                if (!is_string($rawCsrfHeader) || trim($rawCsrfHeader) === '') {
                    throw new CsrfValidationException('CSRF token header is required.', 'csrf_missing');
                }

                try {
                    OpaqueToken::validateCanonicalBearer($rawCsrfHeader);
                } catch (\Throwable) {
                    throw new CsrfValidationException('CSRF token is malformed.', 'csrf_invalid');
                }

                $encrypter = $this->getEncrypter();
                try {
                    $decryptedJson = $encrypter->decrypt($session->encrypted_payload);
                    $payload = json_decode($decryptedJson, true, 512, JSON_THROW_ON_ERROR);
                } catch (\Throwable) {
                    throw new UnauthorizedPassengerException(
                        'Stored session payload is corrupted.',
                        'unauthorized'
                    );
                }

                $sessionCsrf = $payload['csrf_token'] ?? null;
                if (!is_string($sessionCsrf) || !hash_equals($sessionCsrf, $rawCsrfHeader)) {
                    throw new CsrfValidationException(
                        'CSRF token does not match active stored session.',
                        'csrf_invalid'
                    );
                }

                if (!hash_equals($sessionCsrf, $context->getCsrfToken())) {
                    throw new CsrfValidationException(
                        'CSRF token does not match trusted context.',
                        'csrf_invalid'
                    );
                }
            }

            $authorizedContext = new AuthorizedPassengerContext(
                userId: $userId,
                userEmail: (string) $user->email,
                sessionId: $sessionId,
                credentialEpoch: $userEpoch,
                now: $now,
            );

            return $action($authorizedContext, $tx);
        });
    }
}
