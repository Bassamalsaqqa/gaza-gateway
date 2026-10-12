<?php

declare(strict_types=1);

// Disposable synthetic SMTP sink for SharedHostingMail tests.
// Modes:
// - accept: normal RFC-compliant SMTP exchange, saves .eml
// - fail_data: rejects DATA command with 451
// - fail_after_data: receives DATA then aborts before 250 OK (ambiguous / uncertain)
// - slow: delays 2 seconds before accepting (allows concurrent writer verification)
// - hang: accepts TCP connection and sleeps without responding (tests hard wall bound <= 8s)
// - stall_quit: accepts DATA with 250 OK, then stalls 15 seconds on QUIT (tests nonblocking shutdown)

$mode = $argv[1] ?? 'accept';
$port = isset($argv[2]) ? (int) $argv[2] : 1025;
$root = sys_get_temp_dir() . '/shared-hosting-mail-sink';

if (!is_dir($root)) {
    mkdir($root, 0700, true);
}

$context = stream_context_create([
    'socket' => [
        'so_reuseaddr' => true,
        'so_reuseport' => true,
    ],
]);

$server = @stream_socket_server("tcp://0.0.0.0:{$port}", $errno, $error, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $context);
if (!$server) {
    fwrite(STDERR, "Socket bind failed on port {$port}: {$error}\n");
    exit(1);
}

fwrite(STDOUT, "READY\n");
fflush(STDOUT);

$deadline = microtime(true) + 60;
$count = 0;

while (microtime(true) < $deadline && $count < 50) {
    $c = @stream_socket_accept($server, 1);
    if (!$c) {
        continue;
    }

    if ($mode === 'hang') {
        // Sleep on connected socket to test client wall timeout
        sleep(15);
        @fclose($c);
        continue;
    }

    stream_set_timeout($c, 10);
    fwrite($c, "220 synthetic.hostpapa.local ESMTP\r\n");
    $data = false;
    $bytes = '';

    while (($line = fgets($c, 8192)) !== false) {
        if ($data) {
            if ($line === ".\r\n") {
                if ($mode === 'fail_after_data') {
                    fwrite($c, "451 Transmission aborted after DATA\r\n");
                    fclose($c);
                    break;
                }

                if ($mode === 'slow') {
                    usleep(1500000); // 1.5 seconds delay
                }

                $file = $root . '/' . bin2hex(random_bytes(16)) . '.eml';
                file_put_contents($file, $bytes, LOCK_EX);
                chmod($file, 0600);
                $count++;
                fwrite($c, "250 Accepted by synthetic sink\r\n");
                $data = false;
                continue;
            }
            $bytes .= $line;
            if (strlen($bytes) > 131072) {
                break;
            }
            continue;
        }

        $command = strtoupper(strtok($line, ' '));
        if (str_starts_with($command, 'EHLO') || str_starts_with($command, 'HELO')) {
            fwrite($c, "250-synthetic.hostpapa.local\r\n250-PIPELINING\r\n250-8BITMIME\r\n250 HELP\r\n");
        } elseif (str_starts_with($command, 'MAIL')) {
            fwrite($c, "250 OK\r\n");
        } elseif (str_starts_with($command, 'RCPT')) {
            fwrite($c, "250 OK\r\n");
        } elseif (str_starts_with($command, 'DATA')) {
            if ($mode === 'fail_data') {
                fwrite($c, "451 Requested action aborted: temporary local error\r\n");
                fclose($c);
                break;
            }
            $data = true;
            $bytes = '';
            fwrite($c, "354 End with dot\r\n");
        } elseif (str_starts_with($command, 'RSET')) {
            $data = false;
            $bytes = '';
            fwrite($c, "250 OK\r\n");
        } elseif (str_starts_with($command, 'QUIT')) {
            if ($mode === 'stall_quit') {
                sleep(15);
            }
            fwrite($c, "221 Bye\r\n");
            fclose($c);
            break;
        } else {
            fwrite($c, "250 OK\r\n");
        }
    }

    if (is_resource($c)) {
        fclose($c);
    }
}

fclose($server);
