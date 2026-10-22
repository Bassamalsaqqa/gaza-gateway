import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ReleaseVerifier } from '../src/ReleaseVerifier.mjs';
import { assertNoSymlinksInPath } from '../src/SafePath.mjs';
import { writeZipArchive } from './ZipKit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_SOURCE_FILE = path.join(__dirname, 'production-upgrade-runner.php');

const BUILDER_SOURCE_FILE = fileURLToPath(import.meta.url);
const CLI_SOURCE_FILE = path.resolve(path.dirname(BUILDER_SOURCE_FILE), '../../../scripts/prepare-hostpapa-production-upgrade.mjs');

export const BASELINE_PROFILES = Object.freeze({
  legacy_7a_19: Object.freeze({
    id: 'legacy_7a_19',
    source_sha: '7a8f0fa2f25851c4f75422f86139e0bb020ea4de',
    release_id: 'rel_20261013T082656_7a8f0fa_clean',
    manifest_sha256: 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf',
    migration_count: 19,
    database: 'gaza5045_gateway_live',
    app_dir: '/home/gaza5045/gaza-gateway',
    target_webroot: '/home/gaza5045/public_html',
    kit_folder: 'gaza-upgrade-package',
    rollback_policy: 'legacy_8_airport_600m',
  }),
  b3_21: Object.freeze({
    id: 'b3_21',
    source_sha: 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87',
    release_id: 'rel_20261013T204811_b3afa9c_clean',
    manifest_sha256: '2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0',
    migration_count: 21,
    target_migration_count: 21,
    database: 'gaza5045_gateway_live',
    app_dir: '/home/gaza5045/gaza-gateway',
    target_webroot: '/home/gaza5045/public_html',
    kit_folder: 'gaza-upgrade-package-b3',
    rollback_policy: 'expanded_21_airport_1440m',
  }),
  installed_965_21: Object.freeze({
    id: 'installed_965_21',
    source_sha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
    release_id: 'rel_20261015T042635_96538d9_clean',
    manifest_sha256: 'fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed',
    migration_count: 21,
    target_migration_count: 23,
    database: 'gaza5045_gateway_live',
    app_dir: '/home/gaza5045/gaza-gateway',
    target_webroot: '/home/gaza5045/public_html',
    kit_folder: 'gaza-upgrade-package-965',
    rollback_policy: 'guest_schema_irreversible_forward_repair',
  }),
  installed_697_23: Object.freeze({
    id: 'installed_697_23',
    source_sha: '69743b44066501e1b7a7be9e55181c5a9da13b3b',
    release_id: 'rel_20261017T161436_69743b4_clean',
    manifest_sha256: '408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da',
    migration_count: 23,
    target_migration_count: 23,
    database: 'gaza5045_gateway_live',
    app_dir: '/home/gaza5045/gaza-gateway',
    target_webroot: '/home/gaza5045/public_html',
    kit_folder: 'gaza-upgrade-package-697-55dfa64',
    rollback_policy: 'schema_compatible_23_reference_barrier',
  }),
});

export const INSTALLED_PIN = BASELINE_PROFILES.legacy_7a_19;

export function replaceExactAnchor(source, anchor, replacement) {
  const normSource = source.replace(/\r\n/g, '\n');
  const normAnchor = anchor.replace(/\r\n/g, '\n');
  const normReplacement = replacement.replace(/\r\n/g, '\n');
  const parts = normSource.split(normAnchor);
  if (parts.length !== 2) {
    throw new Error(`Expected exactly 1 occurrence of anchor, found ${parts.length - 1}`);
  }
  return parts.join(normReplacement);
}

