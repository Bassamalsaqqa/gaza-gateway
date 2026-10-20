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
  replaceExactAnchor,
} from '../../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';
import { createSyntheticReleasePackage } from './production-upgrade.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
process.env.NODE_ENV = 'test';

test('profile registry contains closed legacy_7a_19, b3_21, and installed_965_21 profiles', () => {
  assert.ok(BASELINE_PROFILES.legacy_7a_19);
  assert.ok(BASELINE_PROFILES.b3_21);
  assert.ok(BASELINE_PROFILES.installed_965_21);
  assert.equal(BASELINE_PROFILES.legacy_7a_19.migration_count, 19);
  assert.equal(BASELINE_PROFILES.b3_21.migration_count, 21);
  assert.equal(BASELINE_PROFILES.b3_21.source_sha, 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87');
  assert.equal(BASELINE_PROFILES.b3_21.manifest_sha256, '2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0');
  assert.equal(BASELINE_PROFILES.b3_21.kit_folder, 'gaza-upgrade-package-b3');

  assert.equal(BASELINE_PROFILES.installed_965_21.migration_count, 21);
  assert.equal(BASELINE_PROFILES.installed_965_21.target_migration_count, 23);
  assert.equal(BASELINE_PROFILES.installed_965_21.source_sha, '96538d9affdc843d08ef3c801f15c7f92dfd46b3');
  assert.equal(BASELINE_PROFILES.installed_965_21.release_id, 'rel_20261015T042635_96538d9_clean');
  assert.equal(BASELINE_PROFILES.installed_965_21.manifest_sha256, 'fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed');
  assert.equal(BASELINE_PROFILES.installed_965_21.kit_folder, 'gaza-upgrade-package-965');
});

test('builder constructor rejects unknown profiles', () => {
  assert.throws(
    () => new ProductionUpgradeKitBuilder({ packageDir: path.join(root, 'scratch'), profile: 'unknown_fake' }),
    /Unknown profile: unknown_fake/
  );
});

test('builder rejects b3_21 without --installed-manifest', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-' + Date.now());
  fs.mkdirSync(pkgDir, { recursive: true });
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'b3_21',
      expectedSourceSha: 'a'.repeat(40),
    });
    await assert.rejects(builder.build(), /Profile b3_21 requires explicit --installed-manifest/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder rejects installed manifest inside public directory', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-' + Date.now());
  const publicDir = path.join(pkgDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  const manifestInPublic = path.join(publicDir, 'fake-manifest.json');
  fs.writeFileSync(manifestInPublic, '{}');
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'b3_21',
      installedManifest: manifestInPublic,
      expectedSourceSha: 'a'.repeat(40),
    });
    await assert.rejects(builder.build(), /cannot reside inside webroot\/public directory/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder rejects installed manifest with checksum mismatch', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-' + Date.now());
  const privateDir = path.join(pkgDir, 'private');
  fs.mkdirSync(privateDir, { recursive: true });
  const manifestFile = path.join(privateDir, 'mismatched-manifest.json');
  fs.writeFileSync(manifestFile, '{"test":true}');
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'b3_21',
      installedManifest: manifestFile,
      expectedSourceSha: 'a'.repeat(40),
    });
    await assert.rejects(builder.build(), /Installed manifest checksum mismatch/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder rejects overriding installed pin without test permissions', () => {
  assert.throws(
    () => new ProductionUpgradeKitBuilder({
      packageDir: path.join(root, 'scratch'),
      profile: 'legacy_7a_19',
      installedBinding: { source_sha: 'wrong' },
      allowTestOverride: false,
    }),
    /Overriding installed pin is forbidden/
  );
});

test('renderRunnerForProfile returns byte-identical source for legacy_7a_19', () => {
  const templatePath = path.join(root, 'tools/hostpapa-release/production-upgrade/production-upgrade-runner.php');
  const rawTemplate = fs.readFileSync(templatePath, 'utf8');
  const legacyRendered = renderRunnerForProfile('legacy_7a_19');
  assert.equal(legacyRendered, rawTemplate);
});

