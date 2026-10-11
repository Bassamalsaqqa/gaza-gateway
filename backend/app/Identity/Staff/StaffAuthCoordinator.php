<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use App\Identity\Audit\{AuditActor, AuditOutcome, AuditTargetType, AuditWriter};
use App\Identity\Mfa\{RecoveryCode, TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\{StaffSessionContext, StaffSessionStore};
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/**
 * Owns each action transaction. Lock order: principal -> sessions ASC -> credential
 * -> pending/recovery/counters. Middleware admission snapshots never authorize writes.
 */
final class StaffAuthCoordinator
{
    private const string DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng';

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
        private readonly Argon2idPasswordHasher $hasher,
        private readonly StaffSessionStore $sessions,
        private readonly DurableRateLimiter $limiter,
        private readonly AuditWriter $audit,
        private readonly RbacPolicy $rbac,
    ) {}

    public function login(
        #[\SensitiveParameter] array $input,
        StaffSessionContext $context,
        #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] string $csrf,
        string $ip,
        string $userAgent,
        string $requestId,
    ): StaffOperationResult {
        $this->ownTransaction();
        $this->charge('login', ['subject' => $input['username'], 'ip' => $ip]);
        $result = $this->db->transaction(function () use ($input, $context, $cookie, $csrf, $ip, $userAgent, $requestId) {
            $this->timeouts();
            $staff = $this->db->table('staff_users')->where('username', $input['username'])->lockForUpdate()->first();
            // The unknown/ineligible branch performs the same native Argon2id work.
            $usable = $staff && Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash);
            $passwordOk = $this->hasher->verify($input['password'], $usable ? $staff->password_hash : self::DUMMY_HASH);
            if (!$staff || !$passwordOk || !$this->eligible($staff) || !$context->isAnonymous()) {
                $this->denied('postStaffLogin', $requestId);
                return null;
            }
            $session = $this->db->table('staff_sessions')->where('id', $context->sessionId)->lockForUpdate()->first();
            $now = $this->now();
            if (!$this->validSession($session, $context, $cookie, $csrf, $now, false)) {
                return null;
            }
            $mfa = $this->credential($staff);
            if (!$mfa) { return null; }
            // Binding is server-owned, encrypted, versioned and never enrollment secret material.
            $payload = $this->payload($session);
            $payload['pending_login'] = ['staffId' => $staff->id, 'epoch' => (int) $staff->credential_epoch,
                'mfaVersion' => (int) $staff->mfa_version];
            $this->db->table('staff_sessions')->where('id', $session->id)->update([
                'encrypted_payload' => $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR)),
            ]);
            $old = $this->db->table('staff_pending_auth')->where('bound_session_id', $session->id)
                ->where('state', 'issued')->orderBy('id')->lockForUpdate()->pluck('id');
            if ($old->isNotEmpty()) {
                $this->db->table('staff_pending_auth')->whereIn('id', $old)->update(['state' => 'revoked', 'revoked_at' => $now]);
            }
            $token = OpaqueToken::generate('staff', 'login_mfa');
            $id = (string) Str::uuid();
            $expires = $now->addSeconds(300)->min(CarbonImmutable::parse($session->absolute_expires_at));
            $this->db->table('staff_pending_auth')->insert([
                'id' => $id, 'token_digest' => $token->getDigest(), 'state' => 'issued', 'issued_at' => $now,
                'expires_at' => $expires, 'staff_id' => $staff->id, 'bound_session_id' => $session->id,
                'purpose' => 'login_mfa', 'credential_epoch' => $staff->credential_epoch, 'failed_attempts' => 0,
            ]);
            $this->event('postStaffLogin', $staff->id, $requestId);
            return new StaffOperationResult(['status' => 'mfa_required', 'expiresAt' => $expires->toIso8601String()],
                pendingToken: $token->getSecretToken(), challengeId: $id);
        });
        return $result ?? throw new StaffAuthenticationException();
    }

    public function pending(
        string $operation,
        #[\SensitiveParameter] array $input,
        StaffSessionContext $context,
        #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] string $csrf,
        #[\SensitiveParameter] string $pendingCookie,
        string $ip,
        string $userAgent,
        string $requestId,
    ): StaffOperationResult {
        if (!in_array($operation, ['postStaffMfaChallenge', 'postStaffMfaVerify'], true)) {
            throw new \LogicException('Unsupported pending operation.');
        }
        $this->ownTransaction();
        OpaqueToken::validateCanonicalBearer($pendingCookie);
        $this->charge('proof', ['subject' => hash('sha256', $pendingCookie), 'ip' => $ip]);
        $result = $this->db->transaction(function () use ($operation, $input, $context, $cookie, $csrf, $pendingCookie, $ip, $userAgent, $requestId) {
            $this->timeouts();
            $candidate = $this->db->table('staff_pending_auth')->where('token_digest', hash('sha256', $pendingCookie))->first();
            if (!$candidate || $candidate->bound_session_id !== $context->sessionId) { return null; }
            $staff = $this->db->table('staff_users')->where('id', $candidate->staff_id)->lockForUpdate()->first();
            if (!$staff || !$this->eligible($staff)) { return null; }
            // Include bound anonymous session in the same ordered session lock set.
            $rows = $this->db->table('staff_sessions')->where(function ($q) use ($staff, $context) {
                $q->where('staff_id', $staff->id)->orWhere('id', $context->sessionId);
            })->orderBy('id')->lockForUpdate()->get();
            $session = $rows->firstWhere('id', $context->sessionId);
            $mfa = $this->credential($staff);
            $pending = $this->db->table('staff_pending_auth')->where('id', $candidate->id)->lockForUpdate()->first();
            $now = $this->now();
            if (!$mfa || !$this->validSession($session, $context, $cookie, $csrf, $now, false)
                || !$pending || $pending->state !== 'issued' || $pending->purpose !== 'login_mfa'
                || $pending->consumed_at !== null || $pending->revoked_at !== null || (int) $pending->failed_attempts >= 5
                || $pending->staff_id !== $staff->id || $pending->bound_session_id !== $session->id
                || (int) $pending->credential_epoch !== (int) $staff->credential_epoch
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($pending->expires_at))) { return null; }
            $snapshot = $this->payload($session)['pending_login'] ?? null;
            if ($snapshot !== ['staffId' => $staff->id, 'epoch' => (int) $staff->credential_epoch,
                'mfaVersion' => (int) $staff->mfa_version]) { return null; }
            if ($operation === 'postStaffMfaChallenge') {
                if (($input['staffSessionChallengeId'] ?? null) !== $pending->id) { return null; }
                return new StaffOperationResult(['status' => 'mfa_required', 'expiresAt' => CarbonImmutable::parse($pending->expires_at)->toIso8601String()]);
            }
            if (!$this->consumeMfa($staff, $mfa, $input, $now)) {
                $attempts = (int) $pending->failed_attempts + 1;
                $this->db->table('staff_pending_auth')->where('id', $pending->id)->update([
                    'failed_attempts' => $attempts, 'state' => $attempts >= 5 ? 'exhausted' : 'issued',
                ]);
                $this->denied($operation, $requestId);
                // Return a denial and commit: throwing here would undo the attempt budget.
                return null;
            }
            $this->db->table('staff_pending_auth')->where('id', $pending->id)->update(['state' => 'consumed', 'consumed_at' => $now]);
            $this->db->table('staff_sessions')->where('id', $session->id)->update(['revoked_at' => $now]);
            $receipt = $this->sessions->issueFull($staff->id, (int) $staff->credential_epoch, (int) $staff->mfa_version,
                $now, ['ip_address' => $ip, 'user_agent' => mb_substr($userAgent, 0, 256)]);
            $this->event($operation, $staff->id, $requestId);
            return new StaffOperationResult(['staff' => $this->staffDto($staff)], $receipt);
        });
        return $result ?? throw new StaffAuthenticationException();
    }

    public function full(
        string $operation,
        #[\SensitiveParameter] array $input,
        StaffSessionContext $context,
        #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] ?string $csrf,
        ?string $targetId,
        string $ip,
        string $requestId,
    ): StaffOperationResult {
        if (!in_array($operation, ['getStaffMe', 'getStaffSessions', 'deleteStaffSession', 'postStaffLogout', 'postStaffStepUp'], true)) {
            throw new \LogicException('Unsupported staff operation.');
        }
        $this->ownTransaction();
        if (!$context->isFull() || $context->getStaffId() === null) { throw new StaffAuthenticationException(); }
        if ($operation === 'postStaffStepUp') {
            $this->charge('stepUp', ['staff_id' => $context->getStaffId(), 'session_id' => $context->sessionId, 'ip' => $ip]);
        }
        $result = $this->db->transaction(function () use ($operation, $input, $context, $cookie, $csrf, $targetId, $requestId) {
            $this->timeouts();
            $staff = $this->db->table('staff_users')->where('id', $context->getStaffId())->lockForUpdate()->first();
            if (!$staff || !$this->eligible($staff)) { return null; }
            $rows = $this->db->table('staff_sessions')->where('staff_id', $staff->id)->orderBy('id')->lockForUpdate()->get();
            $current = $rows->firstWhere('id', $context->sessionId);
            $mfa = $this->credential($staff);
            $now = $this->now();
            $unsafe = !in_array($operation, ['getStaffMe', 'getStaffSessions'], true);
            if ($unsafe && ($csrf === null || $csrf === '')) { return null; }
            if (!$mfa || !$this->validSession($current, $context, $cookie, $unsafe ? $csrf : null, $now, true)
                || (int) $current->credential_epoch !== (int) $staff->credential_epoch
                || (int) $current->mfa_version !== (int) $staff->mfa_version
                || $current->mfa_verified_at === null || CarbonImmutable::parse($current->mfa_verified_at)->greaterThan($now)) { return null; }
            if ($operation === 'getStaffMe') {
                return new StaffOperationResult($this->staffDto($staff) + ['fullNameEn' => $staff->full_name_en,
                    'fullNameAr' => $staff->full_name_ar, 'mfaEnabled' => true]);
            }
            if ($operation === 'getStaffSessions') {
                $data = [];
                foreach ($rows as $row) {
                    if ($row->revoked_at !== null || $now->greaterThanOrEqualTo(CarbonImmutable::parse($row->absolute_expires_at))
                        || $now->greaterThanOrEqualTo(CarbonImmutable::parse($row->idle_expires_at))
                        || (int) $row->credential_epoch !== (int) $staff->credential_epoch
                        || (int) $row->mfa_version !== (int) $staff->mfa_version) { continue; }
                    $payload = $this->payload($row);
                    $data[] = ['id' => $row->id, 'ipAddress' => (string) ($payload['ip_address'] ?? ''),
                        'userAgent' => (string) ($payload['user_agent'] ?? ''),
                        'lastActivity' => CarbonImmutable::parse($row->last_seen_at)->toIso8601String(), 'isCurrent' => $row->id === $current->id];
                }
                return new StaffOperationResult($data);
            }
            if ($operation === 'postStaffStepUp') {
                if (!$this->consumeMfa($staff, $mfa, $input, $now)) { $this->denied($operation, $requestId); return null; }
                $this->db->table('staff_sessions')->where('id', $current->id)->update(['mfa_verified_at' => $now]);
                $this->event($operation, $staff->id, $requestId);
                return new StaffOperationResult(['verified' => true, 'expiresAt' => $now->addSeconds(300)->toIso8601String()]);
            }
            $id = $operation === 'postStaffLogout' ? $current->id : $targetId;
            if (!$rows->firstWhere('id', $id)) { return null; } // No cross-owner lookup or lock.
            $changed = $this->db->table('staff_sessions')->where('id', $id)->whereNull('revoked_at')->update(['revoked_at' => $now]);
            $this->event($operation, $staff->id, $requestId);
            return new StaffOperationResult($operation === 'deleteStaffSession'
                ? ['revoked' => $changed > 0] : ['message' => 'Staff session terminated.']);
        });
        return $result ?? throw new StaffAuthenticationException();
    }

    private function consumeMfa(object $staff, object $mfa, #[\SensitiveParameter] array $input, CarbonImmutable $now): bool
    {
        if (isset($input['recoveryCode']) && !isset($input['totpCode'])) {
            try { $digest = RecoveryCode::digest($input['recoveryCode']); } catch (\InvalidArgumentException|\App\Identity\Mfa\Exceptions\MfaException) { return false; }
            $row = $this->db->table('staff_mfa_recovery_codes')->where('staff_id', $staff->id)
                ->where('mfa_version', $mfa->version)->where('code_digest', $digest)->lockForUpdate()->first();
            if (!$row || $row->consumed_at !== null || $row->revoked_at !== null) { return false; }
            $this->db->table('staff_mfa_recovery_codes')->where('id', $row->id)->update(['consumed_at' => $now]);
            return true;
        }
        if (!isset($input['totpCode']) || isset($input['recoveryCode'])) { return false; }
        try {
            $secret = TotpSecret::fromBase32($this->encrypter->decrypt($mfa->encrypted_secret));
            $matches = (new TotpService())->match($secret, $input['totpCode'], $now->getTimestamp());
        } catch (\Throwable) { return false; }
        if ($matches === []) { return false; }
        $used = $this->db->table('staff_mfa_counter_consumptions')->where('staff_id', $staff->id)
            ->where('mfa_version', $mfa->version)->whereIn('counter_step', $matches)->exists();
        if ($used) { return false; }
        foreach ($matches as $step) {
            $this->db->table('staff_mfa_counter_consumptions')->insert(['staff_id' => $staff->id,
                'mfa_version' => $mfa->version, 'counter_step' => $step, 'consumed_at' => $now]);
        }
        return true;
    }

    private function validSession(?object $row, StaffSessionContext $context, #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] ?string $csrf, CarbonImmutable $now, bool $full): bool
    {
        try { OpaqueToken::validateCanonicalBearer($cookie); } catch (\Throwable) { return false; }
        if (!$row || $row->id !== $context->sessionId || $row->revoked_at !== null
            || $row->auth_level !== ($full ? 'full' : 'anonymous') || ($full ? $row->staff_id !== $context->getStaffId() : $row->staff_id !== null)
            || !hash_equals($row->lookup_digest, OpaqueToken::digestOf($cookie))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($row->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($row->idle_expires_at))) { return false; }
        $payload = $this->payload($row);
        return isset($payload['csrf_token']) && is_string($payload['csrf_token'])
            && ($csrf === null ? $full : hash_equals($payload['csrf_token'], $csrf));
    }

    private function payload(object $row): array
    {
        try { $data = json_decode($this->encrypter->decrypt($row->encrypted_payload), true, 32, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { throw new StaffAuthenticationException(); }
        if (!is_array($data)) { throw new StaffAuthenticationException(); }
        return $data;
    }

    private function eligible(object $staff): bool
    {
        return $staff->status === 'active' && $staff->email_verified_at !== null && $staff->mfa_version !== null
            && $this->rbac->isValidRole($staff->role) && Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash);
    }

    private function credential(object $staff): ?object
    {
        $mfa = $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)
            ->where('version', $staff->mfa_version)->lockForUpdate()->first();
        return $mfa && $mfa->confirmed_at !== null && $mfa->revoked_at === null ? $mfa : null;
    }

    private function staffDto(object $staff): array
    {
        return ['id' => $staff->id, 'username' => $staff->username, 'email' => $staff->email,
            'role' => $staff->role, 'permissions' => $this->rbac->getPermissionsForRole($staff->role)];
    }

    private function charge(string $operation, array $dimensions): void
    {
        $result = $this->limiter->charge('staff', $operation, $dimensions);
        if (!$result->allowed) { throw new RateLimitExceededException($result->retryAfterSeconds); }
    }

    private function event(string $operation, string $staffId, string $requestId): void
    {
        $this->audit->record(AuditActor::staff($staffId), $operation, AuditOutcome::Success,
            AuditTargetType::StaffUser, $staffId, ['success' => true], $requestId, $this->db);
    }

    private function denied(string $operation, string $requestId): void
    {
        $this->audit->record(AuditActor::system(), $operation, AuditOutcome::Denied,
            AuditTargetType::StaffUser, null, ['reason_code' => 'invalid_credentials'], $requestId, $this->db);
    }

    private function ownTransaction(): void
    {
        if ($this->db->transactionLevel() !== 0) { throw new \LogicException('Staff actions must own their transaction.'); }
    }

    private function timeouts(): void
    {
        $this->db->statement("SET LOCAL lock_timeout = '3000ms'");
        $this->db->statement("SET LOCAL statement_timeout = '5000ms'");
    }

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->db->selectOne('SELECT clock_timestamp() AS now')->now);
    }
}
