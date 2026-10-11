<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Identity\Passenger\PassengerLoginResult;
use Carbon\CarbonImmutable;
use LogicException;
use PHPUnit\Framework\TestCase;

final class PassengerLoginResultLeakTest extends TestCase
{
    private const string SENTINEL_USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    private const string SENTINEL_EMAIL = 'sentinel-passenger@example.test';
    private const string SENTINEL_RAW_TOKEN = 'CODEX_SYNTHETIC_PASSENGER_RAW_TOKEN_SECRET_';
    private const string SENTINEL_CSRF_TOKEN = 'CODEX_SYNTHETIC_PASSENGER_CSRF_TOKEN_SECRET';

    private function createSubject(): PassengerLoginResult
    {
        return new PassengerLoginResult(
            user: [
                'id' => self::SENTINEL_USER_ID,
                'email' => self::SENTINEL_EMAIL,
                'firstName' => 'SentinelFirst',
                'lastName' => 'SentinelLast',
                'emailVerified' => true,
            ],
            rawToken: self::SENTINEL_RAW_TOKEN,
            csrfToken: self::SENTINEL_CSRF_TOKEN,
            absoluteExpiresAt: CarbonImmutable::now()->addDays(7),
        );
    }

    public function test_json_encode_does_not_leak_secrets_or_pii(): void
    {
        $subject = $this->createSubject();
        $json = json_encode($subject);

        $this->assertIsString($json);
        $this->assertStringNotContainsString(self::SENTINEL_RAW_TOKEN, $json);
        $this->assertStringNotContainsString(self::SENTINEL_CSRF_TOKEN, $json);
        $this->assertStringNotContainsString(self::SENTINEL_EMAIL, $json);
        $this->assertStringNotContainsString('SentinelFirst', $json);
    }

    public function test_get_object_vars_does_not_expose_properties(): void
    {
        $subject = $this->createSubject();
        $vars = get_object_vars($subject);

        $this->assertEmpty($vars);
    }

    public function test_serialize_is_explicitly_prohibited(): void
    {
        $subject = $this->createSubject();

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('Serialization of PassengerLoginResult is prohibited.');

        serialize($subject);
    }

    public function test_var_export_does_not_leak_secrets(): void
    {
        $subject = $this->createSubject();
        $exported = var_export($subject, true);

        $this->assertStringNotContainsString(self::SENTINEL_RAW_TOKEN, $exported);
        $this->assertStringNotContainsString(self::SENTINEL_CSRF_TOKEN, $exported);
        $this->assertStringNotContainsString(self::SENTINEL_EMAIL, $exported);
    }

    public function test_explicit_getters_return_correct_capabilities(): void
    {
        $subject = $this->createSubject();

        $this->assertSame(self::SENTINEL_RAW_TOKEN, $subject->getRawToken());
        $this->assertSame(self::SENTINEL_CSRF_TOKEN, $subject->getCsrfToken());
        $this->assertSame(self::SENTINEL_EMAIL, $subject->getUser()['email']);
        $this->assertTrue($subject->getUser()['emailVerified']);
    }
}
