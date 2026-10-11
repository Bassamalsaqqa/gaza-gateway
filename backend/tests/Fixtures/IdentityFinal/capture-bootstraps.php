<?php

declare(strict_types=1);

require dirname(__DIR__, 3) . '/vendor/autoload.php';
$app = require dirname(__DIR__, 3) . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();
if (getenv('APP_ENV') !== 'testing' || !$app->environment('testing')
    || getenv('IDENTITY_MIGRATION_DISPOSABLE_INSTANCE') !== '1'
    || \Illuminate\Support\Facades\DB::connection()->getName() !== 'pgsql_test'
    || \Illuminate\Support\Facades\DB::selectOne('SELECT current_database() AS name')->name !== 'gaza_gateway_test') {
    throw new \RuntimeException('Bootstrap capture requires the owned disposable gate.');
}
\Tests\Fixtures\IdentityFinal\HttpCaptureRecorder::install($app);
foreach (['auth', 'staff'] as $realm) {
    $request = \Illuminate\Http\Request::create('https://127.0.0.1:18090/api/v1/' . $realm . '/csrf', 'GET', [], [], [], [
        'HTTPS' => 'on', 'HTTP_HOST' => '127.0.0.1:18090', 'HTTP_ACCEPT' => 'application/json', 'REMOTE_ADDR' => '192.0.2.249',
    ]);
    $response = $kernel->handle($request);
    if ($response->getStatusCode() !== 200) { throw new \RuntimeException('Live bootstrap capture failed.'); }
    $kernel->terminate($request, $response);
}
echo "PASS two genuine kernel bootstrap responses; authority remains private.\n";
