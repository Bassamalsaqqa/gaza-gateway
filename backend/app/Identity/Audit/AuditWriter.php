<?php

declare(strict_types=1);

namespace App\Identity\Audit;

use App\Identity\Audit\Exceptions\AuditValidationException;
use Closure;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Append-only writer for immutable audit_events.
 *
 * Enforces:
 * - Exact closed allowed action keys (47 actions) and outcome enum.
 * - Exactly one actor representation matching check constraints.
 * - Strict metadata pre-flight validation before DB query:
 *   denies any PII, secrets, raw tokens, digests, URLs, IPs, or arbitrary keys.
 * - Exact allowed numeric ranges and closed string code sets for metadata values.
 * - Fixed safe exception messages with zero supplied values or PII.
 * - Strict transaction safety: joins caller active transaction or owns a real transaction.
 */
class AuditWriter
{
    public const array FORBIDDEN_PII_KEYS = [
        'email', 'password', 'password_hash', 'token', 'token_digest',
        'code_digest', 'digest', 'secret', 'otp', 'document', 'body', 'url', 'ip',
    ];

    public const array ALLOWED_METADATA_KEYS = [
        'attempt_count', 'failed_attempts', 'reason_code', 'revoked',
        'consumed', 'is_new', 'version', 'count', 'status', 'epoch',
        'success', 'code', 'error_code',
    ];

    public const array ALLOWED_REASON_CODES = [
        'invalid_credentials', 'account_locked', 'session_expired',
        'session_revoked', 'proof_exhausted', 'proof_revoked',
        'rate_limited', 'challenge_failed', 'mfa_required',
        'step_up_required', 'user_not_found', 'token_expired',
        'unknown_subject', 'guest_mismatch', 'already_claimed', 'none',
    ];

    public const array ALLOWED_STATUSES = [
        'active', 'pending', 'revoked', 'expired', 'consumed',
        'exhausted', 'verified', 'locked', 'success', 'failure', 'denied',
    ];

    public const array ALLOWED_ERROR_CODES = [
        'ERR_INVALID_CREDENTIALS', 'ERR_ACCOUNT_LOCKED', 'ERR_RATE_LIMIT',
        'ERR_SESSION_EXPIRED', 'ERR_SESSION_REVOKED', 'ERR_PROOF_EXHAUSTED',
        'ERR_PROOF_REVOKED', 'ERR_CHALLENGE_FAILED', 'ERR_MFA_REQUIRED',
        'ERR_STEP_UP_REQUIRED', 'ERR_NOT_FOUND', 'ERR_UNAUTHORIZED',
        'ERR_FORBIDDEN', 'ERR_CONFLICT', 'ERR_VALIDATION',
    ];

    public const array ALLOWED_CODES = [
        'INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'RATE_LIMITED',
        'SESSION_EXPIRED', 'SESSION_REVOKED', 'PROOF_EXHAUSTED',
        'PROOF_REVOKED', 'CHALLENGE_FAILED', 'MFA_REQUIRED',
        'STEP_UP_REQUIRED', 'NOT_FOUND', 'UNAUTHORIZED',
        'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR',
    ];

    public function __construct(
        private readonly ?ConnectionInterface $db = null,
    ) {
    }

