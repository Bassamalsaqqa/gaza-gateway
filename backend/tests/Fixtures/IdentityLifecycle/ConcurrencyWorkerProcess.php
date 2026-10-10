<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityLifecycle;

/**
 * Safe process wrapper for isolated ConcurrencyWorker subprocesses.
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

        $env = array_merge(
            getenv(),
            [
                'APP_ENV' => 'testing',
                'DB_TEST_DATABASE' => 'gaza_gateway_test',
                'APP_KEY' => (string) config('app.key'),
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
            $ready = $this->readLine(10.0);
            if (!$ready || !isset($ready['status']) || $ready['status'] !== 'READY' || !isset($ready['pid'])) {
                $stderr = $this->drainStderr();
                $this->close();
                throw new \RuntimeException('ConcurrencyWorker failed to initialize safely: ' . $stderr);
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

    public const int MAX_IO_BYTES = 65536; // 64 KiB bound

    public function sendCommand(array $cmd): void
    {
        if (!isset($this->pipes[0]) || !is_resource($this->pipes[0])) {
            return;
        }

        $json = json_encode($cmd, JSON_THROW_ON_ERROR) . "\n";
        $bytes = strlen($json);

        if ($bytes > self::MAX_IO_BYTES) {
            throw new \InvalidArgumentException('Worker command input exceeds 64KiB bound');
        }

        $written = 0;
        $deadline = microtime(true) + 3.0;

        while ($written < $bytes) {
            if (microtime(true) > $deadline) {
                throw new \RuntimeException('Timeout writing to worker stdin');
            }
            $chunk = @fwrite($this->pipes[0], substr($json, $written));
            if ($chunk === false || $chunk === 0) {
                usleep(5000);
                continue;
            }
            $written += $chunk;
        }
        @fflush($this->pipes[0]);
    }

    public function readLine(float $timeoutSeconds = 5.0): ?array
    {
        if (!isset($this->pipes[1]) || !is_resource($this->pipes[1])) {
            return null;
        }

        $line = '';
        $start = microtime(true);

        while ((microtime(true) - $start) < $timeoutSeconds) {
            $char = @fgetc($this->pipes[1]);
            if ($char === false || $char === '') {
                usleep(5000);
                continue;
            }

            $line .= $char;
            if (strlen($line) > self::MAX_IO_BYTES) {
                throw new \RuntimeException('Worker output exceeds 64KiB bound');
            }

            if ($char === "\n") {
                $trimmed = trim($line);
                if ($trimmed === '') {
                    $line = '';
                    continue;
                }
                return json_decode($trimmed, true, 512, JSON_THROW_ON_ERROR);
            }
        }

        return null;
    }

    public function drainStderr(int $maxBytes = 65536): string
    {
        if (!isset($this->pipes[2]) || !is_resource($this->pipes[2])) {
            return '';
        }

        $output = '';
        while (($chunk = @fread($this->pipes[2], 4096)) !== false && $chunk !== '') {
            $output .= $chunk;
            if (strlen($output) >= $maxBytes) {
                break;
            }
        }

        return substr($output, 0, $maxBytes);
    }

    public function close(): void
    {
        if ($this->process === null) {
            return;
        }

        try {
            $this->sendCommand(['action' => 'quit']);
            $this->readLine(1.0);
        } catch (\Throwable) {
            // Ignore failure on quit attempt
        }

        $this->closePipes();

        $status = @proc_get_status($this->process);
        if ($status && $status['running']) {
            @proc_terminate($this->process, 15); // SIGTERM
            $deadline = microtime(true) + 1.0;
            while (microtime(true) < $deadline) {
                usleep(20000);
                $status = @proc_get_status($this->process);
                if (!$status || !$status['running']) {
                    break;
                }
            }

            if ($status && $status['running']) {
                @proc_terminate($this->process, 9); // SIGKILL
                $killDeadline = microtime(true) + 1.0;
                while (microtime(true) < $killDeadline) {
                    usleep(20000);
                    $status = @proc_get_status($this->process);
                    if (!$status || !$status['running']) {
                        break;
                    }
                }
            }
        }

        @proc_close($this->process);
        $this->process = null;
    }

    private function closePipes(): void
    {
        foreach ($this->pipes as $idx => $pipe) {
            if (is_resource($pipe)) {
                @fclose($pipe);
            }
        }
        $this->pipes = [];
    }

    public function __destruct()
    {
        $this->close();
    }
}
