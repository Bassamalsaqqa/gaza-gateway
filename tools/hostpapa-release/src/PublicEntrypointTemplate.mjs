/**
 * Generates the safe public webroot index.php bridge.
 * This file lives in public_html/ and safely delegates /api requests
 * to the active immutable Laravel release in the private directory outside webroot.
 */
export function generatePublicEntrypoint() {
  return `<?php
/**
 * Gaza Airport / Palestinian Airlines
 * Public Webroot Bridge (HostPapa Shared cPanel)
 *
 * Safely bootstraps Laravel API from the private application directory outside webroot.
 * Static pages and compiled assets are served directly by Apache before reaching this file.
 */

declare(strict_types=1);

define('LARAVEL_START', microtime(true));

// Canonical fail-closed 503 handler
$failUnavailable = static function (string $safeMessage = 'Gaza Gateway service is initializing or temporarily unavailable.', int $status = 503, string $code = 'service_unavailable'): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');

    // Generate random UUID v4 for request correlation without external deps
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $requestId = vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));

    echo json_encode([
        'success' => false,
        'error' => [
            'code' => $code,
            'message' => $safeMessage,
        ],
        'meta' => [
            'requestId' => $requestId,
            'timestamp' => gmdate('Y-m-d\\TH:i:s\\Z'),
        ],
    ], JSON_UNESCAPED_SLASHES);
    exit;
};

// Defect 7: Actual HTTPS enforcement in bridge
$isHttps = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);

if (!$isHttps) {
    $failUnavailable('HTTPS is required.', 403, 'insecure_transport_rejected');
}

try {
    // 1. Resolve HOME directory bounds
    $home = getenv('HOSTPAPA_HOME') ?: getenv('HOME');
    if (!$home) {
        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? __DIR__;
        $home = dirname($docRoot);
    }

    $cursor = $home;
    while ($cursor !== '' && dirname($cursor) !== $cursor) { if (is_link($cursor)) throw new \RuntimeException('Invalid HOME path.'); $cursor = dirname($cursor); }
    $realHome = realpath($home);
    if (!$realHome || !is_dir($realHome) || is_link($realHome)) {
        $failUnavailable();
    }

    // 2. Resolve private application root directory
    $appDir = getenv('GAZA_GATEWAY_APP_DIR') ?: ($realHome . DIRECTORY_SEPARATOR . 'gaza-gateway');
    $cursor = $appDir;
    while ($cursor !== '' && dirname($cursor) !== $cursor) { if (is_link($cursor)) throw new \RuntimeException('Invalid application path.'); $cursor = dirname($cursor); }
    $realAppDir = realpath($appDir);
    if (!$realAppDir || !is_dir($realAppDir) || is_link($realAppDir)) {
        $failUnavailable();
    }

    // Ensure app directory is strictly inside home directory
    if ($realAppDir !== $realHome && !str_starts_with($realAppDir, $realHome . DIRECTORY_SEPARATOR)) {
        $failUnavailable();
    }

    // Defect 7: Reject symlink ancestors
    $assertNoSymlinks = static function (string $targetPath) use ($failUnavailable): void {
        $cursor = $targetPath;
        while ($cursor !== '' && dirname($cursor) !== $cursor) {
            if (is_link($cursor)) {
                $failUnavailable();
            }
            $cursor = dirname($cursor);
        }
    };
    $assertNoSymlinks($realAppDir);

    // 3. Read active release pointer
    $pointerFile = $realAppDir . DIRECTORY_SEPARATOR . 'current-release.txt';
    if (!file_exists($pointerFile) || !is_readable($pointerFile) || is_link($pointerFile)) {
        $failUnavailable();
    }

    $releaseId = trim((string) file_get_contents($pointerFile));

    // Strict alphanumeric + underscore release grammar (NO dots, NO slashes, NO dashes)
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $releaseId)) {
        $failUnavailable();
    }

    $releasePath = $realAppDir . DIRECTORY_SEPARATOR . 'releases' . DIRECTORY_SEPARATOR . $releaseId;
    $assertNoSymlinks($releasePath);
    $realReleasePath = realpath($releasePath);
    if (!$realReleasePath || !is_dir($realReleasePath) || is_link($realReleasePath)) {
        $failUnavailable();
    }

    if (!str_starts_with($realReleasePath, $realAppDir . DIRECTORY_SEPARATOR)) {
        $failUnavailable();
    }
    $assertNoSymlinks($realReleasePath);

    // 4. Resolve shared storage and shared config
    // Defect 7: HTTP has NO fallback to release .env/storage; strictly require shared config
    $sharedStorage = $realAppDir . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'storage';
    $sharedConfig = $realAppDir . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'config';
    $sharedEnv = $sharedConfig . DIRECTORY_SEPARATOR . '.env';

    if (!is_dir($sharedStorage) || is_link($sharedStorage)) {
        $failUnavailable();
    }
    if (!file_exists($sharedEnv) || is_link($sharedEnv)) {
        $failUnavailable();
    }
    $assertNoSymlinks($sharedStorage);
    $assertNoSymlinks($sharedConfig);
    if (!is_file($sharedEnv) || (fileperms($sharedEnv) & 0777) !== 0600 || filesize($sharedEnv) > 16384) throw new \RuntimeException('Private environment mode/size invalid.');

    // Defect 6: Check maintenance mode in shared storage
    $maintenanceFile = $sharedStorage . DIRECTORY_SEPARATOR . 'framework' . DIRECTORY_SEPARATOR . 'maintenance.php';
    if (file_exists($maintenanceFile)) {
        require $maintenanceFile;
        // Fallback in case maintenance.php did not exit
        $failUnavailable('Gaza Gateway is undergoing scheduled maintenance.');
        exit;
    }

    // 5. Resolve isolated backend directory
    $backendDir = is_dir($realReleasePath . DIRECTORY_SEPARATOR . 'backend')
        ? $realReleasePath . DIRECTORY_SEPARATOR . 'backend'
        : $realReleasePath;

    // Register autoloader from private release vendor
    $autoloader = $backendDir . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    if (!file_exists($autoloader)) {
        $failUnavailable();
    }
    require_once $autoloader;

    // 6. Bootstrap Laravel application
    $appBootstrap = $backendDir . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';
    if (!file_exists($appBootstrap)) {
        $failUnavailable();
    }

    /** @var \\Illuminate\\Foundation\\Application $app */
    $app = require_once $appBootstrap;

    // Rebind shared storage and shared .env (strictly bound)
    $app->useStoragePath($sharedStorage);
    $app->useEnvironmentPath($sharedConfig);
    $app->loadEnvironmentFrom('.env');

    // 7. Handle HTTP request
    $request = \\Illuminate\\Http\\Request::capture();
    $app->handleRequest($request);

} catch (\\Throwable $e) {
    // Fail-closed with canonical 503 envelope; never leak error messages or traces
    $failUnavailable();
}
`;
}
