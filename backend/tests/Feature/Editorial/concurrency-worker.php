<?php
declare(strict_types=1);

require __DIR__.'/../../../vendor/autoload.php';
if ((getenv('EDITORIAL_GATE_OWNED') !== '1' && getenv('REFERENCE_GATE_OWNED') !== '1') || getenv('APP_ENV') !== 'testing') { exit(2); }
$app = require __DIR__.'/../../../bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();

$rawInput = '';
while (($line = fgets(STDIN)) !== false) {
    $rawInput .= $line;
    if (str_ends_with($line, "\n")) { break; }
}
$input = json_decode($rawInput, true, 512, JSON_THROW_ON_ERROR);

if (($input['action'] ?? null) === 'lock') {
    $slug = str_replace('editorial_doc:', '', (string) ($input['key'] ?? ''));
    \Illuminate\Support\Facades\DB::beginTransaction();
    \Illuminate\Support\Facades\DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();
    echo "LOCKED\n";
    if (function_exists('ob_flush')) { @ob_flush(); }
    flush();
    $cmd = trim((string) fgets(STDIN, 16));
    if ($cmd === 'UNLOCK') {
        \Illuminate\Support\Facades\DB::rollBack();
        echo "UNLOCKED\n";
        if (function_exists('ob_flush')) { @ob_flush(); }
        flush();
    }
    exit(0);
}

echo "READY\n";
if (function_exists('ob_flush')) { @ob_flush(); }
flush();
if (trim(fgets(STDIN, 16)) !== 'GO') { exit(2); }
$session = $input['session'];
$request = \Illuminate\Http\Request::create(
    'https://127.0.0.1:18090/api/v1'.$input['path'],
    $input['method'],
    [],
    [],
    [],
    [
        'HTTPS' => 'on',
        'SERVER_PORT' => 443,
        'HTTP_HOST' => '127.0.0.1:18090',
        'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
        'HTTP_COOKIE' => isset($session['cookie']) ? 'gza_staff_session='.$session['cookie'] : '',
        'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::8',
    ],
    json_encode($input['body'], JSON_THROW_ON_ERROR)
);
$response = $kernel->handle($request);
echo $response->getStatusCode()."\n"; flush();
$kernel->terminate($request, $response);
