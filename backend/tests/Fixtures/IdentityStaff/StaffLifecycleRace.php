<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityStaff;

/** Fixed worker, direct argv, bounded stdin/stdout, finite exit and no arbitrary SQL. */
final class StaffLifecycleRace
{
    public static function run(array $inputs): array
    {
        if (count($inputs) !== 2) { throw new \InvalidArgumentException('Exactly two race inputs required.'); }
        $processes = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open([PHP_BINARY, __DIR__ . '/staff-lifecycle-worker.php'],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__, 3));
                if (!is_resource($process)) { throw new \RuntimeException('Staff lifecycle worker unavailable.'); }
                $processes[] = [$process, $pipes];
                stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
                $bytes = json_encode($input, JSON_THROW_ON_ERROR) . "\n";
                if (strlen($bytes) > 16384 || fwrite($pipes[0], $bytes) !== strlen($bytes) || !fflush($pipes[0])) {
                    throw new \RuntimeException('Staff lifecycle worker input failed.');
                }
            }
            foreach ($processes as [$process, $pipes]) {
                if (self::line($process, $pipes[1]) !== 'READY') { throw new \RuntimeException('Staff lifecycle guard did not admit worker.'); }
            }
            foreach ($processes as [$process, $pipes]) {
                if (fwrite($pipes[0], "GO\n") !== 3 || !fflush($pipes[0])) { throw new \RuntimeException('Staff race release failed.'); }
            }
            $results = [];
            foreach ($processes as [$process, $pipes]) { $results[] = self::line($process, $pipes[1]); }
            sort($results); return $results;
        } finally {
            foreach ($processes as [$process, $pipes]) {
                foreach ($pipes as $pipe) { if (is_resource($pipe)) { fclose($pipe); } }
                $deadline = microtime(true) + 2;
                while (proc_get_status($process)['running'] && microtime(true) < $deadline) { usleep(10000); }
                if (proc_get_status($process)['running']) { proc_terminate($process); usleep(100000); }
                if (proc_get_status($process)['running']) { proc_terminate($process, 9); usleep(100000); }
                if (proc_get_status($process)['running']) { throw new \RuntimeException('Staff race worker termination failed.'); }
                proc_close($process);
            }
        }
    }

    private static function line($process, $pipe): string
    {
        $deadline = microtime(true) + 10; $buffer = '';
        do {
            $chunk = fread($pipe, 1024); if ($chunk !== false) { $buffer .= $chunk; }
            if (strlen($buffer) > 4096) { throw new \RuntimeException('Staff race output bound exceeded.'); }
            if (str_contains($buffer, "\n")) { return trim(explode("\n", $buffer, 2)[0]); }
            if (!proc_get_status($process)['running']) { break; }
            usleep(10000);
        } while (microtime(true) < $deadline);
        throw new \RuntimeException('Staff race output deadline or child failure.');
    }
}
