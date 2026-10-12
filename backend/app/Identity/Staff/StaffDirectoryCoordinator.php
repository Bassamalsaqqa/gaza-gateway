<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use App\Identity\Audit\{AuditActor, AuditOutcome, AuditTargetType, AuditWriter};
use App\Identity\Directory\StaffEligibilityPredicate;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Mfa\{RecoveryCodeBatch, TotpSecret, TotpService};
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Tokens\OpaqueToken;
use App\Support\DatabaseClock;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/** Sentinel -> principals ASC -> sessions ASC -> credentials/proofs -> audit. */
final class StaffDirectoryCoordinator
{
    public const OPERATIONS = ['getStaffUsersDirectory', 'postStaffUserInvite', 'patchStaffUser',
        'deleteStaffUser', 'postStaffUserInviteReissue', 'postStaffUserInviteRevoke',
        'postStaffMfaSetup', 'postStaffMfaSetupConfirm', 'postStaffMfaRecoveryCodesRegenerate'];
    private const MFA_OPERATIONS = ['postStaffMfaSetup', 'postStaffMfaSetupConfirm', 'postStaffMfaRecoveryCodesRegenerate'];
    public const DIRECTORY_LIMIT = 1000;

    public function __construct(private readonly ConnectionInterface $db, private readonly Encrypter $encrypter,
        private readonly DurableRateLimiter $limiter, private readonly ProofService $proofs,
        private readonly OutboxService $outbox, private readonly AuditWriter $audit, private readonly RbacPolicy $rbac) {}

