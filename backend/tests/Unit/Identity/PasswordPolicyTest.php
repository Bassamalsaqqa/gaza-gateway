<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Identity\Password\PasswordPolicy;
use Tests\TestCase;

final class PasswordPolicyTest extends TestCase
{
    private PasswordPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->policy = new PasswordPolicy();
    }

    public function test_passenger_password_minimum_15_unicode_codepoints(): void
    {
        // 14 ASCII characters -> too short
        $tooShort = '12345678901234';
        $this->assertSame(14, mb_strlen($tooShort, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($tooShort);
        $this->assertFalse($result->isValid);
        $this->assertSame('password_too_short', $result->errorCode);

        // 15 ASCII characters -> valid
        $valid15 = '123456789012345'; // wait, 123456789012345 is in common denylist!
        // Use non-denylisted characters
        $safe15 = 'correct-horse-7';
        $this->assertSame(15, mb_strlen($safe15, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($safe15);
        $this->assertTrue($result->isValid);
    }

    public function test_staff_password_minimum_12_unicode_codepoints(): void
    {
        // 11 ASCII characters -> too short
        $tooShort = 'staffPass1!';
        $this->assertSame(11, mb_strlen($tooShort, 'UTF-8'));
        $result = $this->policy->validateStaffPassword($tooShort);
        $this->assertFalse($result->isValid);
        $this->assertSame('password_too_short', $result->errorCode);

        // 12 ASCII characters -> valid
        $valid12 = 'staffPass12!';
        $this->assertSame(12, mb_strlen($valid12, 'UTF-8'));
        $result = $this->policy->validateStaffPassword($valid12);
        $this->assertTrue($result->isValid);
    }

    public function test_maximum_128_unicode_codepoints(): void
    {
        $exact128 = str_repeat('a', 128);
        $this->assertSame(128, mb_strlen($exact128, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($exact128);
        $this->assertTrue($result->isValid);

        $tooLong129 = str_repeat('a', 129);
        $this->assertSame(129, mb_strlen($tooLong129, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($tooLong129);
        $this->assertFalse($result->isValid);
        $this->assertSame('password_too_long', $result->errorCode);
    }

    public function test_multibyte_unicode_codepoint_accuracy(): void
    {
        // Arabic characters: each character is 2 bytes in UTF-8
        // "فلسطين-حرة-أبية-غزة"
        // 19 Unicode codepoints, 36 bytes
        $arabicPassword = 'فلسطين-حرة-أبية-غزة';
        $codepoints = mb_strlen($arabicPassword, 'UTF-8');
        $bytes = strlen($arabicPassword);

        $this->assertSame(19, $codepoints);
        $this->assertGreaterThan(19, $bytes);

        $result = $this->policy->validatePassengerPassword($arabicPassword);
        $this->assertTrue($result->isValid);
    }

    public function test_passwords_are_not_trimmed(): void
    {
        // Password with leading/trailing spaces: spaces are part of the raw password bytes
        $withSpaces = '   hello world   '; // 17 characters including spaces
        $this->assertSame(17, mb_strlen($withSpaces, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($withSpaces);
        $this->assertTrue($result->isValid);

        // Password whose untrimmed length is 15 but trimmed length is 13
        $spaced15 = '  shortPass12  ';
        $this->assertSame(15, mb_strlen($spaced15, 'UTF-8'));
        $result = $this->policy->validatePassengerPassword($spaced15);
        $this->assertTrue($result->isValid);
    }

    public function test_invalid_utf8_rejected_before_hash(): void
    {
        $invalidUtf8 = "\xC3\x28" . str_repeat('a', 20); // Invalid UTF-8 sequence
        $result = $this->policy->validatePassengerPassword($invalidUtf8);
        $this->assertFalse($result->isValid);
        $this->assertSame('invalid_encoding', $result->errorCode);
    }

    public function test_payload_size_ceiling_rejects_oversized_bytes(): void
    {
        $oversized = str_repeat('a', 5000);
        $result = $this->policy->validatePassengerPassword($oversized);
        $this->assertFalse($result->isValid);
        $this->assertSame('payload_too_large', $result->errorCode);
    }

    public function test_common_password_denylist_rejects_trivial_passwords(): void
    {
        $common = 'password12345678';
        $result = $this->policy->validatePassengerPassword($common);
        $this->assertFalse($result->isValid);
        $this->assertSame('common_password_denied', $result->errorCode);
    }
}
