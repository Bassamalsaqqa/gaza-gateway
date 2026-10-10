<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

use App\Identity\Proofs\Exceptions\ProofValidationException;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Shared durable proof service for Phase 13B identity lifecycle primitives.
 *
 * Enforces:
 * - Exact purpose TTL defaults from accepted manifest (no arbitrary production extensions).
 * - Closed explicit mappings to the 4 proof tables (no caller-supplied generic tables).
 * - Cryptographically random 32-byte opaque tokens (43 base64url characters).
 * - SHA-256 lookup digest stored; zero raw secrets in database tables.
 * - Strict lock hierarchy: Principal row FOR UPDATE -> Proof rows ASC FOR UPDATE.
 * - Real time derived strictly AFTER acquiring locks.
 * - Exact-equality expiry denial (now >= expires_at).
 * - Credential epoch & email snapshot mismatch revocation.
 * - Concurrency protection: exactly one success under concurrent replay.
 * - Strict transaction safety: joins caller active transaction or owns a real transaction;
 *   never autocommits locks on an open un-transactioned connection.
 * - Fixed safe exception text with zero sensitive values.
 */
class ProofService
{
    public function __construct(
        private readonly ?ConnectionInterface $db = null,
    ) {
    }

    private function getDb(?ConnectionInterface $override = null): ConnectionInterface
    {
        return $override ?? $this->db ?? DB::connection();
    }

    /**
     * Executes callback inside a verified active transaction.
     * Joins active transaction if present; otherwise starts and owns a real transaction.
     */
    private function executeInTransaction(?ConnectionInterface $conn, Closure $callback): mixed
    {
        $targetDb = $conn ?? $this->getDb();

        if ($conn !== null && $conn->transactionLevel() > 0) {
            return $callback($conn);
        }

        return $targetDb->transaction(function (ConnectionInterface $tx) use ($callback) {
            return $callback($tx);
        });
    }

