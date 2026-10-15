import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ProductionUpgradeKitBuilder,
  BASELINE_PROFILES,
  renderRunnerForProfile,
  replaceExactAnchor,
} from '../../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

test('profile registry contains closed legacy_7a_19 and b3_21 profiles', () => {
  assert.ok(BASELINE_PROFILES.legacy_7a_19);
  assert.ok(BASELINE_PROFILES.b3_21);
  assert.equal(BASELINE_PROFILES.legacy_7a_19.migration_count, 19);
  assert.equal(BASELINE_PROFILES.b3_21.migration_count, 21);
  assert.equal(BASELINE_PROFILES.b3_21.source_sha, 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87');
  assert.equal(BASELINE_PROFILES.b3_21.manifest_sha256, '2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0');
  assert.equal(BASELINE_PROFILES.b3_21.kit_folder, 'gaza-upgrade-package-b3');
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
