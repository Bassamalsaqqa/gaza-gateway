<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityProtocol;

use Illuminate\Support\Facades\DB;
use PDO;

/** Bounded process/lock harness copied from the accepted identity race tests. */
trait BootstrapProcessHarness
{
    private function closeOwnedChild(&$process): int
    {
        if (!is_resource($process)) {
            return -1;
        }
        $status = proc_get_status($process);
        if ($status['running']) {
            @proc_terminate($process);
            $deadline = microtime(true) + 0.3;
            do {
                usleep(10000);
                $status = proc_get_status($process);
            } while ($status['running'] && microtime(true) < $deadline);
        }
        if ($status['running']) {
            @proc_terminate($process, 9);
            $deadline = microtime(true) + 2.0;
            do {
                usleep(10000);
                $status = proc_get_status($process);
            } while ($status['running'] && microtime(true) < $deadline);
        }
        if ($status['running']) {
            throw new \RuntimeException('Owned child did not exit within the cleanup deadline.');
        }
        $observedExit = $status['exitcode'];
        $closedExit = proc_close($process);
        $process = null;
        return $closedExit >= 0 ? $closedExit : $observedExit;
    }

    /**
     * Helper to run two real OS child processes racing across an exclusive file barrier.
     * Enforces private STDIN JSON communication, ready-file overlap handshakes,
     * non-blocking output collection with hard deadlines, bounded buffers,
     * safe numeric assertion messages, command arrays, and safe cleanup in finally.
     *
     * @return array{0: array, 1: array}
     */
    private function runTwoProcessRace(
        string $mode1,
        array $payload1,
        string $mode2,
        array $payload2
    ): array {
        $barrierFile = $this->tempBarrierDir . '/barrier_' . uniqid() . '.lock';
        $readyFile1 = $this->tempBarrierDir . '/ready1_' . uniqid() . '.lock';
        $readyFile2 = $this->tempBarrierDir . '/ready2_' . uniqid() . '.lock';

        $barrierFp = fopen($barrierFile, 'c+');
        $this->assertNotFalse($barrierFp);
        flock($barrierFp, LOCK_EX);

        $scriptPath = base_path('scripts/identity-concurrency-probe.php');
        $phpBinary = PHP_BINARY ?: 'php';
        $cmd1 = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode1,
            '--barrier-file=' . $barrierFile,
            '--ready-file=' . $readyFile1,
        ];
        $cmd2 = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode2,
            '--barrier-file=' . $barrierFile,
            '--ready-file=' . $readyFile2,
        ];

        $descriptors = [
            0 => ['pipe', 'r'], // STDIN (write payload)
            1 => ['pipe', 'w'], // STDOUT
            2 => ['pipe', 'w'], // STDERR
        ];

        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql_test',
        ];

        // Pass disposable test APP_KEY via private STDIN
        $appKey = config('app.key');
        $payload1['app_key'] = $appKey;
        $payload2['app_key'] = $appKey;

        $p1 = null;
        $p2 = null;
        $pipes1 = [];
        $pipes2 = [];

        try {
            $p1 = proc_open($cmd1, $descriptors, $pipes1, base_path(), $env);
            $p2 = proc_open($cmd2, $descriptors, $pipes2, base_path(), $env);

            $this->assertIsResource($p1);
            $this->assertIsResource($p2);

            // Write input JSON to child STDIN immediately and close STDIN pipes to prevent deadlocks
            fwrite($pipes1[0], json_encode($payload1, JSON_THROW_ON_ERROR));
            fclose($pipes1[0]);
            unset($pipes1[0]);

            fwrite($pipes2[0], json_encode($payload2, JSON_THROW_ON_ERROR));
            fclose($pipes2[0]);
            unset($pipes2[0]);

            // Wait for both child processes to signal readiness (overlap verification)
            $deadline = microtime(true) + 10.0; // 10 second startup deadline
            $bothReady = false;
            while (microtime(true) < $deadline) {
                if (file_exists($readyFile1) && file_exists($readyFile2)) {
                    $bothReady = true;
                    break;
                }
                usleep(10000); // 10ms poll
            }

            if (!$bothReady) {
                if (is_resource($p1)) {
                    @proc_terminate($p1);
                }
                if (is_resource($p2)) {
                    @proc_terminate($p2);
                }
                $this->fail('Startup timeout: child processes failed to signal readiness before barrier release');
            }

            // Release the barrier: both processes race simultaneously into PostgreSQL
            flock($barrierFp, LOCK_UN);
            fclose($barrierFp);
            $barrierFp = null;

            // Non-blocking collection with 12s deadline and bounded buffer ceiling (64 KiB)
            stream_set_blocking($pipes1[1], false);
            stream_set_blocking($pipes1[2], false);
            stream_set_blocking($pipes2[1], false);
            stream_set_blocking($pipes2[2], false);

            $out1 = '';
            $err1 = '';
            $out2 = '';
            $err2 = '';
            $maxBufferSize = 65536; // 64 KiB ceiling
            $readDeadline = microtime(true) + 12.0;
            $timedOut = false;

            while (microtime(true) < $readDeadline) {
                if (strlen($out1) < $maxBufferSize) {
                    $r1 = stream_get_contents($pipes1[1], $maxBufferSize - strlen($out1));
                    if ($r1 !== false && $r1 !== '') {
                        $out1 .= $r1;
                    }
                }
                if (strlen($err1) < $maxBufferSize) {
                    $e1 = stream_get_contents($pipes1[2], $maxBufferSize - strlen($err1));
                    if ($e1 !== false && $e1 !== '') {
                        $err1 .= $e1;
                    }
                }

                if (strlen($out2) < $maxBufferSize) {
                    $r2 = stream_get_contents($pipes2[1], $maxBufferSize - strlen($out2));
                    if ($r2 !== false && $r2 !== '') {
                        $out2 .= $r2;
                    }
                }
                if (strlen($err2) < $maxBufferSize) {
                    $e2 = stream_get_contents($pipes2[2], $maxBufferSize - strlen($err2));
                    if ($e2 !== false && $e2 !== '') {
                        $err2 .= $e2;
                    }
                }

                $status1 = proc_get_status($p1);
                $status2 = proc_get_status($p2);

                if (!$status1['running'] && !$status2['running']) {
                    // Drain any remaining output up to buffer ceiling
                    if (strlen($out1) < $maxBufferSize) {
                        $out1 .= (string) stream_get_contents($pipes1[1], $maxBufferSize - strlen($out1));
                    }
                    if (strlen($err1) < $maxBufferSize) {
                        $err1 .= (string) stream_get_contents($pipes1[2], $maxBufferSize - strlen($err1));
                    }
                    if (strlen($out2) < $maxBufferSize) {
                        $out2 .= (string) stream_get_contents($pipes2[1], $maxBufferSize - strlen($out2));
                    }
                    if (strlen($err2) < $maxBufferSize) {
                        $err2 .= (string) stream_get_contents($pipes2[2], $maxBufferSize - strlen($err2));
                    }
                    break;
                }

                usleep(10000); // 10ms
            }

            $status1 = proc_get_status($p1);
            $status2 = proc_get_status($p2);
            if ($status1['running'] || $status2['running']) {
                $timedOut = true;
                if ($status1['running']) {
                    @proc_terminate($p1);
                }
                if ($status2['running']) {
                    @proc_terminate($p2);
                }
            }

            if (isset($pipes1[1]) && is_resource($pipes1[1])) {
                fclose($pipes1[1]);
                unset($pipes1[1]);
            }
            if (isset($pipes1[2]) && is_resource($pipes1[2])) {
                fclose($pipes1[2]);
                unset($pipes1[2]);
            }
            if (isset($pipes2[1]) && is_resource($pipes2[1])) {
                fclose($pipes2[1]);
                unset($pipes2[1]);
            }
            if (isset($pipes2[2]) && is_resource($pipes2[2])) {
                fclose($pipes2[2]);
                unset($pipes2[2]);
            }

            $exit1 = $this->closeOwnedChild($p1);
            $p1 = null;
            $exit2 = $this->closeOwnedChild($p2);
            $p2 = null;

            if ($timedOut) {
                $this->fail(sprintf(
                    'Process race deadline exceeded (running1=%d, running2=%d, out1_bytes=%d, out2_bytes=%d)',
                    (int) $status1['running'],
                    (int) $status2['running'],
                    strlen($out1),
                    strlen($out2)
                ));
            }

            $this->assertSame(
                0,
                $exit1,
                sprintf('Process 1 exited with code %d (out_bytes=%d, err_bytes=%d)', $exit1, strlen($out1), strlen($err1))
            );
            $this->assertSame(
                0,
                $exit2,
                sprintf('Process 2 exited with code %d (out_bytes=%d, err_bytes=%d)', $exit2, strlen($out2), strlen($err2))
            );

            $res1 = json_decode($out1, true);
            $res2 = json_decode($out2, true);

            $this->assertIsArray(
                $res1,
                sprintf('Process 1 produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out1), strlen($err1))
            );
            $this->assertIsArray(
                $res2,
                sprintf('Process 2 produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out2), strlen($err2))
            );

            return [$res1, $res2];
        } finally {
            if ($barrierFp !== null && is_resource($barrierFp)) {
                @flock($barrierFp, LOCK_UN);
                @fclose($barrierFp);
            }
            foreach ([$pipes1, $pipes2] as $pipes) {
                foreach ($pipes as $p) {
                    if (is_resource($p)) {
                        @fclose($p);
                    }
                }
            }
            if ($p1 !== null && is_resource($p1)) {
                @proc_terminate($p1);
                $this->closeOwnedChild($p1);
            }
            if ($p2 !== null && is_resource($p2)) {
                @proc_terminate($p2);
                $this->closeOwnedChild($p2);
            }
            @unlink($barrierFile);
            @unlink($readyFile1);
            @unlink($readyFile2);
        }
    }

    private function runChildWithParentLockWait(
        string $mode,
        array $payload,
        string $clockFile,
        \Closure $acquireParentLock,
        \Closure $onBlockedCallback
    ): array {
        $readyFile = $this->tempBarrierDir . '/ready_lockwait_' . uniqid() . '.lock';

        $config = config('database.connections.pgsql_test');
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $config['host'], $config['port'], $config['database']);
        $pdo = new PDO($dsn, $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        // 1. Parent acquires precise row lock in open transaction
        $pdo->beginTransaction();
        $acquireParentLock($pdo);
        $parentBackendPid = (int) $pdo->query('SELECT pg_backend_pid()')->fetchColumn();

        $scriptPath = base_path('scripts/identity-concurrency-probe.php');
        $phpBinary = PHP_BINARY ?: 'php';
        $cmd = [
            $phpBinary,
            $scriptPath,
            '--mode=' . $mode,
            '--ready-file=' . $readyFile,
            '--clock-file=' . $clockFile,
        ];

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql_test',
        ];

        $payload['app_key'] = config('app.key');
        $payload['clock_file'] = $clockFile;

        $p = null;
        $pipes = [];

        try {
            $p = proc_open($cmd, $descriptors, $pipes, base_path(), $env);
            $this->assertIsResource($p);

            fwrite($pipes[0], json_encode($payload, JSON_THROW_ON_ERROR));
            fclose($pipes[0]);
            unset($pipes[0]);

            // Wait for child readiness
            $readyDeadline = microtime(true) + 8.0;
            $isReady = false;
            while (microtime(true) < $readyDeadline) {
                if (file_exists($readyFile)) {
                    $isReady = true;
                    break;
                }
                usleep(10000); // 10ms
            }
            $this->assertTrue($isReady, 'Child must signal readiness before lock contention check');

            // 2. Observe child blocked in pg_stat_activity with wait_event_type = 'Lock'
            $blockedDeadline = microtime(true) + 8.0;
            $observedBlocked = false;
            while (microtime(true) < $blockedDeadline) {
                $status = proc_get_status($p);
                if (!$status['running']) {
                    break;
                }
                $statRows = DB::select("
                    SELECT pid, wait_event_type, wait_event, state
                    FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock'
                      AND state = 'active'
                      AND pid = CAST(? AS integer)
                      AND CAST(? AS integer) = ANY(pg_blocking_pids(pid))
                ", [(int) file_get_contents($readyFile), $parentBackendPid]);
                if (!empty($statRows)) {
                    $observedBlocked = true;
                    break;
                }
                usleep(10000); // 10ms
            }

            $this->assertTrue($observedBlocked, 'Child process must be observed blocked on PostgreSQL row lock in pg_stat_activity');

            // 3. Invoke callback while child is confirmed blocked (e.g. advance clock file)
            $onBlockedCallback();

            // 4. Release parent lock so child unblocks and derives fresh post-lock state
            $pdo->rollBack();

            // 5. Collect child output with deadline and bounded buffer
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);

            $out = '';
            $err = '';
            $maxBufferSize = 65536;
            $readDeadline = microtime(true) + 10.0;
            $timedOut = false;

            while (microtime(true) < $readDeadline) {
                if (strlen($out) < $maxBufferSize) {
                    $r = stream_get_contents($pipes[1], $maxBufferSize - strlen($out));
                    if ($r !== false && $r !== '') {
                        $out .= $r;
                    }
                }
                if (strlen($err) < $maxBufferSize) {
                    $e = stream_get_contents($pipes[2], $maxBufferSize - strlen($err));
                    if ($e !== false && $e !== '') {
                        $err .= $e;
                    }
                }

                $status = proc_get_status($p);
                if (!$status['running']) {
                    if (strlen($out) < $maxBufferSize) {
                        $out .= (string) stream_get_contents($pipes[1], $maxBufferSize - strlen($out));
                    }
                    if (strlen($err) < $maxBufferSize) {
                        $err .= (string) stream_get_contents($pipes[2], $maxBufferSize - strlen($err));
                    }
                    break;
                }
                usleep(10000); // 10ms
            }

            $status = proc_get_status($p);
            if ($status['running']) {
                $timedOut = true;
                @proc_terminate($p);
            }

            if (isset($pipes[1]) && is_resource($pipes[1])) {
                fclose($pipes[1]);
                unset($pipes[1]);
            }
            if (isset($pipes[2]) && is_resource($pipes[2])) {
                fclose($pipes[2]);
                unset($pipes[2]);
            }

            $exitCode = $this->closeOwnedChild($p);
            $p = null;

            if ($timedOut) {
                $this->fail(sprintf('Child process timed out waiting for completion (out_bytes=%d)', strlen($out)));
            }

            $this->assertSame(
                0,
                $exitCode,
                sprintf('Child process exited with code %d (out_bytes=%d, err_bytes=%d)', $exitCode, strlen($out), strlen($err))
            );

            $res = json_decode($out, true);
            $this->assertIsArray(
                $res,
                sprintf('Child process produced invalid JSON (out_bytes=%d, err_bytes=%d)', strlen($out), strlen($err))
            );

            return $res;
        } finally {
            try {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
            } catch (\Throwable) {
            }
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    @fclose($pipe);
                }
            }
            if ($p !== null && is_resource($p)) {
                @proc_terminate($p);
                $this->closeOwnedChild($p);
            }
            @unlink($readyFile);
        }
    }

}
