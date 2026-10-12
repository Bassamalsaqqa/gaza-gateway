<?php
declare(strict_types=1);

namespace App\Mvp\Mail;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

final class BookingMailWorker
{
    public function __construct(private readonly MailSettings $settings) {}

    public function adoptIntents(?string $reservationId = null): void
    {
        // Only committed reservation intents are visible. The unique FK makes repeated polling safe.
        $intents = DB::table('mvp_reservation_mail_intents as i')->leftJoin('mvp_mail_messages as m', 'm.intent_id', '=', 'i.id')
            ->whereNull('m.id')->when($reservationId !== null, fn($q) => $q->where('i.reservation_id', $reservationId))->select('i.*')->orderBy('i.created_at')->limit(100)->get();
        foreach ($intents as $intent) {
            DB::table('mvp_mail_messages')->insertOrIgnore(['id'=>(string) Str::uuid(), 'intent_id'=>$intent->id, 'reservation_id'=>$intent->reservation_id,
                'purpose'=>'booking', 'encrypted_payload'=>Crypt::encryptString(json_encode(['purpose'=>'booking', 'recipient'=>$intent->recipient_email,
                    'ticket'=>json_decode($intent->payload, true, 32, JSON_THROW_ON_ERROR)], JSON_THROW_ON_ERROR))]);
        }
    }