test('renderRunnerForProfile renders exact b3 constants, folder, and 21-airport rollback bounds', () => {
  const b3Rendered = renderRunnerForProfile('b3_21');

  // Verify kit root folder
  assert.ok(b3Rendered.includes("$kitRoot = $home . '/gaza-upgrade-package-b3';"));

  // Verify exact b3 constants
  assert.ok(b3Rendered.includes("const INSTALLED_SOURCE_SHA = 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87';"));
  assert.ok(b3Rendered.includes("const INSTALLED_RELEASE_ID = 'rel_20261013T204811_b3afa9c_clean';"));
  assert.ok(b3Rendered.includes("const INSTALLED_MANIFEST_SHA = '2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0';"));
  assert.ok(b3Rendered.includes("const INSTALLED_MIGRATIONS = 21;"));

  // Verify 21-code airport list and minute bounds
  const expectedCodes = "['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ']";
  assert.ok(b3Rendered.includes(expectedCodes));
  assert.ok(b3Rendered.includes("$mins < 20 || $mins > 1440"));

  // Verify preflight PASS message
  assert.ok(b3Rendered.includes('PASS: verified baseline source b3afa9c, active release rel_20261013T204811_b3afa9c_clean, 21 migrations, and upgrade candidate package.'));
});

test('renderRunnerForProfile renders exact 965 constants, folder, target 23 migrations, and guest rollback bounds', () => {
  const rendered = renderRunnerForProfile('installed_965_21');

  // Verify kit root folder
  assert.ok(rendered.includes("$kitRoot = $home . '/gaza-upgrade-package-965';"));

  // Verify exact 965 constants and target 23 migrations
  assert.ok(rendered.includes("const INSTALLED_SOURCE_SHA = '96538d9affdc843d08ef3c801f15c7f92dfd46b3';"));
  assert.ok(rendered.includes("const INSTALLED_RELEASE_ID = 'rel_20261015T042635_96538d9_clean';"));
  assert.ok(rendered.includes("const INSTALLED_MANIFEST_SHA = 'fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed';"));
  assert.ok(rendered.includes("const INSTALLED_MIGRATIONS = 21;"));
  assert.ok(rendered.includes("const TARGET_MIGRATIONS = 23;"));

  // Verify rollback forward repair guards for guest schema
  assert.ok(rendered.includes('Guest reservation data requires a compatible forward repair; old-code rollback refused.'));
  assert.ok(rendered.includes('Guest passenger data requires a compatible forward repair; old-code rollback refused.'));

  // Verify preflight PASS message
  assert.ok(rendered.includes('PASS: verified baseline source 96538d9, active release rel_20261015T042635_96538d9_clean, 21 migrations, and upgrade candidate package.'));

  // Verify target 23 messages
  assert.ok(rendered.includes('Expected 23 migrations after upgrade'));
  assert.ok(rendered.includes('PASS: release installed, migrations verified at 23'));
});

test('renderRunnerForProfile rejects unknown profile ID', () => {
  assert.throws(
    () => renderRunnerForProfile('invalid_profile_id'),
    /Unknown profile: invalid_profile_id/
  );
});

test('replaceExactAnchor fails closed on missing or duplicate anchors', () => {
  const sample = 'foo bar baz';
  assert.throws(
    () => replaceExactAnchor(sample, 'missing', 'replacement'),
    /Expected exactly 1 occurrence of anchor, found 0/
  );
  assert.throws(
    () => replaceExactAnchor('foo bar foo', 'foo', 'replacement'),
    /Expected exactly 1 occurrence of anchor, found 2/
  );
});