    public function execute(string $operation, array $input, ?string $targetId, StaffSessionContext $context,
        #[\SensitiveParameter] string $cookie, #[\SensitiveParameter] ?string $csrf, string $ip, string $requestId): StaffOperationResult
    {
        if (!in_array($operation, self::OPERATIONS, true) || $this->db->transactionLevel() !== 0) {
            throw new \LogicException('Directory transition requires a closed operation and owned transaction.');
        }
        $write = $operation !== 'getStaffUsersDirectory';
        if ($write) {
            $charge = $this->limiter->charge('staff', 'proof', ['subject' => $context->getStaffId() ?? $context->sessionId, 'ip' => $ip]);
            if (!$charge->allowed) { throw new RateLimitExceededException($charge->retryAfterSeconds); }
        }
        $result = $this->db->transaction(function () use ($operation, $input, $targetId, $context, $cookie, $csrf, $requestId, $write) {
            \App\Support\DatabaseFailure::applyTimeouts($this->db, 5000, 3000);
            $mfa = in_array($operation, self::MFA_OPERATIONS, true);
            $eligibleMutation = $write && (!$mfa || $operation === 'postStaffMfaSetupConfirm');
            if ($eligibleMutation && !$this->db->table('staff_directory_control')->where('id', 1)->lockForUpdate()->first()) {
                throw new \LogicException('Staff directory sentinel is unavailable.');
            }
            $ids = array_values(array_filter([$context->getStaffId(), $targetId]));
            $principals = $this->db->table('staff_users')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $before = $eligibleMutation ? (new StaffEligibilityPredicate($this->db))->countEligibleAdmins() : 0;
            $actor = $principals->firstWhere('id', $context->getStaffId());
            $target = $targetId === null ? null : $principals->firstWhere('id', $targetId);
            $revokes = $operation === 'postStaffMfaSetupConfirm' ? $actor?->id
                : (in_array($operation, ['deleteStaffUser', 'postStaffUserInviteReissue', 'postStaffUserInviteRevoke'], true)
                    || ($operation === 'patchStaffUser' && (isset($input['role']) || array_key_exists('isActive', $input))) ? $target?->id : null);
            $sessions = StaffAuthorityRows::lockSessions($this->db, $context->sessionId, $revokes);
            $session = $sessions->firstWhere('id', $context->sessionId);
            $now = $this->now();
            $this->authorize($actor, $session, $cookie, $csrf, $now, $write, !$mfa);
            if ($mfa) {
                $result = $this->mfa($operation, $input, $actor, $session, $now);
                if ($result === null) { return null; } // Durable failed candidate attempt must commit.
                if ($eligibleMutation) {
                    $eligible = (new StaffEligibilityPredicate($this->db))->countEligibleAdmins();
                    if ($before > 0 && $eligible < 1) { throw new LastAdminConflictException($eligible); }
                }
                $this->audit->record(AuditActor::staff($actor->id), $operation, AuditOutcome::Success,
                    AuditTargetType::StaffUser, $actor->id, ['success' => true], $requestId, $this->db);
                return $result;
            }
            if ($operation === 'getStaffUsersDirectory') {
                $directory = $this->db->table('staff_users')->orderBy('id')->limit(self::DIRECTORY_LIMIT + 1)->get();
                if ($directory->count() > self::DIRECTORY_LIMIT) {
                    throw new \Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException(null, 'Staff directory exceeds the bounded projection capacity.');
                }
                return new StaffOperationResult($directory->map(fn ($row) => $this->dto($row))->all());
            }
            if ($operation !== 'postStaffUserInvite' && !$target) { throw new StaffDirectoryException(404, 'not_found'); }
            if ($operation === 'postStaffUserInvite') {
                $username = trim($input['username']); $email = strtolower(trim($input['email']));
                $en = trim($input['fullNameEn']); $ar = trim($input['fullNameAr']);
                if (mb_strlen($username) < 3 || mb_strlen($username) > 64 || strlen($email) > 255
                    || !filter_var($email, FILTER_VALIDATE_EMAIL)) { throw new \InvalidArgumentException('Invalid staff identity.'); }
                $this->validateNames($en, $ar);
                if (!$this->rbac->isValidRole($input['role'])) { throw new \InvalidArgumentException('Invalid staff role.'); }
                if ($this->db->table('staff_users')->where(fn ($q) => $q->where('username', $username)->orWhere('email', $email))->exists()) {
                    throw new StaffDirectoryException(409, 'conflict');
                }
                $targetId = (string) Str::uuid();
                $this->db->table('staff_users')->insert(['id' => $targetId, 'username' => $username, 'email' => $email,
                    'full_name_en' => $en, 'full_name_ar' => $ar, 'role' => $input['role'], 'status' => 'invited',
                    'credential_epoch' => 1, 'created_at' => $now, 'updated_at' => $now]);
                $proof = $this->proofs->issue(ProofPurpose::StaffInvitation, $targetId, $this->db, $actor->id);
                $this->outbox->enqueueProof($proof, $this->db);
                $data = $this->dto($this->db->table('staff_users')->where('id', $targetId)->first());
            } elseif ($operation === 'patchStaffUser') {
                $en = isset($input['fullNameEn']) ? trim($input['fullNameEn']) : $target->full_name_en;
                $ar = isset($input['fullNameAr']) ? trim($input['fullNameAr']) : $target->full_name_ar;
                $this->validateNames($en, $ar);
                $role = $input['role'] ?? $target->role;
                if (!$this->rbac->isValidRole($role)) { throw new \InvalidArgumentException('Invalid staff role.'); }
                $status = $target->status;
                if (array_key_exists('isActive', $input)) {
                    if ($input['isActive']) {
                        if (!$this->usable($target)) { throw new StaffDirectoryException(409, 'conflict'); }
                        $status = 'active';
                    } else { $status = 'suspended'; }
                }
                $authorityChanged = $role !== $target->role || $status !== $target->status;
                $this->db->table('staff_users')->where('id', $targetId)->update(['full_name_en' => $en, 'full_name_ar' => $ar,
                    'role' => $role, 'status' => $status, 'credential_epoch' => (int) $target->credential_epoch + (int) $authorityChanged,
                    'updated_at' => $now]);
                if ($authorityChanged) { $this->revoke($targetId, $now); }
                $data = $this->dto($this->db->table('staff_users')->where('id', $targetId)->first());
            } elseif ($operation === 'deleteStaffUser') {
                $changed = $target->status !== 'deactivated';
                if ($changed) {
                    $this->db->table('staff_users')->where('id', $targetId)->update(['status' => 'deactivated',
                        'credential_epoch' => (int) $target->credential_epoch + 1, 'updated_at' => $now]);
                    $this->revoke($targetId, $now);
                }
                $data = ['deactivated' => $changed];
            } else {
                if ($target->status !== 'invited') { throw new StaffDirectoryException(409, 'conflict'); }
                $this->db->table('staff_users')->where('id', $targetId)->update([
                    'credential_epoch' => (int) $target->credential_epoch + 1, 'updated_at' => $now]);
                $this->revoke($targetId, $now);
                if ($operation === 'postStaffUserInviteReissue') {
                    $proof = $this->proofs->issue(ProofPurpose::StaffInvitation, $targetId, $this->db, $actor->id);
                    $this->outbox->enqueueProof($proof, $this->db);
                    $data = ['reissued' => true, 'expiresAt' => $proof->expiresAt->toIso8601String()];
                } else { $data = ['revoked' => true]; }
            }
            $eligible = (new StaffEligibilityPredicate($this->db))->countEligibleAdmins();
            if ($before > 0 && $eligible < 1) { throw new LastAdminConflictException($eligible); }
            $this->audit->record(AuditActor::staff($actor->id), $operation, AuditOutcome::Success,
                AuditTargetType::StaffUser, $targetId, ['success' => true], $requestId, $this->db);
            return new StaffOperationResult($data);
        });
        return $result ?? throw new StaffAuthenticationException();
    }

    private function authorize(?object $actor, ?object $session, #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] ?string $csrf, CarbonImmutable $now, bool $write, bool $directory): void
    {
        try { OpaqueToken::validateCanonicalBearer($cookie); }
        catch (\Throwable) { throw new StaffAuthenticationException(); }
        if (!$actor || !$session || $session->staff_id !== $actor->id || $session->auth_level !== 'full' || $session->revoked_at !== null
            || !hash_equals($session->lookup_digest, OpaqueToken::digestOf($cookie)) || $actor->status !== 'active'
            || (int) $actor->credential_epoch !== (int) $session->credential_epoch
            || $actor->mfa_version === null || (int) $actor->mfa_version !== (int) $session->mfa_version
            || !$this->usable($actor) || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) { throw new StaffAuthenticationException(); }
        if ($directory && !$this->rbac->hasPermission($actor->role, 'admin.manage')) { throw new StaffDirectoryException(403, 'forbidden'); }
        if ($write) {
            try { $payload = json_decode($this->encrypter->decrypt($session->encrypted_payload), true, 32, JSON_THROW_ON_ERROR); }
            catch (\Throwable) { throw new StaffAuthenticationException(); }
            if (!is_string($csrf) || !is_string($payload['csrf_token'] ?? null) || !hash_equals($payload['csrf_token'], $csrf)) {
                throw new StaffAuthenticationException();
            }
            if ($session->mfa_verified_at === null || CarbonImmutable::parse($session->mfa_verified_at)->greaterThan($now)
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->mfa_verified_at)->addSeconds(300))) {
                throw new StaffDirectoryException(403, 'step_up_required');
            }
        }
    }