    private function getDb(?ConnectionInterface $override = null): ConnectionInterface
    {
        return $override ?? $this->db ?? DB::connection();
    }

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
     * Record an immutable audit event in the database.
     */
    public function record(
        AuditActor $actor,
        string $action,
        AuditOutcome $outcome,
        AuditTargetType $targetType,
        ?string $targetId = null,
        array $metadata = [],
        ?string $requestId = null,
        ?ConnectionInterface $conn = null,
    ): string {
        // 1. Validate action
        if (!AuditAction::isValid($action)) {
            throw new AuditValidationException('Unrecognized or unauthorized audit action.');
        }

        // 2. Validate target ID
        $this->validateTargetId($targetType, $targetId);

        // 3. Pre-flight validate metadata strictly before DB query
        $this->validateMetadata($metadata);

        // 4. Request ID validation or generation
        $effectiveRequestId = $requestId ?? (string) Str::uuid();
        if (!Str::isUuid($effectiveRequestId)) {
            throw new AuditValidationException('Audit request_id must be a valid UUID.');
        }

        $eventId = (string) Str::uuid();
        $metadataJson = json_encode((object) $metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $record = [
            'id' => $eventId,
            'realm' => $actor->realm,
            'action' => $action,
            'outcome' => $outcome->value,
            'passenger_id' => $actor->passengerId,
            'staff_id' => $actor->staffId,
            'is_system_actor' => $actor->isSystemActor,
            'request_id' => $effectiveRequestId,
            'target_type' => $targetType->value,
            'target_id' => $targetId,
            'metadata' => $metadataJson,
        ];

        return $this->executeInTransaction($conn, function (ConnectionInterface $tx) use ($record, $eventId) {
            $tx->table('audit_events')->insert($record);
            return $eventId;
        });
    }

    /**
     * Helper for recording unknown login subject attempts using the system actor without PII disclosure.
     */
    public function recordUnknownSubjectAttempt(
        string $action,
        AuditOutcome $outcome = AuditOutcome::Denied,
        ?string $requestId = null,
        ?ConnectionInterface $conn = null,
    ): string {
        return $this->record(
            actor: AuditActor::system(),
            action: $action,
            outcome: $outcome,
            targetType: AuditTargetType::System,
            targetId: 'none',
            metadata: [
                'reason_code' => 'unknown_subject',
                'status' => 'denied',
            ],
            requestId: $requestId,
            conn: $conn,
        );
    }

    public function validateMetadata(array $metadata): void
    {
        foreach (array_keys($metadata) as $key) {
            if (!is_string($key)) {
                throw new AuditValidationException('Audit metadata must be an associative JSON object.');
            }

            // Reject any forbidden PII / secret key
            if (in_array(strtolower($key), self::FORBIDDEN_PII_KEYS, true)) {
                throw new AuditValidationException('Forbidden PII or secret key rejected in audit metadata.');
            }

            // Reject any unapproved key
            if (!in_array($key, self::ALLOWED_METADATA_KEYS, true)) {
                throw new AuditValidationException('Unapproved key rejected in audit metadata.');
            }

            $val = $metadata[$key];

            // Type and range validation for approved keys
            switch ($key) {
                case 'attempt_count':
                case 'failed_attempts':
                case 'count':
                case 'version':
                case 'epoch':
                    if (!is_int($val) || $val < 0 || $val > 2147483647) {
                        throw new AuditValidationException('Numeric metadata key violates bounded integer constraints.');
                    }
                    break;

                case 'revoked':
                case 'consumed':
                case 'is_new':
                case 'success':
                    if (!is_bool($val)) {
                        throw new AuditValidationException('Boolean metadata key violates boolean constraint.');
                    }
                    break;

                case 'reason_code':
                    if (!is_string($val) || !in_array($val, self::ALLOWED_REASON_CODES, true)) {
                        throw new AuditValidationException('Metadata reason_code is not in approved list.');
                    }
                    break;

                case 'status':
                    if (!is_string($val) || !in_array($val, self::ALLOWED_STATUSES, true)) {
                        throw new AuditValidationException('Metadata status is not in approved list.');
                    }
                    break;

                case 'error_code':
                    if (!is_string($val) || !in_array($val, self::ALLOWED_ERROR_CODES, true)) {
                        throw new AuditValidationException('Metadata error_code is not in approved list.');
                    }
                    break;

                case 'code':
                    if (!is_string($val) || !in_array($val, self::ALLOWED_CODES, true)) {
                        throw new AuditValidationException('Metadata code is not in approved list.');
                    }
                    break;
            }
        }
    }

    private function validateTargetId(AuditTargetType $targetType, ?string $targetId): void
    {
        if ($targetType === AuditTargetType::System) {
            if ($targetId !== null && $targetId !== 'none') {
                throw new AuditValidationException("System target must have target_id null or 'none'.");
            }
        } else {
            if ($targetId !== null && !Str::isUuid($targetId)) {
                throw new AuditValidationException('Target ID must be a valid UUID or null.');
            }
        }
    }
}
