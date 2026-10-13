import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { FrontendReleaseBuilder } from "../../tools/hostpapa-release/src/FrontendReleaseBuilder.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchDir = path.join(root, "scratch");

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function toContainerPath(hostPath) {
  const rel = path.relative(root, hostPath).replace(/\\/g, "/");
  return "/app/" + rel;
}

function runPhpInDocker(args, envVars = {}) {
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${root}:/app`,
    "-w",
    "/app",
  ];

  for (const [key, val] of Object.entries(envVars)) {
    dockerArgs.push("-e", `${key}=${val}`);
  }

  dockerArgs.push("php:8.4-cli", "php", ...args);

  const res = spawnSync("docker", dockerArgs, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

// Ensure scratchDir exists
await mkdir(scratchDir, { recursive: true });

const validBackendSha = "a".repeat(40);
const wrongBackendSha = "b".repeat(40);

test("FrontendReleaseBuilder: synthetic builder receipts, closed bounds, and forbidden file exclusions", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-builder-test-"));
  try {
    // 1. Initialize isolated synthetic git repository
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });

    // 2. Ignore client/ and scratch/ in git so working tree remains permanently clean
    await writeFile(path.join(dir, ".gitignore"), "client/\nscratch/\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "initial clean"], { cwd: dir });

    const exactCleanSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim().toLowerCase();

    await mkdir(path.join(dir, "scratch"), { recursive: true });
    const clientDist = path.join(dir, "client");
    await mkdir(path.join(clientDist, "assets"), { recursive: true });

    const htmlContent = "<!DOCTYPE html>";
    const jsContent = "console.log('app');";
    await writeFile(path.join(clientDist, "index.html"), htmlContent);
    await writeFile(path.join(clientDist, "assets/app.js"), jsContent);
    await writeFile(path.join(clientDist, "assets/reset-password-test.js"), jsContent);

    // Place forbidden files in clientDist to verify builder excludes them
    await writeFile(path.join(clientDist, "index.php"), "<?php echo 'forbidden';");
    await writeFile(path.join(clientDist, ".htaccess"), "Deny from all");
    await writeFile(path.join(clientDist, ".env"), "APP_SECRET=leak");

    // Inventory ALL files in clientDist (including forbidden assets)
    const hashes = {
      "index.html": hash(htmlContent),
      "assets/app.js": hash(jsContent),
      "assets/reset-password-test.js": hash(jsContent),
      "index.php": hash("<?php echo 'forbidden';"),
      ".htaccess": hash("Deny from all"),
      ".env": hash("APP_SECRET=leak"),
    };

    const receipt = {
      schema_version: 1,
      source_sha: exactCleanSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: hashes,
    };
    await writeFile(path.join(clientDist, "build-receipt.json"), JSON.stringify(receipt, null, 2));

    // Build package with maximum 128 char releaseId
    const maxSuffix = "a".repeat(121);
    const maxReleaseId = "rel_fe_" + maxSuffix; // 7 + 121 = 128 characters
    const outRel = "scratch/output-pkg";
    const builder = new FrontendReleaseBuilder({
      root: dir,
      clientDist,
      outputDir: outRel,
      backendSha: validBackendSha,
      releaseId: maxReleaseId,
    });

    const res = await builder.build();
    assert.equal(res.manifest.schema_version, "1.0");
    assert.equal(res.manifest.mode, "frontend-only");
    assert.equal(res.manifest.classification, "UNREVIEWED_RELEASE_CANDIDATE");
    assert.equal(res.manifest.source_sha, exactCleanSha);
    assert.equal(res.manifest.compatible_backend_sha, validBackendSha);
    assert.equal(res.manifest.release_id, maxReleaseId);

    // Verify forbidden files were NOT copied into public/
    assert.equal(res.manifest.public_files["index.php"], undefined);
    assert.equal(res.manifest.public_files[".htaccess"], undefined);
    assert.equal(res.manifest.public_files[".env"], undefined);
    assert.ok(res.manifest.public_files["assets/reset-password-test.js"], 'Legitimate recovery route chunks must be preserved');

    // Verify builder refuses preexisting output directory
    const builder2 = new FrontendReleaseBuilder({
      root: dir,
      clientDist,
      outputDir: outRel,
      backendSha: validBackendSha,
    });
    await assert.rejects(builder2.build(), /already exists; refusing preexisting output/);

    // Verify builder rejects releaseId exceeding 128 chars
    assert.throws(
      () =>
        new FrontendReleaseBuilder({
          root: dir,
          clientDist,
          outputDir: "scratch/out2",
          backendSha: validBackendSha,
          releaseId: "rel_fe_" + "a".repeat(122), // 129 chars
        }),
      /Invalid releaseId format/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: wrong backend pin refuses with 0 web writes", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-wrongbackend-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_active"), { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(path.join(pkgDir, "public"), { recursive: true });

    await writeFile(path.join(appDir, "current-release.txt"), "rel_active\n");
    await writeFile(path.join(appDir, "releases/rel_active/SOURCE_COMMIT.txt"), wrongBackendSha + "\n");

    await writeFile(path.join(webDir, "index.php"), "<?php echo 'ROUTER';");
    await writeFile(path.join(webDir, ".htaccess"), "RewriteEngine On\n");
    await writeFile(path.join(webDir, "existing.js"), "const initial = 1;");

    const htmlContent = "<!DOCTYPE html>";
    const receipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: { "index.html": hash(htmlContent) },
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), receiptJson);
    await writeFile(path.join(pkgDir, "public/index.html"), htmlContent);
    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");

    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_01",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 2,
        public_bytes: Buffer.byteLength(htmlContent) + Buffer.byteLength(receiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(receiptJson), sha256: hash(receiptJson) },
        "index.html": { size: Buffer.byteLength(htmlContent), sha256: hash(htmlContent) },
      },
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJson);
    const manifestSha = hash(manifestJson);

    const approval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: manifestSha,
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile = path.join(homeDir, "approval.json");
    await writeFile(approvalFile, JSON.stringify(approval, null, 2));

    const res = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(res.status, 1);
    assert.match(res.stderr, /Installed backend SHA does not match required compatible backend SHA/);

    // Verify 0 web writes
    assert.equal(await readFile(path.join(webDir, "existing.js"), "utf8"), "const initial = 1;");
    const newFileExists = await stat(path.join(webDir, "index.html")).catch(() => null);
    assert.equal(newFileExists, null, "Target file should not be created when backend pin fails");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: invalid profile / missing build receipt rejection", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-invalidprofile-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_active"), { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(path.join(pkgDir, "public"), { recursive: true });

    await writeFile(path.join(appDir, "current-release.txt"), "rel_active\n");
    await writeFile(path.join(appDir, "releases/rel_active/SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(webDir, "index.php"), "<?php echo 'ROUTER';");
    await writeFile(path.join(webDir, ".htaccess"), "RewriteEngine On\n");

    const htmlContent = "<!DOCTYPE html>";

    // Case 1: Package without build-receipt.json
    await writeFile(path.join(pkgDir, "public/index.html"), htmlContent);
    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");

    const manifestMissing = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_02",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: { public_file_count: 1, public_bytes: Buffer.byteLength(htmlContent) },
      public_files: {
        "index.html": { size: Buffer.byteLength(htmlContent), sha256: hash(htmlContent) },
      },
    };
    const manifestJsonMissing = JSON.stringify(manifestMissing, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJsonMissing);

    const approval1 = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: hash(manifestJsonMissing),
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile1 = path.join(homeDir, "approval1.json");
    await writeFile(approvalFile1, JSON.stringify(approval1, null, 2));

    const res1 = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile1)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(res1.status, 1);
    assert.match(res1.stderr, /Package public_files must contain build-receipt\.json/);

    // Case 2: Package with staging profile receipt when approval is production
    const stagingReceipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://staging.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "staging",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://staging.gazaairport.com/api/v1",
      },
      artifact_hashes: { "index.html": hash(htmlContent) },
    };
    const stagingReceiptJson = JSON.stringify(stagingReceipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), stagingReceiptJson);

    const manifestMismatch = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_02b",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 2,
        public_bytes: Buffer.byteLength(htmlContent) + Buffer.byteLength(stagingReceiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(stagingReceiptJson), sha256: hash(stagingReceiptJson) },
        "index.html": { size: Buffer.byteLength(htmlContent), sha256: hash(htmlContent) },
      },
    };
    const manifestJsonMismatch = JSON.stringify(manifestMismatch, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJsonMismatch);

    const approval2 = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: hash(manifestJsonMismatch),
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production", // Mismatched with staging receipt!
    };
    const approvalFile2 = path.join(homeDir, "approval2.json");
    await writeFile(approvalFile2, JSON.stringify(approval2, null, 2));

    const res2 = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile2)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(res2.status, 1);
    assert.match(res2.stderr, /Build receipt profile does not match approved environment/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: symlink in lock path refusal", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-symlinklock-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_active"), { recursive: true });
    await mkdir(path.join(appDir, "shared"), { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(path.join(pkgDir, "public"), { recursive: true });

    await writeFile(path.join(appDir, "current-release.txt"), "rel_active\n");
    await writeFile(path.join(appDir, "releases/rel_active/SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(webDir, "index.php"), "<?php echo 'ROUTER';");
    await writeFile(path.join(webDir, ".htaccess"), "RewriteEngine On\n");

    const outsideTarget = path.join(homeDir, "dummy-lock-target.txt");
    await writeFile(outsideTarget, "dummy");

    // Create symlink reliably in Linux container
    spawnSync("docker", [
      "run",
      "--rm",
      "-v",
      `${root}:/app`,
      "php:8.4-cli",
      "ln",
      "-s",
      toContainerPath(outsideTarget),
      toContainerPath(path.join(appDir, "shared/installer.lock")),
    ]);

    const htmlContent = "<!DOCTYPE html>";
    const receipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: { "index.html": hash(htmlContent) },
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), receiptJson);
    await writeFile(path.join(pkgDir, "public/index.html"), htmlContent);
    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");

    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_03",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 2,
        public_bytes: Buffer.byteLength(htmlContent) + Buffer.byteLength(receiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(receiptJson), sha256: hash(receiptJson) },
        "index.html": { size: Buffer.byteLength(htmlContent), sha256: hash(htmlContent) },
      },
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJson);

    const approval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: hash(manifestJson),
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile = path.join(homeDir, "approval.json");
    await writeFile(approvalFile, JSON.stringify(approval, null, 2));

    const res = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(res.status, 1);
    assert.match(res.stderr, /Symbolic link detected in path/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: corrupted package hash rejection before any writes", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-corrupthash-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_active"), { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(path.join(pkgDir, "public"), { recursive: true });

    await writeFile(path.join(appDir, "current-release.txt"), "rel_active\n");
    await writeFile(path.join(appDir, "releases/rel_active/SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(webDir, "index.php"), "<?php echo 'ROUTER';");
    await writeFile(path.join(webDir, ".htaccess"), "RewriteEngine On\n");

    const htmlContent = "<!DOCTYPE html>";
    const receipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: { "index.html": hash(htmlContent) },
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), receiptJson);

    // Write tampered file content
    await writeFile(path.join(pkgDir, "public/index.html"), "<!DOCTYPE html> TAMPERED");
    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");

    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_04",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 2,
        public_bytes: Buffer.byteLength(htmlContent) + Buffer.byteLength(receiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(receiptJson), sha256: hash(receiptJson) },
        "index.html": { size: Buffer.byteLength(htmlContent), sha256: hash(htmlContent) },
      },
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJson);

    const approval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: hash(manifestJson),
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile = path.join(homeDir, "approval.json");
    await writeFile(approvalFile, JSON.stringify(approval, null, 2));

    const res = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(res.status, 1);
    assert.match(res.stderr, /Package file (?:size|checksum) mismatch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: real local deploy + rollback with owner upload preserved AND mid-mutation failure rollback", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-deploy-rollback-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_live"), { recursive: true });
    await mkdir(path.join(webDir, "uploads"), { recursive: true });
    await mkdir(path.join(pkgDir, "public/assets"), { recursive: true });

    // 1. Setup backend pin & pointer
    await writeFile(path.join(appDir, "current-release.txt"), "rel_live\n");
    await writeFile(path.join(appDir, "releases/rel_live/SOURCE_COMMIT.txt"), validBackendSha + "\n");

    // 2. Setup protected router files & unrelated owner upload & prior version of index.html
    const routerPhp = "<?php echo 'LIVE LARAVEL API ROUTER';";
    const htaccess = "RewriteEngine On\nRewriteRule ^api - [L]\n";
    const ownerUpload = "OWNER_UNTOUCHED_IMAGE_BINARY_DATA";
    const originalIndex = "<!DOCTYPE html><html><body>Original V1</body></html>";

    await writeFile(path.join(webDir, "index.php"), routerPhp);
    await writeFile(path.join(webDir, ".htaccess"), htaccess);
    await writeFile(path.join(webDir, "uploads/owner-photo.jpg"), ownerUpload);
    await writeFile(path.join(webDir, "index.html"), originalIndex);

    // 3. Package to deploy (v2)
    const newIndex = "<!DOCTYPE html><html><body>Deployed V2</body></html>";
    const newAppJs = "console.log('v2 deployed');";

    await writeFile(path.join(pkgDir, "public/index.html"), newIndex);
    await writeFile(path.join(pkgDir, "public/assets/app.js"), newAppJs);

    const receipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: {
        "index.html": hash(newIndex),
        "assets/app.js": hash(newAppJs),
      },
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), receiptJson);

    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "RELEASE_ID.txt"), "rel_fe_v2_deploy\n");
    await writeFile(path.join(pkgDir, "STATUS.txt"), "UNREVIEWED_RELEASE_CANDIDATE\n");

    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_v2_deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 3,
        public_bytes: Buffer.byteLength(newIndex) + Buffer.byteLength(newAppJs) + Buffer.byteLength(receiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(receiptJson), sha256: hash(receiptJson) },
        "index.html": { size: Buffer.byteLength(newIndex), sha256: hash(newIndex) },
        "assets/app.js": { size: Buffer.byteLength(newAppJs), sha256: hash(newAppJs) },
      },
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJson);
    const manifestSha = hash(manifestJson);

    const approval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: manifestSha,
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile = path.join(homeDir, "approval.json");
    await writeFile(approvalFile, JSON.stringify(approval, null, 2));

    // Execute deploy
    const deployRes = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(deployRes.status, 0, `Deploy failed: ${deployRes.stderr}`);
    assert.match(deployRes.stdout, /PASS: frontend-only release deployed successfully/);

    // Verify files deployed
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), newIndex);
    assert.equal(await readFile(path.join(webDir, "assets/app.js"), "utf8"), newAppJs);

    // Verify router and owner upload remain identical
    assert.equal(await readFile(path.join(webDir, "index.php"), "utf8"), routerPhp);
    assert.equal(await readFile(path.join(webDir, ".htaccess"), "utf8"), htaccess);
    assert.equal(await readFile(path.join(webDir, "uploads/owner-photo.jpg"), "utf8"), ownerUpload);

    // Verify pointer was NOT changed
    assert.equal(await readFile(path.join(appDir, "current-release.txt"), "utf8"), "rel_live\n");

    // Locate the backup directory created by deploy
    const backupsRoot = path.join(appDir, "shared/backups");
    const backupDirs = await readdir(backupsRoot);
    const feBackupDir = backupDirs.find((d) => d.startsWith("frontend_" + validBackendSha));
    assert.ok(feBackupDir, "Backup directory must be created");

    const ledgerPath = path.join(backupsRoot, feBackupDir, "ledger.json");
    assert.ok(await stat(ledgerPath), "ledger.json must exist in backup");

    // Verify retained manifest exists in backup
    const retainedManifestPath = path.join(backupsRoot, feBackupDir, "release-manifest.json");
    assert.ok(await stat(retainedManifestPath), "retained release-manifest.json must exist in backup");

    // Execute Rollback Action
    const rollbackApproval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "rollback",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: manifestSha,
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const rollbackApprovalFile = path.join(homeDir, "rollback-approval.json");
    await writeFile(rollbackApprovalFile, JSON.stringify(rollbackApproval, null, 2));

    const rollbackRes = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--approval-file=${toContainerPath(rollbackApprovalFile)}`,
        `--ledger-file=${toContainerPath(ledgerPath)}`,
        "--action=rollback",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(rollbackRes.status, 0, `Rollback failed: ${rollbackRes.stderr}`);
    assert.match(rollbackRes.stdout, /PASS: frontend-only release rolled back successfully from ledger/);

    // Verify rollback restored index.html to Original V1
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), originalIndex);

    // Verify newly deployed file was removed on rollback
    const appJsExists = await stat(path.join(webDir, "assets/app.js")).catch(() => null);
    assert.equal(appJsExists, null, "Added assets/app.js should be removed on rollback");

    // Verify owner upload still completely intact
    assert.equal(await readFile(path.join(webDir, "uploads/owner-photo.jpg"), "utf8"), ownerUpload);

    // Verify router and pointer still intact
    assert.equal(await readFile(path.join(webDir, "index.php"), "utf8"), routerPhp);
    assert.equal(await readFile(path.join(webDir, ".htaccess"), "utf8"), htaccess);
    assert.equal(await readFile(path.join(appDir, "current-release.txt"), "utf8"), "rel_live\n");

    // Mid-mutation failure rollback:
    // Package wants to deploy updated index.html, but assets/app.js source file is tampered right before copy
    await writeFile(path.join(pkgDir, "public/assets/app.js"), "TAMPERED_BEFORE_COPY");
    const midFailRes = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );

    assert.equal(midFailRes.status, 1);
    assert.match(midFailRes.stderr, /Package file (?:size|checksum) mismatch/);

    // Verify webroot remains at Original V1 with 0 partial writes
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), originalIndex);
    assert.equal(await readFile(path.join(webDir, "uploads/owner-photo.jpg"), "utf8"), ownerUpload);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deployer: tampered ledger traversal, router tampering, late backup corruption, and changed frontend refuse with 0 web writes", async () => {
  const dir = await mkdtemp(path.join(scratchDir, "fe-tampered-ledger-test-"));
  try {
    const homeDir = path.join(dir, "home");
    const appDir = path.join(homeDir, "app");
    const webDir = path.join(homeDir, "public_html");
    const pkgDir = path.join(homeDir, "package");

    await mkdir(path.join(appDir, "releases/rel_live"), { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(path.join(pkgDir, "public"), { recursive: true });

    await writeFile(path.join(appDir, "current-release.txt"), "rel_live\n");
    await writeFile(path.join(appDir, "releases/rel_live/SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(webDir, "index.php"), "<?php echo 'ROUTER';");
    await writeFile(path.join(webDir, ".htaccess"), "RewriteEngine On\n");
    await writeFile(path.join(webDir, "index.html"), "<!DOCTYPE html> V1");

    const newIndex = "<!DOCTYPE html> V2";
    await writeFile(path.join(pkgDir, "public/index.html"), newIndex);

    const receipt = {
      schema_version: 1,
      source_sha: validBackendSha,
      origin: "https://www.gazaairport.com",
      flags: {
        HOSTPAPA_SHARED_ENABLED: true,
        VITE_HOSTPAPA_PROFILE: "production",
        VITE_IDENTITY_UI_MODE: "backend",
        VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
        VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      },
      artifact_hashes: { "index.html": hash(newIndex) },
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    await writeFile(path.join(pkgDir, "public/build-receipt.json"), receiptJson);
    await writeFile(path.join(pkgDir, "SOURCE_COMMIT.txt"), validBackendSha + "\n");
    await writeFile(path.join(pkgDir, "COMPATIBLE_BACKEND_SHA.txt"), validBackendSha + "\n");

    const manifest = {
      schema_version: "1.0",
      mode: "frontend-only",
      release_id: "rel_fe_test_05",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      built_at: new Date().toISOString(),
      is_dirty: false,
      classification: "UNREVIEWED_RELEASE_CANDIDATE",
      summary: {
        public_file_count: 2,
        public_bytes: Buffer.byteLength(newIndex) + Buffer.byteLength(receiptJson),
      },
      public_files: {
        "build-receipt.json": { size: Buffer.byteLength(receiptJson), sha256: hash(receiptJson) },
        "index.html": { size: Buffer.byteLength(newIndex), sha256: hash(newIndex) },
      },
    };
    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(path.join(pkgDir, "release-manifest.json"), manifestJson);
    const manifestSha = hash(manifestJson);

    const approval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "deploy",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: manifestSha,
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const approvalFile = path.join(homeDir, "approval.json");
    await writeFile(approvalFile, JSON.stringify(approval, null, 2));

    // 1. Initial valid deploy
    const deployRes = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--package-dir=${toContainerPath(pkgDir)}`,
        `--approval-file=${toContainerPath(approvalFile)}`,
        "--action=deploy",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(deployRes.status, 0);

    const backupsRoot = path.join(appDir, "shared/backups");
    const backupDirs = await readdir(backupsRoot);
    const feBackupDir = backupDirs.find((d) => d.startsWith("frontend_" + validBackendSha));
    const ledgerPath = path.join(backupsRoot, feBackupDir, "ledger.json");
    const originalLedgerJson = await readFile(ledgerPath, "utf8");

    const rollbackApproval = {
      schema_version: "1.0",
      mode: "frontend-only",
      action: "rollback",
      source_sha: validBackendSha,
      compatible_backend_sha: validBackendSha,
      manifest_sha256: manifestSha,
      target_webroot: toContainerPath(webDir),
      app_dir: toContainerPath(appDir),
      environment: "production",
    };
    const rollbackApprovalFile = path.join(homeDir, "rollback-approval.json");
    await writeFile(rollbackApprovalFile, JSON.stringify(rollbackApproval, null, 2));

    // Test A: Tampered ledger with path traversal
    const traversalLedger = JSON.parse(originalLedgerJson);
    traversalLedger.files["../private/secret.txt"] = { existed: false };
    await writeFile(ledgerPath, JSON.stringify(traversalLedger, null, 2));

    const resA = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--approval-file=${toContainerPath(rollbackApprovalFile)}`,
        `--ledger-file=${toContainerPath(ledgerPath)}`,
        "--action=rollback",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(resA.status, 1);
    assert.match(resA.stderr, /Ledger file map keys do not match retained manifest|Non-canonical or unsafe relative path/);
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), newIndex); // 0 web writes

    // Test B: Tampered ledger attempting router overwrite
    const routerLedger = JSON.parse(originalLedgerJson);
    routerLedger.files["index.php"] = { existed: true, sha256: "0".repeat(64), size: 10 };
    await writeFile(ledgerPath, JSON.stringify(routerLedger, null, 2));

    const resB = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--approval-file=${toContainerPath(rollbackApprovalFile)}`,
        `--ledger-file=${toContainerPath(ledgerPath)}`,
        "--action=rollback",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(resB.status, 1);
    assert.match(resB.stderr, /Forbidden router file|Ledger file map keys do not match/);
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), newIndex); // 0 web writes

    // Test C: Late backup file corruption
    await writeFile(ledgerPath, originalLedgerJson); // restore original ledger
    const backupFile = path.join(backupsRoot, feBackupDir, "files/index.html");
    const originalBackup = await readFile(backupFile);
    if (await stat(backupFile).catch(() => null)) {
      await writeFile(backupFile, "CORRUPTED_BACKUP_CONTENT");
      const resC = runPhpInDocker(
        [
          toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
          `--approval-file=${toContainerPath(rollbackApprovalFile)}`,
          `--ledger-file=${toContainerPath(ledgerPath)}`,
          "--action=rollback",
        ],
        {
          HOSTPAPA_HOME: toContainerPath(homeDir),
          HOME: toContainerPath(homeDir),
        }
      );
      assert.equal(resC.status, 1);
      assert.match(resC.stderr, /Backup file corrupted/);
      assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), newIndex); // 0 web writes
      await writeFile(backupFile, originalBackup);
    }

    // Test D: Changed frontend in webroot (refuse rollback when frontend was modified post-deploy)
    await writeFile(path.join(webDir, "index.html"), "<!DOCTYPE html> NEWER_THIRD_PARTY_EDIT");
    const resD = runPhpInDocker(
      [
        toContainerPath(path.join(root, "tools/hostpapa-release/frontend-deploy.php")),
        `--approval-file=${toContainerPath(rollbackApprovalFile)}`,
        `--ledger-file=${toContainerPath(ledgerPath)}`,
        "--action=rollback",
      ],
      {
        HOSTPAPA_HOME: toContainerPath(homeDir),
        HOME: toContainerPath(homeDir),
      }
    );
    assert.equal(resD.status, 1);
    assert.match(resD.stderr, /Current deployed target file was edited or does not match approved manifest/);
    assert.equal(await readFile(path.join(webDir, "index.html"), "utf8"), "<!DOCTYPE html> NEWER_THIRD_PARTY_EDIT"); // 0 web writes
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
