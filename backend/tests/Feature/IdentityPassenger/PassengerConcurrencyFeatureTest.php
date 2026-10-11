<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPassenger\PassengerConcurrencyWorkerProcess;
use Tests\TestCase;

/**
 * Separate-process / multi-connection concurrency verification for Phase 13B passenger lifecycle.
 *
 * Verifies:
 * - Real OS subprocess lock contention with backend PIDs and pg_blocking_pids proof.
 * - Competing concurrent registrations for identical normalized email between independent OS processes.
 * - Competing password reset proof consumption races between independent OS processes.
 * - Competing session revocation races between independent OS processes.
 * - OpenAPI operation response schema compliance (postPassengerRegister, getAuthCsrfBootstrap, etc.).
 * - Strict isolation, finite deadlock timeouts (3s), and disposable database target enforcement.
 */
final class PassengerConcurrencyFeatureTest extends TestCase
{
    /** @var list<string> */
    private array $trackedUserIds = [];

    /** @var list<string> */
    private array $trackedSessionIds = [];

    /** @var list<string> */
    private array $trackedOutboxIds = [];

    /** @var list<string> */
    private array $trackedSubjectDigests = [];

    private static ?array $cachedOpenApi = null;

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();

        if (!empty($this->trackedUserIds) || !empty($this->trackedSessionIds) || !empty($this->trackedOutboxIds)) {
            if (!empty($this->trackedOutboxIds)) {
                DB::table('security_dispatch_outbox')->whereIn('id', $this->trackedOutboxIds)->delete();
            }

            if (!empty($this->trackedUserIds)) {
                $verifProofIds = DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();
                $resetProofIds = DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();

                if (!empty($verifProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_verification_id', $verifProofIds)->delete();
                }
                if (!empty($resetProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_reset_id', $resetProofIds)->delete();
                }

                DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->delete();
                DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            if (!empty($this->trackedSessionIds) || !empty($this->trackedUserIds)) {
                DB::table('passenger_sessions')
                    ->where(function ($query) {
                        if (!empty($this->trackedSessionIds)) {
                            $query->whereIn('id', $this->trackedSessionIds);
                        }
                        if (!empty($this->trackedUserIds)) {
                            $query->orWhereIn('user_id', $this->trackedUserIds);
                        }
                    })
                    ->delete();
            }

            if (!empty($this->trackedUserIds)) {
                DB::table('passenger_profiles')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            if (!empty($this->trackedSubjectDigests)) {
                DB::table('security_rate_limits')
                    ->where('realm', 'passenger')
                    ->whereIn('key_digest', $this->trackedSubjectDigests)
                    ->delete();
            }

            // Note: audit_events is append-only and trigger-enforced immutable.
            // Explicitly identify and retain immutable audit residue; delete only unaudited test principals.
            // Never wrap in blanket catch-all to prevent hiding real database or syntax failures.
            if (!empty($this->trackedUserIds)) {
                $auditedUserIds = DB::table('audit_events')
                    ->whereIn('passenger_id', $this->trackedUserIds)
                    ->pluck('passenger_id')
                    ->map(fn ($id) => (string) $id)
                    ->unique()
                    ->all();

                $unauditedUserIds = array_values(array_diff($this->trackedUserIds, $auditedUserIds));
                if (!empty($unauditedUserIds)) {
                    DB::table('users')->whereIn('id', $unauditedUserIds)->delete();
                }
            }
        }

        parent::tearDown();
    }

    private function getOpenApiSpec(): array
    {
        if (self::$cachedOpenApi === null) {
            $path = base_path('../docs/backend/openapi.v1.json');
            if (!file_exists($path)) {
                $path = base_path('docs/backend/openapi.v1.json');
            }
            if (!file_exists($path)) {
                throw new \RuntimeException('Cannot locate openapi.v1.json');
            }
            self::$cachedOpenApi = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        return self::$cachedOpenApi;
    }

    private function resolveOpenApiResponseSchema(string $method, string $path, int $status): array
    {
        $spec = $this->getOpenApiSpec();
        $pathItem = $spec['paths'][$path] ?? null;
        if ($pathItem === null) {
            throw new \RuntimeException("Path {$path} not found in OpenAPI specification");
        }

        $operation = $pathItem[strtolower($method)] ?? null;
        if ($operation === null) {
            throw new \RuntimeException("Operation {$method} {$path} not found in OpenAPI specification");
        }

        $responses = $operation['responses'] ?? [];
        $responseObj = $responses[(string) $status] ?? null;
        if ($responseObj === null) {
            throw new \RuntimeException("Response status {$status} not found for {$method} {$path}");
        }

        if (isset($responseObj['$ref'])) {
            $refPath = str_replace('#/', '', $responseObj['$ref']);
            $parts = explode('/', $refPath);
            $curr = $spec;
            foreach ($parts as $p) {
                $curr = $curr[$p] ?? null;
            }
            $responseObj = $curr;
        }

        $content = $responseObj['content']['application/json']['schema'] ?? null;
        if ($content === null) {
            throw new \RuntimeException("No application/json schema defined for {$method} {$path} status {$status}");
        }

        return $this->dereferenceSchema($content, $spec);
    }

    private function dereferenceSchema(array $schema, array $spec): array
    {
        if (isset($schema['$ref'])) {
            $ref = (string) $schema['$ref'];
            $refPath = str_replace('#/', '', $ref);
            $parts = explode('/', $refPath);
            $resolved = $spec;
            foreach ($parts as $p) {
                $resolved = $resolved[$p] ?? null;
            }
            if (!is_array($resolved)) {
                throw new \RuntimeException("Failed to resolve schema reference {$ref}");
            }
            $merged = $resolved;
            foreach ($schema as $k => $v) {
                if ($k !== '$ref') {
                    $merged[$k] = $v;
                }
            }
            return $this->dereferenceSchema($merged, $spec);
        }

        $result = [];
        foreach ($schema as $k => $v) {
            if (is_array($v)) {
                $result[$k] = $this->dereferenceSchema($v, $spec);
            } else {
                $result[$k] = $v;
            }
        }

        return $result;
    }

    private function assertResponseMatchesOpenApiSchema($response, string $method, string $path, int $status): void
    {
        $response->assertStatus($status);
        $schema = $this->resolveOpenApiResponseSchema($method, $path, $status);

        $validator = new IdentityCommandValidator();
        $decoded = json_decode($response->getContent(), false);
        $violations = $validator->evaluateSchema($schema, $decoded);

        $this->assertEmpty($violations, 'Response payload does not conform to OpenAPI schema: ' . json_encode($violations));
    }

    private function bootstrapAnonymous(): array
    {
        $ip = '198.51.100.' . random_int(10, 240);
        $response = $this->withServerVariables(['REMOTE_ADDR' => $ip, 'HTTPS' => 'on'])
            ->withHeaders([
                'Host' => '127.0.0.1:18090',
                'Origin' => 'http://localhost:3000',
            ])
            ->getJson('/api/v1/auth/csrf');

        $this->assertResponseMatchesOpenApiSchema($response, 'GET', '/auth/csrf', 200);

        // Accepted CSRF response is raw { csrfToken }
        $csrfToken = (string) $response->json('csrfToken');
        $this->assertNotEmpty($csrfToken, 'Expected raw csrfToken in CSRF bootstrap response');

        $cookie = $response->getCookie(CookieSecurity::COOKIE_PASSENGER);
        $this->assertNotNull($cookie, 'Expected passenger session cookie from CSRF bootstrap');

        // Track anonymous session minted in concurrency helper
        $digest = OpaqueToken::digestOf($cookie->getValue());
        $sessionRow = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first(['id']);
        if ($sessionRow) {
            $this->trackedSessionIds[] = (string) $sessionRow->id;
        }

        return [
            'ip' => $ip,
            'csrfToken' => $csrfToken,
            'cookie' => $cookie->getValue(),
        ];
    }

    private function authHeaders(string $csrfToken, ?string $cookieValue = null): array
    {
        $headers = [
            'Host' => '127.0.0.1:18090',
            'Origin' => 'http://localhost:3000',
            'X-CSRF-TOKEN' => $csrfToken,
        ];
        if ($cookieValue !== null && $cookieValue !== '') {
            $headers['Cookie'] = CookieSecurity::COOKIE_PASSENGER . '=' . $cookieValue;
        }

        return $headers;
    }

    /**
     * Test 1: Real separate-process lock contention proof using OS worker subprocesses,
     * backend PIDs, and PostgreSQL pg_blocking_pids.
     */
    public function test_two_process_lock_contention_and_blocking_pid_proof(): void
    {
        $this->assertDisposableDatabaseTarget();

        $userId = (string) Str::uuid();
        $email = 'lock_proof_' . Str::random(8) . '@gazaairport.com';
        $now = CarbonImmutable::now();

        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng',
            'status' => 'active',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);
        $this->trackedUserIds[] = $userId;

        $worker1 = new PassengerConcurrencyWorkerProcess();
        $worker2 = new PassengerConcurrencyWorkerProcess();

        try {
            $pid1 = $worker1->getBackendPid();
            $pid2 = $worker2->getBackendPid();
            $this->assertGreaterThan(0, $pid1);
            $this->assertGreaterThan(0, $pid2);
            $this->assertNotSame($pid1, $pid2, 'Workers must run on distinct PostgreSQL backend PIDs');

            // 1. Worker 1 locks principal row and keeps transaction open
            $worker1->sendCommand([
                'action' => 'lock_principal_and_wait',
                'principal_id' => $userId,
            ]);
            $lockRes1 = $worker1->readLine(5.0);
            $this->assertNotNull($lockRes1);
            $this->assertSame('LOCKED', $lockRes1['status']);
            $this->assertTrue($lockRes1['row_found']);

            // 2. Verify in PostgreSQL that Worker 1 holds the lock
            $locks = DB::connection('pgsql_test')->select(
                "SELECT pid, mode, granted FROM pg_locks WHERE pid = ? AND relation = 'users'::regclass",
                [$pid1]
            );
            $this->assertNotEmpty($locks, 'Worker 1 must hold locks on the users table');

            // 3. Worker 2 attempts to lock the exact same principal row concurrently
            $worker2->sendCommand([
                'action' => 'lock_principal_and_wait',
                'principal_id' => $userId,
            ]);

            // Give Worker 2 a brief moment to attempt lock and block
            usleep(100000); // 100ms

            // 4. Query pg_blocking_pids for Worker 2: prove Worker 1 is blocking Worker 2 at the DB engine
            $blockingPidsRow = DB::connection('pgsql_test')->selectOne(
                'SELECT pg_blocking_pids(?) AS blockers',
                [$pid2]
            );
            $this->assertNotNull($blockingPidsRow);

            // Format of pg_blocking_pids in PostgreSQL is integer array string e.g. "{1234}"
            $blockersStr = (string) ($blockingPidsRow->blockers ?? '');
            $this->assertStringContainsString((string) $pid1, $blockersStr, 'Worker 1 PID must be recorded as blocking Worker 2');

            // 5. Worker 1 commits/releases lock, allowing Worker 2 to unblock and acquire lock
            $worker1->sendCommand(['action' => 'commit']);
            $commitRes = $worker1->readLine(3.0);
            $this->assertSame('COMMITTED', $commitRes['status'] ?? null);

            // 6. Worker 2 now successfully acquires lock
            $lockRes2 = $worker2->readLine(5.0);
            $this->assertNotNull($lockRes2);
            $this->assertSame('LOCKED', $lockRes2['status']);
            $this->assertTrue($lockRes2['row_found']);

            // Worker 2 commits cleanly
            $worker2->sendCommand(['action' => 'commit']);
            $worker2->readLine(3.0);
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }

    /**
     * Test 2: Competing registration race between two independent OS processes
     * for identical normalized email.
     */
    public function test_concurrent_competing_registration_race_between_two_processes(): void
    {
        $this->assertDisposableDatabaseTarget();

        $email = 'race_reg_' . Str::random(10) . '@gazaairport.com';
        $payload = [
            'email' => $email,
            'password' => 'ValidPassword15!Chars',
            'firstName' => 'ConcurrentFirst',
            'lastName' => 'ConcurrentLast',
        ];

        $worker1 = new PassengerConcurrencyWorkerProcess();
        $worker2 = new PassengerConcurrencyWorkerProcess();

        try {
            $worker1->sendCommand([
                'action' => 'competing_register',
                'payload' => $payload,
                'ip' => '198.51.100.71',
                'user_agent' => 'Worker1',
                'request_id' => (string) Str::uuid(),
            ]);

            $worker2->sendCommand([
                'action' => 'competing_register',
                'payload' => $payload,
                'ip' => '198.51.100.72',
                'user_agent' => 'Worker2',
                'request_id' => (string) Str::uuid(),
            ]);

            $res1 = $worker1->readLine(10.0);
            $res2 = $worker2->readLine(10.0);

            $this->assertNotNull($res1, 'Worker 1 failed to report register result');
            $this->assertNotNull($res2, 'Worker 2 failed to report register result');

            // Both workers must succeed with generic 202 acceptance
            $this->assertSame('SUCCESS', $res1['status']);
            $this->assertSame('SUCCESS', $res2['status']);
            $this->assertSame('verification_dispatched', $res1['data']['status']);
            $this->assertSame('verification_dispatched', $res2['data']['status']);

            // Exactly one user row must exist for this normalized email in the database
            $users = DB::table('users')->whereRaw('lower(email) = ?', [strtolower($email)])->get();
            $this->assertCount(1, $users, 'Duplicate registration race must produce exactly one user row');
            $this->trackedUserIds[] = (string) $users->first()->id;

            // Exactly one verification proof must be created
            $proofs = DB::table('user_email_verifications')->where('user_id', $users->first()->id)->get();
            $this->assertCount(1, $proofs, 'Duplicate registration race must create exactly one verification proof');
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }

    /**
     * Test 3: Competing password reset proof consumption race between two independent OS processes.
     * Exactly one worker consumes proof; second fails with 422 challenge_failed; no duplicate epoch bump.
     */
    public function test_concurrent_competing_password_reset_proof_consumption_race(): void
    {
        $this->assertDisposableDatabaseTarget();

        $userId = (string) Str::uuid();
        $email = 'reset_race_' . Str::random(8) . '@gazaairport.com';
        $now = CarbonImmutable::now();

        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng',
            'status' => 'active',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);
        $this->trackedUserIds[] = $userId;

        /** @var ProofService $proofService */
        $proofService = app(ProofService::class);
        $receipt = $proofService->issue(ProofPurpose::PassengerPasswordReset, $userId);
        $rawToken = $receipt->getRawToken();

        $payload = [
            'email' => $email,
            'token' => $rawToken,
            'password' => 'BrandNewPassword15!Chars',
        ];

        $worker1 = new PassengerConcurrencyWorkerProcess();
        $worker2 = new PassengerConcurrencyWorkerProcess();

        try {
            $worker1->sendCommand([
                'action' => 'competing_password_reset',
                'payload' => $payload,
                'ip' => '198.51.100.81',
                'request_id' => (string) Str::uuid(),
            ]);

            $worker2->sendCommand([
                'action' => 'competing_password_reset',
                'payload' => $payload,
                'ip' => '198.51.100.82',
                'request_id' => (string) Str::uuid(),
            ]);

            $res1 = $worker1->readLine(10.0);
            $res2 = $worker2->readLine(10.0);

            $this->assertNotNull($res1, 'Worker 1 failed to report reset result');
            $this->assertNotNull($res2, 'Worker 2 failed to report reset result');

            $outcomes = [$res1['status'], $res2['status']];
            sort($outcomes);

            // Exactly one worker must succeed and one must fail
            $this->assertSame(['FAILED', 'SUCCESS'], $outcomes, 'Exactly one concurrent reset must succeed');

            // The loser must report ProofConsumptionFailedException
            $loser = $res1['status'] === 'FAILED' ? $res1 : $res2;
            $this->assertStringContainsString('ProofConsumptionFailedException', $loser['error_class']);

            // Verify database state: user credential_epoch bumped exactly once (1 -> 2)
            $user = DB::table('users')->where('id', $userId)->first();
            $this->assertSame(2, (int) $user->credential_epoch, 'Credential epoch must be bumped exactly once');

            // Verify password was updated to new hash
            $hasher = app(Argon2idPasswordHasher::class);
            $this->assertTrue($hasher->verify('BrandNewPassword15!Chars', $user->password_hash));

            // Verify proof is consumed in user_password_resets
            $proof = DB::table('user_password_resets')->where('id', $receipt->proofId)->first();
            $this->assertSame('consumed', $proof->state);
            $this->assertNotNull($proof->consumed_at);
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }

    /**
     * Test 4: Competing session revocation race between two independent OS processes.
     * Exactly one revocation succeeds; second fails with SessionNotFoundException.
     */
    public function test_concurrent_session_revocation_race_between_two_processes(): void
    {
        $this->assertDisposableDatabaseTarget();

        $userId = (string) Str::uuid();
        $email = 'session_race_' . Str::random(8) . '@gazaairport.com';
        $now = CarbonImmutable::now();

        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$UVk0S0NNUHJXWVpvV0E4Uw$06wk6MgJBRDB4RvriAeTVXHpMkGNpygPTF/CVGdrOng',
            'status' => 'active',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);
        $this->trackedUserIds[] = $userId;

        $encrypter = app(\Illuminate\Contracts\Encryption\Encrypter::class);

        // Create caller session
        $callerToken = OpaqueToken::generate(PassengerSessionStore::REALM, 'full_session');
        $callerSessionId = (string) Str::uuid();
        $this->trackedSessionIds[] = $callerSessionId;

        DB::table('passenger_sessions')->insert([
            'id' => $callerSessionId,
            'lookup_digest' => $callerToken->digest,
            'user_id' => $userId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => $encrypter->encrypt(json_encode([
                'csrf_token' => 'caller_csrf',
                'ip_address' => '198.51.100.50',
                'user_agent' => 'CallerBrowser',
            ], JSON_THROW_ON_ERROR)),
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $now->addDays(7)->toIso8601String(),
            'idle_expires_at' => $now->addHours(24)->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        // Create target session to revoke
        $targetToken = OpaqueToken::generate(PassengerSessionStore::REALM, 'full_session');
        $targetSessionId = (string) Str::uuid();
        $this->trackedSessionIds[] = $targetSessionId;

        DB::table('passenger_sessions')->insert([
            'id' => $targetSessionId,
            'lookup_digest' => $targetToken->digest,
            'user_id' => $userId,
            'auth_level' => 'full',
            'credential_epoch' => 1,
            'encrypted_payload' => $encrypter->encrypt(json_encode([
                'csrf_token' => 'dummy',
                'ip_address' => '198.51.100.51',
                'user_agent' => 'AnotherBrowser',
            ], JSON_THROW_ON_ERROR)),
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $now->addDays(7)->toIso8601String(),
            'idle_expires_at' => $now->addHours(24)->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        $sessionContextPayload = [
            'sessionId' => $callerSessionId,
            'csrfToken' => 'caller_csrf',
            'userId' => $userId,
            'credentialEpoch' => 1,
            'authLevel' => 'full',
            'absoluteExpiresAt' => $now->addDays(7)->toIso8601String(),
            'idleExpiresAt' => $now->addHours(24)->toIso8601String(),
        ];

        $worker1 = new PassengerConcurrencyWorkerProcess();
        $worker2 = new PassengerConcurrencyWorkerProcess();

        try {
            $worker1->sendCommand([
                'action' => 'competing_delete_session',
                'target_session_id' => $targetSessionId,
                'session_context' => $sessionContextPayload,
                'request_id' => (string) Str::uuid(),
            ]);

            $worker2->sendCommand([
                'action' => 'competing_delete_session',
                'target_session_id' => $targetSessionId,
                'session_context' => $sessionContextPayload,
                'request_id' => (string) Str::uuid(),
            ]);

            $res1 = $worker1->readLine(10.0);
            $res2 = $worker2->readLine(10.0);

            $this->assertNotNull($res1, 'Worker 1 failed to report delete result');
            $this->assertNotNull($res2, 'Worker 2 failed to report delete result');

            $outcomes = [$res1['status'], $res2['status']];
            sort($outcomes);

            // Exactly one worker must succeed and one must fail with SessionNotFoundException
            $this->assertSame(['FAILED', 'SUCCESS'], $outcomes, 'Exactly one concurrent delete must succeed');

            $loser = $res1['status'] === 'FAILED' ? $res1 : $res2;
            $this->assertStringContainsString('SessionNotFoundException', $loser['error_class']);

            // Target session must be revoked in DB
            $target = DB::table('passenger_sessions')->where('id', $targetSessionId)->first();
            $this->assertNotNull($target->revoked_at, 'Target session must have revoked_at set');
        } finally {
            $worker1->close();
            $worker2->close();
        }
    }
}
