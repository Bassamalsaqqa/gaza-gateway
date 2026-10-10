<?php

declare(strict_types=1);

/**
 * Isolated CLI Concurrency Worker for two-process PostgreSQL concurrency verification.
 * Receives JSON-encoded commands on STDIN, executes them over a dedicated PDO connection,
 * and writes JSON-encoded status/SQLSTATE responses to STDOUT.
 *
 * Strict safety boundaries:
 * - Requires process APP_ENV === 'testing'
 * - Requires configured DB_TEST_DATABASE === 'gaza_gateway_test' (no fallback to dev DB)
 * - Requires live PostgreSQL connection current_database() === 'gaza_gateway_test'
 * - Emits only known SQLSTATE and allowlisted constraint/trigger tags (never raw messages, SQL, or bindings)
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

$host = getenv('DB_HOST');
$port = getenv('DB_PORT');
$user = getenv('DB_USERNAME');
$password = getenv('DB_PASSWORD');

if (empty($host) || empty($port) || empty($user) || $password === false || $password === '') {
    fwrite(STDERR, "Configuration error: missing required database credentials in environment\n");
    exit(1);
}

$dsn = "pgsql:host={$host};port={$port};dbname={$database}";

try {
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (\Throwable $e) {
    fwrite(STDERR, "Database connection failure\n");
    exit(2);
}

try {
    $liveDb = (string) $pdo->query('SELECT current_database() AS db')->fetchColumn();
    if ($liveDb !== 'gaza_gateway_test') {
        fwrite(STDERR, "Database error: live connection is not gaza_gateway_test\n");
        exit(3);
    }
} catch (\Throwable $e) {
    fwrite(STDERR, "Database query failure\n");
    exit(3);
}

$backendPid = (int) $pdo->query('SELECT pg_backend_pid() AS pid')->fetchColumn();

// Announce readiness and backend PID
echo json_encode(['status' => 'READY', 'pid' => $backendPid]) . "\n";
flush();

function extractAllowlistedTag(string $message): ?string
{
    $allowlistedTags = [
        'uq_booking_passengers_infant_adult',
        'trg_booking_passengers_adult_target',
        'Cannot modify or delete adult passenger linked by an infant',
        'Infant passenger must link to an adult passenger in the same booking',
        'chk_booking_passengers_type',
        'chk_booking_passengers_infant_link',
        'chk_booking_passengers_no_self_link',
        'chk_booking_passengers_passenger_index',
        'uq_booking_passengers_booking_index',
        'uq_booking_passengers_booking_req_id',
        'fk_booking_passengers_booking',
        'fk_booking_passengers_adult',
    ];

    foreach ($allowlistedTags as $tag) {
        if (str_contains($message, $tag)) {
            return $tag;
        }
    }

    return null;
}

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
    if (!$cmd || !isset($cmd['action'])) {
        echo json_encode(['status' => 'ERROR', 'error' => 'invalid_command']) . "\n";
        flush();
        continue;
    }

    $action = $cmd['action'];

    if ($action === 'quit') {
        echo json_encode(['status' => 'BYE']) . "\n";
        flush();
        break;
    }

    try {
        if ($action === 'begin') {
            $pdo->beginTransaction();
            echo json_encode(['status' => 'OK']) . "\n";
        } elseif ($action === 'commit') {
            $pdo->commit();
            echo json_encode(['status' => 'OK']) . "\n";
        } elseif ($action === 'rollback') {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            echo json_encode(['status' => 'OK']) . "\n";
        } elseif ($action === 'exec') {
            $sql = $cmd['sql'];
            $params = $cmd['params'] ?? [];
            $statement = $pdo->prepare($sql);
            $statement->execute($params);
            echo json_encode(['status' => 'OK']) . "\n";
        } elseif ($action === 'query') {
            $sql = $cmd['sql'];
            $params = $cmd['params'] ?? [];
            $statement = $pdo->prepare($sql);
            $statement->execute($params);
            $rows = $statement->fetchAll();
            echo json_encode(['status' => 'OK', 'rows' => $rows]) . "\n";
        } else {
            echo json_encode(['status' => 'ERROR', 'error' => 'unknown_action']) . "\n";
        }
    } catch (\PDOException $e) {
        $rawState = (string) $e->getCode();
        $sqlstate = preg_match('/^[0-9A-Za-z]{5}$/', $rawState) ? $rawState : 'ERROR';
        $tag = extractAllowlistedTag($e->getMessage());
        $resp = [
            'status' => 'ERROR',
            'sqlstate' => $sqlstate,
        ];
        if ($tag !== null) {
            $resp['tag'] = $tag;
        }
        echo json_encode($resp) . "\n";
    } catch (\Throwable $e) {
        echo json_encode([
            'status' => 'ERROR',
            'sqlstate' => 'ERROR',
        ]) . "\n";
    }
    flush();
}

exit(0);
