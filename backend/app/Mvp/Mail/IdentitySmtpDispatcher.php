<?php

declare(strict_types=1);

namespace App\Mvp\Mail;

use App\SharedHosting\SharedHostingTimeoutException;
use App\Deployment\SmtpDeadline;
use App\Deployment\SmtpDeadlineException;
use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class IdentitySmtpDispatcher
{
    /** @var ?callable */
    private $beforeFinalizeHook = null;

    public function __construct(
        private readonly MailSettings $settings,
        private readonly Encrypter $encrypter,
        private readonly ?ConnectionInterface $db = null,
    ) {}

    public function setBeforeFinalizeHook(?callable $hook): void
    {
        $this->beforeFinalizeHook = $hook;
    }

    private function getDb(): ConnectionInterface
    {
        return $this->db ?? DB::connection();
    }

    public function runOne(): bool
    {
        $isLocalOrTesting = app()->environment('local', 'testing');
        $isSharedHosting = app()->environment('production', 'staging')
            && config('foundation-services.shared_hosting_enabled') === true;

        if (!$isLocalOrTesting && !$isSharedHosting) {
            throw new \LogicException('Identity SMTP dispatch is only permitted in authorized environments.');
        }

        if (config('mvp-mail.enabled') !== true || config('mvp-mail.identity_smtp_enabled') !== true) {
            return false;
        }

        $db = $this->getDb();
        if ($db->transactionLevel() !== 0) {
            throw new \LogicException('Identity SMTP dispatch cannot be invoked from inside an active transaction.');
        }

        $config = $this->settings->forWorker();
        if (!$config || $config['driver'] !== 'smtp') {
            return false;
        }

        if (!in_array($config['host'], config('mvp-mail.allowed_hosts', []), true)) {
            throw new \LogicException('SMTP host is not authorized.');
        }

        if (app()->environment('production', 'staging')) {
            // Operator host allowlist 465 implicit TLS / 587 STARTTLS only approved
            if (!in_array($config['host'], ['mail.gazaairport.com'], true)) {
                throw new \LogicException('Unauthorized SMTP host for production/staging.');
            }
            if (!in_array($config['port'], [465, 587], true)) {
                throw new \LogicException('Unauthorized SMTP port for production/staging.');
            }
            if ($config['port'] === 465 && $config['tls'] !== 'tls') {
                throw new \LogicException('Port 465 requires implicit TLS.');
            }
            if ($config['port'] === 587 && $config['tls'] !== 'starttls') {
                throw new \LogicException('Port 587 requires STARTTLS.');
            }
        } else {
            if ($config['tls'] === 'none' && (!app()->environment('local', 'testing') || !in_array($config['host'], ['mailpit', '127.0.0.1', 'localhost'], true) || $config['port'] !== 1025)) {
                throw new \LogicException('Insecure SMTP transport is unauthorized.');
            }
        }

        // Hard wall-clock capability guard
        SmtpDeadline::assertHardDeadlineCapability('IdentitySmtpDispatcher');

        // Bounded reconciliation of expired leases / processing markers to uncertain
        $this->reconcileExpiredMarkers();

        // 1. Send-Admission Linearization Transaction:
        // Canonical lock hierarchy: Principal -> Proof -> Outbox -> Marker
        // Revalidates unexpired issued proof, epoch, email, status, recipient, purpose, token, closed payload
        // strictly AFTER waited locks, sets processing marker, and COMMITS BEFORE SMTP.
        $admission = $db->transaction(function (ConnectionInterface $tx) use ($config): ?array {
            // Candidate discovery: select single outbox row without PG 'FOR UPDATE OF join'
            $candidate = $tx->table('security_dispatch_outbox as sdo')
                ->whereIn('sdo.status', ['queued', 'failed'])
                ->whereNull('sdo.booking_challenge_id')
                ->whereRaw('((sdo.user_verification_id IS NOT NULL) + (sdo.user_reset_id IS NOT NULL) + (sdo.staff_invitation_id IS NOT NULL) + (sdo.staff_reset_id IS NOT NULL)) = 1')
                ->where(function ($q) {
                    $q->whereNotExists(function ($sub) {
                        $sub->select(DB::raw(1))
                            ->from('security_smtp_attempts as ssa')
                            ->whereColumn('ssa.outbox_id', 'sdo.id')
                            ->where(function ($q2) {
                                $q2->whereIn('ssa.status', ['processing', 'accepted', 'uncertain', 'scrubbed'])
                                    ->orWhere(function ($q3) {
                                        $q3->where('ssa.status', 'failed')
                                            ->where(function ($q4) {
                                                $q4->where('ssa.attempt', '>=', 5)
                                                    ->orWhere(function ($q5) {
                                                        $q5->whereNotNull('ssa.next_attempt_at')
                                                            ->where('ssa.next_attempt_at', '>', DB::raw('UTC_TIMESTAMP(6)'));
                                                    });
                                            });
                                    });
                            });
                    });
                })
                ->orderBy('sdo.id', 'asc')
                ->lock('FOR UPDATE SKIP LOCKED')
                ->first([
                    'sdo.id',
                    'sdo.user_verification_id',
                    'sdo.user_reset_id',
                    'sdo.staff_invitation_id',
                    'sdo.staff_reset_id',
                ]);

            if (!$candidate) {
                return null;
            }

            $outboxId = (string) $candidate->id;

            $matched = match (true) {
                $candidate->user_verification_id !== null => [
                    'fkCol' => 'user_verification_id',
                    'proofTable' => 'user_email_verifications',
                    'proofId' => (string) $candidate->user_verification_id,
                    'principalTable' => 'users',
                    'principalCol' => 'user_id',
                    'purpose' => 'passenger_email_verification',
                ],
                $candidate->user_reset_id !== null => [
                    'fkCol' => 'user_reset_id',
                    'proofTable' => 'user_password_resets',
                    'proofId' => (string) $candidate->user_reset_id,
                    'principalTable' => 'users',
                    'principalCol' => 'user_id',
                    'purpose' => 'passenger_password_reset',
                ],
                $candidate->staff_invitation_id !== null => [
                    'fkCol' => 'staff_invitation_id',
                    'proofTable' => 'staff_invitations',
                    'proofId' => (string) $candidate->staff_invitation_id,
                    'principalTable' => 'staff_users',
                    'principalCol' => 'staff_id',
                    'purpose' => 'staff_invitation',
                ],
                $candidate->staff_reset_id !== null => [
                    'fkCol' => 'staff_reset_id',
                    'proofTable' => 'staff_password_resets',
                    'proofId' => (string) $candidate->staff_reset_id,
                    'principalTable' => 'staff_users',
                    'principalCol' => 'staff_id',
                    'purpose' => 'staff_password_reset',
                ],
                default => null,
            };

            if ($matched === null) {
                $this->scrubCandidate($tx, $outboxId);
                return ['admitted' => false];
            }

            // Preliminary read for principal lookup
            $proofPrelim = $tx->table($matched['proofTable'])
                ->where('id', $matched['proofId'])
                ->first(['id', $matched['principalCol']]);

            if (!$proofPrelim) {
                $this->scrubCandidate($tx, $outboxId);
                return ['admitted' => false];
            }

            $principalId = (string) $proofPrelim->{$matched['principalCol']};

            // Canonical lock hierarchy: Principal -> Proof -> Outbox -> Marker
            $principal = $tx->table($matched['principalTable'])
                ->where('id', $principalId)
                ->lockForUpdate()
                ->first(['id', 'email', 'credential_epoch', 'status']);

            $proof = $tx->table($matched['proofTable'])
                ->where('id', $matched['proofId'])
                ->lockForUpdate()
                ->first();

            $outbox = $tx->table('security_dispatch_outbox')
                ->where('id', $outboxId)
                ->lockForUpdate()
                ->first();

            // Lock or create unique processing marker
            $marker = $tx->table('security_smtp_attempts')
                ->where('outbox_id', $outboxId)
                ->lockForUpdate()
                ->first();

            $markerId = $marker ? (string) $marker->id : (string) Str::uuid();
            $attempt = $marker ? ((int) $marker->attempt + 1) : 1;

            if ($attempt > 5) {
                return null;
            }

            if (!$principal || !$proof || !$outbox || $outbox->encrypted_payload === null) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            // Verify outbox status post-lock: only queued or failed allowed
            if (!in_array($outbox->status, ['queued', 'failed'], true)) {
                if ($marker) {
                    $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                        'status' => 'scrubbed',
                        'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                    ]);
                }
                return null;
            }

            // Verify unchanged proof FK AFTER canonical locks
            if ((string) $outbox->{$matched['fkCol']} !== $matched['proofId']) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            $allFks = ['user_verification_id', 'user_reset_id', 'staff_invitation_id', 'staff_reset_id', 'booking_challenge_id'];
            foreach ($allFks as $fk) {
                if ($fk !== $matched['fkCol'] && $outbox->{$fk} !== null) {
                    $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                    return ['admitted' => false];
                }
            }

            // If marker already existed, verify it's eligible
            if ($marker) {
                if ($marker->status !== 'failed' || (int) $marker->attempt >= 5) {
                    return null;
                }
            }

            // Sample live clock strictly AFTER acquiring all locks
            $liveNowRow = $tx->selectOne('SELECT UTC_TIMESTAMP(6) AS now');
            $liveNow = CarbonImmutable::parse($liveNowRow->now);

            $outboxExpiresAt = CarbonImmutable::parse($outbox->expires_at);
            if ($liveNow->greaterThanOrEqualTo($outboxExpiresAt)) {
                $this->expireEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            $proofExpiresAt = CarbonImmutable::parse($proof->expires_at);
            if ($liveNow->greaterThanOrEqualTo($proofExpiresAt)) {
                $this->expireEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            // Revalidate authority bindings
            if ($proof->state !== 'issued') {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            if ((int) $principal->credential_epoch !== (int) $proof->credential_epoch) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            if ((string) $principal->email !== (string) $proof->email_snapshot) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            // Principal status eligibility
            $isEligible = match ($matched['purpose']) {
                'passenger_email_verification' => in_array($principal->status, ['unverified', 'active'], true),
                'passenger_password_reset' => $principal->status === 'active',
                'staff_invitation' => $principal->status === 'invited',
                'staff_password_reset' => $principal->status === 'active',
                default => false,
            };

            if (!$isEligible) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            // Closed payload decryption and verification
            try {
                $payloadJson = $this->encrypter->decrypt($outbox->encrypted_payload);
                $payload = OutboxPayload::fromJson($payloadJson);
                if (!hash_equals((string) $proof->token_digest, OpaqueToken::digestOf($payload->getTokenOrCode()))) {
                    $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                    return ['admitted' => false];
                }
            } catch (\Throwable) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            $derivedRecipient = (string) $proof->email_snapshot;
            if (strtolower(trim($payload->getRecipient())) !== strtolower(trim($derivedRecipient))) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            if ($payload->purpose !== $matched['purpose']) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return ['admitted' => false];
            }

            // ALL VALIDATIONS PASSED: COMMIT SEND-ADMISSION BEFORE SMTP
            if ($marker) {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'processing',
                    'attempt' => $attempt,
                    'deadline' => $tx->raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 120 SECOND)"),
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
            } else {
                $tx->table('security_smtp_attempts')->insert([
                    'id' => $markerId,
                    'outbox_id' => $outboxId,
                    'status' => 'processing',
                    'attempt' => $attempt,
                    'deadline' => $tx->raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 120 SECOND)"),
                    'created_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
            }

            $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                'attempts' => $attempt,
            ]);

            $providerMessageId = (string) Str::uuid() . '@gazaairport.com';

            return [
                'admitted' => true,
                'outbox_id' => $outboxId,
                'marker_id' => $markerId,
                'attempt' => $attempt,
                'recipient' => $derivedRecipient,
                'subject' => $payload->getSubject(),
                'body' => $payload->getBody(),
                'provider_message_id' => $providerMessageId,
                'live_now_iso' => $liveNow->toIso8601String(),
            ];
        });

        if ($admission === null) {
            return false;
        }

        if ($admission['admitted'] !== true) {
            return true; // Item was processed and scrubbed/expired without SMTP
        }

        // 2. External I/O Phase: Strictly at transactionLevel === 0
        if ($db->transactionLevel() !== 0) {
            throw new \LogicException('External I/O MUST transactionLevel 0');
        }

        $email = (new Email())
            ->from(new Address($config['senderEmail'], $config['senderName']))
            ->to(new Address($admission['recipient']))
            ->date(new \DateTimeImmutable($admission['live_now_iso']))
            ->subject($admission['subject'])
            ->text($admission['body']);

        if ($config['replyTo'] !== '') {
            $email->replyTo($config['replyTo']);
        }
        $email->getHeaders()->addIdHeader('Message-ID', $admission['provider_message_id']);

        $outcome = 'failed';
        $transport = null;
        $deadlineExpired = false;
        $outerTimeoutException = null;

        try {
            $transport = new EsmtpTransport($config['host'], $config['port'], $config['tls'] === 'tls');
            $transport->setAutoTls($config['tls'] === 'starttls')->setRequireTls($config['tls'] !== 'none');
            SmtpDeadline::configureTransportStream($transport, 3);

            if ($config['username'] !== '') {
                $transport->setUsername($config['username'])->setPassword($config['password']);
            }

            SmtpDeadline::runWithDeadline(function () use ($transport, $email, &$outcome) {
                $transport->start();
                // Transport connected; failures during or after DATA are ambiguous/uncertain
                $outcome = 'uncertain';
                $transport->send($email);
                $outcome = 'accepted';
            }, 8);
        } catch (SharedHostingTimeoutException $e) {
            $deadlineExpired = true;
            $outcome = 'uncertain';
            $outerTimeoutException = $e;
        } catch (SmtpDeadlineException) {
            $deadlineExpired = true;
            // Outcome remains failed (if pre-connect) or uncertain (if during/post DATA)
        } catch (\Throwable) {
            // Never leak secrets, tokens, email body, or SMTP conversation text
        } finally {
            if ($transport !== null) {
                SmtpDeadline::abortTransport($transport);
            }
        }

        // Hook executed at transactionLevel 0 before finalization transaction
        if ($this->beforeFinalizeHook !== null) {
            ($this->beforeFinalizeHook)();
        }

        // 3. Finalization Transaction:
        // New bounded transaction validates exact claim marker/attempt/lease (no stale overwrite).
        // Canonical lock hierarchy: Outbox FIRST, then Marker SECOND (aligns with admission).
        // Invariant: Never restore scrubbed/expired outbox to accepted after revocation.
        $db->transaction(function (ConnectionInterface $tx) use ($admission, $outcome): void {
            $outboxId = $admission['outbox_id'];
            $markerId = $admission['marker_id'];
            $attempt = $admission['attempt'];
            $providerMessageId = $admission['provider_message_id'];

            // 1. Lock Outbox FIRST (canonical hierarchy: Outbox -> Marker)
            $outbox = $tx->table('security_dispatch_outbox')
                ->where('id', $outboxId)
                ->lockForUpdate()
                ->first();

            if (!$outbox) {
                return;
            }

            // 2. Lock Marker SECOND
            $marker = $tx->table('security_smtp_attempts')
                ->where('id', $markerId)
                ->where('outbox_id', $outboxId)
                ->lockForUpdate()
                ->first();

            if (!$marker || $marker->status !== 'processing' || (int) $marker->attempt !== $attempt) {
                return;
            }

            // Fresh live clock sampled strictly AFTER acquiring locks
            $liveNowRow = $tx->selectOne('SELECT UTC_TIMESTAMP(6) AS now');
            $liveNow = CarbonImmutable::parse($liveNowRow->now);

            // Invariant: Never restore scrubbed/expired outbox to accepted after revocation
            if (in_array($outbox->status, ['scrubbed', 'expired'], true)) {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'scrubbed',
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
                return;
            }

            if ($outcome !== 'accepted' && $liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($outbox->expires_at))) {
                $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                    'status' => 'expired',
                    'encrypted_payload' => null,
                    'attempts' => $attempt,
                ]);
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'scrubbed',
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
                return;
            }

            if ($outcome === 'accepted') {
                $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                    'status' => 'accepted',
                    'provider_message_id' => $providerMessageId,
                    'accepted_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                    'attempts' => $attempt,
                ]);
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'accepted',
                    'provider_message_id' => $providerMessageId,
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
                return;
            }

            if ($outcome === 'uncertain') {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'uncertain',
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);
                $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                    'status' => 'failed',
                    'attempts' => $attempt,
                ]);
                return;
            }

            // Definite pre-submit failure before DATA (e.g. connection refused): bounded retry up to 5 with backoff
            $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                'status' => 'failed',
                'next_attempt_at' => $tx->raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 60 SECOND)"),
                'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            ]);
            $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                'status' => 'failed',
                'attempts' => $attempt,
            ]);
        });

        if ($outerTimeoutException !== null) {
            throw $outerTimeoutException;
        }

        return true;
    }

    public function reconcileExpiredMarkers(): int
    {
        $db = $this->getDb();
        return $db->transaction(function (ConnectionInterface $tx): int {
            $ids = $tx->table('security_smtp_attempts')
                ->where('status', 'processing')
                ->where('deadline', '<=', $tx->raw('UTC_TIMESTAMP(6)'))
                ->orderBy('id')
                ->limit(100)
                ->lock('FOR UPDATE SKIP LOCKED')
                ->pluck('id')
                ->all();

            if (empty($ids)) {
                return 0;
            }

            return $tx->table('security_smtp_attempts')->whereIn('id', $ids)->update([
                'status' => 'uncertain',
                'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            ]);
        });
    }

    public function expireAndErase(int $limit = 50): int
    {
        $limit = min(max($limit, 1), 100);
        $db = $this->getDb();

        return $db->transaction(function (ConnectionInterface $tx) use ($limit): int {
            $expiredIds = $tx->table('security_dispatch_outbox')
                ->whereNotNull('encrypted_payload')
                ->where('expires_at', '<=', $tx->raw('UTC_TIMESTAMP(6)'))
                ->whereNull('booking_challenge_id')
                ->orderBy('id', 'asc')
                ->limit($limit)
                ->lockForUpdate()
                ->pluck('id')
                ->all();

            if (empty($expiredIds)) {
                return 0;
            }

            $tx->table('security_dispatch_outbox')
                ->whereIn('id', $expiredIds)
                ->update([
                    'encrypted_payload' => null,
                    'status' => DB::raw("CASE WHEN status = 'accepted' THEN 'accepted' ELSE 'expired' END"),
                ]);

            $tx->table('security_smtp_attempts')
                ->whereIn('outbox_id', $expiredIds)
                ->whereIn('status', ['processing', 'failed', 'uncertain'])
                ->update([
                    'status' => 'scrubbed',
                    'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
                ]);

            return count($expiredIds);
        });
    }

    private function scrubCandidate(ConnectionInterface $tx, string $outboxId): void
    {
        $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
            'status' => 'scrubbed',
            'scrubbed_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            'encrypted_payload' => null,
        ]);
        $tx->table('security_smtp_attempts')->where('outbox_id', $outboxId)->update([
            'status' => 'scrubbed',
            'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
        ]);
    }

    private function scrubEntry(ConnectionInterface $tx, string $outboxId, string $markerId, int $attempt): void
    {
        $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
            'status' => 'scrubbed',
            'scrubbed_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            'encrypted_payload' => null,
            'attempts' => $attempt,
        ]);
        $tx->table('security_smtp_attempts')->updateOrInsert(
            ['id' => $markerId],
            [
                'outbox_id' => $outboxId,
                'status' => 'scrubbed',
                'attempt' => $attempt,
                'deadline' => $tx->raw('UTC_TIMESTAMP(6)'),
                'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            ]
        );
    }

    private function expireEntry(ConnectionInterface $tx, string $outboxId, string $markerId, int $attempt): void
    {
        $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
            'status' => 'expired',
            'encrypted_payload' => null,
            'attempts' => $attempt,
        ]);
        $tx->table('security_smtp_attempts')->updateOrInsert(
            ['id' => $markerId],
            [
                'outbox_id' => $outboxId,
                'status' => 'scrubbed',
                'attempt' => $attempt,
                'deadline' => $tx->raw('UTC_TIMESTAMP(6)'),
                'updated_at' => $tx->raw('UTC_TIMESTAMP(6)'),
            ]
        );
    }
}
