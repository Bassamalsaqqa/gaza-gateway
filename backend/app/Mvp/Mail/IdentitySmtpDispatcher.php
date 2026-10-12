<?php

declare(strict_types=1);

namespace App\Mvp\Mail;

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
        if (!app()->environment('local', 'testing')) {
            throw new \LogicException('Identity SMTP dispatch is only permitted in local and testing environments.');
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
        if ($config['tls'] === 'none' && (!app()->environment('local', 'testing') || $config['host'] !== 'mailpit' || $config['port'] !== 1025)) {
            throw new \LogicException('Insecure SMTP transport is unauthorized.');
        }

        // Bounded reconciliation of expired leases / processing markers to uncertain
        $this->reconcileExpiredMarkers();

        // 1. Claim candidate and durably commit processing marker before external I/O
        $claim = $db->transaction(function (ConnectionInterface $tx): ?array {
            $row = $tx->table('security_dispatch_outbox as sdo')
                ->leftJoin('security_smtp_attempts as ssa', 'ssa.outbox_id', '=', 'sdo.id')
                ->whereIn('sdo.status', ['queued', 'failed'])
                ->whereNull('sdo.booking_challenge_id')
                ->where(function ($q) use ($tx) {
                    $q->whereNull('ssa.id')
                        ->orWhere(function ($q2) use ($tx) {
                            $q2->where('ssa.status', 'failed')
                                ->where('ssa.attempt', '<', 5)
                                ->where(function ($q3) use ($tx) {
                                    $q3->whereNull('ssa.next_attempt_at')
                                        ->orWhere('ssa.next_attempt_at', '<=', $tx->raw('clock_timestamp()'));
                                });
                        });
                })
                ->whereRaw('num_nonnulls(sdo.user_verification_id, sdo.user_reset_id, sdo.staff_invitation_id, sdo.staff_reset_id) = 1')
                ->orderBy('sdo.id', 'asc')
                ->lock('FOR UPDATE OF sdo SKIP LOCKED')
                ->select(
                    'sdo.id',
                    'sdo.user_verification_id',
                    'sdo.user_reset_id',
                    'sdo.staff_invitation_id',
                    'sdo.staff_reset_id',
                    'ssa.id as marker_id',
                    'ssa.attempt as prior_attempt'
                )
                ->first();

            if (!$row) {
                return null;
            }

            $nextAttempt = $row->marker_id ? ((int) $row->prior_attempt + 1) : 1;
            if ($nextAttempt > 5) {
                return null;
            }

            $markerId = $row->marker_id ?? (string) Str::uuid();
            if ($row->marker_id) {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'processing',
                    'attempt' => $nextAttempt,
                    'deadline' => $tx->raw("clock_timestamp() + interval '120 seconds'"),
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
            } else {
                $tx->table('security_smtp_attempts')->insert([
                    'id' => $markerId,
                    'outbox_id' => $row->id,
                    'status' => 'processing',
                    'attempt' => $nextAttempt,
                    'deadline' => $tx->raw("clock_timestamp() + interval '120 seconds'"),
                    'created_at' => $tx->raw('clock_timestamp()'),
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
            }

            return [
                'outbox_id' => (string) $row->id,
                'marker_id' => (string) $markerId,
                'attempt' => $nextAttempt,
                'user_verification_id' => $row->user_verification_id ? (string) $row->user_verification_id : null,
                'user_reset_id' => $row->user_reset_id ? (string) $row->user_reset_id : null,
                'staff_invitation_id' => $row->staff_invitation_id ? (string) $row->staff_invitation_id : null,
                'staff_reset_id' => $row->staff_reset_id ? (string) $row->staff_reset_id : null,
            ];
        });

        if ($claim === null) {
            return false;
        }

        // 2. Submit phase holding Canonical Proof Authority locks
        $db->transaction(function (ConnectionInterface $tx) use ($claim, $config): void {
            $tx->statement("SET LOCAL statement_timeout = '5s'");
            $tx->statement("SET LOCAL lock_timeout = '3s'");

            $outboxId = $claim['outbox_id'];
            $markerId = $claim['marker_id'];
            $attempt = $claim['attempt'];

            $matched = match (true) {
                $claim['user_verification_id'] !== null => [
                    'fkCol' => 'user_verification_id',
                    'proofTable' => 'user_email_verifications',
                    'proofId' => $claim['user_verification_id'],
                    'principalTable' => 'users',
                    'principalCol' => 'user_id',
                    'purpose' => 'passenger_email_verification',
                ],
                $claim['user_reset_id'] !== null => [
                    'fkCol' => 'user_reset_id',
                    'proofTable' => 'user_password_resets',
                    'proofId' => $claim['user_reset_id'],
                    'principalTable' => 'users',
                    'principalCol' => 'user_id',
                    'purpose' => 'passenger_password_reset',
                ],
                $claim['staff_invitation_id'] !== null => [
                    'fkCol' => 'staff_invitation_id',
                    'proofTable' => 'staff_invitations',
                    'proofId' => $claim['staff_invitation_id'],
                    'principalTable' => 'staff_users',
                    'principalCol' => 'staff_id',
                    'purpose' => 'staff_invitation',
                ],
                $claim['staff_reset_id'] !== null => [
                    'fkCol' => 'staff_reset_id',
                    'proofTable' => 'staff_password_resets',
                    'proofId' => $claim['staff_reset_id'],
                    'principalTable' => 'staff_users',
                    'principalCol' => 'staff_id',
                    'purpose' => 'staff_password_reset',
                ],
                default => null,
            };

            if ($matched === null) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Prelim read for principal lookup
            $proofPrelim = $tx->table($matched['proofTable'])
                ->where('id', $matched['proofId'])
                ->first(['id', $matched['principalCol']]);

            if (!$proofPrelim) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            $principalId = (string) $proofPrelim->{$matched['principalCol']};

            // Canonical lock hierarchy: Principal -> Proof -> Outbox
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

            if (!$principal || !$proof || !$outbox || $outbox->encrypted_payload === null) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Verify outbox status post-lock: only queued or failed allowed.
            // Existing local capture dispatcher could change queued outbox while claim was committed; never send captured/scrubbed/accepted.
            if (!in_array($outbox->status, ['queued', 'failed'], true)) {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'scrubbed',
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
                return;
            }

            // Verify unchanged proof FK AFTER canonical locks
            if ((string) $outbox->{$matched['fkCol']} !== $matched['proofId']) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            $allFks = ['user_verification_id', 'user_reset_id', 'staff_invitation_id', 'staff_reset_id', 'booking_challenge_id'];
            foreach ($allFks as $fk) {
                if ($fk !== $matched['fkCol'] && $outbox->{$fk} !== null) {
                    $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                    return;
                }
            }

            // Lock and verify processing marker matches exactly before SMTP
            $marker = $tx->table('security_smtp_attempts')
                ->where('id', $markerId)
                ->where('outbox_id', $outboxId)
                ->lockForUpdate()
                ->first();

            if (!$marker || $marker->status !== 'processing' || (int) $marker->attempt !== $attempt) {
                return;
            }

            // Sample live clock strictly AFTER acquiring all locks
            $liveNowRow = $tx->selectOne('SELECT clock_timestamp() AS now');
            $liveNow = CarbonImmutable::parse($liveNowRow->now);

            if ($liveNow->greaterThanOrEqualTo(CarbonImmutable::parse($marker->deadline))) {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update(['status'=>'uncertain','updated_at'=>$tx->raw('clock_timestamp()')]);
                return;
            }
            $outboxExpiresAt = CarbonImmutable::parse($outbox->expires_at);
            if ($liveNow->greaterThanOrEqualTo($outboxExpiresAt)) {
                $this->expireEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            $proofExpiresAt = CarbonImmutable::parse($proof->expires_at);
            if ($liveNow->greaterThanOrEqualTo($proofExpiresAt)) {
                $this->expireEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Revalidate authority bindings
            if ($proof->state !== 'issued') {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            if ((int) $principal->credential_epoch !== (int) $proof->credential_epoch) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            if ((string) $principal->email !== (string) $proof->email_snapshot) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Staff invitation eligibility is strictly 'invited'
            $isEligible = match ($matched['purpose']) {
                'passenger_email_verification' => in_array($principal->status, ['unverified', 'active'], true),
                'passenger_password_reset' => $principal->status === 'active',
                'staff_invitation' => $principal->status === 'invited',
                'staff_password_reset' => $principal->status === 'active',
                default => false,
            };

            if (!$isEligible) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            try {
                $payloadJson = $this->encrypter->decrypt($outbox->encrypted_payload);
                $payload = OutboxPayload::fromJson($payloadJson);
                if (!hash_equals((string) $proof->token_digest, OpaqueToken::digestOf($payload->getTokenOrCode()))) {
                    $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                    return;
                }
            } catch (\Throwable) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Derive delivery recipient strictly from persisted proof and require match
            $derivedRecipient = (string) $proof->email_snapshot;
            if (strtolower(trim($payload->getRecipient())) !== strtolower(trim($derivedRecipient))) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            if ($payload->purpose !== $matched['purpose']) {
                $this->scrubEntry($tx, $outboxId, $markerId, $attempt);
                return;
            }

            // Build validated SMTP message
            $providerMessageId = (string) Str::uuid() . '@gazaairport.com';
            $email = (new Email())
                ->from(new Address($config['senderEmail'], $config['senderName']))
                ->to(new Address($derivedRecipient))
                ->date(new \DateTimeImmutable($liveNow->toIso8601String()))
                ->subject($payload->getSubject())
                ->text($payload->getBody());

            if ($config['replyTo'] !== '') {
                $email->replyTo($config['replyTo']);
            }
            $email->getHeaders()->addIdHeader('Message-ID', $providerMessageId);

            // Bounded SMTP submit holding authority locks
            $outcome = 'failed';
            $transport = null;
            try {
                $transport = new EsmtpTransport($config['host'], $config['port'], $config['tls'] === 'tls');
                $transport->setAutoTls($config['tls'] === 'starttls')->setRequireTls($config['tls'] !== 'none');
                $transport->getStream()->setTimeout(10);
                if ($config['username'] !== '') {
                    $transport->setUsername($config['username'])->setPassword($config['password']);
                }
                $transport->start();
                // Transport connected; failures during or after DATA transmission are ambiguous
                $outcome = 'uncertain';
                $transport->send($email);
                $outcome = 'accepted';
            } catch (\Throwable) {
                // Never leak secrets, tokens, email body, or SMTP conversation text
            } finally {
                if ($transport !== null) {
                    try { $transport->stop(); } catch (\Throwable) {}
                }
            }

            if ($outcome === 'accepted') {
                if ($this->beforeFinalizeHook !== null) {
                    ($this->beforeFinalizeHook)();
                }

                $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                    'status' => 'accepted',
                    'provider_message_id' => $providerMessageId,
                    'accepted_at' => $tx->raw('clock_timestamp()'),
                    'attempts' => $attempt,
                ]);
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'accepted',
                    'provider_message_id' => $providerMessageId,
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
                return;
            }

            if ($outcome === 'uncertain') {
                $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                    'status' => 'uncertain',
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
                $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                    'status' => 'failed',
                    'attempts' => $attempt,
                ]);
                return;
            }

            // Definite pre-submit failure before DATA (e.g. transport connection refused)
            $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
                'status' => 'failed',
                'next_attempt_at' => $tx->raw("clock_timestamp() + interval '60 seconds'"),
                'updated_at' => $tx->raw('clock_timestamp()'),
            ]);
            $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
                'status' => 'failed',
                'attempts' => $attempt,
            ]);
        });

        return true;
    }

    public function reconcileExpiredMarkers(): int
    {
        $db = $this->getDb();
        return $db->transaction(function (ConnectionInterface $tx): int {
            $tx->statement("SET LOCAL statement_timeout = '5s'");
            $ids=$tx->table('security_smtp_attempts')->where('status','processing')
                ->where('deadline','<=',$tx->raw('clock_timestamp()'))->orderBy('id')->limit(100)
                ->lock('FOR UPDATE SKIP LOCKED')->pluck('id')->all();
            return $tx->table('security_smtp_attempts')->whereIn('id',$ids)->update([
                'status'=>'uncertain','updated_at'=>$tx->raw('clock_timestamp()'),
            ]);
        });
    }

    public function expireAndErase(int $limit = 50): int
    {
        $limit = min(max($limit, 1), 100);
        $db = $this->getDb();

        return $db->transaction(function (ConnectionInterface $tx) use ($limit): int {
            $tx->statement("SET LOCAL statement_timeout = '5s'");
            $tx->statement("SET LOCAL lock_timeout = '3s'");

            $expiredIds = $tx->table('security_dispatch_outbox')
                ->whereNotNull('encrypted_payload')
                ->where('expires_at', '<=', $tx->raw('clock_timestamp()'))
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
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);

            return count($expiredIds);
        });
    }

    private function scrubEntry(ConnectionInterface $tx, string $outboxId, string $markerId, int $attempt): void
    {
        $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
            'status' => 'scrubbed',
            'scrubbed_at' => $tx->raw('clock_timestamp()'),
            'encrypted_payload' => null,
            'attempts' => $attempt,
        ]);
        $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
            'status' => 'scrubbed',
            'updated_at' => $tx->raw('clock_timestamp()'),
        ]);
    }

    private function expireEntry(ConnectionInterface $tx, string $outboxId, string $markerId, int $attempt): void
    {
        $tx->table('security_dispatch_outbox')->where('id', $outboxId)->update([
            'status' => 'expired',
            'encrypted_payload' => null,
            'attempts' => $attempt,
        ]);
        $tx->table('security_smtp_attempts')->where('id', $markerId)->update([
            'status' => 'scrubbed',
            'updated_at' => $tx->raw('clock_timestamp()'),
        ]);
    }
}
