<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityStaff;

use App\Identity\Mfa\{TotpSecret, TotpService};
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Identity\Sessions\StaffSessionStore;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class OptionalInitialMfaTest extends TestCase
{
    private const string PASSWORD = 'Synthetic-optional-staff-password';
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cors.allowed_origins' => ['https://127.0.0.1:5173']]);
    }

    private function staff(string $role = 'viewer', bool $enrolled = false, string $status = 'active'): object
    {
        $id = $this->trackStaffId((string) Str::uuid());
        self::$hash ??= $this->app->make(Argon2idPasswordHasher::class)->hash(self::PASSWORD, 'staff');
        DB::table('staff_users')->insert(['id' => $id, 'username' => 'optional-' . $id,
            'email' => $id . '@example.invalid', 'full_name_en' => 'Synthetic Staff', 'full_name_ar' => 'Synthetic',
            'password_hash' => $status === 'invited' ? null : self::$hash, 'role' => $role, 'status' => $status,
            'credential_epoch' => 1, 'email_verified_at' => $status === 'invited' ? null : DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'), 'updated_at' => DB::raw('UTC_TIMESTAMP(6)')]);
        $secret = TotpSecret::generate();
        if ($enrolled) {
            DB::table('staff_mfa_credentials')->insert(['staff_id' => $id, 'version' => 1,
                'encrypted_secret' => $this->app->make(Encrypter::class)->encrypt($secret->revealBase32Secret()),
                'confirmed_at' => DB::raw('UTC_TIMESTAMP(6)')]);
            DB::table('staff_users')->where('id', $id)->update(['mfa_version' => 1]);
        }
        return (object) ['id' => $id, 'username' => 'optional-' . $id, 'secret' => $secret];
    }

    private function staffSession(?string $cookie = null): array
    {
        $store = $this->app->make(StaffSessionStore::class);
        if ($cookie === null) { $cookie = $store->issueAnonymous()->getRawToken(); }
        $context = $store->read($cookie);
        $this->assertNotNull($context);
        return ['cookie' => $cookie, 'csrf' => $context->getCsrfToken(), 'id' => $context->sessionId];
    }

    private function request(string $method, string $path, array $session, ?array $body = null, ?string $pending = null): TestResponse
    {
        $this->flushHeaders();
        return $this->call($method, 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], [
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173', 'HTTP_COOKIE' => 'gza_staff_session=' . $session['cookie']
                . ($pending === null ? '' : '; gza_staff_pending=' . $pending),
            'HTTP_X_CSRF_TOKEN' => $session['csrf'], 'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json', 'REMOTE_ADDR' => '192.0.2.' . random_int(1, 190),
        ], $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR));
    }

    private function cookie(TestResponse $response, string $name): string
    {
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $name && $cookie->getValue() !== '') { return $cookie->getValue(); }
        }
        $this->fail('Expected session cookie missing.');
    }

    private function login(object $staff): array
    {
        $anonymous = $this->staffSession();
        $response = $this->request('POST', '/staff/login', $anonymous, ['username' => $staff->username, 'password' => self::PASSWORD]);
        $response->assertOk()->assertJsonPath('data.status', 'authenticated');
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($anonymous['cookie']));
        return $this->staffSession($this->cookie($response, 'gza_staff_session'));
    }

    public function test_password_only_session_has_honest_assurance_rotates_and_rejects_epoch_revocation_and_wrong_password(): void
    {
        $staff = $this->staff(); $full = $this->login($staff);
        $row = DB::table('staff_sessions')->where('id', $full['id'])->first();
        $this->assertSame('password', $row->assurance); $this->assertNotNull($row->password_verified_at);
        $this->assertNull($row->mfa_verified_at); $this->assertNull($row->mfa_version);
        $this->request('GET', '/staff/me', $full)->assertOk()->assertJsonPath('data.mfaEnabled', false);
        $this->request('GET', '/staff/sessions', $full)->assertOk();
        $rotated = $this->app->make(StaffSessionStore::class)->rotate($full['cookie']);
        $new = DB::table('staff_sessions')->where('id', $rotated->sessionId)->first();
        $this->assertSame($row->password_verified_at, $new->password_verified_at);
        $this->assertSame($row->absolute_expires_at, $new->absolute_expires_at);
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($full['cookie']));
        $this->request('POST', '/staff/login', $this->staffSession(), ['username' => $staff->username, 'password' => 'Incorrect-synthetic-password'])->assertStatus(401);
        DB::table('staff_users')->where('id', $staff->id)->increment('credential_epoch');
        $this->assertNull($this->app->make(StaffSessionStore::class)->read($rotated->getRawToken()));
        $next = $this->login($staff);
        DB::table('staff_sessions')->where('id', $next['id'])->update(['revoked_at' => DB::raw('UTC_TIMESTAMP(6)')]);
        $this->request('GET', '/staff/me', $next)->assertStatus(401);
    }

    public function test_invitation_acceptance_and_authenticated_optional_enrollment_require_password_and_totp(): void
    {
        $staff = $this->staff(status: 'invited'); $anonymous = $this->staffSession();
        $proof = $this->app->make(ProofService::class)->issue(ProofPurpose::StaffInvitation, $staff->id);
        $accepted = $this->request('POST', '/staff/invitations/accept', $anonymous,
            ['token' => $proof->getRawToken(), 'password' => self::PASSWORD]);
        $accepted->assertOk()->assertJsonPath('data.status', 'authenticated');
        $full = $this->staffSession($this->cookie($accepted, 'gza_staff_session'));
        $this->request('POST', '/staff/mfa/enrollment/setup', $this->staffSession(), ['currentPassword' => self::PASSWORD])->assertStatus(401);
        $this->request('POST', '/staff/mfa/enrollment/setup', $full, ['currentPassword' => 'Wrong-synthetic-password'])->assertStatus(401);
        $setup = $this->request('POST', '/staff/mfa/enrollment/setup', $full, ['currentPassword' => self::PASSWORD]);
        $setup->assertOk();
        $this->assertFalse(DB::table('staff_mfa_credentials')->where('staff_id', $staff->id)->exists());
        $this->request('GET', '/staff/me', $full)->assertOk()->assertJsonPath('data.mfaEnabled', false);
        $secret = TotpSecret::fromBase32($setup->json('data.secret'));
        $now = strtotime(DB::selectOne('SELECT UTC_TIMESTAMP(6) AS now')->now);
        $code = (new TotpService())->hotp($secret, intdiv($now, 30));
        $confirmed = $this->request('POST', '/staff/mfa/enrollment/confirm', $full, ['totpCode' => $code], $this->cookie($setup, 'gza_staff_pending'));
        $confirmed->assertOk()->assertJsonPath('data.enrolled', true);
        $this->assertCount(10, $confirmed->json('data.recoveryCodes'));
        $this->request('GET', '/staff/me', $full)->assertStatus(401);
        $mfa = $this->staffSession($this->cookie($confirmed, 'gza_staff_session'));
        $this->request('GET', '/staff/me', $mfa)->assertOk()->assertJsonPath('data.mfaEnabled', true);
        $this->request('POST', '/staff/mfa/enrollment/setup', $mfa, ['currentPassword' => self::PASSWORD])->assertStatus(401);
        $this->request('POST', '/staff/step-up', $mfa, ['currentPassword' => self::PASSWORD])->assertStatus(401);
        $this->request('POST', '/staff/step-up', $mfa, ['totpCode' => $code])->assertStatus(401); // enrollment counter cannot replay
    }

    public function test_enrolled_login_remains_pending_and_revoked_credentials_never_fall_back(): void
    {
        $staff = $this->staff(enrolled: true); $anonymous = $this->staffSession();
        $login = $this->request('POST', '/staff/login', $anonymous, ['username' => $staff->username, 'password' => self::PASSWORD]);
        $login->assertOk()->assertJsonPath('data.status', 'mfa_required');
        $this->request('GET', '/staff/me', $anonymous, pending: $this->cookie($login, 'gza_staff_pending'))->assertStatus(401);
        DB::table('staff_mfa_credentials')->where('staff_id', $staff->id)->update(['revoked_at' => DB::raw('UTC_TIMESTAMP(6)')]);
        $this->request('POST', '/staff/login', $this->staffSession(), ['username' => $staff->username, 'password' => self::PASSWORD])->assertStatus(401);
    }

    public function test_password_recent_auth_and_last_admin_protection(): void
    {
        $staff = $this->staff('admin'); $full = $this->login($staff);
        DB::table('staff_sessions')->where('id', $full['id'])->update(['password_verified_at' => DB::raw('UTC_TIMESTAMP(6) - INTERVAL 301 SECOND')]);
        $this->request('PATCH', '/staff/users/' . $staff->id, $full, ['role' => 'viewer'])->assertStatus(403);
        $this->request('POST', '/staff/step-up', $full, ['currentPassword' => 'Incorrect-synthetic-password'])->assertStatus(401);
        $this->request('POST', '/staff/step-up', $full, ['currentPassword' => self::PASSWORD])->assertOk();
        // This test owns the only active administrator in its disposable fixture database.
        $this->assertSame(1, (new \App\Identity\Directory\StaffEligibilityPredicate(DB::connection()))->countEligibleAdmins());
        $this->request('PATCH', '/staff/users/' . $staff->id, $full, ['role' => 'viewer'])->assertStatus(409)->assertJsonPath('error.code', 'last_admin_conflict');
    }
    public function test_concurrent_password_and_mfa_admin_self_demotions_preserve_one_eligible_admin(): void
    {
        $passwordAdmin = $this->staff('admin'); $passwordSession = $this->login($passwordAdmin);
        $mfaAdmin = $this->staff('admin', enrolled: true); $anonymous = $this->staffSession();
        $pending = $this->request('POST', '/staff/login', $anonymous, ['username' => $mfaAdmin->username, 'password' => self::PASSWORD]);
        $pending->assertOk()->assertJsonPath('data.status', 'mfa_required');
        $now = strtotime(DB::selectOne('SELECT UTC_TIMESTAMP(6) AS now')->now);
        $code = (new TotpService())->hotp($mfaAdmin->secret, intdiv($now, 30));
        $verified = $this->request('POST', '/staff/mfa/verify', $anonymous, ['totpCode' => $code], $this->cookie($pending, 'gza_staff_pending'));
        $verified->assertOk(); $mfaSession = $this->staffSession($this->cookie($verified, 'gza_staff_session'));
        $predicate = new \App\Identity\Directory\StaffEligibilityPredicate(DB::connection());
        $this->assertSame(2, $predicate->countEligibleAdmins());
        $inputs = [];
        foreach ([[$passwordAdmin, $passwordSession], [$mfaAdmin, $mfaSession]] as [$staff, $session]) {
            $inputs[] = ['operation' => 'patchStaffUser', 'input' => ['targetId' => $staff->id, 'patch' => ['role' => 'viewer']],
                'cookie' => $session['cookie'], 'csrf' => $session['csrf'], 'requestId' => (string) Str::uuid()];
        }
        $this->assertSame(['ACCEPTED', 'CONFLICT'], \Tests\Fixtures\IdentityStaff\StaffLifecycleRace::run($inputs));
        $this->assertSame(1, $predicate->countEligibleAdmins());
        $this->assertSame(1, DB::table('staff_users')->whereIn('id', [$passwordAdmin->id, $mfaAdmin->id])->where('role', 'admin')->count());
        $credential = DB::table('staff_mfa_credentials')->where('staff_id', $mfaAdmin->id)->where('version', 1)->first();
        $this->assertNotNull($credential->confirmed_at); $this->assertNull($credential->revoked_at);
    }

}
