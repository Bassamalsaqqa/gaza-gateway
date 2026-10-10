<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityLifecycle;

use App\Identity\Proofs\ProofIssuedReceipt;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use LogicException;
use PHPUnit\Framework\TestCase;

class OpaqueProofTokenTest extends TestCase
{
    public function test_generates_canonical_32_byte_bearer_for_all_four_proof_purposes(): void
    {
        $purposes = [
            ProofPurpose::PassengerEmailVerification,
            ProofPurpose::PassengerPasswordReset,
            ProofPurpose::StaffInvitation,
            ProofPurpose::StaffPasswordReset,
        ];

        foreach ($purposes as $purpose) {
            $token = OpaqueToken::generate($purpose->realm(), $purpose->value);

            $raw = $token->getSecretToken();
            $this->assertSame(43, strlen($raw), "Token for {$purpose->value} must be 43 characters");
            $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $raw);

            // Validate decoding to exactly 32 bytes
            $decoded = base64_decode(strtr($raw, '-_', '+/'), true);
            $this->assertNotFalse($decoded);
            $this->assertSame(32, strlen($decoded));

            // Validate SHA-256 digest is 64 hex characters
            $digest = $token->getDigest();
            $this->assertSame(64, strlen($digest));
            $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $digest);
            $this->assertSame(hash('sha256', $raw), $digest);
        }
    }

    public function test_opaque_token_strictly_redacts_secret_in_debug_and_serialization(): void
    {
        $token = OpaqueToken::generate('passenger', 'passenger_email_verification');
        $raw = $token->getSecretToken();

        $debug = print_r($token, true);
        $this->assertStringNotContainsString($raw, $debug);
        $this->assertStringNotContainsString($token->getDigest(), $debug);

        $json = json_encode($token, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($raw, $json);
        $this->assertStringNotContainsString($token->getDigest(), $json);

        $serialized = serialize($token);
        $this->assertStringNotContainsString($raw, $serialized);

        $this->expectException(LogicException::class);
        unserialize($serialized);
    }

    public function test_proof_issued_receipt_redacts_raw_secret_token(): void
    {
        $now = CarbonImmutable::now('UTC');
        $token = OpaqueToken::generate('passenger', 'passenger_email_verification');

        $receipt = new ProofIssuedReceipt(
            proofId: '00000000-0000-0000-0000-000000000001',
            purpose: ProofPurpose::PassengerEmailVerification,
            principalId: '00000000-0000-0000-0000-000000000002',
            emailSnapshot: 'passenger@example.com',
            credentialEpoch: 1,
            issuedAt: $now,
            expiresAt: $now->addHours(24),
            tokenDigest: $token->digest,
            rawSecretToken: $token->getSecretToken(),
        );

        $this->assertSame($token->getSecretToken(), $receipt->getRawToken());
        $this->assertSame($token->getSecretToken(), $receipt->getSecretToken());

        $json = json_encode($receipt, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($token->getSecretToken(), $json);
        $this->assertStringNotContainsString($token->digest, $json);
        $this->assertStringNotContainsString('passenger@example.com', $json);
        $this->assertStringContainsString('[REDACTED]', $json);

        $debug = print_r($receipt, true);
        $this->assertStringNotContainsString($token->getSecretToken(), $debug);
        $this->assertStringNotContainsString($token->digest, $debug);
        $this->assertStringNotContainsString('passenger@example.com', $debug);
        $this->assertStringContainsString('[REDACTED]', $debug);

        // Verify get_object_vars exposes only safe public identifiers
        $vars = get_object_vars($receipt);
        $this->assertArrayNotHasKey('rawSecretToken', $vars);
        $this->assertArrayNotHasKey('tokenDigest', $vars);
        $this->assertArrayNotHasKey('emailSnapshot', $vars);
        $this->assertArrayNotHasKey('secretTokenHolder', $vars);
        $this->assertArrayNotHasKey('tokenDigestHolder', $vars);
        $this->assertArrayNotHasKey('emailSnapshotHolder', $vars);
        $this->assertSame('00000000-0000-0000-0000-000000000001', $vars['proofId']);

        $this->expectException(LogicException::class);
        $receipt->__unserialize([]);
    }
}
