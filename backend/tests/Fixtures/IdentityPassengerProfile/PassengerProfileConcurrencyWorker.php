<?php

declare(strict_types=1);

/**
 * Isolated CLI Concurrency Worker for Phase 13B Passenger Profile package.
 *
 * Receives JSON-encoded commands on STDIN, executes them over a dedicated PDO connection,
 * and writes JSON-encoded status responses to STDOUT.
 *
 * Strict safety boundaries:
 * - Requires process getenv('APP_ENV') === 'testing'
 * - Requires process getenv('DB_CONNECTION') === 'pgsql_test'
 * - Requires configured getenv('DB_TEST_DATABASE') === 'gaza_gateway_test'
 * - Requires live PostgreSQL connection current_database() === 'gaza_gateway_test'
 * - Requires default connection 'pgsql_test' and driver 'pgsql'
 * - Statement and lock timeouts configured on session
 * - Emits only known allowlisted status codes (OK, LOCKED, ERROR) and SQLSTATE codes
 */

// Step 1: Pre-bootstrap environment guards
$env = getenv('APP_ENV');
$dbConn = getenv('DB_CONNECTION');
$database = getenv('DB_TEST_DATABASE');

if ($env !== 'testing' || $dbConn !== 'pgsql_test' || $database !== 'gaza_gateway_test') {
    fwrite(STDERR, "ERR_WORKER_PREBOOT_GUARD_FAILED\n");
    exit(1);
}

// Step 2: Bootstrap & connection assertions wrapped with safe error handling
try {
    require_once dirname(__DIR__, 3) . '/vendor/autoload.php';
    $app = require_once dirname(__DIR__, 3) . '/bootstrap/app.php';
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    $app->register(\App\Providers\PassengerProfileServiceProvider::class);

    if (!$app->environment('testing') || config('app.env') !== 'testing') {
        fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_GUARD_FAILED\n");
        exit(2);
    }

    $defaultConn = \Illuminate\Support\Facades\DB::getDefaultConnection();
    if ($defaultConn !== 'pgsql_test' || config('database.default') !== 'pgsql_test') {
        fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_GUARD_FAILED\n");
        exit(2);
    }

    $conn = \Illuminate\Support\Facades\DB::connection('pgsql_test');
    if ($conn->getName() !== 'pgsql_test' || $conn->getDriverName() !== 'pgsql') {
        fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_GUARD_FAILED\n");
        exit(2);
    }

    $liveDb = (string) ($conn->selectOne('SELECT current_database() AS db')?->db ?? '');
    if ($liveDb !== 'gaza_gateway_test') {
        fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_GUARD_FAILED\n");
        exit(3);
    }

    // Bounded timeouts to prevent hangs
    $conn->statement("SET statement_timeout = '8000ms'");
    $conn->statement("SET lock_timeout = '5000ms'");

    $backendPid = (int) ($conn->selectOne('SELECT pg_backend_pid() AS pid')?->pid ?? 0);
    if ($backendPid <= 0) {
        fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_GUARD_FAILED\n");
        exit(3);
    }
} catch (\Throwable) {
    fwrite(STDERR, "ERR_WORKER_BOOTSTRAP_FAILED\n");
    exit(1);
}

use Carbon\CarbonImmutable;

// Announce readiness and backend PID
echo json_encode(['status' => 'READY', 'pid' => $backendPid], JSON_THROW_ON_ERROR) . "\n";
flush();

function sanitizeWorkerError(\Throwable $e): array
{
    $rawCode = (string) $e->getCode();
    $sqlstate = preg_match('/^[0-9A-Za-z]{5}$/', $rawCode) ? $rawCode : 'ERROR';
    $message = $e->getMessage();

    $allowlistedTags = [
        'chk_passenger_profiles_seat_pref',
        'chk_passenger_profiles_meal_pref',
        'chk_saved_travelers_dob',
        'fk_saved_travelers_owner',
        'fk_passenger_profiles_user',
        'fk_passenger_sessions_user',
        'fk_audit_events_passenger',
        'statement_timeout',
        'lock_timeout',
        'canceling statement due to statement timeout',
        'canceling statement due to lock timeout',
    ];

    $tag = 'ERR_EXECUTION_FAILED';
    foreach ($allowlistedTags as $candidate) {
        if (str_contains($message, $candidate)) {
            $tag = $candidate;
            break;
        }
    }

    return [
        'status' => 'ERROR',
        'sqlstate' => $sqlstate,
        'tag' => $tag,
    ];
}

