<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

final class VerifyApplicationCsrfHeaderFeatureTest extends TestCase
{
    private string $validOrigin = 'http://localhost:5173';

    private static ?string $capturedPassword = null;
    private static ?string $capturedEmptyField = null;

    protected function setUp(): void
    {
        parent::setUp();

        self::$capturedPassword = null;
        self::$capturedEmptyField = null;

        DB::table('passenger_sessions')->delete();
        DB::table('staff_pending_auth')->delete();
        DB::table('staff_sessions')->delete();
        DB::table('staff_mfa_counter_consumptions')->delete();
        DB::table('staff_mfa_recovery_codes')->delete();
        DB::table('staff_mfa_replacements')->delete();
        DB::table('staff_users')->update(['status' => 'suspended', 'mfa_version' => null]);
        DB::table('staff_mfa_credentials')->delete();
        DB::table('staff_users')->delete();
        DB::table('users')->delete();

        // Dynamically register test-only protocol specimen handlers inside test environment only
        Route::post('/api/v1/auth/register', function () {
            self::$capturedPassword = request('password');
            self::$capturedEmptyField = request('empty_field');
            return response()->json([
                'success' => true,
                'data' => [
                    'authorized' => true,
                ],
            ]);
        });

        Route::post('/api/v1/staff/login', function () {
            return response()->json([
                'success' => true,
                'data' => ['authorized_staff' => true],
            ]);
        });

        Route::post('/api/v1/auth/logout', function () {
            return response()->json([
                'success' => true,
                'data' => ['logged_out' => true],
            ]);
        });

        Route::get('/api/v1/staff/users', function () {
            return response()->json([
                'success' => true,
                'data' => ['users_directory' => []],
            ]);
        });

        Route::get('/api/v1/auth/passenger/profile', function () {
            return response()->json([
                'success' => true,
                'data' => ['profile_viewed' => true],
            ]);
        });

        Route::delete('/api/v1/staff/users/{id}', function ($id) {
            return response()->json([
                'success' => true,
                'data' => ['deleted_user_id' => $id, 'params' => request()->attributes->get('route_params')],
            ]);
        });

        Route::post('/api/v1/staff/mfa/challenge', function () {
            return response()->json([
                'success' => true,
                'data' => ['mfa_challenge_accepted' => true],
            ]);
        });

        Route::post('/api/v1/staff/users/{id}/invite/reissue', function ($id) {
            return response()->json([
                'success' => true,
                'data' => ['invite_reissued_id' => $id],
            ]);
        });
    }

    private function withHttps(): self
    {
        return $this->withServerVariables([
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
        ]);
    }

    // -------------------------------------------------------------------------
    // Transport & Origin Negatives
    // -------------------------------------------------------------------------

    public function testInsecureTransportWithoutHttpsIsDeniedEvenWithTransportHeader(): void
    {
        $response = $this->withHeaders([
            'X-PHPUnit-Transport-Fixture' => '1',
        ])->postJson('http://127.0.0.1:18090/api/v1/auth/register', [
            'password' => 'secret',
        ]);

        $response->assertStatus(403);
        $this->assertSame('insecure_transport', $response->json('error.code'));
    }

    public function testMissingOriginHeaderOnUnsafeWriteIsDenied(): void
    {
        $response = $this->withHttps()->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('origin_forbidden', $response->json('error.code'));
    }