    private function mfa(string $operation, #[\SensitiveParameter] array $input, object $actor, object $session,
        CarbonImmutable $now): ?StaffOperationResult
    {
        $credentials = $this->db->table('staff_mfa_credentials')->where('staff_id', $actor->id)
            ->orderBy('version')->lockForUpdate()->get();
        $replacements = $this->db->table('staff_mfa_replacements')->where('staff_id', $actor->id)
            ->where('state', 'issued')->orderBy('id')->lockForUpdate()->get();
        if ($operation === 'postStaffMfaRecoveryCodesRegenerate') {
            return new StaffOperationResult(['recoveryCodes' => $this->newRecoveryCodes($actor->id, (int) $actor->mfa_version, $now)]);
        }
        $candidate = $replacements->first(fn ($row) => $row->session_id === $session->id
            && (int) $row->prior_version === (int) $actor->mfa_version && (int) $row->failed_attempts < 5
            && $row->revoked_at === null && $row->consumed_at === null
            && CarbonImmutable::parse($row->step_up_at)->equalTo(CarbonImmutable::parse($session->mfa_verified_at))
            && $now->lessThan(CarbonImmutable::parse($row->expires_at)));
        if ($operation === 'postStaffMfaSetup') {
            if ($candidate) {
                $row = $credentials->firstWhere('version', $candidate->candidate_version);
                if (!$row || $row->confirmed_at !== null || $row->revoked_at !== null) { return null; }
                $secret = TotpSecret::fromBase32($this->encrypter->decrypt($row->encrypted_secret));
            } else {
                foreach ($replacements as $old) { $this->discardCandidate($old, $now, 'revoked'); }
                $secret = TotpSecret::generate(); $version = (int) $credentials->max('version') + 1;
                $this->db->table('staff_mfa_credentials')->insert(['staff_id' => $actor->id, 'version' => $version,
                    'encrypted_secret' => $this->encrypter->encrypt($secret->revealBase32Secret())]);
                $token = OpaqueToken::generate('staff', 'staff_mfa_replacement');
                $expires = $now->addSeconds(300)->min(CarbonImmutable::parse($session->mfa_verified_at)->addSeconds(300))
                    ->min(CarbonImmutable::parse($session->absolute_expires_at))->min(CarbonImmutable::parse($session->idle_expires_at));
                $this->db->table('staff_mfa_replacements')->insert(['id' => (string) Str::uuid(), 'staff_id' => $actor->id,
                    'session_id' => $session->id, 'token_digest' => $token->getDigest(), 'state' => 'issued', 'issued_at' => $now,
                    'expires_at' => $expires, 'prior_version' => $actor->mfa_version, 'candidate_version' => $version,
                    'step_up_at' => $session->mfa_verified_at, 'failed_attempts' => 0]);
            }
            return new StaffOperationResult(['secret' => $secret->revealBase32Secret(), 'qrCodeUri' =>
                'otpauth://totp/' . rawurlencode('Gaza Gateway:' . $actor->username) . '?secret='
                . $secret->revealBase32Secret() . '&issuer=Gaza%20Gateway&algorithm=SHA1&digits=6&period=30']);
        }
        if (!$candidate) { return null; }
        $credential = $credentials->firstWhere('version', $candidate->candidate_version);
        if (!$credential || $credential->confirmed_at !== null || $credential->revoked_at !== null) { return null; }
        $secret = TotpSecret::fromBase32($this->encrypter->decrypt($credential->encrypted_secret));
        $matches = (new TotpService())->match($secret, $input['totpCode'], $now->getTimestamp());
        if ($matches === []) {
            $attempts = (int) $candidate->failed_attempts + 1;
            $this->db->table('staff_mfa_replacements')->where('id', $candidate->id)->update(['failed_attempts' => $attempts]);
            if ($attempts >= 5) { $this->discardCandidate($candidate, $now, 'exhausted'); }
            return null;
        }
        foreach ($matches as $step) {
            $this->db->table('staff_mfa_counter_consumptions')->insert(['staff_id' => $actor->id,
                'mfa_version' => $candidate->candidate_version, 'counter_step' => $step, 'consumed_at' => $now]);
        }
        $this->db->table('staff_mfa_credentials')->where('staff_id', $actor->id)->where('version', $candidate->candidate_version)
            ->update(['confirmed_at' => $now]);
        $this->db->table('staff_mfa_replacements')->where('id', $candidate->id)->update(['state' => 'consumed', 'consumed_at' => $now]);
        foreach ($replacements as $other) { if ($other->id !== $candidate->id) { $this->discardCandidate($other, $now, 'revoked'); } }
        $this->db->table('staff_users')->where('id', $actor->id)->update(['mfa_version' => $candidate->candidate_version,
            'credential_epoch' => (int) $actor->credential_epoch + 1, 'updated_at' => $now]);
        $this->db->table('staff_mfa_credentials')->where('staff_id', $actor->id)->where('version', $actor->mfa_version)
            ->update(['revoked_at' => $now, 'encrypted_secret' => '']);
        $codes = $this->newRecoveryCodes($actor->id, (int) $candidate->candidate_version, $now);
        // The replacement is consumed before general authority invalidation.
        $this->revoke($actor->id, $now);
        return new StaffOperationResult(['confirmed' => true, 'recoveryCodes' => $codes]);
    }

