<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

use App\Contracts\Mail\Exceptions\InvalidMailMessageException;
use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\MailMessage;
use App\Contracts\Mail\MailSubmissionInterface;
use App\Identity\Dispatch\Exceptions\DispatchException;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Dispatcher processing security outbox records in bounded batches.
 *
 * Enforces:
 * - Deterministic total lock hierarchy across filesystem and PostgreSQL without inversion:
 *   Ledger File Lock (.dispatch_ledger.lock) -> Principal / User row lock -> Booking row lock -> Session row lock -> Challenge / Proof row lock -> Outbox row lock.
 *   Eliminates PostgreSQL 40P01 deadlock hazards with concurrent proof issuers or reissuers.
 * - Explicit finite statement (5s) and lock (3s) timeouts configured via SET LOCAL before lock acquisition.
 * - Samples live clock_timestamp strictly AFTER all authority locks are acquired.
 * - Revalidates all bindings, credential epochs, session states, and deadlines post-lock wait.
 * - Local capture with MailSubmissionInterface stays 'queued' in PostgreSQL:
 *   MUST NOT set accepted, provider_message_id, accepted_at, or scrubbed for local capture.
 * - Linearizes local capture under ledger file lock and canonical DB row locks with LocalProofCaptureCoordinator.
 * - Deduplicates prior captures strictly behind canonical row locks and authority revalidation.
 * - Cleans up obsolete and revoked raw files through durable ledger, preserving failed-deletion metadata and original deadlines.
 * - Remote unconfigured and unsupported adapters fail closed before submit(), payload decryption or external I/O.
 * - Transient failure transitions: failed -> queued before deadline.
 * - Expired entries erase encrypted ciphertext completely (encrypted_payload = NULL).
 */
class OutboxDispatcher
{
    private readonly ?OwnedCaptureRetentionLedger $captureLedger;

    public function __construct(
        private readonly MailSubmissionInterface $mailSubmission,
        private readonly Encrypter $encrypter,
        private readonly ?ConnectionInterface $db = null,
        ?OwnedCaptureRetentionLedger $captureLedger = null,
    ) {
        if ($captureLedger !== null) {
            $this->captureLedger = $captureLedger;
        } elseif ($this->mailSubmission instanceof \App\Services\Foundation\Mail\LocalFileMailGateway) {
            $sinkPath = config('foundation-services.mail.local_path', storage_path('app/private/mail_sink'));
            if (is_string($sinkPath) && $sinkPath !== '') {
                try {
                    $this->captureLedger = new OwnedCaptureRetentionLedger($sinkPath, $this->db);
                } catch (\Throwable) {
                    $this->captureLedger = null;
                }
            } else {
                $this->captureLedger = null;
            }
        } else {
            $this->captureLedger = null;
        }
    }

    public function getCaptureLedger(): ?OwnedCaptureRetentionLedger
    {
        return $this->captureLedger;
    }

    private function getDb(?ConnectionInterface $override = null): ConnectionInterface
    {
        return $override ?? $this->db ?? DB::connection();
    }

