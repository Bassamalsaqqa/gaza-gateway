<?php

declare(strict_types=1);

/**
 * Isolated CLI Concurrency Worker for Phase 13B Passenger Authentication
 * multi-process concurrency, lock contention, and race verification.
 *
 * Strict safety boundaries:
 * - Requires APP_ENV === 'testing'
 * - Requires DB_TEST_DATABASE === 'gaza_gateway_test'
 * - Requires live PostgreSQL connection current_database() === 'gaza_gateway_test'
 * - Emits structured JSON responses on STDOUT
 * - Closes cleanly on command or pipe close
 */

$env = getenv('APP_ENV');
if ($env !== 'testing') {
    fwrite(STDERR, "Configuration error: worker requires APP_ENV=testing\n");
    exit(1);
}

$database = getenv('DB_TEST_DATABASE');
if ($database !== 'gaza_gateway_test') {
    fwrite(STDERR, "Configuration error: worker requires DB_TEST_DATABASE=gaza_gateway_test\n");
    exit(1);
}

if (getenv('DB_CONNECTION') !== 'pgsql_test') {
    fwrite(STDERR, "Worker default connection rejected.\n");
    exit(2);
}
try {
require_once __DIR__ . '/../../../vendor/autoload.php';
$app = require_once __DIR__ . '/../../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
} catch (\Throwable) {
    fwrite(STDERR, "Worker bootstrap rejected.\n");
    exit(2);
}

use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\Sessions\PassengerSessionContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

if (!$app->environment('testing') || config('database.default') !== 'pgsql_test') {
    fwrite(STDERR, "Worker application profile rejected.\n"); exit(3);
}
$conn = DB::connection();
if ($conn->getName() !== 'pgsql_test' || $conn->getDriverName() !== 'pgsql') {
    fwrite(STDERR, "Worker live connection rejected.\n"); exit(3);
}
$liveDb = (string) $conn->selectOne('SELECT current_database() AS db')->db;
if ($liveDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "Database error: live connection is not gaza_gateway_test\n");
    exit(3);
}

$backendPid = (int) $conn->selectOne('SELECT pg_backend_pid() AS pid')->pid;
$pdo = $conn->getPdo();

// Announce readiness and backend PID
echo json_encode(['status' => 'READY', 'pid' => $backendPid]) . "\n";
flush();

