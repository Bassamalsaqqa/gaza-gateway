<?php

declare(strict_types=1);

namespace App\Mvp\Archive;

use App\Deployment\SmtpDeadline;
use App\Deployment\SmtpDeadlineException;
use App\Mvp\Mail\MailSettings;
use App\SharedHosting\SharedHostingTimeoutException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class ArchiveMailWorker
{
    public function __construct(
        private readonly MailSettings $settings,
        private ?ArchiveDocumentRendererContract $documentRenderer = null
    ) {}

    private function getDocumentRenderer(): ?ArchiveDocumentRendererContract
    {
        if ($this->documentRenderer === null && function_exists('app') && app()->bound(ArchiveDocumentRendererContract::class)) {
            $this->documentRenderer = app(ArchiveDocumentRendererContract::class);
        }
        return $this->documentRenderer;
    }

    /**
     * Bounded execution of archive and contact outbox messages.
     *
     * @param int $batchLimit Maximum messages to process in this run
     * @param callable(): float|null $getRemaining Monotonic seconds remaining in execution budget
     * @return int Number of messages processed
     */
    public function runBatch(int $batchLimit = 10, ?callable $getRemaining = null): int
    {
        if (!Schema::hasTable('archive_mail_outbox')) {
            return 0;
        }

        $isLocalOrTesting = app()->environment('local', 'testing');
        $isSharedHosting = app()->environment('production', 'staging')
            && config('foundation-services.shared_hosting_enabled') === true;

        if (!$isLocalOrTesting && !$isSharedHosting) {
            throw new \LogicException('Mail dispatch is only permitted in authorized environments.');
        }

        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Archive mail dispatch cannot run inside an active transaction.');
        }

        if (config('mvp-mail.enabled') !== true) {
            return 0;
        }

        $config = $this->settings->forWorker();
        if (!$config || empty($config['configured'])) {
            return 0;
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
            SmtpDeadline::assertHardDeadlineCapability('ArchiveMailWorker');
        }

        $processed = 0;
        while ($processed < $batchLimit) {
            if ($getRemaining !== null && $getRemaining() < \App\SharedHosting\SharedHostingCronRunner::DOCUMENT_MESSAGE_BUDGET_SECONDS) {
                break;
            }

            $didOne = $this->processOne($config);
            if (!$didOne) {
                break;
            }
            $processed++;
        }

        return $processed;
    }

    public function processOne(array $config): bool
    {
        // 1. Expire stale processing leases under locked transaction.
        // Stale leases are ambiguous: move to 'uncertain' and never automatically replay.
        $claim = DB::transaction(function () use ($config): ?array {
            $expired = DB::table('archive_mail_outbox')
                ->where('status', 'processing')
                ->where('lease_until', '<', DB::raw('UTC_TIMESTAMP(6)'))
                ->limit(25)
                ->lockForUpdate()
                ->get();

            foreach ($expired as $stale) {
                DB::table('archive_mail_outbox')
                    ->where('id', $stale->id)
                    ->where('status', 'processing')
                    ->where('lease_id', $stale->lease_id)
                    ->update([
                        'status' => 'uncertain',
                        'lease_id' => null,
                        'lease_until' => null,
                        'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
            }

            // 2. Claim next due item (excluding 'uncertain', 'accepted', 'captured_locally', 'cancelled')
            $row = DB::table('archive_mail_outbox')
                ->whereIn('status', ['pending', 'failed'])
                ->where('attempts', '<', 5)
                ->where('next_attempt_at', '<=', DB::raw('UTC_TIMESTAMP(6)'))
                ->orderBy('created_at')
                ->lock('FOR UPDATE SKIP LOCKED')
                ->first();

            if (!$row) {
                return null;
            }

            $lease = (string) Str::uuid();
            $attempt = (int) $row->attempts + 1;

            DB::table('archive_mail_outbox')
                ->where('id', $row->id)
                ->where('status', $row->status)
                ->update([
                    'status' => 'processing',
                    'attempts' => $attempt,
                    'lease_id' => $lease,
                    'lease_until' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 120 SECOND)"),
                    'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);

            return ['row' => $row, 'lease' => $lease, 'attempt' => $attempt];
        });

        if ($claim === null) {
            return false;
        }

        $row = $claim['row'];
        $outcome = 'failed';
        $transport = null;
        $outerTimeoutException = null;

        try {
            $payload = json_decode(Crypt::decryptString($row->encrypted_payload), true, 32, JSON_THROW_ON_ERROR);
            $message = $this->buildMessage($row, $payload, $config, $claim['lease']);

            if ($config['driver'] === 'capture') {
                $this->capture($claim['lease'], $message->toString());
                $outcome = 'captured_locally';
            } else {
                $transport = new EsmtpTransport($config['host'], (int) $config['port'], $config['tls'] === 'tls');
                $transport->setAutoTls($config['tls'] === 'starttls')->setRequireTls($config['tls'] !== 'none');
                SmtpDeadline::configureTransportStream($transport, 3);
                if (!empty($config['username'])) {
                    $transport->setUsername($config['username'])->setPassword($config['password'] ?? '');
                }

                SmtpDeadline::runWithDeadline(function () use ($transport, $message, &$outcome) {
                    $transport->start();
                    // Once DATA transmission begins, potential network or server failure is ambiguous.
                    $outcome = 'uncertain';
                    $transport->send($message);
                    $outcome = 'accepted';
                }, 8);
            }
        } catch (SharedHostingTimeoutException $e) {
            $outcome = 'uncertain';
            $outerTimeoutException = $e;
        } catch (SmtpDeadlineException) {
            // If already marked uncertain (during/after send), retain uncertain
        } catch (\Throwable) {
            // Never persist exception text, SMTP conversation, message body or credentials.
        } finally {
            if ($transport !== null) {
                SmtpDeadline::abortTransport($transport);
            }
        }

        // Conditional lease update preventing stale worker from overriding newly claimed or expired lease
        DB::transaction(function () use ($claim, $row, $outcome): void {
            $current = DB::table('archive_mail_outbox')->where('id', $row->id)->lockForUpdate()->first();
            if ($current?->lease_id !== $claim['lease'] || $current->status !== 'processing') {
                return;
            }

            DB::table('archive_mail_outbox')
                ->where('id', $row->id)
                ->where('lease_id', $claim['lease'])
                ->where('status', 'processing')
                ->update([
                    'status' => $outcome,
                    'lease_id' => null,
                    'lease_until' => null,
                    'accepted_at' => in_array($outcome, ['accepted', 'captured_locally'], true) ? DB::raw('UTC_TIMESTAMP(6)') : null,
                    'next_attempt_at' => $outcome === 'failed' ? DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 60 SECOND)") : $row->next_attempt_at,
                    'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
        });

        if ($outerTimeoutException !== null) {
            throw $outerTimeoutException;
        }

        return true;
    }

    public function buildMessage(object $row, array $payload, array $config, string $leaseId): Email
    {
        $senderName = !empty($config['senderName']) ? $config['senderName'] : 'Gaza International Airport';
        $email = (new Email())
            ->from(new Address($config['senderEmail'], $senderName))
            ->to($row->recipient);

        if (!empty($config['replyTo'])) {
            $email->replyTo($config['replyTo']);
        }

        // Apply CC strictly to incoming notification emails (archive_notify or contact_notify), NEVER to contributor ack or transactional mail
        if (!empty($row->cc_recipient) && in_array($row->purpose, ['archive_notify', 'contact_notify'], true)) {
            $email->addCc($row->cc_recipient);
        }

        $purpose = (string) $row->purpose;
        $locale = (string) ($payload['locale'] ?? 'en');
        $isArabic = $locale === 'ar';

        if ($purpose === 'archive_ack') {
            $ref = (string) ($payload['reference'] ?? 'GZA-ARC');
            $name = (string) ($payload['contributorName'] ?? 'Contributor');
            $type = (string) ($payload['contributionType'] ?? 'historical materials');
            $displayName = ($isArabic && !empty($payload['contributorNameArabic']))
                ? (string) $payload['contributorNameArabic']
                : $name;

            if ($isArabic) {
                $email->subject("أرشيف مطار غزة — إشعار استلام مساهمة [{$ref}]");
                $email->text(
                    "عزيزي {$displayName}،\n\n" .
                    "شكراً لمساهمتك في الأرشيف الرقمي لمطار غزة الدولي (مطار ياسر عرفات الدولي).\n\n" .
                    "الرمز المرجعي العام للأرشيف: {$ref}\n" .
                    "تصنيف المساهمة: {$type}\n\n" .
                    "تم استلام المواد وإدراجها ضمن المراجعة التوثيقية الخاصة. هذا الرمز يحدد مساهمتك ولا يتضمن أي بيانات اتصال شخصية.\n\n" .
                    "ملاحظة تذكارية: هذا إشعار توثيقي تذكاري وليس حجز طيران أو وثيقة سفر.\n\n" .
                    "— الخطوط الجوية الفلسطينية وأرشيف مطار غزة الدولي الرقمي"
                );
            } else {
                $email->subject("Gaza Airport Archive — Contribution Acknowledgment [{$ref}]");
                $email->text(
                    "Dear {$name},\n\n" .
                    "Thank you for contributing to the digital archive of Gaza International Airport (Yasser Arafat International Airport).\n\n" .
                    "Public Archive Reference: {$ref}\n" .
                    "Contribution Category: {$type}\n\n" .
                    "Your materials have been received into private curatorial review. This reference identifies your contribution and contains no personal contact information.\n\n" .
                    "Commemorative Note: This is an archival preservation acknowledgment, not an airline booking or travel credential.\n\n" .
                    "— Palestine Airways Limited & Gaza International Airport Digital Archive"
                );
            }

            // Injected ArchiveDocumentRendererContract
            $renderer = $this->getDocumentRenderer();
            if ($renderer !== null) {
                $renderedPng = $renderer->renderArchiveThankYou([
                    'contributorName' => $name,
                    'contributorNameArabic' => $payload['contributorNameArabic'] ?? null,
                    'archiveId' => $ref,
                    'reference' => $ref,
                    'locale' => $locale,
                ]);

                if (is_string($renderedPng) && strlen($renderedPng) > 0) {
                    $email->attach($renderedPng, "gaza-archive-thank-you-{$ref}.png", 'image/png');
                }
            }
        } elseif ($purpose === 'archive_notify') {
            $ref = (string) ($payload['reference'] ?? 'GZA-ARC');
            $name = (string) ($payload['contributorName'] ?? 'Contributor');
            $type = (string) ($payload['contributionType'] ?? 'item');
            $filesCount = (int) ($payload['filesCount'] ?? 0);

            $email->subject("[Archive Contribution] New submission [{$ref}] from {$name}");
            $email->text(
                "New archive contribution received on Gaza Airport portal.\n\n" .
                "Reference: {$ref}\n" .
                "Contributor: {$name}\n" .
                "Email: " . ($payload['email'] ?? '—') . "\n" .
                "Type: {$type}\n" .
                "Attached Files: {$filesCount}\n\n" .
                "Description:\n" . ($payload['description'] ?? '—') . "\n\n" .
                "Access the staff admin portal to review materials and private attachments."
            );
        } elseif ($purpose === 'contact_notify') {
            $name = (string) ($payload['senderName'] ?? 'Visitor');
            $topic = (string) ($payload['topic'] ?? 'General');

            $email->subject("[Contact Message] New enquiry from {$name} [{$topic}]");
            $email->text(
                "New contact message received on Gaza Airport portal.\n\n" .
                "Sender: {$name}\n" .
                "Email: " . ($payload['email'] ?? '—') . "\n" .
                "Topic: {$topic}\n" .
                "Language: " . ($payload['language'] ?? 'en') . "\n" .
                "Booking Reference: " . ($payload['bookingRef'] ?? 'None') . "\n\n" .
                "Message:\n" . ($payload['message'] ?? '—') . "\n"
            );
        }

        return $email;
    }

    private function capture(string $id, string $bytes): void
    {
        if (strlen($bytes) > 5242880) { // 5MB bound to safely accommodate thank-you tag PNG attachment
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
            @unlink($file);
            throw $e;
        }
        fclose($handle);
    }

    public function purgeCaptures(int $maxAgeSeconds = 86400): int
    {
        $root = config('mvp-mail.capture_path');
        $removed = 0;
        if (!is_string($root) || !is_dir($root) || is_link($root)) {
            return 0;
        }
        $cutoff = time() - $maxAgeSeconds;
        foreach (glob($root . '/*.eml') ?: [] as $file) {
            if (is_link($file) || !preg_match('/\A[0-9a-f-]{36}\.eml\z/', basename($file))) {
                continue;
            }
            if (filemtime($file) < $cutoff && @unlink($file)) {
                $removed++;
            }
        }
        return $removed;
    }
}
