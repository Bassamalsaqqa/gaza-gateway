import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateHtaccess } from "./HtaccessTemplate.mjs";
import { generatePublicEntrypoint } from "./PublicEntrypointTemplate.mjs";
import { generateHostPapaCli } from "./HostPapaCliTemplate.mjs";
import { assertNoSymlinksInPath, assertPathWithinRoot, normalizeRelativePath } from "./SafePath.mjs";

const DEFAULT_WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Computes SHA-256 hash of a file.
 */
export async function computeFileHash(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Recursively lists all files in a directory and returns relative paths (forward-slashed).
 * Strictly rejects symbolic links and unsupported file types.
 */
export async function listDirectoryFiles(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    normalizeRelativePath(rel);
    const fullPath = path.join(dir, entry.name);

    // Explicitly check lstat for symlinks
    const s = await lstat(fullPath);
    if (s.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected in release files: ${rel}`);
    }

    if (entry.isDirectory()) {
      files.push(...(await listDirectoryFiles(fullPath, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      throw new Error(`Unsupported filesystem entry type (not a file or directory): ${rel}`);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Release builder engine.
 */
export class ReleaseBuilder {
  constructor(options = {}) {
    this.root = path.resolve(options.root ?? DEFAULT_WORKSPACE_ROOT);
    this.scratchDir = path.resolve(this.root, "scratch");
    this.outputDir = path.resolve(this.root, options.outputDir ?? "scratch/.hostpapa-shared-release");
    this.sourceSha = options.sourceSha ?? null;
    this.vendorDir = options.vendorDir ? path.resolve(options.vendorDir) : null;
    this.clientDist = options.clientDist ? path.resolve(options.clientDist) : null;
    this.allowDirty = Boolean(options.allowDirty);
    this.isEngineeringTest = Boolean(options.isEngineeringTest ?? false);
    this.isAcceptedProductionCandidate = Boolean(options.isAcceptedProductionCandidate ?? false);

    this.validateOutputDirSafety();
  }

  /**
   * P1: Strict validation of outputDir BEFORE any mutation or deletion.
   */
  validateOutputDirSafety() {
    if (this.outputDir === this.scratchDir) {
      throw new Error(`Output directory cannot be the scratch root directory itself: ${this.outputDir}`);
    }

    try {
      assertPathWithinRoot(this.outputDir, this.scratchDir);
    } catch {
      throw new Error(`Output directory must be inside workspace scratch directory: ${this.outputDir}`);
    }

    if (!this.outputDir.startsWith(this.scratchDir + path.sep)) {
      throw new Error(`Output directory must be inside workspace scratch directory: ${this.outputDir}`);
    }

    // Refuse source paths or existing sensitive roots
    const sensitive = ["backend", "src", "public", "deployment", "tools", "scripts", "docs", "tests", "dist", "node_modules"];
    for (const name of sensitive) {
      const sensitivePath = path.join(this.root, name);
      if (this.outputDir === sensitivePath || this.outputDir.startsWith(sensitivePath + path.sep)) {
        throw new Error(`Output directory must be inside workspace scratch directory: ${this.outputDir}`);
      }
    }
  }

  /**
   * Resolves Git metadata: SHA and dirty working tree status.
   */
  resolveGitInfo() {
    let actualHeadSha;
    try {
      actualHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      throw new Error("Failed to resolve git HEAD SHA. Git repository state is required.");
    }

    if (!/^[0-9a-f]{40}$/i.test(actualHeadSha)) {
      throw new Error(`Invalid git HEAD SHA resolved: ${actualHeadSha}`);
    }

    // P2: Refuse arbitrary mismatched source SHA
    if (this.sourceSha && this.sourceSha.toLowerCase() !== actualHeadSha.toLowerCase()) {
      throw new Error(`Specified --source-sha (${this.sourceSha}) does not match actual git HEAD (${actualHeadSha})`);
    }

    const sha = actualHeadSha;

    let isDirty = false;
    try {
      execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], {cwd:this.root,stdio:['ignore','pipe','pipe'],timeout:15000});
      isDirty = Boolean(execFileSync('git', ['ls-files','--others','--exclude-standard'], {cwd:this.root,encoding:'utf8',timeout:15000}).trim());
    } catch { isDirty = true; }

    if (isDirty && !this.allowDirty) {
      throw new Error("Working tree contains uncommitted changes. Production candidate releases refuse dirty source. Use --allow-dirty for engineering test mode.");
    }

    return { sha, isDirty };
  }

  /**
   * P2: Discovers and verifies the locked Composer vendor directory.
   * Compares ALL locked production packages against installed.json.
   */
  async resolveLockedVendor() {
    const candidatePaths = [];
    if (this.vendorDir) {
      candidatePaths.push(this.vendorDir);
    }
    candidatePaths.push(path.join(this.root, "backend", "vendor"));

    let resolved = null;
    for (const cand of candidatePaths) {
      const autoload = path.join(cand, "autoload.php");
      const s = await stat(autoload).catch(() => null);
      if (s?.isFile()) {
        resolved = cand;
        break;
      }
    }

    if (!resolved) {
      throw new Error("Could not locate locked Composer vendor directory containing autoload.php");
    }

    // Verify Composer lock file and platform PHP requirements
    const lockPath = path.join(this.root, "backend", "composer.lock");
    const lockStats = await stat(lockPath).catch(() => null);
    if (!lockStats?.isFile()) {
      throw new Error("backend/composer.lock is missing");
    }

    const lockContent = JSON.parse(await readFile(lockPath, "utf8"));
    const phpConstraint = lockContent.platform?.php ?? "";
    if (!phpConstraint.includes("8.4") && !phpConstraint.includes("8.5")) {
      throw new Error(`composer.lock platform PHP requirement must be ^8.4 or higher, got: ${phpConstraint}`);
    }

    // Read installed.json
    const installedPath = path.join(resolved, "composer", "installed.json");
    const instStats = await stat(installedPath).catch(() => null);
    if (!instStats?.isFile()) {
      throw new Error("vendor/composer/installed.json is missing in vendor directory");
    }

    const installed = JSON.parse(await readFile(installedPath, "utf8"));
    const instPkgs = Array.isArray(installed) ? installed : installed.packages ?? [];
    const instMap = new Map(instPkgs.map((p) => [p.name, p]));

    // P4: Production Composer --no-dev audit: strictly reject any dev packages
    const lockedProductionPackages = lockContent.packages || [];
    const lockedDevPackages = lockContent["packages-dev"] || [];
    const devPackageNames = new Set(lockedDevPackages.map((p) => p.name));
    const prodPackageNames = new Set(lockedProductionPackages.map((p) => p.name));

    for (const pkg of instPkgs) {
      if (devPackageNames.has(pkg.name) || pkg["dev-requirement"] === true || pkg.dev === true) {
        throw new Error(`Dev package detected in vendor installed.json: ${pkg.name}. Production vendor must be installed with --no-dev.`);
      }
      if (!prodPackageNames.has(pkg.name)) {
        throw new Error(`Extra package in vendor installed.json not in composer.lock production packages: ${pkg.name}`);
      }
    }

    // Strictly verify that ALL locked production packages are present and match
    for (const lockedPkg of lockedProductionPackages) {
      if (!instMap.has(lockedPkg.name)) {
        throw new Error(`Locked production package missing from vendor installed.json: ${lockedPkg.name}`);
      }
      const instEntry = instMap.get(lockedPkg.name);
      if (instEntry.version !== lockedPkg.version) {
        throw new Error(`Version mismatch for ${lockedPkg.name}: locked=${lockedPkg.version}, installed=${instEntry.version}`);
      }
      if (lockedPkg.dist?.reference && lockedPkg.dist.reference !== instEntry.dist?.reference) {
        throw new Error(`Dist reference mismatch for ${lockedPkg.name}: locked=${lockedPkg.dist.reference}, installed=${instEntry.dist.reference}`);
      }
    }

    for (const pkg of lockedProductionPackages) {
      const installedPackage = instMap.get(pkg.name);
      if (pkg.source?.reference && pkg.source.reference !== installedPackage.source?.reference) {
        throw new Error('Missing or wrong locked source reference: ' + pkg.name);
      }
      const packagePath = path.join(resolved, pkg.name);
      await assertNoSymlinksInPath(packagePath);
      if (!(await stat(path.join(packagePath, 'composer.json')).catch(() => null))?.isFile()) {
        throw new Error('Missing installed package bytes: ' + pkg.name);
      }
    }
    await assertNoSymlinksInPath(resolved);
    await listDirectoryFiles(resolved);

    // Check platform check file exists
    const platformCheckPath = path.join(resolved, "composer", "platform_check.php");
    const platformCheckStats = await stat(platformCheckPath).catch(() => null);
    if (!platformCheckStats?.isFile() && !this.isEngineeringTest) {
      throw new Error("vendor/composer/platform_check.php is missing. Production vendor must contain authentic bundled platform check.");
    }

    return { vendorPath: resolved, phpConstraint, lockedCount: lockedProductionPackages.length };
  }

  async verifyComposerLockMatchesInstalled() {
    return this.resolveLockedVendor();
  }

  /**
   * Resolves static client distribution directory.
   * Strictly forbids other-repository traversal and validates build receipt.
   */
  async resolveClientDist(sourceSha) {
    const candidatePaths = [];
    if (this.clientDist) {
      candidatePaths.push(this.clientDist);
    }
    candidatePaths.push(path.join(this.root, "dist", "client"));

    let resolved = null;
    for (const cand of candidatePaths) {
      // Must stay within workspace or scratch
      assertPathWithinRoot(cand, this.root);
      const idx = path.join(cand, "index.html");
      const s = await stat(idx).catch(() => null);
      if (s?.isFile()) {
        resolved = cand;
        break;
      }
    }

    if (!resolved) {
      throw new Error("Could not locate built static client directory containing index.html");
    }

    // Validate client build receipt if present, or enforce receipt for release candidate
    const receiptPath = path.join(resolved, "build-receipt.json");
    const receiptStats = await stat(receiptPath).catch(() => null);
    if (receiptStats?.isFile()) {
      let receipt;
      try {
        receipt = JSON.parse(await readFile(receiptPath, "utf8"));
      } catch (e) {
        throw new Error(`Client build receipt contains invalid JSON: ${e.message}`);
      }

      // 1. Require exact 40-hex source SHA
      if (!receipt.source_sha || typeof receipt.source_sha !== "string" || !/^[0-9a-f]{40}$/i.test(receipt.source_sha)) {
        throw new Error("Client build receipt missing or invalid source_sha (exact 40-char hex commit SHA required)");
      }
      if (sourceSha && receipt.source_sha.toLowerCase() !== sourceSha.toLowerCase()) {
        throw new Error(`Client build receipt commit SHA (${receipt.source_sha}) does not match repository HEAD (${sourceSha})`);
      }

      // 2. Require explicit approved frontend flags
      if (!receipt.flags || typeof receipt.flags !== "object" || Array.isArray(receipt.flags)) {
        throw new Error("Client build receipt missing flags object");
      }
      if (receipt.flags.HOSTPAPA_SHARED_ENABLED !== true) {
        throw new Error("Client build receipt missing approved frontend flags (HOSTPAPA_SHARED_ENABLED must be true)");
      }

      const flags = receipt.flags;
      const profile = flags.VITE_HOSTPAPA_PROFILE ?? "production";
      const origins = profile === "staging" ? ["https://staging.gazaairport.com"] : ["https://www.gazaairport.com", "https://gazaairport.com"];
      if (!["production", "staging"].includes(profile)) throw new Error("Unknown artifact deployment profile");
      this.deploymentProfile = profile;
      if (receipt.schema_version !== 1 || !origins.includes(receipt.origin)
        || flags.VITE_IDENTITY_UI_MODE !== 'backend' || flags.VITE_IDENTITY_PRODUCTION_OPT_IN !== 'true'
        || flags.VITE_IDENTITY_NONPRODUCTION_OPT_IN !== 'false'
        || flags.VITE_IDENTITY_API_BASE_URL !== receipt.origin + '/api/v1') {
        throw new Error('Client receipt is missing exact approved same-origin production settings');
      }

      // 3. Require exact full static artifact hash inventory (excluding build-receipt.json itself)
      if (!receipt.artifact_hashes || typeof receipt.artifact_hashes !== "object" || Array.isArray(receipt.artifact_hashes)) {
        throw new Error("Client build receipt missing artifact_hashes inventory object");
      }

      const diskFiles = (await listDirectoryFiles(resolved)).filter((f) => f !== "build-receipt.json");
      if (diskFiles.length === 0) {
        throw new Error("Client distribution directory contains no static files");
      }

      const receiptKeys = Object.keys(receipt.artifact_hashes).sort((a, b) => a.localeCompare(b, "en"));
      for (const k of receiptKeys) {
        normalizeRelativePath(k);
      }

      if (JSON.stringify(diskFiles) !== JSON.stringify(receiptKeys)) {
        throw new Error("Client build receipt artifact inventory does not match disk contents (missing, unexpected, or non-normalized files)");
      }

      for (const relPath of diskFiles) {
        const expectedHash = receipt.artifact_hashes[relPath];
        if (!expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash)) {
          throw new Error(`Invalid or missing SHA-256 hash in build receipt for ${relPath}`);
        }
        const abs = path.join(resolved, relPath);
        const actualHash = await computeFileHash(abs);
        if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
          throw new Error(`Client build receipt artifact hash mismatch for ${relPath}`);
        }
      }
    } else if (!this.allowDirty && !this.isEngineeringTest) {
      throw new Error("Missing client dist build-receipt.json. Release candidate requires fresh exact-source build receipt.");
    }

    return resolved;
  }

  /**
   * Builds the complete release package.
   */
  async build() {
    // P1: Validate output directory safety and symlink ancestors before ANY filesystem action
    this.validateOutputDirSafety();
    await assertNoSymlinksInPath(this.outputDir);

    const { sha: sourceSha, isDirty } = this.resolveGitInfo();
    const { vendorPath, phpConstraint, lockedCount } = await this.resolveLockedVendor();
    const clientDistPath = await this.resolveClientDist(sourceSha);

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const shortSha = sourceSha.slice(0, 7);
    const releaseId = `rel_${timestamp}_${shortSha}_${isDirty ? "dirty" : "clean"}`;

    const publicOut = path.join(this.outputDir, "public");
    const privateOut = path.join(this.outputDir, "private");
    const installerOut = path.join(this.outputDir, "installer");

    // Clean target directory safely
    await rm(this.outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await mkdir(publicOut, { recursive: true });
    await mkdir(privateOut, { recursive: true });
    await mkdir(installerOut, { recursive: true });

    await assertNoSymlinksInPath(clientDistPath);
    await listDirectoryFiles(clientDistPath);
    await listDirectoryFiles(path.join(this.root, 'backend', 'app'));

    // 1. Copy static client assets
    await cp(clientDistPath, publicOut, { recursive: true, force: true });

    // Ensure sitemap.xml exists in public
    const publicSitemap = path.join(publicOut, "sitemap.xml");
    if (!(await stat(publicSitemap).catch(() => null))?.isFile()) {
      const repoSitemap = path.join(this.root, "public", "sitemap.xml");
      if ((await stat(repoSitemap).catch(() => null))?.isFile()) {
        await cp(repoSitemap, publicSitemap);
      }
    }

    // Ensure robots.txt exists in public
    const publicRobots = path.join(publicOut, "robots.txt");
    if (!(await stat(publicRobots).catch(() => null))?.isFile()) {
      const repoRobots = path.join(this.root, "public", "robots.txt");
      if ((await stat(repoRobots).catch(() => null))?.isFile()) {
        await cp(repoRobots, publicRobots);
      }
    }

    if (this.deploymentProfile === 'staging') {
      await writeFile(path.join(publicOut, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
    }
    // Write merged artifact-local .htaccess
    await writeFile(path.join(publicOut, ".htaccess"), generateHtaccess("", this.deploymentProfile === "staging" ? "https://staging.gazaairport.com" : "https://www.gazaairport.com"), "utf8");

    // Write public API bridge entrypoint index.php
    await writeFile(path.join(publicOut, "index.php"), generatePublicEntrypoint(this.deploymentProfile === "staging" ? "gaza-gateway-staging" : "gaza-gateway"), "utf8");

    // 2. Copy private Laravel backend application files
    // P2: Create source-compatible isolated layout with both private/backend and root compatibility
    const backendRoot = path.join(this.root, "backend");
    const backendDirsToCopy = ["app", "bootstrap", "config", "database", "resources", "routes"];
    const privateBackendOut = path.join(privateOut, "backend");
    await mkdir(privateBackendOut, { recursive: true });

    for (const dir of backendDirsToCopy) {
      const srcDir = path.join(backendRoot, dir);
      if ((await stat(srcDir).catch(() => null))?.isDirectory()) {
        await listDirectoryFiles(srcDir);
        await cp(srcDir, path.join(privateBackendOut, dir), { recursive: true, force: true });
      }
    }

    // Clean bootstrap/cache in privateBackendOut to ensure zero credential or config contamination
    const bootstrapCacheOut = path.join(privateBackendOut, "bootstrap", "cache");
    await rm(bootstrapCacheOut, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await mkdir(bootstrapCacheOut, { recursive: true });
    await writeFile(path.join(bootstrapCacheOut, ".gitignore"), "*\n!.gitignore\n", "utf8");

    // Copy artisan CLI
    const artisanFile = path.join(backendRoot, "artisan");
    if ((await stat(artisanFile).catch(() => null))?.isFile()) {
      await cp(artisanFile, path.join(privateBackendOut, "artisan"));
    }

    // Copy composer control files
    await cp(path.join(backendRoot, "composer.json"), path.join(privateBackendOut, "composer.json"));
    await cp(path.join(backendRoot, "composer.lock"), path.join(privateBackendOut, "composer.lock"));

    // Copy locked vendor directory into backend/vendor
    await cp(vendorPath, path.join(privateBackendOut, "vendor"), { recursive: true, force: true });

    // P3: Package normative manifests and schemas into isolated release (docs/)
    const docsBackendOut = path.join(privateOut, "docs", "backend");
    await mkdir(docsBackendOut, { recursive: true });

    for (const docFile of ["openapi.v1.json", "operation-policies.v1.json", "identity-command-contracts.v1.json"]) {
      const src = path.join(this.root, "docs", "backend", docFile);
      if ((await stat(src).catch(() => null))?.isFile()) {
        await cp(src, path.join(docsBackendOut, docFile));
      }
    }

    const docsProdOut = path.join(privateOut, "docs", "production");
    await mkdir(docsProdOut, { recursive: true });
    const freeResSchemaSrc = path.join(this.root, "docs", "production", "free-reservation-command.schema.json");
    if ((await stat(freeResSchemaSrc).catch(() => null))?.isFile()) {
      await cp(freeResSchemaSrc, path.join(docsProdOut, "free-reservation-command.schema.json"));
    }

    const scriptsOut = path.join(privateOut, "scripts");
    await mkdir(scriptsOut, { recursive: true });
    const pinsSrc = path.join(this.root, "scripts", "identity-booking-transport-pins.json");
    if ((await stat(pinsSrc).catch(() => null))?.isFile()) {
      await cp(pinsSrc, path.join(scriptsOut, "identity-booking-transport-pins.json"));
    }

    // P8: Package hostpapa-cli command runner into private bin and root
    const binOut = path.join(privateOut, "bin");
    await mkdir(binOut, { recursive: true });
    await writeFile(path.join(binOut, "hostpapa-cli"), generateHostPapaCli(this.deploymentProfile === "staging" ? "gaza-gateway-staging" : "gaza-gateway"), { mode: 0o755 });
    await writeFile(path.join(privateOut, "hostpapa-cli.php"), generateHostPapaCli(), "utf8");

    // P6: Retain public snapshot inside private package for non-destructive rollbacks
    const publicSnapshotOut = path.join(privateOut, "public_snapshot");
    await cp(publicOut, publicSnapshotOut, { recursive: true, force: true });

    // 3. Copy installer
    const installerSrc = path.join(backendRoot, "scripts", "hostpapa-install.php");
    if ((await stat(installerSrc).catch(() => null))?.isFile()) {
      await cp(installerSrc, path.join(installerOut, "hostpapa-install.php"));
    }

    // Runtime provenance belongs to immutable release bytes, never the shared .env.
    await writeFile(path.join(privateOut, "SOURCE_COMMIT.txt"), `${sourceSha}\n`, "utf8");

    // 4. Index files and calculate hashes (rejecting symlinks)
    const publicFilesList = await listDirectoryFiles(publicOut);
    const privateFilesList = await listDirectoryFiles(privateOut);

    const publicFilesMap = {};
    let publicBytes = 0;
    for (const rel of publicFilesList) {
      normalizeRelativePath(rel);
      const abs = path.join(publicOut, rel);
      const s = await stat(abs);
      const hash = await computeFileHash(abs);
      publicFilesMap[rel] = { size: s.size, sha256: hash };
      publicBytes += s.size;
    }

    const privateFilesMap = {};
    let privateBytes = 0;
    for (const rel of privateFilesList) {
      normalizeRelativePath(rel);
      const abs = path.join(privateOut, rel);
      const s = await stat(abs);
      const hash = await computeFileHash(abs);
      privateFilesMap[rel] = { size: s.size, sha256: hash };
      privateBytes += s.size;
    }

    // 5. Index and hash installer files
    const installerFilesList = await listDirectoryFiles(installerOut);
    const installerFilesMap = {};
    for (const rel of installerFilesList) {
      normalizeRelativePath(rel);
      const abs = path.join(installerOut, rel);
      const s = await stat(abs);
      const hash = await computeFileHash(abs);
      installerFilesMap[`installer/${rel}`] = { size: s.size, sha256: hash };
    }

    // 6. Write and hash root control files
    // P3: Clean source cleanliness is NEVER acceptance: use UNREVIEWED_RELEASE_CANDIDATE absent independent acceptance
    const classification = isDirty || this.isEngineeringTest
      ? "ENGINEERING_TEST_BUILD"
      : "UNREVIEWED_RELEASE_CANDIDATE";

    // Plain text manifests for fast CLI audit
    const publicManifestLines = Object.keys(publicFilesMap)
      .sort()
      .map((k) => `${publicFilesMap[k].sha256}  public/${k}`);
    const publicManifestText = publicManifestLines.join("\n") + "\n";
    await writeFile(path.join(this.outputDir, "manifest-public.txt"), publicManifestText, "utf8");

    const privateManifestLines = Object.keys(privateFilesMap)
      .sort()
      .map((k) => `${privateFilesMap[k].sha256}  private/${k}`);
    const privateManifestText = privateManifestLines.join("\n") + "\n";
    await writeFile(path.join(this.outputDir, "manifest-private.txt"), privateManifestText, "utf8");

    const sourceCommitText = `${sourceSha}\n`;
    await writeFile(path.join(this.outputDir, "SOURCE_COMMIT.txt"), sourceCommitText, "utf8");

    const releaseIdText = `${releaseId}\n`;
    await writeFile(path.join(this.outputDir, "RELEASE_ID.txt"), releaseIdText, "utf8");

    const statusText = `${classification}\n`;
    await writeFile(path.join(this.outputDir, "STATUS.txt"), statusText, "utf8");

    const controlFilesNames = [
      "SOURCE_COMMIT.txt",
      "RELEASE_ID.txt",
      "STATUS.txt",
      "manifest-public.txt",
      "manifest-private.txt",
    ];
    const controlFilesMap = {};
    for (const name of controlFilesNames) {
      const abs = path.join(this.outputDir, name);
      const s = await stat(abs);
      const h = await computeFileHash(abs);
      controlFilesMap[name] = { size: s.size, sha256: h };
    }

    // 7. Generate closed-shape Manifest
    const manifest = {
      schema_version: "1.0",
      release_id: releaseId,
      source_sha: sourceSha,
      built_at: new Date().toISOString(),
      is_dirty: isDirty,
      classification,
      platform_requirements: {
        php: phpConstraint,
        laravel: "^13.0",
        locked_production_packages_count: lockedCount,
      },
      summary: {
        public_file_count: publicFilesList.length,
        public_bytes: publicBytes,
        private_file_count: privateFilesList.length,
        private_bytes: privateBytes,
        control_file_count: controlFilesNames.length,
      },
      control_files: controlFilesMap,
      installer: installerFilesMap,
      public_files: publicFilesMap,
      private_files: privateFilesMap,
    };

    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(this.outputDir, "release-manifest.json"), manifestJson, "utf8");

    const finalGit = this.resolveGitInfo();
    if (finalGit.sha !== sourceSha || finalGit.isDirty !== isDirty) throw new Error('Source changed during packaging');
    return {
      releaseId,
      sourceSha,
      isDirty,
      classification,
      outputDir: this.outputDir,
      publicFileCount: publicFilesList.length,
      publicBytes,
      privateFileCount: privateFilesList.length,
      privateBytes,
    };
  }
}