    /**
     * Issue a new durable proof for the given principal using exact manifest TTL.
     */
    public function issue(
        ProofPurpose $purpose,
        string $principalId,
        ?ConnectionInterface $conn = null,
    ): ProofIssuedReceipt {
        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($purpose, $principalId) {
            // 1. Lock principal row before reading email snapshot, epoch, or time
            $principal = $tx->table($purpose->principalTable())
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id', 'email', 'credential_epoch', 'status']);

            if (!$principal) {
                throw new ProofValidationException('Target principal account was not found.');
            }

            // 2. Real time derived strictly after lock acquisition (normalized to second precision)
            $nowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $now = CarbonImmutable::parse($nowRow->now)->startOfSecond();
            $expiresAt = $now->addSeconds($purpose->defaultTtlSeconds());

            // 3. Generate token & record
            $token = OpaqueToken::generate($purpose->realm(), $purpose->value);
            $proofId = (string) Str::uuid();

            $record = [
                'id' => $proofId,
                'token_digest' => $token->digest,
                'state' => 'issued',
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'consumed_at' => null,
                'revoked_at' => null,
                $purpose->principalColumn() => $principalId,
                'purpose' => $purpose->value,
                'credential_epoch' => (int) $principal->credential_epoch,
                'email_snapshot' => (string) $principal->email,
            ];

            $tx->table($purpose->table())->insert($record);

            return new ProofIssuedReceipt(
                proofId: $proofId,
                purpose: $purpose,
                principalId: $principalId,
                credentialEpoch: (int) $principal->credential_epoch,
                issuedAt: $now,
                expiresAt: $expiresAt,
                emailSnapshot: (string) $principal->email,
                tokenDigest: $token->digest,
                rawSecretToken: $token->getSecretToken(),
            );
        });
    }

    /**
     * Reissue proof for principal: revokes existing active proofs under principal lock,
     * then issues a fresh proof using exact manifest TTL.
     */
    public function reissue(
        ProofPurpose $purpose,
        string $principalId,
        ?ConnectionInterface $conn = null,
    ): ProofIssuedReceipt {
        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($purpose, $principalId) {
            // 1. Lock principal row
            $principal = $tx->table($purpose->principalTable())
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id', 'email', 'credential_epoch', 'status']);

            if (!$principal) {
                throw new ProofValidationException('Target principal account was not found.');
            }

            // 2. Lock and revoke existing active proofs in deterministic ID order
            $activeProofIds = $tx->table($purpose->table())
                ->where($purpose->principalColumn(), $principalId)
                ->where('purpose', $purpose->value)
                ->where('state', 'issued')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id')
                ->all();

            if (!empty($activeProofIds)) {
                $tx->table($purpose->table())
                    ->whereIn('id', $activeProofIds)
                    ->update([
                        'state' => 'revoked',
                        'revoked_at' => $tx->raw('clock_timestamp()'),
                    ]);
            }

            // 3. Real time derived strictly after locks (normalized to second precision)
            $nowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $now = CarbonImmutable::parse($nowRow->now)->startOfSecond();
            $expiresAt = $now->addSeconds($purpose->defaultTtlSeconds());

            $token = OpaqueToken::generate($purpose->realm(), $purpose->value);
            $proofId = (string) Str::uuid();

            $tx->table($purpose->table())->insert([
                'id' => $proofId,
                'token_digest' => $token->digest,
                'state' => 'issued',
                'issued_at' => $now->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'consumed_at' => null,
                'revoked_at' => null,
                $purpose->principalColumn() => $principalId,
                'purpose' => $purpose->value,
                'credential_epoch' => (int) $principal->credential_epoch,
                'email_snapshot' => (string) $principal->email,
            ]);

            return new ProofIssuedReceipt(
                proofId: $proofId,
                purpose: $purpose,
                principalId: $principalId,
                credentialEpoch: (int) $principal->credential_epoch,
                issuedAt: $now,
                expiresAt: $expiresAt,
                emailSnapshot: (string) $principal->email,
                tokenDigest: $token->digest,
                rawSecretToken: $token->getSecretToken(),
            );
        });
    }

    /**
     * Revoke all active proofs for the principal and purpose under deterministic locks.
     */
    public function revokeAll(
        ProofPurpose $purpose,
        string $principalId,
        ?ConnectionInterface $conn = null,
    ): int {
        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($purpose, $principalId) {
            // 1. Lock principal row
            $principal = $tx->table($purpose->principalTable())
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id']);

            if (!$principal) {
                return 0;
            }

            // 2. Lock active proof rows in deterministic order
            $activeIds = $tx->table($purpose->table())
                ->where($purpose->principalColumn(), $principalId)
                ->where('purpose', $purpose->value)
                ->where('state', 'issued')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->pluck('id')
                ->all();

            if (empty($activeIds)) {
                return 0;
            }

            return $tx->table($purpose->table())
                ->whereIn('id', $activeIds)
                ->update([
                    'state' => 'revoked',
                    'revoked_at' => $tx->raw('clock_timestamp()'),
                ]);
        });
    }

    /**
     * Consume a proof token.
     *
     * Validates:
     * - Canonical bearer format (43-char base64url 32-byte secret).
     * - Digest lookup in destination table.
     * - Purpose match.
     * - Locks principal row, then proof row.
     * - Evaluates fresh time strictly after acquiring lock (now >= expires_at denies).
     * - Credential epoch equality.
     * - Email snapshot equality.
     * - Single-use consumption (exactly one success under concurrency).
     * - Strictly transactional.
     */
    public function consume(
        ProofPurpose $purpose,
        #[\SensitiveParameter]
        string $rawSecretToken,
        ?ConnectionInterface $conn = null,
    ): ProofConsumptionResult {
        try {
            OpaqueToken::validateCanonicalBearer($rawSecretToken);
        } catch (InvalidArgumentException) {
            return ProofConsumptionResult::failure(
                ProofConsumptionOutcome::InvalidFormat,
                'Proof secret token is not a canonical 43-character base64url bearer.'
            );
        }

        $digest = OpaqueToken::digestOf($rawSecretToken);
        $db = $this->getDb($conn);

        // Preliminary existence check
        $initialRow = $db->table($purpose->table())
            ->where('token_digest', $digest)
            ->first();

        if (!$initialRow) {
            return ProofConsumptionResult::failure(
                ProofConsumptionOutcome::NotFound,
                'Proof token record not found.'
            );
        }

        if ($initialRow->purpose !== $purpose->value) {
            return ProofConsumptionResult::failure(
                ProofConsumptionOutcome::PurposeMismatch,
                'Proof purpose does not match requested verification purpose.'
            );
        }

        $proofId = (string) $initialRow->id;
        $principalId = (string) $initialRow->{$purpose->principalColumn()};

        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($purpose, $proofId, $principalId) {
            // 1. Lock principal row first in lock hierarchy
            $principal = $tx->table($purpose->principalTable())
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id', 'email', 'credential_epoch', 'status']);

            if (!$principal) {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::PrincipalNotFound,
                    'Associated principal account was not found.'
                );
            }

            // 2. Lock proof row FOR UPDATE
            $proofRow = $tx->table($purpose->table())
                ->where('id', $proofId)
                ->lockForUpdate()
                ->first();

            if (!$proofRow) {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::NotFound,
                    'Proof token record not found.'
                );
            }

            // 3. Fresh time evaluation strictly after lock acquisition
            $liveNowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $liveNow = CarbonImmutable::parse($liveNowRow->now);

            // 4. State checks
            if ($proofRow->state === 'consumed') {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::AlreadyConsumed,
                    'Proof token has already been consumed.'
                );
            }
            if ($proofRow->state === 'revoked') {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::Revoked,
                    'Proof token has been revoked.'
                );
            }
            if ($proofRow->state === 'expired') {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::Expired,
                    'Proof token has expired.'
                );
            }
            if ($proofRow->state === 'exhausted') {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::Exhausted,
                    'Proof token attempts exhausted.'
                );
            }
            if ($proofRow->state !== 'issued') {
                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::InvalidFormat,
                    'Proof token is not in an issued state.'
                );
            }

            // 5. Expiry check: exact equality denies (now >= expires_at)
            $expiresAt = CarbonImmutable::parse($proofRow->expires_at);
            if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                $tx->table($purpose->table())
                    ->where('id', $proofId)
                    ->update(['state' => 'expired']);

                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::Expired,
                    'Proof token has expired.'
                );
            }

            // 6. Credential epoch check: epoch change prevents consumption
            if ((int) $principal->credential_epoch !== (int) $proofRow->credential_epoch) {
                $tx->table($purpose->table())
                    ->where('id', $proofId)
                    ->update([
                        'state' => 'revoked',
                        'revoked_at' => $tx->raw('clock_timestamp()'),
                    ]);

                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::EpochMismatch,
                    'Credential epoch mismatch.'
                );
            }

            // 7. Email snapshot check: email change prevents consumption
            if ((string) $principal->email !== (string) $proofRow->email_snapshot) {
                $tx->table($purpose->table())
                    ->where('id', $proofId)
                    ->update([
                        'state' => 'revoked',
                        'revoked_at' => $tx->raw('clock_timestamp()'),
                    ]);

                return ProofConsumptionResult::failure(
                    ProofConsumptionOutcome::EmailMismatch,
                    'Email address mismatch.'
                );
            }

            // 8. Consume proof atomically
            $tx->table($purpose->table())
                ->where('id', $proofId)
                ->update([
                    'state' => 'consumed',
                    'consumed_at' => $tx->raw('clock_timestamp()'),
                ]);

            return ProofConsumptionResult::success(
                proofId: $proofId,
                principalId: $principalId,
                emailSnapshot: (string) $proofRow->email_snapshot,
                credentialEpoch: (int) $proofRow->credential_epoch,
                consumedAt: $liveNow,
            );
        });
    }
}
