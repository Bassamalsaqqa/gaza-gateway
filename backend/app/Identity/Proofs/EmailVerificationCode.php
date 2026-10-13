<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

/** Low-entropy codes are keyed and bound to the same durable opaque proof. */
final class EmailVerificationCode
{
    public static function digest(string $proofId, string $email, int $epoch, #[\SensitiveParameter] string $code): string
    {
        $key = config('app.key');
        if (!is_string($key) || !str_starts_with($key, 'base64:')) {
            throw new \LogicException('Verification key is not configured.');
        }
        $key = base64_decode(substr($key, 7), true);
        if (!is_string($key) || strlen($key) !== 32) {
            throw new \LogicException('Verification key is not configured.');
        }
        return hash_hmac('sha256', json_encode(['gza-email-code:v1', $proofId, $email, $epoch, $code], JSON_THROW_ON_ERROR), $key);
    }
}
