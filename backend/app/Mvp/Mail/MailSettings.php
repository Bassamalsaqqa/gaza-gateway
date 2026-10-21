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
        if (!$row) {
            return [
                'revision' => 0,
                'configured' => false,
                'driver' => 'capture',
                'host' => '',
                'port' => 1025,
                'tls' => 'none',
                'usernameSet' => false,
                'passwordSet' => false,
                'senderName' => '',
                'senderEmail' => '',
                'replyTo' => '',
                'notificationEmail' => 'notifications@gazaairport.com',
                'incomingCcEnabled' => false,
                'incomingCcEmail' => '',
            ];
        }
        $c = json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR);
        unset($c['username'], $c['password']);

        $ccEmail = trim((string) ($c['incomingCcEmail'] ?? ''));
        $ccValid = $ccEmail !== '' && filter_var($ccEmail, FILTER_VALIDATE_EMAIL) !== false;
        $ccEnabled = (bool) ($c['incomingCcEnabled'] ?? false) && $ccValid;

        $notifEmail = trim((string) ($c['notificationEmail'] ?? ''));
        if ($notifEmail === '' || !filter_var($notifEmail, FILTER_VALIDATE_EMAIL)) {
            $notifEmail = 'notifications@gazaairport.com';
        }

        return [
            ...$c,
            'revision' => (int) $row->revision,
            'configured' => true,
            'notificationEmail' => $notifEmail,
            'incomingCcEnabled' => $ccEnabled,
            'incomingCcEmail' => $ccEnabled ? $ccEmail : '',
        ];
    }

    public function save(#[\SensitiveParameter] array $input, string $staffId, ?callable $reauthorize = null): array
    {
        $allowed = [
            'expectedRevision', 'driver', 'host', 'port', 'tls', 'username', 'password',
            'senderName', 'senderEmail', 'replyTo',
            'notificationEmail', 'incomingCcEnabled', 'incomingCcEmail',
        ];
        if (array_diff(array_keys($input), $allowed) || !is_int($input['expectedRevision'] ?? null)
            || !in_array($input['driver'] ?? null, ['capture', 'smtp'], true)
            || !in_array($input['tls'] ?? null, ['none', 'starttls', 'tls'], true)
            || !is_int($input['port'] ?? null) || $input['port'] < 1 || $input['port'] > 65535) {
            throw new InvalidArgumentException();
        }

        foreach (['host' => 253, 'senderName' => 120, 'senderEmail' => 254, 'replyTo' => 254, 'username' => 254, 'password' => 1024, 'notificationEmail' => 254, 'incomingCcEmail' => 254] as $key => $max) {
            if (in_array($key, ['username', 'password', 'notificationEmail', 'incomingCcEmail'], true) && !array_key_exists($key, $input)) {
                continue;
            }
            if (!is_string($input[$key] ?? null) || strlen($input[$key]) > $max || preg_match('/[\x00-\x1f\x7f]/', $input[$key])) {
                throw new InvalidArgumentException();
            }
        }

        if (array_key_exists('incomingCcEnabled', $input) && !is_bool($input['incomingCcEnabled'])) {
            throw new InvalidArgumentException();
        }

        if (array_key_exists('notificationEmail', $input)) {
            if (!is_string($input['notificationEmail'])
                || trim($input['notificationEmail']) === ''
                || !filter_var(trim($input['notificationEmail']), FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException();
            }
        }

        if (array_key_exists('incomingCcEmail', $input)) {
            if (!is_string($input['incomingCcEmail'])
                || (trim($input['incomingCcEmail']) !== '' && !filter_var(trim($input['incomingCcEmail']), FILTER_VALIDATE_EMAIL))) {
                throw new InvalidArgumentException();
            }
        }

        if (($input['incomingCcEnabled'] ?? false) === true) {
            $checkEmail = trim((string) ($input['incomingCcEmail'] ?? ''));
            if ($checkEmail === '' || !filter_var($checkEmail, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException();
            }
        }

        if (!filter_var($input['senderEmail'], FILTER_VALIDATE_EMAIL) || trim($input['senderName']) === ''
            || ($input['replyTo'] !== '' && !filter_var($input['replyTo'], FILTER_VALIDATE_EMAIL))) {
            throw new InvalidArgumentException();
        }

        if ($input['driver'] === 'capture' && !app()->environment('local', 'testing')) {
            throw new InvalidArgumentException();
        }

        if ($input['driver'] === 'smtp') {
            if (!in_array($input['host'], config('mvp-mail.allowed_hosts', []), true)) {
                throw new InvalidArgumentException();
            }

            if (app()->environment('production', 'staging')) {
                // Operator host allowlist 465 implicit TLS / 587 STARTTLS only approved
                if (!in_array($input['host'], ['mail.gazaairport.com'], true)) {
                    throw new InvalidArgumentException();
                }
                if (!in_array($input['port'], [465, 587], true)) {
                    throw new InvalidArgumentException();
                }
                if ($input['port'] === 465 && $input['tls'] !== 'tls') {
                    throw new InvalidArgumentException();
                }
                if ($input['port'] === 587 && $input['tls'] !== 'starttls') {
                    throw new InvalidArgumentException();
                }
            } else {
                if ($input['tls'] === 'none' && (!app()->environment('local', 'testing') || !in_array($input['host'], ['mailpit', '127.0.0.1', 'localhost'], true) || $input['port'] !== 1025)) {
                    throw new InvalidArgumentException();
                }
            }
        }

        return DB::transaction(function () use ($input, $staffId, $reauthorize): array {
            $row = DB::table('mvp_mail_settings')->where('id', 1)->lockForUpdate()->first();
            if ($reauthorize !== null) {
                $reauthorize();
            }
            if ((int) ($row->revision ?? 0) !== $input['expectedRevision']) {
                throw new HttpException(409);
            }
            $old = $row ? json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR) : [];
            $config = $input;
            unset($config['expectedRevision']);
            $config['username'] = $input['username'] ?? $old['username'] ?? '';
            $config['password'] = $input['password'] ?? $old['password'] ?? '';
            $config['usernameSet'] = $config['username'] !== '';
            $config['passwordSet'] = $config['password'] !== '';
            if (array_key_exists('notificationEmail', $input)) {
                $config['notificationEmail'] = trim($input['notificationEmail']);
            } else {
                $oldNotif = trim((string) ($old['notificationEmail'] ?? ''));
                $config['notificationEmail'] = ($oldNotif !== '' && filter_var($oldNotif, FILTER_VALIDATE_EMAIL))
                    ? $oldNotif
                    : 'notifications@gazaairport.com';
            }

            // Effective enabled CC requires real non-empty CC including preserved old settings:
            $ccEmailCandidate = array_key_exists('incomingCcEmail', $input)
                ? trim((string) $input['incomingCcEmail'])
                : trim((string) ($old['incomingCcEmail'] ?? ''));
            $ccValid = $ccEmailCandidate !== '' && filter_var($ccEmailCandidate, FILTER_VALIDATE_EMAIL) !== false;

            $ccEnabledCandidate = array_key_exists('incomingCcEnabled', $input)
                ? (bool) $input['incomingCcEnabled']
                : (bool) ($old['incomingCcEnabled'] ?? false);

            if (array_key_exists('incomingCcEnabled', $input) && $input['incomingCcEnabled'] && !$ccValid) {
                throw new InvalidArgumentException();
            }

            $effectiveCcEnabled = $ccEnabledCandidate && $ccValid;
            $config['incomingCcEnabled'] = $effectiveCcEnabled;
            $config['incomingCcEmail'] = $effectiveCcEnabled ? $ccEmailCandidate : '';

            DB::table('mvp_mail_settings')->updateOrInsert(
                ['id' => 1],
                [
                    'revision' => $input['expectedRevision'] + 1,
                    'encrypted_config' => Crypt::encryptString(json_encode($config, JSON_THROW_ON_ERROR)),
                    'updated_by' => $staffId,
                    'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]
            );
            return $this->read();
        });
    }

    /** Worker-only credentials. Never returned by HTTP or logged. */
    public function forWorker(): ?array
    {
        $row = DB::table('mvp_mail_settings')->where('id', 1)->first();
        if (!$row) {
            return null;
        }
        $c = json_decode(Crypt::decryptString($row->encrypted_config), true, 16, JSON_THROW_ON_ERROR);

        $ccEmail = trim((string) ($c['incomingCcEmail'] ?? ''));
        $ccValid = $ccEmail !== '' && filter_var($ccEmail, FILTER_VALIDATE_EMAIL) !== false;
        $ccEnabled = (bool) ($c['incomingCcEnabled'] ?? false) && $ccValid;

        $notifEmail = trim((string) ($c['notificationEmail'] ?? ''));
        if ($notifEmail === '' || !filter_var($notifEmail, FILTER_VALIDATE_EMAIL)) {
            $notifEmail = 'notifications@gazaairport.com';
        }

        return [
            ...$c,
            'revision' => (int) $row->revision,
            'configured' => true,
            'notificationEmail' => $notifEmail,
            'incomingCcEnabled' => $ccEnabled,
            'incomingCcEmail' => $ccEnabled ? $ccEmail : '',
        ];
    }
}
