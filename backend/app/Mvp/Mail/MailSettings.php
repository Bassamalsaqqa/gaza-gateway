<?php
declare(strict_types=1);

namespace App\Mvp\Mail;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MailSettings
{
    public function read(): array
    {
        $row = DB::table('mvp_mail_settings')->where('id', 1)->first();
        if (!$row) return ['revision' => 0, 'configured' => false, 'driver' => 'capture', 'host' => '', 'port' => 1025,
            'tls' => 'none', 'usernameSet' => false, 'passwordSet' => false, 'senderName' => '', 'senderEmail' => '', 'replyTo' => ''];
        $c = json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR);
        unset($c['username'], $c['password']);
        return ['revision' => (int) $row->revision, 'configured' => true, ...$c];
    }

    public function save(#[\SensitiveParameter] array $input, string $staffId, ?callable $reauthorize = null): array
    {
        $allowed = ['expectedRevision','driver','host','port','tls','username','password','senderName','senderEmail','replyTo'];
        if (array_diff(array_keys($input), $allowed) || !is_int($input['expectedRevision'] ?? null)
            || !in_array($input['driver'] ?? null, ['capture','smtp'], true)
            || !in_array($input['tls'] ?? null, ['none','starttls','tls'], true)
            || !is_int($input['port'] ?? null) || $input['port'] < 1 || $input['port'] > 65535) throw new InvalidArgumentException();
        foreach (['host'=>253,'senderName'=>120,'senderEmail'=>254,'replyTo'=>254,'username'=>254,'password'=>1024] as $key=>$max) {
            if (in_array($key, ['username','password'], true) && !array_key_exists($key, $input)) continue;
            if (!is_string($input[$key] ?? null) || strlen($input[$key]) > $max || preg_match('/[\x00-\x1f\x7f]/', $input[$key])) throw new InvalidArgumentException();
        }
        if (!filter_var($input['senderEmail'], FILTER_VALIDATE_EMAIL) || trim($input['senderName']) === ''
            || ($input['replyTo'] !== '' && !filter_var($input['replyTo'], FILTER_VALIDATE_EMAIL))) throw new InvalidArgumentException();
        if ($input['driver'] === 'capture' && !app()->environment('local','testing')) throw new InvalidArgumentException();
        if ($input['driver'] === 'smtp' && (!in_array($input['host'], config('mvp-mail.allowed_hosts', []), true)
            || ($input['tls'] === 'none' && (!app()->environment('local','testing') || $input['host'] !== 'mailpit' || $input['port'] !== 1025)))) throw new InvalidArgumentException();
        return DB::transaction(function () use ($input, $staffId, $reauthorize): array {
            DB::select("SELECT pg_advisory_xact_lock(hashtext('mvp_mail_settings'))");
            $row = DB::table('mvp_mail_settings')->where('id', 1)->lockForUpdate()->first();
            if ($reauthorize !== null) $reauthorize();
            if ((int) ($row->revision ?? 0) !== $input['expectedRevision']) throw new HttpException(409);
            $old = $row ? json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR) : [];
            $config = $input; unset($config['expectedRevision']);
            $config['username'] = $input['username'] ?? $old['username'] ?? '';
            $config['password'] = $input['password'] ?? $old['password'] ?? '';
            $config['usernameSet'] = $config['username'] !== ''; $config['passwordSet'] = $config['password'] !== '';
            DB::table('mvp_mail_settings')->updateOrInsert(['id'=>1], ['revision'=>$input['expectedRevision']+1,
                'encrypted_config'=>Crypt::encryptString(json_encode($config, JSON_THROW_ON_ERROR)), 'updated_by'=>$staffId,
                'updated_at'=>DB::raw('clock_timestamp()')]);
            return $this->read();
        });
    }

    /** Worker-only credentials. Never returned by HTTP or logged. */
    public function forWorker(): ?array
    {
        $row = DB::table('mvp_mail_settings')->where('id', 1)->first();
        return $row ? ['revision'=>(int) $row->revision, ...json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR)] : null;
    }
}
