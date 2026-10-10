<?php

declare(strict_types=1);

namespace Tests\Unit\Identity;

use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Password\PasswordPolicy;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class Argon2idPasswordHasherTest extends TestCase
{
    public function test_real_argon2id_hashing_and_verification(): void
    {
        $hasher = new Argon2idPasswordHasher(
            memoryKib: 65536,
            timeCost: 4,
            threads: 1,
        );

        $password = 'SecretPassword123#Testing!';
        $hash = $hasher->hash($password, 'passenger');

        // Assert Argon2id identifier in hash string
        $this->assertStringStartsWith('$argon2id$v=19$m=65536,t=4,p=1$', $hash);

        // Assert native password_get_info metadata
        $info = password_get_info($hash);
        $this->assertSame(PASSWORD_ARGON2ID, $info['algo']);
        $this->assertSame('argon2id', $info['algoName']);
        $this->assertSame(65536, $info['options']['memory_cost']);
        $this->assertSame(4, $info['options']['time_cost']);
        $this->assertSame(1, $info['options']['threads']);

        // Verification passes for correct password
        $this->assertTrue($hasher->verify($password, $hash));

        // Verification fails for incorrect password
        $this->assertFalse($hasher->verify('WrongPassword123#', $hash));

        // Needs rehash returns false for matching parameters
        $this->assertFalse($hasher->needsRehash($hash));
    }

    public function test_constructor_bounds_fail_closed_on_weaker_parameters(): void
    {
        // 1. Weaker memory rejected
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('violates security floor bounds');
        new Argon2idPasswordHasher(memoryKib: 8, timeCost: 4, threads: 1);
    }

    public function test_constructor_bounds_reject_weaker_time_cost(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('violates security floor bounds');
        new Argon2idPasswordHasher(memoryKib: 65536, timeCost: 1, threads: 1);
    }

    public function test_constructor_bounds_reject_invalid_threads(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('violates security policy bounds');
        new Argon2idPasswordHasher(memoryKib: 65536, timeCost: 4, threads: 2);
    }

    public function test_hash_rejects_invalid_utf8_and_oversized_payload_before_computation(): void
    {
        $hasher = new Argon2idPasswordHasher();

        // Oversized payload (> 4096 bytes) rejected before UTF-8 scan
        try {
            $hasher->hash(str_repeat('A', PasswordPolicy::MAX_BYTES + 1), 'passenger');
            $this->fail('Should have rejected oversized payload');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Password exceeds maximum permitted length.', $e->getMessage());
        }

        // Invalid UTF-8
        try {
            $hasher->hash("invalid\xFF\xFEbytes12345678", 'passenger');
            $this->fail('Should have rejected invalid UTF-8 bytes');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Password must be valid UTF-8 character data.', $e->getMessage());
        }
    }

    public function test_hash_enforces_realm_specific_policy_validation(): void
    {
        $hasher = new Argon2idPasswordHasher();

        // Passenger password under 15 characters rejected
        try {
            $hasher->hash('ShortPass123#', 'passenger');
            $this->fail('Should have rejected passenger password under 15 codepoints');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Password does not satisfy policy requirements.', $e->getMessage());
        }

        // Staff password under 12 characters rejected
        try {
            $hasher->hash('Short123#', 'staff');
            $this->fail('Should have rejected staff password under 12 codepoints');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Password does not satisfy policy requirements.', $e->getMessage());
        }

        // Unknown realm rejected with fixed safe message
        try {
            $hasher->hash('ValidLengthSecretPassword123#', 'invalid_realm');
            $this->fail('Should have rejected invalid realm');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('Invalid password realm.', $e->getMessage());
        }
    }

    public function test_verification_rejects_non_argon2id_hashes_and_malformed_inputs(): void
    {
        $hasher = new Argon2idPasswordHasher();
        $password = 'SecretPassword123#Testing!';

        // Non-Argon2id (bcrypt) hash must fail closed
        $bcryptHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
        $this->assertFalse($hasher->verify($password, $bcryptHash));

        // Malformed hash strings
        $this->assertFalse($hasher->verify($password, 'invalid-hash-string'));
        $this->assertFalse($hasher->verify($password, ''));

        // Huge memory attacker hash rejected before native verify (prevents DoS)
        $hugeHash = '$argon2id$v=19$m=1048576,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
        $this->assertFalse($hasher->verify($password, $hugeHash));

        // Fake hash with short salt/digest rejected
        $fakeShortHash = '$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$c29tZWhhc2g';
        $this->assertFalse($hasher->verify($password, $fakeShortHash));

        // Oversized password on verify fails closed
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
        $this->assertFalse($hasher->verify(str_repeat('X', PasswordPolicy::MAX_BYTES + 1), $validHash));

        // Needs rehash returns true for non-Argon2id
        $this->assertTrue($hasher->needsRehash($bcryptHash));
    }

    public function test_shared_is_valid_stored_hash_structure_rules(): void
    {
        $valid = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
        $this->assertTrue(Argon2idPasswordHasher::isValidStoredHashStructure($valid));

        // Reject fake hashes with short salt / digest
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$c29tZWhhc2g'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$invalid'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure(''));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure(null));

        // Exact negative control: salt length 16 (12 bytes decoded), digest length 32 (24 bytes decoded)
        $shortDecoded = '$argon2id$v=19$m=65536,t=4,p=1$' . str_repeat('A', 16) . '$' . str_repeat('A', 32);
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure($shortDecoded));

        // Exact negative control: non-canonical unused base64 tail bits
        $nonCanonicalTail = '$argon2id$v=19$m=65536,t=4,p=1$' . str_repeat('A', 21) . 'B' . '$' . str_repeat('A', 42) . 'B';
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure($nonCanonicalTail));

        // Reject unsupported versions
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=18$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));

        // Reject out-of-bounds costs
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=1048576,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=512,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=65536,t=0,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=65536,t=11,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));
        $this->assertFalse(Argon2idPasswordHasher::isValidStoredHashStructure('$argon2id$v=19$m=65536,t=4,p=5$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo'));
    }

    public function test_laravel_hash_facade_pins_argon2id_driver_and_accepted_parameters(): void
    {
        $this->assertSame('argon2id', Hash::getDefaultDriver());

        $password = 'LaravelFacadeArgon2idTest123#';
        $hash = Hash::make($password);

        $this->assertStringStartsWith('$argon2id$v=19$m=65536,t=4,p=1$', $hash);

        $info = password_get_info($hash);
        $this->assertSame(PASSWORD_ARGON2ID, $info['algo']);
        $this->assertSame('argon2id', $info['algoName']);
        $this->assertSame(65536, $info['options']['memory_cost']);
        $this->assertSame(4, $info['options']['time_cost']);
        $this->assertSame(1, $info['options']['threads']);

        $this->assertTrue(Hash::check($password, $hash));
        $this->assertFalse(Hash::check('WrongPassword123#', $hash));
        $this->assertFalse(Hash::needsRehash($hash));
    }

    public function test_needs_rehash_detects_outdated_cost_parameters(): void
    {
        $hasher = new Argon2idPasswordHasher(
            memoryKib: 65536,
            timeCost: 4,
            threads: 1,
        );

        // Sane older hash with weaker parameters verifies and needs rehash
        $oldHash = password_hash('test-password-123456', PASSWORD_ARGON2ID, [
            'memory_cost' => 16384,
            'time_cost' => 2,
            'threads' => 1,
        ]);

        $this->assertTrue($hasher->verify('test-password-123456', $oldHash));
        $this->assertTrue($hasher->needsRehash($oldHash));
    }

    public function test_benchmark_executes_and_returns_performance_metrics(): void
    {
        $hasher = new Argon2idPasswordHasher(
            memoryKib: 65536,
            timeCost: 4,
            threads: 1,
        );

        $metrics = $hasher->benchmark('sample-benchmark-password-12345', 'passenger');

        $this->assertArrayHasKey('time_ms', $metrics);
        $this->assertArrayHasKey('memory_kib', $metrics);
        $this->assertSame(65536, $metrics['memory_kib']);
        $this->assertSame(4, $metrics['time_cost']);
        $this->assertSame(1, $metrics['threads']);
        $this->assertGreaterThan(0.0, $metrics['time_ms']);
    }
}
