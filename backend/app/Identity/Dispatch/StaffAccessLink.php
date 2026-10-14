<?php
declare(strict_types=1);
namespace App\Identity\Dispatch;

use App\Identity\Proofs\ProofPurpose;
use App\Identity\Tokens\OpaqueToken;

final class StaffAccessLink
{
    public static function build(ProofPurpose $purpose, #[\SensitiveParameter] string $token, string $locale = 'en'): string
    {
        OpaqueToken::validateCanonicalBearer($token);
        if (!in_array($locale, ['en', 'ar'], true)) throw new \InvalidArgumentException('Unsupported staff link locale.');
        $path = match ($purpose) {
            ProofPurpose::StaffInvitation => '/admin/accept-invitation',
            ProofPurpose::StaffPasswordReset => '/admin/reset-password',
            default => throw new \InvalidArgumentException('Unsupported staff link purpose.'),
        };
        $url = parse_url((string) config('app.url'));
        if (!is_array($url) || isset($url['user']) || isset($url['pass'])
            || isset($url['query']) || isset($url['fragment']) || !isset($url['scheme'], $url['host'])) {
            throw new \LogicException('Staff frontend origin is invalid.');
        }
        $environment = config('app.env');
        $host = strtolower($url['host']); $scheme = strtolower($url['scheme']); $port = $url['port'] ?? null;
        $approved = match ($environment) {
            'production' => $scheme === 'https' && in_array($host, ['www.gazaairport.com', 'gazaairport.com'], true) && ($port === null || $port === 443),
            'staging' => $scheme === 'https' && $host === 'staging.gazaairport.com' && ($port === null || $port === 443),
            'local', 'testing' => in_array($scheme, ['http', 'https'], true) && in_array($host, ['127.0.0.1', 'localhost'], true),
            default => false,
        };
        if (!$approved) throw new \LogicException('Staff frontend origin is not approved for this profile.');
        $origin = $scheme.'://'.$host.($port !== null && !(($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) ? ':'.$port : '');
        return $origin.($locale === 'ar' ? '/ar' : '').$path.'#token='.$token;
    }
}
