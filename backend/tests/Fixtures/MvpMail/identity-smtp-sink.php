<?php
declare(strict_types=1);

// Disposable, synthetic SMTP acceptance for identity proof verification.
if ((getenv('MVP_BROWSER_GATE_OWNED') !== '1' && getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') || getenv('APP_ENV') !== 'testing') {
    exit(1);
}

$mode = $argv[1] ?? 'accept';
$root = '/tmp/mvp-identity-smtp-sink';
if (!is_dir($root)) {
    mkdir($root, 0700, true);
}

$server = stream_socket_server('tcp://0.0.0.0:1025', $errno, $error);
if (!$server) {
    fwrite(STDERR, "Socket bind failed: {$error}\n");
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
    stream_set_timeout($c, 10);
    fwrite($c, "220 synthetic.local ESMTP\r\n");
    $data = false;
    $bytes = '';

    while (($line = fgets($c, 8192)) !== false) {
        if ($data) {
            if ($line === ".\r\n") {
                if ($mode === 'fail_after_data') {
                    fwrite($c, "451 Temporary local error during transmission\r\n");
                    fclose($c);
                    break;
                }
                $file = $root . '/' . bin2hex(random_bytes(16)) . '.eml';
                file_put_contents($file, $bytes, LOCK_EX);
                chmod($file, 0600);
                $count++;
                fwrite($c, "250 Accepted by synthetic identity sink\r\n");
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
            fwrite($c, "250-synthetic.local\r\n250-PIPELINING\r\n250-8BITMIME\r\n250 HELP\r\n");
        } elseif (str_starts_with($command, 'MAIL')) {
            fwrite($c, "250 OK\r\n");
        } elseif (str_starts_with($command, 'RCPT')) {
            fwrite($c, "250 OK\r\n");
        } elseif (str_starts_with($command, 'DATA')) {
            if ($mode === 'fail_data') {
                fwrite($c, "451 Requested action aborted: local error in processing\r\n");
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
