<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use App\Identity\Exceptions\SessionConcurrencyException;
use App\Identity\Exceptions\SessionValidationException;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

final class PassengerSessionStore
{
    /**
     * Documented strict lock order across all store operations:
     * 1. Principal row (users WHERE id = ? FOR UPDATE) when authenticated principal is present.
     * 2. Session rows (passenger_sessions WHERE id = ? / user_id = ? ORDER BY id ASC FOR UPDATE).
     * Anonymous sessions lock only the single session row.
     */
    public const REALM = 'passenger';
    public const ANONYMOUS_ABSOLUTE_TTL = 1800; // 30 min
    public const ANONYMOUS_IDLE_TTL = 1800;     // 30 min
    public const FULL_ABSOLUTE_TTL = 604800;    // 7 days
    public const FULL_IDLE_TTL = 86400;        // 24 hours

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
    ) {
    }

    /**
     * Issue a new anonymous passenger session.
     */
    public function issueAnonymous(array $attributes = []): SessionReceipt
    {
        $now = CarbonImmutable::now();
        $token = OpaqueToken::generate(self::REALM, 'anonymous_session');
        $csrfToken = OpaqueToken::generate(self::REALM, 'csrf')->getSecretToken();
        $sessionId = (string) Str::uuid();

        $absoluteExpiresAt = $now->addSeconds(self::ANONYMOUS_ABSOLUTE_TTL);
        $idleExpiresAt = $now->addSeconds(self::ANONYMOUS_IDLE_TTL);

        $payload = array_merge($attributes, ['csrf_token' => $csrfToken]);
        $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        $this->db->table('passenger_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'user_id' => null,
            'auth_level' => 'anonymous',
            'credential_epoch' => null,
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        return new SessionReceipt(
            rawToken: $token->getSecretToken(),
            csrfToken: $csrfToken,
            sessionId: $sessionId,
            realm: self::REALM,
            authLevel: 'anonymous',
            principalId: null,
            issuedAt: $now,
            absoluteExpiresAt: $absoluteExpiresAt,
            idleExpiresAt: $idleExpiresAt,
        );
    }

    /**
     * Issue a full authenticated passenger session for an active, verified user.
     * Follows strict lock order: locks principal row FOR UPDATE before session creation.
     */
    public function issueFull(string $userId, int $credentialEpoch, array $attributes = []): SessionReceipt
    {
        if ($credentialEpoch < 1) {
            throw new \InvalidArgumentException('Credential epoch must be at least 1.');
        }

        return $this->db->transaction(function () use ($userId, $credentialEpoch, $attributes) {
            // Lock principal row first in documented order
            $user = $this->db->table('users')->where('id', $userId)->lockForUpdate()->first();
            if (!$user) {
                throw new SessionValidationException('User does not exist.', 'user_not_found');
            }
            if ($user->status !== 'active') {
                throw new SessionValidationException('User is not active.', 'user_inactive');
            }
            if ($user->email_verified_at === null) {
                throw new SessionValidationException('User email is not verified.', 'email_unverified');
            }
            if ((int) $user->credential_epoch !== $credentialEpoch) {
                throw new SessionValidationException('User credential epoch mismatch.', 'epoch_mismatch');
            }

            $now = CarbonImmutable::now();
            $token = OpaqueToken::generate(self::REALM, 'full_session');
            $csrfToken = OpaqueToken::generate(self::REALM, 'csrf')->getSecretToken();
            $sessionId = (string) Str::uuid();

            $absoluteExpiresAt = $now->addSeconds(self::FULL_ABSOLUTE_TTL);
            $idleExpiresAt = $now->addSeconds(self::FULL_IDLE_TTL);

            $payload = array_merge($attributes, ['csrf_token' => $csrfToken]);
            $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

            $this->db->table('passenger_sessions')->insert([
                'id' => $sessionId,
                'lookup_digest' => $token->digest,
                'user_id' => $userId,
                'auth_level' => 'full',
                'credential_epoch' => $credentialEpoch,
                'encrypted_payload' => $encryptedPayload,
                'issued_at' => $now->toIso8601String(),
                'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
                'idle_expires_at' => $idleExpiresAt->toIso8601String(),
                'last_seen_at' => $now->toIso8601String(),
                'revoked_at' => null,
            ]);

            return new SessionReceipt(
                rawToken: $token->getSecretToken(),
                csrfToken: $csrfToken,
                sessionId: $sessionId,
                realm: self::REALM,
                authLevel: 'full',
                principalId: $userId,
                issuedAt: $now,
                absoluteExpiresAt: $absoluteExpiresAt,
                idleExpiresAt: $idleExpiresAt,
            );
        });
    }

    /**
     * Read and validate session. Updates idle expiry and last seen timestamp on active access.
     * Follows documented lock order (principal -> session row) inside a transaction.
     * Evaluates time freshly AFTER acquiring locks.
     */
    public function read(#[\SensitiveParameter] string $rawToken): ?PassengerSessionContext
    {
        try {
            OpaqueToken::validateCanonicalBearer($rawToken);
        } catch (\InvalidArgumentException) {
            return null;
        }

        $digest = OpaqueToken::digestOf($rawToken);

        return $this->db->transaction(function () use ($digest) {
            $candidate = $this->db->table('passenger_sessions')
                ->where('lookup_digest', $digest)
                ->first(['id', 'user_id', 'auth_level']);

            if (!$candidate) {
                return null;
            }

            // Lock in documented order: principal first if full session
            $user = null;
            if ($candidate->user_id !== null) {
                $user = $this->db->table('users')
                    ->where('id', $candidate->user_id)
                    ->lockForUpdate()
                    ->first();
                if (!$user) {
                    return null;
                }
            }

            // Lock session row FOR UPDATE
            $session = $this->db->table('passenger_sessions')
                ->where('id', $candidate->id)
                ->lockForUpdate()
                ->first();

            if (!$session || $session->revoked_at !== null) {
                return null;
            }

            // Fresh time derivation after waiting for locks
            $now = CarbonImmutable::now();

            $absoluteExpiresAt = CarbonImmutable::parse($session->absolute_expires_at);
            if ($now->greaterThanOrEqualTo($absoluteExpiresAt)) {
                return null;
            }

            $idleExpiresAt = CarbonImmutable::parse($session->idle_expires_at);
            if ($now->greaterThanOrEqualTo($idleExpiresAt)) {
                return null;
            }

            $userEmail = null;
            $userStatus = null;

            if ($session->auth_level === 'full') {
                if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                    return null;
                }
                if ((int) $user->credential_epoch !== (int) $session->credential_epoch) {
                    return null;
                }
                $userEmail = $user->email;
                $userStatus = $user->status;
            }

            try {
                $decryptedJson = $this->encrypter->decrypt($session->encrypted_payload);
                $payload = json_decode($decryptedJson, true, 512, JSON_THROW_ON_ERROR);
            } catch (\Throwable) {
                return null;
            }

            if (!is_array($payload)) {
                return null;
            }

            $csrfToken = $payload['csrf_token'] ?? null;
            if (!is_string($csrfToken) || strlen($csrfToken) !== OpaqueToken::CANONICAL_LENGTH) {
                return null;
            }

            try {
                OpaqueToken::validateCanonicalBearer($csrfToken);
            } catch (\Throwable) {
                return null;
            }

            unset($payload['csrf_token']);

            // Touch last seen and compute new idle expiry bounded by original absolute expiry
            $idleTtl = $session->auth_level === 'full' ? self::FULL_IDLE_TTL : self::ANONYMOUS_IDLE_TTL;
            $newIdleExpiresAt = $now->addSeconds($idleTtl);
            if ($newIdleExpiresAt->greaterThan($absoluteExpiresAt)) {
                $newIdleExpiresAt = $absoluteExpiresAt;
            }

            $this->db->table('passenger_sessions')
                ->where('id', $session->id)
                ->update([
                    'last_seen_at' => $now->toIso8601String(),
                    'idle_expires_at' => $newIdleExpiresAt->toIso8601String(),
                ]);

            return new PassengerSessionContext(
                sessionId: $session->id,
                authLevel: $session->auth_level,
                userId: $session->user_id,
                credentialEpoch: $session->credential_epoch !== null ? (int) $session->credential_epoch : null,
                csrfToken: $csrfToken,
                payload: $payload,
                issuedAt: CarbonImmutable::parse($session->issued_at),
                absoluteExpiresAt: $absoluteExpiresAt,
                idleExpiresAt: $newIdleExpiresAt,
                lastSeenAt: $now,
                userEmail: $userEmail,
                userStatus: $userStatus,
            );
        });
    }

    /**
     * Atomically rotate session: revokes old session row and creates new session row.
     * Follows documented lock order (principal -> session row).
     * Derives time freshly AFTER acquiring locks, retains original absolute deadline,
     * bounds idle expiry to it, and ensures no stale successor survives.
     */
    public function rotate(#[\SensitiveParameter] string $oldRawToken): SessionReceipt
    {
        OpaqueToken::validateCanonicalBearer($oldRawToken);
        $oldDigest = OpaqueToken::digestOf($oldRawToken);

        return $this->db->transaction(function () use ($oldDigest) {
            $preCheck = $this->db->table('passenger_sessions')
                ->where('lookup_digest', $oldDigest)
                ->first(['id', 'user_id', 'credential_epoch']);

            if (!$preCheck) {
                throw new SessionValidationException('Session not found.', 'session_not_found');
            }

            // Lock in documented order: principal first if full session
            if ($preCheck->user_id !== null) {
                $user = $this->db->table('users')->where('id', $preCheck->user_id)->lockForUpdate()->first();
                if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                    throw new SessionValidationException('User is inactive or unverified.', 'user_invalid');
                }
                if ((int) $user->credential_epoch !== (int) $preCheck->credential_epoch) {
                    throw new SessionValidationException('Credential epoch has changed.', 'epoch_invalid');
                }
            }

            // Lock old session row FOR UPDATE
            $oldSession = $this->db->table('passenger_sessions')
                ->where('id', $preCheck->id)
                ->lockForUpdate()
                ->first();

            if (!$oldSession) {
                throw new SessionValidationException('Session not found.', 'session_not_found');
            }

            if ($oldSession->revoked_at !== null) {
                throw new SessionConcurrencyException('Session has already been revoked.');
            }

            // Fresh time derivation after waiting for locks
            $now = CarbonImmutable::now();

            $absoluteExpiresAt = CarbonImmutable::parse($oldSession->absolute_expires_at);
            if ($now->greaterThanOrEqualTo($absoluteExpiresAt)) {
                throw new SessionValidationException('Session has expired absolutely.', 'session_expired');
            }

            $idleExpiresAt = CarbonImmutable::parse($oldSession->idle_expires_at);
            if ($now->greaterThanOrEqualTo($idleExpiresAt)) {
                throw new SessionValidationException('Session has expired due to idleness.', 'session_idle_expired');
            }

            try {
                $decryptedOld = $this->encrypter->decrypt($oldSession->encrypted_payload);
                $payload = json_decode($decryptedOld, true, 512, JSON_THROW_ON_ERROR);
            } catch (\Throwable) {
                throw new SessionValidationException('Session payload corrupted or decryption failed.', 'payload_invalid');
            }

            if (!is_array($payload)) {
                throw new SessionValidationException('Session payload must be an array.', 'payload_invalid');
            }

            $oldCsrfToken = $payload['csrf_token'] ?? null;
            if (!is_string($oldCsrfToken) || strlen($oldCsrfToken) !== OpaqueToken::CANONICAL_LENGTH) {
                throw new SessionValidationException('Session payload missing valid CSRF token.', 'csrf_missing');
            }

            try {
                OpaqueToken::validateCanonicalBearer($oldCsrfToken);
            } catch (\Throwable) {
                throw new SessionValidationException('Session payload contains malformed CSRF token.', 'csrf_invalid');
            }

            // Revoke old session immediately
            $this->db->table('passenger_sessions')
                ->where('id', $oldSession->id)
                ->update(['revoked_at' => $now->toIso8601String()]);

            // Issue new session
            $newToken = OpaqueToken::generate(self::REALM, $oldSession->auth_level . '_session');
            $newCsrfToken = OpaqueToken::generate(self::REALM, 'csrf')->getSecretToken();
            $newSessionId = (string) Str::uuid();

            // Crucial: Rotation retains the original absolute deadline!
            $newAbsoluteExpiresAt = $absoluteExpiresAt;
            $idleTtl = $oldSession->auth_level === 'full' ? self::FULL_IDLE_TTL : self::ANONYMOUS_IDLE_TTL;
            $newIdleExpiresAt = $now->addSeconds($idleTtl);
            if ($newIdleExpiresAt->greaterThan($newAbsoluteExpiresAt)) {
                $newIdleExpiresAt = $newAbsoluteExpiresAt;
            }

            $payload['csrf_token'] = $newCsrfToken;
            $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

            $this->db->table('passenger_sessions')->insert([
                'id' => $newSessionId,
                'lookup_digest' => $newToken->getDigest(),
                'user_id' => $oldSession->user_id,
                'auth_level' => $oldSession->auth_level,
                'credential_epoch' => $oldSession->credential_epoch,
                'encrypted_payload' => $encryptedPayload,
                'issued_at' => $now->toIso8601String(),
                'absolute_expires_at' => $newAbsoluteExpiresAt->toIso8601String(),
                'idle_expires_at' => $newIdleExpiresAt->toIso8601String(),
                'last_seen_at' => $now->toIso8601String(),
                'revoked_at' => null,
            ]);

            return new SessionReceipt(
                rawToken: $newToken->getSecretToken(),
                csrfToken: $newCsrfToken,
                sessionId: $newSessionId,
                realm: self::REALM,
                authLevel: $oldSession->auth_level,
                principalId: $oldSession->user_id,
                issuedAt: $now,
                absoluteExpiresAt: $newAbsoluteExpiresAt,
                idleExpiresAt: $newIdleExpiresAt,
            );
        });
    }

    /**
     * Revoke single session by token.
     * Follows documented lock order (principal -> session row).
     */
    public function revoke(#[\SensitiveParameter] string $rawToken): bool
    {
        try {
            OpaqueToken::validateCanonicalBearer($rawToken);
        } catch (\InvalidArgumentException) {
            return false;
        }

        $digest = OpaqueToken::digestOf($rawToken);

        return $this->db->transaction(function () use ($digest) {
            $candidate = $this->db->table('passenger_sessions')
                ->where('lookup_digest', $digest)
                ->first(['id', 'user_id']);

            if (!$candidate) {
                return false;
            }

            if ($candidate->user_id !== null) {
                $this->db->table('users')->where('id', $candidate->user_id)->lockForUpdate()->first();
            }

            $session = $this->db->table('passenger_sessions')
                ->where('id', $candidate->id)
                ->lockForUpdate()
                ->first();

            if (!$session || $session->revoked_at !== null) {
                return false;
            }

            $now = CarbonImmutable::now();
            $this->db->table('passenger_sessions')
                ->where('id', $session->id)
                ->update(['revoked_at' => $now->toIso8601String()]);

            return true;
        });
    }

    /**
     * Revoke all active sessions for a passenger principal.
     * Follows strict lock order: principal row -> session rows ordered by id ASC.
     */
    public function revokePrincipal(string $userId): int
    {
        return $this->db->transaction(function () use ($userId) {
            // Lock principal row first
            $this->db->table('users')->where('id', $userId)->lockForUpdate()->first();

            // Lock active sessions ascending
            $sessions = $this->db->table('passenger_sessions')
                ->where('user_id', $userId)
                ->whereNull('revoked_at')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id')
                ->toArray();

            if (empty($sessions)) {
                return 0;
            }

            $now = CarbonImmutable::now();
            return $this->db->table('passenger_sessions')
                ->whereIn('id', $sessions)
                ->update(['revoked_at' => $now->toIso8601String()]);
        });
    }
}
