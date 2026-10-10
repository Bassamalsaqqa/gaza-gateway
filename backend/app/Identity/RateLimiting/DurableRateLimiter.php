<?php

declare(strict_types=1);

namespace App\Identity\RateLimiting;

use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

final class DurableRateLimiter
{
    /**
     * Manifest Rate Budgets.
     * Maps operation_id to array of budget definitions using canonical manifest key names.
     */
    public const BUDGETS = [
        'login' => [
            'subject_ip' => [
                'limit' => 5,
                'seconds' => 60,
                'keys' => ['subject_digest', 'ip'],
            ],
            'ip' => [
                'limit' => 30,
                'seconds' => 300,
                'keys' => ['ip'],
            ],
        ],
        'dispatch' => [
            'subject_ip' => [
                'limit' => 3,
                'seconds' => 900,
                'keys' => ['subject_digest', 'ip'],
            ],
            'ip' => [
                'limit' => 20,
                'seconds' => 3600,
                'keys' => ['ip'],
            ],
        ],
        'challenge' => [
            'ref_session_ip' => [
                'limit' => 5,
                'seconds' => 900,
                'keys' => ['reference_digest', 'session_id', 'ip'],
            ],
            'ip' => [
                'limit' => 30,
                'seconds' => 3600,
                'keys' => ['ip'],
            ],
        ],
        'proof' => [
            'subject_ip' => [
                'limit' => 10,
                'seconds' => 600,
                'keys' => ['subject_digest', 'ip'],
            ],
        ],
        'stepUp' => [
            'staff_session_ip' => [
                'limit' => 5,
                'seconds' => 600,
                'keys' => ['staff_id', 'session_id', 'ip'],
            ],
        ],
    ];

    public const ALLOWED_REALMS = ['passenger', 'staff', 'booking'];

    public const REALM_OPERATIONS = [
        'passenger' => ['login', 'dispatch', 'proof'],
        'staff' => ['login', 'dispatch', 'proof', 'stepUp'],
        'booking' => ['dispatch', 'challenge', 'proof'],
    ];

    public const MIN_COST = 1;
    public const MAX_COST = 1000;

    private CarbonImmutable|\Closure|null $testClock = null;

    public function __construct(
        private readonly ConnectionInterface $db,
    ) {
    }

