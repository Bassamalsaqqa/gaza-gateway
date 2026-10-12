<?php

declare(strict_types=1);

require __DIR__ . '/../../../vendor/autoload.php';
if ((getenv('MVP_BROWSER_GATE_OWNED') !== '1' && getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') || getenv('APP_ENV') !== 'testing') {
    exit(2);
}

$app = require __DIR__ . '/../../../bootstrap/app.php';
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
    'mvp-mail.allowed_hosts' => ['mailpit'],
]);

$ran = app(\App\Mvp\Mail\IdentitySmtpDispatcher::class)->runOne();
echo json_encode(['ran' => $ran], JSON_THROW_ON_ERROR) . "\n";
flush();
