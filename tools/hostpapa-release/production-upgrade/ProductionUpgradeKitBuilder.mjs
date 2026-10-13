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

export const INSTALLED_PIN = Object.freeze({
  source_sha: '7a8f0fa2f25851c4f75422f86139e0bb020ea4de',
  release_id: 'rel_20261013T082656_7a8f0fa_clean',
  manifest_sha256: 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf',
  migration_count: 19,
  database: 'gaza5045_gateway_live',
  app_dir: '/home/gaza5045/gaza-gateway',
  target_webroot: '/home/gaza5045/public_html',
});

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
    if (!options.packageDir) {
      throw new Error('packageDir option is required');
    }
    this.packageDir = path.resolve(options.packageDir);
    this.outputDir = options.outputDir ? path.resolve(options.outputDir) : null;
    this.outputZip = options.outputZip ? path.resolve(options.outputZip) : null;
    this.expectedSourceSha = options.expectedSourceSha || null;
    this.strict = options.strict ?? true;

    // Pin cannot be overridden except explicitly in test mode
    if (options.installedBinding) {
      if (!options.allowTestOverride || process.env.NODE_ENV !== 'test') {
        throw new Error('Overriding installed pin is forbidden.');
      }
      this.installedBinding = Object.freeze({ ...INSTALLED_PIN, ...options.installedBinding });
    } else {
      this.installedBinding = INSTALLED_PIN;
    }
  }

  async build() {
    await assertNoSymlinksInPath(this.packageDir);

    if (!fs.existsSync(this.packageDir) || !fs.statSync(this.packageDir).isDirectory()) {
      throw new Error(`Package directory does not exist or is not a directory: ${this.packageDir}`);
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

    // 5. Verify database migrations count (must be exactly 21 for new source)
    const migrationsDir = path.join(this.packageDir, 'private/backend/database/migrations');
    if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
      throw new Error('Package is missing private/backend/database/migrations directory');
    }
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.php'))
      .sort();

    if (migrationFiles.length !== 21) {
      throw new Error(`Expected exactly 21 migrations in new release candidate, found ${migrationFiles.length}`);
    }
    if (!migrationFiles.includes('2026_10_14_000001_add_email_verification_codes.php') ||
        !migrationFiles.includes('2026_10_14_000002_expand_memorial_network.php')) {
      throw new Error('Package missing required new post-launch Batch 01 migrations');
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

    // 7. Ensure upgrade runner template is present
    if (!fs.existsSync(RUNNER_SOURCE_FILE)) {
      throw new Error(`Upgrade runner source file not found: ${RUNNER_SOURCE_FILE}`);
    }
    const runnerSha256 = computeFileSha256(RUNNER_SOURCE_FILE);
    const runnerSize = fs.statSync(RUNNER_SOURCE_FILE).size;

    // 8. Create kit output directory
    fs.mkdirSync(kitDir, { recursive: true });

    // 9. Assemble upgrade kit contents
    // a) copy verified release bundle into kitDir/release
    const targetReleaseDir = path.join(kitDir, 'release');
    copyDirectoryRecursive(this.packageDir, targetReleaseDir);

    // b) copy production-upgrade-runner.php
    const targetRunnerPath = path.join(kitDir, 'production-upgrade-runner.php');
    fs.copyFileSync(RUNNER_SOURCE_FILE, targetRunnerPath);

    // c) generate closed upgrade-manifest.json
    const upgradeManifest = {
      schema_version: '1.0',
      kit_type: 'production_upgrade',
      created_at: new Date().toISOString(),
      target_release: {
        release_id: manifest.release_id,
        source_sha: manifest.source_sha,
        manifest_sha256: manifestSha256,
        migration_count: migrationFiles.length,
      },
      installed_binding: {
        source_sha: this.installedBinding.source_sha,
        release_id: this.installedBinding.release_id,
        manifest_sha256: this.installedBinding.manifest_sha256,
        migration_count: this.installedBinding.migration_count,
        database: this.installedBinding.database,
        app_dir: this.installedBinding.app_dir,
        target_webroot: this.installedBinding.target_webroot,
      },
      runner: {
        path: 'production-upgrade-runner.php',
        sha256: runnerSha256,
        size: runnerSize,
      },
      installer: {
        path: 'release/installer/hostpapa-install.php',
        sha256: installerSha256,
      },
      operator_instructions: {
        upload_target: '/home/gaza5045/gaza-upgrade-package',
        check_command: 'php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --check',
        upgrade_command: 'php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --upgrade --confirm-upgrade',
        rollback_command: 'php /home/gaza5045/gaza-upgrade-package/production-upgrade-runner.php --rollback --confirm-rollback',
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
      runnerSha256,
      migrationCount: migrationFiles.length,
      installedBinding: this.installedBinding,
    };
  }
}
