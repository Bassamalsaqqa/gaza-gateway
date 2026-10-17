<?php

declare(strict_types=1);

// Linux/PHP regression test for HostPapa installer directory/copy permissions under restrictive umask.
if (PHP_SAPI !== 'cli' || PHP_VERSION_ID < 80400) {
    fwrite(STDERR, "PHP 8.4+ CLI required.\n");
    exit(1);
}

// 1. Force restrictive umask 0077 (equivalent to umask 077 used in production upgrade)
umask(0077);

$installerPath = file_exists('/source/backend/scripts/hostpapa-install.php')
    ? '/source/backend/scripts/hostpapa-install.php'
    : dirname(__DIR__, 2) . '/backend/scripts/hostpapa-install.php';

if (!is_file($installerPath)) {
    fwrite(STDERR, "Installer script not found: {$installerPath}\n");
    exit(1);
}

require_once $installerPath;

if (!class_exists('HostPapaInstaller')) {
    fwrite(STDERR, "HostPapaInstaller class not loaded.\n");
    exit(1);
}

// 2. Set up isolated test sandbox inside /tmp
$sandbox = sys_get_temp_dir() . '/h3_perm_test_' . bin2hex(random_bytes(6));
$home = $sandbox . '/home';
$web = $home . '/public_html';
$app = $home . '/gaza-gateway';

// Cleanup helper
$rmtree = static function (string $dir) use (&$rmtree): void {
    if (!file_exists($dir) && !is_link($dir)) return;
    if (is_link($dir) || !is_dir($dir)) { unlink($dir); return; }
    foreach (scandir($dir) as $item) {
        if ($item === '.' || $item === '..') continue;
        $rmtree($dir . '/' . $item);
    }
    rmdir($dir);
};

$checkCount = 0;
$assert = static function (bool $condition, string $description) use (&$checkCount): void {
    if (!$condition) {
        throw new RuntimeException("Assertion failed: {$description}");
    }
    $checkCount++;
    echo "  PASS: {$description}\n";
};

