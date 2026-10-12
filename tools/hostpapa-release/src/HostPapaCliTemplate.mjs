/**
 * Generates hostpapa-cli.php: a private CLI wrapper that loads the active release
 * with shared .env and storage bindings for bounded cron, migrations, and CLI management.
 */
export function generateHostPapaCli() {
  return `<?php
/**
 * Gaza Airport / Palestinian Airlines
 * HostPapa Shared Hosting CLI Command Runner (P8 & Defect 7)
 *
 * Provides a unified, safe CLI runner for cPanel cron and owner management.
 * Rebinds shared storage and shared .env before invoking Laravel Console Kernel.
 * Migrations are strictly restricted to the approved installer.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "[ERROR] CLI execution only.\\n");
    exit(1);
}

try {
    // Defect 7: Remove migrate from direct allowlist; migrations must only be run by the approved installer
    $allowedCommands = [
        'shared-hosting:cron',
        'hostpapa:bootstrap-owner',
        'platform:check',
        'about',
        'help',
        'list',
    ];

    $allowedOptionsPerCommand = [
        'shared-hosting:cron' => ['--max-seconds', '--batch-limit', '--quiet', '-q', '--no-interaction', '-n', '--help', '-h'],
        'hostpapa:bootstrap-owner' => ['--no-interaction', '-n', '--help', '-h', '--quiet', '-q'],
        'platform:check' => ['--no-interaction', '-n', '--help', '-h'],
        'about' => ['--no-interaction', '-n', '--help', '-h', '--json'],
        'help' => ['--help', '-h', '--raw', '--format'],
        'list' => ['--raw', '--format', '--help', '-h'],
    ];

    $home = getenv('HOSTPAPA_HOME') ?: getenv('HOME');
    if (!$home) {
        $home = dirname(__DIR__, 2);
    }
    $cursor = $home;
    while ($cursor !== '' && dirname($cursor) !== $cursor) { if (is_link($cursor)) throw new \RuntimeException('Invalid HOME path.'); $cursor = dirname($cursor); }
    $realHome = realpath($home);
    if (!$realHome || !is_dir($realHome) || is_link($realHome)) {
        fwrite(STDERR, "[ERROR] HOME directory unconfigured or invalid.\\n");
        exit(1);
    }

    $appDir = getenv('GAZA_GATEWAY_APP_DIR') ?: ($realHome . DIRECTORY_SEPARATOR . 'gaza-gateway');
    $cursor = $appDir;
    while ($cursor !== '' && dirname($cursor) !== $cursor) { if (is_link($cursor)) throw new \RuntimeException('Invalid application path.'); $cursor = dirname($cursor); }
    $realAppDir = realpath($appDir);
    if (!$realAppDir || !is_dir($realAppDir) || is_link($realAppDir)) {
        fwrite(STDERR, "[ERROR] Gaza Gateway application directory not found.\\n");
        exit(1);
    }

    // Defect 7: Assert no symlinks in ancestors
    $assertNoSymlinks = static function (string $targetPath): void {
        $cursor = $targetPath;
        while ($cursor !== '' && dirname($cursor) !== $cursor) {
            if (is_link($cursor)) {
                fwrite(STDERR, "[ERROR] Symlink detected in path hierarchy.\\n");
                exit(1);
            }
            $cursor = dirname($cursor);
        }
    };
    $assertNoSymlinks($realAppDir);
    if (!str_starts_with($realAppDir, $realHome . DIRECTORY_SEPARATOR)) throw new \RuntimeException('Application must be private within HOME.');

    $pointerFile = $realAppDir . DIRECTORY_SEPARATOR . 'current-release.txt';
    if (!file_exists($pointerFile) || is_link($pointerFile)) {
        fwrite(STDERR, "[ERROR] Active release pointer current-release.txt not found or invalid.\\n");
        exit(1);
    }

    $releaseId = trim((string) file_get_contents($pointerFile));
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $releaseId)) {
        fwrite(STDERR, "[ERROR] Invalid release ID in pointer file.\\n");
        exit(1);
    }

    $releasePath = $realAppDir . DIRECTORY_SEPARATOR . 'releases' . DIRECTORY_SEPARATOR . $releaseId;
    $assertNoSymlinks($releasePath);
    $realReleasePath = realpath($releasePath);
    if (!$realReleasePath || !is_dir($realReleasePath) || is_link($realReleasePath)) {
        fwrite(STDERR, "[ERROR] Active release directory does not exist.\\n");
        exit(1);
    }
    $assertNoSymlinks($realReleasePath);

    // Verify input command against allowlist
    $argvArgs = array_slice($argv, 1);
    $commandName = $argvArgs[0] ?? 'list';

    if ($commandName === 'migrate') {
        fwrite(STDERR, "[ERROR] Direct migrate execution is prohibited. Migrations must only be run through the approved installer.\\n");
        exit(1);
    }

    if (!in_array($commandName, $allowedCommands, true)) {
        fwrite(STDERR, "[ERROR] Command '{$commandName}' is not in the HostPapa CLI allowlist.\\n");
        fwrite(STDERR, "Allowed commands: " . implode(', ', $allowedCommands) . "\\n");
        exit(1);
    }

    // Defect 7: Restrict arguments per command (strictly reject --path, --database, etc.)
    $allowedOpts = $allowedOptionsPerCommand[$commandName] ?? [];
    foreach (array_slice($argvArgs, 1) as $arg) {
        if (!str_starts_with($arg, '-')) throw new \RuntimeException('Positional arguments are forbidden.');
        if (str_starts_with($arg, '--max-seconds=') && !preg_match('/^--max-seconds=(?:[1-9]|1[0-9]|2[0-5])$/D', $arg)) throw new \RuntimeException('Invalid deadline.');
        if (str_starts_with($arg, '--batch-limit=') && !preg_match('/^--batch-limit=(?:[1-9]|[1-4][0-9]|50)$/D', $arg)) throw new \RuntimeException('Invalid batch limit.');
        if (str_starts_with($arg, '-')) {
            $optName = explode('=', $arg, 2)[0];
            if (!in_array($optName, $allowedOpts, true)) {
                fwrite(STDERR, "[ERROR] Unauthorized option '{$optName}' for command '{$commandName}'.\\n");
                exit(1);
            }
        }
    }

    // Defect 7: Mandatory shared storage and shared .env (reject missing shared configuration)
    $sharedStorage = $realAppDir . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'storage';
    $sharedConfig = $realAppDir . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'config';
    $sharedEnv = $sharedConfig . DIRECTORY_SEPARATOR . '.env';

    if (!is_dir($sharedStorage) || is_link($sharedStorage)) {
        fwrite(STDERR, "[ERROR] Shared storage directory is missing or invalid.\\n");
        exit(1);
    }
    if (!file_exists($sharedEnv) || is_link($sharedEnv)) {
        fwrite(STDERR, "[ERROR] Shared configuration .env is missing or invalid.\\n");
        exit(1);
    }
    $assertNoSymlinks($sharedStorage);
    $assertNoSymlinks($sharedConfig);
    if (!is_file($sharedEnv) || (fileperms($sharedEnv) & 0777) !== 0600 || filesize($sharedEnv) > 16384) throw new \RuntimeException('Private environment mode/size invalid.');

    // Resolve isolated backend directory
    $backendDir = is_dir($realReleasePath . DIRECTORY_SEPARATOR . 'backend')
        ? $realReleasePath . DIRECTORY_SEPARATOR . 'backend'
        : $realReleasePath;

    $autoloader = $backendDir . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    $appBootstrap = $backendDir . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';

    if (!file_exists($autoloader) || !file_exists($appBootstrap)) {
        fwrite(STDERR, "[ERROR] Release bootstrap files missing.\\n");
        exit(1);
    }

    // Bootstrap private release
    require_once $autoloader;

    /** @var \\Illuminate\\Foundation\\Application $app */
    $app = require_once $appBootstrap;

    // Bind shared storage and env
    $app->useStoragePath($sharedStorage);
    $app->useEnvironmentPath($sharedConfig);
    $app->loadEnvironmentFrom('.env');

    /** @var \\Illuminate\\Contracts\\Console\\Kernel $kernel */
    $kernel = $app->make(\\Illuminate\\Contracts\\Console\\Kernel::class);

    $input = new \\Symfony\\Component\\Console\\Input\\ArgvInput($argv);
    $output = new \\Symfony\\Component\\Console\\Output\\BufferedOutput();

    $status = $kernel->handle($input, $output);
    $kernel->terminate($input, $status);

    if ($status !== 0) fwrite(STDERR, "[ERROR] Command failed. Inspect the private sanitized application log.\n");
    else echo $output->fetch();
    exit($status);
} catch (\\Throwable $e) {
    // Defect 7: Fixed-safe error message without echoing credentials, DSNs, or traces
    fwrite(STDERR, "[ERROR] Command execution failed due to an unexpected execution error.\\n");
    exit(1);
}
`;
}