    public function testSecFetchSiteSameOriginDoesNotBypassMissingOrigin(): void
    {
        $response = $this->withHttps()->withHeaders([
            'Sec-Fetch-Site' => 'same-origin',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('origin_forbidden', $response->json('error.code'));
    }

    public function testRefererDoesNotSubstituteForOrigin(): void
    {
        $response = $this->withHttps()->withHeaders([
            'Referer' => 'http://localhost:5173/auth/register',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('origin_forbidden', $response->json('error.code'));
    }

    public function testUnapprovedOriginIsDenied(): void
    {
        $response = $this->withHttps()->withHeaders([
            'Origin' => 'https://evil-attacker.example.com',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('origin_forbidden', $response->json('error.code'));
    }

    // -------------------------------------------------------------------------
    // CSRF Negatives & Matching
    // -------------------------------------------------------------------------

    public function testMissingCsrfHeaderIsDenied(): void
    {
        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('csrf_missing', $response->json('error.code'));
    }

    public function testMalformedCsrfHeaderIsDenied(): void
    {
        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => 'short-malformed-token',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('csrf_invalid', $response->json('error.code'));
    }

    public function testMissingSessionCookieIsDenied(): void
    {
        $dummyCsrf = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $dummyCsrf,
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    public function testPresentEmptySessionCookieIsDenied(): void
    {
        $dummyCsrf = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $dummyCsrf,
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    public function testMalformedOrExpiredSessionCookieIsDeniedAndCleared(): void
    {
        $dummyCsrf = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $dummyCsrf,
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=malformed-session-token',
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));

        $clearingCookie = null;
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $clearingCookie = $cookie;
                break;
            }
        }
        $this->assertNotNull($clearingCookie);
        $this->assertSame(0, $clearingCookie->getMaxAge());
    }

    public function testTamperedCsrfTokenMismatchIsDeniedWithoutClearingValidSession(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        $tamperedCsrf = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();
        $this->assertNotSame($receipt->getCsrfToken(), $tamperedCsrf);

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $tamperedCsrf,
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt->getRawToken(),
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('csrf_invalid', $response->json('error.code'));
    }

    public function testCrossRealmCsrfMismatchIsDenied(): void
    {
        /** @var PassengerSessionStore $pStore */
        $pStore = app(PassengerSessionStore::class);
        $pReceipt = $pStore->issueAnonymous();

        /** @var StaffSessionStore $sStore */
        $sStore = app(StaffSessionStore::class);
        $sReceipt = $sStore->issueAnonymous();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $sReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $pReceipt->getRawToken(),
        ])->postJson('/api/v1/auth/register', []);

        $response->assertStatus(403);
        $this->assertSame('csrf_invalid', $response->json('error.code'));
    }

    public function testValidOriginAndMatchingCsrfAuthorizesMutationWithBytePreservation(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt->getRawToken(),
        ])->postJson('/api/v1/auth/register', [
            'password' => '  secret_preserved_bytes  ',
            'empty_field' => '',
        ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.authorized'));
        $this->assertSame('  secret_preserved_bytes  ', self::$capturedPassword);
        $this->assertSame('', self::$capturedEmptyField);
    }

    public function testGovernedAliasRouteAuthorizesMutationWithBytePreservation(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt->getRawToken(),
        ])->postJson('/api/v1/%61uth/register', [
            'password' => '  synthetic password bytes  ',
            'empty_field' => '',
        ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.authorized'));
        $this->assertSame('  synthetic password bytes  ', self::$capturedPassword);
        $this->assertSame('', self::$capturedEmptyField);
    }

    public function testUnrelatedRouteUndergoesStandardInputNormalization(): void
    {
        Route::post('/api/v1/unrelated/echo', function () {
            return response()->json([
                'text' => request('text'),
                'empty' => request('empty'),
            ]);
        });

        $response = $this->postJson('/api/v1/unrelated/echo', [
            'text' => '  trimmed text  ',
            'empty' => '',
        ]);

        $response->assertStatus(200);
        $this->assertSame('trimmed text', $response->json('text'));
        $this->assertNull($response->json('empty'));
    }

    public function testStaffSpecimenWithMatchingCsrfAuthorizes(): void
    {
        /** @var StaffSessionStore $store */
        $store = app(StaffSessionStore::class);
        $receipt = $store->issueAnonymous();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $receipt->getRawToken(),
        ])->postJson('/api/v1/staff/login', []);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.authorized_staff'));
    }

