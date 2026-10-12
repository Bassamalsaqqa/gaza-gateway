<?php

declare(strict_types=1);

namespace App\Identity\Passenger;

use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Password\PasswordPolicy;
use App\Identity\Passenger\Exceptions\AccountSuspendedException;
use App\Identity\Passenger\Exceptions\AuthenticationException;
use App\Identity\Passenger\Exceptions\InvalidPasswordException;
use App\Identity\Passenger\Exceptions\ProofConsumptionFailedException;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Passenger\Exceptions\SessionNotFoundException;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use App\Support\DatabaseClock;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Str;

final class PassengerAuthCoordinator
{
    /**
     * Pre-computed verified Argon2id hash for unknown-email login to mitigate timing side channels.
     * Derived with m=65536, t=4, p=1.
     */
    private const string DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng';

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Argon2idPasswordHasher $hasher,
        private readonly PasswordPolicy $passwordPolicy,
        private readonly PassengerSessionStore $sessionStore,
        private readonly DurableRateLimiter $rateLimiter,
        private readonly ProofService $proofService,
        private readonly OutboxService $outboxService,
        private readonly AuditWriter $auditWriter,
        private readonly Encrypter $encrypter,
    ) {
    }

    /**
     * POST /auth/register (postPassengerRegister) -> 202 Accepted
     *
     * @param array<string, mixed> $payload
     * @return array{status: string, message: string}
     */
    public function register(array $payload, string $ip, string $requestId): array
    {
        $this->assertOwnTransaction();
        $normalizedEmail = strtolower(trim((string) $payload['email']));

        // 1. Charge durable rate limiter before any Argon2id hashing or proof generation
        $charge = $this->rateLimiter->charge('passenger', 'dispatch', [
            'subject' => $normalizedEmail,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        // 2. Validate password against policy
        $passwordValidation = $this->passwordPolicy->validatePassengerPassword((string) $payload['password']);
        if (!$passwordValidation->isValid) {
            throw new InvalidPasswordException('Password does not satisfy policy requirements.');
        }

        // Perform identical configured Argon2id work before inspecting email existence.
        // The source budget above bounds this work; no principal lock is held while hashing.
        $passwordHash = $this->hasher->hash((string) $payload['password'], 'passenger');

        try {
            return $this->db->transaction(function (ConnectionInterface $tx) use ($payload, $normalizedEmail, $requestId, $passwordHash) {
                \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

                // Check existing account under lock
                $existing = $tx->table('users')
                    ->whereRaw('lower(email) = ?', [$normalizedEmail])
                    ->lockForUpdate()
                    ->first();

                if ($existing) {
                    // Anti-enumeration: return identical generic receipt without mutating account
                    $this->auditWriter->record(
                        AuditActor::system(),
                        'postPassengerRegister',
                        AuditOutcome::Success,
                        AuditTargetType::User,
                        null,
                        ['status' => 'pending'],
                        $requestId,
                        $tx
                    );

                    return [
                        'status' => 'verification_dispatched',
                        'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
                    ];
                }

                // Use the hash computed on both account-existence paths.
                $userId = (string) Str::uuid();

                $tx->table('users')->insert([
                    'id' => $userId,
                    'email' => $normalizedEmail,
                    'password_hash' => $passwordHash,
                    'status' => 'unverified',
                    'credential_epoch' => 1,
                    'created_at' => \App\Support\DatabaseClock::raw(),
                    'updated_at' => \App\Support\DatabaseClock::raw(),
                ]);

                $tx->table('passenger_profiles')->insert([
                    'user_id' => $userId,
                    'title' => $payload['title'] ?? null,
                    'first_name' => (string) ($payload['firstName'] ?? ''),
                    'last_name' => (string) ($payload['lastName'] ?? ''),
                    'phone' => (string) ($payload['phone'] ?? ''),
                    'created_at' => \App\Support\DatabaseClock::raw(),
                    'updated_at' => \App\Support\DatabaseClock::raw(),
                ]);

                // Issue verification proof and queue transactional outbox
                $receipt = $this->proofService->issue(ProofPurpose::PassengerEmailVerification, $userId, $tx);
                $this->outboxService->enqueueProof($receipt, $tx);

                $this->auditWriter->record(
                    AuditActor::system(),
                    'postPassengerRegister',
                    AuditOutcome::Success,
                    AuditTargetType::User,
                    $userId,
                    ['status' => 'pending', 'is_new' => true],
                    $requestId,
                    $tx
                );

                return [
                    'status' => 'verification_dispatched',
                    'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
                ];
            });
        } catch (QueryException $e) {
            // Handle concurrent duplicate registration race safely:
            // Strictly scope recovery to the lower-email uniqueness violation; rethrow any unrelated unique error.
            $msg = $e->getMessage();
            if (\App\Support\DatabaseFailure::isDuplicate($e) && (str_contains($msg, 'uq_users_normalized_email') || str_contains($msg, 'users_lower_email_idx') || str_contains($msg, 'users_email_unique') || str_contains(strtolower($msg), 'email') || str_contains(strtolower($msg), 'lower(email)'))) {
                return [
                    'status' => 'verification_dispatched',
                    'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
                ];
            }
            throw $e;
        }
    }

    /**
     * POST /auth/login (postPassengerLogin) -> 200 OK
     *
     * @param array<string, mixed> $payload
     */
    public function login(
        array $payload,
        string $ip,
        string $userAgent,
        ?PassengerSessionContext $sessionContext,
        ?string $rawCsrfToken,
        ?string $incomingRawCookie,
        string $requestId
    ): PassengerLoginResult {
        $this->assertOwnTransaction();
        $normalizedEmail = strtolower(trim((string) $payload['email']));

        // 1. Charge durable rate limiter before any Argon2id hashing
        $charge = $this->rateLimiter->charge('passenger', 'login', [
            'subject' => $normalizedEmail,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        // 2. Validate incoming session and CSRF authority prerequisites
        if ($sessionContext === null || $rawCsrfToken === null || $rawCsrfToken === '' || $incomingRawCookie === null || $incomingRawCookie === '') {
            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerLogin',
                AuditOutcome::Failure,
                AuditTargetType::User,
                null,
                ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_UNAUTHORIZED'],
                $requestId
            );
            throw new AuthenticationException('Valid session and CSRF token required.');
        }

        try {
            OpaqueToken::validateCanonicalBearer($incomingRawCookie);
            OpaqueToken::validateCanonicalBearer($rawCsrfToken);
        } catch (\InvalidArgumentException) {
            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerLogin',
                AuditOutcome::Failure,
                AuditTargetType::User,
                null,
                ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_UNAUTHORIZED'],
                $requestId
            );
            throw new AuthenticationException('Session cookie or CSRF token is malformed.');
        }

        $incomingDigest = OpaqueToken::digestOf($incomingRawCookie);

        // 3. Candidate pre-check
        $candidate = $this->db->table('users')
            ->whereRaw('lower(email) = ?', [$normalizedEmail])
            ->first(['id', 'email', 'password_hash', 'status', 'credential_epoch', 'email_verified_at']);

        if (!$candidate) {
            // Mitigate timing side-channels with dummy Argon2id verification
            $this->hasher->verify((string) $payload['password'], self::DUMMY_HASH);
            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerLogin',
                AuditOutcome::Failure,
                AuditTargetType::User,
                null,
                ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_INVALID_CREDENTIALS'],
                $requestId
            );
            throw new AuthenticationException('Invalid email or password.');
        }

        // Never acquire a foreign session lock while holding the target principal.
        if ($sessionContext->isFull() && $sessionContext->getUserId() !== (string) $candidate->id) {
            $this->auditWriter->record(AuditActor::system(), 'postPassengerLogin', AuditOutcome::Denied,
                AuditTargetType::User, null, ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_UNAUTHORIZED'], $requestId);
            throw new AuthenticationException('Invalid session authority.');
        }

        // 4. Verify password against stored hash
        $valid = $this->hasher->verify((string) $payload['password'], $candidate->password_hash);
        if (!$valid) {
            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerLogin',
                AuditOutcome::Failure,
                AuditTargetType::User,
                $candidate->id,
                ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_INVALID_CREDENTIALS'],
                $requestId
            );
            throw new AuthenticationException('Invalid email or password.');
        }

        if ($candidate->status !== 'active' || $candidate->email_verified_at === null) {
            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerLogin',
                AuditOutcome::Failure,
                AuditTargetType::User,
                $candidate->id,
                ['reason_code' => 'invalid_credentials', 'error_code' => 'ERR_INVALID_CREDENTIALS'],
                $requestId
            );
            throw new AuthenticationException('Account is not active or verified.');
        }

        // 5. Atomic transaction with canonical lock hierarchy: Principal -> Sessions -> Outbox
        return $this->executeAction('postPassengerLogin', $requestId, function (ConnectionInterface $tx) use (
            $candidate,
            $ip,
            $userAgent,
            $sessionContext,
            $rawCsrfToken,
            $incomingDigest,
            $requestId
        ) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // Lock principal row first in canonical lock hierarchy
            $user = $tx->table('users')
                ->where('id', $candidate->id)
                ->lockForUpdate()
                ->first();

            if (!$user) {
                throw new AuthenticationException('Invalid email or password.');
            }

            // Lock exact incoming bound session row FOR UPDATE
            $incSession = $tx->table('passenger_sessions')
                ->where('id', $sessionContext->sessionId)
                ->where('lookup_digest', $incomingDigest)
                ->where(function ($query) use ($user) {
                    $query->whereNull('user_id')->orWhere('user_id', $user->id);
                })
                ->lockForUpdate()
                ->first();

            // Derive live database time strictly AFTER acquiring locks
            $now = DatabaseClock::now($tx);

            // Verify incoming bound session row under lock
            if (!$incSession || $incSession->revoked_at !== null) {

                throw new AuthenticationException('Session has expired, been revoked, or is invalid.');
            }

            // Verify live expiry against fresh DB time
            $absExpiresAt = CarbonImmutable::parse($incSession->absolute_expires_at);
            $idleExpiresAt = CarbonImmutable::parse($incSession->idle_expires_at);
            if ($now->greaterThanOrEqualTo($absExpiresAt) || $now->greaterThanOrEqualTo($idleExpiresAt)) {

                throw new AuthenticationException('Session has expired, been revoked, or is invalid.');
            }

            // Foreign full cookie check: foreign full cookie must be denied without revoking its owner!
            if ($incSession->user_id !== null && (string) $incSession->user_id !== (string) $user->id) {

                throw new AuthenticationException('Session does not belong to user.');
            }

            // Same-user full session epoch check
            if ($incSession->user_id !== null && (int) $incSession->credential_epoch !== (int) $user->credential_epoch) {

                throw new AuthenticationException('Session has expired, been revoked, or is invalid.');
            }

            // Decrypt encrypted payload and verify CSRF match under lock
            try {
                $decryptedJson = $this->encrypter->decrypt($incSession->encrypted_payload);
                $payloadData = json_decode($decryptedJson, true, 512, JSON_THROW_ON_ERROR);
            } catch (\Throwable) {

                throw new AuthenticationException('Failed to resolve session authority.');
            }

            if (!is_array($payloadData) || !is_string($payloadData['csrf_token'] ?? null)
                || !hash_equals($payloadData['csrf_token'], $rawCsrfToken)
                || !hash_equals($payloadData['csrf_token'], $sessionContext->getCsrfToken())
                || $incSession->auth_level !== $sessionContext->authLevel
                || ($incSession->user_id !== null && $sessionContext->credentialEpoch !== (int) $user->credential_epoch)) {

                throw new AuthenticationException('CSRF token does not match active session.');
            }

            // Recheck user status, verification, epoch, and password hash after acquiring lock
            if ($user->status !== 'active' || $user->email_verified_at === null) {

                throw new AuthenticationException('Account is not active or verified.');
            }

            if ((int) $user->credential_epoch !== (int) $candidate->credential_epoch || $user->password_hash !== $candidate->password_hash) {

                throw new AuthenticationException('Invalid email or password.');
            }

            // Atomically revoke incoming session (anonymous or same-user prior session)
            $tx->table('passenger_sessions')
                ->where('id', $incSession->id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => $now->toIso8601String()]);

            // Issue new authenticated full session
            $token = OpaqueToken::generate(PassengerSessionStore::REALM, 'full_session');
            $csrfToken = OpaqueToken::generate(PassengerSessionStore::REALM, 'csrf')->getSecretToken();
            $sessionId = (string) Str::uuid();

            $newAbsoluteExpiresAt = $now->addSeconds(PassengerSessionStore::FULL_ABSOLUTE_TTL);
            $newIdleExpiresAt = $now->addSeconds(PassengerSessionStore::FULL_IDLE_TTL);

            $newPayload = [
                'csrf_token' => $csrfToken,
                'ip_address' => $ip,
                'user_agent' => $userAgent,
            ];
            $encryptedPayload = $this->encrypter->encrypt(json_encode($newPayload, JSON_THROW_ON_ERROR));

            $tx->table('passenger_sessions')->insert([
                'id' => $sessionId,
                'lookup_digest' => $token->digest,
                'user_id' => $user->id,
                'auth_level' => 'full',
                'credential_epoch' => (int) $user->credential_epoch,
                'encrypted_payload' => $encryptedPayload,
                'issued_at' => $now->toIso8601String(),
                'absolute_expires_at' => $newAbsoluteExpiresAt->toIso8601String(),
                'idle_expires_at' => $newIdleExpiresAt->toIso8601String(),
                'last_seen_at' => $now->toIso8601String(),
                'revoked_at' => null,
            ]);

            $profile = $tx->table('passenger_profiles')->where('user_id', $user->id)->first();

            $this->auditWriter->record(
                AuditActor::passenger($user->id),
                'postPassengerLogin',
                AuditOutcome::Success,
                AuditTargetType::PassengerSession,
                $sessionId,
                ['status' => 'active'],
                $requestId,
                $tx
            );

            return new PassengerLoginResult(
                user: [
                    'id' => (string) $user->id,
                    'email' => (string) $user->email,
                    'firstName' => (string) ($profile->first_name ?? ''),
                    'lastName' => (string) ($profile->last_name ?? ''),
                    'emailVerified' => true,
                ],
                rawToken: $token->getSecretToken(),
                csrfToken: $csrfToken,
                absoluteExpiresAt: $newAbsoluteExpiresAt,
            );
        });
    }

    /**
     * POST /auth/logout (postPassengerLogout) -> 200 OK
     */
    public function logout(PassengerSessionContext $sessionContext, string $requestId): void
    {
        $this->assertOwnTransaction();
        $this->executeAction('postPassengerLogout', $requestId, function (ConnectionInterface $tx) use ($sessionContext, $requestId) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // Lock principal row
            $user = $tx->table('users')->where('id', $sessionContext->userId)->lockForUpdate()->first();
            $callerSession = $tx->table('passenger_sessions')
                ->where('id', $sessionContext->sessionId)->where('user_id', $sessionContext->getUserId())
                ->lockForUpdate()->first();

            $now = DatabaseClock::now($tx);

            $this->assertCurrentFullSession($user, $callerSession, $sessionContext, $now);

            // Revoke current session
            $tx->table('passenger_sessions')
                ->where('id', $sessionContext->sessionId)
                ->where('user_id', $sessionContext->userId)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => $now->toIso8601String()]);

            $this->auditWriter->record(
                AuditActor::passenger((string) $sessionContext->userId),
                'postPassengerLogout',
                AuditOutcome::Success,
                AuditTargetType::PassengerSession,
                $sessionContext->sessionId,
                ['revoked' => true],
                $requestId,
                $tx
            );
        });
    }

    /**
     * POST /auth/password/forgot (postPassengerPasswordForgot) -> 202 Accepted
     *
     * @param array<string, mixed> $payload
     * @return array{message: string}
     */
    public function passwordForgot(array $payload, string $ip, string $requestId): array
    {
        $this->assertOwnTransaction();
        $normalizedEmail = strtolower(trim((string) $payload['email']));

        // 1. Charge durable rate limiter before any proof generation
        $charge = $this->rateLimiter->charge('passenger', 'dispatch', [
            'subject' => $normalizedEmail,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        // Equal expensive native work on eligible and unknown-email paths. Remaining
        // bounded PostgreSQL/outbox differences require staging timing certification.
        $this->hasher->verify('Synthetic-noncredential-work-factor', self::DUMMY_HASH);

        return $this->db->transaction(function (ConnectionInterface $tx) use ($normalizedEmail, $requestId) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            $user = $tx->table('users')
                ->whereRaw('lower(email) = ?', [$normalizedEmail])
                ->lockForUpdate()
                ->first();

            if (!$user || $user->status !== 'active') {
                // Anti-enumeration: return identical generic message
                $this->auditWriter->record(
                    AuditActor::system(),
                    'postPassengerPasswordForgot',
                    AuditOutcome::Success,
                    AuditTargetType::User,
                    null,
                    ['status' => 'pending'],
                    $requestId,
                    $tx
                );

                return [
                    'message' => 'If an active account exists for this email, password reset instructions have been queued for dispatch.',
                ];
            }

            // Reissue password reset proof and enqueue outbox
            $receipt = $this->proofService->reissue(ProofPurpose::PassengerPasswordReset, $user->id, $tx);
            $this->outboxService->enqueueProof($receipt, $tx);

            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerPasswordForgot',
                AuditOutcome::Success,
                AuditTargetType::User,
                $user->id,
                ['status' => 'pending'],
                $requestId,
                $tx
            );

            return [
                'message' => 'If an active account exists for this email, password reset instructions have been queued for dispatch.',
            ];
        });
    }

    /**
     * POST /auth/password/reset (postPassengerPasswordReset) -> 200 OK
     *
     * @param array<string, mixed> $payload
     */
    public function passwordReset(array $payload, string $ip, string $requestId): void
    {
        $this->assertOwnTransaction();
        $normalizedEmail = strtolower(trim((string) $payload['email']));
        $rawToken = (string) $payload['token'];
        $newPassword = (string) $payload['password'];

        // 1. Charge rate limiter
        $charge = $this->rateLimiter->charge('passenger', 'proof', [
            'subject' => $normalizedEmail,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        // 2. Validate password policy
        $passwordValidation = $this->passwordPolicy->validatePassengerPassword($newPassword);
        if (!$passwordValidation->isValid) {
            throw new InvalidPasswordException('Password does not satisfy policy requirements.');
        }

        // Validate canonical token format before querying hint
        try {
            OpaqueToken::validateCanonicalBearer($rawToken);
        } catch (\InvalidArgumentException) {
            throw new ProofConsumptionFailedException('Invalid, expired, or previously used reset token.');
        }

        $tokenDigest = OpaqueToken::digestOf($rawToken);

        // Nonauthoritative token lookup hint to discover actual proof owner principal (prevents lock inversion)
        $hint = $this->db->table('user_password_resets')
            ->where('token_digest', $tokenDigest)
            ->where('purpose', ProofPurpose::PassengerPasswordReset->value)
            ->first(['user_id', 'state', 'expires_at']);

        $actualUserId = $hint !== null ? (string) $hint->user_id : null;

        $this->executeAction('postPassengerPasswordReset', $requestId, function (ConnectionInterface $tx) use (
            $rawToken,
            $actualUserId,
            $normalizedEmail,
            $newPassword,
            $requestId
        ) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // Canonical lock order: Principal -> Sessions -> Proofs -> Outbox
            // Lock ONLY the actual proof owner principal row discovered by hint (never caller-selected email principal)
            $user = null;
            $sessionIds = [];
            if ($actualUserId !== null) {
                $user = $tx->table('users')
                    ->where('id', $actualUserId)
                    ->lockForUpdate()
                    ->first();

                if ($user !== null) {
                    $sessionIds = $tx->table('passenger_sessions')
                        ->where('user_id', $user->id)
                        ->whereNull('revoked_at')
                        ->orderBy('id', 'asc')
                        ->lockForUpdate()
                        ->pluck('id')
                        ->all();
                }
            }

            // Atomically consume Proof under transaction lock using service authority
            $consumption = $this->proofService->consume(ProofPurpose::PassengerPasswordReset, $rawToken, $tx);

            // Revalidate submitted email matches locked user under lock
            if (
                !$consumption->isSuccess()
                || $user === null
                || $user->status !== 'active'
                || (string) $consumption->principalId !== (string) $user->id
                || strtolower((string) $user->email) !== $normalizedEmail
                || strtolower((string) $consumption->getEmailSnapshot()) !== $normalizedEmail
            ) {

                throw new ProofConsumptionFailedException('Invalid, expired, or previously used reset token.');
            }

            $userId = (string) $user->id;
            $now = DatabaseClock::now($tx);

            $newHash = $this->hasher->hash($newPassword, 'passenger');
            $newEpoch = (int) $user->credential_epoch + 1;

            $tx->table('users')->where('id', $userId)->update([
                'password_hash' => $newHash,
                'credential_epoch' => $newEpoch,
                'updated_at' => $now->toIso8601String(),
            ]);

            // Revoke all active sessions in ascending order
            if (!empty($sessionIds)) {
                $tx->table('passenger_sessions')
                    ->whereIn('id', $sessionIds)
                    ->update(['revoked_at' => $now->toIso8601String()]);
            }

            // Revoke remaining password reset proofs
            $this->proofService->revokeAll(ProofPurpose::PassengerPasswordReset, $userId, $tx);

            $this->auditWriter->record(
                AuditActor::passenger($userId),
                'postPassengerPasswordReset',
                AuditOutcome::Success,
                AuditTargetType::User,
                $userId,
                ['epoch' => $newEpoch, 'consumed' => true],
                $requestId,
                $tx
            );
        });
    }

    /**
     * POST /auth/email/verify (postPassengerEmailVerify) -> 200 OK
     *
     * @param array<string, mixed> $payload
     */
    public function emailVerify(array $payload, string $ip, string $requestId): bool
    {
        $this->assertOwnTransaction();
        $rawToken = (string) $payload['token'];

        // 1. Charge rate limiter
        $charge = $this->rateLimiter->charge('passenger', 'proof', [
            'subject' => $rawToken,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        return $this->executeAction('postPassengerEmailVerify', $requestId, function (ConnectionInterface $tx) use ($rawToken, $requestId) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            $consumption = $this->proofService->consume(ProofPurpose::PassengerEmailVerification, $rawToken, $tx);
            if (!$consumption->isSuccess()) {

                throw new ProofConsumptionFailedException('Invalid, expired, or previously used verification token.');
            }

            $userId = (string) $consumption->principalId;
            $user = $tx->table('users')->where('id', $userId)->lockForUpdate()->first();
            if (!$user) {
                throw new ProofConsumptionFailedException('Target account not found.');
            }

            if ($user->status === 'suspended') {

                throw new AccountSuspendedException('Account is suspended.');
            }

            $now = DatabaseClock::now($tx);

            $tx->table('users')->where('id', $userId)->update([
                'status' => 'active',
                'email_verified_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);

            // Revoke remaining verification proofs
            $this->proofService->revokeAll(ProofPurpose::PassengerEmailVerification, $userId, $tx);

            $this->auditWriter->record(
                AuditActor::passenger($userId),
                'postPassengerEmailVerify',
                AuditOutcome::Success,
                AuditTargetType::User,
                $userId,
                ['status' => 'verified', 'consumed' => true],
                $requestId,
                $tx
            );

            return true;
        });
    }

    /**
     * POST /auth/email/resend (postPassengerEmailResend) -> 202 Accepted
     *
     * @param array<string, mixed> $payload
     * @return array{status: string, message: string}
     */
    public function emailResend(array $payload, string $ip, string $requestId): array
    {
        $this->assertOwnTransaction();
        $normalizedEmail = strtolower(trim((string) $payload['email']));

        // 1. Charge durable rate limiter
        $charge = $this->rateLimiter->charge('passenger', 'dispatch', [
            'subject' => $normalizedEmail,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        return $this->db->transaction(function (ConnectionInterface $tx) use ($normalizedEmail, $requestId) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            $user = $tx->table('users')
                ->whereRaw('lower(email) = ?', [$normalizedEmail])
                ->lockForUpdate()
                ->first();

            if (!$user || $user->status !== 'unverified' || $user->email_verified_at !== null) {
                // Generic anti-enumeration receipt
                $this->auditWriter->record(
                    AuditActor::system(),
                    'postPassengerEmailResend',
                    AuditOutcome::Success,
                    AuditTargetType::User,
                    null,
                    ['status' => 'pending'],
                    $requestId,
                    $tx
                );

                return [
                    'status' => 'verification_dispatched',
                    'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
                ];
            }

            // Reissue verification proof and enqueue outbox
            $receipt = $this->proofService->reissue(ProofPurpose::PassengerEmailVerification, $user->id, $tx);
            $this->outboxService->enqueueProof($receipt, $tx);

            $this->auditWriter->record(
                AuditActor::system(),
                'postPassengerEmailResend',
                AuditOutcome::Success,
                AuditTargetType::User,
                $user->id,
                ['status' => 'pending'],
                $requestId,
                $tx
            );

            return [
                'status' => 'verification_dispatched',
                'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
            ];
        });
    }

    /**
     * GET /auth/passenger/sessions (getPassengerSessions) -> 200 OK
     *
     * @return list<array{id: string, ipAddress: string, userAgent: string, createdAt: string, lastSeenAt: string, current: bool}>
     */
    public function listSessions(PassengerSessionContext $sessionContext): array
    {
        $this->assertOwnTransaction();
        return $this->db->transaction(function (ConnectionInterface $tx) use ($sessionContext) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // 1. Lock principal row first in canonical order
            $user = $tx->table('users')
                ->where('id', $sessionContext->userId)
                ->lockForUpdate()
                ->first();

            if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            // 2. Lock caller session row FOR UPDATE
            $callerSession = $tx->table('passenger_sessions')
                ->where('id', $sessionContext->sessionId)
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            // 3. Derive live database time strictly AFTER acquiring locks
            $now = DatabaseClock::now($tx);

            // 4. Revalidate caller authority under lock
            if (
                !$callerSession
                || $callerSession->revoked_at !== null
                || (int) $callerSession->credential_epoch !== (int) $user->credential_epoch
                || $callerSession->auth_level !== 'full'
                || CarbonImmutable::parse($callerSession->absolute_expires_at)->lte($now)
                || CarbonImmutable::parse($callerSession->idle_expires_at)->lte($now)
            ) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            $this->assertCurrentFullSession($user, $callerSession, $sessionContext, $now);

            $rows = $tx->table('passenger_sessions')
                ->where('user_id', $user->id)
                ->where('auth_level', 'full')
                ->whereNull('revoked_at')
                ->where('absolute_expires_at', '>', $now->toIso8601String())
                ->where('idle_expires_at', '>', $now->toIso8601String())
                ->orderBy('issued_at', 'desc')
                ->get();

            $sessions = [];
            foreach ($rows as $row) {
                $ip = 'unknown';
                $userAgent = 'unknown';

                try {
                    $decrypted = $this->encrypter->decrypt($row->encrypted_payload);
                    $payload = json_decode($decrypted, true, 512, JSON_THROW_ON_ERROR);
                    if (is_array($payload)) {
                        $ip = (string) ($payload['ip_address'] ?? 'unknown');
                        $userAgent = (string) ($payload['user_agent'] ?? 'unknown');
                    }
                } catch (\Throwable) {
                    // Fallback safely to unknown; never leak corrupted payload or fail whole list
                }

                $sessions[] = [
                    'id' => (string) $row->id,
                    'ipAddress' => $ip,
                    'userAgent' => $userAgent,
                    'createdAt' => CarbonImmutable::parse($row->issued_at)->toIso8601String(),
                    'lastSeenAt' => CarbonImmutable::parse($row->last_seen_at)->toIso8601String(),
                    'current' => ((string) $row->id === $sessionContext->sessionId),
                ];
            }

            return $sessions;
        });
    }

    /**
     * DELETE /auth/passenger/sessions/{id} (deletePassengerSession) -> 200 OK
     *
     * Returns true if the revoked session was the caller's current session.
     */
    public function deleteSession(string $targetSessionId, PassengerSessionContext $sessionContext, string $requestId): bool
    {
        $this->assertOwnTransaction();
        return $this->executeAction('deletePassengerSession', $requestId, function (ConnectionInterface $tx) use ($targetSessionId, $sessionContext, $requestId) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // 1. Lock principal row first
            $user = $tx->table('users')
                ->where('id', $sessionContext->userId)
                ->lockForUpdate()
                ->first();

            if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            // 2. Safe denial: check ownership BEFORE locking target row (never lock foreign row)
            $target = $tx->table('passenger_sessions')
                ->where('id', $targetSessionId)
                ->where('user_id', $user->id)
                ->first();

            if (!$target || $target->revoked_at !== null) {
                throw new SessionNotFoundException('Session not found.');
            }

            // 3. Lock owner-scoped caller and target sessions in strictly ascending ID order
            $idsToLock = array_values(array_unique([$sessionContext->sessionId, $targetSessionId]));
            sort($idsToLock);

            $lockedSessions = $tx->table('passenger_sessions')
                ->whereIn('id', $idsToLock)
                ->where('user_id', $user->id)
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $now = DatabaseClock::now($tx);

            // 4. Revalidate current caller session under lock
            $callerSession = $lockedSessions->get($sessionContext->sessionId);
            if (
                !$callerSession
                || $callerSession->revoked_at !== null
                || (int) $callerSession->credential_epoch !== (int) $user->credential_epoch
                || $callerSession->auth_level !== 'full'
                || CarbonImmutable::parse($callerSession->absolute_expires_at)->lte($now)
                || CarbonImmutable::parse($callerSession->idle_expires_at)->lte($now)
            ) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            $this->assertCurrentFullSession($user, $callerSession, $sessionContext, $now);

            // 5. Revalidate target session under lock
            $targetSession = $lockedSessions->get($targetSessionId);
            if (
                !$targetSession
                || $targetSession->revoked_at !== null
                || CarbonImmutable::parse($targetSession->absolute_expires_at)->lte($now)
                || CarbonImmutable::parse($targetSession->idle_expires_at)->lte($now)
            ) {
                throw new SessionNotFoundException('Session not found.');
            }

            // 6. Revoke target session
            $tx->table('passenger_sessions')
                ->where('id', $targetSessionId)
                ->update(['revoked_at' => $now->toIso8601String()]);

            $this->auditWriter->record(
                AuditActor::passenger((string) $user->id),
                'deletePassengerSession',
                AuditOutcome::Success,
                AuditTargetType::PassengerSession,
                $targetSessionId,
                ['revoked' => true],
                $requestId,
                $tx
            );

            return ((string) $targetSessionId === (string) $sessionContext->sessionId);
        });
    }

    /**
     * PUT /auth/passenger/password (putPassengerPassword) -> 200 OK
     *
     * @param array<string, mixed> $payload
     */
    public function changePassword(array $payload, PassengerSessionContext $sessionContext, string $ip, string $requestId): void
    {
        $this->assertOwnTransaction();
        $currentPassword = (string) $payload['currentPassword'];
        $newPassword = (string) $payload['newPassword'];

        // 1. Charge durable rate limiter before current-password Argon2id verification
        $charge = $this->rateLimiter->charge('passenger', 'login', [
            'subject' => (string) $sessionContext->userId,
            'ip' => $ip,
        ]);
        if (!$charge->allowed) {
            throw new RateLimitExceededException($charge->retryAfterSeconds);
        }

        // 2. Validate new password against policy
        $passwordValidation = $this->passwordPolicy->validatePassengerPassword($newPassword);
        if (!$passwordValidation->isValid) {
            throw new InvalidPasswordException('New password does not satisfy policy requirements.');
        }

        $this->executeAction('putPassengerPassword', $requestId, function (ConnectionInterface $tx) use (
            $currentPassword,
            $newPassword,
            $sessionContext,
            $requestId
        ) {
            \App\Support\DatabaseFailure::applyTimeouts($tx, 3000, 3000);

            // 1. Lock principal row first in canonical order
            $user = $tx->table('users')
                ->where('id', $sessionContext->userId)
                ->lockForUpdate()
                ->first();

            if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            // Lock all owner sessions in ascending order, including the caller.
            $sessionIds = $tx->table('passenger_sessions')
                ->where('user_id', $user->id)
                ->whereNull('revoked_at')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id')
                ->all();

            $callerSession = $tx->table('passenger_sessions')->where('id', $sessionContext->sessionId)->where('user_id', $user->id)->first();

            // 4. Derive live database time strictly AFTER acquiring locks
            $now = DatabaseClock::now($tx);

            // 5. Revalidate caller authority under lock
            if (
                !$callerSession
                || $callerSession->revoked_at !== null
                || (int) $callerSession->credential_epoch !== (int) $user->credential_epoch
                || $callerSession->auth_level !== 'full'
                || CarbonImmutable::parse($callerSession->absolute_expires_at)->lte($now)
                || CarbonImmutable::parse($callerSession->idle_expires_at)->lte($now)
            ) {
                throw new AuthenticationException('Authenticated passenger session required.');
            }

            $this->assertCurrentFullSession($user, $callerSession, $sessionContext, $now);

            // 6. Verify current password against stored hash under lock
            $valid = $this->hasher->verify($currentPassword, $user->password_hash);
            if (!$valid) {

                throw new AuthenticationException('Current password is incorrect.');
            }

            $newHash = $this->hasher->hash($newPassword, 'passenger');
            $newEpoch = (int) $user->credential_epoch + 1;

            $tx->table('users')->where('id', $user->id)->update([
                'password_hash' => $newHash,
                'credential_epoch' => $newEpoch,
                'updated_at' => $now->toIso8601String(),
            ]);

            // 7. Revoke all active sessions for this user in ascending ID order
            if (!empty($sessionIds)) {
                $tx->table('passenger_sessions')
                    ->whereIn('id', $sessionIds)
                    ->update(['revoked_at' => $now->toIso8601String()]);
            }

            // 8. Revoke pending password reset proofs
            $this->proofService->revokeAll(ProofPurpose::PassengerPasswordReset, (string) $user->id, $tx);

            $this->auditWriter->record(
                AuditActor::passenger((string) $user->id),
                'putPassengerPassword',
                AuditOutcome::Success,
                AuditTargetType::User,
                (string) $user->id,
                ['epoch' => $newEpoch, 'revoked' => true],
                $requestId,
                $tx
            );
        });
    }
    /** Current locked authority must still match the context admitted by middleware. */
    private function assertCurrentFullSession(?object $user, ?object $session, PassengerSessionContext $context, CarbonImmutable $now): void
    {
        if (!$context->isFull() || !$user || !$session
            || $context->getUserId() !== (string) $user->id
            || (string) $session->user_id !== (string) $user->id
            || (string) $session->id !== $context->sessionId
            || $user->status !== 'active' || $user->email_verified_at === null
            || !Argon2idPasswordHasher::isValidStoredHashStructure($user->password_hash)
            || $context->credentialEpoch !== (int) $user->credential_epoch
            || (int) $session->credential_epoch !== (int) $user->credential_epoch
            || $session->auth_level !== 'full' || $session->revoked_at !== null
            || CarbonImmutable::parse($session->absolute_expires_at)->lte($now)
            || CarbonImmutable::parse($session->idle_expires_at)->lte($now)) {
            throw new AuthenticationException('Authenticated passenger session required.');
        }
        try {
            $payload = json_decode($this->encrypter->decrypt($session->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new AuthenticationException('Authenticated passenger session required.');
        }
        if (!is_array($payload) || !is_string($payload['csrf_token'] ?? null)
            || !hash_equals($payload['csrf_token'], $context->getCsrfToken())) {
            throw new AuthenticationException('Authenticated passenger session required.');
        }
    }

    private function assertOwnTransaction(): void
    {
        if ($this->db->transactionLevel() !== 0) {
            throw new \LogicException('Passenger actions require an owned transaction.');
        }
    }

    private function executeAction(string $operationId, string $requestId, \Closure $action): mixed
    {
        try {
            return $this->db->transaction($action);
        } catch (AuthenticationException|ProofConsumptionFailedException|AccountSuspendedException|SessionNotFoundException $failure) {
            // The action has rolled back. This separate fixed-vocabulary system event is durable
            // without taking an unrelated principal lock or exposing exception/input details.
            $isProof = $failure instanceof ProofConsumptionFailedException;
            $this->auditWriter->record(AuditActor::system(), $operationId, AuditOutcome::Denied,
                AuditTargetType::User, null,
                ['reason_code' => $isProof ? 'challenge_failed' : 'invalid_credentials',
                 'error_code' => $isProof ? 'ERR_CHALLENGE_FAILED' : 'ERR_UNAUTHORIZED'],
                $requestId, $this->db);
            throw $failure;
        }
    }
}
