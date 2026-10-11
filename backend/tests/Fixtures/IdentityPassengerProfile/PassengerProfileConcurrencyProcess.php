<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityPassengerProfile;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * Safe, bounded process wrapper for isolated PassengerProfileConcurrencyWorker subprocesses.
 * Uses direct PHP_BINARY argv proc_open (no shell wrapper), bounded I/O protocol,
 * bounded graceful/TERM/KILL exit escalation, and safe stderr draining.
 */
final class PassengerProfileConcurrencyProcess
{
    private const MAX_PAYLOAD_BYTES = 65536;
    private const MAX_STDERR_BYTES = 65536;

    /** @var resource|null */
    private $process = null;

    /** @var array<int, resource> */
    private array $pipes = [];

    private int $backendPid = 0;

    private string $stderrBuffer = '';

    /**
     * @param array<string, string>|null $customEnv
     */
    public function __construct(?array $customEnv = null)
    {
        // 1. Strict Parent Assertions before proc_open
        $parentEnv = getenv('APP_ENV');
        if ($parentEnv !== 'testing') {
            throw new RuntimeException("Parent process requires getenv('APP_ENV') === 'testing', got: [" . var_export($parentEnv, true) . ']');
        }

        if (!function_exists('app') || !app()->environment('testing') || config('app.env') !== 'testing') {
            throw new RuntimeException("Parent application environment must be 'testing'");
        }

        if (config('database.default') !== 'pgsql_test' || DB::getDefaultConnection() !== 'pgsql_test') {
            throw new RuntimeException("Parent default connection must be 'pgsql_test'");
        }

        $conn = DB::connection('pgsql_test');
        if ($conn->getName() !== 'pgsql_test') {
            throw new RuntimeException("Parent connection getName() must be 'pgsql_test', got: [{$conn->getName()}]");
        }

        if ($conn->getDriverName() !== 'pgsql') {
            throw new RuntimeException("Parent connection getDriverName() must be 'pgsql', got: [{$conn->getDriverName()}]");
        }

        $liveDb = (string) ($conn->selectOne('SELECT current_database() AS db')?->db ?? '');
        if ($liveDb !== 'gaza_gateway_test') {
            throw new RuntimeException("Parent live database must be 'gaza_gateway_test', got: [{$liveDb}]");
        }

        // 2. Refuse customEnv authority overrides (no silent rewriting an unsafe parent into a test child)
        if ($customEnv !== null) {
            $refusedOverrides = [
                'APP_ENV',
                'DB_CONNECTION',
                'DB_TEST_DATABASE',
                'DATABASE_URL',
                'DB_DATABASE',
                'DB_HOST',
                'DB_PORT',
                'DB_USERNAME',
                'DB_PASSWORD',
            ];
            foreach ($customEnv as $key => $val) {
                $upperKey = strtoupper((string) $key);
                if (
                    in_array($upperKey, $refusedOverrides, true)
                    || str_starts_with($upperKey, 'DB_')
                    || str_starts_with($upperKey, 'DATABASE_')
                ) {
                    throw new RuntimeException("Refusing customEnv authority override for '{$key}'");
                }
            }
        }

        $workerScript = __DIR__ . '/PassengerProfileConcurrencyWorker.php';
        $cmd = [
            PHP_BINARY ?: 'php',
            '-d', 'display_errors=0',
            '-d', 'log_errors=0',
            $workerScript,
        ];

        $descriptors = [
            0 => ['pipe', 'r'], // stdin
            1 => ['pipe', 'w'], // stdout
            2 => ['pipe', 'w'], // stderr
        ];

        $baseEnv = getenv();
        $childEnv = array_merge(
            is_array($baseEnv) ? $baseEnv : [],
            [
                'APP_ENV' => 'testing',
                'DB_CONNECTION' => 'pgsql_test',
                'DB_TEST_DATABASE' => 'gaza_gateway_test',
            ],
            $customEnv ?? []
        );

        $process = proc_open($cmd, $descriptors, $this->pipes, base_path(), $childEnv);
        if (!is_resource($process)) {
            $this->closePipes();
            throw new RuntimeException('Failed to spawn PassengerProfileConcurrencyWorker subprocess');
        }

        $this->process = $process;

        stream_set_blocking($this->pipes[0], false);
        stream_set_blocking($this->pipes[1], false);
        stream_set_blocking($this->pipes[2], false);

        try {
            $ready = $this->readLine(5.0);
            if (!$ready || !isset($ready['status']) || $ready['status'] !== 'READY' || !isset($ready['pid'])) {
                $this->drainStderrInternal(0.1);
                $this->close();
                throw new RuntimeException('PassengerProfileConcurrencyWorker failed to initialize safely');
            }

            $this->backendPid = (int) $ready['pid'];
        } catch (Throwable $e) {
            try {
                $this->close();
            } catch (Throwable) {
                // Suppress secondary errors during cleanup
            }
            throw $e;
        }
    }

