<?php

declare(strict_types=1);

/**
 * Isolated Concurrency Probe Script for Phase 13B Package 01.
 *
 * Used by test suites to spawn multiple independent operating-system processes
 * competing for the same PostgreSQL rate limit buckets and session rows with
 * strict process-level concurrency barriers.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use App\Identity\Exceptions\IdentityException;
use App\Identity\RateLimiting\DurableRateLimiter;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;

// 1. Read private STDIN JSON payload BEFORE bootstrapping application
$inputRaw = stream_get_contents(STDIN);
$input = json_decode((string) $inputRaw, true) ?? [];

if (!empty($input['app_key'])) {
    putenv("APP_KEY={$input['app_key']}");
    $_ENV['APP_KEY'] = $input['app_key'];
    $_SERVER['APP_KEY'] = $input['app_key'];
}

// 2. Bootstrap minimal Laravel environment
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// 3. Strict environment, connection, and database verification before any database mutation
if (config('app.env') !== 'testing' || env('APP_ENV') !== 'testing') {
    fwrite(STDERR, "Concurrency probe must run in testing environment.\n");
    exit(2);
}

$defaultConn = DB::getDefaultConnection();
if ($defaultConn !== 'pgsql_test') {
    fwrite(STDERR, "Concurrency probe must use pgsql_test connection, got: {$defaultConn}\n");
    exit(3);
}

$currentDb = DB::selectOne('SELECT current_database() AS db')->db;
if ($currentDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "Concurrency probe must run against gaza_gateway_test, got: {$currentDb}\n");
    exit(4);
}

// Set strict SQL statement and lock timeouts to prevent unmonitored hangs
DB::statement("SET statement_timeout = '8000ms'");
DB::statement("SET lock_timeout = '5000ms'");

$options = getopt('', [
    'mode:',
    'barrier-file::',
    'ready-file::',
    'clock-file::',
]);

$mode = $options['mode'] ?? ($input['mode'] ?? null);
$barrierFile = $options['barrier-file'] ?? null;
$readyFile = $options['ready-file'] ?? null;
$clockFile = $options['clock-file'] ?? ($input['clock_file'] ?? null);

if ($clockFile) {
    CarbonImmutable::setTestNow(function () use ($clockFile) {
        if (file_exists($clockFile)) {
            $content = trim((string) file_get_contents($clockFile));
            if (is_numeric($content)) {
                return new \DateTimeImmutable('@' . (int) $content);
            }
        }
        return new \DateTimeImmutable();
    });
}

if (!$mode) {
    fwrite(STDERR, "Missing --mode option\n");
    exit(1);
}

// Signal readiness to parent before waiting on barrier lock
if ($readyFile) {
    file_put_contents($readyFile, (string) DB::selectOne('SELECT pg_backend_pid() AS pid')->pid);
}

// If a synchronization barrier file is provided, block until lock is released by parent test runner
if ($barrierFile && file_exists($barrierFile)) {
    $fp = fopen($barrierFile, 'r');
    if ($fp) {
        flock($fp, LOCK_SH);
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

try {
    if ($mode === 'rate-limit') {
        $realm = $input['realm'] ?? 'passenger';
        $operation = $input['operation'] ?? 'login';
        $subject = $input['subject'] ?? 'test-subject';
        $ip = $input['ip'] ?? '127.0.0.1';

        $limiter = new DurableRateLimiter(DB::connection());
        $result = $limiter->charge($realm, $operation, [
            'subject' => $subject,
            'ip' => $ip,
        ]);

        echo json_encode([
            'allowed' => $result->allowed,
            'retry_after' => $result->retryAfterSeconds,
            'remaining' => $result->remaining,
            'limit' => $result->limit,
        ]);
        exit(0);
    }

    if ($mode === 'session-rotate') {
        $token = $input['token'] ?? '';
        $realm = $input['realm'] ?? 'passenger';

        if ($token === '') {
            throw new \InvalidArgumentException('Missing bearer token in input JSON');
        }

        $encrypter = $app->make(Encrypter::class);

        if ($realm === 'staff') {
            $store = new StaffSessionStore(DB::connection(), $encrypter);
            $receipt = $store->rotate($token);
        } else {
            $store = new PassengerSessionStore(DB::connection(), $encrypter);
            $receipt = $store->rotate($token);
        }

        echo json_encode([
            'success' => true,
            'session_id' => $receipt->sessionId,
        ]);
        exit(0);
    }

    if ($mode === 'revoke-principal') {
        $realm = $input['realm'] ?? 'passenger';
        $principalId = $input['principal_id'] ?? null;

        if (!$principalId) {
            throw new \InvalidArgumentException('Missing principal_id in input JSON');
        }

        $encrypter = $app->make(Encrypter::class);
        if ($realm === 'staff') {
            $store = new StaffSessionStore(DB::connection(), $encrypter);
        } else {
            $store = new PassengerSessionStore(DB::connection(), $encrypter);
        }

        $count = $store->revokePrincipal($principalId);

        echo json_encode([
            'success' => true,
            'revoked_count' => $count,
        ]);
        exit(0);
    }

    if ($mode === 'session-read') {
        $token = $input['token'] ?? '';
        $realm = $input['realm'] ?? 'passenger';

        if ($token === '') {
            throw new \InvalidArgumentException('Missing bearer token in input JSON');
        }

        $encrypter = $app->make(Encrypter::class);
        if ($realm === 'staff') {
            $store = new StaffSessionStore(DB::connection(), $encrypter);
            $ctx = $store->read($token);
        } else {
            $store = new PassengerSessionStore(DB::connection(), $encrypter);
            $ctx = $store->read($token);
        }

        echo json_encode([
            'success' => $ctx !== null,
            'session_id' => $ctx?->sessionId,
        ]);
        exit(0);
    }

    if ($mode === 'session-issue-full') {
        $realm = $input['realm'] ?? 'passenger';
        $principalId = $input['principal_id'] ?? '';
        $epoch = (int) ($input['epoch'] ?? 1);
        $mfaVersion = (int) ($input['mfa_version'] ?? 1);

        $encrypter = $app->make(Encrypter::class);
        if ($realm === 'staff') {
            $store = new StaffSessionStore(DB::connection(), $encrypter);
            $mfaVerifiedAt = isset($input['mfa_verified_at'])
                ? (is_numeric($input['mfa_verified_at'])
                    ? CarbonImmutable::createFromTimestamp((int) $input['mfa_verified_at'])
                    : CarbonImmutable::parse($input['mfa_verified_at']))
                : CarbonImmutable::now()->subSeconds(30);

            $receipt = $store->issueFull(
                staffId: $principalId,
                credentialEpoch: $epoch,
                mfaVersion: $mfaVersion,
                mfaVerifiedAt: $mfaVerifiedAt,
            );
        } else {
            $store = new PassengerSessionStore(DB::connection(), $encrypter);
            $receipt = $store->issueFull(
                userId: $principalId,
                credentialEpoch: $epoch,
            );
        }

        echo json_encode([
            'success' => true,
            'session_id' => $receipt->sessionId,
            'token' => $receipt->getRawToken(),
            'epoch' => $epoch,
        ]);
        exit(0);
    }

    if ($mode === 'epoch-change') {
        $realm = $input['realm'] ?? 'passenger';
        $principalId = $input['principal_id'] ?? '';
        $newEpoch = (int) ($input['new_epoch'] ?? 2);

        $table = $realm === 'staff' ? 'staff_users' : 'users';
        DB::transaction(function () use ($table, $principalId, $newEpoch) {
            DB::table($table)->where('id', $principalId)->lockForUpdate()->update([
                'credential_epoch' => $newEpoch,
            ]);
        });

        echo json_encode([
            'success' => true,
            'new_epoch' => $newEpoch,
        ]);
        exit(0);
    }

    if ($mode === 'mfa-revoke') {
        $staffId = $input['staff_id'] ?? '';
        $mfaVersion = (int) ($input['mfa_version'] ?? 1);

        DB::transaction(function () use ($staffId, $mfaVersion) {
            DB::table('staff_users')->where('id', $staffId)->lockForUpdate()->first();
            DB::table('staff_mfa_credentials')
                ->where('staff_id', $staffId)
                ->where('version', $mfaVersion)
                ->lockForUpdate()
                ->update(['revoked_at' => CarbonImmutable::now()->toIso8601String()]);
        });

        echo json_encode([
            'success' => true,
            'revoked' => true,
        ]);
        exit(0);
    }

    if ($mode === 'bootstrap-admit') {
        $realm = $input['realm'] ?? 'passenger';
        $ip = $input['ip'] ?? '127.0.0.1';
        $ipLimit = isset($input['ip_limit']) ? (int) $input['ip_limit'] : null;
        $globalLimit = isset($input['global_limit']) ? (int) $input['global_limit'] : null;
        $retainedCap = isset($input['retained_cap']) ? (int) $input['retained_cap'] : null;
        $windowSeconds = isset($input['window_seconds']) ? (int) $input['window_seconds'] : null;

        /** @var \App\Identity\RateLimiting\AnonymousBootstrapAdmission $admission */
        $admission = $app->make(\App\Identity\RateLimiting\AnonymousBootstrapAdmission::class);
        if ($ipLimit !== null || $globalLimit !== null || $retainedCap !== null || $windowSeconds !== null) {
            $admission->setTestLimits($ipLimit, $globalLimit, $retainedCap, $windowSeconds);
        }

        $request = \Illuminate\Http\Request::create('/api/v1/auth/csrf', 'GET', server: [
            'REMOTE_ADDR' => $ip,
        ]);

        $result = $admission->admitAndIssueAnonymous($realm, $request);

        echo json_encode([
            'allowed' => $result->allowed,
            'reason' => $result->reason,
            'retry_after' => $result->retryAfterSeconds,
            'session_id' => $result->receipt?->sessionId,
        ]);
        exit(0);
    }

    if ($mode === 'bootstrap-cleanup') {
        $realm = $input['realm'] ?? 'passenger';
        $batchSize = (int) ($input['batch_size'] ?? 100);

        /** @var \App\Identity\Sessions\AnonymousSessionCleanup $cleaner */
        $cleaner = $app->make(\App\Identity\Sessions\AnonymousSessionCleanup::class);
        $deleted = $cleaner->cleanRealmBatch($realm, $batchSize);

        echo json_encode([
            'success' => true,
            'deleted' => $deleted,
        ]);
        exit(0);
    }

    fwrite(STDERR, "Unsupported mode\n");
    exit(1);
} catch (IdentityException $e) {
    echo json_encode([
        'success' => false,
        'error_code' => $e->errorCode ?? ($e->reasonCode ?? 'identity_error'),
        'type' => (new \ReflectionClass($e))->getShortName(),
    ]);
    exit(0);
} catch (\Throwable $e) {
    echo json_encode([
        'success' => false,
        'error_code' => 'system_error',
        'type' => (new \ReflectionClass($e))->getShortName(),
    ]);
    exit(0);
}
