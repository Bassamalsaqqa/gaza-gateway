<?php

declare(strict_types=1);

namespace App\Identity\RateLimiting;

use App\Identity\Sessions\AnonymousSessionCleanup;
use App\Identity\Sessions\SessionReceipt;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class AnonymousBootstrapAdmission
{
    public const REALM_PASSENGER = 'passenger';
    public const REALM_STAFF = 'staff';
    public const ALLOWED_REALMS = [self::REALM_PASSENGER, self::REALM_STAFF];

    // Directed policy maximum upper bounds
    public const MAX_IP_LIMIT = 10;
    public const MAX_GLOBAL_LIMIT = 300;
    public const MAX_WINDOW_SECONDS = 300;
    public const MAX_RETAINED_CAP = 10000;
    public const MAX_CLEANUP_BATCH = 100;

    public const DEFAULT_IP_LIMIT = 10;
    public const DEFAULT_GLOBAL_LIMIT = 300;
    public const DEFAULT_WINDOW_SECONDS = 300;
    public const DEFAULT_RETAINED_CAP = 10000;
    public const DEFAULT_CLEANUP_BATCH = 100;
    public const ANONYMOUS_SESSION_TTL = 1800; // 30 minutes

    private CarbonImmutable|\Closure|null $testClock = null;

    private ?int $testIpLimit = null;
    private ?int $testGlobalLimit = null;
    private ?int $testRetainedCap = null;
    private ?int $testWindowSeconds = null;
    private ?string $testFaultHook = null;

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly Encrypter $encrypter,
        private readonly AnonymousSessionCleanup $cleanupService,
    ) {
    }

    /**
     * Testing seam for deterministic test clock injection.
     * Strictly restricted to testing environment and resolved PostgreSQL test DB.
     * Propagates clock to cleanup service to preserve synchronized testing deadlines.
     */
    public function setClock(CarbonImmutable|\Closure|null $clock): void
    {
        $this->assertTestingEnvironment();
        $this->testClock = $clock;
        $this->cleanupService->setClock($clock);
    }

    /**
     * Testing seam for lowering limits in focused test scenarios.
     * Strictly restricted to testing environment and resolved PostgreSQL test DB.
     * Tests may lower only; cannot raise limits above directed policy maximums.
     */
    public function setTestLimits(
        ?int $ipLimit = null,
        ?int $globalLimit = null,
        ?int $retainedCap = null,
        ?int $windowSeconds = null
    ): void {
        $this->assertTestingEnvironment();

        if ($ipLimit !== null && ($ipLimit < 1 || $ipLimit > self::MAX_IP_LIMIT)) {
            throw new \InvalidArgumentException(
                sprintf('Test ip limit must be strictly between 1 and %d.', self::MAX_IP_LIMIT)
            );
        }

        if ($globalLimit !== null && ($globalLimit < 1 || $globalLimit > self::MAX_GLOBAL_LIMIT)) {
            throw new \InvalidArgumentException(
                sprintf('Test global limit must be strictly between 1 and %d.', self::MAX_GLOBAL_LIMIT)
            );
        }

        if ($retainedCap !== null && ($retainedCap < 1 || $retainedCap > self::MAX_RETAINED_CAP)) {
            throw new \InvalidArgumentException(
                sprintf('Test retained cap must be strictly between 1 and %d.', self::MAX_RETAINED_CAP)
            );
        }

        if ($windowSeconds !== null && ($windowSeconds < 1 || $windowSeconds > self::MAX_WINDOW_SECONDS)) {
            throw new \InvalidArgumentException(
                sprintf('Test window seconds must be strictly between 1 and %d.', self::MAX_WINDOW_SECONDS)
            );
        }

        $this->testIpLimit = $ipLimit;
        $this->testGlobalLimit = $globalLimit;
        $this->testRetainedCap = $retainedCap;
        $this->testWindowSeconds = $windowSeconds;
    }

    public function setTestFaultHook(?string $hook): void
    {
        $this->assertTestingEnvironment();
        if ($hook !== null && !in_array($hook, ['after_counter_increment', 'after_session_insert'], true)) {
            throw new \InvalidArgumentException('Unknown test fault hook.');
        }
        $this->testFaultHook = $hook;
    }

    public function resetTestLimits(): void
    {
        $this->assertTestingEnvironment();
        $this->testIpLimit = null;
        $this->testGlobalLimit = null;
        $this->testRetainedCap = null;
        $this->testWindowSeconds = null;
        $this->testClock = null;
        $this->testFaultHook = null;
        $this->cleanupService->setClock(null);
    }

    private function assertTestingEnvironment(): void
    {
        if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
            throw new \LogicException('Testing overrides are strictly restricted to testing environment and test database.');
        }

        $row = $this->db->selectOne('SELECT current_database() AS db_name');
        if (($row->db_name ?? '') !== 'gaza_gateway_test') {
            throw new \LogicException('Testing overrides are strictly restricted to testing environment and test database.');
        }
    }

    private function getNow(): CarbonImmutable
    {
        if ($this->testClock instanceof \Closure) {
            return ($this->testClock)();
        }
        return $this->testClock ?? CarbonImmutable::now();
    }

    /**
     * Resolve canonical transport peer IP from request.
     * Enforces conservative transport peer policy: strictly reads REMOTE_ADDR only.
     * MUST NOT fall back to Request::ip() to prevent unauthorized proxy header trust.
     * Canonicalizes standard IPv6 representations and maps IPv4-mapped IPv6 (::ffff:x.x.x.x) to IPv4.
     */
    public static function resolveCanonicalSourceIp(Request $request): ?string
    {
        $rawIp = $request->server('REMOTE_ADDR');
        if (!is_string($rawIp) || $rawIp === '') {
            return null;
        }

        if (filter_var($rawIp, FILTER_VALIDATE_IP) === false) {
            return null;
        }

        $packed = inet_pton($rawIp);
        if ($packed === false) {
            return null;
        }

        // Canonicalize IPv4-mapped IPv6 (::ffff:192.0.2.1) to standard IPv4 (192.0.2.1)
        if (strlen($packed) === 16 && str_starts_with($packed, "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff")) {
            return inet_ntop(substr($packed, 12, 4));
        }

        return inet_ntop($packed);
    }

    /**
     * Atomically evaluate admission and issue an anonymous session in one outer transaction.
     * Enforces:
     * 1. Rejection of admission if an external transaction is already active.
     * 2. Fixed canonical realm validation.
     * 3. Canonical source IP validation and canonicalization (strictly fail closed).
     * 4. Strict configuration validation without silent casting.
     * 5. Opportunistic cleanup before admission; failure fails closed.
     * 6. Finite local PostgreSQL statement and lock deadlines (SET LOCAL).
     * 7. Per-realm exclusive transaction lock to serialize count checks under real concurrency.
     * 8. Fresh retained row count check against hard cap.
     * 9. Deterministic global budget lock/check BEFORE creating any per-source row.
     * 10. Source IP budget lock/check.
     * 11. Atomic session issuance and bucket counter increments inside the same transaction.
     * 12. Window drift retry if time crosses window boundary during lock acquisition.
     */
    public function admitAndIssueAnonymous(string $realm, Request $request): AdmissionResult
    {
        // Invariant D: Reject admission inside an active external transaction
        if ($this->db->transactionLevel() > 0) {
            throw new \LogicException('Anonymous bootstrap admission must not be invoked within an active external transaction.');
        }

        if (!in_array($realm, self::ALLOWED_REALMS, true)) {
            throw new \InvalidArgumentException('Unknown admission realm.');
        }

        $canonicalIp = self::resolveCanonicalSourceIp($request);
        if ($canonicalIp === null) {
            // Missing or invalid source IP fails closed without database writes
            return AdmissionResult::denied(
                retryAfterSeconds: 60,
                reason: 'invalid_source_ip'
            );
        }

        // Validate configuration with strict positive integer checks without casting
        $config = config('identity.bootstrap', []);
        $configuredIp = $config['ip_limit'] ?? self::DEFAULT_IP_LIMIT;
        $configuredGlobal = $config['global_limit'] ?? self::DEFAULT_GLOBAL_LIMIT;
        $configuredWindow = $config['window_seconds'] ?? self::DEFAULT_WINDOW_SECONDS;
        $configuredCap = $config['retained_cap'] ?? self::DEFAULT_RETAINED_CAP;
        $configuredCleanupBatch = $config['cleanup_batch_size'] ?? self::DEFAULT_CLEANUP_BATCH;

        if (!is_int($configuredIp) || $configuredIp < 1 || $configuredIp > self::MAX_IP_LIMIT ||
            !is_int($configuredGlobal) || $configuredGlobal < 1 || $configuredGlobal > self::MAX_GLOBAL_LIMIT ||
            $configuredWindow !== self::DEFAULT_WINDOW_SECONDS ||
            !is_int($configuredCap) || $configuredCap < 1 || $configuredCap > self::MAX_RETAINED_CAP ||
            !is_int($configuredCleanupBatch) || $configuredCleanupBatch < 1 || $configuredCleanupBatch > self::MAX_CLEANUP_BATCH
        ) {
            throw new \InvalidArgumentException('Invalid bootstrap configuration: strictly bounded integers required.');
        }

        $ipLimit = $this->testIpLimit ?? $configuredIp;
        $globalLimit = $this->testGlobalLimit ?? $configuredGlobal;
        $windowSeconds = $this->testWindowSeconds ?? $configuredWindow;
        $retainedCap = $this->testRetainedCap ?? $configuredCap;
        $cleanupBatch = $configuredCleanupBatch;

        // 1. Opportunistic cleanup: bounded execution; failure fails closed
        $this->cleanupService->cleanRealmBatch($realm, $cleanupBatch);
        // Hourly maintenance alone cannot keep up with sustained admission traffic.
        // Bound stale bucket retention on the request path as well; failure stops issuance.
        $this->cleanupService->cleanBootstrapRateBuckets($cleanupBatch);

        // 2. Multi-attempt transaction loop with whole-transaction retry on window drift
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                return $this->db->transaction(function () use (
                    $realm,
                    $canonicalIp,
                    $ipLimit,
                    $globalLimit,
                    $windowSeconds,
                    $retainedCap
                ): AdmissionResult {
                    // Set finite local statement and lock timeouts for this transaction only
                    $this->db->statement("SET LOCAL statement_timeout = '3000ms';");
                    $this->db->statement("SET LOCAL lock_timeout = '2000ms';");

                    // Step A: Per-realm exclusive advisory transaction lock
                    $this->db->select(
                        'SELECT pg_advisory_xact_lock(hashtext(?))',
                        ['anonymous_bootstrap_admission:' . $realm]
                    );

                    // Step B: Hard retained-row cap check with fresh SQL count
                    $sessionTable = $realm === self::REALM_PASSENGER ? 'passenger_sessions' : 'staff_sessions';
                    $principalColumn = $realm === self::REALM_PASSENGER ? 'user_id' : 'staff_id';

                    $currentRetained = (int) $this->db->table($sessionTable)
                        ->whereNull($principalColumn)
                        ->where('auth_level', 'anonymous')
                        ->count();

                    if ($currentRetained >= $retainedCap) {
                        return AdmissionResult::denied(
                            retryAfterSeconds: 60,
                            reason: 'retained_capacity_exhausted',
                            budgetDetails: [
                                'retained' => $currentRetained,
                                'cap' => $retainedCap,
                            ]
                        );
                    }

                    // Step C: Window calculation based on fresh time
                    $now = $this->getNow();
                    $nowTimestamp = $now->getTimestamp();
                    $windowStartTimestamp = (int) (floor($nowTimestamp / $windowSeconds) * $windowSeconds);
                    $windowEndTimestamp = $windowStartTimestamp + $windowSeconds;
                    $windowStartIso = CarbonImmutable::createFromTimestamp($windowStartTimestamp)->toIso8601String();
                    $windowEndIso = CarbonImmutable::createFromTimestamp($windowEndTimestamp)->toIso8601String();

                    // Step D: Global budget check BEFORE creating per-source bucket row
                    $globalKeyDigest = hash('sha256', "bootstrap:global:{$realm}");

                    $this->db->statement(
                        'INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
                         VALUES (?, \'bootstrap\', \'global\', ?, ?, ?, 0)
                         ON CONFLICT (realm, operation_id, budget_id, key_digest, window_start) DO NOTHING',
                        [
                            $realm,
                            $globalKeyDigest,
                            $windowStartIso,
                            $windowEndIso,
                        ]
                    );

                    $globalRow = $this->db->selectOne(
                        'SELECT count, window_end FROM security_rate_limits
                         WHERE realm = ? AND operation_id = \'bootstrap\' AND budget_id = \'global\' AND key_digest = ? AND window_start = ?
                         FOR UPDATE',
                        [
                            $realm,
                            $globalKeyDigest,
                            $windowStartIso,
                        ]
                    );

                    $lockedNow = $this->getNow();
                    $lockedTimestamp = $lockedNow->getTimestamp();

                    if ($lockedTimestamp >= $windowEndTimestamp) {
                        throw new WindowDriftException('Window drifted past expiration while acquiring global lock.');
                    }

                    $currentGlobalCount = (int) ($globalRow->count ?? 0);
                    if ($currentGlobalCount + 1 > $globalLimit) {
                        // Global admission exhausted: commit nothing, insert no source IP row
                        $retryAfter = max(1, $windowEndTimestamp - $lockedTimestamp);
                        return AdmissionResult::denied(
                            retryAfterSeconds: $retryAfter,
                            reason: 'global_budget_exhausted',
                            budgetDetails: [
                                'budget' => 'global',
                                'limit' => $globalLimit,
                                'count' => $currentGlobalCount,
                            ]
                        );
                    }

                    // Step E: Source IP budget check
                    $sourceKeyDigest = hash('sha256', "bootstrap:ip:{$canonicalIp}");

                    $this->db->statement(
                        'INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
                         VALUES (?, \'bootstrap\', \'source_ip\', ?, ?, ?, 0)
                         ON CONFLICT (realm, operation_id, budget_id, key_digest, window_start) DO NOTHING',
                        [
                            $realm,
                            $sourceKeyDigest,
                            $windowStartIso,
                            $windowEndIso,
                        ]
                    );

                    $sourceRow = $this->db->selectOne(
                        'SELECT count, window_end FROM security_rate_limits
                         WHERE realm = ? AND operation_id = \'bootstrap\' AND budget_id = \'source_ip\' AND key_digest = ? AND window_start = ?
                         FOR UPDATE',
                        [
                            $realm,
                            $sourceKeyDigest,
                            $windowStartIso,
                        ]
                    );

                    $lockedNow = $this->getNow();
                    $lockedTimestamp = $lockedNow->getTimestamp();

                    if ($lockedTimestamp >= $windowEndTimestamp) {
                        throw new WindowDriftException('Window drifted past expiration while acquiring source lock.');
                    }

                    $currentSourceCount = (int) ($sourceRow->count ?? 0);
                    if ($currentSourceCount + 1 > $ipLimit) {
                        $retryAfter = max(1, $windowEndTimestamp - $lockedTimestamp);
                        return AdmissionResult::denied(
                            retryAfterSeconds: $retryAfter,
                            reason: 'ip_budget_exhausted',
                            budgetDetails: [
                                'budget' => 'source_ip',
                                'limit' => $ipLimit,
                                'count' => $currentSourceCount,
                            ]
                        );
                    }

                    // Step F: Atomically increment both budgets
                    $this->db->statement(
                        'UPDATE security_rate_limits
                         SET count = count + 1
                         WHERE realm = ? AND operation_id = \'bootstrap\' AND budget_id = \'global\' AND key_digest = ? AND window_start = ?',
                        [
                            $realm,
                            $globalKeyDigest,
                            $windowStartIso,
                        ]
                    );

                    $this->db->statement(
                        'UPDATE security_rate_limits
                         SET count = count + 1
                         WHERE realm = ? AND operation_id = \'bootstrap\' AND budget_id = \'source_ip\' AND key_digest = ? AND window_start = ?',
                        [
                            $realm,
                            $sourceKeyDigest,
                            $windowStartIso,
                        ]
                    );

                    if ($this->testFaultHook === 'after_counter_increment') {
                        throw new \RuntimeException('Injected fault: after counter increment.');
                    }

                    // Step G: Atomically issue and insert anonymous session row
                    $token = OpaqueToken::generate($realm, 'anonymous_session');
                    $csrfToken = OpaqueToken::generate($realm, 'csrf')->getSecretToken();
                    $sessionId = (string) Str::uuid();

                    $absoluteExpiresAt = $lockedNow->addSeconds(self::ANONYMOUS_SESSION_TTL);
                    $idleExpiresAt = $lockedNow->addSeconds(self::ANONYMOUS_SESSION_TTL);

                    $payload = ['csrf_token' => $csrfToken];
                    $encryptedPayload = $this->encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

                    if ($realm === self::REALM_PASSENGER) {
                        $this->db->table('passenger_sessions')->insert([
                            'id' => $sessionId,
                            'lookup_digest' => $token->digest,
                            'user_id' => null,
                            'auth_level' => 'anonymous',
                            'credential_epoch' => null,
                            'encrypted_payload' => $encryptedPayload,
                            'issued_at' => $lockedNow->toIso8601String(),
                            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
                            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
                            'last_seen_at' => $lockedNow->toIso8601String(),
                            'revoked_at' => null,
                        ]);
                    } else {
                        $this->db->table('staff_sessions')->insert([
                            'id' => $sessionId,
                            'lookup_digest' => $token->digest,
                            'staff_id' => null,
                            'auth_level' => 'anonymous',
                            'credential_epoch' => null,
                            'encrypted_payload' => $encryptedPayload,
                            'issued_at' => $lockedNow->toIso8601String(),
                            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
                            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
                            'last_seen_at' => $lockedNow->toIso8601String(),
                            'revoked_at' => null,
                            'mfa_version' => null,
                            'mfa_verified_at' => null,
                        ]);
                    }

                    $receipt = new SessionReceipt(
                        rawToken: $token->getSecretToken(),
                        csrfToken: $csrfToken,
                        sessionId: $sessionId,
                        realm: $realm,
                        authLevel: 'anonymous',
                        principalId: null,
                        issuedAt: $lockedNow,
                        absoluteExpiresAt: $absoluteExpiresAt,
                        idleExpiresAt: $idleExpiresAt,
                    );

                    return AdmissionResult::admitted($receipt, [
                        'ip_remaining' => max(0, $ipLimit - ($currentSourceCount + 1)),
                        'global_remaining' => max(0, $globalLimit - ($currentGlobalCount + 1)),
                    ]);
                });
            } catch (WindowDriftException) {
                if ($attempt === 3) {
                    throw new \RuntimeException('Bootstrap admission window drift exceeded maximum retry attempts.');
                }
            }
        }

        throw new \RuntimeException('Bootstrap admission failed unexpectedly.');
    }
}
