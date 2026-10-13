<?php

declare(strict_types=1);

require dirname(__DIR__, 3) . '/vendor/autoload.php';
$app = require dirname(__DIR__, 3) . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if ($app->environment() !== 'testing' || config('database.default') !== 'mysql_test'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'gaza_gateway_mysql_test') exit(2);
try {
    $payload = json_decode(fgets(STDIN, 2048), true, 8, JSON_THROW_ON_ERROR);
    app(App\Identity\Passenger\PassengerAuthCoordinator::class)->emailVerify($payload, '198.18.20.3', (string) Illuminate\Support\Str::uuid());
    echo "accepted\n";
} catch (App\Identity\Passenger\Exceptions\ProofConsumptionFailedException) {
    echo "denied\n";
} catch (Throwable) {
    echo "error\n";
    exit(1);
}
