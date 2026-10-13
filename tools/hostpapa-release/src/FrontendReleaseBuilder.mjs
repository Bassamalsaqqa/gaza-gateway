import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertNoSymlinksInPath, assertPathWithinRoot, normalizeRelativePath } from "./SafePath.mjs";

/**
 * Computes SHA-256 hash of a file.
 */
export async function computeFileHash(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Recursively lists all files in a directory and returns sorted relative paths (forward-slashed).
 * Strictly rejects symbolic links and unsupported file types.
 */
export async function listDirectoryFiles(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    normalizeRelativePath(rel);
    const fullPath = path.join(dir, entry.name);

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
 * FrontendReleaseBuilder: bounded frontend-only release builder for HostPapa.
 * Generates an isolated static package with manifest and control files.
 * Rejects preexisting output directories, symlinks, path escape, uncommitted source, and untrusted backend SHAs.
 */
export class FrontendReleaseBuilder {
  constructor(options = {}) {
    if (!options.root) {
      throw new Error("Explicit root workspace directory is required");
    }
    if (!options.outputDir) {
      throw new Error("Explicit outputDir is required");
    }
    if (!options.backendSha || typeof options.backendSha !== "string" || !/^[0-9a-f]{40}$/i.test(options.backendSha)) {
      throw new Error("Explicit 40-character hex backendSha is required");
    }

    this.root = path.resolve(options.root);
    this.scratchDir = path.resolve(this.root, "scratch");
    this.outputDir = path.resolve(this.root, options.outputDir);
    this.backendSha = options.backendSha.toLowerCase();
    this.clientDist = options.clientDist ? path.resolve(this.root, options.clientDist) : null;
    this.sourceSha = options.sourceSha ? options.sourceSha.toLowerCase() : null;

    if (options.releaseId !== undefined && options.releaseId !== null) {
      // releaseId max length 128 characters: prefix "rel_fe_" (7) + suffix up to 121
      if (typeof options.releaseId !== "string" || !/^rel_fe_[A-Za-z0-9_]{1,121}$/.test(options.releaseId)) {
        throw new Error(`Invalid releaseId format: ${options.releaseId}. Must match ^rel_fe_[A-Za-z0-9_]{1,121}$ (maximum 128 characters total)`);
      }
      this.releaseId = options.releaseId;
    } else {
      this.releaseId = null;
    }
  }

  /**
   * Validates output directory safety.
   * Must be strictly under scratch/ (not scratch/ itself).
   * Refuses preexisting output directory instead of deleting it.
   */
  async validateOutputDirSafety() {
    if (this.outputDir === this.scratchDir) {
      throw new Error(`Output directory cannot be the scratch root directory itself: ${this.outputDir}`);
    }

    assertPathWithinRoot(this.outputDir, this.scratchDir);

    if (!this.outputDir.startsWith(this.scratchDir + path.sep)) {
      throw new Error(`Output directory must be inside workspace scratch directory: ${this.outputDir}`);
    }

    // Refuse source paths or existing sensitive roots
    const sensitive = [
      "backend",
      "src",
      "public",
      "deployment",
      "tools",
      "scripts",
      "docs",
      "tests",
      "dist",
      "node_modules",
    ];
    for (const name of sensitive) {
      const sensitivePath = path.join(this.root, name);
      if (this.outputDir === sensitivePath || this.outputDir.startsWith(sensitivePath + path.sep)) {
        throw new Error(`Output directory must be inside workspace scratch directory: ${this.outputDir}`);
      }
    }

    // Reject symlinks in path
    await assertNoSymlinksInPath(this.outputDir);

    // Refuse preexisting output instead of deleting it
    const existing = await stat(this.outputDir).catch(() => null);
    if (existing) {
      throw new Error(`Output directory already exists; refusing preexisting output instead of deletion: ${this.outputDir}`);
    }
  }

  /**
   * Resolves Git metadata: clean exact Git HEAD required. Always refuses dirty working tree.
   */
  resolveGitInfo() {
    let actualHeadSha;
    try {
      actualHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 15000,
      }).trim();
    } catch {
      throw new Error("Failed to resolve git HEAD SHA. Git repository state is required.");
    }

    if (!/^[0-9a-f]{40}$/i.test(actualHeadSha)) {
      throw new Error(`Invalid git HEAD SHA resolved: ${actualHeadSha}`);
    }

    if (this.sourceSha && this.sourceSha !== actualHeadSha.toLowerCase()) {
      throw new Error(`Specified --source-sha (${this.sourceSha}) does not match actual git HEAD (${actualHeadSha})`);
    }

    const sha = actualHeadSha.toLowerCase();

    let isDirty = false;
    try {
      execFileSync("git", ["diff", "--exit-code", "HEAD", "--"], {
        cwd: this.root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      });
      isDirty = Boolean(
        execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
          cwd: this.root,
          encoding: "utf8",
          timeout: 15000,
        }).trim()
      );
    } catch {
      isDirty = true;
    }

    if (isDirty) {
      throw new Error("Working tree contains uncommitted changes. Clean exact Git HEAD is required.");
    }

    return { sha, isDirty: false };
  }

  /**
   * Resolves and verifies client distribution directory and build receipt.
   */
  async resolveClientDist(sourceSha) {
    if (!this.clientDist) {
      throw new Error("Explicit clientDist directory is required");
    }

    assertPathWithinRoot(this.clientDist, this.root);
    await assertNoSymlinksInPath(this.clientDist);

    const s = await stat(this.clientDist).catch(() => null);
    if (!s?.isDirectory()) {
      throw new Error(`clientDist must be a valid directory: ${this.clientDist}`);
    }

    const idx = path.join(this.clientDist, "index.html");
    const idxStat = await stat(idx).catch(() => null);
    if (!idxStat?.isFile()) {
      throw new Error(`Could not locate index.html in clientDist: ${this.clientDist}`);
    }

    const receiptPath = path.join(this.clientDist, "build-receipt.json");
    const receiptStat = await stat(receiptPath).catch(() => null);
    if (!receiptStat?.isFile()) {
      throw new Error(`Missing client dist build-receipt.json in: ${this.clientDist}`);
    }

    let receipt;
    try {
      receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    } catch (e) {
      throw new Error(`Client build receipt contains invalid JSON: ${e.message}`);
    }

    // 1. Schema version
    if (receipt.schema_version !== 1) {
      throw new Error(`Client build receipt schema_version must be 1, got: ${receipt.schema_version}`);
    }

    // 2. Source SHA
    if (!receipt.source_sha || typeof receipt.source_sha !== "string" || !/^[0-9a-f]{40}$/i.test(receipt.source_sha)) {
      throw new Error("Client build receipt missing or invalid source_sha (exact 40-char hex commit SHA required)");
    }
    if (sourceSha && receipt.source_sha.toLowerCase() !== sourceSha.toLowerCase()) {
      throw new Error(`Client build receipt commit SHA (${receipt.source_sha}) does not match repository HEAD (${sourceSha})`);
    }

    // 3. Flags and profile
    if (!receipt.flags || typeof receipt.flags !== "object" || Array.isArray(receipt.flags)) {
      throw new Error("Client build receipt missing flags object");
    }
    if (receipt.flags.HOSTPAPA_SHARED_ENABLED !== true) {
      throw new Error("Client build receipt missing approved frontend flags (HOSTPAPA_SHARED_ENABLED must be true)");
    }

    const flags = receipt.flags;
    const profile = flags.VITE_HOSTPAPA_PROFILE ?? "production";
    if (!["production", "staging"].includes(profile)) {
      throw new Error(`Unknown artifact deployment profile: ${profile}`);
    }
    const origins = profile === "staging"
      ? ["https://staging.gazaairport.com"]
      : ["https://www.gazaairport.com", "https://gazaairport.com"];

    if (!origins.includes(receipt.origin)) {
      throw new Error(`Client build receipt origin (${receipt.origin}) is not an approved origin for profile ${profile}`);
    }

    if (
      flags.VITE_IDENTITY_UI_MODE !== "backend" ||
      flags.VITE_IDENTITY_PRODUCTION_OPT_IN !== "true" ||
      flags.VITE_IDENTITY_NONPRODUCTION_OPT_IN !== "false" ||
      flags.VITE_IDENTITY_API_BASE_URL !== receipt.origin + "/api/v1"
    ) {
      throw new Error("Client receipt is missing exact approved same-origin settings");
    }

    // 4. Artifact inventory
    if (!receipt.artifact_hashes || typeof receipt.artifact_hashes !== "object" || Array.isArray(receipt.artifact_hashes)) {
      throw new Error("Client build receipt missing artifact_hashes inventory object");
    }

    const diskFiles = (await listDirectoryFiles(this.clientDist)).filter((f) => f !== "build-receipt.json");
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
      const abs = path.join(this.clientDist, relPath);
      const actualHash = await computeFileHash(abs);
      if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        throw new Error(`Client build receipt artifact hash mismatch for ${relPath}`);
      }
    }

    return { resolved: this.clientDist, profile, receipt, diskFiles };
  }

  /**
   * Filters out forbidden files: index.php, .htaccess, any PHP, env, logs, credentials, or scripts.
   */
  isForbiddenFile(relPath) {
    const lower = relPath.toLowerCase();
    const basename = path.basename(relPath).toLowerCase();

    // Explicitly forbidden entrypoints
    if (basename === "index.php" || basename === ".htaccess") {
      return true;
    }

    // Any PHP file
    if (/\.(?:php\d*|phtml|pht|phar|cgi|pl|py|sh|bat|cmd|ps1)(?:\.|$)/i.test(lower)) {
      return true;
    }

    // Any environment or config file
    if (basename.startsWith(".env") || basename.endsWith(".env") || [".user.ini", ".htpasswd"].includes(basename)) {
      return true;
    }

    // Any log file or log directory
    if (lower.endsWith(".log") || lower.startsWith("logs/") || lower.includes("/logs/")) {
      return true;
    }

    // Any credentials, keys, secrets, tokens, databases, backups
    if (/\.(key|pem|p12|crt|cert|secret|token|kdbx|sql|sqlite|bak)$/i.test(basename)) {
      return true;
    }
    if (/^(?:owner-bootstrap|credentials|secrets|(?:live|staging)-(?:approval|runtime))(?:\.|$)/i.test(basename)) {
      return true;
    }

    // cPanel configurations or deployment scripts
    if (basename === ".cpanel.yml" || basename === "cpanel.yml" || lower.endsWith(".sh")) {
      return true;
    }

    return false;
  }

  /**
   * Builds the isolated frontend release package.
   */
  async build() {
    await this.validateOutputDirSafety();

    const { sha: sourceSha } = this.resolveGitInfo();
    const { profile, receipt, diskFiles } = await this.resolveClientDist(sourceSha);

    // Filter candidate static assets
    const candidateFiles = [];
    for (const relPath of diskFiles) {
      if (!this.isForbiddenFile(relPath)) {
        candidateFiles.push(relPath);
      }
    }
    candidateFiles.push("build-receipt.json");

    // Bounds check BEFORE creating directories or performing any copies
    let precomputedBytes = 0;
    const fileStats = [];
    for (const relPath of candidateFiles) {
      const srcFile = path.join(this.clientDist, relPath);
      const s = await stat(srcFile);
      precomputedBytes += s.size;
      fileStats.push({ relPath, size: s.size, srcFile });
    }

    const fileCount = candidateFiles.length;
    if (fileCount === 0) {
      throw new Error("No static assets were included in the frontend release");
    }
    if (fileCount > 10000) {
      throw new Error(`File count exceeds bounded limit of 10,000 files: ${fileCount}`);
    }
    if (precomputedBytes > 1073741824) {
      throw new Error(`Total size exceeds bounded limit of 1 GiB: ${precomputedBytes} bytes`);
    }

    // Create target directory structure
    await mkdir(this.outputDir, { recursive: false });
    const publicOutputDir = path.join(this.outputDir, "public");
    await mkdir(publicOutputDir, { recursive: true });

    const publicFilesMap = {};
    let totalPublicBytes = 0;

    for (const item of fileStats) {
      const destFile = path.join(publicOutputDir, item.relPath);
      await mkdir(path.dirname(destFile), { recursive: true });
      await cp(item.srcFile, destFile);

      const s = await stat(destFile);
      const h = await computeFileHash(destFile);

      publicFilesMap[item.relPath] = {
        size: s.size,
        sha256: h,
      };
      totalPublicBytes += s.size;
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const shortSha = sourceSha.slice(0, 7);
    const releaseId = this.releaseId ?? `rel_fe_${timestamp}_${shortSha}_clean`;

    // Always UNREVIEWED_RELEASE_CANDIDATE
    const classification = "UNREVIEWED_RELEASE_CANDIDATE";

    // Build plain text public manifest
    const publicManifestLines = Object.keys(publicFilesMap)
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((k) => `${publicFilesMap[k].sha256}  public/${k}`);
    const publicManifestText = publicManifestLines.join("\n") + "\n";
    await writeFile(path.join(this.outputDir, "manifest-public.txt"), publicManifestText, "utf8");

    // Write control files
    await writeFile(path.join(this.outputDir, "SOURCE_COMMIT.txt"), `${sourceSha}\n`, "utf8");
    await writeFile(path.join(this.outputDir, "COMPATIBLE_BACKEND_SHA.txt"), `${this.backendSha}\n`, "utf8");
    await writeFile(path.join(this.outputDir, "RELEASE_ID.txt"), `${releaseId}\n`, "utf8");
    await writeFile(path.join(this.outputDir, "STATUS.txt"), `${classification}\n`, "utf8");

    // Generate closed-shape Manifest
    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: releaseId,
      source_sha: sourceSha,
      compatible_backend_sha: this.backendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification,
      summary: {
        public_file_count: fileCount,
        public_bytes: totalPublicBytes,
      },
      public_files: publicFilesMap,
    };

    const manifestPath = path.join(this.outputDir, "release-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    const manifestSha256 = await computeFileHash(manifestPath);

    return {
      outputDir: this.outputDir,
      manifest,
      manifestSha256,
      releaseId,
      sourceSha,
      compatibleBackendSha: this.backendSha,
      publicFileCount: fileCount,
      totalPublicBytes,
    };
  }
}
