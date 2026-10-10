<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityProtocol;

use App\Identity\Protocol\IdentityOperationPolicies;
use PHPUnit\Framework\TestCase;

final class IdentityOperationPoliciesTest extends TestCase
{
    public function testContainsExactlyFortyOneOperations(): void
    {
        $this->assertCount(41, IdentityOperationPolicies::OPERATIONS);
    }

    public function testDigestIsNonEmptySha256(): void
    {
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', IdentityOperationPolicies::SOURCE_DIGEST);
    }

    public function testNoObjectStringificationArtifactsInPolicies(): void
    {
        foreach (IdentityOperationPolicies::OPERATIONS as $key => $policy) {
            $this->assertIsArray($policy['allowedSecurity'], "Policy {$key} allowedSecurity must be array.");
            $this->assertIsArray($policy['branchConditions'], "Policy {$key} branchConditions must be array.");

            $json = json_encode($policy, JSON_THROW_ON_ERROR);
            $this->assertStringNotContainsString('[object Object]', $json, "Policy {$key} contains stringified object artifact.");
        }
    }

    public function testPathNormalizationStrictness(): void
    {
        $this->assertSame('/auth/csrf', IdentityOperationPolicies::normalizePath('/api/v1/auth/csrf'));
        $this->assertSame('/auth/csrf', IdentityOperationPolicies::normalizePath('api/v1/auth/csrf'));
        $this->assertSame('/auth/csrf', IdentityOperationPolicies::normalizePath('/auth/csrf'));
        $this->assertSame('/auth/csrf', IdentityOperationPolicies::normalizePath('auth/csrf'));
        $this->assertSame('/auth/csrf', IdentityOperationPolicies::normalizePath('/api/v1/auth/csrf?foo=bar'));

        // Trailing slash alias is NOT stripped; extra slash aliases must not match
        $this->assertSame('/auth/csrf/', IdentityOperationPolicies::normalizePath('/api/v1/auth/csrf/'));

        // Double slashes and dot traversal are rejected
        $this->assertNull(IdentityOperationPolicies::normalizePath('/api/v1/auth//csrf'));
        $this->assertNull(IdentityOperationPolicies::normalizePath('/api/v1/auth/../staff/csrf'));
        $this->assertNull(IdentityOperationPolicies::normalizePath('/api/v1/auth/./csrf'));
    }

    public function testFindsBootstrapOperations(): void
    {
        $authCsrf = IdentityOperationPolicies::find('GET', '/api/v1/auth/csrf');
        $this->assertNotNull($authCsrf);
        $this->assertSame('getAuthCsrfBootstrap', $authCsrf['operationId']);
        $this->assertFalse($authCsrf['requiresCsrf']);
        $this->assertFalse($authCsrf['requiresOrigin']);
        $this->assertSame('passenger', $authCsrf['realm']);
        $this->assertSame([], $authCsrf['params']);

        $staffCsrf = IdentityOperationPolicies::find('GET', '/api/v1/staff/csrf');
        $this->assertNotNull($staffCsrf);
        $this->assertSame('getStaffCsrfBootstrap', $staffCsrf['operationId']);
        $this->assertFalse($staffCsrf['requiresCsrf']);
        $this->assertFalse($staffCsrf['requiresOrigin']);
        $this->assertSame('staff', $staffCsrf['realm']);
    }

    public function testFindsMutationOperationsWithRequiredOriginAndCsrf(): void
    {
        $register = IdentityOperationPolicies::find('POST', '/api/v1/auth/register');
        $this->assertNotNull($register);
        $this->assertSame('postPassengerRegister', $register['operationId']);
        $this->assertTrue($register['requiresCsrf']);
        $this->assertTrue($register['requiresOrigin']);
        $this->assertSame('X-CSRF-TOKEN', $register['csrfHeader']);

        $staffLogin = IdentityOperationPolicies::find('POST', '/api/v1/staff/login');
        $this->assertNotNull($staffLogin);
        $this->assertSame('postStaffLogin', $staffLogin['operationId']);
        $this->assertTrue($staffLogin['requiresCsrf']);
        $this->assertTrue($staffLogin['requiresOrigin']);
    }

    public function testFindsTemplatedOperationsAndExtractsParameters(): void
    {
        // 1. DELETE /staff/users/{id}
        $deleteUser = IdentityOperationPolicies::find('DELETE', '/api/v1/staff/users/usr_9a8b7c');
        $this->assertNotNull($deleteUser);
        $this->assertSame('deleteStaffUser', $deleteUser['operationId']);
        $this->assertSame(['id' => 'usr_9a8b7c'], $deleteUser['params']);
        $this->assertSame('admin.manage', $deleteUser['requiredPermission']);
        $this->assertTrue($deleteUser['requiresRecentStepUp']);

        // 2. POST /staff/users/{id}/invite/reissue
        $reissue = IdentityOperationPolicies::find('POST', '/staff/users/usr_445566/invite/reissue');
        $this->assertNotNull($reissue);
        $this->assertSame('postStaffUserInviteReissue', $reissue['operationId']);
        $this->assertSame(['id' => 'usr_445566'], $reissue['params']);

        // 3. PATCH /auth/passenger/travelers/{id}
        $patchTraveler = IdentityOperationPolicies::find('PATCH', '/api/v1/auth/passenger/travelers/trv_112233');
        $this->assertNotNull($patchTraveler);
        $this->assertSame('patchSavedTraveler', $patchTraveler['operationId']);
        $this->assertSame(['id' => 'trv_112233'], $patchTraveler['params']);

        // Extra trailing slash on templated path must NOT match
        $this->assertNull(IdentityOperationPolicies::find('DELETE', '/api/v1/staff/users/usr_9a8b7c/'));

        // Consecutive slashes must NOT match
        $this->assertNull(IdentityOperationPolicies::find('DELETE', '/api/v1/staff//users/usr_9a8b7c'));
    }

    public function testUnknownOperationReturnsNull(): void
    {
        $this->assertNull(IdentityOperationPolicies::find('POST', '/api/v1/auth/nonexistent'));
        $this->assertNull(IdentityOperationPolicies::find('DELETE', '/api/v1/staff/csrf'));
        $this->assertNull(IdentityOperationPolicies::findByOperationId('nonexistentOperationId'));
    }

    public function testFindByOperationId(): void
    {
        $policy = IdentityOperationPolicies::findByOperationId('getStaffMe');
        $this->assertNotNull($policy);
        $this->assertSame('GET', $policy['method']);
        $this->assertSame('/staff/me', $policy['path']);
    }
}
