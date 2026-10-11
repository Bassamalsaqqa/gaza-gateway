<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PassengerAuthFeatureTest extends TestCase
{
    /** @var list<string> */
    private array $trackedUserIds = [];

    /** @var list<string> */
    private array $trackedSessionIds = [];

    /** @var list<string> */
    private array $trackedOutboxIds = [];

    /** @var list<string> */
    private array $trackedSubjectDigests = [];

    /** @var list<string> */
    private array $trackedIps = [];

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();

        // Authentic bounded cleanup targeting non-immutable test records
        if (!empty($this->trackedUserIds) || !empty($this->trackedSessionIds) || !empty($this->trackedOutboxIds)) {
            // 1. Clean outbox entries tracked directly or through proof FKs
            if (!empty($this->trackedOutboxIds)) {
                DB::table('security_dispatch_outbox')->whereIn('id', $this->trackedOutboxIds)->delete();
            }

            if (!empty($this->trackedUserIds)) {
                $verifProofIds = DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();
                $resetProofIds = DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();

                if (!empty($verifProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_verification_id', $verifProofIds)->delete();
                }
                if (!empty($resetProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_reset_id', $resetProofIds)->delete();
                }

                // 2. Clean proof records
                DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->delete();
                DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            // 3. Clean passenger sessions
            if (!empty($this->trackedSessionIds) || !empty($this->trackedUserIds)) {
                DB::table('passenger_sessions')
                    ->where(function ($query) {
                        if (!empty($this->trackedSessionIds)) {
                            $query->whereIn('id', $this->trackedSessionIds);
                        }
                        if (!empty($this->trackedUserIds)) {
                            $query->orWhereIn('user_id', $this->trackedUserIds);
                        }
                    })
                    ->delete();
            }

            // 4. Clean passenger profiles
            if (!empty($this->trackedUserIds)) {
                DB::table('passenger_profiles')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            // 5. Note on security_rate_limits and admission residue:
            // Admission records and rate limit counters in security_rate_limits represent expiring admission residue.
            // Shared rate limit counters are bounded by time windows (window_end) and cleaned up via maintenance;
            // shared counters are never deleted manually during teardown to avoid race conditions or counter corruption.

            // 6. Note on audit_events and users:
            // audit_events is append-only and trigger-enforced immutable (UPDATE/DELETE/TRUNCATE prohibited).
            // fk_audit_events_passenger ON DELETE RESTRICT preserves audited principal rows.
            // Only un-audited users can be deleted; audited users remain as bounded immutable residue.
            if (!empty($this->trackedUserIds)) {
                $auditedUserIds = DB::table('audit_events')
                    ->whereIn('passenger_id', $this->trackedUserIds)
                    ->pluck('passenger_id')
                    ->map(fn ($id) => (string) $id)
                    ->unique()
                    ->all();

                $unauditedUserIds = array_values(array_diff($this->trackedUserIds, $auditedUserIds));
                if (!empty($unauditedUserIds)) {
                    DB::table('users')->whereIn('id', $unauditedUserIds)->delete();
                }
            }
        }

        parent::tearDown();
    }

    private function nextTestIp(): string
    {
        do {
            // Allocate a random run-unique synthetic IP in reserved synthetic benchmark range
            $ip = sprintf('198.18.%d.%d', random_int(1, 254), random_int(1, 254));
        } while (in_array($ip, $this->trackedIps, true));

        $this->trackedIps[] = $ip;
        return $ip;
    }

    private function withHttps(string $ip = '127.0.0.1'): self
    {
        $this->app['url']->forceRootUrl('https://127.0.0.1:18090');
        $this->app['url']->forceScheme('https');
        return $this->withServerVariables([
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1',
            'SERVER_NAME' => '127.0.0.1',
            'REMOTE_ADDR' => $ip,
        ]);
    }

    /**
     * Build auth headers with live raw Cookie header as required by CookieSecurity.
     *
     * @return array<string, string>
     */
    /** Laravel call() needs explicit conversion of the current default headers. */
    private function bodyless(string $method, string $uri): \Illuminate\Testing\TestResponse
    {
        return $this->call($method, $uri, [], [], [], $this->transformHeadersToServerVars([]));
    }

    private function authHeaders(
        string $csrfToken,
        string $cookieValue,
        ?string $origin = 'http://localhost:3000'
    ): array {
        $headers = [
            'X-CSRF-TOKEN' => $csrfToken,
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $cookieValue,
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
        ];

        if ($origin !== null) {
            $headers['Origin'] = $origin;
        }

        return $headers;
    }

    /**
     * Helper to bootstrap an anonymous passenger session and obtain cookie and matching CSRF token.
     *
     * @return array{cookie: string, csrfToken: string, ip: string}
     */
    private function bootstrapAnonymous(?string $ip = null): array
    {
        $this->flushHeaders();
        $ip = $ip ?? $this->nextTestIp();
        $response = $this->withHttps($ip)->get('/api/v1/auth/csrf');
        $response->assertStatus(200);

        $data = $response->json();
        $this->assertArrayHasKey('csrfToken', $data);
        $csrfToken = (string) $data['csrfToken'];

        $rawCookie = null;
        foreach ($response->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $rawCookie = $c->getValue();
                break;
            }
        }

        $this->assertNotNull($rawCookie, 'Expected gza_session cookie from CSRF bootstrap.');

        $digest = OpaqueToken::digestOf($rawCookie);
        $session = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first();
        if ($session) {
            $this->trackedSessionIds[] = (string) $session->id;
        }

        return [
            'cookie' => $rawCookie,
            'csrfToken' => $csrfToken,
            'ip' => $ip,
        ];
    }

    /**
     * Helper to register, activate, and return a verified active user.
     *
     * @return array{id: string, email: string, password: string}
     */
    private function createActiveVerifiedUser(
        ?string $email = null,
        string $password = 'SecurePassword15!Char',
        string $firstName = 'Ahmad',
        string $lastName = 'Al-Masri'
    ): array {
        $normalizedEmail = strtolower(trim($email ?? ('user_' . Str::random(10) . '@gazaairport.com')));
        $this->trackedSubjectDigests[] = hash('sha256', $normalizedEmail);

        /** @var Argon2idPasswordHasher $hasher */
        $hasher = app(Argon2idPasswordHasher::class);
        $hash = $hasher->hash($password, 'passenger');

        $userId = (string) Str::uuid();
        $this->trackedUserIds[] = $userId;

        $now = CarbonImmutable::now('UTC');

        DB::table('users')->insert([
            'id' => $userId,
            'email' => $normalizedEmail,
            'password_hash' => $hash,
            'status' => 'active',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('passenger_profiles')->insert([
            'user_id' => $userId,
            'title' => 'Mr',
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone' => '+970599123456',
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        return [
            'id' => $userId,
            'email' => $normalizedEmail,
            'password' => $password,
        ];
    }

    /**
     * Helper to log in a user and obtain a full session cookie + CSRF token.
     *
     * @return array{cookie: string, csrfToken: string, user: array<string, mixed>, ip: string}
     */
    private function loginUser(string $email, string $password, ?string $ip = null): array
    {
        $bootstrap = $this->bootstrapAnonymous($ip);
        $ip = $bootstrap['ip'];

        $response = $this->withHttps($ip)
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $email,
                'password' => $password,
            ]);

        $response->assertStatus(200);

        $fullCookie = null;
        foreach ($response->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $fullCookie = $c->getValue();
                break;
            }
        }

        $this->assertNotNull($fullCookie);

        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $context = $store->read($fullCookie);
        $this->assertNotNull($context);
        $this->trackedSessionIds[] = $context->sessionId;

        return [
            'cookie' => $fullCookie,
            'csrfToken' => $context->getCsrfToken(),
            'user' => $response->json('data.user'),
            'ip' => $ip,
        ];
    }

    // =========================================================================
    // 1. POST /auth/register (postPassengerRegister, 202)
    // =========================================================================

    public function test_register_creates_unverified_account_issues_proof_and_enqueues_outbox(): void
    {
        $bootstrap = $this->bootstrapAnonymous();
        $email = 'register_' . Str::random(8) . '@gazaairport.com';
        $this->trackedSubjectDigests[] = hash('sha256', strtolower($email));

        $payload = [
            'email' => $email,
            'password' => 'ValidPassword15!Chars',
            'title' => 'Mr',
            'firstName' => 'Ahmad',
            'lastName' => 'Al-Masri',
            'phone' => '+970599123456',
        ];

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/register', $payload);

        $response->assertStatus(202);
        $response->assertHeader('Cache-Control', 'no-store, private');
        $this->assertTrue($response->headers->has('X-Request-Id'));

        $this->assertSame([
            'success' => true,
            'data' => [
                'status' => 'verification_dispatched',
                'message' => 'If the account is eligible, a verification email has been queued for dispatch.',
            ],
            'meta' => [
                'requestId' => $response->headers->get('X-Request-Id'),
                'timestamp' => $response->json('meta.timestamp'),
            ],
        ], $response->json());

        // Verify database state: user created with unverified status and epoch 1
        $user = DB::table('users')->whereRaw('lower(email) = ?', [strtolower($email)])->first();
        $this->assertNotNull($user);
        $this->trackedUserIds[] = (string) $user->id;

        $this->assertSame('unverified', $user->status);
        $this->assertNull($user->email_verified_at);
        $this->assertSame(1, (int) $user->credential_epoch);

        // Verify passenger profile created
        $profile = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
        $this->assertNotNull($profile);
        $this->assertSame('Ahmad', $profile->first_name);
        $this->assertSame('Al-Masri', $profile->last_name);

        // Verify verification proof created
        $proof = DB::table('user_email_verifications')->where('user_id', $user->id)->first();
        $this->assertNotNull($proof);
        $this->assertSame('issued', $proof->state);

        // Verify outbox record enqueued with authentic schema
        $outbox = DB::table('security_dispatch_outbox')->where('user_verification_id', $proof->id)->first();
        $this->assertNotNull($outbox);
        $this->assertSame('queued', $outbox->status);
        $this->trackedOutboxIds[] = (string) $outbox->id;
    }

    public function test_register_duplicate_email_returns_identical_generic_receipt_and_does_not_mutate(): void
    {
        $existing = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        $payload = [
            'email' => $existing['email'],
            'password' => 'DifferentPassword15!Chars',
            'firstName' => 'Impostor',
            'lastName' => 'Hacker',
        ];

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/register', $payload);

        $response->assertStatus(202);
        $this->assertSame('verification_dispatched', $response->json('data.status'));

        // Verify existing user was NOT modified
        $user = DB::table('users')->where('id', $existing['id'])->first();
        $this->assertSame('active', $user->status);
        $this->assertSame(1, (int) $user->credential_epoch);

        $profile = DB::table('passenger_profiles')->where('user_id', $existing['id'])->first();
        $this->assertSame('Ahmad', $profile->first_name);

        // Verify no outbox dispatched for existing active user
        $existingProof = DB::table('user_email_verifications')->where('user_id', $existing['id'])->first();
        $outboxCount = $existingProof ? DB::table('security_dispatch_outbox')->where('user_verification_id', $existingProof->id)->count() : 0;
        $this->assertSame(0, $outboxCount);
    }

    public function test_register_rejects_insecure_transport_missing_csrf_and_bad_origin(): void
    {
        $payload = [
            'email' => 'test@gazaairport.com',
            'password' => 'ValidPassword15!Chars',
        ];

        // 1. Insecure transport (HTTP)
        $this->flushHeaders();
        $respHttp = $this->postJson('http://localhost/api/v1/auth/register', $payload);
        $respHttp->assertStatus(403);
        $this->assertSame('insecure_transport', $respHttp->json('error.code'));

        // 2. Missing Origin header
        $bootstrap = $this->bootstrapAnonymous();
        $this->flushHeaders();
        $respNoOrigin = $this->withHttps($bootstrap['ip'])
            ->withHeaders([
                'X-CSRF-TOKEN' => $bootstrap['csrfToken'],
                'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $bootstrap['cookie'],
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])
            ->postJson('/api/v1/auth/register', $payload);
        $respNoOrigin->assertStatus(403);
        $this->assertSame('origin_forbidden', $respNoOrigin->json('error.code'));

        // 3. Unauthorized Origin
        $this->flushHeaders();
        $respBadOrigin = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'https://evil-attacker.com'))
            ->postJson('/api/v1/auth/register', $payload);
        $respBadOrigin->assertStatus(403);
        $this->assertSame('origin_forbidden', $respBadOrigin->json('error.code'));

        // 4. Missing CSRF header
        $this->flushHeaders();
        $respNoCsrf = $this->withHttps($bootstrap['ip'])
            ->withHeaders([
                'Origin' => 'http://localhost:3000',
                'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $bootstrap['cookie'],
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])
            ->postJson('/api/v1/auth/register', $payload);
        $respNoCsrf->assertStatus(403);
        $this->assertSame('csrf_missing', $respNoCsrf->json('error.code'));

        // 5. Short password policy violation (< 15 chars)
        $this->flushHeaders();
        $respShortPass = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/register', [
                'email' => 'valid@gazaairport.com',
                'password' => 'Short1234',
            ]);
        $respShortPass->assertStatus(422);
        $this->assertSame('validation_error', $respShortPass->json('error.code'));
    }

    // =========================================================================
    // 2. POST /auth/login (postPassengerLogin, 200)
    // =========================================================================

    public function test_login_denies_unverified_account(): void
    {
        $user = $this->createActiveVerifiedUser();
        DB::table('users')->where('id', $user['id'])->update([
            'status' => 'unverified',
            'email_verified_at' => null,
        ]);

        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => $user['password'],
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
        $this->assertSame('Invalid email or password.', $response->json('error.message'));
    }

    public function test_login_unknown_email_returns_generic_unauthorized_with_dummy_hash_timing_mitigation(): void
    {
        $bootstrap = $this->bootstrapAnonymous();
        $this->trackedSubjectDigests[] = hash('sha256', 'unknown@gazaairport.com');

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => 'unknown@gazaairport.com',
                'password' => 'AnyPassword15!Chars',
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
        $this->assertSame('Invalid email or password.', $response->json('error.message'));
    }

    public function test_login_wrong_password_returns_generic_unauthorized(): void
    {
        $user = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => 'WrongPassword15!Char',
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
        $this->assertSame('Invalid email or password.', $response->json('error.message'));
    }

    public function test_login_success_rotates_session_sets_host_only_cookie_and_returns_user_data(): void
    {
        $user = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => $user['password'],
            ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('success'));

        $userData = $response->json('data.user');
        $this->assertSame($user['id'], $userData['id']);
        $this->assertSame($user['email'], $userData['email']);
        $this->assertSame('Ahmad', $userData['firstName']);
        $this->assertSame('Al-Masri', $userData['lastName']);
        $this->assertTrue($userData['emailVerified']);

        // Verify host-only, Secure, HttpOnly cookie issued
        $cookies = $response->headers->getCookies();
        $sessionCookie = null;
        foreach ($cookies as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $sessionCookie = $c;
                break;
            }
        }

        $this->assertNotNull($sessionCookie);
        $this->assertNull($sessionCookie->getDomain());
        $this->assertTrue($sessionCookie->isSecure());
        $this->assertTrue($sessionCookie->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $sessionCookie->getSameSite()));

        // Verify incoming anonymous session was revoked
        $anonDigest = OpaqueToken::digestOf($bootstrap['cookie']);
        $anonRow = DB::table('passenger_sessions')->where('lookup_digest', $anonDigest)->first();
        $this->assertNotNull($anonRow);
        $this->assertNotNull($anonRow->revoked_at);

        // Verify newly created session is full authority
        $newDigest = OpaqueToken::digestOf($sessionCookie->getValue());
        $newRow = DB::table('passenger_sessions')->where('lookup_digest', $newDigest)->first();
        $this->assertNotNull($newRow);
        $this->assertSame('full', $newRow->auth_level);
        $this->assertSame($user['id'], $newRow->user_id);
        $this->trackedSessionIds[] = (string) $newRow->id;
    }

    public function test_login_denies_foreign_full_session_without_revoking_owner_and_without_issuing_authority(): void
    {
        $userA = $this->createActiveVerifiedUser();
        $userB = $this->createActiveVerifiedUser();

        // User A logs in to obtain a valid full session cookie + CSRF token
        $sessionA = $this->loginUser($userA['email'], $userA['password']);

        // User B attempts to login presenting User A's full session cookie and CSRF token
        $response = $this->withHttps($sessionA['ip'])
            ->withHeaders($this->authHeaders($sessionA['csrfToken'], $sessionA['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $userB['email'],
                'password' => $userB['password'],
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));

        // Verify User A's session was NOT revoked in the database
        $digestA = OpaqueToken::digestOf($sessionA['cookie']);
        $sessionRowA = DB::table('passenger_sessions')->where('lookup_digest', $digestA)->first();
        $this->assertNotNull($sessionRowA);
        $this->assertNull($sessionRowA->revoked_at, "Foreign owner's session must not be revoked on foreign login denial");
    }

    public function test_login_denies_expired_or_revoked_session_after_middleware(): void
    {
        $user = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        // Simulate session revoked after middleware passed
        $digest = OpaqueToken::digestOf($bootstrap['cookie']);
        DB::table('passenger_sessions')
            ->where('lookup_digest', $digest)
            ->update(['revoked_at' => CarbonImmutable::now()->subMinute()->toIso8601String()]);

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => $user['password'],
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    // =========================================================================
    // 3. POST /auth/logout (postPassengerLogout, 200)
    // =========================================================================

    public function test_logout_revokes_session_and_clears_cookie(): void
    {
        $user = $this->createActiveVerifiedUser();
        $session = $this->loginUser($user['email'], $user['password']);

        $response = $this->withHttps($session['ip'])
            ->withHeaders($this->authHeaders($session['csrfToken'], $session['cookie'], 'http://localhost:3000'))
            ->bodyless('POST', '/api/v1/auth/logout');

        $response->assertStatus(200);
        $this->assertSame('Successfully logged out.', $response->json('data.message'));

        // Verify clearing cookie issued
        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $c;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertLessThanOrEqual(0, $clearingCookie->getMaxAge());

        // Verify session marked revoked in PostgreSQL
        $digest = OpaqueToken::digestOf($session['cookie']);
        $row = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first();
        $this->assertNotNull($row);
        $this->assertNotNull($row->revoked_at);

        // Replay of same revoked session must fail with 401
        $replayResponse = $this->withHttps($session['ip'])
            ->withHeaders($this->authHeaders($session['csrfToken'], $session['cookie'], 'http://localhost:3000'))
            ->bodyless('POST', '/api/v1/auth/logout');
        $replayResponse->assertStatus(401);
    }

    public function test_logout_with_anonymous_session_is_denied(): void
    {
        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->bodyless('POST', '/api/v1/auth/logout');

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    // =========================================================================
    // 4. POST /auth/email/verify (postPassengerEmailVerify, 200)
    // =========================================================================

    public function test_email_verify_activates_unverified_account_without_issuing_session(): void
    {
        $email = 'verify_' . Str::random(8) . '@gazaairport.com';
        $user = $this->createActiveVerifiedUser($email);
        DB::table('users')->where('id', $user['id'])->update([
            'status' => 'unverified',
            'email_verified_at' => null,
        ]);

        /** @var ProofService $proofService */
        $proofService = app(ProofService::class);
        $receipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $user['id']);
        $rawToken = $receipt->getRawToken();

        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/verify', [
                'token' => $rawToken,
            ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.verified'));

        // Invariant: Email verification gives NO full session cookie
        $cookies = $response->headers->getCookies();
        foreach ($cookies as $c) {
            $this->assertNotSame('full', $c->getValue());
        }

        // Account is now active and email_verified_at set
        $userRow = DB::table('users')->where('id', $user['id'])->first();
        $this->assertSame('active', $userRow->status);
        $this->assertNotNull($userRow->email_verified_at);

        // Proof is consumed
        $proofRow = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
        $this->assertSame('consumed', $proofRow->state);

        // Replaying same proof token fails with 422
        $replayResponse = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/verify', [
                'token' => $rawToken,
            ]);
        $replayResponse->assertStatus(422);
    }

    public function test_email_verify_denies_suspended_account(): void
    {
        $user = $this->createActiveVerifiedUser();
        DB::table('users')->where('id', $user['id'])->update([
            'status' => 'suspended',
        ]);

        /** @var ProofService $proofService */
        $proofService = app(ProofService::class);
        $receipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $user['id']);
        $rawToken = $receipt->getRawToken();

        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/verify', [
                'token' => $rawToken,
            ]);

        $response->assertStatus(403);
        $this->assertSame('forbidden', $response->json('error.code'));

        // Invariant: Suspended account is never unsuspended by verification
        $userRow = DB::table('users')->where('id', $user['id'])->first();
        $this->assertSame('suspended', $userRow->status);
    }

    // =========================================================================
    // 5. POST /auth/email/resend (postPassengerEmailResend, 202)
    // =========================================================================

    public function test_email_resend_reissues_proof_for_unverified_account(): void
    {
        $email = 'resend_' . Str::random(8) . '@gazaairport.com';
        $user = $this->createActiveVerifiedUser($email);
        DB::table('users')->where('id', $user['id'])->update([
            'status' => 'unverified',
            'email_verified_at' => null,
        ]);

        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/resend', [
                'email' => $email,
            ]);

        $response->assertStatus(202);
        $this->assertSame('verification_dispatched', $response->json('data.status'));

        // Verify outbox queued
        $proof = DB::table('user_email_verifications')->where('user_id', $user['id'])->latest('issued_at')->first();
        $this->assertNotNull($proof);
        $outbox = DB::table('security_dispatch_outbox')->where('user_verification_id', $proof->id)->first();
        $this->assertNotNull($outbox);
        $this->assertSame('queued', $outbox->status);
        $this->trackedOutboxIds[] = (string) $outbox->id;
    }

    public function test_email_resend_returns_generic_receipt_for_active_or_unknown_account(): void
    {
        $activeUser = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        // Active user resend attempt -> generic anti-enumeration
        $respActive = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/resend', [
                'email' => $activeUser['email'],
            ]);
        $respActive->assertStatus(202);
        $this->assertSame('verification_dispatched', $respActive->json('data.status'));

        // Unknown email resend attempt -> generic anti-enumeration
        $respUnknown = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/resend', [
                'email' => 'nobody_' . Str::random(6) . '@gazaairport.com',
            ]);
        $respUnknown->assertStatus(202);
        $this->assertSame('verification_dispatched', $respUnknown->json('data.status'));
    }

    // =========================================================================
    // 6. POST /auth/password/forgot (postPassengerPasswordForgot, 202)
    // 7. POST /auth/password/reset (postPassengerPasswordReset, 200)
    // =========================================================================

    public function test_password_forgot_and_reset_lifecycle_cross_browser_with_anonymous_csrf(): void
    {
        $user = $this->createActiveVerifiedUser();
        $bootstrap1 = $this->bootstrapAnonymous();

        // 1. Request password forgot -> 202
        $forgotResponse = $this->withHttps($bootstrap1['ip'])
            ->withHeaders($this->authHeaders($bootstrap1['csrfToken'], $bootstrap1['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/forgot', [
                'email' => $user['email'],
            ]);

        $forgotResponse->assertStatus(202);
        $this->assertSame(
            'If an active account exists for this email, password reset instructions have been queued for dispatch.',
            $forgotResponse->json('data.message')
        );

        // Verify outbox queued
        $resetProof = DB::table('user_password_resets')->where('user_id', $user['id'])->latest('issued_at')->first();
        $this->assertNotNull($resetProof);
        $outbox = DB::table('security_dispatch_outbox')->where('user_reset_id', $resetProof->id)->first();
        $this->assertNotNull($outbox);
        $this->assertSame('queued', $outbox->status);
        $this->trackedOutboxIds[] = (string) $outbox->id;

        // Decrypt payload to extract raw reset token for test execution
        $encrypter = app(\Illuminate\Contracts\Encryption\Encrypter::class);
        $payloadJson = $encrypter->decrypt($outbox->encrypted_payload);
        $outboxPayload = \App\Identity\Dispatch\OutboxPayload::fromJson($payloadJson);
        $rawResetToken = $outboxPayload->getTokenOrCode();

        // 2. Perform cross-browser password reset: use a fresh separate anonymous CSRF session
        $bootstrap2 = $this->bootstrapAnonymous();
        $newPassword = 'BrandNewPassword15!Chars';

        $resetResponse = $this->withHttps($bootstrap2['ip'])
            ->withHeaders($this->authHeaders($bootstrap2['csrfToken'], $bootstrap2['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/reset', [
                'email' => $user['email'],
                'token' => $rawResetToken,
                'password' => $newPassword,
            ]);

        $resetResponse->assertStatus(200);
        $this->assertSame(
            'Password has been successfully reset. Please log in with your new credentials.',
            $resetResponse->json('data.message')
        );

        // Invariant: Reset clears cookies (no auto-login)
        $clearingCookie = null;
        foreach ($resetResponse->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $c;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertLessThanOrEqual(0, $clearingCookie->getMaxAge());

        // Verify epoch bumped to 2
        $userRow = DB::table('users')->where('id', $user['id'])->first();
        $this->assertSame(2, (int) $userRow->credential_epoch);

        // Old password login now fails
        $bootstrapOld = $this->bootstrapAnonymous();
        $respOldPass = $this->withHttps($bootstrapOld['ip'])
            ->withHeaders($this->authHeaders($bootstrapOld['csrfToken'], $bootstrapOld['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => $user['password'],
            ]);
        $respOldPass->assertStatus(401);

        // New password login succeeds
        $newLogin = $this->loginUser($user['email'], $newPassword);
        $this->assertSame($user['id'], $newLogin['user']['id']);
    }

    public function test_password_reset_rejects_replayed_or_invalid_proof(): void
    {
        $user = $this->createActiveVerifiedUser();
        $bootstrap = $this->bootstrapAnonymous();

        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/reset', [
                'email' => $user['email'],
                'token' => 'invalid-nonexistent-token-12345678',
                'password' => 'NewValidPassword15!',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    public function test_password_reset_wrong_email_pairing_proves_lock_order_stability_and_fails_safely(): void
    {
        $userA = $this->createActiveVerifiedUser();
        $userB = $this->createActiveVerifiedUser();

        // Issue valid reset token for User A
        /** @var ProofService $proofService */
        $proofService = app(ProofService::class);
        $receiptA = $proofService->issue(ProofPurpose::PassengerPasswordReset, $userA['id']);

        $bootstrap = $this->bootstrapAnonymous();

        // Attacker attempts reset with User B's email but User A's token
        // Coordinator discovers actual owner via nonauthoritative token hint, locks User A (never User B),
        // verifies email mismatch under lock, and safely denies without lock inversion or credential mutation.
        $response = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/reset', [
                'email' => $userB['email'],
                'token' => $receiptA->getRawToken(),
                'password' => 'NewPasswordForUserB15!',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));

        // Verify neither user's password or epoch was mutated
        $freshUserA = DB::table('users')->where('id', $userA['id'])->first();
        $freshUserB = DB::table('users')->where('id', $userB['id'])->first();
        $this->assertSame(1, (int) $freshUserA->credential_epoch);
        $this->assertSame(1, (int) $freshUserB->credential_epoch);
    }

    // =========================================================================
    // 8. GET /auth/passenger/sessions (getPassengerSessions, 200)
    // 9. DELETE /auth/passenger/sessions/{id} (deletePassengerSession, 200)
    // =========================================================================

    public function test_sessions_listing_and_revocation_owner_scoped(): void
    {
        $user = $this->createActiveVerifiedUser();

        // Create two distinct sessions for this user
        $sessionA = $this->loginUser($user['email'], $user['password']);
        $sessionB = $this->loginUser($user['email'], $user['password']);

        // GET sessions using Session A (protected safe GET: needs only valid cookie header)
        $response = $this->withHttps($sessionA['ip'])
            ->withHeaders([
                'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $sessionA['cookie'],
                'Accept' => 'application/json',
            ])
            ->get('/api/v1/auth/passenger/sessions');

        $response->assertStatus(200);
        $sessions = $response->json('data.sessions');
        $this->assertCount(2, $sessions);

        // Verify structure: no digests, encrypted payloads, or CSRF tokens leaked
        $sessionAFound = null;
        $sessionBFound = null;
        foreach ($sessions as $s) {
            $this->assertArrayHasKey('id', $s);
            $this->assertArrayHasKey('ipAddress', $s);
            $this->assertArrayHasKey('userAgent', $s);
            $this->assertArrayHasKey('createdAt', $s);
            $this->assertArrayHasKey('lastSeenAt', $s);
            $this->assertArrayHasKey('current', $s);

            $this->assertArrayNotHasKey('lookup_digest', $s);
            $this->assertArrayNotHasKey('encrypted_payload', $s);
            $this->assertArrayNotHasKey('csrf_token', $s);

            if ($s['current'] === true) {
                $sessionAFound = $s;
            } else {
                $sessionBFound = $s;
            }
        }

        $this->assertNotNull($sessionAFound);
        $this->assertNotNull($sessionBFound);
        $this->assertTrue($sessionAFound['current']);
        $this->assertFalse($sessionBFound['current']);

        // Attempt to revoke a foreign / nonexistent UUID -> 404 (safe denial)
        $foreignId = (string) Str::uuid();
        $respForeign = $this->withHttps($sessionA['ip'])
            ->withHeaders($this->authHeaders($sessionA['csrfToken'], $sessionA['cookie'], 'http://localhost:3000'))
            ->bodyless('DELETE', '/api/v1/auth/passenger/sessions/' . $foreignId);

        $respForeign->assertStatus(404);
        $this->assertSame('not_found', $respForeign->json('error.code'));

        // Revoke Session B via Session A -> 200 OK without clearing current cookie
        $respRevokeB = $this->withHttps($sessionA['ip'])
            ->withHeaders($this->authHeaders($sessionA['csrfToken'], $sessionA['cookie'], 'http://localhost:3000'))
            ->bodyless('DELETE', '/api/v1/auth/passenger/sessions/' . $sessionBFound['id']);

        $respRevokeB->assertStatus(200);
        $this->assertTrue($respRevokeB->json('data.revoked'));

        // Cookie is NOT cleared for Session A
        $cookiesRevokeB = $respRevokeB->headers->getCookies();
        $this->assertEmpty($cookiesRevokeB);

        // Verify Session B is marked revoked in PostgreSQL
        $bRow = DB::table('passenger_sessions')->where('id', $sessionBFound['id'])->first();
        $this->assertNotNull($bRow->revoked_at);

        // Revoke current session (Session A) -> 200 OK with clearing cookie
        $respRevokeA = $this->withHttps($sessionA['ip'])
            ->withHeaders($this->authHeaders($sessionA['csrfToken'], $sessionA['cookie'], 'http://localhost:3000'))
            ->bodyless('DELETE', '/api/v1/auth/passenger/sessions/' . $sessionAFound['id']);

        $respRevokeA->assertStatus(200);
        $this->assertTrue($respRevokeA->json('data.revoked'));

        $clearingCookie = null;
        foreach ($respRevokeA->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $c;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertLessThanOrEqual(0, $clearingCookie->getMaxAge());
    }

    // =========================================================================
    // 10. PUT /auth/passenger/password (putPassengerPassword, 200)
    // =========================================================================

    public function test_put_passenger_password_updates_credential_bumps_epoch_and_revokes_sessions(): void
    {
        $user = $this->createActiveVerifiedUser();
        $session = $this->loginUser($user['email'], $user['password']);

        $newPassword = 'BrandNewPassword15!Next';

        // 1. Wrong current password -> 401
        $respWrong = $this->withHttps($session['ip'])
            ->withHeaders($this->authHeaders($session['csrfToken'], $session['cookie'], 'http://localhost:3000'))
            ->putJson('/api/v1/auth/passenger/password', [
                'currentPassword' => 'IncorrectPass15!',
                'newPassword' => $newPassword,
            ]);
        $respWrong->assertStatus(401);
        $this->assertSame('Current password is incorrect.', $respWrong->json('error.message'));

        // 2. Correct current password -> 200 OK with clearing cookie
        $respCorrect = $this->withHttps($session['ip'])
            ->withHeaders($this->authHeaders($session['csrfToken'], $session['cookie'], 'http://localhost:3000'))
            ->putJson('/api/v1/auth/passenger/password', [
                'currentPassword' => $user['password'],
                'newPassword' => $newPassword,
            ]);

        $respCorrect->assertStatus(200);
        $this->assertTrue($respCorrect->json('data.changed'));

        // Verify clearing cookie issued
        $clearingCookie = null;
        foreach ($respCorrect->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $c;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertLessThanOrEqual(0, $clearingCookie->getMaxAge());

        // Verify epoch bumped to 2
        $userRow = DB::table('users')->where('id', $user['id'])->first();
        $this->assertSame(2, (int) $userRow->credential_epoch);

        // Verify previous session revoked
        $digest = OpaqueToken::digestOf($session['cookie']);
        $sessionRow = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first();
        $this->assertNotNull($sessionRow->revoked_at);

        // Login with old password fails
        $bootstrapOld = $this->bootstrapAnonymous();
        $respOld = $this->withHttps($bootstrapOld['ip'])
            ->withHeaders($this->authHeaders($bootstrapOld['csrfToken'], $bootstrapOld['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $user['email'],
                'password' => $user['password'],
            ]);
        $respOld->assertStatus(401);

        // Login with new password succeeds
        $newLogin = $this->loginUser($user['email'], $newPassword);
        $this->assertSame($user['id'], $newLogin['user']['id']);
    }

    // =========================================================================
    // Rate Limiting & Rollback Negative Tests
    // =========================================================================

    public function test_rate_limiter_exceeded_returns_429_with_retry_after(): void
    {
        $bootstrap = $this->bootstrapAnonymous();
        $email = 'ratelimit_' . Str::random(8) . '@gazaairport.com';
        $this->trackedSubjectDigests[] = hash('sha256', strtolower($email));

        // The 'dispatch' budget is 3 attempts per 900s for subject_ip
        for ($i = 0; $i < 3; $i++) {
            $resp = $this->withHttps($bootstrap['ip'])
                ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
                ->postJson('/api/v1/auth/email/resend', ['email' => $email]);
            $resp->assertStatus(202);
        }

        // 4th attempt must be rejected with 429 and Retry-After header
        $blockedResp = $this->withHttps($bootstrap['ip'])
            ->withHeaders($this->authHeaders($bootstrap['csrfToken'], $bootstrap['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/resend', ['email' => $email]);

        $blockedResp->assertStatus(429);
        $this->assertSame('too_many_requests', $blockedResp->json('error.code'));
        $this->assertTrue($blockedResp->headers->has('Retry-After'));
        $this->assertGreaterThan(0, (int) $blockedResp->headers->get('Retry-After'));
    }
}
