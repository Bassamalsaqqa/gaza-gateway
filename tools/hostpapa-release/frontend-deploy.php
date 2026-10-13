<?php

declare(strict_types=1);

// Bounded frontend-only HostPapa release installer.
// Preserves live private Laravel backend, MySQL database, and webroot PHP router (index.php, .htaccess).
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit(1);
}

ini_set('display_errors', '0');
umask(0077);

final class FrontendDeployer
{
    private const MAX_FILES = 10000;
    private const MAX_TOTAL_BYTES = 1073741824; // 1 GiB
    private const MAX_APPROVAL_BYTES = 32768; // 32 KiB
    private const MAX_MANIFEST_BYTES = 10485760; // 10 MiB
    private const MAX_CONTROL_BYTES = 128;
    private const MAX_EXECUTION_SECONDS = 100.0;

    private array $options = [];
    private array $approval = [];
    private string $home;
    private string $webroot;
    private string $appDir;
    private string $packageDir;

    public function __construct(array $argv)
    {
        foreach (array_slice($argv, 1) as $arg) {
            if ($arg === '--help') {
                echo "HostPapa frontend-only deployer:\n";
                echo "  --action=verify|deploy|rollback\n";
                echo "  --package-dir=/path/to/package\n";
                echo "  --approval-file=/path/to/approval.json\n";
                echo "  --ledger-file=/path/to/ledger.json (or --backup-dir=...)\n";
                exit(0);
            }
            if ($arg === '--check') {
                $this->options['action'] = 'verify';
                continue;
            }
            if ($arg === '--deploy') {
                $this->options['action'] = 'deploy';
                continue;
            }
            if ($arg === '--rollback') {
                $this->options['action'] = 'rollback';
                continue;
            }
            if (preg_match('/^--(action|package-dir|approval-file|ledger-file|backup-dir)=(.+)$/D', $arg, $m)) {
                $this->options[$m[1]] = $m[2];
            } else {
                throw new RuntimeException("Invalid or unrecognized CLI argument: {$arg}");
            }
        }
    }

    public function run(): void
    {
        if (PHP_VERSION_ID < 80200) {
            throw new RuntimeException('PHP 8.2+ CLI is required.');
        }

        $homeEnv = getenv('HOSTPAPA_HOME') ?: (getenv('HOME') ?: getenv('USERPROFILE'));
        if (!$homeEnv || !is_dir($homeEnv)) {
            throw new RuntimeException('HOME directory is required and must exist.');
        }
        $this->home = rtrim($this->normalizePath($this->safeAbsolute($homeEnv)), '/');

        $action = $this->options['action'] ?? (isset($this->options['ledger-file']) || isset($this->options['backup-dir']) ? 'rollback' : (isset($this->options['approval-file']) ? 'deploy' : 'verify'));
        if (!in_array($action, ['verify', 'deploy', 'rollback'], true)) {
            throw new RuntimeException("Unsupported action: {$action}");
        }

        if ($action === 'verify') {
            $rawPackage = $this->options['package-dir'] ?? '';
            if ($rawPackage === '') {
                throw new RuntimeException('Verification requires explicit --package-dir');
            }
            $this->packageDir = $this->normalizePath($this->safeAbsolute($rawPackage));
            $this->assertInsideHome($this->packageDir);
            $this->verifyPackage($this->packageDir, null);
            echo "PASS: verified complete frontend package inventory, hashes and bindings. No web mutation performed.\n";
            return;
        }

        if ($action === 'rollback') {
            $this->executeRollback();
            return;
        }

        $this->executeDeploy();
    }