$retainedContext = null;

while ($line = fgets(STDIN, 65538)) {
    if (strlen($line) > 65536 || !str_ends_with($line, "\n")) {
        fwrite(STDERR, "ERR_WORKER_INPUT_LIMIT_EXCEEDED\n");
        exit(4);
    }

    $line = trim($line);
    if ($line === '') {
        continue;
    }

    $cmd = json_decode($line, true);
    if (!is_array($cmd) || !isset($cmd['action'])) {
        echo json_encode(['status' => 'ERROR', 'error' => 'invalid_command'], JSON_THROW_ON_ERROR) . "\n";
        flush();
        continue;
    }

    $action = $cmd['action'];

    if ($action === 'quit') {
        echo json_encode(['status' => 'BYE'], JSON_THROW_ON_ERROR) . "\n";
        flush();
        break;
    }

    try {
        if ($action === 'begin') {
            $conn->beginTransaction();
            echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'commit') {
            $conn->commit();
            echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'rollback') {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'lock_principal') {
            $userId = (string) ($cmd['userId'] ?? '');
            $row = $conn->table('users')->where('id', $userId)->lockForUpdate()->first();
            echo json_encode(['status' => $row !== null ? 'LOCKED' : 'NOT_FOUND'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'lock_session') {
            $sessionId = (string) ($cmd['sessionId'] ?? '');
            $row = $conn->table('passenger_sessions')->where('id', $sessionId)->lockForUpdate()->first();
            echo json_encode(['status' => $row !== null ? 'LOCKED' : 'NOT_FOUND'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'lock_profile') {
            $userId = (string) ($cmd['userId'] ?? '');
            $row = $conn->table('passenger_profiles')->where('user_id', $userId)->lockForUpdate()->first();
            echo json_encode(['status' => $row !== null ? 'LOCKED' : 'NOT_FOUND'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'lock_traveler') {
            $travelerId = (string) ($cmd['travelerId'] ?? '');
            $row = $conn->table('saved_travelers')->where('id', $travelerId)->lockForUpdate()->first();
            echo json_encode(['status' => $row !== null ? 'LOCKED' : 'NOT_FOUND'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'advance_epoch') {
            $userId = (string) ($cmd['userId'] ?? '');
            $newEpoch = (int) ($cmd['epoch'] ?? 2);
            $conn->table('users')->where('id', $userId)->update(['credential_epoch' => $newEpoch]);
            echo json_encode(['status' => 'OK', 'epoch' => $newEpoch], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'revoke_session') {
            $sessionId = (string) ($cmd['sessionId'] ?? '');
            $now = CarbonImmutable::now()->toIso8601String();
            $conn->table('passenger_sessions')->where('id', $sessionId)->update(['revoked_at' => $now]);
            echo json_encode(['status' => 'OK', 'revoked' => true], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'update_profile_first_name') {
            $userId = (string) ($cmd['userId'] ?? '');
            $name = (string) ($cmd['firstName'] ?? '');
            $conn->table('passenger_profiles')->where('user_id', $userId)->update(['first_name' => $name]);
            echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'set_app_key') {
            $key = (string) ($cmd['appKey'] ?? '');
            if ($key !== '') {
                config(['app.key' => $key]);
                $app->forgetInstance(\Illuminate\Contracts\Encryption\Encrypter::class);
            }
            echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
        } elseif ($action === 'prepare_session') {
            if (!empty($cmd['appKey'])) {
                config(['app.key' => (string) $cmd['appKey']]);
                $app->forgetInstance(\Illuminate\Contracts\Encryption\Encrypter::class);
            }
            $rawToken = (string) ($cmd['token'] ?? '');
            if ($rawToken === '' && isset($cmd['cookie'])) {
                $cookieStr = (string) $cmd['cookie'];
                if (str_contains($cookieStr, '=')) {
                    $parts = explode('=', $cookieStr, 2);
                    $rawToken = trim($parts[1]);
                } else {
                    $rawToken = trim($cookieStr);
                }
            }
            /** @var \App\Identity\Sessions\PassengerSessionStore $sessionStore */
            $sessionStore = $app->make(\App\Identity\Sessions\PassengerSessionStore::class);
            $context = $sessionStore->read($rawToken);
            if ($context === null || !$context->isFull()) {
                echo json_encode(['status' => 'ERROR', 'error' => 'session_not_found'], JSON_THROW_ON_ERROR) . "\n";
            } else {
                $retainedContext = $context;
                echo json_encode(['status' => 'OK', 'sessionId' => $context->sessionId], JSON_THROW_ON_ERROR) . "\n";
            }
        } elseif ($action === 'execute_coordinator_profile_read') {
            if ($retainedContext === null) {
                echo json_encode(['status' => 'ERROR', 'error' => 'no_retained_context'], JSON_THROW_ON_ERROR) . "\n";
            } elseif ($conn->transactionLevel() > 0) {
                echo json_encode(['status' => 'ERROR', 'error' => 'caller_transaction_not_permitted'], JSON_THROW_ON_ERROR) . "\n";
            } else {
                $req = \Illuminate\Http\Request::create('/api/v1/auth/passenger/profile', 'GET');
                $req->attributes->set('identity_session_context', $retainedContext);
                /** @var \App\Identity\Passenger\Profile\PassengerProfileCoordinator $coordinator */
                $coordinator = $app->make(\App\Identity\Passenger\Profile\PassengerProfileCoordinator::class);
                try {
                    $resData = $coordinator->getProfile($req);
                    echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
                } catch (\App\Identity\Passenger\Profile\Exceptions\UnauthorizedPassengerException $e) {
                    echo json_encode(['status' => 'DENIED', 'code' => $e->getErrorCode()], JSON_THROW_ON_ERROR) . "\n";
                }
            }
        } elseif ($action === 'execute_coordinator_profile_update') {
            if ($retainedContext === null) {
                echo json_encode(['status' => 'ERROR', 'error' => 'no_retained_context'], JSON_THROW_ON_ERROR) . "\n";
            } elseif ($conn->transactionLevel() > 0) {
                echo json_encode(['status' => 'ERROR', 'error' => 'caller_transaction_not_permitted'], JSON_THROW_ON_ERROR) . "\n";
            } else {
                $payload = (array) ($cmd['payload'] ?? []);
                $json = json_encode($payload, JSON_THROW_ON_ERROR);
                $req = \Illuminate\Http\Request::create('/api/v1/auth/passenger/profile', 'PUT', [], [], [], [
                    'CONTENT_TYPE' => 'application/json',
                    'HTTP_ACCEPT' => 'application/json',
                    'HTTP_X_CSRF_TOKEN' => $retainedContext->getCsrfToken(),
                    'HTTP_ORIGIN' => 'http://localhost:3000',
                ], $json);
                $req->attributes->set('identity_session_context', $retainedContext);
                /** @var \App\Identity\Passenger\Profile\PassengerProfileCoordinator $coordinator */
                $coordinator = $app->make(\App\Identity\Passenger\Profile\PassengerProfileCoordinator::class);
                try {
                    $resData = $coordinator->updateProfile($req);
                    echo json_encode(['status' => 'OK'], JSON_THROW_ON_ERROR) . "\n";
                } catch (\App\Identity\Passenger\Profile\Exceptions\UnauthorizedPassengerException $e) {
                    echo json_encode(['status' => 'DENIED', 'code' => $e->getErrorCode()], JSON_THROW_ON_ERROR) . "\n";
                }
            }
        } else {
            echo json_encode(['status' => 'ERROR', 'error' => 'unknown_action'], JSON_THROW_ON_ERROR) . "\n";
        }
    } catch (\Throwable $e) {
        echo json_encode(sanitizeWorkerError($e), JSON_THROW_ON_ERROR) . "\n";
    }
    flush();
}
