import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  ProductionUpgradeKitBuilder,
  BASELINE_PROFILES,
  renderRunnerForProfile,
} from '../../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';
import { generateHtaccess } from '../../tools/hostpapa-release/src/HtaccessTemplate.mjs';
import { generatePublicEntrypoint } from '../../tools/hostpapa-release/src/PublicEntrypointTemplate.mjs';
import { generateHostPapaCli } from '../../tools/hostpapa-release/src/HostPapaCliTemplate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
process.env.NODE_ENV = 'test';

function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeHash(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

function createSyntheticReleasePackage(targetDir, overrides = {}) {
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

  const migrationCount = overrides.migrationCount ?? 27;
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
    '2026_10_21_000001_add_osl_arn_destinations.php',
    '2026_10_21_000001_create_archive_contributions_tables.php',
    '2026_10_23_000001_create_analytics_and_monthly_reports_tables.php',
    '2026_10_23_000002_add_contribution_metadata_fields.php',
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

  const commitFileContent = sourceSha + '\n';
  fs.writeFileSync(path.join(privateDir, 'SOURCE_COMMIT.txt'), commitFileContent);
  privateFilesMap['SOURCE_COMMIT.txt'] = {
    size: Buffer.byteLength(commitFileContent),
    sha256: computeHash(commitFileContent),
  };

  const sourceInstallerPath = path.join(root, 'backend/scripts/hostpapa-install.php');
  const installerBytes = fs.readFileSync(sourceInstallerPath);
  fs.writeFileSync(path.join(installerDir, 'hostpapa-install.php'), installerBytes);
  const installerHash = computeHash(installerBytes);

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

test('profile registry contains closed installed_0aac_25 profile with exact pinned metadata', () => {
  const p = BASELINE_PROFILES.installed_0aac_25;
  assert.ok(p, 'installed_0aac_25 profile must exist');
  assert.equal(p.id, 'installed_0aac_25');
  assert.equal(p.source_sha, '0aacf1452d47bbf5660f060a718409dfff32a54c');
  assert.equal(p.release_id, 'rel_20261021T164700_0aacf14_clean');
  assert.equal(p.manifest_sha256, 'efb2e5378fe3403715f2f6d10ea8c4493a5c177bcd916b8d7dccfac4dd88c800');
  assert.equal(p.migration_count, 25);
  assert.equal(p.target_migration_count, 27);
  assert.equal(p.kit_folder, 'gaza-upgrade-package-0aac');
  assert.equal(p.rollback_policy, 'forward_only_27_analytics_provenance');
});

test('renderRunnerForProfile renders exact 0aac constants, folder, target 27 migrations, and closed forward-only rollback predicate (superseding 23-airport and guest bounds)', () => {
  const rendered = renderRunnerForProfile('installed_0aac_25');

  // Verify kit root folder
  assert.ok(rendered.includes("$kitRoot = $home . '/gaza-upgrade-package-0aac';"));

  // Verify exact installed 0aac constants and target 27 migrations
  assert.ok(rendered.includes("const INSTALLED_SOURCE_SHA = '0aacf1452d47bbf5660f060a718409dfff32a54c';"));
  assert.ok(rendered.includes("const INSTALLED_RELEASE_ID = 'rel_20261021T164700_0aacf14_clean';"));
  assert.ok(rendered.includes("const INSTALLED_MANIFEST_SHA = 'efb2e5378fe3403715f2f6d10ea8c4493a5c177bcd916b8d7dccfac4dd88c800';"));
  assert.ok(rendered.includes("const INSTALLED_MIGRATIONS = 25;"));
  assert.ok(rendered.includes("const TARGET_MIGRATIONS = 27;"));

  // Outdated guest-null / airport rules must NOT be rendered for actual 0aac baseline
  assert.ok(!rendered.includes("'OSL', 'ARN'"));
  assert.ok(!rendered.includes('Guest reservation data requires a compatible forward repair'));
  assert.ok(!rendered.includes('Guest passenger data requires a compatible forward repair'));

  // Verify closed forward-only recovery predicate with clear 27-migration analytics/provenance reason
  assert.ok(rendered.includes('function assertRollbackCompatible(PDO $pdo): void {'));
  assert.ok(rendered.includes("throw new RuntimeException('Candidate 27-migration release with analytics telemetry and archive provenance requires reviewed forward repair; blind old-code rollback refused.');"));

  // Verify preflight PASS message
  assert.ok(rendered.includes('PASS: verified baseline source 0aacf14, active release rel_20261021T164700_0aacf14_clean, 25 migrations, and upgrade candidate package.'));

  // Verify target 27 messages
  assert.ok(rendered.includes('Expected 27 migrations after upgrade'));
  assert.ok(rendered.includes('PASS: release installed, migrations verified at 27'));
  assert.ok(rendered.includes('27 migration identities verified'));

  // Executed PHP fixture: extract actual generated predicate and invoke with SQLite memory PDO;
  // assert RuntimeException regardless of baseline guest/tables
  const fnMatch = rendered.match(/function assertRollbackCompatible\(PDO \$pdo\): void\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'assertRollbackCompatible definition must be extractable from rendered runner');
  const extractedFn = fnMatch[0];

  const phpScript = `
${extractedFn}

\$pdo = new PDO('sqlite::memory:');
\$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Test 1: Empty database (no tables created)
\$threwEmpty = false;
try {
    assertRollbackCompatible(\$pdo);
} catch (RuntimeException \$e) {
    \$threwEmpty = true;
    if (strpos(\$e->getMessage(), '27-migration') === false || strpos(\$e->getMessage(), 'analytics') === false || strpos(\$e->getMessage(), 'provenance') === false) {
        fwrite(STDERR, "Exception message missing required tokens: " . \$e->getMessage() . "\\n");
        exit(1);
    }
}
if (!\$threwEmpty) {
    fwrite(STDERR, "assertRollbackCompatible failed to throw on empty database\\n");
    exit(2);
}

// Test 2: Database with populated baseline airport and guest tables
\$pdo->exec("CREATE TABLE airports (code TEXT, block_minutes INTEGER)");
\$pdo->exec("INSERT INTO airports VALUES ('GZA', 60), ('OSL', 120)");
\$pdo->exec("CREATE TABLE mvp_reservations (id INTEGER, owner_user_id INTEGER)");
\$pdo->exec("INSERT INTO mvp_reservations VALUES (1, 100)");
\$pdo->exec("CREATE TABLE mvp_reservation_passengers (id INTEGER, last_name TEXT, dob TEXT, nationality TEXT, document TEXT)");
\$pdo->exec("INSERT INTO mvp_reservation_passengers VALUES (1, 'Al-Masri', '1990-01-01', 'PS', 'P0001')");

\$threwPopulated = false;
try {
    assertRollbackCompatible(\$pdo);
} catch (RuntimeException \$e) {
    \$threwPopulated = true;
    if (strpos(\$e->getMessage(), 'reviewed forward repair') === false) {
        fwrite(STDERR, "Exception message missing reviewed forward repair: " . \$e->getMessage() . "\\n");
        exit(3);
    }
}
if (!\$threwPopulated) {
    fwrite(STDERR, "assertRollbackCompatible failed to throw on populated baseline database\\n");
    exit(4);
}

echo "UNCONDITIONAL_FORWARD_REPAIR_VERIFIED";
`;

  const res = spawnSync('php', ['-r', phpScript], { encoding: 'utf8' });
  assert.equal(res.status, 0, `PHP fixture execution failed: ${res.stderr}`);
  assert.ok(res.stdout.includes('UNCONDITIONAL_FORWARD_REPAIR_VERIFIED'));
});

test('builder constructor rejects target 27 migrations when profile is not installed_0aac_25', () => {
  for (const prof of ['legacy_7a_19', 'b3_21', 'installed_965_21']) {
    assert.throws(
      () => new ProductionUpgradeKitBuilder({
        packageDir: path.join(root, 'scratch'),
        profile: prof,
        expectedMigrationCount: 27,
      }),
      /Target release with 27 migrations requires --profile=installed_0aac_25/
    );
  }
});

test('builder constructor rejects target release 26e31557f894c5a744da47d7abb9b25172c21e8c without installed_0aac_25', () => {
  for (const prof of ['legacy_7a_19', 'b3_21', 'installed_965_21']) {
    assert.throws(
      () => new ProductionUpgradeKitBuilder({
        packageDir: path.join(root, 'scratch'),
        profile: prof,
        expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      }),
      /Release 26e31557f894c5a744da47d7abb9b25172c21e8c requires --profile=installed_0aac_25/
    );
  }
});

test('builder rejects installed_0aac_25 without --installed-manifest', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-0aac-noman-' + Date.now());
  fs.mkdirSync(pkgDir, { recursive: true });
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_0aac_25',
      expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
    });
    await assert.rejects(builder.build(), /Profile installed_0aac_25 requires explicit --installed-manifest/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder rejects installed_0aac_25 when installed manifest checksum does not match pinned value', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-0aac-badhash-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-man-0aac-badhash-' + Date.now());
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.mkdirSync(manifestDir, { recursive: true });
  const badManifest = path.join(manifestDir, 'bad-manifest.json');
  fs.writeFileSync(badManifest, '{"wrong":true}');
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_0aac_25',
      expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      installedManifest: badManifest,
    });
    await assert.rejects(builder.build(), /Installed manifest checksum mismatch: expected efb2e5378fe3403715f2f6d10ea8c4493a5c177bcd916b8d7dccfac4dd88c800/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('builder rejects candidate package with 25 migrations when profile is installed_0aac_25', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-0aac-25mig-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-man-0aac-25mig-' + Date.now());
  try {
    const candidateManifest = createSyntheticReleasePackage(pkgDir, {
      sourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      migrationCount: 25,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manPath = path.join(manifestDir, 'installed-manifest.json');

    const installedManifestObj = {
      source_sha: '0aacf1452d47bbf5660f060a718409dfff32a54c',
      release_id: 'rel_20261021T164700_0aacf14_clean',
      private_files: candidateManifest.private_files,
    };
    const dummyContent = JSON.stringify(installedManifestObj, null, 2);
    fs.writeFileSync(manPath, dummyContent);

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_0aac_25',
      expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      installedManifest: manPath,
    });
    builder.installedBinding = {
      ...builder.installedBinding,
      manifest_sha256: computeSha256(dummyContent),
    };

    await assert.rejects(
      builder.build(),
      /Expected exactly 27 migrations in new release candidate, found 25/
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('builder successfully packages candidate with 27 migrations for installed_0aac_25', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-0aac-valid-' + Date.now());
  const kitDir = path.join(root, 'scratch/test-kit-0aac-valid-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-man-0aac-valid-' + Date.now());
  try {
    const candidateManifest = createSyntheticReleasePackage(pkgDir, {
      sourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      migrationCount: 27,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manPath = path.join(manifestDir, 'installed-manifest.json');

    const baselineEntries = Object.entries(candidateManifest.private_files || {})
      .filter(([relPath]) => /^backend\/database\/migrations\/[a-zA-Z0-9_]+\.php$/.test(relPath))
      .filter(([relPath]) => !relPath.includes('2026_10_23_000001_create_analytics_and_monthly_reports_tables.php')
                          && !relPath.includes('2026_10_23_000002_add_contribution_metadata_fields.php'));
    assert.equal(baselineEntries.length, 25, 'Baseline must have exactly 25 migrations');

    const installedManifestObj = {
      source_sha: '0aacf1452d47bbf5660f060a718409dfff32a54c',
      release_id: 'rel_20261021T164700_0aacf14_clean',
      private_files: Object.fromEntries(baselineEntries),
    };
    const dummyContent = JSON.stringify(installedManifestObj, null, 2);
    fs.writeFileSync(manPath, dummyContent);

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      outputDir: kitDir,
      profile: 'installed_0aac_25',
      expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      installedManifest: manPath,
    });
    builder.installedBinding = {
      ...builder.installedBinding,
      manifest_sha256: computeSha256(dummyContent),
    };

    const result = await builder.build();
    assert.equal(result.profile, 'installed_0aac_25');
    assert.equal(result.migrationCount, 27);
    assert.equal(result.installedBinding.source_sha, '0aacf1452d47bbf5660f060a718409dfff32a54c');

    // Verify upgrade-manifest.json
    const manifestPath = path.join(kitDir, 'upgrade-manifest.json');
    assert.ok(fs.existsSync(manifestPath));
    const upMan = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(upMan.profile, 'installed_0aac_25');
    assert.equal(upMan.target_release.migration_count, 27);
    assert.equal(upMan.installed_binding.migration_count, 25);
    assert.equal(upMan.installed_binding.source_sha, '0aacf1452d47bbf5660f060a718409dfff32a54c');

    // Verify rendered runner is in the kit
    const runnerPath = path.join(kitDir, 'production-upgrade-runner.php');
    assert.ok(fs.existsSync(runnerPath));
    const runnerContent = fs.readFileSync(runnerPath, 'utf8');
    assert.ok(runnerContent.includes("const INSTALLED_MIGRATIONS = 25;"));
    assert.ok(runnerContent.includes("const TARGET_MIGRATIONS = 27;"));
    assert.ok(runnerContent.includes("gaza-upgrade-package-0aac"));
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(kitDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('builder rejects candidate when baseline migration checksum is tampered in installed manifest', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-0aac-tampered-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-man-0aac-tampered-' + Date.now());
  try {
    const candidateManifest = createSyntheticReleasePackage(pkgDir, {
      sourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      migrationCount: 27,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manPath = path.join(manifestDir, 'installed-manifest.json');

    const baselineEntries = Object.entries(candidateManifest.private_files || {})
      .filter(([relPath]) => /^backend\/database\/migrations\/[a-zA-Z0-9_]+\.php$/.test(relPath))
      .filter(([relPath]) => !relPath.includes('2026_10_23_000001_create_analytics_and_monthly_reports_tables.php')
                          && !relPath.includes('2026_10_23_000002_add_contribution_metadata_fields.php'));
    assert.equal(baselineEntries.length, 25);

    // Tamper the hash of one baseline migration
    const tamperedEntries = baselineEntries.map(([k, v], idx) => [
      k,
      idx === 0 ? { ...v, sha256: '0'.repeat(64) } : v
    ]);

    // Re-order map check: reverse key order to assert map ordering does not bypass comparison
    tamperedEntries.reverse();

    const installedManifestObj = {
      source_sha: '0aacf1452d47bbf5660f060a718409dfff32a54c',
      release_id: 'rel_20261021T164700_0aacf14_clean',
      private_files: Object.fromEntries(tamperedEntries),
    };
    const dummyContent = JSON.stringify(installedManifestObj, null, 2);
    fs.writeFileSync(manPath, dummyContent);

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_0aac_25',
      expectedSourceSha: '26e31557f894c5a744da47d7abb9b25172c21e8c',
      installedManifest: manPath,
    });
    builder.installedBinding = {
      ...builder.installedBinding,
      manifest_sha256: computeSha256(dummyContent),
    };

    await assert.rejects(
      builder.build(),
      /Schema compatibility failure: candidate migration .* bytes differ from baseline/
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('runner deadline handler fixture throws UpgradeDiagnosticException, cancels alarm, and generates guarded failure receipt', () => {
  const runnerFile = path.resolve('tools/hostpapa-release/production-upgrade/production-upgrade-runner.php');
  const runnerSrc = fs.readFileSync(runnerFile, 'utf8');

  // Verify that the code defining handleDeadlineExceeded and receipt generator exists in runner
  assert.ok(runnerSrc.includes('function handleDeadlineExceeded()'));
  assert.ok(runnerSrc.includes("'DEADLINE_EXCEEDED'"));
  assert.ok(runnerSrc.includes("'STOP_FOR_REVIEWED_FORWARD_COMPLETION'"));
  assert.ok(runnerSrc.includes('Partial DDL or timeout requires reviewed forward completion'));

  // Extract actual UpgradeDiagnosticException, ALLOWED_REASON_CODES, handleDeadlineExceeded and catch block from runner source
  const diagStart = runnerSrc.indexOf('const ALLOWED_REASON_CODES = [');
  const diagEnd = runnerSrc.indexOf('function safePath', diagStart);
  assert.ok(diagStart !== -1 && diagEnd !== -1 && diagEnd > diagStart);
  const diagCode = runnerSrc.slice(diagStart, diagEnd);

  const fnStart = runnerSrc.indexOf('function handleDeadlineExceeded(): void {');
  const fnEnd = runnerSrc.indexOf('function assertExactRuntimeConnection', fnStart);
  assert.ok(fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart);
  const fnCode = runnerSrc.slice(fnStart, fnEnd);

  const catchIdx = runnerSrc.lastIndexOf('} catch (Throwable $e) {');
  const finallyIdx = runnerSrc.lastIndexOf('} finally {');
  assert.ok(catchIdx !== -1 && finallyIdx !== -1 && finallyIdx > catchIdx);
  const catchBlock = runnerSrc.slice(catchIdx + 2, finallyIdx + 1);

  // Set up isolated temp environment for fixture
  const tempDir = fs.mkdtempSync(path.join(root, 'scratch/test-deadline-fixture-'));
  const kitRoot = path.join(tempDir, 'kit');
  fs.mkdirSync(kitRoot, { recursive: true });
  const maintenancePath = path.join(tempDir, 'maintenance.json');
  fs.writeFileSync(maintenancePath, JSON.stringify({ active: true }));
  const markerPath = path.join(kitRoot, '.upgrade-attempt-marker');
  fs.writeFileSync(markerPath, 'attempt_1');

  try {
    const kitRootEscaped = kitRoot.replace(/\\/g, '/');
    const maintenancePathEscaped = maintenancePath.replace(/\\/g, '/');

    const phpScript = `
${diagCode}

${fnCode}

$ownsKitLock = true;
$kitRoot = '${kitRootEscaped}';
$maintenancePath = '${maintenancePathEscaped}';
$maintenanceSet = true;
$stage = 'preflight';
$activePhase = 'preflight';
$activeCheckpoint = 'preflight_start';
$preflightCheckpoint = 'preflight_start';
$preflightSubstep = 'check_baseline';
$invocationId = 'inv_test_deadline';
$mode = 'upgrade';
$startTime = gmdate('c');
$phpVersion = PHP_VERSION;
$runnerHash = str_repeat('a', 64);
$upgradeManifestHash = str_repeat('b', 64);
$targetSourceSha = '26e31557f894c5a744da47d7abb9b25172c21e8c';

try {
    handleDeadlineExceeded();
} ${catchBlock}
`;

    const res = spawnSync('php', ['-r', phpScript], { encoding: 'utf8' });
    assert.equal(res.status, 0, `PHP deadline fixture execution failed: ${res.stderr}`);
    assert.ok(res.stderr.includes('FAIL: upgrade runner stopped at preflight [DEADLINE_EXCEEDED]'));

    const lastFailurePath = path.join(kitRoot, 'production-upgrade-last-failure.json');
    assert.ok(fs.existsSync(lastFailurePath), 'production-upgrade-last-failure.json must be generated');
    const receipt = JSON.parse(fs.readFileSync(lastFailurePath, 'utf8'));

    assert.equal(receipt.outcome, 'FAIL');
    assert.equal(receipt.reason_code, 'DEADLINE_EXCEEDED');
    assert.equal(receipt.failure_checkpoint, 'preflight_start');
    assert.equal(receipt.recovery_disposition, 'STOP_FOR_REVIEWED_FORWARD_COMPLETION');
    assert.equal(receipt.error_class, 'UpgradeDiagnosticException');
    assert.equal(receipt.maintenance_retained, true);
    assert.equal(receipt.maintenance_observed, true);
    assert.ok(receipt.guarded_recovery_note.includes('Partial DDL or timeout requires reviewed forward completion'));

    // Verify maintenance and attempt marker are retained, and no success receipt was written
    assert.ok(fs.existsSync(maintenancePath), 'Maintenance file must be retained');
    assert.ok(fs.existsSync(markerPath), 'Attempt marker must be retained');
    assert.ok(!fs.existsSync(path.join(kitRoot, 'production-upgrade-success.json')), 'No success receipt should exist');
    assert.ok(!fs.existsSync(path.join(kitRoot, 'production-upgrade-result.json')), 'No result success receipt should exist');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('database preservation verification correctly handles baseline-column projections, additive metadata defaults, and rejects tampering', () => {
  const runnerFile = path.resolve('tools/hostpapa-release/production-upgrade/production-upgrade-runner.php');
  const runnerSrc = fs.readFileSync(runnerFile, 'utf8');

  // Extract preservation functions from runner to ensure we test the actual runner code directly
  const fnNames = [
    'tableExists',
    'getTableColumns',
    'captureBaselineProjections',
    'captureBaselineRowCounts',
    'preservationDigests',
    'validateAdditiveMetadataDefaults',
    'validateNewAnalyticsTables',
  ];
  for (const name of fnNames) {
    assert.ok(runnerSrc.includes(`function ${name}(`), `Runner must define function ${name}`);
  }

  // Slice the block of helper functions directly from the runner source
  const startIdx = runnerSrc.indexOf('function tableExists');
  const endIdx = runnerSrc.indexOf('function privateInput');
  assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx);
  const helpersCode = runnerSrc.slice(startIdx, endIdx);

  const phpScript = `
${helpersCode}

function setupDb() {
    \$pdo = new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    \$pdo->exec("CREATE TABLE airports (
        code VARCHAR(3) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        block_minutes INT NOT NULL
    )");
    \$pdo->exec("CREATE TABLE archive_contributions (
        id INT PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT NOT NULL
    )");
    \$pdo->exec("INSERT INTO airports VALUES ('GZA', 'Gaza International Airport', 120)");
    \$pdo->exec("INSERT INTO airports VALUES ('AMM', 'Queen Alia International Airport', 45)");
    \$pdo->exec("INSERT INTO archive_contributions VALUES (1, 'Archive Photo 1', 'Historic tarmac')");
    \$pdo->exec("INSERT INTO archive_contributions VALUES (2, 'Archive Document 2', 'Boarding pass')");
    return \$pdo;
}

// Case 1: correctadditivedefaults
\$pdo1 = setupDb();
\$projections1 = captureBaselineProjections(\$pdo1);
\$digestsBefore1 = preservationDigests(\$pdo1, \$projections1);
\$countsBefore1 = captureBaselineRowCounts(\$pdo1, array_keys(\$projections1));

// Migration: add additive columns with defaults and new empty analytics tables
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN chapter VARCHAR(32) NULL");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN approximate_date VARCHAR(100) NULL");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN location VARCHAR(200) NULL");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN credit VARCHAR(254) NULL");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN rights_status VARCHAR(32) NOT NULL DEFAULT 'unknown'");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN source_note TEXT NULL");
\$pdo1->exec("ALTER TABLE archive_contributions ADD COLUMN reference_url VARCHAR(2000) NULL");

\$pdo1->exec("CREATE TABLE analytics_sessions (visitor_id VARCHAR(64) PRIMARY KEY)");
\$pdo1->exec("CREATE TABLE analytics_events (id VARCHAR(36) PRIMARY KEY)");
\$pdo1->exec("CREATE TABLE analytics_monthly_reports (id VARCHAR(36) PRIMARY KEY)");
\$pdo1->exec("CREATE TABLE analytics_report_settings (id INT PRIMARY KEY, revision INT NOT NULL, enabled INT NOT NULL, recipient_email VARCHAR(254) NOT NULL, updated_by VARCHAR(36) NOT NULL)");
\$pdo1->exec("INSERT INTO analytics_report_settings VALUES (1, 1, 0, 'notifications@gazaairport.com', '00000000-0000-0000-0000-000000000000')");

\$digestsAfter1 = preservationDigests(\$pdo1, \$projections1);
\$countsAfter1 = captureBaselineRowCounts(\$pdo1, array_keys(\$projections1));
if (\$digestsBefore1 !== \$digestsAfter1) {
    throw new Exception("FAIL: Case 1 preservationDigests differed on additive columns");
}
if (\$countsBefore1 !== \$countsAfter1) {
    throw new Exception("FAIL: Case 1 row counts differed");
}
validateAdditiveMetadataDefaults(\$pdo1);
validateNewAnalyticsTables(\$pdo1);

// Case 2: mutated oldfield
\$pdo2 = setupDb();
\$projections2 = captureBaselineProjections(\$pdo2);
\$digestsBefore2 = preservationDigests(\$pdo2, \$projections2);
\$pdo2->exec("UPDATE archive_contributions SET title = 'Tampered Title' WHERE id = 1");
\$digestsAfter2 = preservationDigests(\$pdo2, \$projections2);
if (\$digestsBefore2 === \$digestsAfter2) {
    throw new Exception("FAIL: Case 2 mutated oldfield was not detected");
}

// Case 3: unexpectednewmetadata
\$pdo3 = setupDb();
\$projections3 = captureBaselineProjections(\$pdo3);
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN chapter VARCHAR(32) NULL");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN approximate_date VARCHAR(100) NULL");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN location VARCHAR(200) NULL");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN credit VARCHAR(254) NULL");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN rights_status VARCHAR(32) NOT NULL DEFAULT 'unknown'");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN source_note TEXT NULL");
\$pdo3->exec("ALTER TABLE archive_contributions ADD COLUMN reference_url VARCHAR(2000) NULL");
// Preexisting row given unexpected metadata
\$pdo3->exec("UPDATE archive_contributions SET rights_status = 'owned_authorized' WHERE id = 1");
\$caughtUnexpected = false;
try {
    validateAdditiveMetadataDefaults(\$pdo3);
} catch (RuntimeException \$e) {
    \$caughtUnexpected = true;
}
if (!\$caughtUnexpected) {
    throw new Exception("FAIL: Case 3 unexpected new metadata was not rejected");
}

// Case 4: missingrow
\$pdo4 = setupDb();
\$projections4 = captureBaselineProjections(\$pdo4);
\$digestsBefore4 = preservationDigests(\$pdo4, \$projections4);
\$countsBefore4 = captureBaselineRowCounts(\$pdo4, array_keys(\$projections4));
\$pdo4->exec("DELETE FROM archive_contributions WHERE id = 1");
\$digestsAfter4 = preservationDigests(\$pdo4, \$projections4);
\$countsAfter4 = captureBaselineRowCounts(\$pdo4, array_keys(\$projections4));
if (\$digestsBefore4 === \$digestsAfter4 || \$countsBefore4 === \$countsAfter4) {
    throw new Exception("FAIL: Case 4 deleted row was not detected");
}

// Case 5: unexpected new table rows
\$pdo5 = setupDb();
\$pdo5->exec("CREATE TABLE analytics_sessions (visitor_id VARCHAR(64) PRIMARY KEY)");
\$pdo5->exec("INSERT INTO analytics_sessions VALUES ('visitor_123')");
\$caughtNewTable = false;
try {
    validateNewAnalyticsTables(\$pdo5);
} catch (RuntimeException \$e) {
    \$caughtNewTable = true;
}
if (!\$caughtNewTable) {
    throw new Exception("FAIL: Case 5 unexpected new table rows were not rejected");
}

// Case 6: tampered analytics report settings default row
\$pdo6 = setupDb();
\$pdo6->exec("CREATE TABLE analytics_report_settings (id INT PRIMARY KEY, revision INT NOT NULL, enabled INT NOT NULL, recipient_email VARCHAR(254) NOT NULL, updated_by VARCHAR(36) NOT NULL)");
\$pdo6->exec("INSERT INTO analytics_report_settings VALUES (1, 1, 1, 'tampered@gazaairport.com', '00000000-0000-0000-0000-000000000000')");
\$caughtTamperedSettings = false;
try {
    validateNewAnalyticsTables(\$pdo6);
} catch (RuntimeException \$e) {
    \$caughtTamperedSettings = true;
}
if (!\$caughtTamperedSettings) {
    throw new Exception("FAIL: Case 6 tampered analytics settings were not rejected");
}

echo "ALL_PRESERVATION_TESTS_PASSED";
`;

  const res = spawnSync('php', ['-r', phpScript], { encoding: 'utf8' });
  assert.equal(res.status, 0, `Preservation test execution failed: ${res.stderr}`);
  assert.ok(res.stdout.includes('ALL_PRESERVATION_TESTS_PASSED'));
});
