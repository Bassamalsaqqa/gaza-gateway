<?php

declare(strict_types=1);

use App\Identity\Sessions\StaffSessionStore;
use App\Identity\Staff\{StaffLifecycleCoordinator, StaffAuthenticationException};
use App\Identity\Staff\StaffDirectoryCoordinator;
use App\Identity\Staff\StaffAuthCoordinator;
use App\Identity\Directory\Exceptions\LastAdminConflictException;
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
if (!is_array($input) || array_keys($input) !== ['operation', 'input', 'cookie', 'csrf', 'requestId']
    || !in_array($input['operation'], ['postStaffInvitationAccept', 'postStaffPasswordReset', 'patchStaffUser', 'postStaffMfaSetupConfirm', 'getStaffMe'], true)) { exit(2); }
$context = $app->make(StaffSessionStore::class)->read($input['cookie']);
if ($context === null) { exit(2); }
fwrite(STDOUT, "READY\n"); fflush(STDOUT);
if (fgets(STDIN, 8) !== "GO\n") { exit(2); }
try {
    if ($input['operation'] === 'patchStaffUser') {
        if (array_keys($input['input']) !== ['targetId', 'patch']) { exit(2); }
        $app->make(StaffDirectoryCoordinator::class)->execute('patchStaffUser', $input['input']['patch'],
            $input['input']['targetId'], $context, $input['cookie'], $input['csrf'], '192.0.2.185', $input['requestId']);
    } elseif ($input['operation'] === 'getStaffMe') {
        $app->make(StaffAuthCoordinator::class)->full('getStaffMe', [], $context,
            $input['cookie'], null, null, '192.0.2.185', $input['requestId']);
    } elseif ($input['operation'] === 'postStaffMfaSetupConfirm') {
        $app->make(StaffDirectoryCoordinator::class)->execute($input['operation'], $input['input'], null, $context,
            $input['cookie'], $input['csrf'], '192.0.2.185', $input['requestId']);
    } else {
        $app->make(StaffLifecycleCoordinator::class)->execute($input['operation'], $input['input'], $context,
            $input['cookie'], $input['csrf'], null, '192.0.2.185', $input['requestId']);
    }
    fwrite(STDOUT, "ACCEPTED\n");
} catch (StaffAuthenticationException) { fwrite(STDOUT, "DENIED\n"); }
catch (LastAdminConflictException) { fwrite(STDOUT, "CONFLICT\n"); }
catch (Throwable) { fwrite(STDOUT, "FAILED\n"); exit(1); }
