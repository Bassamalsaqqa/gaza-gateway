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
import { createSyntheticReleasePackage } from './production-upgrade.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
process.env.NODE_ENV = 'test';

function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

test('1. profile registry contains closed installed_697_23 profile with exact baseline binding', () => {
  const p = BASELINE_PROFILES.installed_697_23;
  assert.ok(p, 'installed_697_23 profile must exist');
  assert.equal(p.id, 'installed_697_23');
  assert.equal(p.source_sha, '69743b44066501e1b7a7be9e55181c5a9da13b3b');
  assert.equal(p.release_id, 'rel_20261017T161436_69743b4_clean');
  assert.equal(p.manifest_sha256, '408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da');
  assert.equal(p.migration_count, 23);
  assert.equal(p.target_migration_count, 23);
  assert.equal(p.database, 'gaza5045_gateway_live');
  assert.equal(p.app_dir, '/home/gaza5045/gaza-gateway');
  assert.equal(p.target_webroot, '/home/gaza5045/public_html');
  assert.equal(p.kit_folder, 'gaza-upgrade-package-697-55dfa64');
  assert.equal(p.rollback_policy, 'schema_compatible_23_reference_barrier');
});

test('2. production CLI accepts ONLY explicit installed_697_23 and rejects omitted, empty, or old profiles', () => {
  const cliScript = path.join(root, 'scripts/prepare-hostpapa-production-upgrade.mjs');
  const dummyOut = path.join(root, 'scratch/test-dummy-cli-' + Date.now());

  // A. Omitted profile
  const resOmitted = spawnSync(process.execPath, [cliScript, `--output-dir=${dummyOut}`, '--no-zip'], { encoding: 'utf8' });
  assert.notEqual(resOmitted.status, 0);
  assert.match(resOmitted.stderr, /--profile=installed_55_23 required/);
  assert.equal(fs.existsSync(dummyOut), false);

  // B. Empty profile
  const resEmpty = spawnSync(process.execPath, [cliScript, '--profile=', `--output-dir=${dummyOut}`, '--no-zip'], { encoding: 'utf8' });
  assert.notEqual(resEmpty.status, 0);
  assert.match(resEmpty.stderr, /--profile=installed_55_23 required/);
  assert.equal(fs.existsSync(dummyOut), false);

  // C. Old profile installed_965_21 rejected
  const res965 = spawnSync(process.execPath, [cliScript, '--profile=installed_965_21', `--output-dir=${dummyOut}`, '--no-zip'], { encoding: 'utf8' });
  assert.notEqual(res965.status, 0);
  assert.match(res965.stderr, /--profile=installed_55_23 required/);
  assert.match(res965.stderr, /profile "installed_965_21" is rejected/);
  assert.equal(fs.existsSync(dummyOut), false);

  // D. Old profile b3_21 rejected
  const resB3 = spawnSync(process.execPath, [cliScript, '--profile=b3_21', `--output-dir=${dummyOut}`, '--no-zip'], { encoding: 'utf8' });
  assert.notEqual(resB3.status, 0);
  assert.match(resB3.stderr, /--profile=installed_55_23 required/);
  assert.match(resB3.stderr, /profile "b3_21" is rejected/);
  assert.equal(fs.existsSync(dummyOut), false);

  // E. Old profile legacy_7a_19 rejected
  const resLegacy = spawnSync(process.execPath, [cliScript, '--profile=legacy_7a_19', `--output-dir=${dummyOut}`, '--no-zip'], { encoding: 'utf8' });
  assert.notEqual(resLegacy.status, 0);
  assert.match(resLegacy.stderr, /--profile=installed_55_23 required/);
  assert.match(resLegacy.stderr, /profile "legacy_7a_19" is rejected/);
  assert.equal(fs.existsSync(dummyOut), false);
});