test('builder rejects symlinks in installed-manifest path when supported', async (t) => {
  const scratchTestDir = path.join(root, 'scratch/test-symlink-' + Date.now());
  fs.mkdirSync(scratchTestDir, { recursive: true });
  const realFile = path.join(scratchTestDir, 'real-manifest.json');
  fs.writeFileSync(realFile, '{}');
  const symlinkFile = path.join(scratchTestDir, 'symlink-manifest.json');

  let symlinkCreated = false;
  try {
    fs.symlinkSync(realFile, symlinkFile);
    symlinkCreated = true;
  } catch (err) {
    t.skip(`Windows unprivileged environment does not permit symlink creation (${err.code || err.message}); skipped`);
    fs.rmSync(scratchTestDir, { recursive: true, force: true });
    return;
  }

  if (symlinkCreated) {
    try {
      const builder = new ProductionUpgradeKitBuilder({
        packageDir: scratchTestDir,
        profile: 'b3_21',
        installedManifest: symlinkFile,
        expectedSourceSha: 'a'.repeat(40),
      });
      await assert.rejects(builder.build(), /Symbolic link rejected/);
    } finally {
      fs.rmSync(scratchTestDir, { recursive: true, force: true });
    }
  }
});

test('builder constructor rejects omitted or empty profile with clear required error', () => {
  assert.throws(
    () => new ProductionUpgradeKitBuilder({ packageDir: path.join(root, 'scratch') }),
    /--profile=installed_697_23 required/
  );
  assert.throws(
    () => new ProductionUpgradeKitBuilder({ packageDir: path.join(root, 'scratch'), profile: '' }),
    /--profile=installed_697_23 required/
  );
  assert.throws(
    () => new ProductionUpgradeKitBuilder({ packageDir: path.join(root, 'scratch'), profile: '   ' }),
    /--profile=installed_697_23 required/
  );
});

test('builder rejects selecting legacy profile when expectedSourceSha is current 965 release', () => {
  assert.throws(
    () => new ProductionUpgradeKitBuilder({
      packageDir: path.join(root, 'scratch'),
      profile: 'legacy_7a_19',
      expectedSourceSha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
    }),
    /Release 96538d9affdc843d08ef3c801f15c7f92dfd46b3 requires --profile=b3_21/
  );
});

test('builder constructor accepts explicit b3_21 and requires manifest at build', async () => {
  const pkgDir = path.join(root, 'scratch/test-b3-pos-' + Date.now());
  fs.mkdirSync(pkgDir, { recursive: true });
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'b3_21',
      expectedSourceSha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
    });
    assert.equal(builder.profileConfig.id, 'b3_21');
    assert.equal(builder.profileConfig.migration_count, 21);
    await assert.rejects(
      builder.build(),
      /Profile b3_21 requires explicit --installed-manifest/
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder constructor accepts explicit installed_965_21 and requires manifest at build', async () => {
  const pkgDir = path.join(root, 'scratch/test-965-pos-' + Date.now());
  fs.mkdirSync(pkgDir, { recursive: true });
  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_965_21',
      expectedSourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
    });
    assert.equal(builder.profileConfig.id, 'installed_965_21');
    assert.equal(builder.profileConfig.migration_count, 21);
    assert.equal(builder.profileConfig.target_migration_count, 23);
    await assert.rejects(
      builder.build(),
      /Profile installed_965_21 requires explicit --installed-manifest/
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }
});

test('builder API allows explicit legacy selection for historical replay', () => {
  const historicalSha = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
  const builder = new ProductionUpgradeKitBuilder({
    packageDir: path.join(root, 'scratch'),
    profile: 'legacy_7a_19',
    expectedSourceSha: historicalSha,
  });
  assert.equal(builder.profileConfig.id, 'legacy_7a_19');
  assert.equal(builder.profileConfig.migration_count, 19);
});