while ($line = fgets(STDIN, 65538)) {
    if (strlen($line) > 65536 || !str_ends_with($line, "\n")) {
        fwrite(STDERR, "Worker protocol input limit exceeded\n");
        exit(4);
    }
    $line = trim($line);
    if ($line === '') {
        continue;
    }

    $cmd = json_decode($line, true);
    if (!is_array($cmd) || !isset($cmd['action'])) {
        echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_command']) . "\n";
        flush();
        continue;
    }

    $action = (string) $cmd['action'];

    if ($action === 'quit') {
        if ($conn->transactionLevel() > 0) {
            $conn->rollBack();
        }
        echo json_encode(['status' => 'BYE']) . "\n";
        flush();
        break;
    }

    if ($action === 'lock_principal_and_wait') {
        $principalId = $cmd['principal_id'] ?? null;
        if (!$principalId) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments']) . "\n";
            flush();
            continue;
        }

        try {
            $conn->beginTransaction();
            $conn->statement("SET LOCAL statement_timeout = '3000ms'");
            $conn->statement("SET LOCAL lock_timeout = '3000ms'");

            $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = ? FOR UPDATE');
            $stmt->execute([$principalId]);
            $row = $stmt->fetch();

            echo json_encode([
                'status' => 'LOCKED',
                'pid' => $backendPid,
                'row_found' => (bool) $row,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode([
                'status' => 'ERROR',
                'error_class' => get_class($e),
                'tag' => 'operation_failed',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'lock_session_and_wait') {
        $sessionId = $cmd['session_id'] ?? null;
        if (!$sessionId) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'invalid_arguments']) . "\n";
            flush();
            continue;
        }

        try {
            $conn->beginTransaction();
            $conn->statement("SET LOCAL statement_timeout = '3000ms'");
            $conn->statement("SET LOCAL lock_timeout = '3000ms'");

            $stmt = $pdo->prepare('SELECT id, user_id FROM passenger_sessions WHERE id = ? FOR UPDATE');
            $stmt->execute([$sessionId]);
            $row = $stmt->fetch();

            echo json_encode([
                'status' => 'LOCKED',
                'pid' => $backendPid,
                'row_found' => (bool) $row,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode([
                'status' => 'ERROR',
                'error_class' => get_class($e),
                'tag' => 'operation_failed',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'commit') {
        try {
            if ($conn->transactionLevel() > 0) {
                $conn->commit();
            }
            echo json_encode(['status' => 'COMMITTED']) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'operation_failed']) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'rollback') {
        try {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            echo json_encode(['status' => 'ROLLED_BACK']) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode(['status' => 'ERROR', 'tag' => 'operation_failed']) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'competing_register') {
        try {
            /** @var PassengerAuthCoordinator $coordinator */
            $coordinator = app(PassengerAuthCoordinator::class);
            $res = $coordinator->register(
                payload: (array) ($cmd['payload'] ?? []),
                ip: (string) ($cmd['ip'] ?? '198.51.100.99'),
                requestId: (string) ($cmd['request_id'] ?? (string) \Illuminate\Support\Str::uuid())
            );

            echo json_encode([
                'status' => 'SUCCESS',
                'data' => $res,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'FAILED',
                'error_class' => get_class($e),
                'tag' => 'operation_failed',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'competing_password_reset') {
        try {
            /** @var PassengerAuthCoordinator $coordinator */
            $coordinator = app(PassengerAuthCoordinator::class);
            $coordinator->passwordReset(
                payload: (array) ($cmd['payload'] ?? []),
                ip: (string) ($cmd['ip'] ?? '198.51.100.99'),
                requestId: (string) ($cmd['request_id'] ?? (string) \Illuminate\Support\Str::uuid())
            );

            echo json_encode([
                'status' => 'SUCCESS',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'FAILED',
                'error_class' => get_class($e),
                'tag' => 'operation_failed',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    if ($action === 'competing_delete_session') {
        try {
            /** @var PassengerAuthCoordinator $coordinator */
            $coordinator = app(PassengerAuthCoordinator::class);

            $ctxData = (array) ($cmd['session_context'] ?? []);
            $context = new PassengerSessionContext(
                sessionId: (string) ($ctxData['sessionId'] ?? ''),
                userId: (string) ($ctxData['userId'] ?? ''),
                credentialEpoch: (int) ($ctxData['credentialEpoch'] ?? 1),
                authLevel: (string) ($ctxData['authLevel'] ?? 'full'),
                csrfToken: (string) ($ctxData['csrfToken'] ?? ''),
                payload: [],
                issuedAt: CarbonImmutable::now(),
                lastSeenAt: CarbonImmutable::now(),
                absoluteExpiresAt: CarbonImmutable::parse((string) ($ctxData['absoluteExpiresAt'] ?? '2026-10-17T00:00:00Z')),
                idleExpiresAt: CarbonImmutable::parse((string) ($ctxData['idleExpiresAt'] ?? '2026-10-11T00:00:00Z'))
            );

            $wasCurrent = $coordinator->deleteSession(
                targetSessionId: (string) ($cmd['target_session_id'] ?? ''),
                sessionContext: $context,
                requestId: (string) ($cmd['request_id'] ?? (string) \Illuminate\Support\Str::uuid())
            );

            echo json_encode([
                'status' => 'SUCCESS',
                'was_current' => $wasCurrent,
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        } catch (\Throwable $e) {
            echo json_encode([
                'status' => 'FAILED',
                'error_class' => get_class($e),
                'tag' => 'operation_failed',
                'pid' => $backendPid,
            ]) . "\n";
            flush();
        }
        continue;
    }

    echo json_encode(['status' => 'UNKNOWN_ACTION']) . "\n";
    flush();
}

exit(0);
