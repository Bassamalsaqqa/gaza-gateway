<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityStaff;

use App\Identity\Audit\AuditWriter;
use App\Identity\Directory\StaffEligibilityPredicate;
use App\Identity\Mfa\{TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\StaffDirectoryCoordinator;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class StaffDirectoryTest extends TestCase
{
    private array $owners = [];
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp(); config(['cors.allowed_origins' => ['https://127.0.0.1:5173']]);
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        foreach ($this->owners as $id) {
            DB::table('staff_users')->where('id', $id)->update(['status' => 'suspended']);
            DB::table('staff_sessions')->where('staff_id', $id)->whereNull('revoked_at')->update(['revoked_at' => DB::raw('clock_timestamp()')]);
            $this->app->make(ProofService::class)->revokeAll(ProofPurpose::StaffInvitation, $id);
            $this->app->make(ProofService::class)->revokeAll(ProofPurpose::StaffPasswordReset, $id);
        }
        parent::tearDown();
    }

    private function staff(string $role = 'admin'): array
    {
        $this->assertDisposableDatabaseTarget(); $id = (string) Str::uuid(); $this->owners[] = $id;
        self::$hash ??= $this->app->make(Argon2idPasswordHasher::class)->hash('Synthetic-directory-password-2026', 'staff');
        DB::table('staff_users')->insert(['id' => $id, 'username' => 'directory-' . $id, 'email' => $id . '@example.invalid',
            'full_name_en' => 'Synthetic Staff', 'full_name_ar' => 'موظف تجريبي', 'password_hash' => self::$hash,
            'role' => $role, 'status' => 'invited', 'credential_epoch' => 1, 'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()')]);
        $secret = TotpSecret::generate();
        DB::table('staff_mfa_credentials')->insert(['staff_id' => $id, 'version' => 1,
            'encrypted_secret' => $this->app->make(Encrypter::class)->encrypt($secret->revealBase32Secret()), 'confirmed_at' => DB::raw('clock_timestamp()')]);
        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        $receipt = $this->app->make(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable());
        return ['owner' => $id, 'id' => $receipt->sessionId, 'cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken()];
    }

    private function request(string $method, string $path, array $session, ?array $input = null): TestResponse
    {
        $this->flushHeaders();
        return $this->call($method, 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], [
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090', 'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_staff_session=' . $session['cookie'], 'HTTP_X_CSRF_TOKEN' => $session['csrf'],
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::5',
        ], $input === null ? '' : json_encode($input, JSON_THROW_ON_ERROR));
    }

    private function inviteInput(): array
    {
        $id = (string) Str::uuid();
        return ['username' => 'invited-' . $id, 'email' => $id . '@example.invalid',
            'fullNameEn' => 'Invited Staff', 'fullNameAr' => 'موظف مدعو', 'role' => 'editor'];
    }

    public function test_directory_permissions_stepup_and_invitation_lifecycle_are_durable(): void
    {
        $admin = $this->staff(); $viewer = $this->staff('viewer'); $input = $this->inviteInput();
        $this->request('GET', '/staff/users', $viewer)->assertStatus(403);
        $this->request('POST', '/staff/users', $viewer, $input)->assertStatus(403);
        DB::table('staff_sessions')->where('id', $admin['id'])->update(['mfa_verified_at' => DB::raw("clock_timestamp() - interval '6 minutes'")]);
        $this->request('GET', '/staff/users', $admin)->assertStatus(200);
        $this->request('POST', '/staff/users', $admin, $input)->assertStatus(403);
        DB::table('staff_sessions')->where('id', $admin['id'])->update(['mfa_verified_at' => DB::raw('clock_timestamp()')]);
        $created = $this->request('POST', '/staff/users', $admin, $input);
        $created->assertStatus(201)->assertJsonPath('data.isActive', false)->assertJsonPath('data.mfaEnabled', false);
        $id = $created->json('data.id'); $this->owners[] = $id;
        $first = DB::table('staff_invitations')->where('staff_id', $id)->where('state', 'issued')->first();
        $this->assertSame(86400, strtotime($first->expires_at) - strtotime($first->issued_at));
        $this->assertSame(1, DB::table('security_dispatch_outbox')->where('staff_invitation_id', $first->id)->count());
        $this->request('POST', '/staff/users', $admin, $input)->assertStatus(409);
        $this->request('PATCH', '/staff/users/' . $id, $admin, ['isActive' => true])->assertStatus(409);
        $this->request('POST', '/staff/users/' . $id . '/invite/reissue', $admin)->assertStatus(200)->assertJsonPath('data.reissued', true);
        $this->assertSame('revoked', DB::table('staff_invitations')->where('id', $first->id)->value('state'));
        $this->request('POST', '/staff/users/' . $id . '/invite/revoke', $admin)->assertStatus(200)->assertJsonPath('data.revoked', true);
        $this->assertSame(0, DB::table('staff_invitations')->where('staff_id', $id)->where('state', 'issued')->count());
        $this->request('DELETE', '/staff/users/' . $id, $admin)->assertStatus(200)->assertJsonPath('data.deactivated', true);
        $this->request('DELETE', '/staff/users/' . $id, $admin)->assertStatus(200)->assertJsonPath('data.deactivated', false);
    }

    public function test_role_change_revokes_target_sessions_and_preserves_names_only_sessions(): void
    {
        $admin = $this->staff(); $target = $this->staff('editor');
        $this->request('PATCH', '/staff/users/' . $target['owner'], $admin, ['fullNameEn' => 'Updated Name'])->assertStatus(200);
        $this->assertSame(1, DB::table('staff_users')->where('id', $target['owner'])->value('credential_epoch'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($target['cookie']));
        $this->request('PATCH', '/staff/users/' . $target['owner'], $admin, ['role' => 'viewer'])->assertStatus(200);
        $this->assertSame(2, DB::table('staff_users')->where('id', $target['owner'])->value('credential_epoch'));
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($target['cookie']));
        $this->request('PATCH', '/staff/users/' . $target['owner'], $admin, ['fullNameAr' => ''])->assertStatus(422);
    }

    public function test_uncontracted_suspend_and_reactivate_aliases_fail_closed(): void
    {
        $admin = $this->staff(); $target = $this->staff('editor');
        // The accepted contract uses PATCH isActive; undocumented aliases have no policy.
        $this->request('POST', '/staff/users/' . $target['owner'] . '/suspend', $admin)->assertStatus(403);
        $this->request('POST', '/staff/users/' . $target['owner'] . '/reactivate', $admin)->assertStatus(403);
        $this->assertSame('active', DB::table('staff_users')->where('id', $target['owner'])->value('status'));
        $this->assertSame(1, DB::table('staff_users')->where('id', $target['owner'])->value('credential_epoch'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($target['cookie']));
    }

    public function test_concurrent_self_demotions_preserve_exactly_one_eligible_admin(): void
    {
        $eligibility = new StaffEligibilityPredicate(DB::connection());
        $this->assertSame(0, $eligibility->countEligibleAdmins(), 'Race requires no unrelated eligible admin; never mutate foreign fixtures.');
        $admins = [$this->staff(), $this->staff()]; $inputs = [];
        foreach ($admins as $session) {
            $inputs[] = ['operation' => 'patchStaffUser', 'input' => ['targetId' => $session['owner'], 'patch' => ['role' => 'viewer']],
                'cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'requestId' => (string) Str::uuid()];
        }
        $this->assertSame(['ACCEPTED', 'CONFLICT'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run($inputs));
        $this->assertSame(1, $eligibility->countEligibleAdmins());
        $remaining = DB::table('staff_users')->whereIn('id', array_column($admins, 'owner'))->where('role', 'admin')->first();
        $session = array_values(array_filter($admins, fn ($s) => $s['owner'] === $remaining->id))[0];
        $this->request('DELETE', '/staff/users/' . $remaining->id, $session)->assertStatus(409)->assertJsonPath('error.code', 'last_admin_conflict');
        $this->assertSame(1, $remaining->credential_epoch);
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($session['cookie']));
    }

    public function test_audit_failure_rolls_back_invitation_principal_proof_and_outbox(): void
    {
        $admin = $this->staff(); $input = $this->inviteInput();
        $context = $this->app->make(StaffSessionStore::class)->read($admin['cookie']);
        $audit = $this->createMock(AuditWriter::class);
        $audit->expects($this->once())->method('record')->willThrowException(new \RuntimeException('Synthetic audit failure'));
        $this->app->instance(AuditWriter::class, $audit); $this->app->forgetInstance(StaffDirectoryCoordinator::class);
        $proofCount = DB::table('staff_invitations')->count(); $outboxCount = DB::table('security_dispatch_outbox')->count();
        try {
            $this->app->make(StaffDirectoryCoordinator::class)->execute('postStaffUserInvite', $input, null, $context,
                $admin['cookie'], $admin['csrf'], '2001:db8:' . bin2hex(random_bytes(2)) . '::5', (string) Str::uuid());
            $this->fail('Expected audit failure.');
        } catch (\RuntimeException $error) { $this->assertSame('Synthetic audit failure', $error->getMessage()); }
        $this->assertFalse(DB::table('staff_users')->where('email', $input['email'])->exists());
        $this->assertSame($proofCount, DB::table('staff_invitations')->count());
        $this->assertSame($outboxCount, DB::table('security_dispatch_outbox')->count());
    }

    public function test_self_mfa_replacement_requires_stepup_and_retains_old_factor_until_confirmed(): void
    {
        $viewer = $this->staff('viewer');
        DB::table('staff_sessions')->where('id', $viewer['id'])->update(['mfa_verified_at' => DB::raw("clock_timestamp() - interval '6 minutes'")]);
        $this->request('POST', '/staff/mfa/setup', $viewer)->assertStatus(403);
        DB::table('staff_sessions')->where('id', $viewer['id'])->update(['mfa_verified_at' => DB::raw('clock_timestamp()')]);
        $setup = $this->request('POST', '/staff/mfa/setup', $viewer); $setup->assertStatus(200);
        $retry = $this->request('POST', '/staff/mfa/setup', $viewer); $retry->assertStatus(200);
        $this->assertTrue(hash_equals($setup->json('data.secret'), $retry->json('data.secret')));
        $this->assertSame(1, DB::table('staff_users')->where('id', $viewer['owner'])->value('mfa_version'));
        $this->assertNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 1)->value('revoked_at'));
        $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $code = (new TotpService())->hotp($secret, intdiv(strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now), 30));
        $this->request('POST', '/staff/mfa/setup/confirm', $viewer, ['totpCode' => $code])->assertStatus(200)
            ->assertJsonPath('data.confirmed', true)->assertJsonCount(10, 'data.recoveryCodes');
        $this->assertSame(2, DB::table('staff_users')->where('id', $viewer['owner'])->value('mfa_version'));
        $this->assertSame(2, DB::table('staff_users')->where('id', $viewer['owner'])->value('credential_epoch'));
        $this->assertNotNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 1)->value('revoked_at'));
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($viewer['cookie']));
        $this->request('POST', '/staff/mfa/setup/confirm', $viewer, ['totpCode' => $code])->assertStatus(401);
    }

    public function test_expired_and_exhausted_candidates_cannot_revoke_current_credential(): void
    {
        $viewer = $this->staff('viewer'); $setup = $this->request('POST', '/staff/mfa/setup', $viewer); $setup->assertStatus(200);
        $candidate = DB::table('staff_mfa_replacements')->where('staff_id', $viewer['owner'])->where('state', 'issued')->first();
        DB::table('staff_mfa_replacements')->where('id', $candidate->id)->update([
            'issued_at' => DB::raw("clock_timestamp() - interval '6 minutes'"), 'expires_at' => DB::raw("clock_timestamp() - interval '1 second'")]);
        $this->request('POST', '/staff/mfa/setup/confirm', $viewer, ['totpCode' => '000000'])->assertStatus(401);
        $new = $this->request('POST', '/staff/mfa/setup', $viewer); $new->assertStatus(200);
        $this->assertSame('', DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 2)->value('encrypted_secret'));
        $secret = TotpSecret::fromBase32($new->json('data.secret')); $totp = new TotpService();
        $now = strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now);
        foreach (['000000', '111111', '222222', '333333'] as $bad) { if ($totp->match($secret, $bad, $now) === []) { break; } }
        for ($i = 0; $i < 5; $i++) { $this->request('POST', '/staff/mfa/setup/confirm', $viewer, ['totpCode' => $bad])->assertStatus(401); }
        $this->assertSame('exhausted', DB::table('staff_mfa_replacements')->where('staff_id', $viewer['owner'])->where('candidate_version', 3)->value('state'));
        $this->assertSame('', DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 3)->value('encrypted_secret'));
        $this->assertNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 1)->value('revoked_at'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($viewer['cookie']));
    }

    public function test_recovery_regeneration_revokes_only_old_codes_without_changing_current_factor(): void
    {
        $viewer = $this->staff('viewer');
        $first = $this->request('POST', '/staff/mfa/recovery-codes/regenerate', $viewer); $first->assertStatus(200)->assertJsonCount(10, 'data.recoveryCodes');
        $second = $this->request('POST', '/staff/mfa/recovery-codes/regenerate', $viewer); $second->assertStatus(200)->assertJsonCount(10, 'data.recoveryCodes');
        $this->assertSame([], array_intersect($first->json('data.recoveryCodes'), $second->json('data.recoveryCodes')));
        $this->assertSame(10, DB::table('staff_mfa_recovery_codes')->where('staff_id', $viewer['owner'])->whereNull('revoked_at')->count());
        $this->assertSame(10, DB::table('staff_mfa_recovery_codes')->where('staff_id', $viewer['owner'])->whereNotNull('revoked_at')->count());
        foreach ($second->json('data.recoveryCodes') as $code) {
            $this->assertTrue(DB::table('staff_mfa_recovery_codes')->where('staff_id', $viewer['owner'])->where('code_digest', hash('sha256', $code))->exists());
        }
        $this->assertSame(1, DB::table('staff_users')->where('id', $viewer['owner'])->value('credential_epoch'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($viewer['cookie']));
    }

    public function test_mfa_confirmation_race_has_one_winner_and_one_epoch_change(): void
    {
        $viewer = $this->staff('viewer'); $setup = $this->request('POST', '/staff/mfa/setup', $viewer); $setup->assertStatus(200);
        $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $code = (new TotpService())->hotp($secret, intdiv(strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now), 30));
        $input = ['operation' => 'postStaffMfaSetupConfirm', 'input' => ['totpCode' => $code],
            'cookie' => $viewer['cookie'], 'csrf' => $viewer['csrf'], 'requestId' => (string) Str::uuid()];
        $other = $input; $other['requestId'] = (string) Str::uuid();
        $this->assertSame(['ACCEPTED', 'DENIED'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run([$input, $other]));
        $this->assertSame(2, DB::table('staff_users')->where('id', $viewer['owner'])->value('credential_epoch'));
        $this->assertSame(1, DB::table('staff_mfa_replacements')->where('staff_id', $viewer['owner'])->where('state', 'consumed')->count());
    }

    public function test_mfa_audit_failure_rolls_back_factor_epoch_and_session_revocation(): void
    {
        $viewer = $this->staff('viewer'); $setup = $this->request('POST', '/staff/mfa/setup', $viewer); $setup->assertStatus(200);
        $context = $this->app->make(StaffSessionStore::class)->read($viewer['cookie']);
        $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $code = (new TotpService())->hotp($secret, intdiv(strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now), 30));
        $audit = $this->createMock(AuditWriter::class);
        $audit->expects($this->once())->method('record')->willThrowException(new \RuntimeException('Synthetic MFA audit failure'));
        $this->app->instance(AuditWriter::class, $audit); $this->app->forgetInstance(StaffDirectoryCoordinator::class);
        try {
            $this->app->make(StaffDirectoryCoordinator::class)->execute('postStaffMfaSetupConfirm', ['totpCode' => $code], null,
                $context, $viewer['cookie'], $viewer['csrf'], '2001:db8:' . bin2hex(random_bytes(2)) . '::5', (string) Str::uuid());
            $this->fail('Expected audit failure.');
        } catch (\RuntimeException $error) { $this->assertSame('Synthetic MFA audit failure', $error->getMessage()); }
        $this->assertSame(1, DB::table('staff_users')->where('id', $viewer['owner'])->value('mfa_version'));
        $this->assertSame(1, DB::table('staff_users')->where('id', $viewer['owner'])->value('credential_epoch'));
        $this->assertNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 1)->value('revoked_at'));
        $this->assertNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 2)->value('confirmed_at'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($viewer['cookie']));
        $this->assertSame(0, DB::table('staff_mfa_counter_consumptions')->where('staff_id', $viewer['owner'])->count());
    }

    public function test_directory_rechecks_durable_epoch_after_admission_snapshot(): void
    {
        $admin = $this->staff(); $context = $this->app->make(StaffSessionStore::class)->read($admin['cookie']);
        DB::table('staff_users')->where('id', $admin['owner'])->update(['credential_epoch' => 2]);
        try {
            $this->app->make(StaffDirectoryCoordinator::class)->execute('postStaffUserInvite', $this->inviteInput(), null,
                $context, $admin['cookie'], $admin['csrf'], '2001:db8:' . bin2hex(random_bytes(2)) . '::5', (string) Str::uuid());
            $this->fail('Stale admission snapshot must not authorize directory mutation.');
        } catch (\App\Identity\Staff\StaffAuthenticationException) { $this->assertTrue(true); }
        $this->assertSame(0, DB::table('staff_invitations')->where('staff_id', $admin['owner'])->count());
    }

    public function test_directory_reads_and_mfa_setup_ignore_global_writer_and_history_locks(): void
    {
        $admin = $this->staff(); $unrelated = $this->staff('viewer');
        $anonymousReceipt = $this->app->make(StaffSessionStore::class)->issueAnonymous();
        $anonymous = ['cookie' => $anonymousReceipt->getRawToken(), 'csrf' => $anonymousReceipt->getCsrfToken(), 'id' => $anonymousReceipt->sessionId];
        $email = DB::table('staff_users')->where('id', $admin['owner'])->value('email');
        $blocker = \Tests\Fixtures\IdentityStaff\StaffHistoryBlocker::hold($admin['id'], true, $unrelated['owner']);
        try {
            $this->request('GET', '/staff/users', $admin)->assertStatus(200);
            $this->request('POST', '/staff/mfa/setup', $admin)->assertStatus(200);
            $this->request('POST', '/staff/mfa/recovery-codes/regenerate', $admin)->assertStatus(200)->assertJsonCount(10, 'data.recoveryCodes');
            $this->request('POST', '/staff/password/forgot', $anonymous, ['email' => $email])->assertStatus(202);
            // Eligibility mutations still require the separately held sentinel; no global-lock bypass.
            $this->request('PATCH', '/staff/users/' . $admin['owner'], $admin, ['role' => 'viewer'])->assertStatus(503);
            $this->assertSame('admin', DB::table('staff_users')->where('id', $admin['owner'])->value('role'));
        } finally { $blocker->rollBack(); DB::purge($blocker->getName()); }
        $blocker = \Tests\Fixtures\IdentityStaff\StaffHistoryBlocker::hold($admin['id']);
        try {
            $this->request('PATCH', '/staff/users/' . $admin['owner'], $admin, ['fullNameEn' => 'Updated Without History Lock'])->assertStatus(200);
            $this->request('GET', '/staff/users', $admin)->assertStatus(200);
        } finally { $blocker->rollBack(); DB::purge($blocker->getName()); }
    }

    public function test_bounded_cleanup_erases_expired_enrollment_and_replacement_only(): void
    {
        $viewer = $this->staff('viewer'); $this->request('POST', '/staff/mfa/setup', $viewer)->assertStatus(200);
        DB::table('staff_mfa_replacements')->where('staff_id', $viewer['owner'])->update([
            'issued_at' => DB::raw("clock_timestamp() - interval '6 minutes'"), 'expires_at' => DB::raw("clock_timestamp() - interval '1 second'")]);
        $anon = $this->app->make(StaffSessionStore::class)->issueAnonymous();
        DB::table('staff_pending_auth')->insert(['id' => (string) Str::uuid(), 'staff_id' => $viewer['owner'],
            'bound_session_id' => $anon->sessionId, 'token_digest' => hash('sha256', random_bytes(32)), 'purpose' => 'enroll_mfa',
            'credential_epoch' => 1, 'failed_attempts' => 0, 'state' => 'issued',
            'issued_at' => DB::raw("clock_timestamp() - interval '6 minutes'"), 'expires_at' => DB::raw("clock_timestamp() - interval '1 second'"),
            'encrypted_staged_secret' => $this->app->make(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret())]);
        $cleanup = new \App\Identity\Staff\StaffTransientCleanup(DB::connection());
        // Each call is bounded; old retained test fixtures may precede this owned pair.
        for ($i = 0; $i < 10; $i++) {
            $count = $cleanup->expire(100); $this->assertLessThanOrEqual(100, $count);
            if (!DB::table('staff_pending_auth')->where('staff_id', $viewer['owner'])->whereNotNull('encrypted_staged_secret')->exists()
                && DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 2)->value('encrypted_secret') === '') { break; }
        }
        $this->assertNull(DB::table('staff_pending_auth')->where('staff_id', $viewer['owner'])->value('encrypted_staged_secret'));
        $this->assertSame('expired', DB::table('staff_pending_auth')->where('staff_id', $viewer['owner'])->value('state'));
        $this->assertSame('', DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 2)->value('encrypted_secret'));
        $this->assertNull(DB::table('staff_mfa_credentials')->where('staff_id', $viewer['owner'])->where('version', 1)->value('revoked_at'));
        $this->assertNotNull($this->app->make(StaffSessionStore::class)->read($viewer['cookie']));
    }
}