test('CLI fails before creating output when profile is omitted', () => {
  const cliScript = path.join(root, 'scripts/prepare-hostpapa-production-upgrade.mjs');
  const outDir = path.join(root, 'scratch/test-cli-omitted-' + Date.now());
  const res = spawnSync(process.execPath, [
    cliScript,
    `--output-dir=${outDir}`,
    '--no-zip',
  ], { encoding: 'utf8' });

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--profile=installed_697_23 required/);
  assert.equal(fs.existsSync(outDir), false, 'outputDir must not be created when profile is omitted');
});

test('CLI fails before creating output when profile is empty', () => {
  const cliScript = path.join(root, 'scripts/prepare-hostpapa-production-upgrade.mjs');
  const outDir = path.join(root, 'scratch/test-cli-empty-' + Date.now());
  const res = spawnSync(process.execPath, [
    cliScript,
    '--profile=',
    `--output-dir=${outDir}`,
    '--no-zip',
  ], { encoding: 'utf8' });

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--profile=installed_697_23 required/);
  assert.equal(fs.existsSync(outDir), false, 'outputDir must not be created when profile is empty');
});

test('CLI rejects explicit legacy profile before creating output', () => {
  const cliScript = path.join(root, 'scripts/prepare-hostpapa-production-upgrade.mjs');
  const outDir = path.join(root, 'scratch/test-cli-legacy-' + Date.now());
  const res = spawnSync(process.execPath, [
    cliScript,
    '--profile=legacy_7a_19',
    `--output-dir=${outDir}`,
    '--no-zip',
  ], { encoding: 'utf8' });

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--profile=installed_697_23 required/);
  assert.equal(fs.existsSync(outDir), false, 'outputDir must not be created when legacy profile is rejected');
});

test('CLI rejects explicit b3_21 profile before creating output', () => {
  const cliScript = path.join(root, 'scripts/prepare-hostpapa-production-upgrade.mjs');
  const outDir = path.join(root, 'scratch/test-cli-b3-' + Date.now());
  const res = spawnSync(process.execPath, [
    cliScript,
    '--profile=b3_21',
    `--output-dir=${outDir}`,
    '--no-zip',
  ], { encoding: 'utf8' });

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--profile=installed_697_23 required/);
  assert.equal(fs.existsSync(outDir), false, 'outputDir must not be created when b3_21 profile is rejected');
});

// =========================================================================
// Focused local tests: builder current profile target 23 / invalid profile wrong source hash / migration legacy reject
// =========================================================================

