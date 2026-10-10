<?php

declare(strict_types=1);

namespace App\Identity\Password;

final class Argon2idPasswordHasher
{
    public const DEFAULT_MEMORY_KIB = 65536; // 64 MiB
    public const DEFAULT_TIME_COST = 4;
    public const DEFAULT_THREADS = 1;

    public const MIN_MEMORY_KIB = 65536;
    public const MAX_MEMORY_KIB = 65536;
    public const MIN_TIME_COST = 4;
    public const MAX_TIME_COST = 10;
    public const MIN_THREADS = 1;
    public const MAX_THREADS = 1;

    private readonly PasswordPolicy $policy;

    public function __construct(
        private readonly int $memoryKib = self::DEFAULT_MEMORY_KIB,
        private readonly int $timeCost = self::DEFAULT_TIME_COST,
        private readonly int $threads = self::DEFAULT_THREADS,
        ?PasswordPolicy $policy = null,
    ) {
        if ($this->memoryKib < self::MIN_MEMORY_KIB || $this->memoryKib > self::MAX_MEMORY_KIB) {
            throw new \InvalidArgumentException('Memory cost violates security floor bounds.');
        }

        if ($this->timeCost < self::MIN_TIME_COST || $this->timeCost > self::MAX_TIME_COST) {
            throw new \InvalidArgumentException('Time cost violates security floor bounds.');
        }

        if ($this->threads < self::MIN_THREADS || $this->threads > self::MAX_THREADS) {
            throw new \InvalidArgumentException('Thread count violates security policy bounds.');
        }

        $this->policy = $policy ?? new PasswordPolicy();
    }