    private function executeDeploy(): void
    {
        $rawPackage = $this->options['package-dir'] ?? '';
        if ($rawPackage === '') {
            throw new RuntimeException('Deployment requires explicit --package-dir');
        }
        $this->packageDir = $this->normalizePath($this->safeAbsolute($rawPackage));
        $this->assertInsideHome($this->packageDir);

        $rawApprovalPath = $this->options['approval-file'] ?? '';
        if ($rawApprovalPath === '') {
            throw new RuntimeException('Deployment requires explicit --approval-file');
        }
        $approvalFile = $this->normalizePath($this->safeAbsolute($rawApprovalPath));
        $this->assertPrivatePath($approvalFile);

        $approval = $this->readApproval($approvalFile);
        $this->approval = $approval;

        $this->appDir = $this->normalizePath($this->safeAbsolute($approval['app_dir']));
        $this->assertPrivatePath($this->appDir);

        $this->webroot = $this->normalizePath($this->safeAbsolute($approval['target_webroot']));
        $this->assertInsideHome($this->webroot);

        if ($this->overlap($this->appDir, $this->webroot)) {
            throw new RuntimeException('Private application and webroot directory boundaries overlap.');
        }

        // Verify package against approval before acquiring lock or touching anything
        $manifest = $this->verifyPackage($this->packageDir, $approval['environment']);
        if ($manifest['source_sha'] !== $approval['source_sha']) {
            throw new RuntimeException("Package source SHA does not match approval.");
        }
        if ($manifest['compatible_backend_sha'] !== $approval['compatible_backend_sha']) {
            throw new RuntimeException("Package compatible backend SHA does not match approval.");
        }
        if ($manifest['manifest_sha256'] !== $approval['manifest_sha256']) {
            throw new RuntimeException("Package manifest SHA-256 does not match approval.");
        }

        // 1. Pre-lock checks: deployed backend pin and active maintenance
        $this->verifyDeployedBackendPin($approval['compatible_backend_sha']);
        $maintenanceFile = $this->appDir . '/shared/storage/framework/maintenance.php';
        if (file_exists($maintenanceFile)) {
            throw new RuntimeException("Active backend maintenance in progress; refusing frontend release.");
        }

        // 2. Require existing regular index.php and .htaccess (not optional)
        $routerFile = $this->webroot . '/index.php';
        $htaccessFile = $this->webroot . '/.htaccess';
        $this->safeAbsolute($routerFile);
        $this->safeAbsolute($htaccessFile);
        if (!is_file($routerFile) || is_link($routerFile)) {
            throw new RuntimeException("Required webroot router index.php is missing or not a regular file.");
        }
        if (!is_file($htaccessFile) || is_link($htaccessFile)) {
            throw new RuntimeException("Required webroot .htaccess is missing or not a regular file.");
        }
        $routerHashBefore = hash_file('sha256', $routerFile);
        $htaccessHashBefore = hash_file('sha256', $htaccessFile);

        // 3. Acquire nonblocking shared release lock (matching HostPapaInstaller)
        $lockPath = $this->appDir . '/shared/installer.lock';
        $this->directory(dirname($lockPath));
        $this->safeAbsolute($lockPath);
        $this->assertNoSymlinks($lockPath);

        $lock = fopen($lockPath, 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException('Another release process is active (installer.lock is held).');
        }
        chmod($lockPath, 0600);

        try {
            // Recheck both deployed backend pin and active maintenance under the lock
            $currentReleaseId = $this->verifyDeployedBackendPin($approval['compatible_backend_sha']);
            if (file_exists($maintenanceFile)) {
                throw new RuntimeException("Active backend maintenance in progress; refusing frontend release.");
            }

            $deadline = microtime(true) + self::MAX_EXECUTION_SECONDS;

            // 4. Create backup directory and copy retained release-manifest.json before any mutations
            $timestamp = gmdate('Ymd\THis\Z');
            $backupDir = $this->appDir . '/shared/backups/frontend_' . $manifest['source_sha'] . '_' . $timestamp . '_' . bin2hex(random_bytes(4));
            $this->directory($backupDir . '/files');

            // Retain approved release-manifest.json in backup directory
            $retainedManifestPath = $backupDir . '/release-manifest.json';
            $srcManifestPath = $this->packageDir . '/release-manifest.json';
            if (!copy($srcManifestPath, $retainedManifestPath)) {
                throw new RuntimeException("Failed to copy retained release-manifest.json to backup directory.");
            }
            chmod($retainedManifestPath, 0600);
            if (hash_file('sha256', $retainedManifestPath) !== $approval['manifest_sha256']) {
                throw new RuntimeException("Retained manifest hash mismatch in backup directory.");
            }

            // Create ledger before any mutation
            $ledger = [];
            foreach ($manifest['public_files'] as $relPath => $entry) {
                if (microtime(true) > $deadline) {
                    throw new RuntimeException("Operation exceeded bounded execution deadline.");
                }
                $targetFile = $this->webroot . '/' . $relPath;
                $this->assertNoSymlinks($targetFile);
                if (file_exists($targetFile)) {
                    if (!is_file($targetFile) || is_link($targetFile)) {
                        throw new RuntimeException("Target path is not a regular file: {$relPath}");
                    }
                    $backupPath = $backupDir . '/files/' . $relPath;
                    $this->directory(dirname($backupPath));
                    if (!copy($targetFile, $backupPath)) {
                        throw new RuntimeException("Failed to back up file before mutation.");
                    }
                    $ledger[$relPath] = [
                        'existed' => true,
                        'sha256' => hash_file('sha256', $targetFile),
                        'size' => filesize($targetFile),
                    ];
                } else {
                    $ledger[$relPath] = [
                        'existed' => false,
                    ];
                }
            }

            $ledgerData = [
                'schema_version' => '1.0',
                'created_at' => gmdate('c'),
                'source_sha' => $manifest['source_sha'],
                'compatible_backend_sha' => $manifest['compatible_backend_sha'],
                'manifest_sha256' => $approval['manifest_sha256'],
                'files' => $ledger,
            ];
            $this->writePrivate($backupDir . '/ledger.json', json_encode($ledgerData, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));

            // 5. Mutate files atomically with per-file temporary renames
            // All post-write checks and result write are inside mutation rollback try
            try {
                foreach ($manifest['public_files'] as $relPath => $entry) {
                    if (microtime(true) > $deadline) {
                        throw new RuntimeException("Operation exceeded bounded execution deadline.");
                    }
                    $src = $this->packageDir . '/public/' . $relPath;

                    // Source file SHA recheck immediately before copy
                    if (hash_file('sha256', $src) !== $entry['sha256']) {
                        throw new RuntimeException("Source package file checksum changed before copy.");
                    }

                    $dest = $this->webroot . '/' . $relPath;
                    $destDir = dirname($dest);
                    $this->directory($destDir);

                    $tmp = $destDir . '/.tmp.' . basename($relPath) . '.' . bin2hex(random_bytes(4));
                    if (!copy($src, $tmp)) {
                        throw new RuntimeException("Failed to write temporary copy during file deployment.");
                    }
                    chmod($tmp, 0644);
                    if (!rename($tmp, $dest)) {
                        unlink($tmp);
                        throw new RuntimeException("Atomic rename failed during file deployment.");
                    }
                }

                // Final target hash checks before SUCCESS
                foreach ($manifest['public_files'] as $relPath => $entry) {
                    if (microtime(true) > $deadline) {
                        throw new RuntimeException("Operation exceeded bounded execution deadline.");
                    }
                    $dest = $this->webroot . '/' . $relPath;
                    if (!is_file($dest) || hash_file('sha256', $dest) !== $entry['sha256']) {
                        throw new RuntimeException("Deployed target file failed final checksum verification.");
                    }
                }

                // Verify router files remain untouched
                if (!is_file($routerFile) || hash_file('sha256', $routerFile) !== $routerHashBefore) {
                    throw new RuntimeException("Webroot index.php was modified or removed during deployment.");
                }
                if (!is_file($htaccessFile) || hash_file('sha256', $htaccessFile) !== $htaccessHashBefore) {
                    throw new RuntimeException("Webroot .htaccess was modified or removed during deployment.");
                }

                // Verify private backend pointer remained untouched
                $pointerFile = $this->appDir . '/current-release.txt';
                if (!is_file($pointerFile) || trim(file_get_contents($pointerFile)) !== $currentReleaseId) {
                    throw new RuntimeException("Private backend release pointer was modified during deployment.");
                }

                // Record success inside try
                $resultRecord = [
                    'outcome' => 'SUCCESS',
                    'mode' => 'frontend-only',
                    'source_sha' => $manifest['source_sha'],
                    'compatible_backend_sha' => $manifest['compatible_backend_sha'],
                    'manifest_sha256' => $approval['manifest_sha256'],
                    'active_backend_release' => $currentReleaseId,
                    'files_deployed' => count($manifest['public_files']),
                    'completed_at' => gmdate('c'),
                ];
                $this->writePrivate($backupDir . '/result.json', json_encode($resultRecord, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            } catch (Throwable $mutationError) {
                // Rollback all affected files using ledger
                $rollbackSuccess = true;
                foreach ($ledger as $relPath => $state) {
                    if (microtime(true) > $deadline) {
                        $rollbackSuccess = false;
                        break;
                    }
                    $dest = $this->webroot . '/' . $relPath;
                    try {
                        if ($state['existed']) {
                            $srcBackup = $backupDir . '/files/' . $relPath;
                            // Check backup/hash matches before restore
                            if (!is_file($srcBackup) || hash_file('sha256', $srcBackup) !== $state['sha256']) {
                                $rollbackSuccess = false;
                                continue;
                            }
                            $tmpRestore = dirname($dest) . '/.tmp.rollback.' . basename($relPath) . '.' . bin2hex(random_bytes(4));
                            if (copy($srcBackup, $tmpRestore) && chmod($tmpRestore, 0644) && rename($tmpRestore, $dest)) {
                                if (hash_file('sha256', $dest) !== $state['sha256']) {
                                    $rollbackSuccess = false;
                                }
                            } else {
                                $rollbackSuccess = false;
                            }
                        } else {
                            if (file_exists($dest)) {
                                if (!unlink($dest)) {
                                    $rollbackSuccess = false;
                                }
                            }
                        }
                    } catch (Throwable) {
                        $rollbackSuccess = false;
                    }
                }

                $resultRecord = [
                    'outcome' => $rollbackSuccess ? 'ROLLBACK_SUCCESS' : 'ROLLBACK_INCOMPLETE',
                    'stage' => 'file_mutation',
                    'error' => $mutationError->getMessage(),
                    'timestamp' => gmdate('c'),
                ];
                $this->writePrivate($backupDir . '/result.json', json_encode($resultRecord, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));

                throw new RuntimeException(
                    $rollbackSuccess
                        ? "Frontend deployment failed: " . $mutationError->getMessage() . ". All affected files rolled back successfully from backup ledger."
                        : "Frontend deployment failed and rollback was incomplete: " . $mutationError->getMessage() . "."
                );
            }

            // Truthful CLI success receipt
            echo "PASS: frontend-only release deployed successfully.\n";
            echo "Mode: frontend-only\n";
            echo "Frontend Source SHA: " . $manifest['source_sha'] . "\n";
            echo "Compatible Backend SHA: " . $manifest['compatible_backend_sha'] . "\n";
            echo "Active Backend Release: " . $currentReleaseId . "\n";
            echo "Manifest SHA-256: " . $approval['manifest_sha256'] . "\n";
            echo "Files Deployed: " . count($manifest['public_files']) . "\n";
            echo "Webroot index.php and .htaccess: PRESERVED UNCHANGED\n";
            echo "Backend Code Pointer and Database: PRESERVED UNCHANGED\n";
            echo "Backup Retained: " . basename($backupDir) . "\n";
        } finally {
            if (is_resource($lock)) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    private function executeRollback(): void
    {
        $rawApprovalPath = $this->options['approval-file'] ?? '';
        if ($rawApprovalPath === '') {
            throw new RuntimeException('Rollback requires explicit --approval-file');
        }
        $approvalFile = $this->normalizePath($this->safeAbsolute($rawApprovalPath));
        $this->assertPrivatePath($approvalFile);

        $approval = $this->readApproval($approvalFile);
        $this->approval = $approval;

        $this->appDir = $this->normalizePath($this->safeAbsolute($approval['app_dir']));
        $this->assertPrivatePath($this->appDir);

        $this->webroot = $this->normalizePath($this->safeAbsolute($approval['target_webroot']));
        $this->assertInsideHome($this->webroot);

        if ($this->overlap($this->appDir, $this->webroot)) {
            throw new RuntimeException('Private application and webroot directory boundaries overlap.');
        }

        // Resolve backup directory and ledger path
        $rawLedger = $this->options['ledger-file'] ?? '';
        if ($rawLedger === '') {
            $rawBackupDir = $this->options['backup-dir'] ?? '';
            if ($rawBackupDir !== '') {
                $rawLedger = rtrim($rawBackupDir, '/\\') . '/ledger.json';
            } else {
                throw new RuntimeException('Rollback requires --ledger-file or --backup-dir');
            }
        }

        $ledgerPath = $this->normalizePath($this->safeAbsolute($rawLedger));
        $this->assertPrivatePath($ledgerPath);
        $backupDir = dirname($ledgerPath);
        $this->safeAbsolute($backupDir);
        $this->assertPrivatePath($backupDir);

        if (!str_starts_with($backupDir, $this->appDir . '/shared/backups/')) {
            throw new RuntimeException('Backup directory must be inside private backups directory.');
        }

        // 1. Validate retained release-manifest.json in backup directory
        $retainedManifestPath = $backupDir . '/release-manifest.json';
        $this->safeAbsolute($retainedManifestPath);
        if (!is_file($retainedManifestPath) || filesize($retainedManifestPath) > self::MAX_MANIFEST_BYTES) {
            throw new RuntimeException('Retained release-manifest.json is missing or invalid in backup directory.');
        }
        if (hash_file('sha256', $retainedManifestPath) !== $approval['manifest_sha256']) {
            throw new RuntimeException('Retained manifest SHA-256 does not match approved manifest SHA-256.');
        }

        $manifest = json_decode(file_get_contents($retainedManifestPath), true, 32, JSON_THROW_ON_ERROR);
        $this->closedArray($manifest, [
            'schema_version',
            'mode',
            'release_id',
            'source_sha',
            'compatible_backend_sha',
            'built_at',
            'is_dirty',
            'classification',
            'summary',
            'public_files',
        ]);
        if ($manifest['schema_version'] !== '1.0' || $manifest['mode'] !== 'frontend-only') {
            throw new RuntimeException('Retained manifest has invalid schema_version or mode.');
        }
        if ($manifest['source_sha'] !== $approval['source_sha']) {
            throw new RuntimeException('Retained manifest source SHA does not match approval.');
        }
        if ($manifest['compatible_backend_sha'] !== $approval['compatible_backend_sha']) {
            throw new RuntimeException('Retained manifest compatible backend SHA does not match approval.');
        }

        // 2. Read and validate ledger
        if (!is_file($ledgerPath) || filesize($ledgerPath) > self::MAX_MANIFEST_BYTES) {
            throw new RuntimeException('Ledger file is missing or invalid in backup directory.');
        }
        $ledger = json_decode(file_get_contents($ledgerPath), true, 32, JSON_THROW_ON_ERROR);
        $this->closedArray($ledger, ['schema_version', 'created_at', 'source_sha', 'compatible_backend_sha', 'manifest_sha256', 'files']);

        if ($ledger['schema_version'] !== '1.0') {
            throw new RuntimeException('Invalid ledger schema_version.');
        }
        if ($ledger['source_sha'] !== $approval['source_sha']) {
            throw new RuntimeException('Ledger source SHA does not match approval.');
        }
        if ($ledger['compatible_backend_sha'] !== $approval['compatible_backend_sha']) {
            throw new RuntimeException('Ledger compatible backend SHA does not match approval.');
        }
        if ($ledger['manifest_sha256'] !== $approval['manifest_sha256']) {
            throw new RuntimeException('Ledger manifest SHA-256 does not match approval.');
        }

        $ledgerFiles = $ledger['files'];
        if (!is_array($ledgerFiles) || count($ledgerFiles) === 0 || count($ledgerFiles) > self::MAX_FILES) {
            throw new RuntimeException('Ledger files map is missing or exceeds limits.');
        }

        // Exact file map match: ledger keys === manifest public_files keys
        $manifestKeys = array_keys($manifest['public_files']);
        $ledgerKeys = array_keys($ledgerFiles);
        sort($manifestKeys, SORT_STRING);
        sort($ledgerKeys, SORT_STRING);
        if ($manifestKeys !== $ledgerKeys) {
            throw new RuntimeException('Ledger file map keys do not match retained manifest public_files.');
        }

        $backupFilesDir = $backupDir . '/files';
        $this->safeAbsolute($backupFilesDir);
        $this->assertPrivatePath($backupFilesDir);

        // Preflight ALL rows before ANY restore writes:
        // - assertSafeRelative
        // - assertForbiddenPublicName
        // - closed state check: if true: existed, sha256 (64 hex), size (int >= 0), exact backup file validation; if false: only existed (false)
        $totalBackupBytes = 0;
        foreach ($ledgerFiles as $relPath => $state) {
            $this->assertSafeRelative($relPath);
            $this->assertForbiddenPublicName($relPath);

            if (!is_array($state)) {
                throw new RuntimeException("Invalid ledger entry state for {$relPath}");
            }
            if (!isset($state['existed']) || !is_bool($state['existed'])) {
                throw new RuntimeException("Ledger entry missing existed boolean for {$relPath}");
            }

            if ($state['existed'] === true) {
                $this->closedArray($state, ['existed', 'sha256', 'size']);
                if (!is_string($state['sha256']) || !preg_match('/^[a-f0-9]{64}$/D', $state['sha256'])) {
                    throw new RuntimeException("Invalid backup SHA in ledger for {$relPath}");
                }
                if (!is_int($state['size']) || $state['size'] < 0) {
                    throw new RuntimeException("Invalid backup size in ledger for {$relPath}");
                }
                $totalBackupBytes += $state['size'];
                if ($totalBackupBytes > self::MAX_TOTAL_BYTES) {
                    throw new RuntimeException("Backup files exceed total size limit.");
                }

                // Validate backup file exists and matches hash
                $srcBackup = $backupFilesDir . '/' . $relPath;
                $this->safeAbsolute($srcBackup);
                $this->assertPrivatePath($srcBackup);
                if (!is_file($srcBackup) || is_link($srcBackup)) {
                    throw new RuntimeException("Backup file missing or symbolic link for {$relPath}; refusing restore.");
                }
                if (filesize($srcBackup) !== $state['size'] || hash_file('sha256', $srcBackup) !== $state['sha256']) {
                    throw new RuntimeException("Backup file corrupted for {$relPath}; refusing restore.");
                }
            } else {
                $this->closedArray($state, ['existed']);
            }
        }

        // Validate current deployed webroot files against approved manifest:
        // Reject newer / edited / tampered frontend with 0 writes!
        foreach ($manifest['public_files'] as $relPath => $manifestEntry) {
            $dest = $this->webroot . '/' . $relPath;
            $this->safeAbsolute($dest);
            if (file_exists($dest)) {
                if (!is_file($dest) || is_link($dest)) {
                    throw new RuntimeException("Current webroot entry is not a regular file for {$relPath}; refusing rollback.");
                }
                if (hash_file('sha256', $dest) !== $manifestEntry['sha256']) {
                    throw new RuntimeException("Current deployed target file was edited or does not match approved manifest for {$relPath}; refusing rollback with 0 writes.");
                }
            }
        }

        // Pre-lock checks: backend pin and maintenance
        $this->verifyDeployedBackendPin($approval['compatible_backend_sha']);
        $maintenanceFile = $this->appDir . '/shared/storage/framework/maintenance.php';
        if (file_exists($maintenanceFile)) {
            throw new RuntimeException('Active backend maintenance in progress; refusing rollback.');
        }

        // Require existing regular router files
        $routerFile = $this->webroot . '/index.php';
        $htaccessFile = $this->webroot . '/.htaccess';
        $this->safeAbsolute($routerFile);
        $this->safeAbsolute($htaccessFile);
        if (!is_file($routerFile) || is_link($routerFile)) {
            throw new RuntimeException('Required webroot router index.php is missing or not a regular file.');
        }
        if (!is_file($htaccessFile) || is_link($htaccessFile)) {
            throw new RuntimeException('Required webroot .htaccess is missing or not a regular file.');
        }
        $routerHashBefore = hash_file('sha256', $routerFile);
        $htaccessHashBefore = hash_file('sha256', $htaccessFile);

        // Under-lock checks
        $lockPath = $this->appDir . '/shared/installer.lock';
        $this->directory(dirname($lockPath));
        $this->safeAbsolute($lockPath);
        $this->assertNoSymlinks($lockPath);

        $lock = fopen($lockPath, 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException('Another release process is active (installer.lock is held).');
        }
        chmod($lockPath, 0600);

        try {
            // Recheck both under lock
            $currentReleaseId = $this->verifyDeployedBackendPin($approval['compatible_backend_sha']);
            if (file_exists($maintenanceFile)) {
                throw new RuntimeException('Active backend maintenance in progress; refusing rollback.');
            }

            $deadline = microtime(true) + self::MAX_EXECUTION_SECONDS;

            try {
                // Pre-lock reads never authorize a restore: another frontend release may
                // have completed while this process waited to acquire the common lock.
                if (hash_file('sha256', $retainedManifestPath) !== $approval['manifest_sha256']) {
                    throw new RuntimeException('Retained manifest changed before rollback.');
                }
                foreach ($ledgerFiles as $relPath => $state) {
                    if (microtime(true) > $deadline) throw new RuntimeException('Rollback preflight deadline exceeded.');
                    $dest = $this->webroot . '/' . $relPath;
                    $this->safeAbsolute($dest);
                    $entry = $manifest['public_files'][$relPath];
                    if (!is_file($dest) || filesize($dest) !== $entry['size'] || hash_file('sha256', $dest) !== $entry['sha256']) {
                        throw new RuntimeException('Frontend changed before locked rollback; no files restored.');
                    }
                    if ($state['existed']) {
                        $file = $backupFilesDir . '/' . $relPath;
                        $this->safeAbsolute($file);
                        if (!is_file($file) || filesize($file) !== $state['size'] || hash_file('sha256', $file) !== $state['sha256']) {
                            throw new RuntimeException('Backup changed before locked rollback; no files restored.');
                        }
                    }
                }
                // Restore files from ledger
                foreach ($ledgerFiles as $relPath => $state) {
                    if (microtime(true) > $deadline) {
                        throw new RuntimeException('Operation exceeded bounded execution deadline.');
                    }
                    $dest = $this->webroot . '/' . $relPath;
                    $this->safeAbsolute($dest);

                    if ($state['existed']) {
                        $srcBackup = $backupFilesDir . '/' . $relPath;
                        $destDir = dirname($dest);
                        $this->directory($destDir);
                        $tmpRestore = $destDir . '/.tmp.rollback.' . basename($relPath) . '.' . bin2hex(random_bytes(4));
                        if (!copy($srcBackup, $tmpRestore)) {
                            throw new RuntimeException("Failed to copy restore file for {$relPath}");
                        }
                        chmod($tmpRestore, 0644);
                        if (!rename($tmpRestore, $dest)) {
                            unlink($tmpRestore);
                            throw new RuntimeException("Failed atomic rename on rollback for {$relPath}");
                        }
                        if (hash_file('sha256', $dest) !== $state['sha256']) {
                            throw new RuntimeException("Restored file failed hash verification for {$relPath}");
                        }
                    } else {
                        if (file_exists($dest)) {
                            if (!unlink($dest)) {
                                throw new RuntimeException("Failed to remove newly added file on rollback for {$relPath}");
                            }
                        }
                    }
                }

                // Verify router files intact
                if (!is_file($routerFile) || hash_file('sha256', $routerFile) !== $routerHashBefore) {
                    throw new RuntimeException('Webroot index.php was modified or removed during rollback.');
                }
                if (!is_file($htaccessFile) || hash_file('sha256', $htaccessFile) !== $htaccessHashBefore) {
                    throw new RuntimeException('Webroot .htaccess was modified or removed during rollback.');
                }

                // Never rewind backend or pointer
                $pointerFile = $this->appDir . '/current-release.txt';
                if (!is_file($pointerFile) || trim(file_get_contents($pointerFile)) !== $currentReleaseId) {
                    throw new RuntimeException('Private backend release pointer was modified during rollback.');
                }

                // Record rollback success
                $rollbackRecord = [
                    'outcome' => 'SUCCESS',
                    'action' => 'rollback',
                    'source_sha' => $ledger['source_sha'],
                    'compatible_backend_sha' => $ledger['compatible_backend_sha'],
                    'manifest_sha256' => $ledger['manifest_sha256'],
                    'active_backend_release' => $currentReleaseId,
                    'completed_at' => gmdate('c'),
                ];
                $this->writePrivate($backupDir . '/rollback-result.json', json_encode($rollbackRecord, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            } catch (Throwable $e) {
                // Retain attempt/result on partial rollback failure, don't falsely success!
                $failRecord = [
                    'outcome' => 'ROLLBACK_FAILED',
                    'action' => 'rollback',
                    'error' => $e->getMessage(),
                    'timestamp' => gmdate('c'),
                ];
                $this->writePrivate($backupDir . '/rollback-result.json', json_encode($failRecord, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
                throw $e;
            }

            echo "PASS: frontend-only release rolled back successfully from ledger.\n";
            echo "Mode: frontend-only\n";
            echo "Frontend Source SHA: " . $ledger['source_sha'] . "\n";
            echo "Active Backend Release: " . $currentReleaseId . "\n";
            echo "Webroot index.php and .htaccess: PRESERVED UNCHANGED\n";
            echo "Backend Code Pointer and Database: PRESERVED UNCHANGED\n";
        } finally {
            if (is_resource($lock)) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    private function verifyDeployedBackendPin(string $requiredBackendSha): string
    {
        $pointer = $this->appDir . '/current-release.txt';
        $this->safeAbsolute($pointer);
        if (!is_file($pointer) || filesize($pointer) > self::MAX_CONTROL_BYTES) {
            throw new RuntimeException("Missing or invalid current-release.txt pointer.");
        }

        $currentReleaseId = trim(file_get_contents($pointer));
        if (!preg_match('/^[A-Za-z0-9_]{1,128}$/D', $currentReleaseId)) {
            throw new RuntimeException("Invalid release ID in current-release.txt.");
        }

        $releaseDir = $this->appDir . '/releases/' . $currentReleaseId;
        $this->safeAbsolute($releaseDir);
        if (!is_dir($releaseDir)) {
            throw new RuntimeException("Deployed release directory does not exist.");
        }

        // Canonical immutable private pin locations
        $pinCandidates = [
            $releaseDir . '/SOURCE_COMMIT.txt',
            $releaseDir . '/private/SOURCE_COMMIT.txt',
        ];

        $pinPath = null;
        foreach ($pinCandidates as $cand) {
            if (is_file($cand)) {
                $pinPath = $cand;
                break;
            }
        }

        if ($pinPath === null) {
            throw new RuntimeException("Deployed release has absent SOURCE_COMMIT.txt pin (old releases not eligible until full-stack upgrade). Refusing deployment with 0 writes.");
        }

        $this->safeAbsolute($pinPath);
        if (filesize($pinPath) > self::MAX_CONTROL_BYTES) {
            throw new RuntimeException("Corrupt SOURCE_COMMIT.txt pin file.");
        }

        $installedBackendSha = strtolower(trim(file_get_contents($pinPath)));
        if (!preg_match('/^[a-f0-9]{40}$/D', $installedBackendSha)) {
            throw new RuntimeException("Corrupt or invalid backend SHA in SOURCE_COMMIT.txt pin.");
        }

        if ($installedBackendSha !== strtolower($requiredBackendSha)) {
            throw new RuntimeException("Installed backend SHA does not match required compatible backend SHA. Refusing deployment with 0 writes.");
        }

        return $currentReleaseId;
    }

    private function verifyPackage(string $pkgDir, ?string $expectedEnvironment): array
    {
        $manifestPath = $pkgDir . '/release-manifest.json';
        $this->safeAbsolute($manifestPath);
        if (!is_file($manifestPath) || filesize($manifestPath) > self::MAX_MANIFEST_BYTES) {
            throw new RuntimeException('Missing or oversized release-manifest.json in package.');
        }

        $manifestHash = hash_file('sha256', $manifestPath);
        $raw = file_get_contents($manifestPath);
        $manifest = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);

        $this->closedArray($manifest, [
            'schema_version',
            'mode',
            'release_id',
            'source_sha',
            'compatible_backend_sha',
            'built_at',
            'is_dirty',
            'classification',
            'summary',
            'public_files',
        ]);

        if ($manifest['schema_version'] !== '1.0' || $manifest['mode'] !== 'frontend-only') {
            throw new RuntimeException('Invalid manifest schema_version or mode.');
        }

        if (!preg_match('/^[a-f0-9]{40}$/D', $manifest['source_sha'])) {
            throw new RuntimeException('Invalid manifest source_sha.');
        }
        if (!preg_match('/^[a-f0-9]{40}$/D', $manifest['compatible_backend_sha'])) {
            throw new RuntimeException('Invalid manifest compatible_backend_sha.');
        }
        if (!preg_match('/^rel_fe_[A-Za-z0-9_]{1,121}$/D', $manifest['release_id'])) {
            throw new RuntimeException('Invalid manifest release_id.');
        }
        if ($manifest['is_dirty'] !== false || $manifest['classification'] !== 'UNREVIEWED_RELEASE_CANDIDATE') {
            throw new RuntimeException('Invalid manifest cleanliness or classification.');
        }

        $this->closedArray($manifest['summary'], ['public_file_count', 'public_bytes']);
        $publicFiles = $manifest['public_files'];
        if (!is_array($publicFiles) || count($publicFiles) === 0) {
            throw new RuntimeException('Manifest public_files must be a non-empty map.');
        }

        if (!isset($publicFiles['build-receipt.json'])) {
            throw new RuntimeException('Package public_files must contain build-receipt.json.');
        }

        if (count($publicFiles) > self::MAX_FILES) {
            throw new RuntimeException('Package exceeds bounded limit of 10,000 files.');
        }

        $totalBytes = 0;
        $expectedDiskFiles = [];

        foreach ($publicFiles as $name => $entry) {
            $this->assertSafeRelative($name);
            $this->assertForbiddenPublicName($name);
            $this->closedArray($entry, ['size', 'sha256']);

            if (!is_int($entry['size']) || $entry['size'] < 0 || !preg_match('/^[a-f0-9]{64}$/D', $entry['sha256'])) {
                throw new RuntimeException("Invalid file entry in manifest: {$name}");
            }

            $totalBytes += $entry['size'];
            if ($totalBytes > self::MAX_TOTAL_BYTES) {
                throw new RuntimeException('Package exceeds bounded limit of 1 GiB.');
            }

            $diskFile = $pkgDir . '/public/' . $name;
            $this->safeAbsolute($diskFile);
            if (!is_file($diskFile) || is_link($diskFile)) {
                throw new RuntimeException("Package file missing or symbolic link: {$name}");
            }
            if (filesize($diskFile) !== $entry['size']) {
                throw new RuntimeException("Package file size mismatch: {$name}");
            }
            if (hash_file('sha256', $diskFile) !== $entry['sha256']) {
                throw new RuntimeException("Package file checksum mismatch: {$name}");
            }

            $expectedDiskFiles[] = $name;
        }

        // Verify no untracked extra files in package public/
        $actualDiskFiles = $this->scanDirectory($pkgDir . '/public');
        sort($expectedDiskFiles, SORT_STRING);
        sort($actualDiskFiles, SORT_STRING);
        if ($expectedDiskFiles !== $actualDiskFiles) {
            throw new RuntimeException('Package public/ inventory does not exactly match manifest.');
        }

        // Verify control files
        $sourceCommitFile = $pkgDir . '/SOURCE_COMMIT.txt';
        $backendShaFile = $pkgDir . '/COMPATIBLE_BACKEND_SHA.txt';
        if (!is_file($sourceCommitFile) || trim(file_get_contents($sourceCommitFile)) !== $manifest['source_sha']) {
            throw new RuntimeException('Package SOURCE_COMMIT.txt control file is missing or does not match manifest.');
        }
        if (!is_file($backendShaFile) || trim(file_get_contents($backendShaFile)) !== $manifest['compatible_backend_sha']) {
            throw new RuntimeException('Package COMPATIBLE_BACKEND_SHA.txt control file is missing or does not match manifest.');
        }

        // Validate build receipt matching manifest
        $this->assertBuildReceiptValid($pkgDir, $manifest, $expectedEnvironment);

        $manifest['manifest_sha256'] = $manifestHash;
        return $manifest;
    }

    private function assertBuildReceiptValid(string $pkgDir, array $manifest, ?string $expectedEnvironment): void
    {
        $receiptPath = $pkgDir . '/public/build-receipt.json';
        $this->safeAbsolute($receiptPath);
        $receipt = json_decode(file_get_contents($receiptPath), true, 32, JSON_THROW_ON_ERROR);

        $this->closedSubset($receipt, ['schema_version', 'source_sha', 'origin', 'flags', 'artifact_hashes', 'built_at']);

        if (($receipt['schema_version'] ?? 0) !== 1) {
            throw new RuntimeException('Invalid build receipt schema version.');
        }
        if (($receipt['source_sha'] ?? '') !== $manifest['source_sha']) {
            throw new RuntimeException('Build receipt source SHA does not match manifest source SHA.');
        }

        $flags = $receipt['flags'] ?? null;
        if (!is_array($flags)) {
            throw new RuntimeException('Build receipt flags must be an object.');
        }
        if (($flags['HOSTPAPA_SHARED_ENABLED'] ?? false) !== true ||
            ($flags['VITE_IDENTITY_UI_MODE'] ?? '') !== 'backend' ||
            ($flags['VITE_IDENTITY_PRODUCTION_OPT_IN'] ?? '') !== 'true' ||
            ($flags['VITE_IDENTITY_NONPRODUCTION_OPT_IN'] ?? '') !== 'false') {
            throw new RuntimeException('Build receipt flags missing approved same-origin settings.');
        }

        $profile = $flags['VITE_HOSTPAPA_PROFILE'] ?? 'production';
        if (!in_array($profile, ['production', 'staging'], true)) {
            throw new RuntimeException('Build receipt has invalid profile.');
        }

        if ($expectedEnvironment !== null && $profile !== $expectedEnvironment) {
            throw new RuntimeException('Build receipt profile does not match approved environment.');
        }

        $expectedOrigins = $profile === 'staging'
            ? ['https://staging.gazaairport.com']
            : ['https://www.gazaairport.com', 'https://gazaairport.com'];

        if (!in_array($receipt['origin'] ?? '', $expectedOrigins, true)) {
            throw new RuntimeException('Build receipt origin does not match approved profile origin.');
        }
        if (($flags['VITE_IDENTITY_API_BASE_URL'] ?? '') !== $receipt['origin'] . '/api/v1') {
            throw new RuntimeException('Build receipt API base URL does not match origin.');
        }
    }

    private function assertForbiddenPublicName(string $name): void
    {
        $base = strtolower(basename($name));
        $lower = strtolower($name);

        if ($base === 'index.php' || $base === '.htaccess') {
            throw new RuntimeException("Forbidden router file in frontend package: {$name}");
        }
        if (preg_match('/\.(?:php\d*|phtml|pht|phar|cgi|pl|py|sh|bat|cmd|ps1)(?:\.|$)/i', $lower)) {
            throw new RuntimeException("Forbidden PHP executable in frontend package: {$name}");
        }
        if (str_starts_with($base, '.env') || str_ends_with($base, '.env') || in_array($base, ['.user.ini', '.htpasswd'], true)) {
            throw new RuntimeException("Forbidden environment file in frontend package: {$name}");
        }
        if (str_ends_with($lower, '.log') || str_starts_with($lower, 'logs/') || str_contains($lower, '/logs/')) {
            throw new RuntimeException("Forbidden log file in frontend package: {$name}");
        }
        if (preg_match('/\.(key|pem|p12|crt|cert|secret|token|sql|sqlite|bak)$/i', $base)) {
            throw new RuntimeException("Forbidden secret or credential file in frontend package: {$name}");
        }
    }

    private function readApproval(string $path): array
    {
        $this->safeAbsolute($path);
        if (!is_file($path) || filesize($path) > self::MAX_APPROVAL_BYTES) {
            throw new RuntimeException('Approval file is missing, not a file, or exceeds maximum size.');
        }

        if (function_exists('posix_geteuid')) {
            $owner = fileowner($path);
            if ($owner !== posix_geteuid()) {
                throw new RuntimeException('Approval file ownership does not match current user.');
            }
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException('Failed to read approval file.');
        }

        $approval = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);

        $allowedKeys = [
            'schema_version',
            'mode',
            'action',
            'source_sha',
            'compatible_backend_sha',
            'backend_sha',
            'manifest_sha256',
            'target_webroot',
            'app_dir',
            'environment',
            'release_id',
        ];

        $this->closedSubset($approval, $allowedKeys);

        if (($approval['schema_version'] ?? '') !== '1.0' || ($approval['mode'] ?? '') !== 'frontend-only') {
            throw new RuntimeException("Approval schema_version must be '1.0' and mode must be 'frontend-only'.");
        }

        // Environment field MUST be required and valid
        if (!isset($approval['environment']) || !in_array($approval['environment'], ['production', 'staging'], true)) {
            throw new RuntimeException("Approval environment field is required and must be 'production' or 'staging'.");
        }

        if (!is_string($approval['source_sha'] ?? null) || !preg_match('/^[a-f0-9]{40}$/D', $approval['source_sha'])) {
            throw new RuntimeException('Approval source_sha must be exact 40-char lowercase hex.');
        }

        $backendSha = $approval['compatible_backend_sha'] ?? ($approval['backend_sha'] ?? null);
        if (!is_string($backendSha) || !preg_match('/^[a-f0-9]{40}$/D', $backendSha)) {
            throw new RuntimeException('Approval backend SHA (compatible_backend_sha or backend_sha) must be exact 40-char lowercase hex.');
        }
        $approval['compatible_backend_sha'] = $backendSha;

        if (!is_string($approval['manifest_sha256'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $approval['manifest_sha256'])) {
            throw new RuntimeException('Approval manifest_sha256 must be exact 64-char lowercase hex.');
        }

        if (!is_string($approval['target_webroot'] ?? null) || $approval['target_webroot'] === '') {
            throw new RuntimeException('Approval target_webroot is required.');
        }
        if (!is_string($approval['app_dir'] ?? null) || $approval['app_dir'] === '') {
            throw new RuntimeException('Approval app_dir is required.');
        }

        return $approval;
    }

    private function closedArray(mixed $data, array $allowed): void
    {
        if (!is_array($data) || array_is_list($data)) {
            throw new RuntimeException('Expected closed associative object.');
        }
        $actual = array_keys($data);
        sort($actual);
        sort($allowed);
        if ($actual !== $allowed) {
            throw new RuntimeException('Object keys do not match closed schema.');
        }
    }

    private function closedSubset(mixed $data, array $allowed): void
    {
        if (!is_array($data) || array_is_list($data)) {
            throw new RuntimeException('Expected associative object.');
        }
        foreach (array_keys($data) as $k) {
            if (!in_array($k, $allowed, true)) {
                throw new RuntimeException("Unexpected key in object: {$k}");
            }
        }
    }

    private function assertSafeRelative(string $rel): void
    {
        if ($rel === '' || preg_match('#[\\\\:\x00-\x1f\x7f]|^/|/$|//|(?:^|/)\.{1,2}(?:/|$)#', $rel)) {
            throw new RuntimeException("Non-canonical or unsafe relative path: {$rel}");
        }
    }

    private function safeAbsolute(string $path): string
    {
        $normalized = $this->normalizePath($path);
        if (preg_match('#[\x00-\x1f\x7f]|//|(?:^|/)\.{1,2}(?:/|$)#', $normalized)) {
            throw new RuntimeException("Non-canonical absolute path: {$path}");
        }
        $this->assertNoSymlinks($path);
        return $path;
    }

    private function normalizePath(string $path): string
    {
        return str_replace('\\', '/', $path);
    }

    private function assertNoSymlinks(string $path): void
    {
        $cursor = $path;
        while ($cursor !== '/' && $cursor !== '' && $cursor !== '.' && !preg_match('#^[a-zA-Z]:[/\\\\]?$#', $cursor)) {
            if (is_link($cursor)) {
                throw new RuntimeException("Symbolic link detected in path: {$cursor}");
            }
            $parent = dirname($cursor);
            if ($parent === $cursor) {
                break;
            }
            $cursor = $parent;
        }
    }

    private function assertInsideHome(string $path): string
    {
        $normPath = $this->normalizePath($path);
        $normHome = $this->normalizePath($this->home);
        if ($normPath !== $normHome && !str_starts_with($normPath, $normHome . '/')) {
            throw new RuntimeException("Path boundary violation: {$path} is outside HOME ({$this->home})");
        }
        return $path;
    }

    private function assertPrivatePath(string $path): string
    {
        $this->assertInsideHome($path);
        $normPath = $this->normalizePath($path);
        if (isset($this->webroot)) {
            $normWeb = $this->normalizePath($this->webroot);
            if ($normPath === $normWeb || str_starts_with($normPath, $normWeb . '/')) {
                throw new RuntimeException("Private path cannot be inside webroot: {$path}");
            }
        }
        if (preg_match('#/(?:public_html|public)(?:/|$)#i', $normPath)) {
            throw new RuntimeException("Private path cannot be inside public_html: {$path}");
        }
        return $path;
    }

    private function overlap(string $a, string $b): bool
    {
        $na = rtrim($this->normalizePath($a), '/');
        $nb = rtrim($this->normalizePath($b), '/');
        return $na === $nb || str_starts_with($na, $nb . '/') || str_starts_with($nb, $na . '/');
    }

    private function directory(string $dir): void
    {
        $this->safeAbsolute($dir);
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0755, true)) {
                throw new RuntimeException("Failed to create directory: {$dir}");
            }
        }
    }

    private function writePrivate(string $path, string $content): void
    {
        $this->directory(dirname($path));
        $this->safeAbsolute($path);
        if (file_put_contents($path, $content) !== strlen($content)) {
            throw new RuntimeException("Failed to write private file: {$path}");
        }
        chmod($path, 0600);
    }

    private function scanDirectory(string $dir, string $prefix = ''): array
    {
        $this->safeAbsolute($dir);
        if (!is_dir($dir)) {
            throw new RuntimeException("Directory does not exist: {$dir}");
        }
        $files = [];
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $rel = $prefix ? $prefix . '/' . $item : $item;
            $this->assertSafeRelative($rel);
            $full = $dir . '/' . $item;
            $this->safeAbsolute($full);
            if (is_link($full)) {
                throw new RuntimeException("Symbolic link rejected in package directory: {$rel}");
            }
            if (is_dir($full)) {
                array_push($files, ...$this->scanDirectory($full, $rel));
            } elseif (is_file($full)) {
                $files[] = $rel;
            } else {
                throw new RuntimeException("Unsupported entry type in directory: {$rel}");
            }
        }
        sort($files, SORT_STRING);
        return $files;
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        (new FrontendDeployer($argv))->run();
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n");
        exit(1);
    }
}
