<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
set_error_handler(static function (): never { throw new RuntimeException('Private file/runtime operation failed.'); });

/** Private CLI installer: verifies owner-bound bytes, boots the real profile, migrates UP,
 * then switches static files and the code pointer. No SSH, Composer or npm is needed on hosting.
 * MySQL DDL is not transactional; rollback restores files/code, never drops database data. */
final class HostPapaInstaller
{
    private array $options = [];
    private array $approval = [];
    private string $home;
    private string $app;
    private string $web;
    private string $package;

    public function __construct(array $argv)
    {
        foreach (array_slice($argv, 1) as $arg) {
            if ($arg === '--help') {
                echo "Private HostPapa installer: --action=verify|install|migrate|rollback --package-dir=/private/package\n";
                echo "Mutations require --approval-file=/private/0600.json; rollback also requires --confirm-rollback.\n";
                exit(0);
            }
            if ($arg === '--confirm-rollback') { $this->options['confirm-rollback'] = true; continue; }
            if (!preg_match('/^--(action|package-dir|approval-file|runtime-env|release|to-release)=(.+)$/D', $arg, $m)
                || isset($this->options[$m[1]])) {
                throw new RuntimeException('Invalid or duplicate installer option.');
            }
            $this->options[$m[1]] = $m[2];
        }
    }