    /**
     * Dispatch a bounded batch of queued outbox items.
     */
    public function dispatchBatch(int $limit = 50): DispatchBatchResult
    {
        $limit = min(max($limit, 1), 100);

        $db = $this->getDb();

        // Enforce boundary: dispatcher cannot be invoked from inside an uncommitted caller transaction
        if ($db->transactionLevel() > 0) {
            throw new DispatchException('Dispatcher cannot be invoked from inside an active transaction.');
        }

        // When local mail capture gateway is used, an owned retention ledger is mandatory
        if ($this->mailSubmission instanceof \App\Services\Foundation\Mail\LocalFileMailGateway && $this->captureLedger === null) {
            throw new DispatchException('Retention ledger is required for local mail capture.');
        }

        $isLocalCapture = ($this->mailSubmission instanceof \App\Services\Foundation\Mail\LocalFileMailGateway && $this->captureLedger !== null);

        // Bounded reconciliation of omitted or previously scrubbed/consumed/revoked entries
        // strictly for accepted local mail capture mode
        if ($isLocalCapture) {
            $this->captureLedger->cleanupExpired(now: null, batchLimit: $limit, conn: $db);
        }

        // 1. Identify candidate batch of queued items before deadline (non-authoritative index query)
        $candidateIds = $db->table('security_dispatch_outbox')
            ->where('status', 'queued')
            ->where('expires_at', '>', $db->raw('clock_timestamp()'))
            ->orderBy('id', 'asc')
            ->limit($limit)
            ->pluck('id')
            ->all();

        $processedCount = 0;
        $capturedLocallyCount = 0;
        $failedCount = 0;
        $expiredCount = 0;
        $captureIds = [];
        $errorCodes = [];

        foreach ($candidateIds as $id) {
            $processedCount++;

            if ($isLocalCapture) {
                // Local bounded capture linearization:
                // Total ordering: File Lock -> Canonical DB Row Locks (Principal -> Booking -> Session -> Proof -> Outbox)
                $this->captureLedger->withLedgerLock(function () use (
                    $db,
                    $id,
                    $limit,
                    &$capturedLocallyCount,
                    &$failedCount,
                    &$expiredCount,
                    &$captureIds,
                    &$errorCodes,
                ) {
                    $dispatchOutcome = null;
                    $failureReason = null;
                    $liveNowCapture = null;

                    try {
                        $db->transaction(function (ConnectionInterface $tx) use (
                            $id,
                            &$dispatchOutcome,
                            &$liveNowCapture,
                        ) {
                            $tx->statement("SET LOCAL statement_timeout = '5s'");
                            $tx->statement("SET LOCAL lock_timeout = '3s'");

                            $candidate = $tx->table('security_dispatch_outbox')
                                ->where('id', $id)
                                ->first();

                            if (!$candidate || $candidate->status !== 'queued') {
                                $dispatchOutcome = ['status' => 'skipped'];
                                return;
                            }

                            $proofFkMap = [
                                'user_verification_id' => [
                                    'table' => 'user_email_verifications',
                                    'principalTable' => 'users',
                                    'principalCol' => 'user_id',
                                ],
                                'user_reset_id' => [
                                    'table' => 'user_password_resets',
                                    'principalTable' => 'users',
                                    'principalCol' => 'user_id',
                                ],
                                'staff_invitation_id' => [
                                    'table' => 'staff_invitations',
                                    'principalTable' => 'staff_users',
                                    'principalCol' => 'staff_id',
                                ],
                                'staff_reset_id' => [
                                    'table' => 'staff_password_resets',
                                    'principalTable' => 'staff_users',
                                    'principalCol' => 'staff_id',
                                ],
                            ];

                            $matchedProofFk = null;
                            $principal = null;
                            $proof = null;
                            $user = null;
                            $booking = null;
                            $session = null;
                            $chal = null;

                            foreach ($proofFkMap as $fkCol => $meta) {
                                if ($candidate->{$fkCol} !== null) {
                                    $matchedProofFk = ['fkCol' => $fkCol, 'meta' => $meta, 'proofId' => (string) $candidate->{$fkCol}];
                                    break;
                                }
                            }

                            // Canonical row lock acquisition: Principal -> Proof -> Outbox
                            if ($matchedProofFk !== null) {
                                $meta = $matchedProofFk['meta'];
                                $proofId = $matchedProofFk['proofId'];
                                $prelim = $tx->table($meta['table'])->where('id', $proofId)->first(['id', $meta['principalCol']]);
                                if ($prelim) {
                                    $principalId = (string) $prelim->{$meta['principalCol']};
                                    // 1. Principal lock
                                    $principal = $tx->table($meta['principalTable'])->where('id', $principalId)->lockForUpdate()->first(['id', 'email', 'credential_epoch', 'status']);
                                    // 2. Proof lock
                                    $proof = $tx->table($meta['table'])->where('id', $proofId)->lockForUpdate()->first();
                                }
                            } elseif ($candidate->booking_challenge_id !== null) {
                                $chalId = (string) $candidate->booking_challenge_id;
                                $chalPrelim = $tx->table('booking_guest_challenges')->where('id', $chalId)->first(['id', 'booking_id', 'user_id', 'session_id']);
                                if ($chalPrelim) {
                                    // 1. User lock
                                    if ($chalPrelim->user_id !== null) {
                                        $user = $tx->table('users')->where('id', $chalPrelim->user_id)->lockForUpdate()->first(['id', 'email', 'credential_epoch', 'status', 'email_verified_at', 'password_hash']);
                                    }
                                    // 2. Booking lock
                                    if ($chalPrelim->booking_id !== null) {
                                        $booking = $tx->table('bookings')->where('id', $chalPrelim->booking_id)->lockForUpdate()->first(['id', 'contact_email', 'security_epoch']);
                                    }
                                    // 3. Bound session lock
                                    if ($chalPrelim->session_id !== null) {
                                        $session = $tx->table('passenger_sessions')->where('id', $chalPrelim->session_id)->lockForUpdate()->first();
                                    }
                                    // 4. Challenge lock
                                    $chal = $tx->table('booking_guest_challenges')->where('id', $chalId)->lockForUpdate()->first();
                                }
                            }

                            // 3. Outbox row lock
                            $row = $tx->table('security_dispatch_outbox')
                                ->where('id', $id)
                                ->lockForUpdate()
                                ->first();

                            if (!$row || $row->status !== 'queued' || $row->encrypted_payload === null) {
                                $dispatchOutcome = ['status' => 'skipped'];
                                return;
                            }

                            // Live clock derivation strictly AFTER acquiring all locks
                            $liveNowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
                            $liveNow = CarbonImmutable::parse($liveNowRow->now);
                            $liveNowCapture = $liveNow;
                            $expiresAt = CarbonImmutable::parse($row->expires_at);

                            if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                                $tx->table('security_dispatch_outbox')
                                    ->where('id', $id)
                                    ->update([
                                        'status' => 'expired',
                                        'encrypted_payload' => null,
                                    ]);
                                $dispatchOutcome = ['status' => 'expired'];
                                return;
                            }

                            // Revalidate authority bindings post-lock wait
                            $isAuthorityValid = true;

                            if ($matchedProofFk !== null) {
                                if (!$principal || !$proof) {
                                    $isAuthorityValid = false;
                                } elseif ($proof->state !== 'issued') {
                                    $isAuthorityValid = false;
                                } elseif ((int) $principal->credential_epoch !== (int) $proof->credential_epoch) {
                                    $isAuthorityValid = false;
                                } elseif ((string) $principal->email !== (string) $proof->email_snapshot) {
                                    $isAuthorityValid = false;
                                } elseif ($liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($proof->expires_at))) {
                                    $isAuthorityValid = false;
                                }
                            } elseif ($candidate->booking_challenge_id !== null) {
                                if (!$chal || $chal->booking_id === null || $chal->state !== 'issued' || (int) $chal->failed_attempts >= 5 || $chal->state === 'exhausted') {
                                    $isAuthorityValid = false;
                                } elseif ($liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($chal->expires_at))) {
                                    $isAuthorityValid = false;
                                } elseif (!$booking || ($chal->security_epoch !== null && (int) $booking->security_epoch !== (int) $chal->security_epoch)) {
                                    $isAuthorityValid = false;
                                } elseif (!$session || $session->revoked_at !== null) {
                                    $isAuthorityValid = false;
                                } else {
                                    $sessionAbsExpiry = CarbonImmutable::parse($session->absolute_expires_at);
                                    $sessionIdleExpiry = CarbonImmutable::parse($session->idle_expires_at);
                                    if ($liveNow->greaterThanOrEqualTo($sessionAbsExpiry) || $liveNow->greaterThanOrEqualTo($sessionIdleExpiry)) {
                                        $isAuthorityValid = false;
                                    } elseif ($chal->purpose === 'claim_booking') {
                                        if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id || $session->auth_level !== 'full') {
                                            $isAuthorityValid = false;
                                        } elseif (!$user || $user->status !== 'active' || $user->email_verified_at === null || $user->password_hash === null || $user->password_hash === '') {
                                            $isAuthorityValid = false;
                                        } elseif ($user->credential_epoch === null || (int) $user->credential_epoch < 1 || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                                            $isAuthorityValid = false;
                                        }
                                    } else {
                                        if ($session->auth_level === 'anonymous') {
                                            if ($session->user_id !== null || $chal->user_id !== null) {
                                                $isAuthorityValid = false;
                                            }
                                        } elseif ($session->auth_level === 'full') {
                                            if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id) {
                                                $isAuthorityValid = false;
                                            } elseif (!$user || $user->status !== 'active' || $user->email_verified_at === null || $user->password_hash === null || $user->password_hash === '') {
                                                $isAuthorityValid = false;
                                            } elseif ($user->credential_epoch === null || (int) $user->credential_epoch < 1 || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                                                $isAuthorityValid = false;
                                            }
                                        } else {
                                            $isAuthorityValid = false;
                                        }
                                    }
                                }
                            }

                            if (!$isAuthorityValid) {
                                $tx->table('security_dispatch_outbox')
                                    ->where('id', $id)
                                    ->update([
                                        'status' => 'scrubbed',
                                        'scrubbed_at' => $tx->raw('clock_timestamp()'),
                                        'encrypted_payload' => null,
                                    ]);
                                $dispatchOutcome = ['status' => 'scrubbed'];
                                return;
                            }

                            // Authoritative dedupe check: post-lock wait under validated authority with fresh database time
                            if ($this->captureLedger->hasActiveCapture($id, $liveNow)) {
                                $existingCapId = $this->captureLedger->getActiveCaptureId($id, $liveNow);
                                if ($existingCapId !== null) {
                                    $dispatchOutcome = [
                                        'status' => 'captured',
                                        'capture_id' => $existingCapId,
                                    ];
                                    return;
                                }
                            }

                            $targetId = $row->user_verification_id
                                ?? $row->user_reset_id
                                ?? $row->staff_invitation_id
                                ?? $row->staff_reset_id
                                ?? $row->booking_challenge_id;

                            $targetPurpose = match (true) {
                                $row->user_verification_id !== null => 'passenger_email_verification',
                                $row->user_reset_id !== null => 'passenger_password_reset',
                                $row->staff_invitation_id !== null => 'staff_invitation',
                                $row->staff_reset_id !== null => 'staff_password_reset',
                                $row->booking_challenge_id !== null => 'booking_guest_challenge',
                                default => 'unknown',
                            };

                            // Decrypt payload
                            $decryptedJson = $this->encrypter->decrypt($row->encrypted_payload);
                            $payload = OutboxPayload::fromJson($decryptedJson);

                            // Coordinate local proof capture with pre-write reservation
                            $coordinator = new LocalProofCaptureCoordinator($this->captureLedger);
                            $message = new MailMessage(
                                recipient: $payload->getRecipient(),
                                subject: $payload->getSubject(),
                                body: $payload->getBody(),
                            );

                            $captureId = $coordinator->captureProof(
                                outboxId: $id,
                                targetId: (string) $targetId,
                                purpose: $targetPurpose,
                                expiresAt: $expiresAt,
                                message: $message,
                            );

                            // Record attempt count on outbox row
                            $tx->table('security_dispatch_outbox')
                                ->where('id', $id)
                                ->update([
                                    'attempts' => (int) $row->attempts + 1,
                                ]);

                            $dispatchOutcome = [
                                'status' => 'captured',
                                'capture_id' => $captureId,
                            ];
                        });
                    } catch (Throwable $e) {
                        if ($e instanceof InvalidMailMessageException) {
                            $failureReason = 'ERR_INVALID_MAIL_MESSAGE';
                        } elseif ($e instanceof MailCaptureException) {
                            $failureReason = 'ERR_MAIL_CAPTURE_IO';
                        } elseif (str_contains($e->getMessage(), 'decrypt')) {
                            $failureReason = 'ERR_PAYLOAD_DECRYPTION';
                        } else {
                            $failureReason = 'ERR_TRANSIENT_DISPATCH_FAILURE';
                        }
                    }

