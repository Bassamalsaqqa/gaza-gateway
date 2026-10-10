<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\SessionReceipt;
use App\Identity\Sessions\StaffSessionContext;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Tests\TestCase;

final class OpaqueTokenTest extends TestCase
{
    public function test_generates_32_byte_token_with_canonical_base64url_encoding(): void
    {
        $token = OpaqueToken::generate('passenger', 'passenger_email_verification');

        $secret = $token->getSecretToken();

        // 32 raw bytes encoded in base64 without padding yields exactly 43 characters
        $this->assertSame(43, strlen($secret));

        // Must only contain base64url characters (A-Z, a-z, 0-9, -, _)
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $secret);

        // SHA-256 digest must be exactly 64 lowercase hexadecimal characters
        $this->assertSame(64, strlen($token->digest));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $token->digest);

        $this->assertSame('passenger', $token->realm);
        $this->assertSame('passenger_email_verification', $token->purpose);

        // Digest matches hash of secret
        $this->assertSame(hash('sha256', $secret), $token->digest);
    }

    public function test_closed_realm_and_purpose_allowlists_enforced(): void
    {
        // Unknown realm rejected
        try {
            OpaqueToken::generate('unauthorized_realm', 'csrf');
            $this->fail('Should have rejected unknown realm');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid realm and purpose pair.', $e->getMessage());
        }

        // Unknown purpose rejected
        try {
            OpaqueToken::generate('passenger', 'arbitrary_unauthorized_purpose');
            $this->fail('Should have rejected unknown purpose');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid realm and purpose pair.', $e->getMessage());
        }

        // Cross-realm invalid pair rejected (e.g. passenger with staff_invitation)
        try {
            OpaqueToken::generate('passenger', 'staff_invitation');
            $this->fail('Should have rejected passenger with staff_invitation');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid realm and purpose pair.', $e->getMessage());
        }
    }

    public function test_canonical_bearer_validation_rejects_non_canonical_and_padded_tokens(): void
    {
        // 1. Non-43 character length rejected
        try {
            OpaqueToken::digestOf('too_short_token');
            $this->fail('Should have rejected non-43 length token');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('exactly 43 characters', $e->getMessage());
        }

        // 2. 44 characters with trailing '=' padding rejected
        $padded = base64_encode(random_bytes(32));
        try {
            OpaqueToken::digestOf($padded);
            $this->fail('Should have rejected padded base64 token');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('exactly 43 characters', $e->getMessage());
        }

        // 3. Invalid characters rejected
        $invalidChars = str_repeat('a', 42) . '+';
        try {
            OpaqueToken::digestOf($invalidChars);
            $this->fail('Should have rejected non-base64url characters');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('non-base64url characters', $e->getMessage());
        }
    }

    public function test_opaque_token_redacts_and_denies_all_serialization_forms(): void
    {
        $token = OpaqueToken::generate('staff', 'full_session');
        $secret = $token->getSecretToken();
        $digest = $token->getDigest();

        // 1. __debugInfo redaction
        $debug = $token->__debugInfo();
        $this->assertArrayNotHasKey('secret', $debug);
        $this->assertArrayNotHasKey('digest', $debug);

        // 2. String casting redaction
        $asString = (string) $token;
        $this->assertStringNotContainsString($secret, $asString);
        $this->assertStringNotContainsString($digest, $asString);

        // 3. json_encode redaction
        $json = json_encode($token, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($secret, $json);
        $this->assertStringNotContainsString($digest, $json);

        // 4. serialize redaction
        $serialized = serialize($token);
        $this->assertStringNotContainsString($secret, $serialized);
        $this->assertStringNotContainsString($digest, $serialized);

        // 5. var_export inspection: MUST NOT leak secret or digest
        $exported = var_export($token, true);
        $this->assertStringNotContainsString($secret, $exported);
        $this->assertStringNotContainsString($digest, $exported);

        // 6. unserialize is denied
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Deserialization of OpaqueToken is prohibited.');
        unserialize($serialized);
    }

    public function test_session_receipt_redacts_bearer_secrets_across_all_serialization_forms(): void
    {
        $now = CarbonImmutable::now();
        $receipt = new SessionReceipt(
            rawToken: 'canonical_raw_token_secret_value_1234567890',
            csrfToken: 'canonical_csrf_token_secret_value_123456789',
            sessionId: 'test-session-id',
            realm: 'passenger',
            authLevel: 'full',
            principalId: 'user-id-1',
            issuedAt: $now,
            absoluteExpiresAt: $now->addDay(),
            idleExpiresAt: $now->addHour(),
        );

        $rawToken = $receipt->getRawToken();
        $csrfToken = $receipt->getCsrfToken();
        $principalId = $receipt->getPrincipalId();

        // json_encode must not leak secrets or principal
        $json = json_encode($receipt, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($rawToken, $json);
        $this->assertStringNotContainsString($csrfToken, $json);
        $this->assertStringNotContainsString($principalId, $json);

        // serialize must not leak secrets or principal
        $serialized = serialize($receipt);
        $this->assertStringNotContainsString($rawToken, $serialized);
        $this->assertStringNotContainsString($csrfToken, $serialized);
        $this->assertStringNotContainsString($principalId, $serialized);

        // __debugInfo must not leak secrets or principal
        $debug = $receipt->__debugInfo();
        $this->assertArrayNotHasKey('rawToken', $debug);
        $this->assertArrayNotHasKey('csrfToken', $debug);
        $this->assertArrayNotHasKey('principalId', $debug);

        // String casting must not leak secrets or principal
        $asString = (string) $receipt;
        $this->assertStringNotContainsString($rawToken, $asString);
        $this->assertStringNotContainsString($csrfToken, $asString);
        $this->assertStringNotContainsString($principalId, $asString);

        // var_export must not leak secrets or principal
        $exported = var_export($receipt, true);
        $this->assertStringNotContainsString($rawToken, $exported);
        $this->assertStringNotContainsString($csrfToken, $exported);
        $this->assertStringNotContainsString($principalId, $exported);

        // unserialize is denied
        $this->expectException(\LogicException::class);
        unserialize($serialized);
    }

    public function test_session_contexts_redact_sensitive_material_in_json_and_serialize(): void
    {
        $now = CarbonImmutable::now();
        $pContext = new PassengerSessionContext(
            sessionId: 'p-sess-1',
            authLevel: 'full',
            userId: 'user-uuid-1',
            credentialEpoch: 1,
            csrfToken: 'secret_csrf_token_passenger_123456789012345',
            payload: ['ip' => '10.0.0.1', 'secret_val' => 'confidential_payload'],
            issuedAt: $now,
            absoluteExpiresAt: $now->addDay(),
            idleExpiresAt: $now->addHour(),
            lastSeenAt: $now,
            userEmail: 'passenger@example.com',
            userStatus: 'active',
        );

        // json_encode must not leak userId, userEmail, csrfToken, or payload
        $pJson = json_encode($pContext, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('user-uuid-1', $pJson);
        $this->assertStringNotContainsString('passenger@example.com', $pJson);
        $this->assertStringNotContainsString('secret_csrf_token', $pJson);
        $this->assertStringNotContainsString('confidential_payload', $pJson);

        // serialize must not leak userId, userEmail, csrfToken, or payload
        $pSerialized = serialize($pContext);
        $this->assertStringNotContainsString('user-uuid-1', $pSerialized);
        $this->assertStringNotContainsString('passenger@example.com', $pSerialized);
        $this->assertStringNotContainsString('secret_csrf_token', $pSerialized);
        $this->assertStringNotContainsString('confidential_payload', $pSerialized);

        // var_export must not leak userId, userEmail, csrfToken, or payload
        $pExported = var_export($pContext, true);
        $this->assertStringNotContainsString('user-uuid-1', $pExported);
        $this->assertStringNotContainsString('passenger@example.com', $pExported);
        $this->assertStringNotContainsString('secret_csrf_token', $pExported);
        $this->assertStringNotContainsString('confidential_payload', $pExported);

        $sContext = new StaffSessionContext(
            sessionId: 's-sess-1',
            authLevel: 'full',
            staffId: 'staff-uuid-1',
            credentialEpoch: 1,
            csrfToken: 'secret_csrf_token_staff_1234567890123456789',
            payload: ['station' => 'GZA-TERMINAL-1', 'internal_key' => 'top_secret'],
            issuedAt: $now,
            absoluteExpiresAt: $now->addDay(),
            idleExpiresAt: $now->addHour(),
            lastSeenAt: $now,
            mfaVersion: 1,
            mfaVerifiedAt: $now,
            role: 'admin',
            username: 'admin_officer',
            staffStatus: 'active',
        );

        // json_encode must not leak staffId, username, csrfToken, or payload
        $sJson = json_encode($sContext, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('staff-uuid-1', $sJson);
        $this->assertStringNotContainsString('admin_officer', $sJson);
        $this->assertStringNotContainsString('secret_csrf_token', $sJson);
        $this->assertStringNotContainsString('top_secret', $sJson);

        // serialize must not leak staffId, username, csrfToken, or payload
        $sSerialized = serialize($sContext);
        $this->assertStringNotContainsString('staff-uuid-1', $sSerialized);
        $this->assertStringNotContainsString('admin_officer', $sSerialized);
        $this->assertStringNotContainsString('secret_csrf_token', $sSerialized);
        $this->assertStringNotContainsString('top_secret', $sSerialized);

        // var_export must not leak staffId, username, csrfToken, or payload
        $sExported = var_export($sContext, true);
        $this->assertStringNotContainsString('staff-uuid-1', $sExported);
        $this->assertStringNotContainsString('admin_officer', $sExported);
        $this->assertStringNotContainsString('secret_csrf_token', $sExported);
        $this->assertStringNotContainsString('top_secret', $sExported);
    }

    public function test_tokens_are_cryptographically_unique(): void
    {
        $token1 = OpaqueToken::generate('passenger', 'anonymous_session');
        $token2 = OpaqueToken::generate('passenger', 'anonymous_session');

        $this->assertNotSame($token1->getSecretToken(), $token2->getSecretToken());
        $this->assertNotSame($token1->digest, $token2->digest);
    }
}