try {
    // 3. Pre-create home (0700), app (0700), and webroot (0750, matching standard cPanel)
    mkdir($home, 0700, true);
    chmod($home, 0700);
    mkdir($app, 0700, true);
    chmod($app, 0700);
    mkdir($web, 0750, true);
    chmod($web, 0750);

    $installer = new HostPapaInstaller(['installer.php']);
    $ref = new ReflectionClass($installer);

    // Set properties
    $ref->getProperty('home')->setValue($installer, $home);
    $ref->getProperty('app')->setValue($installer, $app);
    $ref->getProperty('web')->setValue($installer, $web);

    $dirMethod = $ref->getMethod('directory');
    $copyMethod = $ref->getMethod('copyFile');

    echo "Running HostPapa installer permissions regression suite under umask 0077...\n";

    // -------------------------------------------------------------------------
    // Test 1: Preserving existing webroot 0750
    // -------------------------------------------------------------------------
    $dirMethod->invoke($installer, $web);
    $assert((fileperms($web) & 0777) === 0750, 'Existing webroot 0750 is preserved and not modified');

    // -------------------------------------------------------------------------
    // Test 2: New nested public directories created with 0755
    // -------------------------------------------------------------------------
    $nestedPublic = $web . '/media/future/cinematic';
    $dirMethod->invoke($installer, $nestedPublic);
    $assert(is_dir($web . '/media') && (fileperms($web . '/media') & 0777) === 0755, 'Newly created public ancestor /media is 0755');
    $assert(is_dir($web . '/media/future') && (fileperms($web . '/media/future') & 0777) === 0755, 'Newly created public ancestor /media/future is 0755');
    $assert(is_dir($nestedPublic) && (fileperms($nestedPublic) & 0777) === 0755, 'Newly created public target /media/future/cinematic is 0755');
    $assert((fileperms($web) & 0777) === 0750, 'Existing webroot remains 0750 after public nested directory creation');

    // -------------------------------------------------------------------------
    // Test 3: Public file copied with mode 0644
    // -------------------------------------------------------------------------
    $srcPayload = $sandbox . '/source_payload.bin';
    file_put_contents($srcPayload, 'synthetic video / asset payload');
    $destPublicFile = $nestedPublic . '/future-runway.mp4';
    $copyMethod->invoke($installer, $srcPayload, $destPublicFile, 0644);
    $assert(is_file($destPublicFile), 'Public destination file was copied');
    $assert((fileperms($destPublicFile) & 0777) === 0644, 'Public file has mode 0644 under umask 0077');

    // -------------------------------------------------------------------------
    // Test 4: Preserving existing private directory 0700
    // -------------------------------------------------------------------------
    $dirMethod->invoke($installer, $app);
    $assert((fileperms($app) & 0777) === 0700, 'Existing private root 0700 is preserved and not modified');

    // -------------------------------------------------------------------------
    // Test 5: New nested private directories created with 0700
    // -------------------------------------------------------------------------
    $nestedPrivate = $app . '/releases/rel_test_rc1/storage/framework/views';
    $dirMethod->invoke($installer, $nestedPrivate);
    $assert(is_dir($app . '/releases') && (fileperms($app . '/releases') & 0777) === 0700, 'Newly created private ancestor /releases is 0700');
    $assert(is_dir($app . '/releases/rel_test_rc1') && (fileperms($app . '/releases/rel_test_rc1') & 0777) === 0700, 'Newly created private ancestor /releases/rel_test_rc1 is 0700');
    $assert(is_dir($app . '/releases/rel_test_rc1/storage') && (fileperms($app . '/releases/rel_test_rc1/storage') & 0777) === 0700, 'Newly created private ancestor /storage is 0700');
    $assert(is_dir($app . '/releases/rel_test_rc1/storage/framework') && (fileperms($app . '/releases/rel_test_rc1/storage/framework') & 0777) === 0700, 'Newly created private ancestor /storage/framework is 0700');
    $assert(is_dir($nestedPrivate) && (fileperms($nestedPrivate) & 0777) === 0700, 'Newly created private target /views is 0700');

    // -------------------------------------------------------------------------
    // Test 6: Private file copied with mode 0600
    // -------------------------------------------------------------------------
    $destPrivateFile = $app . '/releases/rel_test_rc1/secret.key';
    $copyMethod->invoke($installer, $srcPayload, $destPrivateFile, 0600);
    $assert(is_file($destPrivateFile), 'Private destination file was copied');
    $assert((fileperms($destPrivateFile) & 0777) === 0600, 'Private file has mode 0600 under umask 0077');

    // -------------------------------------------------------------------------
    // Test 7: Arbitrary existing directory is NOT blanket chmod'd
    // -------------------------------------------------------------------------
    $existingCustom = $web . '/custom_dir';
    mkdir($existingCustom, 0700);
    chmod($existingCustom, 0700);
    $dirMethod->invoke($installer, $existingCustom);
    $assert((fileperms($existingCustom) & 0777) === 0700, 'Existing directory is untouched (no blanket chmod)');

    // -------------------------------------------------------------------------
    // Test 8: Symlink rejection (directory, ancestor, and file copy)
    // -------------------------------------------------------------------------
    $symlinkDir = $web . '/symlink_dir';
    symlink($web . '/media', $symlinkDir);
    $caughtSymlinkDir = false;
    try {
        $dirMethod->invoke($installer, $symlinkDir);
    } catch (RuntimeException $e) {
        $caughtSymlinkDir = true;
    }
    $assert($caughtSymlinkDir, 'Symlink directory is rejected with RuntimeException');

    $caughtSymlinkAncestor = false;
    try {
        $dirMethod->invoke($installer, $symlinkDir . '/new_child');
    } catch (RuntimeException $e) {
        $caughtSymlinkAncestor = true;
    }
    $assert($caughtSymlinkAncestor, 'Symlink ancestor is rejected with RuntimeException');

    $symlinkFile = $web . '/symlink_file.mp4';
    symlink($destPublicFile, $symlinkFile);
    $caughtSymlinkCopyDest = false;
    try {
        $copyMethod->invoke($installer, $srcPayload, $symlinkFile, 0644);
    } catch (RuntimeException $e) {
        $caughtSymlinkCopyDest = true;
    }
    $assert($caughtSymlinkCopyDest, 'Copying into a symlink destination is rejected');

    $caughtSymlinkCopySrc = false;
    try {
        $copyMethod->invoke($installer, $symlinkFile, $web . '/safe_dest.mp4', 0644);
    } catch (RuntimeException $e) {
        $caughtSymlinkCopySrc = true;
    }
    $assert($caughtSymlinkCopySrc, 'Copying from a symlink source is rejected');

    // -------------------------------------------------------------------------
    // Test 9: Path escape / directory traversal rejection
    // -------------------------------------------------------------------------
    $escapes = [
        $web . '/../escaped_web',
        $home . '/../../escaped_root',
        '/tmp/unauthorized_external_dir',
    ];
    foreach ($escapes as $escape) {
        $caughtEscape = false;
        try {
            $dirMethod->invoke($installer, $escape);
        } catch (RuntimeException) {
            $caughtEscape = true;
        }
        $assert($caughtEscape, "Path escape rejected: {$escape}");
    }

    echo "\nPASS: All {$checkCount} HostPapa installer directory/copy permission regression checks succeeded.\n";
    exit(0);
} finally {
    $rmtree($sandbox);
}
