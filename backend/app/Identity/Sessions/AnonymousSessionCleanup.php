<?php

declare(strict_types=1);

namespace App\Identity\Sessions;

use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

final class AnonymousSessionCleanup
{
    public const MIN_BATCH_SIZE = 1;
    public const MAX_BATCH_SIZE = 100;
    public const DEFAULT_BATCH_SIZE = 100;

    public const MIN_BATCHES = 1;
    public const MAX_BATCHES = 10;
    public const DEFAULT_MAX_BATCHES = 10;

    public const MIN_SAFE_HORIZON_SECONDS = 3600;
    public const MAX_SAFE_HORIZON_SECONDS = 31536000;
    public const DEFAULT_BUCKET_HORIZON_SECONDS = 3600;

    private CarbonImmutable|\Closure|null $testClock = null;

    public function __construct(
        private readonly ConnectionInterface $db,
    ) {
    }

    /**
     * Testing seam for deterministic test clock injection.
     * Strictly restricted to testing environment and resolved PostgreSQL test DB.
     * Does not reflect actual database name on mismatch.
     */
    public function setClock(CarbonImmutable|\Closure|null $clock): void
    {
        if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
            throw new \LogicException('Clock injection is strictly restricted to testing environment and test database.');
        }

        $row = $this->db->selectOne('SELECT current_database() AS db_name');
        if (($row->db_name ?? '') !== 'gaza_gateway_test') {
            throw new \LogicException('Clock injection is strictly restricted to testing environment and test database.');
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
     * Purge a single bounded batch of expired or revoked anonymous sessions for the given realm.
     * Enforces strict integer closed ranges (batch 1..100).
     * Enforces deterministic locking (ORDER BY id ASC FOR UPDATE SKIP LOCKED),
     * fresh transaction-time expiry derivation, and DELETE revalidation.
     */
    public function cleanRealmBatch(string $realm, int $batchSize = self::DEFAULT_BATCH_SIZE): int
    {
        if (!in_array($realm, ['passenger', 'staff'], true)) {
            throw new \InvalidArgumentException('Unknown session realm.');
        }

        if ($batchSize < self::MIN_BATCH_SIZE || $batchSize > self::MAX_BATCH_SIZE) {
            throw new \InvalidArgumentException(
                sprintf('Batch size must be strictly between %d and %d.', self::MIN_BATCH_SIZE, self::MAX_BATCH_SIZE)
            );
        }

        return (int) $this->db->transaction(function () use ($realm, $batchSize) {
            $this->db->statement("SET LOCAL statement_timeout = '3000ms'");
            $this->db->statement("SET LOCAL lock_timeout = '2000ms'");
            // Fresh expiry evaluation derived strictly inside transaction
            $nowIso = $this->getNow()->toIso8601String();

            if ($realm === 'passenger') {
                $candidates = $this->db->select(
                    'SELECT id FROM passenger_sessions
                     WHERE user_id IS NULL
                       AND auth_level = \'anonymous\'
                       AND (absolute_expires_at <= ? OR idle_expires_at <= ? OR revoked_at IS NOT NULL)
                       AND NOT EXISTS (SELECT 1 FROM quotes WHERE checkout_session_id = passenger_sessions.id)
                       AND NOT EXISTS (SELECT 1 FROM capacity_holds WHERE checkout_session_id = passenger_sessions.id)
                       AND NOT EXISTS (SELECT 1 FROM bookings WHERE checkout_session_id = passenger_sessions.id)
                       AND NOT EXISTS (SELECT 1 FROM booking_guest_challenges WHERE session_id = passenger_sessions.id)
                       AND NOT EXISTS (SELECT 1 FROM booking_claim_proofs WHERE session_id = passenger_sessions.id)
                     ORDER BY id ASC
                     LIMIT ?
                     FOR UPDATE SKIP LOCKED',
                    [$nowIso, $nowIso, $batchSize]
                );

                if (empty($candidates)) {
                    return 0;
                }

                $ids = array_column($candidates, 'id');

                // DELETE revalidation: ensures concurrent auth upgrade is never deleted
                return $this->db->table('passenger_sessions')
                    ->whereIn('id', $ids)
                    ->whereNull('user_id')
                    ->where('auth_level', 'anonymous')
                    ->delete();
            }

            // Staff realm: lock and validate candidate session rows
            $candidates = $this->db->select(
                'SELECT id FROM staff_sessions
                 WHERE staff_id IS NULL
                   AND auth_level = \'anonymous\'
                   AND (absolute_expires_at <= ? OR idle_expires_at <= ? OR revoked_at IS NOT NULL)
                   AND NOT EXISTS (
                       SELECT 1 FROM staff_pending_auth spa
                       WHERE spa.bound_session_id = staff_sessions.id
                         AND spa.state = \'issued\'
                         AND spa.expires_at > ?
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM staff_mfa_replacements smr
                       WHERE smr.session_id = staff_sessions.id
                         AND smr.state = \'issued\'
                         AND smr.expires_at > ?
                   )
                 ORDER BY id ASC
                 LIMIT ?
                 FOR UPDATE SKIP LOCKED',
                [$nowIso, $nowIso, $nowIso, $nowIso, $batchSize]
            );

            if (empty($candidates)) {
                return 0;
            }

            $ids = array_column($candidates, 'id');

            // Prune bound stale/terminal pending auth records under session->pending hierarchy
            $this->db->table('staff_pending_auth')
                ->whereIn('bound_session_id', $ids)
                ->where(function ($query) use ($nowIso) {
                    $query->whereIn('state', ['expired', 'consumed', 'revoked', 'exhausted'])
                        ->orWhere('expires_at', '<=', $nowIso);
                })
                ->delete();

            // Prune bound stale replacement records under session->pending hierarchy
            $this->db->table('staff_mfa_replacements')
                ->whereIn('session_id', $ids)
                ->where(function ($query) use ($nowIso) {
                    $query->whereIn('state', ['expired', 'consumed', 'revoked', 'exhausted'])
                        ->orWhere('expires_at', '<=', $nowIso);
                })
                ->delete();

            // DELETE revalidation: ensures concurrent staff upgrade is never deleted
            return $this->db->table('staff_sessions')
                ->whereIn('id', $ids)
                ->whereNull('staff_id')
                ->where('auth_level', 'anonymous')
                ->delete();
        });
    }

    /**
     * Purge stale bootstrap rate limit buckets beyond safe horizon after window expiration.
     * Enforces batch 1..100 and safe horizon >= 3600 seconds.
     */
    public function cleanBootstrapRateBuckets(
        int $batchSize = self::DEFAULT_BATCH_SIZE,
        int $safeHorizonSeconds = self::DEFAULT_BUCKET_HORIZON_SECONDS
    ): int {
        if ($batchSize < self::MIN_BATCH_SIZE || $batchSize > self::MAX_BATCH_SIZE) {
            throw new \InvalidArgumentException(
                sprintf('Batch size must be strictly between %d and %d.', self::MIN_BATCH_SIZE, self::MAX_BATCH_SIZE)
            );
        }

        if ($safeHorizonSeconds < self::MIN_SAFE_HORIZON_SECONDS || $safeHorizonSeconds > self::MAX_SAFE_HORIZON_SECONDS) {
            throw new \InvalidArgumentException(
                sprintf('Safe horizon must be at least %d seconds.', self::MIN_SAFE_HORIZON_SECONDS)
            );
        }

        return (int) $this->db->transaction(function () use ($batchSize, $safeHorizonSeconds) {
            $this->db->statement("SET LOCAL statement_timeout = '3000ms'");
            $this->db->statement("SET LOCAL lock_timeout = '2000ms'");
            $now = $this->getNow();
            $cutoff = $now->subSeconds($safeHorizonSeconds)->toIso8601String();

            $candidates = $this->db->select(
                'SELECT realm, operation_id, budget_id, key_digest, window_start
                 FROM security_rate_limits
                 WHERE operation_id = \'bootstrap\'
                   AND window_end < ?
                 ORDER BY window_start ASC, realm ASC, budget_id ASC, key_digest ASC
                 LIMIT ?
                 FOR UPDATE SKIP LOCKED',
                [$cutoff, $batchSize]
            );

            if (empty($candidates)) {
                return 0;
            }

            $deleted = 0;
            foreach ($candidates as $row) {
                $deleted += $this->db->statement(
                    'DELETE FROM security_rate_limits
                     WHERE realm = ?
                       AND operation_id = ?
                       AND budget_id = ?
                       AND key_digest = ?
                       AND window_start = ?',
                    [
                        $row->realm,
                        $row->operation_id,
                        $row->budget_id,
                        $row->key_digest,
                        $row->window_start,
                    ]
                ) ? 1 : 0;
            }

            return $deleted;
        });
    }

    /**
     * Run bounded cleanup loops across realms and rate limit buckets.
     * Enforces strict integer closed ranges:
     * maxBatchesPerRealm: 1..10
     * batchSize: 1..100
     * safeHorizonSeconds: >= 3600
     *
     * @return array{passenger_sessions: int, staff_sessions: int, rate_limit_buckets: int}
     */
    public function runCleanup(
        int $maxBatchesPerRealm = self::DEFAULT_MAX_BATCHES,
        int $batchSize = self::DEFAULT_BATCH_SIZE,
        int $safeHorizonSeconds = self::DEFAULT_BUCKET_HORIZON_SECONDS
    ): array {
        if ($maxBatchesPerRealm < self::MIN_BATCHES || $maxBatchesPerRealm > self::MAX_BATCHES) {
            throw new \InvalidArgumentException(
                sprintf('Max batches must be strictly between %d and %d.', self::MIN_BATCHES, self::MAX_BATCHES)
            );
        }

        if ($batchSize < self::MIN_BATCH_SIZE || $batchSize > self::MAX_BATCH_SIZE) {
            throw new \InvalidArgumentException(
                sprintf('Batch size must be strictly between %d and %d.', self::MIN_BATCH_SIZE, self::MAX_BATCH_SIZE)
            );
        }

        if ($safeHorizonSeconds < self::MIN_SAFE_HORIZON_SECONDS || $safeHorizonSeconds > self::MAX_SAFE_HORIZON_SECONDS) {
            throw new \InvalidArgumentException(
                sprintf('Safe horizon must be at least %d seconds.', self::MIN_SAFE_HORIZON_SECONDS)
            );
        }

        $passengerDeleted = 0;
        for ($i = 0; $i < $maxBatchesPerRealm; $i++) {
            $batchDeleted = $this->cleanRealmBatch('passenger', $batchSize);
            $passengerDeleted += $batchDeleted;
            if ($batchDeleted < $batchSize) {
                break;
            }
        }

        $staffDeleted = 0;
        for ($i = 0; $i < $maxBatchesPerRealm; $i++) {
            $batchDeleted = $this->cleanRealmBatch('staff', $batchSize);
            $staffDeleted += $batchDeleted;
            if ($batchDeleted < $batchSize) {
                break;
            }
        }

        $bucketsDeleted = 0;
        for ($i = 0; $i < $maxBatchesPerRealm; $i++) {
            $batchDeleted = $this->cleanBootstrapRateBuckets($batchSize, $safeHorizonSeconds);
            $bucketsDeleted += $batchDeleted;
            if ($batchDeleted < $batchSize) {
                break;
            }
        }

        return [
            'passenger_sessions' => $passengerDeleted,
            'staff_sessions' => $staffDeleted,
            'rate_limit_buckets' => $bucketsDeleted,
        ];
    }
}