test('3. builder constructor enforces installed_697_23 profile and rejects earlier profiles for 55dfa64 release', () => {
  // Omitted profile
  assert.throws(
    () => new ProductionUpgradeKitBuilder({ packageDir: path.join(root, 'scratch') }),
    /--profile=installed_55_23 required/
  );

  // Earlier profile rejected for candidate source 55dfa645e59e66c2da03744673fbb212a5077d51
  assert.throws(
    () => new ProductionUpgradeKitBuilder({
      packageDir: path.join(root, 'scratch'),
      profile: 'installed_965_21',
      expectedSourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
    }),
    /Release 55dfa645e59e66c2da03744673fbb212a5077d51 requires --profile=installed_697_23/
  );

  // Correct profile accepted
  const b = new ProductionUpgradeKitBuilder({
    packageDir: path.join(root, 'scratch'),
    profile: 'installed_697_23',
    expectedSourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
  });
  assert.equal(b.profileConfig.id, 'installed_697_23');
  assert.equal(b.profileConfig.migration_count, 23);
  assert.equal(b.profileConfig.target_migration_count, 23);
});

test('4. renderRunnerForProfile renders exact 697/23 constants, folder, 21 reference airports, schema guard, and omits 965 null-guest refusal', () => {
  const rendered = renderRunnerForProfile('installed_697_23');

  // A. Kit root folder
  assert.ok(rendered.includes("$kitRoot = $home . '/gaza-upgrade-package-697-55dfa64';"));

  // B. Exact immutable baseline constants and target 23 count
  assert.ok(rendered.includes("const INSTALLED_SOURCE_SHA = '69743b44066501e1b7a7be9e55181c5a9da13b3b';"));
  assert.ok(rendered.includes("const INSTALLED_RELEASE_ID = 'rel_20261017T161436_69743b4_clean';"));
  assert.ok(rendered.includes("const INSTALLED_MANIFEST_SHA = '408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da';"));
  assert.ok(rendered.includes("const INSTALLED_MIGRATIONS = 23;"));
  assert.ok(rendered.includes("const TARGET_MIGRATIONS = 23;"));

  // C. 21 Reference airports list and [20, 1440] minute limits preserved
  const expectedCodes = "['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ']";
  assert.ok(rendered.includes(expectedCodes));
  assert.ok(rendered.includes("$mins < 20 || $mins > 1440"));

  // D. Old 965 null-guest refusal is omitted (baseline 697 already supports nullable guests)
  assert.equal(rendered.includes('SELECT COUNT(*) FROM mvp_reservations WHERE owner_user_id IS NULL'), false);
  assert.equal(rendered.includes('SELECT COUNT(*) FROM mvp_reservation_passengers WHERE last_name IS NULL'), false);
  assert.equal(rendered.includes('Guest reservation data requires a compatible forward repair'), false);
  assert.equal(rendered.includes('Guest passenger data requires a compatible forward repair'), false);

  // E. Schema compatibility rollback verification (compares baseline and candidate migration identities and bytes)
  assert.ok(rendered.includes('$installedMigHashes = [];'));
  assert.ok(rendered.includes('$candidateMigHashes = [];'));
  assert.ok(rendered.includes('Expanded or modified migration schema requires compatible forward repair; rollback refused.'));

  // F. Preflight check verification message
  assert.ok(rendered.includes('PASS: verified baseline source 69743b4, active release rel_20261017T161436_69743b4_clean, 23 migrations, and upgrade candidate package.'));

  // G. Target 23 migration verify messages
  assert.ok(rendered.includes('Expected 23 migrations after upgrade'));
  assert.ok(rendered.includes('PASS: release installed, migrations verified at 23'));
  assert.ok(rendered.includes('already-installed target source, private/public bytes and 23 migration identities verified'));

  // H. Essential safety guards remain unchanged
  assert.ok(rendered.includes("safePath($pointerPath, $home);"));
  assert.ok(rendered.includes("flock($installerLock, LOCK_EX | LOCK_NB)"));
  assert.ok(rendered.includes("shared_hosting:cron:lease"));
  assert.ok(rendered.includes("fopen($maintenancePath, 'x')"));
  assert.ok(rendered.includes("preservationDigests($pdo"));
  assert.ok(rendered.includes("openRuntimePdo($verifyDsn, EXPECTED_RUNTIME_USER, $runtimePassword)"));
  assert.ok(rendered.includes("assertExactRuntimeConnection($verifyPdo, EXPECTED_DB_NAME, EXPECTED_RUNTIME_USER)"));
});

