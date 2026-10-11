<?php

declare(strict_types=1);

use App\Identity\Booking\{BookingAccessCoordinator, BookingAccessException};
use App\Identity\Sessions\PassengerSessionStore;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 3) . '/vendor/autoload.php';
$app = require dirname(__DIR__, 3) . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap(); $db = DB::connection();
if (getenv('APP_ENV') !== 'testing' || !$app->environment('testing') || config('database.default') !== 'pgsql_test'
    || $db->getName() !== 'pgsql_test' || $db->getDriverName() !== 'pgsql' || $db->getDatabaseName() !== 'gaza_gateway_test'
    || $db->selectOne('SELECT current_database() AS db')->db !== 'gaza_gateway_test') { exit(2); }
$line = fgets(STDIN, 16385);
if ($line === false || strlen($line) > 16384) { exit(2); }
$input = json_decode($line, true, 16, JSON_THROW_ON_ERROR);
if (!is_array($input) || array_keys($input) !== ['operation', 'input', 'ref', 'cookie', 'csrf', 'requestId', 'pepper', 'ip']
    || !in_array($input['operation'], ['postVerifyGuestChallenge', 'postClaimBookingToAccount'], true)) { exit(2); }
config(['identity-guest.pepper_base64' => $input['pepper'], 'identity-guest.pepper_version' => 1]);
$context = $app->make(PassengerSessionStore::class)->read($input['cookie']);
if ($context === null) { exit(2); }
fwrite(STDOUT, "READY\n"); fflush(STDOUT);
if (fgets(STDIN, 8) !== "GO\n") { exit(2); }
try {
    $app->make(BookingAccessCoordinator::class)->execute($input['operation'], $input['input'], $input['ref'],
        $context, $input['cookie'], $input['csrf'], $input['ip'], $input['requestId']);
    fwrite(STDOUT, "ACCEPTED\n");
} catch (BookingAccessException) { fwrite(STDOUT, "DENIED\n"); }
catch (Throwable) { fwrite(STDOUT, "FAILED\n"); exit(1); }
