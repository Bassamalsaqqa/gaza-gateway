<?php

declare(strict_types=1);

namespace App\Identity\Password;

final class PasswordPolicy
{
    public const MAX_BYTES = 4096;
    public const PASSENGER_MIN_CODEPOINTS = 15;
    public const PASSENGER_MAX_CODEPOINTS = 128;
    public const STAFF_MIN_CODEPOINTS = 12;
    public const STAFF_MAX_CODEPOINTS = 128;

    /**
     * Bounded common-password local floor denylist.
     * Contains frequent common passwords and trivial patterns.
     */
    private const COMMON_DENYLIST = [
        'password12345678',
        'password123456789',
        '123456789012345',
        '1234567890123456',
        'qwertyuiopasdfg',
        'qwertyuiopasdfgh',
        'admin1234567890',
        'administrator123',
        'gazaairport12345',
        'palestine1234567',
        'letmein123456789',
        'welcome123456789',
        'iloveyou12345678',
        'trustnoone123456',
        'correcthorsebatterystaple',
        'monkey1234567890',
        'dragon1234567890',
        'baseball12345678',
        'football12345678',
        'sunshine12345678',
        'princess12345678',
        'superman12345678',
        'batman1234567890',
        'master1234567890',
        'shadow1234567890',
        'mustang123456789',
        'michael123456789',
        'jordan1234567890',
        'harley1234567890',
        'ranger1234567890',
        'charlie123456789',
        'robert1234567890',
        'thomas1234567890',
        'hockey1234567890',
        'killer1234567890',
        'george1234567890',
        'secret1234567890',
    ];

    /**
     * Validate passenger password.
     * Passwords must NOT be trimmed, truncated, or normalized.
     */
    public function validatePassengerPassword(#[\SensitiveParameter] string $password): PasswordValidationResult
    {
        return $this->validate(
            password: $password,
            minCodepoints: self::PASSENGER_MIN_CODEPOINTS,
            maxCodepoints: self::PASSENGER_MAX_CODEPOINTS,
            realm: 'passenger',
        );
    }

    /**
     * Validate staff password.
     * Passwords must NOT be trimmed, truncated, or normalized.
     */
    public function validateStaffPassword(#[\SensitiveParameter] string $password): PasswordValidationResult
    {
        return $this->validate(
            password: $password,
            minCodepoints: self::STAFF_MIN_CODEPOINTS,
            maxCodepoints: self::STAFF_MAX_CODEPOINTS,
            realm: 'staff',
        );
    }

    private function validate(
        #[\SensitiveParameter] string $password,
        int $minCodepoints,
        int $maxCodepoints,
        string $realm,
    ): PasswordValidationResult {
        // 1. DoS prevention ceiling in bytes (evaluated BEFORE UTF-8 scan)
        if (strlen($password) > self::MAX_BYTES) {
            return PasswordValidationResult::invalid(
                message: 'Password exceeds maximum permitted payload size.',
                code: 'payload_too_large',
            );
        }

        // 2. Strict UTF-8 verification
        if (!mb_check_encoding($password, 'UTF-8')) {
            return PasswordValidationResult::invalid(
                message: 'Password must be valid UTF-8 character data.',
                code: 'invalid_encoding',
            );
        }

        // 3. Exact Unicode codepoint length check (without trim/normalization)
        $codepointLength = mb_strlen($password, 'UTF-8');
        if ($codepointLength < $minCodepoints) {
            return PasswordValidationResult::invalid(
                message: "Password for {$realm} must contain at least {$minCodepoints} Unicode characters.",
                code: 'password_too_short',
            );
        }

        if ($codepointLength > $maxCodepoints) {
            return PasswordValidationResult::invalid(
                message: "Password for {$realm} must not exceed {$maxCodepoints} Unicode characters.",
                code: 'password_too_long',
            );
        }

        // 4. Bounded common-password local floor denylist check
        $lowerPassword = mb_strtolower($password, 'UTF-8');
        if (in_array($lowerPassword, self::COMMON_DENYLIST, true)) {
            return PasswordValidationResult::invalid(
                message: 'Password is too common and easily guessed.',
                code: 'common_password_denied',
            );
        }

        return PasswordValidationResult::valid();
    }
}
