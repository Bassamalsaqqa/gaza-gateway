<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use Carbon\CarbonImmutable;
use Tests\TestCase;

final class RbacPolicyTest extends TestCase
{
    private RbacPolicy $rbac;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rbac = new RbacPolicy(\Illuminate\Support\Facades\DB::connection());
    }

    public function test_admin_has_all_canonical_permissions(): void
    {
        $adminPermissions = [
            'ops.view',
            'ops.edit',
            'content.view',
            'content.edit',
            'commercial.view',
            'commercial.edit',
            'engagement.view',
            'engagement.edit',
            'admin.manage',
            'dashboard.view',
        ];

        foreach ($adminPermissions as $permission) {
            $this->assertTrue(
                $this->rbac->hasPermission('admin', $permission),
                "Admin should have permission: {$permission}"
            );
        }

        // Admin does not have unknown arbitrary permission
        $this->assertFalse($this->rbac->hasPermission('admin', 'arbitrary.permission'));
    }

    public function test_editor_has_only_editorial_and_dashboard_permissions(): void
    {
        $allowed = ['dashboard.view', 'content.view', 'content.edit'];
        foreach ($allowed as $perm) {
            $this->assertTrue($this->rbac->hasPermission('editor', $perm));
        }

        $forbidden = ['ops.view', 'ops.edit', 'commercial.view', 'commercial.edit', 'admin.manage', 'engagement.edit'];
        foreach ($forbidden as $perm) {
            $this->assertFalse($this->rbac->hasPermission('editor', $perm), "Editor should not have: {$perm}");
        }
    }

    public function test_viewer_has_read_only_permissions(): void
    {
        $allowed = ['dashboard.view', 'ops.view', 'content.view', 'commercial.view', 'engagement.view'];
        foreach ($allowed as $perm) {
            $this->assertTrue($this->rbac->hasPermission('viewer', $perm));
        }

        $forbidden = ['ops.edit', 'content.edit', 'commercial.edit', 'engagement.edit', 'admin.manage'];
        foreach ($forbidden as $perm) {
            $this->assertFalse($this->rbac->hasPermission('viewer', $perm), "Viewer should not have: {$perm}");
        }
    }

    public function test_unknown_role_is_denied_all_permissions(): void
    {
        $this->assertFalse($this->rbac->hasPermission('superuser', 'dashboard.view'));
        $this->assertFalse($this->rbac->hasPermission('operator', 'ops.view'));
        $this->assertFalse($this->rbac->hasPermission('guest', 'content.view'));
        $this->assertSame([], $this->rbac->getPermissionsForRole('unknown'));
    }

    public function test_recent_step_up_evaluation_bounds_and_negative_pg_fixtures(): void
    {
        $now = CarbonImmutable::now()->startOfSecond();
        $db = \Illuminate\Support\Facades\DB::connection();

        $staffId = (string) \Illuminate\Support\Str::uuid();
        $sessionId = (string) \Illuminate\Support\Str::uuid();
        $mfaTime = $now->subSeconds(120);

        // 1. Detached DTO without DB connection must FAIL CLOSED
        $detachedRbac = new RbacPolicy(null);
        $detachedSession = new StaffSessionContext(
            sessionId: $sessionId,
            authLevel: 'full',
            staffId: $staffId,
            credentialEpoch: 1,
            csrfToken: 'csrf-123456789012345678901234567890123456789',
            payload: [],
            issuedAt: $now->subSeconds(200),
            absoluteExpiresAt: $now->addHours(8),
            idleExpiresAt: $now->addHour(),
            lastSeenAt: $now,
            mfaVersion: 1,
            mfaVerifiedAt: $mfaTime,
            role: 'admin',
        );
        $this->assertFalse($detachedRbac->hasRecentStepUp($detachedSession, $now), 'Detached DTO must fail closed');

        // Insert valid durable principal in PostgreSQL (initially invited to satisfy circular FK)
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
        $db->table('staff_users')->insert([
            'id' => $staffId,
            'username' => 'staff_stepup_' . bin2hex(random_bytes(4)),
            'email' => 'stepup_' . bin2hex(random_bytes(4)) . '@gazaairport.ps',
            'full_name_en' => 'Staff StepUp',
            'full_name_ar' => 'ترقية الموظف',
            'password_hash' => $validHash,
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        // Insert valid confirmed MFA credential
        $db->table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        // Activate staff user with confirmed MFA version 1
        $db->table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        // Insert valid durable session row
        $db->table('staff_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => hash('sha256', 'lookup-stepup-' . uniqid()),
            'staff_id' => $staffId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => 'payload',
            'issued_at' => $now->subSeconds(200)->toIso8601String(),
            'absolute_expires_at' => $now->addHours(8)->toIso8601String(),
            'idle_expires_at' => $now->addHour()->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
            'mfa_version' => 1,
            'mfa_verified_at' => $mfaTime->toIso8601String(),
        ]);

        // Valid step-up within 300 seconds passes
        $this->assertTrue($this->rbac->hasRecentStepUp($detachedSession, $now), 'Valid durable step-up must pass');

        // A context cannot substitute a different instant within the same whole second.
        $db->table('staff_sessions')->where('id', $sessionId)->update([
            'mfa_verified_at' => $mfaTime->addMicroseconds(1)->format('Y-m-d H:i:s.uP'),
        ]);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Different persisted MFA instant must fail');
        $db->table('staff_sessions')->where('id', $sessionId)->update(['mfa_verified_at' => $mfaTime->toIso8601String()]);

        // Expired step-up (>= 300 seconds, including exact boundary) fails
        $exactBoundaryNow = $mfaTime->addSeconds(300);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $exactBoundaryNow), 'Step-up at exactly 300s must fail as expired');

        $expiredNow = $mfaTime->addSeconds(301);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $expiredNow), 'Step-up older than 300s must fail');

        // Future timestamp fails
        $futureNow = $mfaTime->subSeconds(10);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $futureNow), 'Future MFA timestamp must fail');

        // Anonymous session fails
        $anonSession = new StaffSessionContext(
            sessionId: $sessionId,
            authLevel: 'anonymous',
            staffId: null,
            credentialEpoch: null,
            csrfToken: 'csrf-token',
            payload: [],
            issuedAt: $now,
            absoluteExpiresAt: $now->addHours(1),
            idleExpiresAt: $now->addMinutes(30),
            lastSeenAt: $now,
        );
        $this->assertFalse($this->rbac->hasRecentStepUp($anonSession, $now));

        // Forged context (unknown session ID) fails
        $forgedSession = new StaffSessionContext(
            sessionId: (string) \Illuminate\Support\Str::uuid(),
            authLevel: 'full',
            staffId: $staffId,
            credentialEpoch: 1,
            csrfToken: 'csrf-1',
            payload: [],
            issuedAt: $now->subSeconds(100),
            absoluteExpiresAt: $now->addHours(8),
            idleExpiresAt: $now->addHour(),
            lastSeenAt: $now,
            mfaVersion: 1,
            mfaVerifiedAt: $mfaTime,
            role: 'admin',
        );
        $this->assertFalse($this->rbac->hasRecentStepUp($forgedSession, $now), 'Forged session ID must fail');

        // Foreign session (different staffId in session context) fails
        $foreignSession = new StaffSessionContext(
            sessionId: $sessionId,
            authLevel: 'full',
            staffId: (string) \Illuminate\Support\Str::uuid(),
            credentialEpoch: 1,
            csrfToken: 'csrf-1',
            payload: [],
            issuedAt: $now->subSeconds(100),
            absoluteExpiresAt: $now->addHours(8),
            idleExpiresAt: $now->addHour(),
            lastSeenAt: $now,
            mfaVersion: 1,
            mfaVerifiedAt: $mfaTime,
            role: 'admin',
        );
        $this->assertFalse($this->rbac->hasRecentStepUp($foreignSession, $now), 'Mismatched staff ID must fail');

        // Negative fixture: Corrupted / unusable password hash in DB fails
        $db->table('staff_users')->where('id', $staffId)->update(['password_hash' => 'invalid-hash']);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Corrupted password hash must fail');

        // Fake hash with short salt/digest fails as unusable
        $db->table('staff_users')->where('id', $staffId)->update(['password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$c29tZWhhc2g']);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Fake short hash must fail');

        $db->table('staff_users')->where('id', $staffId)->update(['password_hash' => $validHash]);

        // Negative fixture: Altered role in DB fails
        $db->table('staff_users')->where('id', $staffId)->update(['role' => 'viewer']);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Altered role must fail');
        $db->table('staff_users')->where('id', $staffId)->update(['role' => 'admin']);

        // Negative fixture: Altered credential epoch in DB fails
        $db->table('staff_users')->where('id', $staffId)->update(['credential_epoch' => 2]);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Altered epoch must fail');
        $db->table('staff_users')->where('id', $staffId)->update(['credential_epoch' => 1]);

        // Negative fixture: Revoked MFA credential fails
        $db->table('staff_mfa_credentials')->where('staff_id', $staffId)->update(['revoked_at' => $now->toIso8601String()]);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Revoked MFA must fail');
        $db->table('staff_mfa_credentials')->where('staff_id', $staffId)->update(['revoked_at' => null]);

        // Negative fixture: Revoked session fails
        $db->table('staff_sessions')->where('id', $sessionId)->update(['revoked_at' => $now->toIso8601String()]);
        $this->assertFalse($this->rbac->hasRecentStepUp($detachedSession, $now), 'Revoked session must fail');
    }
}