    /**
     * Compute native Argon2id hash.
     * Enforces byte ceiling before UTF-8 scan, mandatory realm, and policy validation before hashing.
     */
    public function hash(#[\SensitiveParameter] string $password, string $realm): string
    {
        // 1. Validate byte ceiling BEFORE UTF-8 scan
        if (strlen($password) > PasswordPolicy::MAX_BYTES) {
            throw new \InvalidArgumentException('Password exceeds maximum permitted length.');
        }

        // 2. Strict UTF-8 verification
        if (!mb_check_encoding($password, 'UTF-8')) {
            throw new \InvalidArgumentException('Password must be valid UTF-8 character data.');
        }

        // 3. Mandatory exact realm validation
        if ($realm !== 'passenger' && $realm !== 'staff') {
            throw new \InvalidArgumentException('Invalid password realm.');
        }

        // 4. Validate against policy for realm
        $validation = match ($realm) {
            'passenger' => $this->policy->validatePassengerPassword($password),
            'staff' => $this->policy->validateStaffPassword($password),
        };

        if (!$validation->isValid) {
            throw new \InvalidArgumentException('Password does not satisfy policy requirements.');
        }

        $hash = password_hash(
            $password,
            PASSWORD_ARGON2ID,
            [
                'memory_cost' => $this->memoryKib,
                'time_cost' => $this->timeCost,
                'threads' => $this->threads,
            ]
        );

        if ($hash === false) {
            throw new \RuntimeException('Failed to generate Argon2id password hash.');
        }

        return $hash;
    }

    /**
     * Narrow shared structural validator for stored Argon2id hashes.
     * Enforces:
     * - Supported native Argon2id version (v=19)
     * - Native generated 16-byte salt (canonical unpadded base64, exactly 22 chars)
     * - Native generated 32-byte digest (canonical unpadded base64, exactly 43 chars)
     * - Strict base64 decode and re-encode to reject non-canonical unused tail bits
     * - Sane supported cost bounds (memory 1024..262144 KiB, time 1..10, threads 1..4)
     *
     * Used consistently across verify, needsRehash, issueFull, read, rotate, and step-up.
     */
    public static function isValidStoredHashStructure(#[\SensitiveParameter] ?string $hash): bool
    {
        if ($hash === null || strlen($hash) < 60 || strlen($hash) > 255) {
            return false;
        }

        // Native PHP Argon2id hashes have:
        // - salt: 16 bytes decoded = exactly 22 unpadded base64 characters
        // - digest: 32 bytes decoded = exactly 43 unpadded base64 characters
        if (!preg_match('/^\$argon2id\$v=19\$m=(?<m>[1-9]\d*),t=(?<t>[1-9]\d*),p=(?<p>[1-9]\d*)\$(?<salt>[A-Za-z0-9+\/]{22})\$(?<digest>[A-Za-z0-9+\/]{43})$/', $hash, $matches)) {
            return false;
        }

        $m = (int) $matches['m'];
        $t = (int) $matches['t'];
        $p = (int) $matches['p'];

        if ($m < 1024 || $m > 262144 || $t < 1 || $t > 10 || $p < 1 || $p > 4) {
            return false;
        }

        $salt = $matches['salt'];
        $digest = $matches['digest'];

        // Strict canonical base64 decode and re-encode:
        // 1. Salt must decode to exactly 16 bytes matching native PHP hash generation
        $saltDecoded = base64_decode($salt, true);
        if ($saltDecoded === false || strlen($saltDecoded) !== 16) {
            return false;
        }
        // Salt must be canonical unpadded base64 without non-canonical unused tail bits
        if (rtrim(base64_encode($saltDecoded), '=') !== $salt) {
            return false;
        }

        // 2. Digest must decode to exactly 32 bytes matching native PHP hash generation
        $digestDecoded = base64_decode($digest, true);
        if ($digestDecoded === false || strlen($digestDecoded) !== 32) {
            return false;
        }
        // Digest must be canonical unpadded base64 without non-canonical unused tail bits
        if (rtrim(base64_encode($digestDecoded), '=') !== $digest) {
            return false;
        }

        return true;
    }

    /**
     * Verify password against stored hash.
     * Enforces strict validation of stored hash structure and cost bounds BEFORE native verification
     * to prevent attacker-controlled memory/time DoS allocations.
     */
    public function verify(#[\SensitiveParameter] string $password, #[\SensitiveParameter] string $hash): bool
    {
        if (strlen($password) > PasswordPolicy::MAX_BYTES || !mb_check_encoding($password, 'UTF-8')) {
            return false;
        }

        if (!self::isValidStoredHashStructure($hash)) {
            return false;
        }

        $info = password_get_info($hash);
        if ($info['algo'] !== PASSWORD_ARGON2ID && ($info['algoName'] ?? '') !== 'argon2id') {
            return false;
        }

        return password_verify($password, $hash);
    }

    /**
     * Determine if given hash needs rehash against current parameters.
     */
    public function needsRehash(#[\SensitiveParameter] string $hash): bool
    {
        if (!self::isValidStoredHashStructure($hash)) {
            return true;
        }

        $info = password_get_info($hash);
        if ($info['algo'] !== PASSWORD_ARGON2ID && ($info['algoName'] ?? '') !== 'argon2id') {
            return true;
        }

        return password_needs_rehash(
            $hash,
            PASSWORD_ARGON2ID,
            [
                'memory_cost' => $this->memoryKib,
                'time_cost' => $this->timeCost,
                'threads' => $this->threads,
            ]
        );
    }

    /**
     * Benchmark runtime of hash generation.
     *
     * @return array{time_ms: float, memory_kib: int, time_cost: int, threads: int}
     */
    public function benchmark(
        #[\SensitiveParameter] string $samplePassword = 'benchmark-secret-password-123',
        string $realm = 'passenger'
    ): array {
        $start = microtime(true);
        $this->hash($samplePassword, $realm);
        $durationMs = (microtime(true) - $start) * 1000.0;

        return [
            'time_ms' => round($durationMs, 2),
            'memory_kib' => $this->memoryKib,
            'time_cost' => $this->timeCost,
            'threads' => $this->threads,
        ];
    }
}
