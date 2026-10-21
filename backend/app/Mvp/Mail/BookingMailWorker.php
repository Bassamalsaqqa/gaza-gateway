<?php

declare(strict_types=1);

namespace App\Mvp\Mail;

use App\SharedHosting\SharedHostingTimeoutException;
use App\Deployment\SmtpDeadline;
use App\Deployment\SmtpDeadlineException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

final class BookingMailWorker
{
    public const MAX_CAPTURE_BYTES = 16 * 1024 * 1024; // 16 MiB (16,777,216 bytes)

    public function __construct(private readonly MailSettings $settings) {}

    public function adoptIntents(?string $reservationId = null): void
    {
        // Only committed reservation intents are visible. The unique FK makes repeated polling safe.
        $intents = DB::table('mvp_reservation_mail_intents as i')
            ->leftJoin('mvp_mail_messages as m', 'm.intent_id', '=', 'i.id')
            ->whereNull('m.id')
            ->when($reservationId !== null, fn($q) => $q->where('i.reservation_id', $reservationId))
            ->select('i.*')
            ->orderBy('i.created_at')
            ->limit(100)
            ->get();

        foreach ($intents as $intent) {
            DB::table('mvp_mail_messages')->insertOrIgnore([
                'id' => (string) Str::uuid(),
                'intent_id' => $intent->id,
                'reservation_id' => $intent->reservation_id,
                'purpose' => 'booking',
                'encrypted_payload' => Crypt::encryptString(json_encode([
                    'purpose' => 'booking',
                    'recipient' => $intent->recipient_email,
                    'ticket' => json_decode($intent->payload, true, 32, JSON_THROW_ON_ERROR),
                ], JSON_THROW_ON_ERROR)),
                'next_attempt_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
                'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);
        }
    }

    public function queueTest(string $recipient): array
    {
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || strlen($recipient) > 254) {
            abort(422);
        }
        $id = (string) Str::uuid();
        DB::table('mvp_mail_messages')->insert([
            'id' => $id,
            'purpose' => 'test',
            'encrypted_payload' => Crypt::encryptString(json_encode([
                'purpose' => 'test',
                'recipient' => $recipient,
            ], JSON_THROW_ON_ERROR)),
            'next_attempt_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        return ['id' => $id, 'status' => 'pending'];
    }

    public function runOne(): bool
    {
        $isLocalOrTesting = app()->environment('local', 'testing');
        $isSharedHosting = app()->environment('production', 'staging')
            && config('foundation-services.shared_hosting_enabled') === true;

        if (!$isLocalOrTesting && !$isSharedHosting) {
            throw new \LogicException('Mail dispatch is only permitted in authorized environments.');
        }

        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Booking mail dispatch cannot run inside an active transaction.');
        }
        if (config('mvp-mail.enabled') !== true) {
            return false;
        }

        $this->adoptIntents();
        $config = $this->settings->forWorker();
        if (!$config) {
            return false;
        }

        if ($config['driver'] === 'capture' && !app()->environment('local', 'testing')) {
            throw new \LogicException('Local capture is unavailable.');
        }

        if ($config['driver'] === 'smtp') {
            if (!in_array($config['host'], config('mvp-mail.allowed_hosts', []), true)) {
                throw new \LogicException('SMTP host is not authorized.');
            }
            if (app()->environment('production', 'staging')) {
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
            }
            SmtpDeadline::assertHardDeadlineCapability('BookingMailWorker');
        }

        $claim = DB::transaction(function () use ($config): ?array {
            // Lost leases are ambiguous, never automatically replayed to a provider.
            $expired = DB::table('mvp_mail_messages')
                ->where('status', 'processing')
                ->where('lease_until', '<', DB::raw('UTC_TIMESTAMP(6)'))
                ->lockForUpdate()
                ->get();

            foreach ($expired as $row) {
                DB::table('mvp_mail_attempts')
                    ->where('id', $row->lease_id)
                    ->update([
                        'outcome' => 'uncertain',
                        'finished_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
                DB::table('mvp_mail_messages')
                    ->where('id', $row->id)
                    ->update([
                        'status' => 'uncertain',
                        'lease_id' => null,
                        'lease_until' => null,
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
            }

            $row = DB::table('mvp_mail_messages')
                ->whereIn('status', ['pending', 'failed'])
                ->where('attempts', '<', 5)
                ->where('next_attempt_at', '<=', DB::raw('UTC_TIMESTAMP(6)'))
                ->orderBy('created_at')
                ->lock('FOR UPDATE SKIP LOCKED')
                ->first();

            if (!$row) {
                return null;
            }

            if ($row->reservation_id && DB::table('mvp_reservations')->where('id', $row->reservation_id)->value('status') !== 'confirmed') {
                DB::table('mvp_mail_messages')->where('id', $row->id)->update(['status' => 'cancelled']);
                return [];
            }

            $lease = (string) Str::uuid();
            $attempt = (int) $row->attempts + 1;

            DB::table('mvp_mail_messages')->where('id', $row->id)->update([
                'status' => 'processing',
                'attempts' => $attempt,
                'lease_id' => $lease,
                'lease_until' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 120 SECOND)"),
                'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            DB::table('mvp_mail_attempts')->insert([
                'id' => $lease,
                'message_id' => $row->id,
                'generation' => $row->generation,
                'attempt' => $attempt,
                'settings_revision' => $config['revision'],
                'outcome' => 'processing',
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            return ['row' => $row, 'lease' => $lease, 'attempt' => $attempt];
        });

        if ($claim === null) {
            return false;
        }
        if ($claim === []) {
            return true;
        }

        $row = $claim['row'];
        $outcome = 'failed';
        $transport = null;
        $deadlineExpired = false;
        $outerTimeoutException = null;

        try {
            $payload = json_decode(Crypt::decryptString($row->encrypted_payload), true, 32, JSON_THROW_ON_ERROR);
            $message = TicketEmail::build($payload, $config, $claim['lease'], $row->created_at);

            if ($config['driver'] === 'capture') {
                $this->capture($claim['lease'], $message->toString());
                $outcome = 'captured_locally';
            } else {
                $transport = new EsmtpTransport($config['host'], $config['port'], $config['tls'] === 'tls');
                $transport->setAutoTls($config['tls'] === 'starttls')->setRequireTls($config['tls'] !== 'none');
                SmtpDeadline::configureTransportStream($transport, 3);
                if ($config['username'] !== '') {
                    $transport->setUsername($config['username'])->setPassword($config['password']);
                }

                SmtpDeadline::runWithDeadline(function () use ($transport, $message, &$outcome) {
                    $transport->start();
                    // Once DATA may have been transmitted, failure is ambiguous.
                    $outcome = 'uncertain';
                    $transport->send($message);
                    $outcome = 'accepted';
                }, 8);
            }
        } catch (SharedHostingTimeoutException $e) {
            $deadlineExpired = true;
            $outcome = 'uncertain';
            $outerTimeoutException = $e;
        } catch (SmtpDeadlineException) {
            $deadlineExpired = true;
        } catch (\Throwable) {
            // Never persist exception text, SMTP conversation, message body or credentials.
        } finally {
            if ($transport !== null) {
                SmtpDeadline::abortTransport($transport);
            }
        }

        DB::transaction(function () use ($claim, $row, $outcome): void {
            $current = DB::table('mvp_mail_messages')->where('id', $row->id)->lockForUpdate()->first();
            if ($current?->lease_id !== $claim['lease'] || $current->status !== 'processing') {
                return;
            }

            DB::table('mvp_mail_attempts')->where('id', $claim['lease'])->update([
                'outcome' => $outcome,
                'finished_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            DB::table('mvp_mail_messages')->where('id', $row->id)->update([
                'status' => $outcome,
                'lease_id' => null,
                'lease_until' => null,
                'accepted_at' => in_array($outcome, ['accepted', 'captured_locally'], true) ? DB::raw('UTC_TIMESTAMP(6)') : null,
                'next_attempt_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 60 SECOND)"),
                'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);
        });

        if ($outerTimeoutException !== null) {
            throw $outerTimeoutException;
        }

        return true;
    }

    private function capture(string $id, string $bytes): void
    {
        if (strlen($bytes) > self::MAX_CAPTURE_BYTES) {
            throw new \RuntimeException('Message exceeds capture bound.');
        }
        $root = config('mvp-mail.capture_path');
        if (!is_string($root) || is_link($root)) {
            throw new \RuntimeException('Invalid private capture path.');
        }
        if (!is_dir($root) && !mkdir($root, 0700, true)) {
            throw new \RuntimeException('Private capture unavailable.');
        }
        if (!chmod($root, 0700)) {
            throw new \RuntimeException('Private capture permissions unavailable.');
        }
        $file = $root . '/' . $id . '.eml';
        $handle = fopen($file, 'x');
        if (!$handle) {
            throw new \RuntimeException('Private capture unavailable.');
        }
        try {
            if (!chmod($file, 0600) || fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle)) {
                throw new \RuntimeException('Private capture failed.');
            }
        } catch (\Throwable $e) {
            fclose($handle);
            unlink($file);
            throw $e;
        }
        fclose($handle);
    }

    public function purgeCaptures(): int
    {
        $root = config('mvp-mail.capture_path');
        $removed = 0;
        if (!is_string($root) || !is_dir($root) || is_link($root)) {
            return 0;
        }
        $cutoff = time() - 86400;
        foreach (glob($root . '/*.eml') ?: [] as $file) {
            if (is_link($file) || !preg_match('/\A[0-9a-f-]{36}\.eml\z/', basename($file))) {
                continue;
            }
            if (filemtime($file) < $cutoff && unlink($file)) {
                $removed++;
            }
        }
        return $removed;
    }
}
