<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Exceptions\InvalidOtpException;
use App\Identity\Mfa\Exceptions\InvalidSecretException;
use App\Identity\Mfa\TotpSecret;
use App\Identity\Mfa\TotpService;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for TotpService validating RFC 4226 and RFC 6238 standards,
 * multi-counter matching semantics, and boundary conditions.
 */
class TotpServiceTest extends TestCase
{
    // RFC 4226 and RFC 6238 shared test secret (ASCII: "12345678901234567890", 20 bytes = 160 bits)
    private const string RFC_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    private TotpService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new TotpService();
    }

    /**
     * Authoritative RFC 4226 HOTP test vectors for counters 0 through 9 (HMAC-SHA1, 6 digits).
     */
    public function test_rfc4226_hotp_authoritative_vectors(): void
    {
        $expectedHotp = [
            0 => '755224',
            1 => '287082',
            2 => '359152',
            3 => '969429',
            4 => '338314',
            5 => '254676',
            6 => '287922',
            7 => '162583',
            8 => '399871',
            9 => '520489',
        ];

        foreach ($expectedHotp as $counter => $expectedOtp) {
            $otp = $this->service->hotp(self::RFC_BASE32, $counter);
            $this->assertSame($expectedOtp, $otp, "HOTP failed for counter {$counter}");
        }
    }

    /**
     * Authoritative RFC 6238 TOTP SHA-1 test vectors.
     * Note: Authoritative RFC 6238 vectors use 8 digits; per specification,
     * the 6-digit product policy matches the last 6 digits of the authoritative vector.
     */
    public function test_rfc6238_totp_sha1_authoritative_vectors(): void
    {
        // Vector mapping: [Unix Timestamp, RFC 8-digit vector, Expected 6-digit policy (last 6 digits)]
        $vectors = [
            [59, '94287082', '287082'],
            [1111111109, '07081804', '081804'],  // Leading zero: '081804'
            [1111111111, '14050471', '050471'],  // Leading zero: '050471'
            [1234567890, '89005924', '005924'],  // Double leading zero: '005924'
            [2000000000, '69279037', '279037'],
            [20000000000, '65353130', '353130'], // Large 64-bit integer timestamp
        ];

        foreach ($vectors as [$timestamp, $rfc8Digit, $expected6Digit]) {
            $this->assertSame(
                substr($rfc8Digit, -6),
                $expected6Digit,
                "Test invariant check: expected 6 digits must strictly be last 6 of 8-digit vector"
            );

            $otp = $this->service->totp(self::RFC_BASE32, $timestamp);
            $this->assertSame($expected6Digit, $otp, "TOTP failed for timestamp {$timestamp}");
        }
    }

    /**
     * Verify timestamp 0 produces valid counter 0 OTP.
     */
    public function test_timestamp_zero_handling(): void
    {
        $otp = $this->service->totp(self::RFC_BASE32, 0);
        $this->assertSame('755224', $otp);
    }

    /**
     * Strict rejection of negative timestamps.
     */
    public function test_rejects_negative_timestamp(): void
    {
        $this->expectException(InvalidOtpException::class);
        $this->expectExceptionMessage('Timestamp must be a non-negative integer.');

        $this->service->totp(self::RFC_BASE32, -1);
    }

    /**
     * Strict rejection of negative counter in HOTP.
     */
    public function test_rejects_negative_counter(): void
    {
        $this->expectException(InvalidOtpException::class);
        $this->expectExceptionMessage('Counter must be a non-negative integer.');

        $this->service->hotp(self::RFC_BASE32, -1);
    }

    /**
     * Window matching: offset 0 (exact current step).
     */
    public function test_match_current_step(): void
    {
        $timestamp = 1234567890;
        $step = intdiv($timestamp, 30);
        $otp = $this->service->totp(self::RFC_BASE32, $timestamp);

        $matchedCounters = $this->service->match(self::RFC_BASE32, $otp, $timestamp);

        $this->assertSame([$step], $matchedCounters);
    }

    /**
     * Window matching: offset -1 (past adjacent step).
     */
    public function test_match_prior_step_within_window(): void
    {
        $timestamp = 1234567890;
        $currentStep = intdiv($timestamp, 30);
        $priorStep = $currentStep - 1;

        $priorOtp = $this->service->hotp(self::RFC_BASE32, $priorStep);
        $matchedCounters = $this->service->match(self::RFC_BASE32, $priorOtp, $timestamp);

        $this->assertContains($priorStep, $matchedCounters);
        $this->assertSame([$priorStep], $matchedCounters);
    }

    /**
     * Window matching: offset +1 (future adjacent step).
     */
    public function test_match_future_step_within_window(): void
    {
        $timestamp = 1234567890;
        $currentStep = intdiv($timestamp, 30);
        $futureStep = $currentStep + 1;

        $futureOtp = $this->service->hotp(self::RFC_BASE32, $futureStep);
        $matchedCounters = $this->service->match(self::RFC_BASE32, $futureOtp, $timestamp);

        $this->assertContains($futureStep, $matchedCounters);
        $this->assertSame([$futureStep], $matchedCounters);
    }

    /**
     * Outside window rejection: offset -2 (stale past) returns empty array.
     */
    public function test_rejects_past_outside_window(): void
    {
        $timestamp = 1234567890;
        $currentStep = intdiv($timestamp, 30);
        $staleStep = $currentStep - 2;

        $staleOtp = $this->service->hotp(self::RFC_BASE32, $staleStep);
        $matchedCounters = $this->service->match(self::RFC_BASE32, $staleOtp, $timestamp);

        $this->assertSame([], $matchedCounters);
    }

    /**
     * Outside window rejection: offset +2 (too far in future) returns empty array.
     */
    public function test_rejects_future_outside_window(): void
    {
        $timestamp = 1234567890;
        $currentStep = intdiv($timestamp, 30);
        $futureStep = $currentStep + 2;

        $futureOtp = $this->service->hotp(self::RFC_BASE32, $futureStep);
        $matchedCounters = $this->service->match(self::RFC_BASE32, $futureOtp, $timestamp);

        $this->assertSame([], $matchedCounters);
    }

    /**
     * Window boundary at timestamp 0: step 0 has only candidate steps [0, 1].
     * Negative counter (-1) is strictly omitted.
     */
    public function test_window_boundary_at_timestamp_zero(): void
    {
        $timestamp = 15; // step 0
        $otp0 = $this->service->hotp(self::RFC_BASE32, 0);

        $matched = $this->service->match(self::RFC_BASE32, $otp0, $timestamp);
        $this->assertSame([0], $matched);

        $otp1 = $this->service->hotp(self::RFC_BASE32, 1);
        $matched1 = $this->service->match(self::RFC_BASE32, $otp1, $timestamp);
        $this->assertSame([1], $matched1);
    }

    /**
     * Malformed OTP input validation: non-digit characters, short codes, long codes.
     */
    public function test_rejects_malformed_otp_codes(): void
    {
        $malformedCodes = ['12345', '1234567', '', 'abcdef', '12 456', '12-456', '12345e'];

        foreach ($malformedCodes as $code) {
            try {
                $this->service->match(self::RFC_BASE32, $code, 1234567890);
                $this->fail("Expected InvalidOtpException for malformed code: '{$code}'");
            } catch (InvalidOtpException $e) {
                $this->assertSame('Supplied OTP must be exactly 6 ASCII digits.', $e->getMessage());
            }
        }
    }

    /**
     * Verification with TotpSecret instance.
     */
    public function test_works_with_totp_secret_instance(): void
    {
        $secret = TotpSecret::fromBase32(self::RFC_BASE32);
        $timestamp = 1234567890;
        $otp = $this->service->totp($secret, $timestamp);

        $this->assertSame('005924', $otp);

        $matched = $this->service->match($secret, $otp, $timestamp);
        $this->assertSame([intdiv($timestamp, 30)], $matched);
    }

    /**
     * Verify pure integer calculation of 30-second steps.
     */
    public function test_calculate_step_intervals(): void
    {
        $this->assertSame(0, $this->service->calculateStep(0));
        $this->assertSame(0, $this->service->calculateStep(29));
        $this->assertSame(1, $this->service->calculateStep(30));
        $this->assertSame(1, $this->service->calculateStep(59));
        $this->assertSame(2, $this->service->calculateStep(60));
        $this->assertSame(41152263, $this->service->calculateStep(1234567890));
    }

    /**
     * Collision handling: if multiple steps in the window generate identical OTP codes,
     * match() returns ALL matching counter step integers in stable ascending order,
     * never breaking early or hiding ambiguity.
     *
     * Codex durable integration invariant:
     * - Downstream database integration must lock credential authorization, then evaluate ALL returned matches.
     * - Do NOT fall through from an already-consumed match to another collision match for the same OTP.
     * - If ANY matching counter step in the returned set has already been consumed, the OTP is a replay and MUST be rejected.
     * - Otherwise, downstream must atomically consume EVERY matching counter step in the set together.
     * - Pure mathematical match tests are not database replay proof.
     */
    public function test_match_collision_returns_all_matching_counters_in_stable_order(): void
    {
        // Subclass simulating deterministic OTP collision across steps
        $collidingService = new class extends TotpService {
            public function hotp(string|TotpSecret $secret, int $counter): string
            {
                return '123456';
            }
        };

        $timestamp = 60; // Step 2 (candidate steps: 1, 2, 3)
        $matched = $collidingService->match(self::RFC_BASE32, '123456', $timestamp);

        // Must return all 3 counter steps in stable ascending order
        $this->assertSame([1, 2, 3], $matched);
        $this->assertIsArray($matched);
    }

    /**
     * Secret length policy: strictly rejects string secrets decoded to < 20 bytes (< 160 bits).
     */
    public function test_rejects_string_secret_shorter_than_20_bytes(): void
    {
        // 19 bytes is 152 bits (short)
        $shortBase32 = \App\Identity\Mfa\Base32Codec::encode(str_repeat('A', 19));

        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('MFA secret length must be between 20 and 64 bytes');

        $this->service->totp($shortBase32, 1234567890);
    }

    /**
     * Secret length policy: strictly rejects string secrets decoded to > 64 bytes (> 512 bits).
     */
    public function test_rejects_string_secret_longer_than_64_bytes(): void
    {
        // 65 bytes is 520 bits (oversized)
        $oversizedBase32 = \App\Identity\Mfa\Base32Codec::encode(str_repeat('A', 65));

        $this->expectException(InvalidSecretException::class);
        $this->expectExceptionMessage('MFA secret length must be between 20 and 64 bytes');

        $this->service->totp($oversizedBase32, 1234567890);
    }

    /**
     * Non-negative 64-bit integer timestamp boundary: PHP_INT_MAX is handled safely without overflow.
     */
    public function test_timestamp_php_int_max_handling(): void
    {
        $step = $this->service->calculateStep(PHP_INT_MAX);
        $this->assertSame(intdiv(PHP_INT_MAX, 30), $step);

        $otp = $this->service->totp(self::RFC_BASE32, PHP_INT_MAX);
        $this->assertSame(6, strlen($otp));
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $otp);
    }

    /**
     * Non-negative 64-bit integer counter boundary: PHP_INT_MAX is handled safely in HOTP.
     */
    public function test_counter_php_int_max_handling(): void
    {
        $otp = $this->service->hotp(self::RFC_BASE32, PHP_INT_MAX);
        $this->assertSame(6, strlen($otp));
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $otp);
    }

    /**
     * Verify match() returns empty array when code is valid format but does not match any window step.
     */
    public function test_match_returns_empty_array_when_no_step_matches(): void
    {
        $timestamp = 1234567890;
        $validUnmatchedCode = '999999';

        $matched = $this->service->match(self::RFC_BASE32, $validUnmatchedCode, $timestamp);

        $this->assertSame([], $matched);
    }

    /**
     * Error sanitization: ensure exception messages never reflect secret or code.
     */
    public function test_exceptions_do_not_reflect_supplied_values(): void
    {
        $secret = 'INVALIDSECRETVALUETHATSHOULDNOTLEAK!';
        $code = '9999999';

        try {
            $this->service->match($secret, $code, 1234567890);
            $this->fail('Expected exception');
        } catch (\Throwable $e) {
            $this->assertStringNotContainsString('INVALIDSECRET', $e->getMessage());
            $this->assertStringNotContainsString($code, $e->getMessage());
        }
    }
}
