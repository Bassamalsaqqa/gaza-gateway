<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityStaff;

use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Mfa\{TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\{StaffLifecycleCoordinator, StaffAuthenticationException};
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class StaffLifecycleTest extends TestCase
{
    private array $owners = [];
    private const string PASSWORD = 'Synthetic-staff-password-2026';
    private const string NEW_PASSWORD = 'Replacement-staff-password-2026';
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp(); config(['cors.allowed_origins' => ['https://127.0.0.1:5173']]);
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        foreach ($this->owners as $id) {
            $this->app->make(ProofService::class)->revokeAll(ProofPurpose::StaffInvitation, $id);
            $this->app->make(ProofService::class)->revokeAll(ProofPurpose::StaffPasswordReset, $id);
            DB::table('staff_pending_auth')->where('staff_id', $id)->where('state', 'issued')
                ->update(['state' => 'revoked', 'revoked_at' => DB::raw('clock_timestamp()'), 'encrypted_staged_secret' => null]);
            DB::table('staff_sessions')->where('staff_id', $id)->whereNull('revoked_at')->update(['revoked_at' => DB::raw('clock_timestamp()')]);
        }
        parent::tearDown();
    }

    private function staff(bool $active = false): object
    {
        $this->assertDisposableDatabaseTarget(); $id = (string) Str::uuid(); $this->owners[] = $id;
        self::$hash ??= $this->app->make(Argon2idPasswordHasher::class)->hash(self::PASSWORD, 'staff');
        DB::table('staff_users')->insert(['id' => $id, 'username' => 'lifecycle-' . $id, 'email' => $id . '@example.invalid',
            'full_name_en' => 'Synthetic Staff', 'full_name_ar' => 'موظف تجريبي', 'password_hash' => $active ? self::$hash : null,
            'role' => 'viewer', 'status' => 'invited', 'credential_epoch' => 1,
            'email_verified_at' => $active ? DB::raw('clock_timestamp()') : null,
            'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()')]);
        if ($active) {
            $secret = TotpSecret::generate();
            DB::table('staff_mfa_credentials')->insert(['staff_id' => $id, 'version' => 1,
                'encrypted_secret' => $this->app->make(Encrypter::class)->encrypt($secret->revealBase32Secret()), 'confirmed_at' => DB::raw('clock_timestamp()')]);
            DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        }
        return DB::table('staff_users')->where('id', $id)->first();
    }

    private function anonymous(): array
    {
        return $this->receipt($this->app->make(StaffSessionStore::class)->issueAnonymous());
    }

    private function receipt($receipt): array
    {
        return ['cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken(), 'id' => $receipt->sessionId];
    }

    private function request(string $method, string $path, array $session, ?array $input = null, ?string $pending = null): TestResponse
    {
        $this->flushHeaders();
        return $this->call($method, 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], [
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090', 'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_staff_session=' . $session['cookie'] . ($pending === null ? '' : '; gza_staff_pending=' . $pending),
            'HTTP_X_CSRF_TOKEN' => $session['csrf'], 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::4',
        ], $input === null ? '' : json_encode($input, JSON_THROW_ON_ERROR));
    }

    private function cookie(TestResponse $response, string $name): string
    {
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $name) { return $cookie->getValue(); }
        }
        $this->fail('Required cookie missing.');
    }

    private function invitation(object $staff, array $session): array
    {
        $proof = $this->app->make(ProofService::class)->issue(ProofPurpose::StaffInvitation, $staff->id);
        $response = $this->request('POST', '/staff/invitations/accept', $session,
            ['token' => $proof->getRawToken(), 'password' => self::PASSWORD]);
        $response->assertStatus(200)->assertJsonPath('data.status', 'enrollment_required');
        return ['cookie' => $this->cookie($response, 'gza_staff_pending'), 'proof' => $proof];
    }

    public function test_invitation_then_enrollment_grants_full_authority_only_after_fresh_totp(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->invitation($staff, $session);
        $this->request('GET', '/staff/me', $session, null, $pending['cookie'])->assertStatus(401);
        $setup = $this->request('POST', '/staff/mfa/enrollment/setup', $session, null, $pending['cookie']);
        $setup->assertStatus(200)->assertJsonStructure(['data' => ['secret', 'qrCodeUri', 'expiresAt']]);
        $secondSetup = $this->request('POST', '/staff/mfa/enrollment/setup', $session, null, $pending['cookie']);
        $secondSetup->assertStatus(200);
        $this->assertTrue(hash_equals($setup->json('data.secret'), $secondSetup->json('data.secret')), 'Retry must not replace staged secret.');
        $this->assertSame($setup->json('data.expiresAt'), $secondSetup->json('data.expiresAt'));
        $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $now = strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now);
        $code = (new TotpService())->hotp($secret, intdiv($now, 30));
        $bad = $code === '000000' ? '111111' : '000000';
        $this->request('POST', '/staff/mfa/enrollment/confirm', $session, ['totpCode' => $bad], $pending['cookie'])->assertStatus(401);
        $this->assertSame(1, DB::table('staff_pending_auth')->where('staff_id', $staff->id)->value('failed_attempts'));
        $confirm = $this->request('POST', '/staff/mfa/enrollment/confirm', $session, ['totpCode' => $code], $pending['cookie']);
        $confirm->assertStatus(200)->assertJsonPath('data.enrolled', true)->assertJsonCount(10, 'data.recoveryCodes');
        $this->assertSame('active', DB::table('staff_users')->where('id', $staff->id)->value('status'));
        $this->assertSame(10, DB::table('staff_mfa_recovery_codes')->where('staff_id', $staff->id)->count());
        $this->assertNull(DB::table('staff_pending_auth')->where('staff_id', $staff->id)->value('encrypted_staged_secret'));
        $this->assertNotNull(DB::table('staff_sessions')->where('id', $session['id'])->value('revoked_at'));
        $fullCookie = $this->cookie($confirm, 'gza_staff_session');
        $context = $this->app->make(StaffSessionStore::class)->read($fullCookie);
        $this->assertTrue($context?->isFull());
        $this->request('POST', '/staff/mfa/enrollment/confirm', $session, ['totpCode' => $code], $pending['cookie'])->assertStatus(401);
        $this->assertSame(1, DB::table('staff_sessions')->where('staff_id', $staff->id)->count());
    }

    public function test_staff_recovery_is_generic_and_reset_revokes_sessions_and_replay(): void
    {
        $staff = $this->staff(true); $anonymous = $this->anonymous();
        $old = $this->app->make(StaffSessionStore::class)->issueFull($staff->id, 1, 1, new \DateTimeImmutable());
        $known = $this->request('POST', '/staff/password/forgot', $anonymous, ['email' => $staff->email]);
        $unknown = $this->request('POST', '/staff/password/forgot', $anonymous, ['email' => Str::uuid() . '@example.invalid']);
        $known->assertStatus(202); $unknown->assertStatus(202); $this->assertSame($known->json('data'), $unknown->json('data'));
        $proof = DB::table('staff_password_resets')->where('staff_id', $staff->id)->where('state', 'issued')->first();
        $outbox = DB::table('security_dispatch_outbox')->where('staff_reset_id', $proof->id)->first();
        $this->assertNotNull($outbox);
        $token = OutboxPayload::fromJson($this->app->make(Encrypter::class)->decrypt($outbox->encrypted_payload))->getTokenOrCode();
        $reset = $this->request('POST', '/staff/password/reset', $anonymous, ['token' => $token, 'newPassword' => self::NEW_PASSWORD]);
        $reset->assertStatus(200)->assertJsonPath('data.reset', true);
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($old->getRawToken()));
        $current = DB::table('staff_users')->where('id', $staff->id)->first();
        $this->assertSame(2, $current->credential_epoch);
        $this->assertTrue($this->app->make(Argon2idPasswordHasher::class)->verify(self::NEW_PASSWORD, $current->password_hash));
        $this->request('POST', '/staff/password/reset', $this->anonymous(), ['token' => $token, 'newPassword' => self::NEW_PASSWORD])->assertStatus(401);
    }

    public function test_password_change_requires_fresh_stepup_and_revokes_current_session(): void
    {
        $staff = $this->staff(true); $store = $this->app->make(StaffSessionStore::class);
        $receipt = $store->issueFull($staff->id, 1, 1, new \DateTimeImmutable()); $full = $this->receipt($receipt);
        DB::table('staff_sessions')->where('id', $receipt->sessionId)->update(['mfa_verified_at' => DB::raw("clock_timestamp() - INTERVAL '301 seconds'")]);
        $this->request('PUT', '/staff/password', $full, ['currentPassword' => self::PASSWORD, 'newPassword' => self::NEW_PASSWORD])->assertStatus(403);
        DB::table('staff_sessions')->where('id', $receipt->sessionId)->update(['mfa_verified_at' => DB::raw('clock_timestamp()')]);
        $this->request('PUT', '/staff/password', $full, ['currentPassword' => 'wrong', 'newPassword' => self::NEW_PASSWORD])->assertStatus(401);
        $this->request('PUT', '/staff/password', $full, ['currentPassword' => self::PASSWORD, 'newPassword' => self::NEW_PASSWORD])
            ->assertStatus(200)->assertJsonPath('data.changed', true);
        $this->assertNull($store->read($receipt->getRawToken()));
        $this->assertSame(2, DB::table('staff_users')->where('id', $staff->id)->value('credential_epoch'));
    }

    public function test_stale_context_cannot_change_password_after_csrf_mutation(): void
    {
        $staff = $this->staff(true); $store = $this->app->make(StaffSessionStore::class);
        $receipt = $store->issueFull($staff->id, 1, 1, new \DateTimeImmutable()); $context = $store->read($receipt->getRawToken());
        $row = DB::table('staff_sessions')->where('id', $receipt->sessionId)->first();
        $payload = json_decode($this->app->make(Encrypter::class)->decrypt($row->encrypted_payload), true);
        $payload['csrf_token'] = \App\Identity\Tokens\OpaqueToken::generate('staff', 'csrf')->getSecretToken();
        DB::table('staff_sessions')->where('id', $row->id)->update(['encrypted_payload' => $this->app->make(Encrypter::class)->encrypt(json_encode($payload))]);
        try {
            $this->app->make(StaffLifecycleCoordinator::class)->execute('putStaffPassword',
                ['currentPassword' => self::PASSWORD, 'newPassword' => self::NEW_PASSWORD], $context,
                $receipt->getRawToken(), $receipt->getCsrfToken(), null, '192.0.2.188', (string) Str::uuid());
            $this->fail('Stale CSRF authority was accepted.');
        } catch (StaffAuthenticationException) { $this->assertTrue(true); }
        $this->assertSame(1, DB::table('staff_users')->where('id', $staff->id)->value('credential_epoch'));
        $this->assertNull(DB::table('staff_sessions')->where('id', $row->id)->value('revoked_at'));
    }

    public function test_invitation_replay_has_one_winner_with_distinct_sessions_and_processes(): void
    {
        $staff = $this->staff(); $proof = $this->app->make(ProofService::class)->issue(ProofPurpose::StaffInvitation, $staff->id);
        $inputs = [];
        foreach ([$this->anonymous(), $this->anonymous()] as $session) {
            $inputs[] = ['operation' => 'postStaffInvitationAccept', 'input' => ['token' => $proof->getRawToken(), 'password' => self::PASSWORD],
                'cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'requestId' => (string) Str::uuid()];
        }
        $this->assertSame(['ACCEPTED', 'DENIED'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run($inputs));
        $this->assertSame(2, DB::table('staff_users')->where('id', $staff->id)->value('credential_epoch'));
        $this->assertSame(1, DB::table('staff_pending_auth')->where('staff_id', $staff->id)->where('state', 'issued')->count());
        $this->assertSame('consumed', DB::table('staff_invitations')->where('id', $proof->proofId)->value('state'));
    }

    public function test_password_reset_replay_has_one_winner_with_distinct_sessions_and_processes(): void
    {
        $staff = $this->staff(true); $proof = $this->app->make(ProofService::class)->issue(ProofPurpose::StaffPasswordReset, $staff->id);
        $inputs = [];
        foreach ([$this->anonymous(), $this->anonymous()] as $session) {
            $inputs[] = ['operation' => 'postStaffPasswordReset', 'input' => ['token' => $proof->getRawToken(), 'newPassword' => self::NEW_PASSWORD],
                'cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'requestId' => (string) Str::uuid()];
        }
        $this->assertSame(['ACCEPTED', 'DENIED'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run($inputs));
        $this->assertSame(2, DB::table('staff_users')->where('id', $staff->id)->value('credential_epoch'));
        $this->assertSame('consumed', DB::table('staff_password_resets')->where('id', $proof->proofId)->value('state'));
    }

    public function test_enrollment_failed_attempts_exhaust_and_erase_staged_secret(): void
    {
        $staff = $this->staff(); $session = $this->anonymous(); $pending = $this->invitation($staff, $session);
        $setup = $this->request('POST', '/staff/mfa/enrollment/setup', $session, null, $pending['cookie']);
        $setup->assertStatus(200); $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $now = strtotime(DB::selectOne('SELECT clock_timestamp() AS now')->now);
        foreach (['000000', '111111', '222222', '333333'] as $bad) {
            if ((new TotpService())->match($secret, $bad, $now) === []) { break; }
        }
        for ($i = 0; $i < 5; $i++) {
            $this->request('POST', '/staff/mfa/enrollment/confirm', $session, ['totpCode' => $bad], $pending['cookie'])->assertStatus(401);
        }
        $row = DB::table('staff_pending_auth')->where('staff_id', $staff->id)->first();
        $this->assertSame('exhausted', $row->state); $this->assertSame(5, $row->failed_attempts);
        $this->assertNull($row->encrypted_staged_secret);
        $this->assertSame('pending_enrollment', DB::table('staff_users')->where('id', $staff->id)->value('status'));
        $this->assertSame(0, DB::table('staff_mfa_credentials')->where('staff_id', $staff->id)->count());
    }
}