    public function queueTest(string $recipient): array
    {
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || strlen($recipient) > 254) abort(422);
        $id = (string) Str::uuid();
        DB::table('mvp_mail_messages')->insert(['id'=>$id, 'purpose'=>'test', 'encrypted_payload'=>Crypt::encryptString(json_encode([
            'purpose'=>'test','recipient'=>$recipient], JSON_THROW_ON_ERROR))]);
        return ['id'=>$id,'status'=>'pending'];
    }

    public function runOne(): bool
    {
        if (config('mvp-mail.enabled') !== true || DB::transactionLevel() !== 0) throw new \LogicException('Mail dispatch requires an enabled committed worker context.');
        $this->adoptIntents();
        $config = $this->settings->forWorker();
        if (!$config) return false;
        if ($config['driver'] === 'capture' && !app()->environment('local','testing')) throw new \LogicException('Local capture is unavailable.');
        if ($config['driver'] === 'smtp' && !in_array($config['host'], config('mvp-mail.allowed_hosts', []), true)) throw new \LogicException('SMTP host is not authorized.');

        $claim = DB::transaction(function () use ($config): ?array {
            // Lost leases are ambiguous, never automatically replayed to a provider.
            $expired = DB::table('mvp_mail_messages')->where('status','processing')->where('lease_until','<',DB::raw('clock_timestamp()'))->lockForUpdate()->get();
            foreach ($expired as $row) {
                DB::table('mvp_mail_attempts')->where('id',$row->lease_id)->update(['outcome'=>'uncertain','finished_at'=>DB::raw('clock_timestamp()')]);
                DB::table('mvp_mail_messages')->where('id',$row->id)->update(['status'=>'uncertain','lease_id'=>null,'lease_until'=>null,'updated_at'=>DB::raw('clock_timestamp()')]);
            }
            $row = DB::table('mvp_mail_messages')->whereIn('status',['pending','failed'])->where('attempts','<',5)
                ->where('next_attempt_at','<=',DB::raw('clock_timestamp()'))->orderBy('created_at')->lock('FOR UPDATE SKIP LOCKED')->first();
            if (!$row) return null;
            if ($row->reservation_id && DB::table('mvp_reservations')->where('id',$row->reservation_id)->value('status') !== 'confirmed') {
                DB::table('mvp_mail_messages')->where('id',$row->id)->update(['status'=>'cancelled']); return [];
            }
            $lease = (string) Str::uuid(); $attempt = (int) $row->attempts+1;
            DB::table('mvp_mail_messages')->where('id',$row->id)->update(['status'=>'processing','attempts'=>$attempt,
                'lease_id'=>$lease,'lease_until'=>DB::raw("clock_timestamp() + interval '120 seconds'"),'updated_at'=>DB::raw('clock_timestamp()')]);
            DB::table('mvp_mail_attempts')->insert(['id'=>$lease,'message_id'=>$row->id,'generation'=>$row->generation,
                'attempt'=>$attempt,'settings_revision'=>$config['revision'],'outcome'=>'processing']);
            return ['row'=>$row,'lease'=>$lease,'attempt'=>$attempt];
        });
        if ($claim === null) return false;
        if ($claim === []) return true;
        $row = $claim['row']; $outcome = 'failed';
        try {
            $payload = json_decode(Crypt::decryptString($row->encrypted_payload), true, 32, JSON_THROW_ON_ERROR);
            $message = TicketEmail::build($payload, $config, $claim['lease'], $row->created_at);
            if ($config['driver'] === 'capture') {
                $this->capture($claim['lease'], $message->toString()); $outcome = 'captured_locally';
            } else {
                $transport = new EsmtpTransport($config['host'], $config['port'], $config['tls'] === 'tls');
                $transport->setAutoTls($config['tls'] === 'starttls')->setRequireTls($config['tls'] !== 'none');
                $transport->getStream()->setTimeout(10);
                $transport->setUsername($config['username'])->setPassword($config['password']);
                try { $transport->start(); }
                catch (\Throwable) { $transport = null; }
                if ($transport !== null) {
                    // Once DATA may have been transmitted, failure is ambiguous. Do not retry blindly.
                    $outcome = 'uncertain';
                    try { $transport->send($message); $outcome = 'accepted'; } catch (\Throwable) {}
                    try { $transport->stop(); } catch (\Throwable) {}
                }
            }
        } catch (\Throwable) {
            // Never persist exception text, SMTP conversation, message body or credentials.
        }
        DB::transaction(function () use ($claim, $row, $outcome): void {
            $current = DB::table('mvp_mail_messages')->where('id',$row->id)->lockForUpdate()->first();
            if ($current?->lease_id !== $claim['lease'] || $current->status !== 'processing') return;
            DB::table('mvp_mail_attempts')->where('id',$claim['lease'])->update(['outcome'=>$outcome,'finished_at'=>DB::raw('clock_timestamp()')]);
            DB::table('mvp_mail_messages')->where('id',$row->id)->update(['status'=>$outcome,'lease_id'=>null,'lease_until'=>null,
                'accepted_at'=>in_array($outcome,['accepted','captured_locally'],true) ? DB::raw('clock_timestamp()') : null,
                'next_attempt_at'=>DB::raw("clock_timestamp() + interval '60 seconds'"),'updated_at'=>DB::raw('clock_timestamp()')]);
        });
        return true;
    }

    private function capture(string $id, string $bytes): void
    {
        if (strlen($bytes) > 131072) throw new \RuntimeException('Message exceeds capture bound.');
        $root = config('mvp-mail.capture_path');
        if (!is_string($root) || is_link($root)) throw new \RuntimeException('Invalid private capture path.');
        if (!is_dir($root) && !mkdir($root,0700,true)) throw new \RuntimeException('Private capture unavailable.');
        if (!chmod($root,0700)) throw new \RuntimeException('Private capture permissions unavailable.');
        $file = $root.'/'.$id.'.eml';
        $handle = fopen($file,'x');
        if (!$handle) throw new \RuntimeException('Private capture unavailable.');
        try {
            if (!chmod($file,0600) || fwrite($handle,$bytes) !== strlen($bytes) || !fflush($handle)) throw new \RuntimeException('Private capture failed.');
        } catch (\Throwable $e) { fclose($handle); unlink($file); throw $e; }
        fclose($handle);
    }

    public function purgeCaptures(): int
    {
        $root = config('mvp-mail.capture_path'); $removed = 0;
        if (!is_string($root) || !is_dir($root) || is_link($root)) return 0;
        $cutoff = time() - 86400;
        foreach (glob($root.'/*.eml') ?: [] as $file) {
            if (is_link($file) || !preg_match('/\A[0-9a-f-]{36}\.eml\z/', basename($file))) continue;
            if (filemtime($file) < $cutoff && unlink($file)) $removed++;
        }
        return $removed;
    }
}
