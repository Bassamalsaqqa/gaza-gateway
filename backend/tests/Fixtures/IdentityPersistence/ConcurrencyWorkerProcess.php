<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityPersistence;

/**
 * Safe, bounded process wrapper for isolated ConcurrencyWorker subprocesses.
 * Uses direct PHP_BINARY argv proc_open (no shell wrapper), bounded I/O protocol,
 * bounded graceful/TERM/KILL exit escalation, and safe stderr draining.
 */
class ConcurrencyWorkerProcess
{
    /** @var resource|null */
    private $process = null;

    /** @var array<int, resource> */
    private array $pipes = [];

    private int $backendPid = 0;

    public function __construct(?array $customEnv = null)
    {
        $workerScript = __DIR__ . '/ConcurrencyWorker.php';
        $cmd = [PHP_BINARY, $workerScript];

        $descriptors = [
            0 => ['pipe', 'r'], // stdin
            1 => ['pipe', 'w'], // stdout
            2 => ['pipe', 'w'], // stderr
        ];

        // Base environment merged with explicit testing variables or test overrides
        $env = array_merge(
            getenv(),
            [
                'APP_ENV' => 'testing',
                'DB_TEST_DATABASE' => 'gaza_gateway_test',
            ],
            $customEnv ?? []
        );

        $process = proc_open($cmd, $descriptors, $this->pipes, base_path(), $env);
        if (!is_resource($process)) {
            $this->closePipes();
            throw new \RuntimeException('Failed to spawn ConcurrencyWorker subprocess');
        }

        $this->process = $process;

        stream_set_blocking($this->pipes[0], false);
        stream_set_blocking($this->pipes[1], false);
        stream_set_blocking($this->pipes[2], false);

        try {
            // Read READY announcement with bounded timeout
            $ready = $this->readLine(5.0);
            if (!$ready || !isset($ready['status']) || $ready['status'] !== 'READY' || !isset($ready['pid'])) {
                $this->drainStderr();
                $this->close();
                throw new \RuntimeException('ConcurrencyWorker failed to initialize safely');
            }

            $this->backendPid = (int) $ready['pid'];
        } catch (\Throwable $e) {
            $this->close();
            throw $e;
        }
    }

    public function getBackendPid(): int
    {
        return $this->backendPid;
    }

    public function sendCommand(array $cmd): void
    {
        if (!isset($this->pipes[0]) || !is_resource($this->pipes[0])) {
            return;
        }

        $payload = json_encode($cmd, JSON_THROW_ON_ERROR) . "\n";
        if (strlen($payload) > 65536) {
            throw new \RuntimeException('ConcurrencyWorker command exceeds protocol limit');
        }
        $offset = 0;
        $deadline = microtime(true) + 2.0;
        while ($offset < strlen($payload)) {
            if (microtime(true) >= $deadline) {
                throw new \RuntimeException('ConcurrencyWorker command write timed out');
            }
            $written = @fwrite($this->pipes[0], substr($payload, $offset));
            if ($written === false) {
                throw new \RuntimeException('ConcurrencyWorker command write failed');
            }
            $offset += $written;
            if ($written === 0) {
                usleep(10000);
            }
        }
    }

    public function readLine(float $timeoutSeconds = 5.0): ?array
    {
        if (!isset($this->pipes[1]) || !is_resource($this->pipes[1])) {
            return null;
        }

        $start = microtime(true);
        $buffer = '';

        while (microtime(true) - $start < $timeoutSeconds) {
            $read = [$this->pipes[1]];
            $write = null;
            $except = null;
            $changed = stream_select($read, $write, $except, 0, 25000); // 25ms

            if ($changed === false) {
                break;
            }

            if ($changed > 0) {
                $chunk = fgets($this->pipes[1], 65537);
                if ($chunk !== false) {
                    $buffer .= $chunk;
                    if (strlen($buffer) > 65536) {
                        throw new \RuntimeException('ConcurrencyWorker response exceeds protocol limit');
                    }
                    if (str_ends_with($buffer, "\n")) {
                        $decoded = json_decode(trim($buffer), true);
                        if (is_array($decoded)) {
                            return $decoded;
                        }
                        return ['status' => 'ERROR', 'error' => 'invalid_json'];
                    }
                }
            }
        }

        return null;
    }

    public function execute(string $sql, array $params = [], float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand([
            'action' => 'exec',
            'sql' => $sql,
            'params' => $params,
        ]);
        return $this->readLine($timeoutSeconds);
    }

    public function begin(): ?array
    {
        $this->sendCommand(['action' => 'begin']);
        return $this->readLine(3.0);
    }

    public function commit(): ?array
    {
        $this->sendCommand(['action' => 'commit']);
        return $this->readLine(5.0);
    }

    public function rollback(): ?array
    {
        $this->sendCommand(['action' => 'rollback']);
        return $this->readLine(3.0);
    }

    private function drainStderr(): void
    {
        if (isset($this->pipes[2]) && is_resource($this->pipes[2])) {
            @fread($this->pipes[2], 4096);
        }
    }

    private function closePipes(): void
    {
        foreach ($this->pipes as $k => $pipe) {
            if (is_resource($pipe)) {
                @fclose($pipe);
            }
            unset($this->pipes[$k]);
        }
    }

    private function waitForProcessExit(float $timeoutSeconds): bool
    {
        $start = microtime(true);
        while (microtime(true) - $start < $timeoutSeconds) {
            if (!$this->process || !is_resource($this->process)) {
                return true;
            }
            $status = proc_get_status($this->process);
            if (!$status || !$status['running']) {
                return true;
            }
            usleep(25000); // 25ms
        }
        return false;
    }

    public function close(): void
    {
        if (!$this->process || !is_resource($this->process)) {
            $this->closePipes();
            return;
        }

        // 1. Attempt graceful quit via stdin command
        if (isset($this->pipes[0]) && is_resource($this->pipes[0])) {
            @fwrite($this->pipes[0], json_encode(['action' => 'quit']) . "\n");
            @fflush($this->pipes[0]);
        }

        $this->drainStderr();
        $this->closePipes();

        // 2. Bounded wait for graceful process exit
        $exited = $this->waitForProcessExit(0.5);

        // 3. Escalation to SIGTERM if still running
        if (!$exited && is_resource($this->process)) {
            @proc_terminate($this->process, 15); // SIGTERM
            $exited = $this->waitForProcessExit(0.5);
        }

        // 4. Escalation to SIGKILL if still running
        if (!$exited && is_resource($this->process)) {
            @proc_terminate($this->process, 9); // SIGKILL
            $exited = $this->waitForProcessExit(2.0);
        }
        if (!$exited) {
            throw new \RuntimeException('Owned concurrency worker did not exit within cleanup deadline');
        }

        // 5. Call proc_close only after observed exit
        if (is_resource($this->process)) {
            @proc_close($this->process);
            $this->process = null;
        }
    }

    public function __destruct()
    {
        $this->close();
    }
}