    /**
     * Testing seam for deterministic test clock injection.
     * Strictly restricted to testing environment; no production request authority.
     */
    public function setClock(CarbonImmutable|\Closure|null $clock): void
    {
        if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
            throw new \LogicException('Clock injection is strictly restricted to testing environment.');
        }
        $this->testClock = $clock;
    }

    private function getNow(): CarbonImmutable
    {
        if ($this->testClock instanceof \Closure) {
            return ($this->testClock)();
        }
        return $this->testClock ?? CarbonImmutable::now();
    }

    /**
     * Atomically evaluate and charge rate limits across all applicable budgets for an operation.
     * Enforces:
     * - Positive bounded integer cost (1..1000)
     * - Closed realm/operation mapping
     * - Canonical manifest keys via server-owned adapter (rejects aliases simultaneously, invalid formats, unused keys)
     * - Canonicalizes UUID case and IPv6 representations (via packed inet_pton/inet_ntop) before digest/lookup
     * - Safe fixed exception messages without reflection of caller keys or values
     * - Canonical lock order: (realm, operation_id, budget_id, key_digest) sorted lexicographically
     * - Fresh deadline evaluation after acquiring locks with whole-transaction retry on window drift
     * - Pruning/cleanup protocol: DELETE FROM security_rate_limits WHERE window_end < now() - INTERVAL '1 hour'
     * - Sanitized result without PII or internal query details
     */
    public function charge(
        string $realm,
        string $operationId,
        array $keyMaterial,
        int $cost = 1
    ): RateLimitResult {
        // 1. Cost validation
        if ($cost < self::MIN_COST || $cost > self::MAX_COST) {
            throw new \InvalidArgumentException('Invalid rate limit cost.');
        }

        // 2. Closed realm and operation validation
        if (!in_array($realm, self::ALLOWED_REALMS, true)) {
            throw new \InvalidArgumentException('Unknown rate limit realm.');
        }

        $allowedOps = self::REALM_OPERATIONS[$realm] ?? [];
        if (!in_array($operationId, $allowedOps, true)) {
            throw new \InvalidArgumentException('Operation not permitted for realm.');
        }

        $budgetConfigs = self::BUDGETS[$operationId] ?? null;
        if ($budgetConfigs === null) {
            throw new \InvalidArgumentException('Unknown rate limit operation.');
        }

        // 3. Server-owned key adapter: translate to canonical manifest keys without raw subject fallback
        $adapted = [];
        foreach ($keyMaterial as $k => $v) {
            if (!is_string($v) || $v === '' || strlen($v) > 255) {
                throw new \InvalidArgumentException('Invalid rate limit key format.');
            }

            match ($k) {
                'subject' => isset($keyMaterial['subject_digest'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : $adapted['subject_digest'] = hash('sha256', $v),
                'subject_digest' => isset($keyMaterial['subject'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{64}\z/', $v)
                        ? $adapted['subject_digest'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'reference' => isset($keyMaterial['reference_digest'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : $adapted['reference_digest'] = hash('sha256', $v),
                'reference_digest' => isset($keyMaterial['reference'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{64}\z/', $v)
                        ? $adapted['reference_digest'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'sessionId' => isset($keyMaterial['session_id'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $v)
                        ? $adapted['session_id'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'session_id' => isset($keyMaterial['sessionId'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $v)
                        ? $adapted['session_id'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'staffId' => isset($keyMaterial['staff_id'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $v)
                        ? $adapted['staff_id'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'staff_id' => isset($keyMaterial['staffId'])
                    ? throw new \InvalidArgumentException('Conflicting rate limit keys.')
                    : (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $v)
                        ? $adapted['staff_id'] = strtolower($v)
                        : throw new \InvalidArgumentException('Invalid rate limit key format.')),
                'ip' => (function () use ($v, &$adapted) {
                    if (filter_var($v, FILTER_VALIDATE_IP) === false) {
                        throw new \InvalidArgumentException('Invalid rate limit key format.');
                    }
                    $packed = inet_pton($v);
                    if ($packed === false) {
                        throw new \InvalidArgumentException('Invalid rate limit key format.');
                    }
                    return $adapted['ip'] = inet_ntop($packed);
                })(),
                default => throw new \InvalidArgumentException('Unexpected rate limit key.'),
            };
        }

        // Verify all required keys for this operation's budgets are present
        $allExpectedKeys = [];
        foreach ($budgetConfigs as $config) {
            foreach ($config['keys'] as $keyName) {
                $allExpectedKeys[$keyName] = true;
            }
        }

        foreach (array_keys($allExpectedKeys) as $expectedKey) {
            if (!array_key_exists($expectedKey, $adapted)) {
                throw new \InvalidArgumentException('Missing required rate limit key.');
            }
        }

        // Verify no unused keys were supplied
        foreach (array_keys($adapted) as $suppliedKey) {
            if (!array_key_exists($suppliedKey, $allExpectedKeys)) {
                throw new \InvalidArgumentException('Unexpected rate limit key.');
            }
        }

        // 4. Multi-budget atomic evaluation inside database transaction with drift retry
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                return $this->db->transaction(function () use (
                    $realm,
                    $operationId,
                    $budgetConfigs,
                    $adapted,
                    $cost
                ) {
                    $currentTime = $this->getNow();
                    $nowTimestamp = $currentTime->getTimestamp();

                    // Prepare targets with canonical lock order key
                    $targets = [];
                    foreach ($budgetConfigs as $budgetId => $config) {
                        $budgetKeyPairs = [];
                        foreach ($config['keys'] as $k) {
                            $budgetKeyPairs[$k] = $adapted[$k];
                        }
                        $keyDigest = self::digestOfCanonicalKey($budgetKeyPairs);

                        $windowSeconds = (int) $config['seconds'];
                        $windowStartTimestamp = (int) (floor($nowTimestamp / $windowSeconds) * $windowSeconds);
                        $windowEndTimestamp = $windowStartTimestamp + $windowSeconds;

                        $windowStart = CarbonImmutable::createFromTimestamp($windowStartTimestamp);
                        $windowEnd = CarbonImmutable::createFromTimestamp($windowEndTimestamp);

                        // Canonical lock order key: realm, operation_id, budget_id, key_digest
                        $sortKey = "{$realm}:{$operationId}:{$budgetId}:{$keyDigest}";

                        $targets[$sortKey] = [
                            'realm' => $realm,
                            'operation_id' => $operationId,
                            'budget_id' => $budgetId,
                            'key_digest' => $keyDigest,
                            'window_start' => $windowStart->toIso8601String(),
                            'window_end' => $windowEnd->toIso8601String(),
                            'window_start_timestamp' => $windowStartTimestamp,
                            'window_end_timestamp' => $windowEndTimestamp,
                            'limit' => (int) $config['limit'],
                            'seconds' => $windowSeconds,
                        ];
                    }

                    // Sort targets lexicographically to guarantee stable canonical lock order
                    ksort($targets, SORT_STRING);

                    $lockedRows = [];
                    foreach ($targets as $sortKey => $target) {
                        // Ensure bucket row exists
                        $this->db->statement(
                            'INSERT INTO security_rate_limits (realm, operation_id, budget_id, key_digest, window_start, window_end, count)
                             VALUES (?, ?, ?, ?, ?, ?, 0)
                             ON CONFLICT (realm, operation_id, budget_id, key_digest, window_start) DO NOTHING',
                            [
                                $target['realm'],
                                $target['operation_id'],
                                $target['budget_id'],
                                $target['key_digest'],
                                $target['window_start'],
                                $target['window_end'],
                            ]
                        );

                        // Lock row FOR UPDATE in canonical sorted order
                        $row = $this->db->selectOne(
                            'SELECT count, window_end FROM security_rate_limits
                             WHERE realm = ? AND operation_id = ? AND budget_id = ? AND key_digest = ? AND window_start = ?
                             FOR UPDATE',
                            [
                                $target['realm'],
                                $target['operation_id'],
                                $target['budget_id'],
                                $target['key_digest'],
                                $target['window_start'],
                            ]
                        );

                        $lockedRows[$sortKey] = $row;
                    }

                    // CRITICAL: Derive fresh time AFTER acquiring all contention locks!
                    $lockedNow = $this->getNow();
                    $lockedTimestamp = $lockedNow->getTimestamp();

                    // Check if time advanced past window boundary while waiting on locks
                    foreach ($targets as $target) {
                        if ($lockedTimestamp >= $target['window_end_timestamp']) {
                            // Window expired during lock acquisition wait -> abort transaction and retry with fresh time
                            throw new WindowDriftException('Window drifted past expiration while waiting on contention locks.');
                        }
                    }

                    // Evaluate counts against limits with fresh time
                    $sanitizedDetails = [];
                    $allAllowed = true;
                    $maxRetryAfter = 0;
                    $minRemaining = PHP_INT_MAX;
                    $primaryLimit = 0;

                    foreach ($targets as $sortKey => $target) {
                        $row = $lockedRows[$sortKey];
                        $currentCount = (int) ($row->count ?? 0);
                        $limit = $target['limit'];
                        if ($primaryLimit === 0) {
                            $primaryLimit = $limit;
                        }

                        if ($currentCount + $cost > $limit) {
                            $allAllowed = false;
                            $retryAfter = max(1, $target['window_end_timestamp'] - $lockedTimestamp);
                            if ($retryAfter > $maxRetryAfter) {
                                $maxRetryAfter = $retryAfter;
                            }
                        }

                        $remaining = max(0, $limit - ($currentCount + $cost));
                        if ($remaining < $minRemaining) {
                            $minRemaining = $remaining;
                        }

                        $sanitizedDetails[] = [
                            'budget_id' => $target['budget_id'],
                            'limit' => $limit,
                            'remaining' => $remaining,
                        ];
                    }

                    // If ANY budget denies, commit nothing (zero increments) and return truthful Retry-After
                    if (!$allAllowed) {
                        return RateLimitResult::denied(
                            retryAfterSeconds: $maxRetryAfter,
                            limit: $primaryLimit,
                            operationId: $operationId,
                            budgetDetails: $sanitizedDetails,
                        );
                    }

                    // All budgets allowed -> atomically charge all buckets
                    foreach ($targets as $t) {
                        $this->db->statement(
                            'UPDATE security_rate_limits
                             SET count = count + ?
                             WHERE realm = ? AND operation_id = ? AND budget_id = ? AND key_digest = ? AND window_start = ?',
                            [
                                $cost,
                                $t['realm'],
                                $t['operation_id'],
                                $t['budget_id'],
                                $t['key_digest'],
                                $t['window_start'],
                            ]
                        );
                    }

                    return RateLimitResult::allowed(
                        remaining: $minRemaining,
                        limit: $primaryLimit,
                        operationId: $operationId,
                        budgetDetails: $sanitizedDetails,
                    );
                });
            } catch (WindowDriftException) {
                if ($attempt === 3) {
                    throw new \RuntimeException('Rate limit window drift exceeded maximum retry attempts.');
                }
            }
        }

        throw new \RuntimeException('Rate limit evaluation failed unexpectedly.');
    }

    /**
     * Compute collision-free length-prefixed canonical key string from sorted key-value pairs.
     */
    public static function canonicalKey(array $keyPairs): string
    {
        ksort($keyPairs, SORT_STRING);
        $parts = [];
        foreach ($keyPairs as $k => $v) {
            $parts[] = sprintf('%d:%s=%d:%s', strlen((string) $k), (string) $k, strlen((string) $v), (string) $v);
        }
        return implode(';', $parts);
    }

    /**
     * Compute SHA-256 digest of canonical key representation.
     */
    public static function digestOfCanonicalKey(array $keyPairs): string
    {
        return hash('sha256', self::canonicalKey($keyPairs));
    }
}
