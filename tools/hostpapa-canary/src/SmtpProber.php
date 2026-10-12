<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Prepares and tests SMTP connectivity at the socket / handshake layer.
 *
 * SAFETY INVARIANT:
 * Strictly avoids sending actual emails until explicit owner authorization
 * and a designated external test recipient are provided.
 */
class SmtpProber
{
    private array $config;
    private Sanitizer $sanitizer;

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(array $config, Sanitizer $sanitizer)
    {
        $this->config = $config;
        $this->sanitizer = $sanitizer;
    }

    /**
     * Probe SMTP socket reachability and TLS negotiation without sending email.
     *
     * @return array<string, mixed>
     */
    public function probe(): array
    {
        $host = trim((string)($this->config['SMTP_HOST'] ?? ''));
        $port = (int)($this->config['SMTP_PORT'] ?? 587);
        $encryption = strtolower((string)($this->config['SMTP_ENCRYPTION'] ?? 'tls'));
        $user = (string)($this->config['SMTP_USER'] ?? '');
        $pass = (string)($this->config['SMTP_PASS'] ?? '');

        if ($user !== '') {
            $this->sanitizer->addSecret($user);
        }
        if ($pass !== '') {
            $this->sanitizer->addSecret($pass);
        }

        if ($host === '') {
            return [
                'probe' => 'smtp_preparation',
                'status' => 'UNVERIFIED',
                'summary' => 'SMTP host not configured. Offline preparation mode active.',
                'can_send_emails' => false,
                'notes' => 'No real sends performed. Ready for owner configuration on cPanel.',
            ];
        }

        $results = [
            'probe' => 'smtp_preparation',
            'status' => 'PENDING',
            'target_host' => $this->sanitizer->sanitizeString($host),
            'target_port' => $port,
            'encryption_mode' => $encryption,
            'can_send_emails' => false,
            'socket_connected' => false,
            'greeting_received' => false,
            'ehlo_accepted' => false,
            'notes' => 'Preparation probe only: MAIL FROM and RCPT TO are suppressed. No real emails transmitted.',
        ];

        try {
            $remoteTarget = ($encryption === 'ssl' || $port === 465)
                ? 'ssl://' . $host . ':' . $port
                : 'tcp://' . $host . ':' . $port;

            $context = stream_context_create([
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                ],
            ]);

            $timeout = 5; // 5 seconds maximum
            $errno = 0;
            $errstr = '';

            $socket = @stream_socket_client(
                $remoteTarget,
                $errno,
                $errstr,
                $timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );

            if (!$socket) {
                $results['status'] = 'FAIL';
                $results['error'] = sprintf(
                    'Socket connection failed: %s (code %d)',
                    $this->sanitizer->sanitizeString($errstr),
                    $errno
                );
                return $results;
            }

            $results['socket_connected'] = true;
            stream_set_timeout($socket, 5);

            // Read initial SMTP banner
            $banner = (string)fgets($socket, 512);
            if (str_starts_with($banner, '220')) {
                $results['greeting_received'] = true;
            }

            // Send EHLO
            fwrite($socket, "EHLO localhost\r\n");
            $ehloResponse = '';
            while ($line = fgets($socket, 512)) {
                $ehloResponse .= $line;
                if (substr($line, 3, 1) === ' ') {
                    break;
                }
            }

            if (str_starts_with($ehloResponse, '250')) {
                $results['ehlo_accepted'] = true;
            }

            // Cleanly close connection with QUIT
            fwrite($socket, "QUIT\r\n");
            fclose($socket);

            $pass = $results['socket_connected'] && $results['greeting_received'] && $results['ehlo_accepted'];
            $results['status'] = $pass ? 'PASS' : 'WARNING';
            $results['summary'] = $pass
                ? 'SMTP socket and handshake succeeded. Real sends remain disabled until owner authorization.'
                : 'SMTP handshake responded with unexpected code.';

        } catch (\Throwable $e) {
            $results['status'] = 'FAIL';
            $results['error'] = $this->sanitizer->sanitizeString($e->getMessage());
        }

        return $results;
    }
}