    public function run(): void
    {
        if (PHP_SAPI !== 'cli' || PHP_VERSION_ID < 80400) throw new RuntimeException('PHP 8.4+ CLI is required.');
        $action = $this->options['action'] ?? 'verify';
        if (!in_array($action, ['verify', 'install', 'migrate', 'rollback'], true)) throw new RuntimeException('Unsupported action.');
        $home = getenv('HOSTPAPA_HOME') ?: getenv('HOME');
        if (!$home || !is_dir($home)) throw new RuntimeException('Private HOME is required.');
        $this->safeAbsolute($home);
        $this->home = rtrim($home, '/');
        if ($action === 'verify') {
            $this->package = $this->privatePath($this->options['package-dir'] ?? '');
            $this->verifyPackage($this->package);
            echo "PASS: exact package file inventory and SHA-256 checksums. This is not acceptance or deployment.\n";
            return;
        }
        $raw = $this->readPrivate($this->options['approval-file'] ?? '', 32768);
        $a = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        $this->closed($a, ['schema_version', 'action', 'release_id', 'source_sha', 'manifest_sha256', 'environment', 'target_webroot', 'app_dir', 'database', 'runtime_env_file']);
        if (($a['schema_version'] ?? null) !== '1.0' || ($a['action'] ?? null) !== $action
            || !in_array($a['environment'] ?? null, ['staging', 'production'], true)
            || !is_string($a['release_id'] ?? null) || !preg_match('/^[A-Za-z0-9_]{1,128}$/D', $a['release_id'])
            || !is_string($a['source_sha'] ?? null) || !preg_match('/^[a-f0-9]{40}$/D', $a['source_sha'])
            || !is_string($a['manifest_sha256'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $a['manifest_sha256'])) {
            throw new RuntimeException('Approval binding is invalid.');
        }
        if (isset($this->options['release']) && $this->options['release'] !== $a['release_id']) throw new RuntimeException('CLI release differs from approval.');
        $this->approval = $a;
        $this->app = $this->privatePath($a['app_dir'] ?? '');
        $this->web = $this->insideHome($a['target_webroot'] ?? '');
        if ($this->overlap($this->app, $this->web)) throw new RuntimeException('Private application and webroot overlap.');
        $lockPath = $this->app . '/shared/installer.lock';
        $this->directory(dirname($lockPath));
        $this->safeAbsolute($lockPath);
        $lock = fopen($lockPath, 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException('Another installer is active.');
        chmod($lockPath, 0600);
        try {
            $this->database($a['database'] ?? null);
            if ($action === 'rollback') { $this->rollback(); return; }
            $this->package = $this->privatePath($this->options['package-dir'] ?? '');
            $manifest = $this->verifyPackage($this->package);
            if ($manifest['release_id'] !== $a['release_id'] || $manifest['source_sha'] !== $a['source_sha']
                || hash_file('sha256', $this->package . '/release-manifest.json') !== $a['manifest_sha256']) {
                throw new RuntimeException('Package differs from owner approval.');
            }
            if ($manifest['classification'] !== 'UNREVIEWED_RELEASE_CANDIDATE' || $manifest['is_dirty'] !== false) {
                throw new RuntimeException('Hosting install requires a clean exact-source candidate and explicit owner approval.');
            }
            $this->installOrMigrate($action, $manifest);
        } finally {
            flock($lock, LOCK_UN); fclose($lock);
        }
    }

    private function installOrMigrate(string $action, array $manifest): void
    {
        $release = $this->app . '/releases/' . $manifest['release_id'];
        $this->safeAbsolute($release);
        $shared = $this->app . '/shared';
        foreach (['config', 'storage/app/private', 'storage/framework/cache/data', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs', 'backups'] as $dir) {
            $this->directory($shared . '/' . $dir);
        }
        $env = $shared . '/config/.env';
        if (!file_exists($env)) {
            $input = $this->options['runtime-env'] ?? $this->approval['runtime_env_file'] ?? '';
            $this->write($env, $this->readPrivate($input, 16384), 0600);
        }
        $this->readPrivate($env, 16384);
        if (!is_dir($release)) {
            if ($action !== 'install') throw new RuntimeException('Approved release has not been staged.');
            $this->directory($release);
            $this->copyTree($this->package . '/private', $release);
            $this->write($release . '/release-manifest.json', file_get_contents($this->package . '/release-manifest.json'));
        } else {
            // A failed migration may be resumed, but staged code must still be exactly the approved bytes.
            foreach ($manifest['private_files'] as $name => $entry) {
                $this->safeAbsolute($release . '/' . $name);
                if (!is_file($release . '/' . $name) || hash_file('sha256', $release . '/' . $name) !== $entry['sha256']) {
                    throw new RuntimeException('Staged private release differs from approved package.');
                }
            }
        }
        $this->runRelease($release, false);
        echo "PASS: bundled deployment profile and exact runtime database.\n";
        echo "NOTICE: migration UP uses MySQL DDL autocommit. Restore an approved backup after an incompatible schema change; code rollback does not undo DDL.\n";
        $this->runRelease($release, true);
        echo "PASS: approved migration UP completed.\n";
        if ($action === 'migrate') return;
        $this->switchFiles($release, $manifest['release_id']);
        echo "PASS: release installed. No provider delivery or online acceptance is implied.\n";
    }

    /** Separate process bounds bootstrap/migrations and prevents framework error output revealing secrets. */
    private function runRelease(string $release, bool $migrate): void
    {
        $approvalFile = $this->options['approval-file'];
        $script = <<<'PHP'
set_time_limit(90);
if (!function_exists('pcntl_alarm')) exit(2);
pcntl_async_signals(true);
pcntl_signal(SIGALRM, static function (): void { exit(3); });
pcntl_alarm(85);
try {
    $a = json_decode(file_get_contents($argv[1]), true, 32, JSON_THROW_ON_ERROR);
    $release = $argv[2]; $mode = $argv[3];
    require $release . '/backend/vendor/autoload.php';
    $app = require $release . '/backend/bootstrap/app.php';
    $shared = dirname(dirname($release)) . '/shared';
    $app->useStoragePath($shared . '/storage');
    $app->useEnvironmentPath($shared . '/config'); $app->loadEnvironmentFrom('.env');
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class); $kernel->bootstrap();
    if ($app->environment() !== $a['environment'] || $app['config']->get('foundation-services.shared_hosting_enabled') !== true) exit(4);
    \App\Support\ConfigurationValidator::validate($app['config']->all(), $app->environment());
    \App\SharedHosting\SharedHostingProfile::validateDeploymentProfile($app['config']->all(), $app->environment());
    $runtime = (new \Illuminate\Support\ConfigurationUrlParser())->parseConfiguration($app['config']->get('database.connections.mysql'));
    $db = $a['database'];
    if ($runtime['database'] !== $db['database'] || $runtime['username'] === $db['username']
        || !in_array($runtime['host'], ['localhost', '127.0.0.1'], true)) exit(5);
    $connection = $app['db']->connection('mysql');
    if ($connection->selectOne('SELECT DATABASE() AS name')->name !== $db['database']) exit(6);
    if ($mode === 'migrate') {
        $runtime['url'] = null; $runtime['host'] = $db['host']; $runtime['port'] = $db['port'];
        $runtime['database'] = $db['database']; $runtime['username'] = $db['username']; $runtime['password'] = $db['password'];
        $runtime['unix_socket'] = '';
        $app['config']->set('database.connections.mysql', $runtime); $app['db']->purge('mysql');
        if ($app['db']->connection('mysql')->selectOne('SELECT DATABASE() AS name')->name !== $db['database']) exit(7);
        $status = $kernel->call('migrate', ['--force' => true, '--no-interaction' => true], new \Symfony\Component\Console\Output\NullOutput());
        if ($status !== 0) exit(8);
    }
    pcntl_alarm(0); echo "PASS\n";
} catch (\Throwable) { exit(9); }
PHP;
        $process = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-r', $script, $approvalFile, $release, $migrate ? 'migrate' : 'validate'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Release subprocess failed to start.');
        fclose($pipes[0]); stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
        $out = ''; $err = ''; $exit = -1; $deadline = microtime(true) + 90;
        try {
            do {
                $out .= stream_get_contents($pipes[1]) ?: ''; $err .= stream_get_contents($pipes[2]) ?: '';
                if (strlen($out) + strlen($err) > 16384) break;
                $state = proc_get_status($process);
                if (!$state['running']) { $exit = $state['exitcode']; break; }
                usleep(20000);
            } while (microtime(true) < $deadline);
        } finally {
            if (proc_get_status($process)['running']) proc_terminate($process, 9);
            fclose($pipes[1]); fclose($pipes[2]); proc_close($process);
        }
        if ($exit !== 0 || trim($out) !== 'PASS') throw new RuntimeException('Bundled profile/database/migration check failed. Public files and pointer are unchanged.');
    }

    /** Copies only application-owned names; backs up each prior byte before mutation.
     * On any copy failure, removes newly added application files and restores previous bytes. */
    private function switchFiles(string $release, string $id): void
    {
        $snapshot = $release . '/public_snapshot';
        $target = $this->scan($snapshot);
        $pointer = $this->app . '/current-release.txt';
        $this->safeAbsolute($pointer);
        $previous = is_file($pointer) ? trim(file_get_contents($pointer)) : null;
        if ($previous !== null && !preg_match('/^[A-Za-z0-9_]{1,128}$/D', $previous)) throw new RuntimeException('Invalid prior pointer.');
        $priorFiles = $previous !== null ? $this->scan($this->app . '/releases/' . $previous . '/public_snapshot') : [];
        $names = array_unique(array_merge($target, $priorFiles));
        sort($names, SORT_STRING);
        $backup = $this->app . '/shared/backups/static_' . bin2hex(random_bytes(8));
        $this->directory($backup);
        $ledger = [];
        foreach ($names as $name) {
            $dest = $this->web . '/' . $name; $this->safeAbsolute($dest);
            if (file_exists($dest) && !is_file($dest)) throw new RuntimeException('Public target is not a regular file.');
            $ledger[$name] = is_file($dest);
            if ($ledger[$name]) $this->copyFile($dest, $backup . '/' . $name);
        }
        $this->write($backup . '/restore.json', json_encode(['previous_pointer' => $previous, 'files' => $ledger], JSON_THROW_ON_ERROR), 0600);
        $maintenance = $this->app . '/shared/storage/framework/maintenance.php';
        $this->write($maintenance, "<?php http_response_code(503); header('Content-Type: application/json'); header('Cache-Control: no-store'); echo json_encode(['success'=>false,'error'=>['code'=>'service_unavailable','message'=>'Maintenance in progress.'],'meta'=>['requestId'=>sprintf('%s-%s-4%s-8%s-%s',bin2hex(random_bytes(4)),bin2hex(random_bytes(2)),substr(bin2hex(random_bytes(2)),1),substr(bin2hex(random_bytes(2)),1),bin2hex(random_bytes(6))),'timestamp'=>gmdate('Y-m-d\\TH:i:s\\Z')]]); exit;\n");
        try {
            foreach ($names as $name) {
                $src = $snapshot . '/' . $name; $dest = $this->web . '/' . $name;
                if (is_file($src)) $this->copyFile($src, $dest, 0644);
                elseif (is_file($dest) && !unlink($dest)) throw new RuntimeException('Obsolete application file could not be removed.');
            }
            $oldHt = $backup . '/.htaccess';
            if (is_file($oldHt)) {
                $old = file_get_contents($oldHt);
                preg_match_all('/^\s*(?:AuthType|AuthName|AuthUserFile|AuthGroupFile|Require)\s+[^\r\n]+/mi', $old, $matches);
                // Preserve only inherited cPanel authentication directives, never old SPA rewrites.
                $auth = implode("\n", array_filter($matches[0], static fn ($line) => !preg_match('/Require\s+all\s+(?:granted|denied)/i', $line)));
                if ($auth !== '') $this->write($this->web . '/.htaccess', $auth . "\n" . file_get_contents($this->web . '/.htaccess'), 0644);
            }
            $this->write($pointer . '.next', $id . "\n", 0600);
            if (!rename($pointer . '.next', $pointer)) throw new RuntimeException('Pointer switch failed.');
            unlink($maintenance);
        } catch (Throwable $e) {
            $restored = true;
            foreach ($ledger as $name => $existed) {
                try {
                    $dest = $this->web . '/' . $name;
                    if ($existed) $this->copyFile($backup . '/' . $name, $dest, 0644);
                    elseif (is_file($dest) && !unlink($dest)) $restored = false;
                } catch (Throwable) { $restored = false; }
            }
            try {
                if ($previous !== null) {
                    $this->write($pointer . '.restore', $previous . "\n", 0600);
                    if (!rename($pointer . '.restore', $pointer)) $restored = false;
                } elseif (is_file($pointer) && !unlink($pointer)) $restored = false;
            } catch (Throwable) { $restored = false; }
            if ($restored) unlink($maintenance);
            throw new RuntimeException($restored ? 'Static switch failed; previous files restored. Private backup retained.' : 'Static restoration incomplete; maintenance retained. Owner recovery required.');
        }
        echo "Private pre-switch static backup retained: " . basename($backup) . "\n";
    }

    private function rollback(): void
    {
        if (!($this->options['confirm-rollback'] ?? false)) throw new RuntimeException('Rollback confirmation required.');
        $id = $this->approval['release_id'];
        if (isset($this->options['to-release']) && $this->options['to-release'] !== $id) throw new RuntimeException('Rollback target differs from approval.');
        $release = $this->app . '/releases/' . $id;
        $this->safeAbsolute($release);
        $manifestPath = $release . '/release-manifest.json';
        if (!is_file($manifestPath) || hash_file('sha256', $manifestPath) !== $this->approval['manifest_sha256']) throw new RuntimeException('Rollback manifest differs from approval.');
        $manifest = json_decode(file_get_contents($manifestPath), true, 64, JSON_THROW_ON_ERROR);
        if ($manifest['source_sha'] !== $this->approval['source_sha'] || $manifest['release_id'] !== $id) throw new RuntimeException('Rollback source binding failed.');
        foreach ($manifest['public_files'] as $name => $entry) {
            $this->relative($name); $file = $release . '/public_snapshot/' . $name; $this->safeAbsolute($file);
            if (!is_file($file) || hash_file('sha256', $file) !== $entry['sha256']) throw new RuntimeException('Rollback snapshot is corrupt.');
        }
        $this->runRelease($release, false);
        $this->switchFiles($release, $id);
        echo "PASS: code/static rollback. Database, private config and shared storage retained.\n";
    }

    private function verifyPackage(string $root): array
    {
        $this->safeAbsolute($root);
        $manifest = json_decode(file_get_contents($root . '/release-manifest.json'), true, 64, JSON_THROW_ON_ERROR);
        $this->closed($manifest, ['schema_version','release_id','source_sha','built_at','is_dirty','classification','platform_requirements','summary','control_files','installer','public_files','private_files']);
        $this->closed($manifest['platform_requirements'], ['php','laravel','locked_production_packages_count']);
        $this->closed($manifest['summary'], ['public_file_count','public_bytes','private_file_count','private_bytes','control_file_count']);
        if (!in_array($manifest['classification'], ['ENGINEERING_TEST_BUILD','UNREVIEWED_RELEASE_CANDIDATE'], true)) throw new RuntimeException('Invalid manifest classification.');
        if ($manifest['schema_version'] !== '1.0' || !is_bool($manifest['is_dirty'])
            || !preg_match('/^[A-Za-z0-9_]{1,128}$/D', $manifest['release_id'])
            || !preg_match('/^[a-f0-9]{40}$/D', $manifest['source_sha'])) throw new RuntimeException('Invalid manifest identity.');
        $expected = ['release-manifest.json'];
        $maps = ['public_files' => 'public/', 'private_files' => 'private/', 'installer' => '', 'control_files' => ''];
        foreach ($maps as $map => $prefix) {
            if (!is_array($manifest[$map]) || $manifest[$map] === []) throw new RuntimeException('Missing manifest map.');
            foreach ($manifest[$map] as $name => $entry) {
                $this->relative($name); $this->closed($entry, ['size','sha256']);
                if (!is_int($entry['size']) || $entry['size'] < 0 || !preg_match('/^[a-f0-9]{64}$/D', $entry['sha256'])) throw new RuntimeException('Invalid file entry.');
                $relative = $prefix . $name; $expected[] = $relative;
                $file = $root . '/' . $relative; $this->safeAbsolute($file);
                if (!is_file($file) || filesize($file) !== $entry['size'] || hash_file('sha256', $file) !== $entry['sha256']) throw new RuntimeException('Package file integrity failed.');
            }
        }
        $controls = array_keys($manifest['control_files']); sort($controls);
        $fixed = ['SOURCE_COMMIT.txt','RELEASE_ID.txt','STATUS.txt','manifest-public.txt','manifest-private.txt']; sort($fixed);
        if ($controls !== $fixed || array_keys($manifest['installer']) !== ['installer/hostpapa-install.php']) throw new RuntimeException('Invalid control inventory.');
        if (hash_file('sha256', __FILE__) !== $manifest['installer']['installer/hostpapa-install.php']['sha256']) throw new RuntimeException('Running installer differs from package.');
        sort($expected); $disk = $this->scan($root); sort($disk);
        if ($expected !== $disk || trim(file_get_contents($root . '/SOURCE_COMMIT.txt')) !== $manifest['source_sha']
            || trim(file_get_contents($root . '/RELEASE_ID.txt')) !== $manifest['release_id']
            || trim(file_get_contents($root . '/STATUS.txt')) !== $manifest['classification']) throw new RuntimeException('Package inventory/control binding failed.');
        return $manifest;
    }

    private function database(mixed $db): void
    {
        $this->closed($db, ['host','port','database','username','password']);
        if (!in_array($db['host'], ['127.0.0.1','localhost'], true) || !is_int($db['port']) || $db['port'] < 1 || $db['port'] > 65535
            || !is_string($db['database']) || !preg_match('/^[A-Za-z0-9_]{1,64}$/D', $db['database'])
            || !is_string($db['username']) || !preg_match('/^[A-Za-z0-9_]{1,64}$/D', $db['username'])
            || !is_string($db['password']) || $db['password'] === '') throw new RuntimeException('Invalid loopback database binding.');
    }
    private function closed(mixed $data, array $keys): void
    {
        if (!is_array($data) || array_is_list($data)) throw new RuntimeException('Expected closed object.');
        $actual = array_keys($data); sort($actual); sort($keys);
        if ($actual !== $keys) throw new RuntimeException('Unexpected or missing field.');
    }
    private function relative(string $path): void
    {
        if ($path === '' || preg_match('#[\\\\:\x00-\x1f\x7f]|^/|/$|//|(?:^|/)\.{1,2}(?:/|$)#', $path)) throw new RuntimeException('Noncanonical relative path.');
    }
    private function safeAbsolute(string $path): void
    {
        if (!str_starts_with($path, '/') || preg_match('#[\\\\\x00-\x1f\x7f]|//|(?:^|/)\.{1,2}(?:/|$)#', $path)) throw new RuntimeException('Noncanonical absolute path.');
        $cursor = $path;
        while ($cursor !== '/' && $cursor !== '') { if (is_link($cursor)) throw new RuntimeException('Symlink ancestor rejected.'); $cursor = dirname($cursor); }
    }
    private function insideHome(string $path): string
    {
        $this->safeAbsolute($path); $path = rtrim($path, '/');
        if (!str_starts_with($path, $this->home . '/')) throw new RuntimeException('Path must be strictly inside HOME.');
        return $path;
    }
    private function privatePath(string $path): string
    {
        $path = $this->insideHome($path);
        if (preg_match('#/(?:public_html|public)(?:/|$)#i', $path)) throw new RuntimeException('Private file is inside webroot.');
        return $path;
    }
    private function readPrivate(string $path, int $limit): string
    {
        $this->privatePath($path);
        $before = lstat($path);
        if (!$before || !is_file($path) || ($before['mode'] & 0777) !== 0600 || $before['size'] > $limit
            || (function_exists('posix_geteuid') && $before['uid'] !== posix_geteuid())) throw new RuntimeException('Private input ownership, size or mode is invalid.');
        $stream = fopen($path, 'rb'); if (!$stream) throw new RuntimeException('Private input unreadable.');
        try { $after = fstat($stream); $raw = stream_get_contents($stream, $limit + 1); }
        finally { fclose($stream); }
        if ($before['ino'] !== $after['ino'] || $before['dev'] !== $after['dev'] || strlen($raw) > $limit) throw new RuntimeException('Private input changed during read.');
        return $raw;
    }
    private function overlap(string $a, string $b): bool { return $a === $b || str_starts_with($a, $b . '/') || str_starts_with($b, $a . '/'); }
    private function directory(string $dir): void { $this->safeAbsolute($dir); $mode = isset($this->web) && ($dir === $this->web || str_starts_with($dir, $this->web . '/')) ? 0755 : 0700; if (!is_dir($dir) && !mkdir($dir, $mode, true)) throw new RuntimeException('Directory creation failed.'); }
    private function write(string $path, string $bytes, int $mode = 0600): void
    {
        $this->safeAbsolute($path); $this->directory(dirname($path));
        if (file_put_contents($path, $bytes) !== strlen($bytes) || !chmod($path, $mode)) throw new RuntimeException('File write failed.');
    }
    private function copyFile(string $source, string $dest, int $mode = 0600): void
    {
        $this->safeAbsolute($source); $this->safeAbsolute($dest); $this->directory(dirname($dest));
        if (!is_file($source) || !copy($source, $dest) || !chmod($dest, $mode)) throw new RuntimeException('File copy failed.');
    }
    private function scan(string $dir, string $prefix = ''): array
    {
        $this->safeAbsolute($dir); if (!is_dir($dir)) throw new RuntimeException('Missing package directory.');
        $files = [];
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $name = $prefix . $entry; $this->relative($name); $file = $dir . '/' . $entry; $this->safeAbsolute($file);
            if (is_dir($file)) array_push($files, ...$this->scan($file, $name . '/'));
            elseif (is_file($file)) $files[] = $name;
            else throw new RuntimeException('Unsupported package entry.');
        }
        sort($files, SORT_STRING); return $files;
    }
    private function copyTree(string $source, string $dest): void { foreach ($this->scan($source) as $name) $this->copyFile($source . '/' . $name, $dest . '/' . $name); }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try { (new HostPapaInstaller($argv))->run(); exit(0); }
    catch (Throwable) { fwrite(STDERR, "ERROR: private release action failed; no credentials or raw exception details are printed. Preserve evidence and verify private configuration/package.\n"); exit(1); }
}
