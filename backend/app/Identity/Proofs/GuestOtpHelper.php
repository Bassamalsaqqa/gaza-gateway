<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

use App\Identity\Proofs\Exceptions\ProofValidationException;

/**
 * Domain-separated HMAC-SHA256 OTP digest helper for Guest and Claim challenges.
 *
 * Implements:
 * - CSPRNG 6 decimal digit generation.
 * - Versioned >= 256-bit pepper lookup via GuestOtpPepperRing.
 * - Strict domain separation binding challenge ID, purpose, booking ID, session ID, security epoch.
 * - Constant-time verification using hash_equals.
 * - Digits and secrets redacted in debug and error traces.
 */
final class GuestOtpHelper
{
    public const int OTP_DIGITS = 6;
    public const array ALLOWED_PURPOSES = ['manage_booking', 'claim_booking'];

    /**
     * Generate a cryptographically random 6-digit decimal code.
     */
    public static function generateCode(): string
    {
        return sprintf('%06d', random_int(0, 999999));
    }

    /**
     * Compute domain-separated HMAC-SHA256 digest for a 6-digit OTP code.
     */
    public static function computeDigest(
        string $challengeId,
        string $purpose,
        ?string $bookingId,
        string $sessionId,
        ?int $securityEpoch,
        #[\SensitiveParameter]
        string $code,
        int $pepperVersion,
        GuestOtpPepperRing $pepperRing,
    ): string {
        self::validateCodeFormat($code);
        self::validatePurpose($purpose);

        $pepper = $pepperRing->getPepper($pepperVersion);
        $message = self::buildDomainSeparatedMessage(
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $securityEpoch,
            code: $code,
        );

        return hash_hmac('sha256', $message, $pepper);
    }

    /**
     * Verify candidate code against stored digest in constant time.
     */
    public static function verifyCode(
        string $storedDigest,
        string $challengeId,
        string $purpose,
        ?string $bookingId,
        string $sessionId,
        ?int $securityEpoch,
        #[\SensitiveParameter]
        string $candidateCode,
        int $pepperVersion,
        GuestOtpPepperRing $pepperRing,
    ): bool {
        if (!self::isValidCodeFormat($candidateCode)) {
            return false;
        }

        if (!preg_match('/^[0-9a-f]{64}$/', $storedDigest)) {
            return false;
        }

        if (!$pepperRing->hasVersion($pepperVersion)) {
            return false;
        }

        $expectedDigest = self::computeDigest(
            challengeId: $challengeId,
            purpose: $purpose,
            bookingId: $bookingId,
            sessionId: $sessionId,
            securityEpoch: $securityEpoch,
            code: $candidateCode,
            pepperVersion: $pepperVersion,
            pepperRing: $pepperRing,
        );

        return hash_equals($storedDigest, $expectedDigest);
    }

    public static function isValidCodeFormat(string $code): bool
    {
        return strlen($code) === self::OTP_DIGITS && ctype_digit($code);
    }

    private static function validateCodeFormat(string $code): void
    {
        if (!self::isValidCodeFormat($code)) {
            throw new ProofValidationException('OTP code must be strictly 6 decimal digits.');
        }
    }

    private static function validatePurpose(string $purpose): void
    {
        if (!in_array($purpose, self::ALLOWED_PURPOSES, true)) {
            throw new ProofValidationException("Unsupported guest OTP purpose: [{$purpose}].");
        }
    }

    private static function buildDomainSeparatedMessage(
        string $challengeId,
        string $purpose,
        ?string $bookingId,
        string $sessionId,
        ?int $securityEpoch,
        #[\SensitiveParameter]
        string $code,
    ): string {
        $bookingPart = $bookingId !== null && $bookingId !== '' ? $bookingId : 'none';
        $epochPart = $securityEpoch !== null ? (string) $securityEpoch : 'none';

        return sprintf(
            'gza-guest-otp:v1:challenge_id=%s:purpose=%s:booking_id=%s:session_id=%s:epoch=%s:code=%s',
            $challengeId,
            $purpose,
            $bookingPart,
            $sessionId,
            $epochPart,
            $code
        );
    }
}
