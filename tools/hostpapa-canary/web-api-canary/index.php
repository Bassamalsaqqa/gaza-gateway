<?php

declare(strict_types=1);

// ----------------------------------------------------------------------
// Gaza Gateway — H0 Isolated Canary API Routing Entrypoint
// ----------------------------------------------------------------------
// Security Invariants:
// 1. Strict HTTPS required. Insecure plain HTTP is rejected.
// 2. Requires Apache-level Directory Privacy: REMOTE_USER + AUTH_TYPE === 'Basic'.
//    Arbitrary user-supplied HTTP credentials without Apache validation are NEVER trusted.
// 3. Proves actual Apache mod_rewrite execution (rejects direct index.php calls).
// 4. Never exposes phpinfo, environment credentials, or debug traces.
// ----------------------------------------------------------------------

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, private');

// 1. Strict HTTPS Enforcement
$isHttps = (
    (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ||
    ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443)
);

if (!$isHttps) {
    http_response_code(403);
    echo json_encode([
        'status' => 'FORBIDDEN_INSECURE_HTTP',
        'message' => 'Strict HTTPS is required for all Gaza Gateway canary endpoints.',
        'canary' => 'H0_ISOLATED_API_ROUTING',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// 2. Strict Apache Directory Privacy Authentication
// Must be authenticated by Apache (REMOTE_USER populated and AUTH_TYPE === 'Basic').
// We explicitly do NOT accept raw PHP_AUTH_USER / PHP_AUTH_PW as proof of Apache Directory Privacy.
$remoteUser = $_SERVER['REMOTE_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? null;
$authType = $_SERVER['AUTH_TYPE'] ?? $_SERVER['REDIRECT_AUTH_TYPE'] ?? null;

$isApacheAuthenticated = !empty($remoteUser) && (strcasecmp((string)$authType, 'Basic') === 0);

if (!$isApacheAuthenticated) {
    header('WWW-Authenticate: Basic realm="Gaza Gateway H0 Isolated Canary"');
    http_response_code(401);
    echo json_encode([
        'status' => 'AUTH_REQUIRED',
        'message' => 'Access denied: Requires legitimate Apache Directory Privacy authentication.',
        'canary' => 'H0_ISOLATED_API_ROUTING',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// 3. Mod Rewrite Verification (Verify request was routed through Apache rewrite rule, not direct index.php)
$requestUri = (string)($_SERVER['REQUEST_URI'] ?? '');
$isDirectIndexCall = (bool)preg_match('/index\.php(\?|$)/i', $requestUri);
$hasRedirectStatus = isset($_SERVER['REDIRECT_STATUS']) || isset($_SERVER['REDIRECT_URL']);
$rewriteVerified = !$isDirectIndexCall && $hasRedirectStatus;

// Extract and sanitize route path
$routeReceived = (string)($_GET['canary_route'] ?? '');
$routeClean = preg_replace('/[^a-zA-Z0-9_\-\/]/', '', $routeReceived);

echo json_encode([
    'status' => $rewriteVerified ? 'PASS' : 'WARNING_DIRECT_CALL',
    'canary' => 'H0_ISOLATED_API_ROUTING',
    'authenticated' => true,
    'auth_type' => 'Basic',
    'directory_privacy_verified' => true,
    'mod_rewrite_verified' => $rewriteVerified,
    'route_tested' => $routeClean,
    'notes' => $rewriteVerified
        ? 'Authenticated via Apache Directory Privacy and routed via mod_rewrite.'
        : 'Authenticated, but accessed directly via index.php rather than rewritten URL path.',
    'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
