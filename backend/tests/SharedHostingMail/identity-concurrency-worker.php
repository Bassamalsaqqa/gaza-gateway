<?php

declare(strict_types=1);

// Concurrency worker subprocess for testing overlap / SKIP LOCKED
require __DIR__ . '/../../vendor/autoload.php';

$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "READY\n";
flush();

stream_set_timeout(STDIN, 15);
$line = trim((string) fgets(STDIN, 16));
if ($line !== 'GO') {
    exit(2);
}

config([
    'mvp-mail.enabled' => true,
    'mvp-mail.identity_smtp_enabled' => true,
    'mvp-mail.allowed_hosts' => ['127.0.0.1', 'localhost', 'mailpit'],
]);

$ran = app(\App\Mvp\Mail\IdentitySmtpDispatcher::class)->runOne();
echo json_encode(['ran' => $ran], JSON_THROW_ON_ERROR) . "\n";
flush();
