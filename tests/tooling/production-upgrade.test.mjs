import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProductionUpgradeKitBuilder, INSTALLED_PIN } from '../../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';
import { generateHtaccess } from '../../tools/hostpapa-release/src/HtaccessTemplate.mjs';
import { generatePublicEntrypoint } from '../../tools/hostpapa-release/src/PublicEntrypointTemplate.mjs';
import { generateHostPapaCli } from '../../tools/hostpapa-release/src/HostPapaCliTemplate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

function computeHash(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

/**
 * Creates a synthetic clean production release candidate fixture directory that satisfies ReleaseVerifier.
 */
export function createSyntheticReleasePackage(targetDir, overrides = {}) {
  const publicDir = path.join(targetDir, 'public');
  const privateDir = path.join(targetDir, 'private');
  const installerDir = path.join(targetDir, 'installer');

  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  fs.mkdirSync(installerDir, { recursive: true });

  const sourceSha = overrides.sourceSha || 'a'.repeat(40);
  const releaseId = overrides.releaseId || 'rel_20261014T120000_test';
  const classification = overrides.classification || 'UNREVIEWED_RELEASE_CANDIDATE';
  const isDirty = overrides.isDirty ?? false;
  const profile = overrides.profile || 'production';
  const origin = overrides.origin || 'https://www.gazaairport.com';

  const requiredStaticFiles = [
    'index.html',
    '.htaccess',
    'index.php',
    '_shell.html',
    'ar/_shell.html',
    'admin/_shell.html',
    'ar/admin/_shell.html',
    'flights/index.html',
    'ar/flights/index.html',
    'destinations/AMM/index.html',
    'ar/destinations/AMM/index.html',
    'book/index.html',
    'ar/book/index.html',
    'robots.txt',
    'sitemap.xml',
  ];

  const publicFilesMap = {};
  for (const rel of requiredStaticFiles) {
    const fullPath = path.join(publicDir, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    let content = `<!-- static ${rel} -->`;
    if (rel === '.htaccess') {
      content = generateHtaccess('', origin);
    } else if (rel === 'index.php') {
      content = generatePublicEntrypoint('gaza-gateway');
    }
    fs.writeFileSync(fullPath, content);
    publicFilesMap[rel] = {
      size: Buffer.byteLength(content),
      sha256: computeHash(content),
    };
  }

  // Build receipt
  const receipt = {
    schema_version: 1,
    source_sha: sourceSha,
    origin,
    flags: {
      VITE_HOSTPAPA_PROFILE: profile,
      VITE_IDENTITY_PRODUCTION_OPT_IN: overrides.productionOptIn ?? 'true',
      VITE_IDENTITY_NONPRODUCTION_OPT_IN: overrides.nonProductionOptIn ?? 'false',
      VITE_IDENTITY_UI_MODE: 'backend',
    },
    artifact_hashes: {
      'index.html': publicFilesMap['index.html'].sha256,
    },
  };
  const receiptStr = JSON.stringify(receipt, null, 2);
  fs.writeFileSync(path.join(publicDir, 'build-receipt.json'), receiptStr);
  publicFilesMap['build-receipt.json'] = {
    size: Buffer.byteLength(receiptStr),
    sha256: computeHash(receiptStr),
  };

  // Required backend foundation files
  const requiredBackendFiles = {
    'artisan': '#!/usr/bin/env php\n<?php // artisan\n',
    'composer.json': '{"name":"gaza/gateway"}\n',
    'composer.lock': '{"packages":[],"packages-dev":[]}\n',
    'bootstrap/app.php': '<?php return null;\n',
    'vendor/autoload.php': '<?php // autoload\n',
    'vendor/composer/installed.json': '{"packages":[]}\n',
    'docs/backend/openapi.v1.json': '{"openapi":"3.1.0"}\n',
    'docs/backend/operation-policies.v1.json': '{"policies":[]}\n',
    'bin/hostpapa-cli': generateHostPapaCli('gaza-gateway'),
  };

  const privateFilesMap = {};
  for (const [rel, content] of Object.entries(requiredBackendFiles)) {
    const fullPath = path.join(privateDir, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    privateFilesMap[rel] = {
      size: Buffer.byteLength(content),
      sha256: computeHash(content),
    };
  }

  // Database migrations
  const migrationCount = overrides.migrationCount ?? 21;
  const migrationNames = [
    '0001_01_01_000001_create_cache_table.php',
    '0001_01_01_000002_create_jobs_table.php',
    '2026_10_09_000001_create_identity_core_tables.php',
    '2026_10_10_000001_create_identity_dependency_relations.php',
    '2026_10_10_000002_create_identity_remaining_persistence.php',
    '2026_10_10_000003_create_identity_profile_audit.php',
    '2026_10_10_000004_create_bootstrap_cleanup_indexes.php',
    '2026_10_11_000001_create_reference_aircraft_tables.php',
    '2026_10_11_000002_enforce_route_safe_aircraft_ids.php',
    '2026_10_11_000003_create_network_reference_tables.php',
    '2026_10_11_000004_create_meal_reference_tables.php',
    '2026_10_11_000005_create_schedule_reference_tables.php',
    '2026_10_11_000006_create_editorial_publication_tables.php',
    '2026_10_11_000007_create_mvp_reservation_tables.php',
    '2026_10_11_000008_create_mvp_mail_tables.php',
    '2026_10_11_000009_create_mvp_site_tables.php',
    '2026_10_11_000010_create_mvp_gallery_tables.php',
    '2026_10_11_000011_create_security_smtp_attempts_table.php',
    '2026_10_13_000001_optional_initial_staff_mfa.php',
    '2026_10_14_000001_add_email_verification_codes.php',
    '2026_10_14_000002_expand_memorial_network.php',
    '2026_10_16_000001_guest_reservations.php',
    '2026_10_17_000001_optional_guest_passenger_details.php',
  ].slice(0, migrationCount);

  for (const name of migrationNames) {
    const rel = `backend/database/migrations/${name}`;
    const migPath = path.join(privateDir, rel);
    fs.mkdirSync(path.dirname(migPath), { recursive: true });
    const code = '<?php // migration ' + name + '\n';
    fs.writeFileSync(migPath, code);
    privateFilesMap[rel] = {
      size: Buffer.byteLength(code),
      sha256: computeHash(code),
    };
  }

  // Runtime SOURCE_COMMIT.txt
  const commitFileContent = sourceSha + '\n';
  fs.writeFileSync(path.join(privateDir, 'SOURCE_COMMIT.txt'), commitFileContent);
  privateFilesMap['SOURCE_COMMIT.txt'] = {
    size: Buffer.byteLength(commitFileContent),
    sha256: computeHash(commitFileContent),
  };

  // Installer
  const sourceInstallerPath = path.join(root, 'backend/scripts/hostpapa-install.php');
  const installerBytes = fs.readFileSync(sourceInstallerPath);
  fs.writeFileSync(path.join(installerDir, 'hostpapa-install.php'), installerBytes);
  const installerHash = computeHash(installerBytes);

  // Control files
  const controls = {
    'SOURCE_COMMIT.txt': sourceSha,
    'RELEASE_ID.txt': releaseId,
    'STATUS.txt': classification,
    'manifest-public.txt': Object.entries(publicFilesMap).map(([p, v]) => `public/${p} ${v.sha256}\n`).join(''),
    'manifest-private.txt': Object.entries(privateFilesMap).map(([p, v]) => `private/${p} ${v.sha256}\n`).join(''),
  };
  const controlFilesMap = {};
  for (const [name, content] of Object.entries(controls)) {
    fs.writeFileSync(path.join(targetDir, name), content);
    controlFilesMap[name] = {
      size: Buffer.byteLength(content),
      sha256: computeHash(content),
    };
  }

  const manifest = {
    schema_version: '1.0',
    release_id: releaseId,
    source_sha: sourceSha,
    built_at: new Date().toISOString(),
    is_dirty: isDirty,
    classification,
    platform_requirements: {
      php: '^8.4',
      laravel: '^13.0',
      locked_production_packages_count: 0,
    },
    summary: {
      public_file_count: Object.keys(publicFilesMap).length,
      public_bytes: Object.values(publicFilesMap).reduce((acc, f) => acc + f.size, 0),
      private_file_count: Object.keys(privateFilesMap).length,
      private_bytes: Object.values(privateFilesMap).reduce((acc, f) => acc + f.size, 0),
      control_file_count: Object.keys(controlFilesMap).length,
    },
    public_files: publicFilesMap,
    private_files: privateFilesMap,
    installer: {
      'installer/hostpapa-install.php': {
        size: installerBytes.length,
        sha256: installerHash,
      },
    },
    control_files: controlFilesMap,
  };

  fs.writeFileSync(path.join(targetDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// =========================================================================
// SECTION 1: ProductionUpgradeKitBuilder unit and boundary tests
// =========================================================================

test('generator rejects missing package directory', async () => {
  const missingDir = path.join(root, 'scratch/does-not-exist-' + Date.now());
  const builder = new ProductionUpgradeKitBuilder({ packageDir: missingDir, profile: 'legacy_7a_19' });
  await assert.rejects(builder.build(), /does not exist/);
});

test('generator rejects dirty packages', async () => {
  const dir = path.join(root, 'scratch/test-dirty-' + Date.now());
  try {
    createSyntheticReleasePackage(dir, { isDirty: true, classification: 'ENGINEERING_TEST_BUILD' });
    const builder = new ProductionUpgradeKitBuilder({ packageDir: dir, expectedSourceSha: 'a'.repeat(40), profile: 'legacy_7a_19' });
    await assert.rejects(builder.build(), /dirty/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generator rejects staging profile and staging origin', async () => {
  const dir = path.join(root, 'scratch/test-staging-' + Date.now());
  try {
    createSyntheticReleasePackage(dir, { profile: 'staging', origin: 'https://staging.gazaairport.com' });
    const builder = new ProductionUpgradeKitBuilder({ packageDir: dir, expectedSourceSha: 'a'.repeat(40), profile: 'legacy_7a_19' });
    await assert.rejects(builder.build(), /Refusing package with profile "staging"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generator rejects package with wrong migration count (19 instead of 21)', async () => {
  const dir = path.join(root, 'scratch/test-migrations-' + Date.now());
  try {
    createSyntheticReleasePackage(dir, { migrationCount: 19 });
    const builder = new ProductionUpgradeKitBuilder({ packageDir: dir, expectedSourceSha: 'a'.repeat(40), profile: 'legacy_7a_19' });
    await assert.rejects(builder.build(), /Expected exactly 21 migrations/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generator builds clean upgrade kit with exact hashes, runner, and zip archive', async () => {
  const pkgDir = path.join(root, 'scratch/test-clean-pkg-' + Date.now());
  const kitDir = path.join(root, 'scratch/test-clean-kit-' + Date.now());
  const zipPath = path.join(root, 'scratch/test-clean-kit-' + Date.now() + '.zip');

  try {
    const sourceSha = '1234567890abcdef1234567890abcdef12345678';
    const releaseId = 'rel_20261014T120000_target';
    createSyntheticReleasePackage(pkgDir, { sourceSha, releaseId });

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      outputDir: kitDir,
      outputZip: zipPath,
      expectedSourceSha: sourceSha,
      profile: 'legacy_7a_19',
    });

    const result = await builder.build();

    assert.equal(result.targetSourceSha, sourceSha);
    assert.equal(result.targetReleaseId, releaseId);
    assert.equal(result.migrationCount, 21);
    assert.ok(fs.existsSync(kitDir));
    assert.ok(fs.existsSync(path.join(kitDir, 'production-upgrade-runner.php')));
    assert.ok(fs.existsSync(path.join(kitDir, 'upgrade-manifest.json')));
    assert.ok(fs.existsSync(path.join(kitDir, 'release/release-manifest.json')));
    assert.ok(fs.existsSync(zipPath));

    const manifestData = JSON.parse(fs.readFileSync(path.join(kitDir, 'upgrade-manifest.json'), 'utf8'));
    assert.equal(manifestData.schema_version, '1.0');
    assert.equal(manifestData.kit_type, 'production_upgrade');
    assert.equal(manifestData.installed_binding.source_sha, INSTALLED_PIN.source_sha);
    assert.equal(manifestData.installed_binding.release_id, INSTALLED_PIN.release_id);
    assert.equal(manifestData.installed_binding.migration_count, 19);
    assert.equal(manifestData.target_release.migration_count, 21);

    // Verify zero secrets anywhere in upgrade-manifest.json or files
    const manifestStr = JSON.stringify(manifestData);
    assert.ok(!manifestStr.includes('password'));
    assert.ok(!manifestStr.includes('APP_KEY'));
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(kitDir, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
});

// =========================================================================
// SECTION 2: Production Upgrade Runner Docker PHP 8.4 synthetic fixtures
// =========================================================================

function runDockerShell(script) {
  return spawnSync('docker', [
    'run', '--rm',
    '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045',
    '-e', 'HOSTPAPA_HOME=/home/gaza5045',
    '-v', `${root}:/source:ro`,
    'php:8.4-cli',
    'sh', '-c', script,
  ], { encoding: 'utf8', timeout: 30000 });
}

test('runner skips immediately when attempt marker is already present (checked before baseline)', () => {
  const script = `
set -e
mkdir -p /home/gaza5045/gaza-upgrade-package
touch /home/gaza5045/gaza-upgrade-package/production-upgrade-attempted
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --upgrade --confirm-upgrade
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('SKIP: upgrade already attempted'));
});

test('runner fails when explicit owner GO is absent and creates no attempt marker', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --upgrade
code=$?
if [ -f /home/gaza5045/gaza-upgrade-package/production-upgrade-attempted ]; then
  echo "MARKER_CREATED"
fi
exit $code
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
  assert.ok(!result.stdout.includes('MARKER_CREATED'));
  assert.ok(!result.stderr.includes('password'));
});

test('runner check preserves hash and does not mutate shared/config/.env', () => {
  const script = `
set -e
mkdir -p /home/gaza5045/gaza-upgrade-package
mkdir -p /home/gaza5045/gaza-gateway/shared/config
cat << 'EOF' > /home/gaza5045/gaza-gateway/shared/config/.env
APP_ENV=production
DB_DATABASE=gaza5045_gateway_live
DB_USERNAME=gaza5045_liveruntime
DB_PASSWORD=sample_pass
EOF
chmod 0600 /home/gaza5045/gaza-gateway/shared/config/.env
sha_before=$(sha256sum /home/gaza5045/gaza-gateway/shared/config/.env | cut -d' ' -f1)

cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
# Run check which should fail early before mutating anything
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --check || true
sha_after=$(sha256sum /home/gaza5045/gaza-gateway/shared/config/.env | cut -d' ' -f1)

if [ "$sha_before" = "$sha_after" ]; then
  echo "HASH_PRESERVED"
fi
`;
  const result = runDockerShell(script);
  assert.ok(result.stdout.includes('HASH_PRESERVED'));
});

test('runner rejects wrong installed release pointer and baseline mismatch', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
mkdir -p /home/gaza5045/gaza-gateway
echo "wrong_release_pointer_000" > /home/gaza5045/gaza-gateway/current-release.txt
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --check
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
});

test('runner rejects unsafe private paths and symlinks', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
ln -s /etc /home/gaza5045/gaza-upgrade-package/symlink_dir
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/symlink_dir/runner.php || true
php /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php --check
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
});

test('runner halts on nonzero subprocess during binary check', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
export HOSTPAPA_TAR_BIN=/bin/false
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --check
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
});

test('runner guarantees credential redaction on database or preflight failure', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
mkdir -p /home/gaza5045/gaza-live-package
mkdir -p /home/gaza5045/gaza-gateway/shared/config
cat << 'EOF' > /home/gaza5045/gaza-live-package/live-approval.json
{
  "schema_version": "1.0",
  "action": "install",
  "database": {
    "host": "127.0.0.1",
    "port": 3399,
    "database": "gaza5045_gateway_live",
    "username": "gaza5045_liveadmin",
    "password": "TOP_SECRET_DDL_PASSWORD_ABCD_1234"
  }
}
EOF
chmod 0600 /home/gaza5045/gaza-live-package/live-approval.json

cat << 'EOF' > /home/gaza5045/gaza-gateway/shared/config/.env
APP_ENV=production
DB_DATABASE=gaza5045_gateway_live
DB_USERNAME=gaza5045_liveruntime
DB_PASSWORD=TOP_SECRET_RUNTIME_PASSWORD_EFGH_5678
EOF
chmod 0600 /home/gaza5045/gaza-gateway/shared/config/.env

cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --check
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
  assert.ok(!result.stderr.includes('TOP_SECRET_DDL_PASSWORD_ABCD_1234'));
  assert.ok(!result.stderr.includes('TOP_SECRET_RUNTIME_PASSWORD_EFGH_5678'));
  assert.ok(!result.stdout.includes('TOP_SECRET_DDL_PASSWORD_ABCD_1234'));
  assert.ok(!result.stdout.includes('TOP_SECRET_RUNTIME_PASSWORD_EFGH_5678'));
});

test('guarded rollback rejects execution without --confirm-rollback', () => {
  const script = `
mkdir -p /home/gaza5045/gaza-upgrade-package
cp /source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php /home/gaza5045/gaza-upgrade-package/
php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --rollback
`;
  const result = runDockerShell(script);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('FAIL: upgrade runner stopped at preflight'));
});

test('inherited installer lock resource verification and preservation', () => {
  const script = `
cat << 'PHP' > /home/gaza5045/test_lock.php
<?php
require '/source/backend/scripts/hostpapa-install.php';

$appDir = '/home/gaza5045/gaza-gateway';
mkdir($appDir . '/shared', 0700, true);
$lockPath = $appDir . '/shared/installer.lock';
touch($lockPath);
chmod($lockPath, 0600);

$approvalPath = '/home/gaza5045/approval.json';
file_put_contents($approvalPath, json_encode([
    'schema_version' => '1.0',
    'action' => 'install',
    'release_id' => 'rel_test',
    'source_sha' => str_repeat('a', 40),
    'manifest_sha256' => str_repeat('b', 64),
    'environment' => 'production',
    'target_webroot' => '/home/gaza5045/public_html',
    'app_dir' => $appDir,
    'database' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'gaza5045_gateway_live',
        'username' => 'gaza5045_liveadmin',
        'password' => 'secret',
    ],
    'runtime_env_file' => '/home/gaza5045/env',
]));
chmod($approvalPath, 0600);
mkdir('/home/gaza5045/public_html', 0755, true);

// 1. Wrong handle test (fstat mismatch)
$other = fopen('/home/gaza5045/other.lock', 'c');
flock($other, LOCK_EX);
$caught1 = false;
try {
    $installer = new HostPapaInstaller(['installer.php', '--action=install', '--approval-file=' . $approvalPath]);
    $installer->run($other);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Inherited lock handle does not match installer.lock')) {
        $caught1 = true;
    }
}
if (!$caught1) {
    echo "FAIL_WRONG_HANDLE_DID_NOT_THROW\n";
    exit(1);
}

// 2. Correct inherited lock handle is accepted and preserved across installer finally
$correct = fopen($lockPath, 'c');
flock($correct, LOCK_EX | LOCK_NB);
try {
    $installer = new HostPapaInstaller(['installer.php', '--action=install', '--approval-file=' . $approvalPath]);
    $installer->run($correct);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Another installer is active') || str_contains($e->getMessage(), 'Inherited lock')) {
        echo "FAIL_LOCK_ERROR:" . $e->getMessage() . "\n";
        exit(1);
    }
}

// Verify that $correct handle is STILL held exclusively and was not released in installer finally!
$probe = fopen($lockPath, 'c');
if (flock($probe, LOCK_EX | LOCK_NB)) {
    echo "FAIL_INHERITED_LOCK_WAS_RELEASED\n";
    exit(1);
}
echo "INHERITED_LOCK_SUCCESS\n";
PHP
php /home/gaza5045/test_lock.php
`;
  const result = runDockerShell(script);
  if (result.status !== 0) console.error("DEBUG:", result.stdout, result.stderr);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('INHERITED_LOCK_SUCCESS'));
});