    private function discardCandidate(object $row, CarbonImmutable $now, string $state): void
    {
        $this->db->table('staff_mfa_replacements')->where('id', $row->id)->update(['state' => $state,
            'revoked_at' => $state === 'revoked' ? $now : null]);
        $this->db->table('staff_mfa_credentials')->where('staff_id', $row->staff_id)->where('version', $row->candidate_version)
            ->whereNull('confirmed_at')->update(['revoked_at' => $now, 'encrypted_secret' => '']);
    }

    private function newRecoveryCodes(string $id, int $version, CarbonImmutable $now): array
    {
        $this->db->table('staff_mfa_recovery_codes')->where('staff_id', $id)->whereNull('consumed_at')->whereNull('revoked_at')
            ->update(['revoked_at' => $now]);
        $batch = RecoveryCodeBatch::generate();
        foreach ($batch->getDigests() as $digest) {
            $this->db->table('staff_mfa_recovery_codes')->insert(['id' => (string) Str::uuid(), 'staff_id' => $id,
                'mfa_version' => $version, 'code_digest' => $digest]);
        }
        return $batch->revealPlaintextCodesForEnrollmentOnly();
    }

    private function usable(object $staff): bool
    {
        $credential = $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)->where('version', $staff->mfa_version)->first();
        return $staff->email_verified_at !== null && Argon2idPasswordHasher::isValidStoredHashStructure($staff->password_hash)
            && $credential && $credential->confirmed_at !== null && $credential->revoked_at === null;
    }

    private function revoke(string $id, CarbonImmutable $now): void
    {
        StaffAuthorityRows::revokeLiveSessions($this->db, $id, $now);
        $this->db->table('staff_pending_auth')->where('staff_id', $id)->where('state', 'issued')
            ->where('expires_at', '>', DatabaseClock::raw())
            ->update(['state' => 'revoked', 'revoked_at' => $now, 'encrypted_staged_secret' => null]);
        $this->proofs->revokeAll(ProofPurpose::StaffInvitation, $id, $this->db);
        $this->proofs->revokeAll(ProofPurpose::StaffPasswordReset, $id, $this->db);
        $replacements = $this->db->table('staff_mfa_replacements')->where('staff_id', $id)->where('state', 'issued')
            ->orderBy('id')->lockForUpdate()->get();
        foreach ($replacements as $row) { $this->discardCandidate($row, $now, 'revoked'); }
    }

    private function dto(object $staff): array
    {
        $credential = $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)->where('version', $staff->mfa_version)->first();
        return ['id' => $staff->id, 'username' => $staff->username, 'email' => $staff->email,
            'fullNameEn' => $staff->full_name_en, 'fullNameAr' => $staff->full_name_ar, 'role' => $staff->role,
            'isActive' => $staff->status === 'active', 'mfaEnabled' => $credential !== null && $credential->confirmed_at !== null && $credential->revoked_at === null,
            'createdAt' => CarbonImmutable::parse($staff->created_at)->toIso8601String()];
    }

    private function validateNames(string $en, string $ar): void
    {
        if ($en === '' || $ar === '' || mb_strlen($en) > 128 || mb_strlen($ar) > 128) {
            throw new \InvalidArgumentException('Invalid staff name.');
        }
    }

    private function now(): CarbonImmutable
    {
        return \App\Support\DatabaseClock::now();
    }
}