    public function __destruct()
    {
        try {
            $this->close();
        } catch (Throwable) {
            // Destructor cannot throw
        }
    }

    public function getBackendPid(): int
    {
        return $this->backendPid;
    }

    /**
     * @param array<string, mixed> $cmd
     */
    public function sendCommand(array $cmd): void
    {
        if (!isset($this->pipes[0]) || !is_resource($this->pipes[0])) {
            return;
        }

        $payload = json_encode($cmd, JSON_THROW_ON_ERROR) . "\n";
        if (strlen($payload) > self::MAX_PAYLOAD_BYTES) {
            throw new RuntimeException('ConcurrencyWorker command exceeds protocol limit');
        }

        $offset = 0;
        $deadline = microtime(true) + 3.0;
        while ($offset < strlen($payload)) {
            if (microtime(true) >= $deadline) {
                throw new RuntimeException('ConcurrencyWorker command write timed out');
            }
            $written = @fwrite($this->pipes[0], substr($payload, $offset));
            if ($written === false) {
                throw new RuntimeException('ConcurrencyWorker command write failed');
            }
            $offset += $written;
            if ($written === 0) {
                usleep(10000);
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function readLine(float $timeoutSeconds = 5.0): ?array
    {
        if (!isset($this->pipes[1]) || !is_resource($this->pipes[1])) {
            return null;
        }

        $deadline = microtime(true) + max(0.0, $timeoutSeconds);
        $buffer = '';

        while (microtime(true) < $deadline) {
            $read = [];
            if (isset($this->pipes[1]) && is_resource($this->pipes[1])) {
                $read[] = $this->pipes[1];
            }
            if (isset($this->pipes[2]) && is_resource($this->pipes[2])) {
                $read[] = $this->pipes[2];
            }

            if (empty($read)) {
                break;
            }

            $write = null;
            $except = null;
            $changed = stream_select($read, $write, $except, 0, 20000); // 20ms

            if ($changed === false) {
                break;
            }

            if ($changed > 0) {
                // Drain stderr while waiting for stdout
                if (isset($this->pipes[2]) && is_resource($this->pipes[2]) && in_array($this->pipes[2], $read, true)) {
                    $chunk = fread($this->pipes[2], 4096);
                    if ($chunk !== false && $chunk !== '') {
                        $remaining = self::MAX_STDERR_BYTES - strlen($this->stderrBuffer);
                        if ($remaining > 0) {
                            $this->stderrBuffer .= substr($chunk, 0, $remaining);
                        }
                    }
                }

                // Read stdout
                if (isset($this->pipes[1]) && is_resource($this->pipes[1]) && in_array($this->pipes[1], $read, true)) {
                    $chunk = fgets($this->pipes[1], self::MAX_PAYLOAD_BYTES + 1);
                    if ($chunk !== false) {
                        $buffer .= $chunk;
                        if (strlen($buffer) > self::MAX_PAYLOAD_BYTES) {
                            throw new RuntimeException('ConcurrencyWorker response exceeds protocol limit');
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

            // Check if process terminated prematurely
            if ($this->process !== null) {
                $status = proc_get_status($this->process);
                if (!$status['running']) {
                    $this->drainStderrInternal(0.05);
                    if (!isset($this->pipes[1]) || feof($this->pipes[1])) {
                        break;
                    }
                }
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function begin(float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'begin']);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function commit(float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'commit']);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function rollback(float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'rollback']);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function lockPrincipal(string $userId, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'lock_principal', 'userId' => $userId]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function lockSession(string $sessionId, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'lock_session', 'sessionId' => $sessionId]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function lockProfile(string $userId, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'lock_profile', 'userId' => $userId]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function advanceEpoch(string $userId, int $newEpoch = 2, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'advance_epoch', 'userId' => $userId, 'epoch' => $newEpoch]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function revokeSession(string $sessionId, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'revoke_session', 'sessionId' => $sessionId]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function updateProfileFirstName(string $userId, string $firstName, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'update_profile_first_name', 'userId' => $userId, 'firstName' => $firstName]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function setAppKey(string $appKey, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'set_app_key', 'appKey' => $appKey]);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function prepareSession(string $tokenOrCookie, ?string $appKey = null, float $timeoutSeconds = 5.0): ?array
    {
        $cmd = ['action' => 'prepare_session', 'token' => $tokenOrCookie];
        if ($appKey !== null) {
            $cmd['appKey'] = $appKey;
        }
        $this->sendCommand($cmd);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function executeCoordinatorProfileRead(float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'execute_coordinator_profile_read']);
        return $this->readLine($timeoutSeconds);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    public function executeCoordinatorProfileUpdate(array $payload, float $timeoutSeconds = 5.0): ?array
    {
        $this->sendCommand(['action' => 'execute_coordinator_profile_update', 'payload' => $payload]);
        return $this->readLine($timeoutSeconds);
    }

    public function drainStderr(float $timeoutSeconds = 0.05): string
    {
        $this->drainStderrInternal($timeoutSeconds);
        return $this->stderrBuffer;
    }

    private function drainStderrInternal(float $timeoutSeconds = 0.05): void
    {
        if (!isset($this->pipes[2]) || !is_resource($this->pipes[2])) {
            return;
        }

        $deadline = microtime(true) + max(0.0, $timeoutSeconds);
        while (microtime(true) < $deadline && strlen($this->stderrBuffer) < self::MAX_STDERR_BYTES) {
            $read = [$this->pipes[2]];
            $write = null;
            $except = null;
            $changed = stream_select($read, $write, $except, 0, 5000); // 5ms
            if ($changed === false || $changed === 0) {
                break;
            }

            $chunk = fread($this->pipes[2], 4096);
            if ($chunk === false || $chunk === '') {
                break;
            }

            $remaining = self::MAX_STDERR_BYTES - strlen($this->stderrBuffer);
            if ($remaining > 0) {
                $this->stderrBuffer .= substr($chunk, 0, $remaining);
            } else {
                break;
            }
        }
    }

    public function close(): void
    {
        if ($this->process === null) {
            return;
        }

        $process = $this->process;

        // 1. Graceful quit attempt if running
        $status = proc_get_status($process);
        if ($status['running']) {
            try {
                $this->sendCommand(['action' => 'quit']);
                $this->readLine(0.2);
            } catch (Throwable) {
                // Ignore error on graceful quit attempt
            }
        }

        // 2. Escalation: TERM if still running
        $status = proc_get_status($process);
        if ($status['running']) {
            @proc_terminate($process, 15);
            $termDeadline = microtime(true) + 0.5;
            while (microtime(true) < $termDeadline) {
                $status = proc_get_status($process);
                if (!$status['running']) {
                    break;
                }
                usleep(10000); // 10ms
            }

            // 3. Escalation: KILL if still running
            if ($status['running']) {
                @proc_terminate($process, 9);
                $killDeadline = microtime(true) + 0.5;
                while (microtime(true) < $killDeadline) {
                    $status = proc_get_status($process);
                    if (!$status['running']) {
                        break;
                    }
                    usleep(10000); // 10ms
                }
            }
        }

        // 4. After TERM/KILL close pipes
        $this->closePipes();

        // 5. Bounded-confirm exit
        $confirmDeadline = microtime(true) + 0.5;
        $confirmedStopped = false;
        while (microtime(true) < $confirmDeadline) {
            $status = proc_get_status($process);
            if (!$status['running']) {
                $confirmedStopped = true;
                break;
            }
            usleep(10000); // 10ms
        }

        // 6. proc_close ONLY once confirmed stopped, otherwise explicit unknown termination error
        if ($confirmedStopped) {
            @proc_close($process);
            $this->process = null;
        } else {
            $this->process = null;
            throw new RuntimeException('Explicit unknown termination error: ConcurrencyWorker process failed to terminate');
        }
    }

    private function closePipes(): void
    {
        foreach ($this->pipes as $pipe) {
            if (is_resource($pipe)) {
                @fclose($pipe);
            }
        }
        $this->pipes = [];
    }
}