function renderRunnerSource(rawRunner, profile) {
  if (profile.id === 'legacy_7a_19') {
    return rawRunner;
  }
  if (profile.id === 'b3_21') {
    let rendered = rawRunner;

    // 1. Unique allowlisted kit folder
    rendered = replaceExactAnchor(
      rendered,
      "$kitRoot = $home . '/gaza-upgrade-package';",
      `$kitRoot = $home . '/${profile.kit_folder}';`
    );

    // 2. Exact immutable baseline constants
    const oldConstants = `const INSTALLED_SOURCE_SHA = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
const INSTALLED_RELEASE_ID = 'rel_20261013T082656_7a8f0fa_clean';
const INSTALLED_MANIFEST_SHA = 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf';
const INSTALLED_MIGRATIONS = 19;`;

    const newConstants = `const INSTALLED_SOURCE_SHA = '${profile.source_sha}';
const INSTALLED_RELEASE_ID = '${profile.release_id}';
const INSTALLED_MANIFEST_SHA = '${profile.manifest_sha256}';
const INSTALLED_MIGRATIONS = ${profile.migration_count};`;

    rendered = replaceExactAnchor(rendered, oldConstants, newConstants);

    // 3. Rollback compatibility predicate: exactly what b3 supports
    const oldRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'DOH', 'DXB', 'IST', 'JED', 'RUH'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        if (!in_array($row['code'], $codes, true) || (int)$row['block_minutes'] > 600) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}`;

    const newRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        $mins = (int)$row['block_minutes'];
        if (!in_array($row['code'], $codes, true) || $mins < 20 || $mins > 1440) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}`;

    rendered = replaceExactAnchor(rendered, oldRollback, newRollback);

    // 4. Preflight check verification message (diagnostics worker appends metadata on line 2)
    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: verified baseline source 7a8f0fa, active release rel_20261013T082656_7a8f0fa_clean, 19 migrations, and upgrade candidate package.\\n";',
      `echo "PASS: verified baseline source ${profile.source_sha.slice(0, 7)}, active release ${profile.release_id}, ${profile.migration_count} migrations, and upgrade candidate package.\\n";`
    );

    return rendered;
  }
  if (profile.id === 'installed_965_21') {
    let rendered = rawRunner;

    // 1. Unique allowlisted kit folder
    rendered = replaceExactAnchor(
      rendered,
      "$kitRoot = $home . '/gaza-upgrade-package';",
      `$kitRoot = $home . '/${profile.kit_folder}';`
    );

    // 2. Exact immutable baseline constants and target migrations
    const oldConstants = `const INSTALLED_SOURCE_SHA = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
const INSTALLED_RELEASE_ID = 'rel_20261013T082656_7a8f0fa_clean';
const INSTALLED_MANIFEST_SHA = 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf';
const INSTALLED_MIGRATIONS = 19;

const TARGET_MIGRATIONS = 21;`;

    const newConstants = `const INSTALLED_SOURCE_SHA = '${profile.source_sha}';
const INSTALLED_RELEASE_ID = '${profile.release_id}';
const INSTALLED_MANIFEST_SHA = '${profile.manifest_sha256}';
const INSTALLED_MIGRATIONS = ${profile.migration_count};

const TARGET_MIGRATIONS = ${profile.target_migration_count};`;

    rendered = replaceExactAnchor(rendered, oldConstants, newConstants);

    // 3. Rollback compatibility predicate: reference airports + guest null rows require forward repair
    const oldRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'DOH', 'DXB', 'IST', 'JED', 'RUH'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        if (!in_array($row['code'], $codes, true) || (int)$row['block_minutes'] > 600) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}`;

    const newRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        $mins = (int)$row['block_minutes'];
        if (!in_array($row['code'], $codes, true) || $mins < 20 || $mins > 1440) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
    $guestReservations = (int)$pdo->query('SELECT COUNT(*) FROM mvp_reservations WHERE owner_user_id IS NULL')->fetchColumn();
    if ($guestReservations > 0) {
        throw new RuntimeException('Guest reservation data requires a compatible forward repair; old-code rollback refused.');
    }
    $guestPassengers = (int)$pdo->query('SELECT COUNT(*) FROM mvp_reservation_passengers WHERE last_name IS NULL OR dob IS NULL OR nationality IS NULL OR document IS NULL')->fetchColumn();
    if ($guestPassengers > 0) {
        throw new RuntimeException('Guest passenger data requires a compatible forward repair; old-code rollback refused.');
    }
}`;

    rendered = replaceExactAnchor(rendered, oldRollback, newRollback);

    // 4. Preflight check verification message
    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: verified baseline source 7a8f0fa, active release rel_20261013T082656_7a8f0fa_clean, 19 migrations, and upgrade candidate package.\\n";',
      `echo "PASS: verified baseline source ${profile.source_sha.slice(0, 7)}, active release ${profile.release_id}, ${profile.migration_count} migrations, and upgrade candidate package.\\n";`
    );

    // 5. Target migration post-verify checks and output
    rendered = replaceExactAnchor(
      rendered,
      'throw new RuntimeException("Expected 21 migrations after upgrade, found " . count($appliedMigrations));',
      `throw new RuntimeException("Expected ${profile.target_migration_count} migrations after upgrade, found " . count($appliedMigrations));`
    );

    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: release installed, migrations verified at 21, previous bytes and consistent database dump retained.\\n";',
      `echo "PASS: release installed, migrations verified at ${profile.target_migration_count}, previous bytes and consistent database dump retained.\\n";`
    );

    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: already-installed target source, private/public bytes and 21 migration identities verified; no upgrade or evidence rewrite.\\n";',
      `echo "PASS: already-installed target source, private/public bytes and ${profile.target_migration_count} migration identities verified; no upgrade or evidence rewrite.\\n";`
    );

    return rendered;
  }
  if (profile.id === 'installed_697_23') {
    let rendered = rawRunner;

    // 1. Unique allowlisted kit folder
    rendered = replaceExactAnchor(
      rendered,
      "$kitRoot = $home . '/gaza-upgrade-package';",
      `$kitRoot = $home . '/${profile.kit_folder}';`
    );

    // 2. Exact immutable baseline constants and target migrations
    const oldConstants = `const INSTALLED_SOURCE_SHA = '7a8f0fa2f25851c4f75422f86139e0bb020ea4de';
const INSTALLED_RELEASE_ID = 'rel_20261013T082656_7a8f0fa_clean';
const INSTALLED_MANIFEST_SHA = 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf';
const INSTALLED_MIGRATIONS = 19;

const TARGET_MIGRATIONS = 21;`;

    const newConstants = `const INSTALLED_SOURCE_SHA = '${profile.source_sha}';
const INSTALLED_RELEASE_ID = '${profile.release_id}';
const INSTALLED_MANIFEST_SHA = '${profile.manifest_sha256}';
const INSTALLED_MIGRATIONS = ${profile.migration_count};

const TARGET_MIGRATIONS = ${profile.target_migration_count};`;

    rendered = replaceExactAnchor(rendered, oldConstants, newConstants);

    // 3. Rollback compatibility predicate: 21 reference airports (baseline 697 already supports nullable guests)
    const oldRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'DOH', 'DXB', 'IST', 'JED', 'RUH'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        if (!in_array($row['code'], $codes, true) || (int)$row['block_minutes'] > 600) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}`;

    const newRollback = `function assertRollbackCompatible(PDO $pdo): void {
    $codes = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];
    $statement = $pdo->query('SELECT code, block_minutes FROM airports');
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        $mins = (int)$row['block_minutes'];
        if (!in_array($row['code'], $codes, true) || $mins < 20 || $mins > 1440) {
            throw new RuntimeException('Expanded reference authority requires a compatible forward repair; old-code rollback refused.');
        }
    }
}`;

    rendered = replaceExactAnchor(rendered, oldRollback, newRollback);

    // 4. Schema compatibility rollback verification: compare baseline and candidate migration identities and bytes
    const oldRollbackBarrier = `        assertRollbackMigrationLedger($pdo, $expectedMigrationNames);

        // Verify compatibility predicate: reference airports and destination limits
        assertRollbackCompatible($pdo);`;

    const newRollbackBarrier = `        assertRollbackMigrationLedger($pdo, $expectedMigrationNames);

        // Verify schema compatibility: compare baseline and candidate migration identities and bytes
        $installedMigHashes = [];
        foreach ($installedManifest['private_files'] ?? [] as $f => $e) {
            if (preg_match('#^backend/database/migrations/[a-zA-Z0-9_]+\\.php$#D', $f)) {
                $installedMigHashes[$f] = $e['sha256'];
            }
        }
        $candidateMigHashes = [];
        foreach ($candidateManifest['private_files'] ?? [] as $f => $e) {
            if (preg_match('#^backend/database/migrations/[a-zA-Z0-9_]+\\.php$#D', $f)) {
                $candidateMigHashes[$f] = $e['sha256'];
            }
        }
        if (count($installedMigHashes) !== count($candidateMigHashes) || $installedMigHashes !== $candidateMigHashes) {
            throw new RuntimeException('Expanded or modified migration schema requires compatible forward repair; rollback refused.');
        }

        // Verify compatibility predicate: reference airports and destination limits
        assertRollbackCompatible($pdo);`;

    rendered = replaceExactAnchor(rendered, oldRollbackBarrier, newRollbackBarrier);

    // 5. Preflight check verification message
    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: verified baseline source 7a8f0fa, active release rel_20261013T082656_7a8f0fa_clean, 19 migrations, and upgrade candidate package.\\n";',
      `echo "PASS: verified baseline source ${profile.source_sha.slice(0, 7)}, active release ${profile.release_id}, ${profile.migration_count} migrations, and upgrade candidate package.\\n";`
    );

    // 6. Target migration post-verify checks and output
    rendered = replaceExactAnchor(
      rendered,
      'throw new RuntimeException("Expected 21 migrations after upgrade, found " . count($appliedMigrations));',
      `throw new RuntimeException("Expected ${profile.target_migration_count} migrations after upgrade, found " . count($appliedMigrations));`
    );

    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: release installed, migrations verified at 21, previous bytes and consistent database dump retained.\\n";',
      `echo "PASS: release installed, migrations verified at ${profile.target_migration_count}, previous bytes and consistent database dump retained.\\n";`
    );

    rendered = replaceExactAnchor(
      rendered,
      'echo "PASS: already-installed target source, private/public bytes and 21 migration identities verified; no upgrade or evidence rewrite.\\n";',
      `echo "PASS: already-installed target source, private/public bytes and ${profile.target_migration_count} migration identities verified; no upgrade or evidence rewrite.\\n";`
    );

    return rendered;
  }
  throw new Error(`Unsupported profile for rendering: ${profile.id}`);
}

export function renderRunnerForProfile(profileId) {
  if (!Object.prototype.hasOwnProperty.call(BASELINE_PROFILES, profileId)) {
    throw new Error(`Unknown profile: ${profileId}. Allowed profiles: ${Object.keys(BASELINE_PROFILES).join(', ')}`);
  }
  const profile = BASELINE_PROFILES[profileId];
  if (!fs.existsSync(RUNNER_SOURCE_FILE)) {
    throw new Error(`Upgrade runner source file not found: ${RUNNER_SOURCE_FILE}`);
  }
  const rawRunner = fs.readFileSync(RUNNER_SOURCE_FILE, 'utf8');
  return renderRunnerSource(rawRunner, profile);
}

function computeFileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function copyDirectoryRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected in release package: ${srcPath}`);
    }
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function collectAllFiles(dir, base = '') {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results = results.concat(collectAllFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      results.push({ relPath, fullPath });
    }
  }
  return results;
}

