<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityLifecycle;

use App\Identity\Proofs\Exceptions\InvalidPepperException;
use App\Identity\Proofs\Exceptions\ProofValidationException;
use App\Identity\Proofs\GuestOtpHelper;
use App\Identity\Proofs\GuestOtpPepperRing;
use PHPUnit\Framework\TestCase;

class GuestOtpHelperTest extends TestCase
{
    private function createValidRing(): GuestOtpPepperRing
    {
        return new GuestOtpPepperRing([
            1 => str_repeat('a', 32),
            2 => str_repeat('b', 48),
        ], activeVersion: 2);
    }

    public function test_csprng_code_generation_produces_six_decimal_digits(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $code = GuestOtpHelper::generateCode();
            $this->assertSame(6, strlen($code));
            $this->assertTrue(ctype_digit($code));
            $this->assertTrue(GuestOtpHelper::isValidCodeFormat($code));
        }
    }

    public function test_pepper_ring_enforces_minimum_256_bits_and_positive_version(): void
    {
        // < 32 bytes throws InvalidPepperException
        $this->expectException(InvalidPepperException::class);
        new GuestOtpPepperRing([
            1 => str_repeat('x', 31), // only 31 bytes
        ]);
    }

    public function test_pepper_ring_redacts_secrets_in_debug_and_json(): void
    {
        $ring = $this->createValidRing();

        $debug = print_r($ring, true);
        $this->assertStringNotContainsString(str_repeat('a', 32), $debug);
        $this->assertStringNotContainsString(str_repeat('b', 48), $debug);
        $this->assertStringContainsString('[REDACTED]', $debug);

        $json = json_encode($ring, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString(str_repeat('a', 32), $json);
    }

    public function test_domain_separation_and_constant_time_verification(): void
    {
        $ring = $this->createValidRing();
        $challengeId = '00000000-0000-0000-0000-000000000001';
        $purpose = 'manage_booking';
        $bookingId = '00000000-0000-0000-0000-000000000002';
        $sessionId = '00000000-0000-0000-0000-000000000003';
        $epoch = 1;
        $code = '123456';

        $digest = GuestOtpHelper::computeDigest(
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $epoch,
            code: $code,
            pepperVersion: 2,
            pepperRing: $ring,
        );

        $this->assertSame(64, strlen($digest));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $digest);

        // Positive verification
        $this->assertTrue(GuestOtpHelper::verifyCode(
            storedDigest: $digest,
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $epoch,
            candidateCode: '123456',
            pepperVersion: 2,
            pepperRing: $ring,
        ));

        // Negative: incorrect code
        $this->assertFalse(GuestOtpHelper::verifyCode(
            storedDigest: $digest,
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $epoch,
            candidateCode: '123457',
            pepperVersion: 2,
            pepperRing: $ring,
        ));

        // Negative: altered epoch binding
        $this->assertFalse(GuestOtpHelper::verifyCode(
            storedDigest: $digest,
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: 2, // Changed epoch
            candidateCode: '123456',
            pepperVersion: 2,
            pepperRing: $ring,
        ));

        // Negative: altered challenge ID binding
        $this->assertFalse(GuestOtpHelper::verifyCode(
            storedDigest: $digest,
            challengeId: '00000000-0000-0000-0000-000000000099',
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $epoch,
            candidateCode: '123456',
            pepperVersion: 2,
            pepperRing: $ring,
        ));

        // Negative: invalid candidate format
        $this->assertFalse(GuestOtpHelper::verifyCode(
            storedDigest: $digest,
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $epoch,
            candidateCode: '12345', // only 5 digits
            pepperVersion: 2,
            pepperRing: $ring,
        ));
    }
}
