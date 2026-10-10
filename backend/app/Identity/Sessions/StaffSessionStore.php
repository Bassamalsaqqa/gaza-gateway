<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use App\Identity\Exceptions\SessionConcurrencyException;
use App\Identity\Exceptions\SessionValidationException;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

final class StaffSessionStore
{
    /**
     * Documented strict lock order across all store operations:
     * 1. Principal row (staff_users WHERE id = ? FOR UPDATE) when authenticated principal is present.
     * 2. Session rows (staff_sessions WHERE id = ? / staff_id = ? ORDER BY id ASC FOR UPDATE).
     * Anonymous sessions lock only the single session row.
     */
    public const REALM = 'staff';
    public const ANONYMOUS_ABSOLUTE_TTL = 1800; // 30 min
    public const ANONYMOUS_IDLE_TTL = 1800;     // 30 min
    public const FULL_ABSOLUTE_TTL = 28800;     // 8 hours
    public const FULL_IDLE_TTL = 3600;          // 60 minutes

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
    ) {
    }

    /**
     * Issue a new anonymous staff session.
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

        $this->db->table('staff_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'staff_id' => null,
            'auth_level' => 'anonymous',
            'credential_epoch' => null,
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
            'mfa_version' => null,
            'mfa_verified_at' => null,
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
     * Issue a full authenticated staff session.
     * Follows strict lock order: locks staff principal row FOR UPDATE before session creation.
     */
    public function issueFull(
        string $staffId,
        int $credentialEpoch,
        int $mfaVersion,
        DateTimeInterface $mfaVerifiedAt,
        array $attributes = []
    ): SessionReceipt {
        if ($credentialEpoch < 1) {
            throw new \InvalidArgumentException('Credential epoch must be at least 1.');
        }

        return $this->db->transaction(function () use (
            $staffId,
            $credentialEpoch,
            $mfaVersion,
            $mfaVerifiedAt,
            $attributes
        ) {
            // 1. Lock principal row in documented order
            $staff = $this->db->table('staff_users')->where('id', $staffId)->lockForUpdate()->first();
            if (!$staff) {
                throw new SessionValidationException('Staff user does not exist.', 'staff_not_found');
            }
            if ($staff->status !== 'active') {
                throw new SessionValidationException('Staff user is not active.', 'staff_inactive');
            }
            if ($staff->email_verified_at === null) {
                throw new SessionValidationException('Staff email is not verified.', 'email_unverified');
            }
            if (!\App\Identity\Password\Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)) {
                throw new SessionValidationException('Staff password is not configured or unusable.', 'password_unusable');
            }
            if ((int) $staff->credential_epoch !== $credentialEpoch) {
                throw new SessionValidationException('Staff credential epoch mismatch.', 'epoch_mismatch');
            }
            if ((int) $staff->mfa_version !== $mfaVersion) {
                throw new SessionValidationException('Staff current MFA version mismatch.', 'mfa_version_mismatch');
            }

            // 2. Lock and verify confirmed unrevoked MFA credential in documented order
            $mfa = $this->db->table('staff_mfa_credentials')
                ->where('staff_id', $staffId)
                ->where('version', $mfaVersion)
                ->lockForUpdate()
                ->first();

            if (!$mfa || $mfa->confirmed_at === null) {
                throw new SessionValidationException('Staff MFA credential is not confirmed.', 'mfa_unconfirmed');
            }
            if ($mfa->revoked_at !== null) {
                throw new SessionValidationException('Staff MFA credential is revoked.', 'mfa_revoked');
            }

            // 3. Derive fresh time AFTER lock acquisition and verify proof timestamp
            $now = CarbonImmutable::now();
            $mfaVerifiedCarbon = CarbonImmutable::createFromInterface($mfaVerifiedAt);
            if ($mfaVerifiedCarbon->greaterThan($now)) {
                throw new SessionValidationException('Staff MFA timestamp is in the future.', 'mfa_future_timestamp');
            }
            // Reject MFA proof with age >= 300 seconds (exact boundary is expired)
            if ($now->greaterThanOrEqualTo($mfaVerifiedCarbon->addSeconds(300))) {
                throw new SessionValidationException('Staff MFA proof has expired.', 'mfa_expired_timestamp');
            }

            $token = OpaqueToken::generate(self::REALM, 'full_session');
            $csrfToken = OpaqueToken::generate(self::REALM, 'csrf')->getSecretToken();
            $sessionId = (string) Str::uuid();

            $absoluteExpiresAt = $now->addSeconds(self::FULL_ABSOLUTE_TTL);
            $idleExpiresAt = $now->addSeconds(self::FULL_IDLE_TTL);

            $payload = array_merge($attributes, ['csrf_token' => $csrfToken]);
            $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

            $this->db->table('staff_sessions')->insert([
                'id' => $sessionId,
                'lookup_digest' => $token->digest,
                'staff_id' => $staffId,
                'auth_level' => 'full',
                'credential_epoch' => $credentialEpoch,
                'encrypted_payload' => $encryptedPayload,
                'issued_at' => $now->toIso8601String(),
                'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
                'idle_expires_at' => $idleExpiresAt->toIso8601String(),
                'last_seen_at' => $now->toIso8601String(),
                'revoked_at' => null,
                'mfa_version' => $mfaVersion,
                'mfa_verified_at' => $mfaVerifiedCarbon->toIso8601String(),
            ]);

            return new SessionReceipt(
                rawToken: $token->getSecretToken(),
                csrfToken: $csrfToken,
                sessionId: $sessionId,
                realm: self::REALM,
                authLevel: 'full',
                principalId: $staffId,
                issuedAt: $now,
                absoluteExpiresAt: $absoluteExpiresAt,
                idleExpiresAt: $idleExpiresAt,
            );
        });
    }

    /**
     * Read and validate staff session. Updates last seen and idle expiry.
     * Follows documented lock order (principal -> session row) inside a transaction.
     * Evaluates time freshly AFTER acquiring locks.
     * Enforces canonical token validation, future MFA timestamp rejection, and usable password check.
     */
    public function read(#[\SensitiveParameter] string $rawToken): ?StaffSessionContext
    {
        try {
            OpaqueToken::validateCanonicalBearer($rawToken);
        } catch (\InvalidArgumentException) {
            return null;
        }

        $digest = OpaqueToken::digestOf($rawToken);

        return $this->db->transaction(function () use ($digest) {
            $candidate = $this->db->table('staff_sessions')
                ->where('lookup_digest', $digest)
                ->first(['id', 'staff_id', 'auth_level']);

            if (!$candidate) {
                return null;
            }

            // Lock principal row first in documented order if full session
            $staff = null;
            if ($candidate->staff_id !== null) {
                $staff = $this->db->table('staff_users')
                    ->where('id', $candidate->staff_id)
                    ->lockForUpdate()
                    ->first();
                if (!$staff) {
                    return null;
                }
            }

            // Lock session row FOR UPDATE
            $session = $this->db->table('staff_sessions')
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

            $role = null;
            $username = null;
            $staffStatus = null;

            if ($session->auth_level === 'full') {
                if (!$staff || $staff->status !== 'active' || $staff->email_verified_at === null) {
                    return null;
                }
                // Usable password requires sane Argon2id hash structure
                if (!\App\Identity\Password\Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)) {
                    return null;
                }
                if ((int) $staff->credential_epoch !== (int) $session->credential_epoch) {
                    return null;
                }
                if ((int) $staff->mfa_version !== (int) $session->mfa_version) {
                    return null;
                }
                if ($session->mfa_verified_at === null) {
                    return null;
                }

                // Reject future MFA timestamp (fail closed)
                $mfaVerifiedAt = CarbonImmutable::parse($session->mfa_verified_at);
                if ($mfaVerifiedAt->greaterThan($now)) {
                    return null;
                }

                // Verify MFA credential status
                $mfa = $this->db->table('staff_mfa_credentials')
                    ->where('staff_id', $session->staff_id)
                    ->where('version', $session->mfa_version)
                    ->first();

                if (!$mfa || $mfa->confirmed_at === null || $mfa->revoked_at !== null) {
                    return null;
                }

                $role = $staff->role;
                $username = $staff->username;
                $staffStatus = $staff->status;
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

            $this->db->table('staff_sessions')
                ->where('id', $session->id)
                ->update([
                    'last_seen_at' => $now->toIso8601String(),
                    'idle_expires_at' => $newIdleExpiresAt->toIso8601String(),
                ]);

            return new StaffSessionContext(
                sessionId: $session->id,
                authLevel: $session->auth_level,
                staffId: $session->staff_id,
                credentialEpoch: $session->credential_epoch !== null ? (int) $session->credential_epoch : null,
                csrfToken: $csrfToken,
                payload: $payload,
                issuedAt: CarbonImmutable::parse($session->issued_at),
                absoluteExpiresAt: $absoluteExpiresAt,
                idleExpiresAt: $newIdleExpiresAt,
                lastSeenAt: $now,
                mfaVersion: $session->mfa_version !== null ? (int) $session->mfa_version : null,
                mfaVerifiedAt: $session->mfa_verified_at !== null ? CarbonImmutable::parse($session->mfa_verified_at) : null,
                role: $role,
                username: $username,
                staffStatus: $staffStatus,
            );
        });
    }

    /**
     * Atomically rotate staff session: revokes old session and creates new session row.
     * Follows documented lock order (principal -> session row).
     * Derives time freshly AFTER acquiring locks, retains original absolute deadline,
     * limits refreshed idle to it, and does NOT renew MFA timestamp.
     */
    public function rotate(#[\SensitiveParameter] string $oldRawToken): SessionReceipt
    {
        OpaqueToken::validateCanonicalBearer($oldRawToken);
        $oldDigest = OpaqueToken::digestOf($oldRawToken);

        return $this->db->transaction(function () use ($oldDigest) {
            $preCheck = $this->db->table('staff_sessions')
                ->where('lookup_digest', $oldDigest)
                ->first(['id', 'staff_id', 'credential_epoch', 'mfa_version']);

            if (!$preCheck) {
                throw new SessionValidationException('Session not found.', 'session_not_found');
            }

            // Lock principal row first in documented order if full session
            if ($preCheck->staff_id !== null) {
                $staff = $this->db->table('staff_users')->where('id', $preCheck->staff_id)->lockForUpdate()->first();
                if (!$staff || $staff->status !== 'active' || $staff->email_verified_at === null) {
                    throw new SessionValidationException('Staff user invalid or inactive.', 'staff_invalid');
                }
                if (!\App\Identity\Password\Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)) {
                    throw new SessionValidationException('Staff password hash unusable.', 'password_unusable');
                }
                if ((int) $staff->credential_epoch !== (int) $preCheck->credential_epoch) {
                    throw new SessionValidationException('Staff credential epoch mismatch.', 'epoch_invalid');
                }
                if ((int) $staff->mfa_version !== (int) $preCheck->mfa_version) {
                    throw new SessionValidationException('Staff MFA version mismatch.', 'mfa_version_mismatch');
                }

                // Lock credential in documented order: principal -> credential -> session
                $mfa = $this->db->table('staff_mfa_credentials')
                    ->where('staff_id', $preCheck->staff_id)
                    ->where('version', $preCheck->mfa_version)
                    ->lockForUpdate()
                    ->first();
                if (!$mfa || $mfa->confirmed_at === null || $mfa->revoked_at !== null) {
                    throw new SessionValidationException('MFA credential revoked or unconfirmed.', 'mfa_invalid');
                }
            }

            // Lock session row FOR UPDATE
            $oldSession = $this->db->table('staff_sessions')
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
            $this->db->table('staff_sessions')
                ->where('id', $oldSession->id)
                ->update(['revoked_at' => $now->toIso8601String()]);

            // Issue new session
            $newToken = OpaqueToken::generate(self::REALM, $oldSession->auth_level . '_session');
            $newCsrfToken = OpaqueToken::generate(self::REALM, 'csrf')->getSecretToken();
            $newSessionId = (string) Str::uuid();

            // Crucial: Rotation retains original absolute deadline and does NOT renew MFA timestamp
            $newAbsoluteExpiresAt = $absoluteExpiresAt;
            $idleTtl = $oldSession->auth_level === 'full' ? self::FULL_IDLE_TTL : self::ANONYMOUS_IDLE_TTL;
            $newIdleExpiresAt = $now->addSeconds($idleTtl);
            if ($newIdleExpiresAt->greaterThan($newAbsoluteExpiresAt)) {
                $newIdleExpiresAt = $newAbsoluteExpiresAt;
            }

            $payload['csrf_token'] = $newCsrfToken;
            $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

            $this->db->table('staff_sessions')->insert([
                'id' => $newSessionId,
                'lookup_digest' => $newToken->getDigest(),
                'staff_id' => $oldSession->staff_id,
                'auth_level' => $oldSession->auth_level,
                'credential_epoch' => $oldSession->credential_epoch,
                'encrypted_payload' => $encryptedPayload,
                'issued_at' => $now->toIso8601String(),
                'absolute_expires_at' => $newAbsoluteExpiresAt->toIso8601String(),
                'idle_expires_at' => $newIdleExpiresAt->toIso8601String(),
                'last_seen_at' => $now->toIso8601String(),
                'revoked_at' => null,
                'mfa_version' => $oldSession->mfa_version,
                'mfa_verified_at' => $oldSession->mfa_verified_at, // MFA timestamp NOT renewed!
            ]);

            return new SessionReceipt(
                rawToken: $newToken->getSecretToken(),
                csrfToken: $newCsrfToken,
                sessionId: $newSessionId,
                realm: self::REALM,
                authLevel: $oldSession->auth_level,
                principalId: $oldSession->staff_id,
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
            $candidate = $this->db->table('staff_sessions')
                ->where('lookup_digest', $digest)
                ->first(['id', 'staff_id']);

            if (!$candidate) {
                return false;
            }

            if ($candidate->staff_id !== null) {
                $this->db->table('staff_users')->where('id', $candidate->staff_id)->lockForUpdate()->first();
            }

            $session = $this->db->table('staff_sessions')
                ->where('id', $candidate->id)
                ->lockForUpdate()
                ->first();

            if (!$session || $session->revoked_at !== null) {
                return false;
            }

            $now = CarbonImmutable::now();
            $this->db->table('staff_sessions')
                ->where('id', $session->id)
                ->update(['revoked_at' => $now->toIso8601String()]);

            return true;
        });
    }

    /**
     * Revoke all active sessions for a staff member.
     * Follows strict lock order: principal row -> session rows ordered by id ASC.
     */
    public function revokePrincipal(string $staffId): int
    {
        return $this->db->transaction(function () use ($staffId) {
            // Lock principal row first
            $this->db->table('staff_users')->where('id', $staffId)->lockForUpdate()->first();

            // Lock active sessions ascending
            $sessions = $this->db->table('staff_sessions')
                ->where('staff_id', $staffId)
                ->whereNull('revoked_at')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id')
                ->toArray();

            if (empty($sessions)) {
                return 0;
            }

            $now = CarbonImmutable::now();
            return $this->db->table('staff_sessions')
                ->whereIn('id', $sessions)
                ->update(['revoked_at' => $now->toIso8601String()]);
        });
    }
}
