<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use App\Identity\Audit\{AuditActor, AuditOutcome, AuditTargetType, AuditWriter};
use App\Identity\Directory\StaffEligibilityPredicate;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Mfa\{RecoveryCodeBatch, TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Passenger\Exceptions\RateLimitExceededException;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\{StaffSessionContext, StaffSessionStore};
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/** Sentinel only for eligibility mutations, then exact principal/current/live authority. */
final class StaffLifecycleCoordinator
{
    public const OPERATIONS = ['postStaffPasswordForgot', 'postStaffPasswordReset', 'putStaffPassword',
        'postStaffInvitationAccept', 'postStaffMfaEnrollmentSetup', 'postStaffMfaEnrollmentConfirm'];
    private const string DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng';

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
        private readonly Argon2idPasswordHasher $hasher,
        private readonly StaffSessionStore $sessions,
        private readonly DurableRateLimiter $limiter,
        private readonly ProofService $proofs,
        private readonly OutboxService $outbox,
        private readonly AuditWriter $audit,
        private readonly RbacPolicy $rbac,
    ) {}

    public function execute(string $operation, #[\SensitiveParameter] array $input, StaffSessionContext $context,
        #[\SensitiveParameter] string $cookie, #[\SensitiveParameter] string $csrf,
        #[\SensitiveParameter] ?string $pendingCookie, string $ip, string $requestId): StaffOperationResult
    {
        if (!in_array($operation, self::OPERATIONS, true) || $this->db->transactionLevel() !== 0) {
            throw new \LogicException('Staff lifecycle requires a closed operation and owned transaction.');
        }
        if ($operation === 'postStaffMfaEnrollmentConfirm') {
            try { OpaqueToken::validateCanonicalBearer($pendingCookie ?? ''); }
            catch (\Throwable) { throw new StaffAuthenticationException(); }
        }
        $subject = $input['email'] ?? $input['token'] ?? $pendingCookie ?? $context->sessionId;
        $charge = $this->limiter->charge('staff', $operation === 'postStaffPasswordForgot' ? 'dispatch' : 'proof',
            ['subject' => $operation === 'postStaffPasswordForgot' ? strtolower(trim($subject)) : $subject, 'ip' => $ip]);
        if (!$charge->allowed) { throw new RateLimitExceededException($charge->retryAfterSeconds); }
        $newPassword = $input['newPassword'] ?? $input['password'] ?? null;
        $newHash = $newPassword === null ? null : $this->hasher->hash($newPassword, 'staff');
        if ($operation === 'postStaffPasswordForgot') { $this->hasher->verify('Synthetic-staff-recovery-work', self::DUMMY_HASH); }

        $result = $this->db->transaction(function () use ($operation, $input, $context, $cookie, $csrf, $pendingCookie, $requestId, $newHash) {
            \App\Support\DatabaseFailure::applyTimeouts($this->db, 5000, 3000);
            $purpose = $operation === 'postStaffInvitationAccept' ? ProofPurpose::StaffInvitation : ProofPurpose::StaffPasswordReset;
            $candidateProof = isset($input['token']) ? $this->db->table($purpose->table())->where('token_digest', hash('sha256', $input['token']))->first() : null;
            $candidatePending = $pendingCookie === null ? null : $this->db->table('staff_pending_auth')->where('token_digest', hash('sha256', $pendingCookie))->first();
            $staffId = match ($operation) {
                'postStaffPasswordForgot' => $this->db->table('staff_users')->where('normalized_email', strtolower(trim($input['email'])))->value('id'),
                'postStaffInvitationAccept', 'postStaffPasswordReset' => $candidateProof?->staff_id,
                'postStaffMfaEnrollmentSetup', 'postStaffMfaEnrollmentConfirm' => $context->getStaffId(),
                default => $context->getStaffId(),
            };
            $eligibleMutation = !in_array($operation, ['postStaffPasswordForgot', 'postStaffMfaEnrollmentSetup'], true);
            if ($eligibleMutation && !$this->db->table('staff_directory_control')->where('id', 1)->lockForUpdate()->first()) {
                throw new \LogicException('Staff directory sentinel is unavailable.');
            }
            $staff = $staffId === null ? null : $this->db->table('staff_users')->where('id', $staffId)->lockForUpdate()->first();
            $before = $eligibleMutation ? (new StaffEligibilityPredicate($this->db))->countEligibleAdmins() : 0;
            $revokes = in_array($operation, ['postStaffInvitationAccept', 'postStaffPasswordReset', 'putStaffPassword', 'postStaffMfaEnrollmentConfirm'], true);
            $locked = StaffAuthorityRows::lockSessions($this->db, $context->sessionId, $revokes ? $staffId : null);
            $session = $locked->firstWhere('id', $context->sessionId);
            $full = in_array($operation, ['putStaffPassword', 'postStaffMfaEnrollmentSetup', 'postStaffMfaEnrollmentConfirm'], true);
            $now = $this->now();
            if (!$this->validSession($session, $context, $cookie, $csrf, $now, $full)) { return null; }
            if ($full && (!$staff || !$this->validFullStaff($staff, $session, $now, $operation === 'putStaffPassword'))) { return null; }

            if ($operation === 'postStaffPasswordForgot') {
                if ($staff && $staff->status === 'active' && $staff->email_verified_at !== null) {
                    $receipt = $this->proofs->reissue(ProofPurpose::StaffPasswordReset, $staff->id, $this->db);
                    $this->outbox->enqueueProof($receipt, $this->db);
                }
                $this->event($operation, null, $requestId);
                return new StaffOperationResult(['status' => 'reset_dispatched',
                    'message' => 'If an eligible account exists, reset instructions have been queued for dispatch.']);
            }

            if (in_array($operation, ['postStaffInvitationAccept', 'postStaffPasswordReset'], true)) {
                if (!$staff || ($operation === 'postStaffInvitationAccept' ? $staff->status !== 'invited' : $staff->status !== 'active')) { return null; }
                $proof = $this->proofs->consume($purpose, $input['token'], $this->db);
                if (!$proof->isSuccess() || $proof->principalId !== $staff->id) { return null; }
                $this->revokeAuthority($staff->id, $now);
                $epoch = (int) $staff->credential_epoch + 1;
                $patch = ['password_hash' => $newHash, 'credential_epoch' => $epoch, 'updated_at' => $now];
                if ($operation === 'postStaffInvitationAccept') {
                    $patch += ['email_verified_at' => $now, 'status' => 'active'];
                }
                $this->db->table('staff_users')->where('id', $staff->id)->update($patch);
                $this->finish($operation, $staff->id, $requestId, $before);
                if ($operation === 'postStaffPasswordReset') {
                    $this->db->table('staff_sessions')->where('id', $session->id)->update(['revoked_at' => $now]);
                    return new StaffOperationResult(['reset' => true]);
                }
                $this->db->table('staff_sessions')->where('id', $session->id)->update(['revoked_at' => $now]);
                $receipt = $this->sessions->issuePassword($staff->id, $epoch, $now);
                return new StaffOperationResult(['status' => 'authenticated', 'expiresAt' => $receipt->absoluteExpiresAt->format(\DateTimeInterface::ATOM)], $receipt);
            }

            if ($operation === 'putStaffPassword') {
                if (!$this->hasher->verify($input['currentPassword'], $staff->password_hash)) { return null; }
                $this->db->table('staff_users')->where('id', $staff->id)->update([
                    'password_hash' => $newHash, 'credential_epoch' => (int) $staff->credential_epoch + 1, 'updated_at' => $now]);
                $this->revokeAuthority($staff->id, $now);
                $this->finish($operation, $staff->id, $requestId, $before);
                return new StaffOperationResult(['changed' => true]);
            }

            // Initial enrollment is available only from an authenticated own account.
            if (!$staff || $staff->mfa_version !== null || $session->assurance !== 'password'
                || $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)->whereNotNull('confirmed_at')->exists()) { return null; }
            if ($operation === 'postStaffMfaEnrollmentSetup') {
                if (!$this->hasher->verify($input['currentPassword'], $staff->password_hash)) { return null; }
                $this->db->table('staff_pending_auth')->where('bound_session_id', $session->id)->where('state', 'issued')
                    ->update(['state' => 'revoked', 'revoked_at' => $now, 'encrypted_staged_secret' => null]);
                $secret = TotpSecret::generate(); $token = OpaqueToken::generate('staff', 'enroll_mfa');
                $expires = $now->addSeconds(300)->min(CarbonImmutable::parse($session->absolute_expires_at));
                $id = (string) Str::uuid();
                $this->db->table('staff_pending_auth')->insert(['id' => $id, 'token_digest' => $token->getDigest(),
                    'state' => 'issued', 'issued_at' => $now, 'expires_at' => $expires, 'staff_id' => $staff->id,
                    'bound_session_id' => $session->id, 'purpose' => 'enroll_mfa', 'credential_epoch' => $staff->credential_epoch,
                    'failed_attempts' => 0, 'encrypted_staged_secret' => $this->encrypter->encrypt($secret->revealBase32Secret())]);
                $this->db->table('staff_sessions')->where('id', $session->id)->update(['password_verified_at' => $now]);
                return new StaffOperationResult(['secret' => $secret->revealBase32Secret(),
                    'qrCodeUri' => $this->qr($staff, $secret), 'expiresAt' => $expires->toIso8601String()], pendingToken: $token->getSecretToken(), challengeId: $id);
            }
            if (!$candidatePending || $candidatePending->staff_id !== $staff->id
                || !(new \App\Identity\Sessions\StaffSessionAuthority($this->db))->valid($staff, $session, $now, true)) { return null; }
            $pending = $this->db->table('staff_pending_auth')->where('id', $candidatePending->id)->lockForUpdate()->first();
            if (!$pending || $pending->state !== 'issued' || $pending->purpose !== 'enroll_mfa' || $pending->revoked_at !== null
                || $pending->consumed_at !== null || (int) $pending->failed_attempts >= 5 || $pending->bound_session_id !== $session->id
                || (int) $pending->credential_epoch !== (int) $staff->credential_epoch
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($pending->expires_at))) { return null; }
            $matches = [];
            if ($pending->encrypted_staged_secret !== null) {
                $secret = TotpSecret::fromBase32($this->encrypter->decrypt($pending->encrypted_staged_secret));
                $matches = (new TotpService())->match($secret, $input['totpCode'], $now->getTimestamp());
            }
            if ($matches === []) {
                $attempts = (int) $pending->failed_attempts + 1;
                $this->db->table('staff_pending_auth')->where('id', $pending->id)->update([
                    'failed_attempts' => $attempts, 'state' => $attempts >= 5 ? 'exhausted' : 'issued',
                    'encrypted_staged_secret' => $attempts >= 5 ? null : $pending->encrypted_staged_secret]);
                return null; // Commit the durable attempt denial.
            }
            $version = (int) $this->db->table('staff_mfa_credentials')->where('staff_id', $staff->id)->max('version') + 1;
            $this->db->table('staff_mfa_credentials')->insert(['staff_id' => $staff->id, 'version' => $version,
                'encrypted_secret' => $pending->encrypted_staged_secret, 'confirmed_at' => $now]);
            foreach ($matches as $step) {
                $this->db->table('staff_mfa_counter_consumptions')->insert(['staff_id' => $staff->id, 'mfa_version' => $version,
                    'counter_step' => $step, 'consumed_at' => $now]);
            }
            $this->db->table('staff_users')->where('id', $staff->id)->update(['status' => 'active', 'mfa_version' => $version, 'updated_at' => $now]);
            $codes = $this->recoveryCodes($staff->id, $version, $now);
            $this->db->table('staff_pending_auth')->where('id', $pending->id)->update([
                'state' => 'consumed', 'consumed_at' => $now, 'encrypted_staged_secret' => null]);
            $this->revokeAuthority($staff->id, $now);
            $receipt = $this->sessions->issueFull($staff->id, (int) $staff->credential_epoch, $version, $now);
            $this->finish($operation, $staff->id, $requestId, $before);
            return new StaffOperationResult(['enrolled' => true, 'recoveryCodes' => $codes,
                'user' => ['id' => $staff->id, 'username' => $staff->username, 'email' => $staff->email,
                    'role' => $staff->role, 'permissions' => $this->rbac->getPermissionsForRole($staff->role)]], $receipt);
        });
        return $result ?? throw new StaffAuthenticationException();
    }

    private function validSession(?object $session, StaffSessionContext $context, #[\SensitiveParameter] string $cookie,
        #[\SensitiveParameter] string $csrf, CarbonImmutable $now, bool $full): bool
    {
        try { OpaqueToken::validateCanonicalBearer($cookie); OpaqueToken::validateCanonicalBearer($csrf); }
        catch (\Throwable) { return false; }
        if (!$session || $session->auth_level !== ($full ? 'full' : 'anonymous') || $session->revoked_at !== null
            || ($full ? $session->staff_id !== $context->getStaffId() : $session->staff_id !== null)
            || !hash_equals($session->lookup_digest, OpaqueToken::digestOf($cookie))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->absolute_expires_at))
            || $now->greaterThanOrEqualTo(CarbonImmutable::parse($session->idle_expires_at))) { return false; }
        try { $payload = json_decode($this->encrypter->decrypt($session->encrypted_payload), true, 32, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { return false; }
        return is_array($payload) && is_string($payload['csrf_token'] ?? null) && hash_equals($payload['csrf_token'], $csrf);
    }

    private function validFullStaff(object $staff, object $session, CarbonImmutable $now, bool $recent): bool
    {
        return (new \App\Identity\Sessions\StaffSessionAuthority($this->db))->valid($staff, $session, $now, $recent);
    }

    private function revokeAuthority(string $id, CarbonImmutable $now): void
    {
        StaffAuthorityRows::revokeLiveSessions($this->db, $id, $now);
        $this->db->table('staff_pending_auth')->where('staff_id', $id)->where('state', 'issued')
            ->where('expires_at', '>', \App\Support\DatabaseClock::raw())
            ->update(['state' => 'revoked', 'revoked_at' => $now, 'encrypted_staged_secret' => null]);
        $this->proofs->revokeAll(ProofPurpose::StaffPasswordReset, $id, $this->db);
        $this->proofs->revokeAll(ProofPurpose::StaffInvitation, $id, $this->db);
        $replacements = $this->db->table('staff_mfa_replacements')->where('staff_id', $id)->where('state', 'issued')
            ->orderBy('id')->lockForUpdate()->get();
        foreach ($replacements as $row) {
            $this->db->table('staff_mfa_replacements')->where('id', $row->id)->update(['state' => 'revoked', 'revoked_at' => $now]);
            $this->db->table('staff_mfa_credentials')->where('staff_id', $id)->where('version', $row->candidate_version)
                ->whereNull('confirmed_at')->update(['encrypted_secret' => '', 'revoked_at' => $now]);
        }
    }

    private function recoveryCodes(string $staffId, int $version, CarbonImmutable $now): array
    {
        $batch = RecoveryCodeBatch::generate();
        foreach ($batch->getDigests() as $digest) {
            $this->db->table('staff_mfa_recovery_codes')->insert(['id' => (string) Str::uuid(), 'staff_id' => $staffId,
                'mfa_version' => $version, 'code_digest' => $digest]);
        }
        return $batch->revealPlaintextCodesForEnrollmentOnly();
    }

    private function finish(string $operation, string $staffId, string $requestId, int $before): void
    {
        $eligible = (new StaffEligibilityPredicate($this->db))->countEligibleAdmins();
        if ($before > 0 && $eligible < 1) { throw new LastAdminConflictException($eligible); }
        $this->event($operation, $staffId, $requestId);
    }

    private function event(string $operation, ?string $staffId, string $requestId): void
    {
        $this->audit->record($staffId === null ? AuditActor::system() : AuditActor::staff($staffId), $operation,
            AuditOutcome::Success, AuditTargetType::StaffUser, $staffId, ['success' => true], $requestId, $this->db);
    }

    private function qr(object $staff, TotpSecret $secret): string
    {
        return 'otpauth://totp/' . rawurlencode('Gaza Gateway:' . $staff->username) . '?secret='
            . $secret->revealBase32Secret() . '&issuer=Gaza%20Gateway&algorithm=SHA1&digits=6&period=30';
    }

    private function now(): CarbonImmutable
    {
        return \App\Support\DatabaseClock::now();
    }
}