test('builder current profile target 23: rejects candidate package with 21 migrations', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-21mig-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-installed-21mig-' + Date.now());
  try {
    createSyntheticReleasePackage(pkgDir, {
      sourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      migrationCount: 21,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestFile = path.join(manifestDir, 'manifest.json');
    const installedManifest = {
      source_sha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
      release_id: 'rel_20261015T042635_96538d9_clean',
      private_files: {},
    };
    for (let i = 1; i <= 21; i++) {
      installedManifest.private_files[`backend/database/migrations/mig_${String(i).padStart(2, '0')}.php`] = { sha256: 'a'.repeat(64) };
    }
    fs.writeFileSync(manifestFile, JSON.stringify(installedManifest));

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_965_21',
      expectedSourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      installedManifest: manifestFile,
      allowTestOverride: true,
      installedBinding: {
        manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
      },
    });
    await assert.rejects(builder.build(), /Expected exactly 23 migrations in new release candidate, found 21/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('builder current profile target 23: accepts candidate package with 23 migrations', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-23mig-' + Date.now());
  const kitDir = path.join(root, 'scratch/test-kit-23mig-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-installed-23mig-' + Date.now());
  try {
    createSyntheticReleasePackage(pkgDir, {
      sourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      migrationCount: 23,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestFile = path.join(manifestDir, 'manifest.json');
    const installedManifest = {
      source_sha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
      release_id: 'rel_20261015T042635_96538d9_clean',
      private_files: {},
    };
    for (let i = 1; i <= 21; i++) {
      installedManifest.private_files[`backend/database/migrations/mig_${String(i).padStart(2, '0')}.php`] = { sha256: 'a'.repeat(64) };
    }
    fs.writeFileSync(manifestFile, JSON.stringify(installedManifest));

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      outputDir: kitDir,
      profile: 'installed_965_21',
      expectedSourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      installedManifest: manifestFile,
      allowTestOverride: true,
      installedBinding: {
        manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
      },
    });
    const result = await builder.build();
    assert.equal(result.migrationCount, 23);
    assert.equal(result.installedBinding.migration_count, 21);
    assert.equal(result.profile, 'installed_965_21');

    const kitManifest = JSON.parse(fs.readFileSync(path.join(kitDir, 'upgrade-manifest.json'), 'utf8'));
    assert.equal(kitManifest.target_release.migration_count, 23);
    assert.equal(kitManifest.installed_binding.migration_count, 21);
    assert.equal(kitManifest.installed_binding.source_sha, '96538d9affdc843d08ef3c801f15c7f92dfd46b3');
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(kitDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('invalid profile wrong source hash: fails closed on installed manifest hash or source mismatch', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-hash-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-installed-hash-' + Date.now());
  try {
    createSyntheticReleasePackage(pkgDir, {
      sourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      migrationCount: 23,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestFile = path.join(manifestDir, 'manifest.json');
    // Wrong source_sha in installed manifest
    fs.writeFileSync(manifestFile, JSON.stringify({
      source_sha: 'wrong_sha_0000000000000000000000000000000',
      release_id: 'rel_20261015T042635_96538d9_clean',
      private_files: {},
    }));

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_965_21',
      expectedSourceSha: '23bbac23f93fcaab425cb44a6e9a79cbf3b21dd2',
      installedManifest: manifestFile,
    });
    await assert.rejects(builder.build(), /Installed manifest checksum mismatch/);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});

test('migration legacy reject: rejects legacy profiles when candidate package has 23 migrations', async () => {
  // 1. Constructor rejection when expectedMigrationCount is 23
  assert.throws(
    () => new ProductionUpgradeKitBuilder({
      packageDir: path.join(root, 'scratch'),
      profile: 'legacy_7a_19',
      expectedMigrationCount: 23,
    }),
    /Target release with 23 migrations requires --profile=installed_965_21; profile legacy_7a_19 is rejected/
  );
  assert.throws(
    () => new ProductionUpgradeKitBuilder({
      packageDir: path.join(root, 'scratch'),
      profile: 'b3_21',
      expectedMigrationCount: 23,
    }),
    /Target release with 23 migrations requires --profile=installed_965_21; profile b3_21 is rejected/
  );

  // 2. Build-time rejection based on actual target migration inventory (23 migrations), independent of source SHA
  const pkgDir = path.join(root, 'scratch/test-pkg-legacy-reject-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-installed-legacy-reject-' + Date.now());
  try {
    createSyntheticReleasePackage(pkgDir, {
      sourceSha: 'd'.repeat(40),
      migrationCount: 23,
    });
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestFile = path.join(manifestDir, 'manifest.json');
    const installedManifest = {
      source_sha: 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87',
      release_id: 'rel_20261013T204811_b3afa9c_clean',
      private_files: {},
    };
    for (let i = 1; i <= 21; i++) {
      installedManifest.private_files[`backend/database/migrations/mig_${String(i).padStart(2, '0')}.php`] = { sha256: 'a'.repeat(64) };
    }
    fs.writeFileSync(manifestFile, JSON.stringify(installedManifest));

    const builder = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'b3_21',
      expectedSourceSha: 'd'.repeat(40),
      installedManifest: manifestFile,
      allowTestOverride: true,
      installedBinding: {
        manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
      },
    });
    await assert.rejects(
      builder.build(),
      /Candidate release with 23 migrations requires --profile=installed_965_21; profile b3_21 is rejected/
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});