export class ProductionUpgradeKitBuilder {
  constructor(options = {}) {
    this.root = options.root ? path.resolve(options.root) : path.resolve(__dirname, '../../..');

    if (!options.profile || typeof options.profile !== 'string' || options.profile.trim() === '') {
      throw new Error('--profile=installed_697_23 required ( baseline profile must be explicitly specified; historical default has been removed).');
    }
    const profileId = options.profile.trim();
    if (!Object.prototype.hasOwnProperty.call(BASELINE_PROFILES, profileId)) {
      throw new Error(`Unknown profile: ${profileId}. Allowed profiles: ${Object.keys(BASELINE_PROFILES).join(', ')}`);
    }

    if (!options.packageDir) {
      throw new Error('packageDir option is required');
    }
    this.packageDir = path.resolve(options.packageDir);
    this.outputDir = options.outputDir ? path.resolve(options.outputDir) : null;
    this.outputZip = options.outputZip ? path.resolve(options.outputZip) : null;
    this.expectedSourceSha = options.expectedSourceSha || null;
    this.strict = options.strict ?? true;

    if (this.expectedSourceSha === '96538d9affdc843d08ef3c801f15c7f92dfd46b3' && profileId === 'legacy_7a_19') {
      throw new Error('Release 96538d9affdc843d08ef3c801f15c7f92dfd46b3 requires --profile=b3_21; legacy profile is rejected for this release.');
    }
    if (this.expectedSourceSha === '55dfa645e59e66c2da03744673fbb212a5077d51' && profileId !== 'installed_697_23') {
      throw new Error('Release 55dfa645e59e66c2da03744673fbb212a5077d51 requires --profile=installed_697_23; earlier profiles are rejected for this release.');
    }
    if (options.expectedMigrationCount === 23 && profileId !== 'installed_965_21' && profileId !== 'installed_697_23') {
      throw new Error(`Target release with 23 migrations requires --profile=installed_965_21; profile ${profileId} is rejected.`);
    }

    this.profileConfig = BASELINE_PROFILES[profileId];
    if (!/^[a-zA-Z0-9_-]+$/.test(this.profileConfig.kit_folder)) {
      throw new Error(`Unsafe kit folder name: ${this.profileConfig.kit_folder}`);
    }
    this.installedManifestPath = options.installedManifest ? path.resolve(options.installedManifest) : null;
    this.allowTestOverride = Boolean(options.allowTestOverride);

    // Pin cannot be overridden except explicitly in test mode
    if (options.installedBinding) {
      if (!options.allowTestOverride || process.env.NODE_ENV !== 'test') {
        throw new Error('Overriding installed pin is forbidden.');
      }
      this.installedBinding = Object.freeze({ ...this.profileConfig, ...options.installedBinding });
    } else {
      this.installedBinding = this.profileConfig;
    }
  }