                    if ($failureReason !== null) {
                        $failedCount++;
                        $errorCodes[] = $failureReason;
                        $this->markFailed($id, $failureReason);
                        return;
                    }

                    if ($dispatchOutcome === null || $dispatchOutcome['status'] === 'skipped') {
                        return;
                    }

                    if ($dispatchOutcome['status'] === 'expired') {
                        $expiredCount++;
                        $this->captureLedger->reconcileOutboxRevocation($id, $liveNowCapture, $limit);
                        return;
                    }

                    if ($dispatchOutcome['status'] === 'scrubbed') {
                        $this->captureLedger->reconcileOutboxRevocation($id, $liveNowCapture, $limit);
                        return;
                    }

                    if ($dispatchOutcome['status'] === 'captured') {
                        $capturedLocallyCount++;
                        $captureIds[] = $dispatchOutcome['capture_id'];
                    }
                });
                continue;
            }

            // Unsupported non-local dispatch: fails closed BEFORE submit(), payload decryption or external I/O
            $outcome = $db->transaction(function (ConnectionInterface $tx) use ($id) {
                $tx->statement("SET LOCAL statement_timeout = '5s'");
                $tx->statement("SET LOCAL lock_timeout = '3s'");

                $candidate = $tx->table('security_dispatch_outbox')
                    ->where('id', $id)
                    ->first();

                if (!$candidate || $candidate->status !== 'queued') {
                    return 'skipped';
                }

                $proofFkMap = [
                    'user_verification_id' => [
                        'table' => 'user_email_verifications',
                        'principalTable' => 'users',
                        'principalCol' => 'user_id',
                    ],
                    'user_reset_id' => [
                        'table' => 'user_password_resets',
                        'principalTable' => 'users',
                        'principalCol' => 'user_id',
                    ],
                    'staff_invitation_id' => [
                        'table' => 'staff_invitations',
                        'principalTable' => 'staff_users',
                        'principalCol' => 'staff_id',
                    ],
                    'staff_reset_id' => [
                        'table' => 'staff_password_resets',
                        'principalTable' => 'staff_users',
                        'principalCol' => 'staff_id',
                    ],
                ];

                $matchedProofFk = null;
                $principal = null;
                $proof = null;
                $user = null;
                $booking = null;
                $session = null;
                $chal = null;

                foreach ($proofFkMap as $fkCol => $meta) {
                    if ($candidate->{$fkCol} !== null) {
                        $matchedProofFk = ['fkCol' => $fkCol, 'meta' => $meta, 'proofId' => (string) $candidate->{$fkCol}];
                        break;
                    }
                }

                if ($matchedProofFk !== null) {
                    $meta = $matchedProofFk['meta'];
                    $proofId = $matchedProofFk['proofId'];
                    $prelim = $tx->table($meta['table'])->where('id', $proofId)->first(['id', $meta['principalCol']]);
                    if ($prelim) {
                        $principalId = (string) $prelim->{$meta['principalCol']};
                        $principal = $tx->table($meta['principalTable'])->where('id', $principalId)->lockForUpdate()->first(['id', 'email', 'credential_epoch', 'status']);
                        $proof = $tx->table($meta['table'])->where('id', $proofId)->lockForUpdate()->first();
                    }
                } elseif ($candidate->booking_challenge_id !== null) {
                    $chalId = (string) $candidate->booking_challenge_id;
                    $chalPrelim = $tx->table('booking_guest_challenges')->where('id', $chalId)->first(['id', 'booking_id', 'user_id', 'session_id']);
                    if ($chalPrelim) {
                        if ($chalPrelim->user_id !== null) {
                            $user = $tx->table('users')->where('id', $chalPrelim->user_id)->lockForUpdate()->first(['id', 'email', 'credential_epoch', 'status', 'email_verified_at', 'password_hash']);
                        }
                        if ($chalPrelim->booking_id !== null) {
                            $booking = $tx->table('bookings')->where('id', $chalPrelim->booking_id)->lockForUpdate()->first(['id', 'contact_email', 'security_epoch']);
                        }
                        if ($chalPrelim->session_id !== null) {
                            $session = $tx->table('passenger_sessions')->where('id', $chalPrelim->session_id)->lockForUpdate()->first();
                        }
                        $chal = $tx->table('booking_guest_challenges')->where('id', $chalId)->lockForUpdate()->first();
                    }
                }

                $row = $tx->table('security_dispatch_outbox')
                    ->where('id', $id)
                    ->lockForUpdate()
                    ->first();

                if (!$row || $row->status !== 'queued' || $row->encrypted_payload === null) {
                    return 'skipped';
                }

                $liveNowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
                $liveNow = CarbonImmutable::parse($liveNowRow->now);
                $expiresAt = CarbonImmutable::parse($row->expires_at);

                if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                    $tx->table('security_dispatch_outbox')
                        ->where('id', $id)
                        ->update([
                            'status' => 'expired',
                            'encrypted_payload' => null,
                        ]);
                    return 'expired';
                }

                $isAuthorityValid = true;

                if ($matchedProofFk !== null) {
                    if (!$principal || !$proof) {
                        $isAuthorityValid = false;
                    } elseif ($proof->state !== 'issued') {
                        $isAuthorityValid = false;
                    } elseif ((int) $principal->credential_epoch !== (int) $proof->credential_epoch) {
                        $isAuthorityValid = false;
                    } elseif ((string) $principal->email !== (string) $proof->email_snapshot) {
                        $isAuthorityValid = false;
                    } elseif ($liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($proof->expires_at))) {
                        $isAuthorityValid = false;
                    }
                } elseif ($candidate->booking_challenge_id !== null) {
                    if (!$chal || $chal->booking_id === null || $chal->state !== 'issued' || (int) $chal->failed_attempts >= 5 || $chal->state === 'exhausted') {
                        $isAuthorityValid = false;
                    } elseif ($liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($chal->expires_at))) {
                        $isAuthorityValid = false;
                    } elseif (!$booking || ($chal->security_epoch !== null && (int) $booking->security_epoch !== (int) $chal->security_epoch)) {
                        $isAuthorityValid = false;
                    } elseif (!$session || $session->revoked_at !== null) {
                        $isAuthorityValid = false;
                    } else {
                        $sessionAbsExpiry = CarbonImmutable::parse($session->absolute_expires_at);
                        $sessionIdleExpiry = CarbonImmutable::parse($session->idle_expires_at);
                        if ($liveNow->greaterThanOrEqualTo($sessionAbsExpiry) || $liveNow->greaterThanOrEqualTo($sessionIdleExpiry)) {
                            $isAuthorityValid = false;
                        } elseif ($chal->purpose === 'claim_booking') {
                            if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id || $session->auth_level !== 'full') {
                                $isAuthorityValid = false;
                            } elseif (!$user || $user->status !== 'active' || $user->email_verified_at === null || $user->password_hash === null || $user->password_hash === '') {
                                $isAuthorityValid = false;
                            } elseif ($user->credential_epoch === null || (int) $user->credential_epoch < 1 || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                                $isAuthorityValid = false;
                            }
                        } else {
                            if ($session->auth_level === 'anonymous') {
                                if ($session->user_id !== null || $chal->user_id !== null) {
                                    $isAuthorityValid = false;
                                }
                            } elseif ($session->auth_level === 'full') {
                                if ($chal->user_id === null || (string) $session->user_id !== (string) $chal->user_id) {
                                    $isAuthorityValid = false;
                                } elseif (!$user || $user->status !== 'active' || $user->email_verified_at === null || $user->password_hash === null || $user->password_hash === '') {
                                    $isAuthorityValid = false;
                                } elseif ($user->credential_epoch === null || (int) $user->credential_epoch < 1 || $session->credential_epoch === null || (int) $session->credential_epoch !== (int) $user->credential_epoch) {
                                    $isAuthorityValid = false;
                                }
                            } else {
                                $isAuthorityValid = false;
                            }
                        }
                    }
                }

                if (!$isAuthorityValid) {
                    $tx->table('security_dispatch_outbox')
                        ->where('id', $id)
                        ->update([
                            'status' => 'scrubbed',
                            'scrubbed_at' => $tx->raw('clock_timestamp()'),
                            'encrypted_payload' => null,
                        ]);
                    return 'scrubbed';
                }

                // Non-local dispatch rejected fail-closed BEFORE submit(), payload decryption or external I/O
                $tx->table('security_dispatch_outbox')
                    ->where('id', $id)
                    ->update([
                        'status' => 'failed',
                        'attempts' => (int) $row->attempts + 1,
                    ]);

                return 'failed_unconfigured';
            });

            if ($outcome === 'skipped') {
                continue;
            }

            if ($outcome === 'expired') {
                $expiredCount++;
                continue;
            }

            if ($outcome === 'scrubbed') {
                continue;
            }

            if ($outcome === 'failed_unconfigured') {
                $failedCount++;
                $errorCodes[] = 'ERR_UNCONFIGURED_PROVIDER';
                continue;
            }
        }

        return new DispatchBatchResult(
            processedCount: $processedCount,
            capturedLocallyCount: $capturedLocallyCount,
            failedCount: $failedCount,
            expiredCount: $expiredCount,
            captureIds: $captureIds,
            errorCodes: array_values(array_unique($errorCodes)),
        );
    }

    /**
     * Reset transient failed items back to queued before deadline.
     */
    public function retryFailed(int $limit = 50): int
    {
        $limit = min(max($limit, 1), 100);
        $db = $this->getDb();

        return $db->table('security_dispatch_outbox')
            ->where('status', 'failed')
            ->where('expires_at', '>', $db->raw('clock_timestamp()'))
            ->orderBy('id', 'asc')
            ->limit($limit)
            ->update(['status' => 'queued']);
    }

    /**
     * Bounded cleanup: expire and erase ciphertext for items past their deadline.
     */
    public function expireAndErase(int $limit = 100): int
    {
        $limit = min(max($limit, 1), 500);
        $db = $this->getDb();

        return $db->transaction(function (ConnectionInterface $tx) use ($limit) {
            $tx->statement("SET LOCAL statement_timeout = '5s'");
            $tx->statement("SET LOCAL lock_timeout = '3s'");

            $expiredIds = $tx->table('security_dispatch_outbox')
                ->whereIn('status', ['queued', 'failed'])
                ->where('expires_at', '<=', $tx->raw('clock_timestamp()'))
                ->orderBy('id', 'asc')
                ->limit($limit)
                ->lockForUpdate()
                ->pluck('id')
                ->all();

            if (empty($expiredIds)) {
                return 0;
            }

            return $tx->table('security_dispatch_outbox')
                ->whereIn('id', $expiredIds)
                ->update([
                    'status' => 'expired',
                    'encrypted_payload' => null,
                ]);
        });
    }

    private function markFailed(string $id, string $reasonTag): void
    {
        $db = $this->getDb();

        $db->transaction(function (ConnectionInterface $tx) use ($id) {
            $tx->statement("SET LOCAL statement_timeout = '5s'");
            $tx->statement("SET LOCAL lock_timeout = '3s'");

            $row = $tx->table('security_dispatch_outbox')
                ->where('id', $id)
                ->lockForUpdate()
                ->first(['id', 'expires_at']);

            if (!$row) {
                return;
            }

            $liveNowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $liveNow = CarbonImmutable::parse($liveNowRow->now);
            $expiresAt = CarbonImmutable::parse($row->expires_at);

            if ($liveNow->greaterThanOrEqualTo($expiresAt)) {
                $tx->table('security_dispatch_outbox')
                    ->where('id', $id)
                    ->update([
                        'status' => 'expired',
                        'encrypted_payload' => null,
                    ]);
            } else {
                $tx->table('security_dispatch_outbox')
                    ->where('id', $id)
                    ->update([
                        'status' => 'failed',
                    ]);
            }
        });
    }
}
