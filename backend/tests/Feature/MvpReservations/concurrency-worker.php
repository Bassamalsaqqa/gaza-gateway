<?php

declare(strict_types=1);

require __DIR__.'/../../../vendor/autoload.php';
if (getenv('REFERENCE_GATE_OWNED') !== '1' || getenv('APP_ENV') !== 'testing') { exit(2); }
$app = require __DIR__.'/../../../bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
$input = json_decode(fgets(STDIN, 65537), true, 32, JSON_THROW_ON_ERROR);
echo "READY\n"; flush();
if (trim(fgets(STDIN, 16)) !== 'GO') { exit(2); }
$session = $input['session'];
$cookieName = $input['cookie_name'] ?? 'gza_session';
$server = [
    'HTTPS' => 'on',
    'SERVER_PORT' => 443,
    'HTTP_HOST' => '127.0.0.1:18090',
    'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
    'HTTP_COOKIE' => $cookieName.'='.$session['cookie'],
    'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
    'CONTENT_TYPE' => 'application/json',
    'HTTP_ACCEPT' => 'application/json',
    'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::8',
];
$request = \Illuminate\Http\Request::create(
    'https://127.0.0.1:18090/api/v1'.$input['path'],
    $input['method'],
    [], [], [],
    $server,
    json_encode($input['body'], JSON_THROW_ON_ERROR)
);
$response = $kernel->handle($request);
echo $response->getStatusCode()."\n"; flush();
$kernel->terminate($request, $response);