  async build() {
    await assertNoSymlinksInPath(this.packageDir);

    if (!fs.existsSync(this.packageDir) || !fs.statSync(this.packageDir).isDirectory()) {
      throw new Error(`Package directory does not exist or is not a directory: ${this.packageDir}`);
    }

    let manifestJson = null;
    if (this.profileConfig.id !== 'legacy_7a_19') {
      if (!this.installedManifestPath) {
        throw new Error(`Profile ${this.profileConfig.id} requires explicit --installed-manifest=<path>`);
      }
      await assertNoSymlinksInPath(this.installedManifestPath);
      if (!fs.existsSync(this.installedManifestPath) || !fs.statSync(this.installedManifestPath).isFile()) {
        throw new Error(`Installed manifest file does not exist or is not a file: ${this.installedManifestPath}`);
      }
      if (/(?:public_html|public)(?:[\\/]|$)/i.test(this.installedManifestPath)) {
        throw new Error(`Installed manifest cannot reside inside webroot/public directory: ${this.installedManifestPath}`);
      }
      const actualManifestSha = computeFileSha256(this.installedManifestPath);
      if (actualManifestSha !== this.installedBinding.manifest_sha256) {
        throw new Error(`Installed manifest checksum mismatch: expected ${this.installedBinding.manifest_sha256}, got ${actualManifestSha}`);
      }
      manifestJson = JSON.parse(fs.readFileSync(this.installedManifestPath, 'utf8'));
      if (manifestJson.source_sha !== this.installedBinding.source_sha) {
        throw new Error(`Installed manifest source_sha mismatch: expected ${this.installedBinding.source_sha}, got ${manifestJson.source_sha}`);
      }
      if (manifestJson.release_id !== this.installedBinding.release_id) {
        throw new Error(`Installed manifest release_id mismatch: expected ${this.installedBinding.release_id}, got ${manifestJson.release_id}`);
      }
      const migrationKeys = Object.keys(manifestJson.private_files || {})
        .filter(k => /^backend\/database\/migrations\/[a-zA-Z0-9_]+\.php$/.test(k));
      if (migrationKeys.length !== this.installedBinding.migration_count) {
        throw new Error(`Installed manifest migration count mismatch: expected ${this.installedBinding.migration_count}, got ${migrationKeys.length}`);
      }
    }

    // 1. Output directory and zip must be strictly inside this worktree scratch
    const scratchDir = path.join(this.root, 'scratch');
    const scratchPrefix = scratchDir + path.sep;
    const kitDir = this.outputDir || path.join(scratchDir, 'production-upgrade-kit-' + Date.now());

    if (!kitDir.startsWith(scratchPrefix)) {
      throw new Error(`outputDir (${kitDir}) must be strictly inside worktree scratch (${scratchDir})`);
    }
    if (fs.existsSync(kitDir)) {
      throw new Error(`outputDir already exists (${kitDir}); deletion or overwrite is forbidden.`);
    }

    if (this.outputZip) {
      if (!this.outputZip.startsWith(scratchPrefix)) {
        throw new Error(`outputZip (${this.outputZip}) must be strictly inside worktree scratch (${scratchDir})`);
      }
      if (fs.existsSync(this.outputZip)) {
        throw new Error(`outputZip already exists (${this.outputZip}); deletion or overwrite is forbidden.`);
      }
    }
    await assertNoSymlinksInPath(kitDir);
    if (this.outputZip) await assertNoSymlinksInPath(this.outputZip);
    if (kitDir === this.packageDir || kitDir.startsWith(this.packageDir + path.sep)
      || this.packageDir.startsWith(kitDir + path.sep)) throw new Error('Package/output directories overlap.');
    if (!/^[a-f0-9]{40}$/.test(this.expectedSourceSha ?? '')) throw new Error('Explicit exact expected source SHA is required.');

    // 2. Run strict release verifier on the source candidate package
    const verifier = new ReleaseVerifier({
      releaseDir: this.packageDir,
      strict: this.strict,
      expectedSha: this.expectedSourceSha,
    });
    const verification = await verifier.verify();
    if (!verification.success) {
      throw new Error(`Candidate package verification failed: ${verification.failures.join('; ')}`);
    }

    // 3. Read and validate manifest
    const manifestPath = path.join(this.packageDir, 'release-manifest.json');
    const manifestSha256 = computeFileSha256(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (manifest.source_sha === '96538d9affdc843d08ef3c801f15c7f92dfd46b3' && this.profileConfig.id === 'legacy_7a_19') {
      throw new Error('Release 96538d9affdc843d08ef3c801f15c7f92dfd46b3 requires --profile=b3_21; legacy profile is rejected for this release.');
    }
    if (manifest.source_sha === '55dfa645e59e66c2da03744673fbb212a5077d51' && this.profileConfig.id !== 'installed_697_23') {
      throw new Error('Release 55dfa645e59e66c2da03744673fbb212a5077d51 requires --profile=installed_697_23; earlier profiles are rejected for this release.');
    }

    // Refuse dirty or test builds
    if (manifest.is_dirty !== false) {
      throw new Error('Refusing dirty candidate package for production upgrade kit');
    }
    if (manifest.classification !== 'UNREVIEWED_RELEASE_CANDIDATE') {
      throw new Error(`Refusing package with classification: ${manifest.classification}; expected UNREVIEWED_RELEASE_CANDIDATE`);
    }

    // 4. Inspect public/build-receipt.json to ensure production origin and profile (refuse staging)
    const receiptPath = path.join(this.packageDir, 'public/build-receipt.json');
    if (!fs.existsSync(receiptPath)) {
      throw new Error('Candidate package is missing public/build-receipt.json');
    }
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const flags = receipt.flags || {};
    if (flags.VITE_HOSTPAPA_PROFILE !== 'production') {
      throw new Error(`Refusing package with profile "${flags.VITE_HOSTPAPA_PROFILE}"; expected "production"`);
    }
    if (flags.VITE_IDENTITY_PRODUCTION_OPT_IN !== 'true' || flags.VITE_IDENTITY_NONPRODUCTION_OPT_IN !== 'false') {
      throw new Error('Refusing package without strict production identity flags');
    }
    const approvedOrigins = ['https://www.gazaairport.com', 'https://gazaairport.com'];
    if (!approvedOrigins.includes(receipt.origin)) {
      throw new Error(`Refusing package with origin "${receipt.origin}"; expected production domain`);
    }

    // 5. Verify database migrations count (must be exactly target_migration_count)
    const migrationsDir = path.join(this.packageDir, 'private/backend/database/migrations');
    if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
      throw new Error('Package is missing private/backend/database/migrations directory');
    }
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.php'))
      .sort();

    const targetMigrationCount = this.profileConfig.target_migration_count || 21;
    if (migrationFiles.length === 23 && this.profileConfig.id !== 'installed_965_21' && this.profileConfig.id !== 'installed_697_23') {
      throw new Error(`Candidate release with 23 migrations requires --profile=installed_965_21; profile ${this.profileConfig.id} is rejected.`);
    }
    if (migrationFiles.length !== targetMigrationCount) {
      throw new Error(`Expected exactly ${targetMigrationCount} migrations in new release candidate, found ${migrationFiles.length}`);
    }
    if (!migrationFiles.includes('2026_10_14_000001_add_email_verification_codes.php') ||
        !migrationFiles.includes('2026_10_14_000002_expand_memorial_network.php')) {
      throw new Error('Package missing required new post-launch Batch 01 migrations');
    }
    if (targetMigrationCount === 23) {
      if (!migrationFiles.includes('2026_10_16_000001_guest_reservations.php') ||
          !migrationFiles.includes('2026_10_17_000001_optional_guest_passenger_details.php')) {
        throw new Error('Package missing required PR18 guest migrations');
      }
    }

    if (this.profileConfig.id === 'installed_697_23') {
      // Schema compatibility verification: compare baseline and candidate migration identities and bytes to refuse incompatible
      const baselineMigrations = {};
      for (const [relPath, entry] of Object.entries(manifestJson.private_files || {})) {
        if (/^backend\/database\/migrations\/[a-zA-Z0-9_]+\.php$/.test(relPath)) {
          baselineMigrations[relPath] = entry.sha256;
        }
      }
      const candidateMigrations = {};
      for (const [relPath, entry] of Object.entries(manifest.private_files || {})) {
        if (/^backend\/database\/migrations\/[a-zA-Z0-9_]+\.php$/.test(relPath)) {
          candidateMigrations[relPath] = entry.sha256;
        }
      }
      const baselineKeys = Object.keys(baselineMigrations).sort();
      const candidateKeys = Object.keys(candidateMigrations).sort();

      if (baselineKeys.length !== candidateKeys.length) {
        throw new Error(`Schema compatibility failure: baseline has ${baselineKeys.length} migrations, candidate has ${candidateKeys.length} migrations.`);
      }

      for (const key of baselineKeys) {
        if (!candidateMigrations[key]) {
          throw new Error(`Schema compatibility failure: candidate missing baseline migration ${key}.`);
        }
        if (candidateMigrations[key] !== baselineMigrations[key]) {
          throw new Error(`Schema compatibility failure: candidate migration ${key} bytes differ from baseline (expected ${baselineMigrations[key]}, got ${candidateMigrations[key]}).`);
        }
      }
    }

    // 6. Verify installer presence in package
    const installerRelPath = 'installer/hostpapa-install.php';
    const installerPath = path.join(this.packageDir, installerRelPath);
    if (!fs.existsSync(installerPath)) {
      throw new Error('Missing installer in candidate package');
    }
    const installerSha256 = computeFileSha256(installerPath);
    if (manifest.installer?.[installerRelPath]?.sha256 !== installerSha256) {
      throw new Error('Candidate installer checksum mismatch with manifest');
    }

    // 7. Ensure upgrade runner template is present and render for profile
    if (!fs.existsSync(RUNNER_SOURCE_FILE)) {
      throw new Error(`Upgrade runner source file not found: ${RUNNER_SOURCE_FILE}`);
    }
    const rawRunner = fs.readFileSync(RUNNER_SOURCE_FILE, 'utf8');
    const templateRunnerSha256 = crypto.createHash('sha256').update(rawRunner).digest('hex');
    const renderedRunner = renderRunnerSource(rawRunner, this.profileConfig);
    const renderedRunnerSha256 = crypto.createHash('sha256').update(renderedRunner).digest('hex');
    const renderedRunnerSize = Buffer.byteLength(renderedRunner, 'utf8');

    // 8. Create kit output directory
    fs.mkdirSync(kitDir, { recursive: true });

    // 9. Assemble upgrade kit contents
    // a) copy verified release bundle into kitDir/release
    const targetReleaseDir = path.join(kitDir, 'release');
    copyDirectoryRecursive(this.packageDir, targetReleaseDir);

    // b) write rendered production-upgrade-runner.php
    const targetRunnerPath = path.join(kitDir, 'production-upgrade-runner.php');
    fs.writeFileSync(targetRunnerPath, renderedRunner, { mode: 0o644 });

    // c) generate closed upgrade-manifest.json
    const upgradeManifest = {
      schema_version: '1.0',
      kit_type: 'production_upgrade',
      created_at: new Date().toISOString(),
      profile: this.profileConfig.id,
      target_release: {
        release_id: manifest.release_id,
        source_sha: manifest.source_sha,
        manifest_sha256: manifestSha256,
        migration_count: migrationFiles.length,
      },
      installed_binding: {
        profile: this.profileConfig.id,
        source_sha: this.installedBinding.source_sha,
        release_id: this.installedBinding.release_id,
        manifest_sha256: this.installedBinding.manifest_sha256,
        migration_count: this.installedBinding.migration_count,
        database: this.installedBinding.database,
        app_dir: this.installedBinding.app_dir,
        target_webroot: this.installedBinding.target_webroot,
        kit_folder: this.installedBinding.kit_folder,
        rollback_policy: this.installedBinding.rollback_policy,
      },
      runner: {
        path: 'production-upgrade-runner.php',
        template_sha256: templateRunnerSha256,
        sha256: renderedRunnerSha256,
        size: renderedRunnerSize,
        rendered: this.profileConfig.id !== 'legacy_7a_19',
      },
      installer: {
        path: 'release/installer/hostpapa-install.php',
        sha256: installerSha256,
      },
      operator_instructions: {
        upload_target: `/home/gaza5045/${this.profileConfig.kit_folder}`,
        check_command: `php /home/gaza5045/${this.profileConfig.kit_folder}/production-upgrade-runner.php --check`,
        upgrade_command: `php /home/gaza5045/${this.profileConfig.kit_folder}/production-upgrade-runner.php --upgrade --confirm-upgrade`,
        rollback_command: `php /home/gaza5045/${this.profileConfig.kit_folder}/production-upgrade-runner.php --rollback --confirm-rollback`,
      },
      tooling: {
        builder_path: 'tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs',
        builder_sha256: computeFileSha256(BUILDER_SOURCE_FILE),
        cli_path: 'scripts/prepare-hostpapa-production-upgrade.mjs',
        cli_sha256: computeFileSha256(CLI_SOURCE_FILE),
        runner_template_path: 'tools/hostpapa-release/production-upgrade/production-upgrade-runner.php',
        runner_template_sha256: templateRunnerSha256,
      },
    };

    const upgradeManifestPath = path.join(kitDir, 'upgrade-manifest.json');
    fs.writeFileSync(upgradeManifestPath, JSON.stringify(upgradeManifest, null, 2) + '\n', { mode: 0o644 });
    const upgradeManifestSha256 = computeFileSha256(upgradeManifestPath);

    // 10. Generate ZIP archive if requested
    let zipPath = null;
    let zipSha256 = null;
    if (this.outputZip) {
      zipPath = this.outputZip;
      const allFiles = collectAllFiles(kitDir);
      const entries = allFiles.map(({ relPath, fullPath }) => ({
        path: relPath,
        content: fs.readFileSync(fullPath),
      }));
      writeZipArchive(entries, zipPath);
      zipSha256 = computeFileSha256(zipPath);
    }

    return {
      kitDir,
      zipPath,
      zipSha256,
      targetReleaseId: manifest.release_id,
      targetSourceSha: manifest.source_sha,
      targetManifestSha256: manifestSha256,
      upgradeManifestSha256,
      runnerSha256: renderedRunnerSha256,
      templateRunnerSha256,
      migrationCount: migrationFiles.length,
      installedBinding: this.installedBinding,
      profile: this.profileConfig.id,
    };
  }
}
