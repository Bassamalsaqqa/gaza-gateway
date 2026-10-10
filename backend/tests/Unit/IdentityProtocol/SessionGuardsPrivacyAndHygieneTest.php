<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityProtocol;

use App\Identity\Guards\IdentityPrincipal;
use App\Identity\Guards\PassengerSessionGuard;
use App\Identity\Guards\StaffSessionGuard;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class SessionGuardsPrivacyAndHygieneTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        DB::beginTransaction();
    }

    protected function tearDown(): void
    {
        while (DB::transactionLevel() > 0) {
            DB::rollBack();
        }
        parent::tearDown();
    }

    private function createStaffFixture(string $role = 'viewer', string $status = 'active'): string
    {
        $id = (string) Str::uuid();
        $now = CarbonImmutable::now()->toIso8601String();
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';

        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'staff_' . str_replace('-', '', $id),
            'email' => $id . '@example.test',
            'full_name_en' => 'Staff Member',
            'full_name_ar' => 'عضو موظفين',
            'password_hash' => $validHash,
            'role' => $role,
            'status' => 'invited',
            'email_verified_at' => $now,
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        if ($status === 'active') {
            DB::table('staff_mfa_credentials')->insert([
                'staff_id' => $id,
                'version' => 1,
                'encrypted_secret' => 'encrypted-secret-payload',
                'confirmed_at' => $now,
                'revoked_at' => null,
            ]);
        }

        DB::table('staff_users')->where('id', $id)->update([
            'status' => $status,
            'mfa_version' => $status === 'active' ? 1 : null,
        ]);

        return $id;
    }

    private function createPassengerFixture(): string
    {
        $id = (string) Str::uuid();
        $now = CarbonImmutable::now()->toIso8601String();
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';

        DB::table('users')->insert([
            'id' => $id,
            'email' => $id . '@example.test',
            'password_hash' => $validHash,
            'status' => 'active',
            'email_verified_at' => $now,
            'credential_epoch' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $id;
    }

    public function testPassengerGuardConcealsRawBearerTokenAndDiagnostics(): void
    {
        $store = app(PassengerSessionStore::class);
        $syntheticSentinelBearer = 'ptok_sentinel_secret_raw_token_xyz_1234567890';

        $request = Request::create('/api/v1/auth/passenger/profile', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_PASSENGER . '=' . $syntheticSentinelBearer,
        ]);

        $guard = new PassengerSessionGuard($store, $request);

        // Debug info must not contain raw bearer token or request object
        $debug = $guard->__debugInfo();
        $this->assertArrayNotHasKey('cookieToken', $debug);
        $this->assertArrayNotHasKey('request', $debug);
        $this->assertArrayNotHasKey('store', $debug);

        // Serialization must not expose raw secret
        $serialized = serialize($guard);
        $this->assertFalse(str_contains($serialized, $syntheticSentinelBearer));

        // var_export must NOT expose raw token through closure-holder
        $exported = var_export($guard, true);
        $this->assertFalse(str_contains($exported, $syntheticSentinelBearer));

        // get_object_vars must not expose secret fields
        $objectVars = get_object_vars($guard);
        $this->assertArrayNotHasKey('cookieToken', $objectVars);

        // json_encode must not expose secret
        $json = json_encode($guard);
        $this->assertFalse(str_contains((string) $json, $syntheticSentinelBearer));

        // Deserialization must be prohibited
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Deserialization of PassengerSessionGuard is prohibited.');
        unserialize($serialized);
    }

    public function testStaffGuardConcealsRawBearerTokenAndDiagnostics(): void
    {
        $store = app(StaffSessionStore::class);
        $rbac = app(RbacPolicy::class);
        $syntheticSentinelBearer = 'stok_sentinel_secret_raw_token_abc_9876543210';

        $request = Request::create('/api/v1/staff/me', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $syntheticSentinelBearer,
        ]);

        $guard = new StaffSessionGuard($store, $rbac, $request);

        $debug = $guard->__debugInfo();
        $this->assertArrayNotHasKey('cookieToken', $debug);
        $this->assertArrayNotHasKey('request', $debug);
        $this->assertArrayNotHasKey('store', $debug);
        $this->assertArrayNotHasKey('rbacPolicy', $debug);

        $serialized = serialize($guard);
        $this->assertFalse(str_contains($serialized, $syntheticSentinelBearer));

        // var_export must NOT expose raw token through closure-holder
        $exported = var_export($guard, true);
        $this->assertFalse(str_contains($exported, $syntheticSentinelBearer));

        // get_object_vars must not expose secret fields
        $objectVars = get_object_vars($guard);
        $this->assertArrayNotHasKey('cookieToken', $objectVars);

        // json_encode must not expose secret
        $json = json_encode($guard);
        $this->assertFalse(str_contains((string) $json, $syntheticSentinelBearer));

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Deserialization of StaffSessionGuard is prohibited.');
        unserialize($serialized);
    }

    public function testSetUserCannotManufactureAuthorityAbsentPersistedSession(): void
    {
        $store = app(PassengerSessionStore::class);
        $request = Request::create('/api/v1/auth/passenger/profile', 'GET');

        $guard = new PassengerSessionGuard($store, $request);

        $this->assertNull($guard->user());
        $this->assertFalse($guard->check());

        // Attempting to manufacture authority via arbitrary DTO
        $arbitraryUser = new IdentityPrincipal(
            id: 'forged-uuid',
            realm: 'passenger',
            authLevel: 'full',
            sessionId: 'forged-session-id'
        );

        $guard->setUser($arbitraryUser);

        // Must still be unauthenticated!
        $this->assertNull($guard->user());
        $this->assertFalse($guard->check());
    }

    public function testSetUserCannotUpgradeViewerAuthorityToAdmin(): void
    {
        $staffId = $this->createStaffFixture(role: 'viewer', status: 'active');
        $store = app(StaffSessionStore::class);
        $rbac = app(RbacPolicy::class);

        $receipt = $store->issueFull($staffId, 1, 1, CarbonImmutable::now());

        $request = Request::create('/api/v1/staff/me', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $receipt->getRawToken(),
        ]);

        $guard = new StaffSessionGuard($store, $rbac, $request);
        $user = $guard->user();

        $this->assertInstanceOf(IdentityPrincipal::class, $user);
        $this->assertSame('viewer', $user->role);
        $this->assertFalse($user->hasPermission('admin.manage'));

        // Caller attempts to upgrade viewer to admin with forged permissions, epoch, auth level
        $forgedAdmin = new IdentityPrincipal(
            id: $user->id,
            realm: $user->realm,
            authLevel: 'full',
            sessionId: $user->sessionId,
            credentialEpoch: 999,
            role: 'admin',
            permissions: ['admin.manage', 'ops.edit']
        );

        $guard->setUser($forgedAdmin);

        // Guard must rederive from persisted context; authority must remain viewer!
        $currentUser = $guard->user();
        $this->assertSame('viewer', $currentUser->role);
        $this->assertFalse($currentUser->hasPermission('admin.manage'));
        $this->assertSame(1, $currentUser->credentialEpoch);
    }

    public function testSetUserCannotUpgradePassengerCredentialEpoch(): void
    {
        $passengerId = $this->createPassengerFixture();
        $store = app(PassengerSessionStore::class);

        $receipt = $store->issueFull($passengerId, 1);

        $request = Request::create('/api/v1/auth/passenger/profile', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt->getRawToken(),
        ]);

        $guard = new PassengerSessionGuard($store, $request);
        $user = $guard->user();

        $this->assertInstanceOf(IdentityPrincipal::class, $user);
        $this->assertSame(1, $user->credentialEpoch);

        // Caller attempts to substitute forged epoch and authLevel
        $forgedPassenger = new IdentityPrincipal(
            id: $user->id,
            realm: $user->realm,
            authLevel: 'full',
            sessionId: $user->sessionId,
            credentialEpoch: 888,
        );

        $guard->setUser($forgedPassenger);

        $currentUser = $guard->user();
        $this->assertSame(1, $currentUser->credentialEpoch);
    }

    public function testRequestRebindResetsCachedPrincipalAndState(): void
    {
        $staffId1 = $this->createStaffFixture(role: 'viewer', status: 'active');
        $staffId2 = $this->createStaffFixture(role: 'admin', status: 'active');
        $store = app(StaffSessionStore::class);
        $rbac = app(RbacPolicy::class);

        $receipt1 = $store->issueFull($staffId1, 1, 1, CarbonImmutable::now());
        $receipt2 = $store->issueFull($staffId2, 1, 1, CarbonImmutable::now());

        $request1 = Request::create('/api/v1/staff/me', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $receipt1->getRawToken(),
        ]);

        $guard = new StaffSessionGuard($store, $rbac, $request1);

        // First request resolved
        $user1 = $guard->user();
        $this->assertNotNull($user1);
        $this->assertSame($staffId1, $user1->id);
        $this->assertSame('viewer', $user1->role);

        // Rebind to second request under same guard instance
        $request2 = Request::create('/api/v1/staff/me', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $receipt2->getRawToken(),
        ]);

        $guard->setRequest($request2);

        // Guard must resolve new principal; no state leakage from request1
        $user2 = $guard->user();
        $this->assertNotNull($user2);
        $this->assertSame($staffId2, $user2->id);
        $this->assertSame('admin', $user2->role);
        $this->assertTrue($user2->hasPermission('admin.manage'));
    }

    public function testStaffGuardResolvesPermissionsForDifferentRoles(): void
    {
        $viewerId = $this->createStaffFixture(role: 'viewer', status: 'active');
        $editorId = $this->createStaffFixture(role: 'editor', status: 'active');
        $adminId = $this->createStaffFixture(role: 'admin', status: 'active');

        $store = app(StaffSessionStore::class);
        $rbac = app(RbacPolicy::class);

        // Viewer
        $rViewer = $store->issueFull($viewerId, 1, 1, CarbonImmutable::now());
        $qViewer = Request::create('/api/v1/staff/me', 'GET', [], [], [], ['HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $rViewer->getRawToken()]);
        $gViewer = new StaffSessionGuard($store, $rbac, $qViewer);
        $uViewer = $gViewer->user();
        $this->assertSame('viewer', $uViewer->role);
        $this->assertTrue($uViewer->hasPermission('ops.view'));
        $this->assertFalse($uViewer->hasPermission('ops.edit'));
        $this->assertFalse($uViewer->hasPermission('admin.manage'));

        // Editor
        $rEditor = $store->issueFull($editorId, 1, 1, CarbonImmutable::now());
        $qEditor = Request::create('/api/v1/staff/me', 'GET', [], [], [], ['HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $rEditor->getRawToken()]);
        $gEditor = new StaffSessionGuard($store, $rbac, $qEditor);
        $uEditor = $gEditor->user();
        $this->assertSame('editor', $uEditor->role);
        $this->assertTrue($uEditor->hasPermission('content.edit'));
        $this->assertFalse($uEditor->hasPermission('ops.edit'));

        // Admin
        $rAdmin = $store->issueFull($adminId, 1, 1, CarbonImmutable::now());
        $qAdmin = Request::create('/api/v1/staff/me', 'GET', [], [], [], ['HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF . '=' . $rAdmin->getRawToken()]);
        $gAdmin = new StaffSessionGuard($store, $rbac, $qAdmin);
        $uAdmin = $gAdmin->user();
        $this->assertSame('admin', $uAdmin->role);
        $this->assertTrue($uAdmin->hasPermission('admin.manage'));
        $this->assertTrue($uAdmin->hasPermission('ops.edit'));
    }

    public function testPassengerGuardResolvesFullPrincipalSuccessfully(): void
    {
        $passengerId = $this->createPassengerFixture();
        $store = app(PassengerSessionStore::class);

        $receipt = $store->issueFull($passengerId, 1);

        $request = Request::create('/api/v1/auth/passenger/profile', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt->getRawToken(),
        ]);

        $guard = new PassengerSessionGuard($store, $request);

        $this->assertTrue($guard->check());
        $this->assertFalse($guard->guest());
        $user = $guard->user();

        $this->assertInstanceOf(IdentityPrincipal::class, $user);
        $this->assertSame($passengerId, $user->id);
        $this->assertSame('passenger', $user->realm);
        $this->assertSame('full', $user->authLevel);
        $this->assertSame(1, $user->credentialEpoch);
        $this->assertSame($receipt->sessionId, $user->sessionId);
    }

    public function testPassengerRequestRebindResetsCachedPrincipalAndState(): void
    {
        $passengerId1 = $this->createPassengerFixture();
        $passengerId2 = $this->createPassengerFixture();
        $store = app(PassengerSessionStore::class);

        $receipt1 = $store->issueFull($passengerId1, 1);
        $receipt2 = $store->issueFull($passengerId2, 1);

        $request1 = Request::create('/api/v1/auth/passenger/profile', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt1->getRawToken(),
        ]);

        $guard = new PassengerSessionGuard($store, $request1);

        // First request resolved
        $user1 = $guard->user();
        $this->assertNotNull($user1);
        $this->assertSame($passengerId1, $user1->id);

        // Rebind to second request under same guard instance
        $request2 = Request::create('/api/v1/auth/passenger/profile', 'GET', [], [], [], [
            'HTTP_COOKIE' => CookieSecurity::COOKIE_PASSENGER . '=' . $receipt2->getRawToken(),
        ]);

        $guard->setRequest($request2);

        // Guard must resolve new principal; no state leakage from request1
        $user2 = $guard->user();
        $this->assertNotNull($user2);
        $this->assertSame($passengerId2, $user2->id);
    }
}