test('5. builder build() enforces exact baseline manifest checksum, 23 candidate migrations, and schema compatibility', async () => {
  const pkgDir = path.join(root, 'scratch/test-pkg-697-' + Date.now());
  const kitDir = path.join(root, 'scratch/test-kit-697-' + Date.now());
  const manifestDir = path.join(root, 'scratch/test-installed-697-' + Date.now());

  try {
    createSyntheticReleasePackage(pkgDir, {
      sourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
      migrationCount: 23,
    });

    // Create matching synthetic installed manifest
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestFile = path.join(manifestDir, 'installed-manifest.json');
    const candManifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'release-manifest.json'), 'utf8'));

    const installedManifest = {
      source_sha: '69743b44066501e1b7a7be9e55181c5a9da13b3b',
      release_id: 'rel_20261017T161436_69743b4_clean',
      private_files: {},
    };

    // Copy exact 23 migration entries from candidate
    for (const [k, v] of Object.entries(candManifest.private_files)) {
      if (k.startsWith('backend/database/migrations/')) {
        installedManifest.private_files[k] = { sha256: v.sha256 };
      }
    }
    fs.writeFileSync(manifestFile, JSON.stringify(installedManifest, null, 2));
    const syntheticManifestSha = computeSha256(fs.readFileSync(manifestFile));

    // A. Rejects without test override if manifest hash doesn't match immutable 697 manifest pin
    const builderStrict = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_697_23',
      expectedSourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
      installedManifest: manifestFile,
    });
    await assert.rejects(
      builderStrict.build(),
      /Installed manifest checksum mismatch: expected 408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da/
    );

    // B. Rejects schema incompatibility if a candidate migration has different bytes from baseline
    const incompatibleManifest = JSON.parse(JSON.stringify(installedManifest));
    const firstMigKey = Object.keys(incompatibleManifest.private_files)[0];
    incompatibleManifest.private_files[firstMigKey].sha256 = 'f'.repeat(64);
    const incompFile = path.join(manifestDir, 'incomp-manifest.json');
    fs.writeFileSync(incompFile, JSON.stringify(incompatibleManifest, null, 2));

    const builderIncomp = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      profile: 'installed_697_23',
      expectedSourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
      installedManifest: incompFile,
      allowTestOverride: true,
      installedBinding: {
        manifest_sha256: computeSha256(fs.readFileSync(incompFile)),
      },
    });
    await assert.rejects(
      builderIncomp.build(),
      /Schema compatibility failure: candidate migration .* bytes differ from baseline/
    );

    // C. Builds successfully when candidate 23 migrations match baseline 23 migration identities and bytes
    const builderSuccess = new ProductionUpgradeKitBuilder({
      packageDir: pkgDir,
      outputDir: kitDir,
      profile: 'installed_697_23',
      expectedSourceSha: '55dfa645e59e66c2da03744673fbb212a5077d51',
      installedManifest: manifestFile,
      allowTestOverride: true,
      installedBinding: {
        manifest_sha256: syntheticManifestSha,
      },
    });
    const result = await builderSuccess.build();

    assert.equal(result.profile, 'installed_697_23');
    assert.equal(result.targetSourceSha, '55dfa645e59e66c2da03744673fbb212a5077d51');
    assert.equal(result.migrationCount, 23);
    assert.equal(result.installedBinding.migration_count, 23);
    assert.equal(result.installedBinding.source_sha, '69743b44066501e1b7a7be9e55181c5a9da13b3b');
    assert.equal(result.installedBinding.release_id, 'rel_20261017T161436_69743b4_clean');

    const kitManifest = JSON.parse(fs.readFileSync(path.join(kitDir, 'upgrade-manifest.json'), 'utf8'));
    assert.equal(kitManifest.profile, 'installed_697_23');
    assert.equal(kitManifest.target_release.migration_count, 23);
    assert.equal(kitManifest.installed_binding.migration_count, 23);
    assert.equal(kitManifest.installed_binding.kit_folder, 'gaza-upgrade-package-697-55dfa64');
    assert.equal(kitManifest.operator_instructions.upload_target, '/home/gaza5045/gaza-upgrade-package-697-55dfa64');
    assert.equal(
      kitManifest.operator_instructions.check_command,
      'php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --check'
    );
    assert.equal(
      kitManifest.operator_instructions.upgrade_command,
      'php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --upgrade --confirm-upgrade'
    );
    assert.equal(
      kitManifest.operator_instructions.rollback_command,
      'php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --rollback --confirm-rollback'
    );
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(kitDir, { recursive: true, force: true });
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
});
