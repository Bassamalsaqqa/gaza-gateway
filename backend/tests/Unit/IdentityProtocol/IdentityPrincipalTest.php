<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityProtocol;

use App\Identity\Guards\IdentityPrincipal;
use PHPUnit\Framework\TestCase;

final class IdentityPrincipalTest extends TestCase
{
    public function testAuthenticatableContractHidesCredentials(): void
    {
        $principal = new IdentityPrincipal(
            id: 'd9b6e828-9121-4f11-9a72-e1c9e8cf1234',
            realm: 'passenger',
            authLevel: 'full',
            sessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            credentialEpoch: 1,
            role: null,
            permissions: []
        );

        $this->assertSame('id', $principal->getAuthIdentifierName());
        $this->assertSame('d9b6e828-9121-4f11-9a72-e1c9e8cf1234', $principal->getAuthIdentifier());
        $this->assertSame('', $principal->getAuthPassword(), 'Password hash must never be returned.');
        $this->assertSame('', $principal->getAuthPasswordName());
        $this->assertNull($principal->getRememberToken());
        $this->assertNull($principal->getRememberTokenName());

        $this->assertTrue($principal->isFull());
        $this->assertFalse($principal->isAnonymous());
        $this->assertTrue($principal->isPassenger());
        $this->assertFalse($principal->isStaff());
    }

    public function testDiagnosticsNeverExposeCredentialsTokensOrPii(): void
    {
        $principal = new IdentityPrincipal(
            id: 'staff-uuid-1',
            realm: 'staff',
            authLevel: 'full',
            sessionId: 'session-uuid-2',
            credentialEpoch: 3,
            role: 'admin',
            permissions: ['ops.view', 'ops.edit']
        );

        $debug = $principal->__debugInfo();
        $this->assertArrayNotHasKey('password', $debug);
        $this->assertArrayNotHasKey('password_hash', $debug);
        $this->assertArrayNotHasKey('token', $debug);
        $this->assertArrayNotHasKey('csrfToken', $debug);
        $this->assertArrayNotHasKey('rawBearer', $debug);

        $json = json_encode($principal, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('password', $json);
        $this->assertStringNotContainsString('csrf', $json);

        $serialized = serialize($principal);
        $this->assertStringNotContainsString('password', $serialized);

        $this->assertTrue($principal->hasPermission('ops.view'));
        $this->assertFalse($principal->hasPermission('nonexistent.perm'));
    }

    public function testUnserializationIsProhibited(): void
    {
        $principal = new IdentityPrincipal(
            id: 'd9b6e828-9121-4f11-9a72-e1c9e8cf1234',
            realm: 'passenger',
            authLevel: 'full',
            sessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
        );

        $payload = serialize($principal);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Deserialization of IdentityPrincipal is prohibited.');

        unserialize($payload);
    }
}
