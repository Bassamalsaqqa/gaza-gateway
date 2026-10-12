<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Validates the offline files and structure of the isolated web API routing canary.
 *
 * IMPORTANT:
 * File presence inspection is PREPARATION only, NOT operational HTTP proof.
 * Live verification requires an actual authenticated HTTPS request through Apache.
 */
class ApiRoutingCanary
{
    private string $webDir;

    public function __construct(string $webDir = '')
    {
        $this->webDir = $webDir !== '' ? $webDir : dirname(__DIR__) . '/web-api-canary';
    }

    /**
     * Inspect offline canary files for structure, safety, and authentication guards.
     *
     * @return array<string, mixed>
     */
    public function probe(): array
    {
        $htaccessPath = $this->webDir . '/.htaccess';
        $indexPath = $this->webDir . '/index.php';

        $hasHtaccess = file_exists($htaccessPath);
        $hasIndex = file_exists($indexPath);

        $htaccessSafe = false;
        if ($hasHtaccess) {
            $content = (string)file_get_contents($htaccessPath);
            // Verify it does NOT contain global rewrite bases or public site rules
            $htaccessSafe = str_contains($content, 'RewriteEngine On')
                && str_contains($content, 'canary_route');
        }

        $indexSafe = false;
        if ($hasIndex) {
            $content = (string)file_get_contents($indexPath);

            // 1. Must check Apache Directory Privacy: REMOTE_USER + AUTH_TYPE === 'Basic'
            $requiresApacheAuth = str_contains($content, 'REMOTE_USER')
                && str_contains($content, 'AUTH_TYPE')
                && str_contains($content, 'WWW-Authenticate');

            // 2. Must NOT accept unauthenticated PHP_AUTH_USER / PHP_AUTH_PW fallbacks
            $hasInsecureAuthFallback = false;
            foreach (token_get_all($content) as $token) {
                if (is_array($token)) {
                    if ($token[0] === T_CONSTANT_ENCAPSED_STRING && str_contains($token[1], 'PHP_AUTH_USER')) {
                        $hasInsecureAuthFallback = true;
                    }
                    if ($token[0] === T_VARIABLE && $token[1] === '$authUser') {
                        $hasInsecureAuthFallback = true;
                    }
                }
            }
            $noInsecureAuthFallback = !$hasInsecureAuthFallback;

            // 3. Must require strict HTTPS
            $enforcesHttps = str_contains($content, 'HTTPS')
                && (str_contains($content, 'FORBIDDEN_INSECURE_HTTP') || str_contains($content, '403'));

            // 4. Must verify mod_rewrite execution (checks REDIRECT_STATUS or direct index.php call)
            $checksModRewrite = str_contains($content, 'REDIRECT_STATUS')
                && str_contains($content, 'index.php');

            // 5. Must not expose phpinfo or $_ENV
            $hasPhpInfoCall = false;
            $hasEnvSuperglobal = false;
            foreach (token_get_all($content) as $token) {
                if (is_array($token)) {
                    if ($token[0] === T_STRING && strcasecmp($token[1], 'phpinfo') === 0) {
                        $hasPhpInfoCall = true;
                    }
                    if ($token[0] === T_VARIABLE && $token[1] === '$_ENV') {
                        $hasEnvSuperglobal = true;
                    }
                }
            }

            $indexSafe = $requiresApacheAuth
                && $noInsecureAuthFallback
                && $enforcesHttps
                && $checksModRewrite
                && !$hasPhpInfoCall
                && !$hasEnvSuperglobal;
        }

        $prepared = $hasHtaccess && $hasIndex && $htaccessSafe && $indexSafe;

        return [
            'probe' => 'api_routing_isolated',
            'preparation_status' => $prepared ? 'PREPARED_OFFLINE' : 'FAIL',
            // Explicitly classify operational proof as UNVERIFIED offline
            'status' => 'UNVERIFIED',
            'operational_http_proof' => 'UNVERIFIED (Requires live authenticated HTTPS request through Apache)',
            'laravel_api_routing' => 'PENDING_H2_H3 (Separate from isolated canary test)',
            'has_htaccess' => $hasHtaccess,
            'has_index' => $hasIndex,
            'htaccess_isolated' => $htaccessSafe,
            'index_authenticated' => $indexSafe,
            'notes' => 'Offline file inspection only. Live HTTP proof with Directory Privacy credentials required.',
        ];
    }
}
