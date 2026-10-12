import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { computeFileHash, listDirectoryFiles } from "./ReleaseBuilder.mjs";
import { validateReleaseManifest } from './ReleaseManifest.mjs';
import { assertNoSymlinksInPath } from './SafePath.mjs';
import { normalizeRelativePath } from "./SafePath.mjs";

/**
 * Release verifier engine.
 */
export class ReleaseVerifier {
  constructor(options = {}) {
    this.releaseDir = path.resolve(options.releaseDir);
    this.strict = Boolean(options.strict);
    this.expectedSha = options.expectedSha ?? null;
  }

  async verify() {
    const failures = [];
    try { await assertNoSymlinksInPath(this.releaseDir); } catch { return {success:false,failures:['Symlink package path rejected']}; }
    const check = (condition, message) => {
      if (!condition) failures.push(message);
    };

    const isFile = async (filePath) => {
      return (await stat(filePath).catch(() => null))?.isFile() === true;
    };

    const isDir = async (dirPath) => {
      return (await stat(dirPath).catch(() => null))?.isDirectory() === true;
    };

    // 1. Verify existence of release directory and root control files
    check(await isDir(this.releaseDir), `Release directory does not exist: ${this.releaseDir}`);
    if (failures.length) return { success: false, failures };

    // Defect 5: Closed-shape root directory check: reject unexpected root entries
    const allowedRootEntries = new Set([
      "public",
      "private",
      "installer",
      "release-manifest.json",
      "manifest-public.txt",
      "manifest-private.txt",
      "SOURCE_COMMIT.txt",
      "RELEASE_ID.txt",
      "STATUS.txt",
    ]);

    try {
      const rootEntries = await readdir(this.releaseDir);
      for (const entry of rootEntries) {
        if (!allowedRootEntries.has(entry)) {
          check(false, `Unexpected root entry in release directory: ${entry}`);
        }
      }
    } catch (e) {
      failures.push(`Failed reading release root directory: ${e.message}`);
      return { success: false, failures };
    }

    const requiredControlFiles = [
      "release-manifest.json",
      "manifest-public.txt",
      "manifest-private.txt",
      "SOURCE_COMMIT.txt",
      "RELEASE_ID.txt",
      "STATUS.txt",
    ];
    for (const f of requiredControlFiles) {
      check(await isFile(path.join(this.releaseDir, f)), `Missing control file: ${f}`);
    }

    const publicDir = path.join(this.releaseDir, "public");
    const privateDir = path.join(this.releaseDir, "private");
    const installerDir = path.join(this.releaseDir, "installer");
    check(await isDir(publicDir), "Missing public/ directory in release");
    check(await isDir(privateDir), "Missing private/ directory in release");
    check(await isDir(installerDir), "Missing installer/ directory in release");

    if (failures.length) return { success: false, failures };

    // 2. Read and validate manifest
    let manifest;
    try {
      const raw = await readFile(path.join(this.releaseDir, "release-manifest.json"), "utf8");
      manifest = JSON.parse(raw);
    } catch (e) {
      failures.push(`Failed to parse release-manifest.json: ${e.message}`);
      return { success: false, failures };
    }

    const preflight = validateReleaseManifest(manifest);
    if (!preflight.valid) return {success:false, failures:preflight.errors};

    check(manifest.schema_version === "1.0", `Unexpected manifest schema_version: ${manifest.schema_version}`);
    check(typeof manifest.release_id === "string" && manifest.release_id.length > 0, "Manifest missing release_id");
    check(/^[0-9a-f]{40}$/i.test(manifest.source_sha), `Invalid manifest source_sha: ${manifest.source_sha}`);

    const recordedSourceCommit = (await readFile(path.join(this.releaseDir, "SOURCE_COMMIT.txt"), "utf8")).trim();
    check(recordedSourceCommit === manifest.source_sha, "SOURCE_COMMIT.txt does not match manifest source_sha");

    const recordedReleaseId = (await readFile(path.join(this.releaseDir, "RELEASE_ID.txt"), "utf8")).trim();
    check(recordedReleaseId === manifest.release_id, "RELEASE_ID.txt does not match manifest release_id");

    if (this.expectedSha) {
      check(
        manifest.source_sha.toLowerCase() === this.expectedSha.toLowerCase(),
        `Manifest source SHA ${manifest.source_sha} does not match expected SHA ${this.expectedSha}`
      );
    }

    // Defect 3: Release classification check
    if (this.strict) {
      check(!manifest.is_dirty, "Strict verification failed: release was built from dirty working tree");
      check(
        manifest.classification === "UNREVIEWED_RELEASE_CANDIDATE",
        `Strict verification requires release candidate (UNREVIEWED_RELEASE_CANDIDATE or ACCEPTED_PRODUCTION_CANDIDATE), found: ${manifest.classification}`
      );
    }

    // Defect 5: Verify installer in manifest
    if (manifest.installer && typeof manifest.installer === "object") {
      const installerEntries = Object.entries(manifest.installer);
      check(installerEntries.length > 0, "Manifest installer map cannot be empty");
      for (const [rel, entry] of installerEntries) {
        try {
          normalizeRelativePath(rel);
        } catch (e) {
          failures.push(`Unsafe path in installer manifest (${rel}): ${e.message}`);
          continue;
        }
        const filePath = path.join(this.releaseDir, rel);
        if (!(await isFile(filePath))) {
          failures.push(`Installer file missing on disk: ${rel}`);
          continue;
        }
        const actualSize = (await stat(filePath)).size;
        const actualHash = await computeFileHash(filePath);
        check(actualSize === entry.size, `File size mismatch for ${rel}: expected ${entry.size}, got ${actualSize}`);
        check(actualHash === entry.sha256, `SHA-256 mismatch for ${rel}: expected ${entry.sha256}, got ${actualHash}`);
      }
    } else {
      failures.push("Manifest missing installer entry or not an object");
    }

    // Defect 5: Verify control_files in manifest
    if (manifest.control_files && typeof manifest.control_files === "object") {
      for (const [rel, entry] of Object.entries(manifest.control_files)) {
        try {
          normalizeRelativePath(rel);
        } catch (e) {
          failures.push(`Unsafe path in control_files manifest (${rel}): ${e.message}`);
          continue;
        }
        const filePath = path.join(this.releaseDir, rel);
        if (!(await isFile(filePath))) {
          failures.push(`Control file missing on disk: ${rel}`);
          continue;
        }
        const actualSize = (await stat(filePath)).size;
        const actualHash = await computeFileHash(filePath);
        check(actualSize === entry.size, `File size mismatch for control file ${rel}: expected ${entry.size}, got ${actualSize}`);
        check(actualHash === entry.sha256, `SHA-256 mismatch for control file ${rel}: expected ${entry.sha256}, got ${actualHash}`);
      }
    } else {
      failures.push("Manifest missing control_files entry or not an object");
    }

    const diskInstallers = (await listDirectoryFiles(installerDir)).map(name => 'installer/' + name);
    check(JSON.stringify(diskInstallers.sort()) === JSON.stringify(Object.keys(manifest.installer).sort()), 'Unexpected installer bytes');
    // 3. Verify public files integrity
    let publicFilesOnDisk;
    try {
      publicFilesOnDisk = await listDirectoryFiles(publicDir);
    } catch (e) {
      failures.push(`Failed enumerating public files (symlinks or invalid files): ${e.message}`);
      return { success: false, failures };
    }

    const manifestPublicKeys = Object.keys(manifest.public_files || {}).sort((a, b) => a.localeCompare(b, "en"));

    check(
      JSON.stringify(publicFilesOnDisk) === JSON.stringify(manifestPublicKeys),
      "Public directory contents do not exactly match manifest public_files (closed-world check failed)"
    );

    for (const rel of manifestPublicKeys) {
      try {
        normalizeRelativePath(rel);
      } catch (e) {
        failures.push(`Unsafe path in public manifest (${rel}): ${e.message}`);
        continue;
      }

      const filePath = path.join(publicDir, rel);
      const entry = manifest.public_files[rel];
      if (!(await isFile(filePath))) { failures.push('Missing manifest file'); continue; }
      const actualSize = (await stat(filePath)).size;
      const actualHash = await computeFileHash(filePath);

      check(actualSize === entry.size, `File size mismatch for public/${rel}: expected ${entry.size}, got ${actualSize}`);
      check(actualHash === entry.sha256, `SHA-256 mismatch for public/${rel}: expected ${entry.sha256}, got ${actualHash}`);
    }

    // 4. Verify private files integrity
    let privateFilesOnDisk;
    try {
      privateFilesOnDisk = await listDirectoryFiles(privateDir);
    } catch (e) {
      failures.push(`Failed enumerating private files (symlinks or invalid files): ${e.message}`);
      return { success: false, failures };
    }

    const manifestPrivateKeys = Object.keys(manifest.private_files || {}).sort((a, b) => a.localeCompare(b, "en"));

    check(
      JSON.stringify(privateFilesOnDisk) === JSON.stringify(manifestPrivateKeys),
      "Private directory contents do not exactly match manifest private_files (closed-world check failed)"
    );

    for (const rel of manifestPrivateKeys) {
      try {
        normalizeRelativePath(rel);
      } catch (e) {
        failures.push(`Unsafe path in private manifest (${rel}): ${e.message}`);
        continue;
      }

      const filePath = path.join(privateDir, rel);
      const entry = manifest.private_files[rel];
      if (!(await isFile(filePath))) { failures.push('Missing manifest file'); continue; }
      const actualSize = (await stat(filePath)).size;
      const actualHash = await computeFileHash(filePath);

      check(actualSize === entry.size, `File size mismatch for private/${rel}: expected ${entry.size}, got ${actualSize}`);
      check(actualHash === entry.sha256, `SHA-256 mismatch for private/${rel}: expected ${entry.sha256}, got ${actualHash}`);
    }

    // 5. Strict public vs private separation
    const forbiddenPublicPatterns = [
      /(^|\/)\.env(?:\.|$)/,
      /^app(?:\/|$)/,
      /^bootstrap(?:\/|$)/,
      /^config(?:\/|$)/,
      /^database(?:\/|$)/,
      /^storage(?:\/|$)/,
      /^tests(?:\/|$)/,
      /^vendor(?:\/|$)/,
      /^resources(?:\/|$)/,
      /^docker(?:\/|$)/,
      /(^|\/)artisan$/,
      /(^|\/)composer\.(?:json|lock)$/,
      /(^|\/)\.git(?:\/|$)/,
      /(^|\/)\.cpanel\.ya?ml$/,
      /\.(?:log|sql|sh|md)$/,
    ];

    for (const rel of publicFilesOnDisk) {
      for (const pattern of forbiddenPublicPatterns) {
        if (pattern.test(rel)) {
          failures.push(`Private file found inside public webroot: public/${rel}`);
        }
      }
    }

    // 6. Block development contamination across both public and private
    const devContaminationPatterns = [
      /(^|\/)node_modules(?:\/|$)/,
      /(^|\/)\.playwright-mcp(?:\/|$)/,
      /(^|\/)\.ai(?:\/|$)/,
      /(^|\/)\.claude(?:\/|$)/,
      /(^|\/)\.codex(?:\/|$)/,
      /(^|\/)scratch(?:\/|$)/,
    ];

    for (const rel of publicFilesOnDisk) {
      for (const pattern of devContaminationPatterns) {
        if (pattern.test(rel)) failures.push(`Development contamination in public: public/${rel}`);
      }
    }

    for (const rel of privateFilesOnDisk) {
      for (const pattern of devContaminationPatterns) {
        if (pattern.test(rel)) failures.push(`Development contamination in private: private/${rel}`);
      }
    }

    // 7. Verify essential public static foundation
    const requiredStaticFiles = [
      "index.html",
      ".htaccess",
      "index.php",
      "_shell.html",
      "ar/_shell.html",
      "admin/_shell.html",
      "ar/admin/_shell.html",
      "flights/index.html",
      "ar/flights/index.html",
      "destinations/AMM/index.html",
      "ar/destinations/AMM/index.html",
      "book/index.html",
      "ar/book/index.html",
      "robots.txt",
      "sitemap.xml",
    ];

    for (const req of requiredStaticFiles) {
      check(publicFilesOnDisk.includes(req), `Missing required static file in public: ${req}`);
    }

    // 8. Verify essential private backend foundation & normative manifests
    const requiredPrivateFiles = [
      "artisan",
      "composer.json",
      "composer.lock",
      "bootstrap/app.php",
      "vendor/autoload.php",
      "docs/backend/openapi.v1.json",
      "docs/backend/operation-policies.v1.json",
      "bin/hostpapa-cli",
    ];

    for (const req of requiredPrivateFiles) {
      const present = privateFilesOnDisk.includes(req) || privateFilesOnDisk.includes(`backend/${req}`);
      check(present, `Missing required backend file in private: ${req}`);
    }

    // 9. P2 & Defect 4: Verify ALL locked production packages against installed.json
    let lockPath = path.join(privateDir, "composer.lock");
    let instPath = path.join(privateDir, "vendor", "composer", "installed.json");
    if (!(await isFile(lockPath))) {
      lockPath = path.join(privateDir, "backend", "composer.lock");
      instPath = path.join(privateDir, "backend", "vendor", "composer", "installed.json");
    }

    if ((await isFile(lockPath)) && (await isFile(instPath))) {
      try {
        const lockJson = JSON.parse(await readFile(lockPath, "utf8"));
        const instJson = JSON.parse(await readFile(instPath, "utf8"));
        const instPkgs = Array.isArray(instJson) ? instJson : instJson.packages ?? [];
        const instMap = new Map(instPkgs.map((p) => [p.name, p]));

        // Strictly verify that NO dev packages are present in installed.json
        const devPkgs = lockJson["packages-dev"] || [];
        for (const dp of devPkgs) {
          if (instMap.has(dp.name)) {
            failures.push(`Dev package found in vendor installed.json: ${dp.name}`);
          }
        }

        const lockedProdPkgs = lockJson.packages || [];
        if (instPkgs.length !== lockedProdPkgs.length) failures.push('Unexpected production vendor package count');
        for (const p of lockedProdPkgs) {
          if (!instMap.has(p.name)) {
            failures.push(`Composer package check failed: ${p.name} missing from vendor/composer/installed.json`);
          } else {
            const entry = instMap.get(p.name);
            if (p.dist?.reference !== entry.dist?.reference || p.source?.reference !== entry.source?.reference) failures.push('Composer reference mismatch: ' + p.name);
            if (entry.version !== p.version) {
              failures.push(`Composer package version mismatch: ${p.name} locked=${p.version}, installed=${entry.version}`);
            }
          }
        }
      } catch (e) {
        failures.push(`Failed reading composer metadata: ${e.message}`);
      }
    }

    // 10. Verify bootstrap/cache is completely clean
    const cacheFiles = privateFilesOnDisk.filter((f) =>
      (f.startsWith("bootstrap/cache/") && f !== "bootstrap/cache/.gitignore") ||
      (f.startsWith("backend/bootstrap/cache/") && f !== "backend/bootstrap/cache/.gitignore")
    );
    check(cacheFiles.length === 0, `bootstrap/cache contains cached files: ${cacheFiles.join(", ")}`);

    // 11. Verify .htaccess contains required security and routing rules
    const htaccessPath = path.join(publicDir, ".htaccess");
    if (await isFile(htaccessPath)) {
      const htaccess = await readFile(htaccessPath, "utf8");
      check(htaccess.includes("RewriteEngine On"), ".htaccess missing RewriteEngine On");
      check(htaccess.includes("RewriteCond %{REQUEST_URI} ^/api"), ".htaccess missing API route precedence ahead of SPA");
      check(htaccess.includes("index.php"), ".htaccess missing rewrite target index.php");
      check(htaccess.includes("Options -Indexes"), ".htaccess missing directory index protection");
      check(htaccess.includes("env"), ".htaccess missing dotfile / environment protection");
      check(htaccess.includes("admin/_shell.html"), ".htaccess missing English admin shell fallback");
      check(htaccess.includes("ar/admin/_shell.html"), ".htaccess missing Arabic admin shell fallback");
    }

    // 12. Verify public index.php bridge
    const publicIndexPath = path.join(publicDir, "index.php");
    if (await isFile(publicIndexPath)) {
      const publicIndex = await readFile(publicIndexPath, "utf8");
      check(publicIndex.includes("current-release.txt"), "public/index.php missing current-release pointer lookup");
      check(publicIndex.includes("handleRequest"), "public/index.php missing Laravel handleRequest call");
      check(publicIndex.includes("service_unavailable"), "public/index.php missing canonical 503 response envelope");
      check(publicIndex.includes("requestId"), "public/index.php missing requestId in 503 envelope");
      check(publicIndex.includes("insecure_transport_rejected"), "public/index.php missing HTTPS enforcement rejection");
    }

    return {
      success: failures.length === 0,
      failures,
      summary: {
        releaseId: manifest.release_id,
        sourceSha: manifest.source_sha,
        isDirty: manifest.is_dirty,
        classification: manifest.classification,
        publicFiles: publicFilesOnDisk.length,
        privateFiles: privateFilesOnDisk.length,
      },
    };
  }
}
