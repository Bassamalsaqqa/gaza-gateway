<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$consoleKernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$consoleKernel->bootstrap();

$kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);

use App\Identity\RateLimiting\AnonymousBootstrapAdmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Pre-flight database guards
if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
    fwrite(STDERR, "Error: Must run in testing environment.\n");
    exit(2);
}

if (config('database.default') !== 'pgsql_test') {
    fwrite(STDERR, "Error: Must use pgsql_test connection.\n");
    exit(3);
}

$currentDb = DB::selectOne('SELECT current_database() AS db')->db ?? '';
if ($currentDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "Error: Must run strictly against gaza_gateway_test.\n");
    exit(4);
}

// Clean tables before captures
DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->delete();
DB::table('passenger_sessions')->where('auth_level', 'anonymous')->delete();
DB::table('staff_sessions')->where('auth_level', 'anonymous')->delete();

$outDir = __DIR__ . '/../storage/app/private/bootstrap-test-captures';
if (is_link($outDir)) {
    fwrite(STDERR, "Capture directory cannot be a symlink.\n");
    exit(5);
}
if (!is_dir($outDir)) {
    if (!mkdir($outDir, 0700, true)) {
        fwrite(STDERR, "Cannot create private test capture directory.\n");
        exit(5);
    }
}
if (!chmod($outDir, 0700)) {
    fwrite(STDERR, "Cannot restrict test capture directory.\n");
    exit(5);
}

function handleAndRecord(
    \Illuminate\Contracts\Http\Kernel $kernel,
    Request $request,
    string $outputFilename,
    string $outDir
): array {
    $response = $kernel->handle($request);
    $status = $response->getStatusCode();
    $headers = [];
    foreach ($response->headers->all() as $name => $values) {
        $headers[$name] = implode(', ', $values);
    }
    $rawBody = $response->getContent();
    $parsedBody = json_decode($rawBody, true);

    $capture = [
        'status' => $status,
        'headers' => $headers,
        'rawBody' => $rawBody,
        'parsedBody' => $parsedBody,
    ];

    $target = $outDir . '/' . $outputFilename;
    if (is_link($target)) {
        throw new \RuntimeException('Capture target cannot be a symlink.');
    }
    $encoded = json_encode($capture, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    $oldMask = umask(0077);
    try {
        if (file_put_contents($target, $encoded, LOCK_EX) !== strlen($encoded) || !chmod($target, 0600)) {
            throw new \RuntimeException('Cannot write private test capture.');
        }
    } finally {
        umask($oldMask);
    }
    $kernel->terminate($request, $response);
    return $capture;
}

echo "Capturing real runtime HTTP responses from Laravel kernel...\n";
try {

// 1. 200 OK - Passenger CSRF Bootstrap
$req1 = Request::create('https://127.0.0.1:18090/api/v1/auth/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.95',
    'HTTP_ORIGIN' => 'http://localhost:5173',
]);
$c1 = handleAndRecord($kernel, $req1, 'passenger_csrf_200.json', $outDir);
echo "  [Captured] passenger_csrf_200.json -> status {$c1['status']}\n";

// 2. 200 OK - Staff CSRF Bootstrap
$req2 = Request::create('https://127.0.0.1:18090/api/v1/staff/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.95',
    'HTTP_ORIGIN' => 'http://localhost:5173',
]);
$c2 = handleAndRecord($kernel, $req2, 'staff_csrf_200.json', $outDir);
echo "  [Captured] staff_csrf_200.json -> status {$c2['status']}\n";

// 3. 400 Bad Request - Duplicate cookie
$req3 = Request::create('https://127.0.0.1:18090/api/v1/auth/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.95',
    'HTTP_COOKIE' => 'gza_session=tok1; gza_session=tok2',
]);
$c3 = handleAndRecord($kernel, $req3, 'passenger_csrf_400_duplicate_cookie.json', $outDir);
echo "  [Captured] passenger_csrf_400_duplicate_cookie.json -> status {$c3['status']}\n";

// 4. 403 Forbidden - Disallowed Origin
$req4 = Request::create('https://127.0.0.1:18090/api/v1/staff/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.95',
    'HTTP_ORIGIN' => 'https://unauthorized-evil.invalid',
]);
$c4 = handleAndRecord($kernel, $req4, 'staff_csrf_403_disallowed_origin.json', $outDir);
echo "  [Captured] staff_csrf_403_disallowed_origin.json -> status {$c4['status']}\n";

// 5. 429 Too Many Requests - IP rate limit exhaustion
$admission = $app->make(AnonymousBootstrapAdmission::class);
$admission->setTestLimits(ipLimit: 1);
$req5a = Request::create('https://127.0.0.1:18090/api/v1/auth/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.96',
]);
$kernel->handle($req5a); // Consumes the 1 allowed slot

$req5 = Request::create('https://127.0.0.1:18090/api/v1/auth/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.96',
]);
$c5 = handleAndRecord($kernel, $req5, 'passenger_csrf_429_rate_limited.json', $outDir);
$admission->resetTestLimits();
echo "  [Captured] passenger_csrf_429_rate_limited.json -> status {$c5['status']}\n";

// 6. 503 Service Unavailable - Injected fault/driver failure
$admission->setTestFaultHook('after_counter_increment');
$req6 = Request::create('https://127.0.0.1:18090/api/v1/auth/csrf', 'GET', server: [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'REMOTE_ADDR' => '198.51.100.97',
]);
$c6 = handleAndRecord($kernel, $req6, 'passenger_csrf_503_service_unavailable.json', $outDir);
$admission->resetTestLimits();
echo "  [Captured] passenger_csrf_503_service_unavailable.json -> status {$c6['status']}\n";
} catch (\Throwable) {
    fwrite(STDERR, "Test HTTP capture failed; no token or driver details are printed.\n");
    exit(1);
} finally {
    $app->make(AnonymousBootstrapAdmission::class)->resetTestLimits();

// Clean tables after captures
DB::table('security_rate_limits')->where('operation_id', 'bootstrap')->delete();
DB::table('passenger_sessions')->where('auth_level', 'anonymous')->delete();
DB::table('staff_sessions')->where('auth_level', 'anonymous')->delete();
}

echo "All 6 HTTP captures generated successfully in {$outDir}.\n";
exit(0);