    public function testFullOperationRejectsAnonymousSession(): void
    {
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $anonymousReceipt = $store->issueAnonymous();

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonymousReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $anonymousReceipt->getRawToken(),
        ])->postJson('/api/v1/auth/logout', []);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    // -------------------------------------------------------------------------
    // Protected Safe GET Authority
    // -------------------------------------------------------------------------

    public function testProtectedSafeGetRequiresFullSession(): void
    {
        // Anonymous GET to /auth/passenger/profile must be denied
        $response = $this->withHttps()->get('/api/v1/auth/passenger/profile');
        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));

        // Anonymous session cookie presented to /auth/passenger/profile must be denied
        /** @var PassengerSessionStore $store */
        $store = app(PassengerSessionStore::class);
        $anonReceipt = $store->issueAnonymous();

        $anonResponse = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_PASSENGER, $anonReceipt->getRawToken())
            ->get('/api/v1/auth/passenger/profile');
        $anonResponse->assertStatus(401);
    }

    public function testProtectedSafeGetStaffUsersDirectoryEnforcesPermissions(): void
    {
        // 1. Anonymous staff GET to /staff/users denied
        $response = $this->withHttps()->get('/api/v1/staff/users');
        $response->assertStatus(401);

        // 2. Staff user with 'viewer' role (lacks admin.manage) denied with 403
        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'viewer');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $receipt = $staffStore->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: CarbonImmutable::now()
        );

        $viewerResponse = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_STAFF, $receipt->getRawToken())
            ->get('/api/v1/staff/users');
        $viewerResponse->assertStatus(403);
        $this->assertSame('forbidden', $viewerResponse->json('error.code'));

        // 3. Staff user with 'admin' role (has admin.manage) authorized with 200
        $adminId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($adminId, role: 'admin');
        $adminReceipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: CarbonImmutable::now()
        );

        $adminResponse = $this->withHttps()
            ->withUnencryptedCookie(CookieSecurity::COOKIE_STAFF, $adminReceipt->getRawToken())
            ->get('/api/v1/staff/users');
        $adminResponse->assertStatus(200);
        $this->assertTrue($adminResponse->json('success'));
    }

    // -------------------------------------------------------------------------
    // Templated Route Matching & Parameter Extraction
    // -------------------------------------------------------------------------

    public function testTemplatedRouteResolvesAndExtractsParameter(): void
    {
        $adminId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($adminId, role: 'admin');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $receipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: CarbonImmutable::now()
        );

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $receipt->getRawToken(),
        ])->deleteJson('/api/v1/staff/users/usr_target_123');

        $response->assertStatus(200);
        $this->assertSame('usr_target_123', $response->json('data.deleted_user_id'));
        $this->assertSame(['id' => 'usr_target_123'], $response->json('data.params'));

        // Extra trailing slash is NOT aliased and fails to match
        $slashReq = \Illuminate\Http\Request::create('https://localhost:18090/api/v1/staff/users/usr_target_123/', 'DELETE', [], [
            CookieSecurity::COOKIE_STAFF => $receipt->getRawToken(),
        ], [], [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_ORIGIN' => $this->validOrigin,
            'HTTP_X_CSRF_TOKEN' => $receipt->getCsrfToken(),
            'HTTP_ACCEPT' => 'application/json',
        ]);
        $slashResponse = $this->createTestResponse($this->app->handle($slashReq), $slashReq);
        $slashResponse->assertStatus(403);

        // Double slashes are rejected
        $doubleSlashResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $receipt->getRawToken(),
        ])->deleteJson('/api/v1/staff//users/usr_target_123');
        $doubleSlashResponse->assertStatus(403);
    }

    // -------------------------------------------------------------------------
    // Staff Pending Auth (StaffPreAuthCookieAuth)
    // -------------------------------------------------------------------------

    public function testStaffPreAuthRequiresPendingAndBoundAnonymousCookies(): void
    {
        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $anonStaffReceipt = $staffStore->issueAnonymous();

        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'admin');

        $pendingToken = OpaqueToken::generate('staff', 'login_mfa')->getSecretToken();
        $pendingDigest = hash('sha256', $pendingToken);
        $now = CarbonImmutable::now();

        DB::table('staff_pending_auth')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'token_digest' => $pendingDigest,
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addMinutes(5)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $anonStaffReceipt->sessionId,
            'purpose' => 'login_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 0,
            'encrypted_staged_secret' => null,
        ]);

        // 1. Missing pending cookie denied
        $noPendingResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $noPendingResponse->assertStatus(401);

        // 2. Full staff cookie alone cannot substitute
        $fullStaffReceipt = $staffStore->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now
        );
        $fullFallbackResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $fullStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $fullStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $fullFallbackResponse->assertStatus(401);

        // 3. Wrong purpose: token with enroll_mfa sent to login_mfa endpoint denied
        DB::table('staff_pending_auth')->where('token_digest', $pendingDigest)->update(['purpose' => 'enroll_mfa']);
        $wrongPurposeResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $wrongPurposeResponse->assertStatus(401);
        DB::table('staff_pending_auth')->where('token_digest', $pendingDigest)->update(['purpose' => 'login_mfa']);

        // 4. Foreign binding: bound to another session denied
        $foreignReceipt = $staffStore->issueAnonymous();
        $foreignResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $foreignReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $foreignReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $foreignResponse->assertStatus(401);

        // 5. Expired or revoked pending record denied
        DB::table('staff_pending_auth')->where('token_digest', $pendingDigest)->update(['revoked_at' => $now->toIso8601String()]);
        $revokedResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $revokedResponse->assertStatus(401);
        DB::table('staff_pending_auth')->where('token_digest', $pendingDigest)->update(['revoked_at' => null]);

        // 6. Valid pending auth + bound anonymous session succeeds
        $validResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);
        $validResponse->assertStatus(200);
        $this->assertTrue($validResponse->json('data.mfa_challenge_accepted'));
    }

    // -------------------------------------------------------------------------
    // Recent Step-Up Authentication Window (< 300s & Not Future)
    // -------------------------------------------------------------------------

    public function testRecentStepUpWindowEnforcement(): void
    {
        $adminId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($adminId, role: 'admin');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $now = CarbonImmutable::now();

        // 1. Stale step-up (301 seconds ago) -> denied with 403
        $staleReceipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now
        );
        DB::table('staff_sessions')->where('id', $staleReceipt->sessionId)->update([
            'mfa_verified_at' => $now->subSeconds(301)->toIso8601String(),
        ]);

        $staleResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $staleReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $staleReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/users/usr_4455/invite/reissue', []);
        $staleResponse->assertStatus(403);
        $this->assertSame('forbidden', $staleResponse->json('error.code'));

        // 2. Future step-up instant (+10 seconds in future) -> fails closed with 401 unauthorized
        $futureReceipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now
        );
        DB::table('staff_sessions')->where('id', $futureReceipt->sessionId)->update([
            'mfa_verified_at' => $now->addSeconds(10)->toIso8601String(),
        ]);

        $futureResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $futureReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $futureReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/users/usr_4455/invite/reissue', []);
        $futureResponse->assertStatus(401);
        $this->assertSame('unauthorized', $futureResponse->json('error.code'));

        // 3. Fresh step-up (10 seconds ago) -> authorized with 200
        $freshReceipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now->subSeconds(10)
        );

        $freshResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $freshReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $freshReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/users/usr_4455/invite/reissue', []);
        $freshResponse->assertStatus(200);
        $this->assertSame('usr_4455', $freshResponse->json('data.invite_reissued_id'));
    }

    // -------------------------------------------------------------------------
    // Encoded Namespace & Traversal Security (P02.1)
    // -------------------------------------------------------------------------

    public function testEncodedNamespaceAliasesCannotBypassCsrf(): void
    {
        $response = $this->withHttps()->postJson('/api/v1/%61uth/register', []);
        $response->assertStatus(403);
    }

    public function testEncodedNamespaceAliasesCannotBypassProtectedGet(): void
    {
        $response = $this->withHttps()->getJson('/api/v1/%73taff/me');
        $response->assertStatus(401);
    }

    public function testEncodedDotTraversalAndSlashesAreDenied(): void
    {
        $dotResponse = $this->withHttps()->postJson('/api/v1/auth/%2e%2e/staff/me', []);
        $dotResponse->assertStatus(403);

        $slashResponse = $this->withHttps()->postJson('/api/v1/auth/%2fregister', []);
        $slashResponse->assertStatus(403);

        $doubleSlashResponse = $this->withHttps()->postJson('/api/v1/auth//register', []);
        $doubleSlashResponse->assertStatus(403);
    }

    public function testGenuineParameterTransportPreservesValue(): void
    {
        $targetUuid = (string) \Illuminate\Support\Str::uuid();
        $adminId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($adminId, role: 'admin');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $receipt = $staffStore->issueFull(
            staffId: $adminId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: CarbonImmutable::now()
        );

        // 1. Genuine authenticated positive transport: preserves path parameter value into controller
        $authResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $receipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $receipt->getRawToken(),
        ])->deleteJson('/api/v1/staff/users/' . $targetUuid);

        $authResponse->assertStatus(200);
        $this->assertSame($targetUuid, $authResponse->json('data.deleted_user_id'));
        $this->assertSame(['id' => $targetUuid], $authResponse->json('data.params'));

        // 2. Unauthenticated request to templated route matches policy and fails closed with 401 (not 404/403)
        $anonStaffReceipt = $staffStore->issueAnonymous();
        $unauthResponse = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->deleteJson('/api/v1/staff/users/' . $targetUuid);

        $unauthResponse->assertStatus(401);
        $this->assertSame('unauthorized', $unauthResponse->json('error.code'));
    }

    public function testUnrelatedApplicationRoutesBypassIdentityMiddleware(): void
    {
        Route::get('/api/v1/unrelated/status', fn () => response()->json(['status' => 'operational']));

        $response = $this->getJson('/api/v1/unrelated/status');
        $response->assertStatus(200);
        $this->assertSame('operational', $response->json('status'));
    }

    // -------------------------------------------------------------------------
    // Pending MFA Purpose & Status Eligibility & Exhaustion (P02.3)
    // -------------------------------------------------------------------------

    public function testPendingMfaEnrollmentAllowedForPendingEnrollmentStatus(): void
    {
        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'viewer');
        DB::table('staff_users')->where('id', $staffId)->update(['status' => 'pending_enrollment', 'mfa_version' => null]);

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $anonStaffReceipt = $staffStore->issueAnonymous();

        $opaque = \App\Identity\Tokens\OpaqueToken::generate('staff', 'enroll_mfa');
        $pendingToken = $opaque->getSecretToken();
        $pendingDigest = hash('sha256', $pendingToken);
        $now = CarbonImmutable::now();

        DB::table('staff_pending_auth')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'token_digest' => $pendingDigest,
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addSeconds(300)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $anonStaffReceipt->sessionId,
            'purpose' => 'enroll_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 0,
            'encrypted_staged_secret' => null,
        ]);

        Route::post('/api/v1/staff/mfa/enrollment/setup', function () {
            return response()->json([
                'success' => true,
                'data' => ['enrollment_ready' => true],
            ]);
        });

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/enrollment/setup', []);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.enrollment_ready'));
    }

    public function testPendingMfaEnrollmentDeniedForInvalidStatuses(): void
    {
        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'viewer');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $anonStaffReceipt = $staffStore->issueAnonymous();

        $opaque = \App\Identity\Tokens\OpaqueToken::generate('staff', 'enroll_mfa');
        $pendingToken = $opaque->getSecretToken();
        $pendingDigest = hash('sha256', $pendingToken);
        $now = CarbonImmutable::now();

        DB::table('staff_pending_auth')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'token_digest' => $pendingDigest,
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addSeconds(300)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $anonStaffReceipt->sessionId,
            'purpose' => 'enroll_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 0,
            'encrypted_staged_secret' => null,
        ]);

        Route::post('/api/v1/staff/mfa/enrollment/setup', function () {
            return response()->json(['success' => true]);
        });

        foreach (['active', 'invited', 'suspended', 'deactivated'] as $status) {
            DB::table('staff_users')->where('id', $staffId)->update(['status' => $status]);

            $response = $this->withHttps()->withHeaders([
                'Origin' => $this->validOrigin,
                'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
                'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
            ])->postJson('/api/v1/staff/mfa/enrollment/setup', []);

            $response->assertStatus(401);
        }
    }

    public function testPendingMfaAttemptExhaustionAtFiveAttemptsDeniedEvenIfStateIssued(): void
    {
        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'viewer');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $anonStaffReceipt = $staffStore->issueAnonymous();

        $opaque = \App\Identity\Tokens\OpaqueToken::generate('staff', 'login_mfa');
        $pendingToken = $opaque->getSecretToken();
        $pendingDigest = hash('sha256', $pendingToken);
        $now = CarbonImmutable::now();

        DB::table('staff_pending_auth')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'token_digest' => $pendingDigest,
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addSeconds(300)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $anonStaffReceipt->sessionId,
            'purpose' => 'login_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 5, // Exactly at threshold
            'encrypted_staged_secret' => null,
        ]);

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    public function testPendingMfaAllowedForZeroToFourFailedAttempts(): void
    {
        $staffId = (string) \Illuminate\Support\Str::uuid();
        $this->createStaffUserFixture($staffId, role: 'viewer');

        /** @var StaffSessionStore $staffStore */
        $staffStore = app(StaffSessionStore::class);
        $anonStaffReceipt = $staffStore->issueAnonymous();

        $opaque = \App\Identity\Tokens\OpaqueToken::generate('staff', 'login_mfa');
        $pendingToken = $opaque->getSecretToken();
        $pendingDigest = hash('sha256', $pendingToken);
        $now = CarbonImmutable::now();

        DB::table('staff_pending_auth')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'token_digest' => $pendingDigest,
            'state' => 'issued',
            'issued_at' => $now->toIso8601String(),
            'expires_at' => $now->addSeconds(300)->toIso8601String(),
            'consumed_at' => null,
            'revoked_at' => null,
            'staff_id' => $staffId,
            'bound_session_id' => $anonStaffReceipt->sessionId,
            'purpose' => 'login_mfa',
            'credential_epoch' => 1,
            'failed_attempts' => 4, // Under threshold
            'encrypted_staged_secret' => null,
        ]);

        $response = $this->withHttps()->withHeaders([
            'Origin' => $this->validOrigin,
            'X-CSRF-TOKEN' => $anonStaffReceipt->getCsrfToken(),
            'Cookie' => CookieSecurity::COOKIE_STAFF_PENDING . '=' . $pendingToken . '; ' . CookieSecurity::COOKIE_STAFF . '=' . $anonStaffReceipt->getRawToken(),
        ])->postJson('/api/v1/staff/mfa/challenge', []);

        $response->assertStatus(200);
        $this->assertTrue($response->json('data.mfa_challenge_accepted'));
    }

    private function createStaffUserFixture(string $staffId, string $role = 'admin'): void
    {
        $now = CarbonImmutable::now();
        $username = 'staff_' . bin2hex(random_bytes(4));
        $email = $username . '@gazaairport.ps';
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';

        // 1. Insert initially invited without MFA reference
        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Test User',
            'full_name_ar' => 'مستخدم اختبار الموظفين',
            'password_hash' => $validHash,
            'role' => $role,
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        // 2. Insert MFA credential
        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'encrypted-totp-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        // 3. Update staff user to active and link confirmed MFA version
        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);
    }
}
