<?php

declare(strict_types=1);

namespace App\Deployment;

use InvalidArgumentException;

/** Private owner input only; never an HTTP request or a persisted plaintext setting. */
final class OwnerBootstrapConfiguration
{
    public static function validate(
        #[\SensitiveParameter] array $input,
        string $releaseSha,
        string $database,
    ): array {
        self::keys($input, ['purpose', 'releaseSha', 'database', 'admin', 'smtp']);
        if ($input['purpose'] !== 'first_staff_invitation'
            || preg_match('/\A[0-9a-f]{40}\z/', $releaseSha) !== 1
            || $input['releaseSha'] !== $releaseSha || $input['database'] !== $database
            || $database === '' || !is_array($input['admin']) || !is_array($input['smtp'])) {
            self::refuse();
        }
        $admin = $input['admin'];
        self::keys($admin, ['username', 'email', 'fullNameEn', 'fullNameAr']);
        foreach ($admin as $value) {
            if (!is_string($value) || trim($value) !== $value || $value === ''
                || preg_match('/[\x00-\x1f\x7f]/', $value)) {
                self::refuse();
            }
        }
        if (mb_strlen($admin['username']) < 3 || mb_strlen($admin['username']) > 64
            || mb_strlen($admin['fullNameEn']) > 128 || mb_strlen($admin['fullNameAr']) > 128
            || strlen($admin['email']) > 255 || !filter_var($admin['email'], FILTER_VALIDATE_EMAIL)
            || strtolower($admin['email']) !== $admin['email']
            || str_ends_with($admin['email'], '.invalid')) {
            self::refuse();
        }
        $smtp = $input['smtp'];
        self::keys($smtp, ['host', 'port', 'tls', 'username', 'password', 'senderName', 'senderEmail', 'replyTo']);
        // This initial installer is bound to the owner's verified HostPapa mailbox.
        if ($smtp['host'] !== 'mail.gazaairport.com' || $smtp['port'] !== 465 || $smtp['tls'] !== 'tls'
            || $smtp['username'] !== 'notifications@gazaairport.com'
            || $smtp['senderEmail'] !== 'notifications@gazaairport.com') {
            self::refuse();
        }
        foreach (['password' => 1024, 'senderName' => 120, 'replyTo' => 254] as $key => $max) {
            if (!is_string($smtp[$key]) || strlen($smtp[$key]) > $max
                || preg_match('/[\x00-\x1f\x7f]/', $smtp[$key])) {
                self::refuse();
            }
        }
        if ($smtp['password'] === '' || trim($smtp['senderName']) === ''
            || ($smtp['replyTo'] !== '' && !filter_var($smtp['replyTo'], FILTER_VALIDATE_EMAIL))) {
            self::refuse();
        }
        return $input;
    }

    private static function keys(#[\SensitiveParameter] array $input, array $expected): void
    {
        if (array_diff(array_keys($input), $expected) || array_diff($expected, array_keys($input))) {
            self::refuse();
        }
    }

    private static function refuse(): never
    {
        throw new InvalidArgumentException('Owner bootstrap configuration refused.');
    }
}
