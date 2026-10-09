import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROBES } from "./capture-probes-matrix.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const validatorScript = path.join(__dirname, "validate-http-captures.mjs");
const openapiPath = path.join(rootDir, "docs/backend/openapi.v1.json");

console.log("=== Testing Capture Gate CLI Subprocess Exits ===");

const fixtureBaseDir = path.join(rootDir, "scratch/subprocess-fixtures");
if (fs.existsSync(fixtureBaseDir)) {
  fs.rmSync(fixtureBaseDir, { recursive: true, force: true });
}
fs.mkdirSync(fixtureBaseDir, { recursive: true });

function computeSha(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const testRequestId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const defaultRunId = "run_0b1e5668a9b244e888de59f177367cf0";

/**
 * Creates a complete, fully valid 16-probe base fixture in the target directory.
 * Returns the manifest object and written files map.
 */
function createBaseValidFixture(targetDir, runId = defaultRunId) {
  const generatedAt = new Date(Date.now() - 2000).toISOString();
  const captureTimestamp = new Date(Date.now() - 1000).toISOString();
  const manifest = {
    runId,
    generatedAt,
    host: "127.0.0.1:18084",
    captures: [],
  };

  const files = {};

  for (const probe of REQUIRED_PROBES) {
    let rawText = "";

    if (probe.expectedStatus === 204) {
      rawText =
        `HTTP/1.1 204 No Content\n` +
        `Host: 127.0.0.1:18084\n` +
        `Connection: close\n` +
        `Cache-Control: no-store\n` +
        `X-Request-Id: ${testRequestId}\n` +
        `X-Content-Type-Options: nosniff\n` +
        `X-Frame-Options: DENY\n` +
        `Referrer-Policy: strict-origin-when-cross-origin\n\n`;
    } else {
      let bodyObj = null;
      if (probe.expectedStatus === 200) {
        if (probe.operationPath === "/version") {
          bodyObj = {
            success: true,
            data: { version: "1.0.0-foundation", commit: "unreleased-local", schemaVersion: 1 },
            meta: { requestId: testRequestId, timestamp: "2026-10-09T18:00:00Z" },
          };
        } else if (probe.operationPath === "/health/ready") {
          bodyObj = {
            success: true,
            data: { database: "connected", migrations: "up_to_date", queue: "healthy" },
            meta: { requestId: testRequestId, timestamp: "2026-10-09T18:00:00Z" },
          };
        } else {
          bodyObj = {
            success: true,
            data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" },
            meta: { requestId: testRequestId, timestamp: "2026-10-09T18:00:00Z" },
          };
        }
      } else {
        bodyObj = {
          success: false,
          error: {
            code: probe.expectedStatus === 404 ? "not_found" : probe.expectedStatus === 429 ? "too_many_requests" : "service_error",
            message: "Bounded test error message",
          },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T18:00:00Z" },
        };
      }

      const bodyStr = JSON.stringify(bodyObj);
      const statusTitle =
        probe.expectedStatus === 200 ? "OK" :
        probe.expectedStatus === 400 ? "Bad Request" :
        probe.expectedStatus === 403 ? "Forbidden" :
        probe.expectedStatus === 404 ? "Not Found" :
        probe.expectedStatus === 405 ? "Method Not Allowed" :
        probe.expectedStatus === 429 ? "Too Many Requests" :
        "Service Unavailable";

      let headerLines =
        `HTTP/1.1 ${probe.expectedStatus} ${statusTitle}\n` +
        `Host: 127.0.0.1:18084\n` +
        `Connection: close\n` +
        `Content-Type: application/json\n` +
        `Cache-Control: no-store\n` +
        `X-Request-Id: ${testRequestId}\n` +
        `X-Content-Type-Options: nosniff\n` +
        `X-Frame-Options: DENY\n` +
        `Referrer-Policy: strict-origin-when-cross-origin\n`;

      if (probe.expectedStatus === 429) {
        headerLines += `Retry-After: 60\n`;
      }

      rawText = `${headerLines}\n${bodyStr}\n`;
    }

    const filePath = path.join(targetDir, probe.file);
    fs.writeFileSync(filePath, rawText, "utf8");
    files[probe.file] = rawText;

    manifest.captures.push({
      name: probe.name,
      file: probe.file,
      requestMethod: probe.requestMethod,
      requestPath: probe.requestPath,
      operationPath: probe.operationPath,
      expectedStatus: probe.expectedStatus,
      actualStatus: probe.expectedStatus,
      classification: probe.classification,
      captureTimestamp,
      sha256: computeSha(rawText),
      fresh: true,
    });
  }

  const manifestPath = path.join(targetDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { manifest, manifestPath, files };
}

const cases = [
  // --- PROTOCOL & RAW BODY REJECTIONS ---
  {
    name: "Subprocess Reject: Whitespace-only 204 raw body",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const file204 = path.join(dir, "09_cors_preflight_allowed_204.txt");
      const corrupted = fs.readFileSync(file204, "utf8") + "   ";
      fs.writeFileSync(file204, corrupted, "utf8");
      manifest.captures.find((c) => c.name === "09_cors_preflight_allowed_204").sha256 = computeSha(corrupted);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Non-empty 204 with body {}",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const file204 = path.join(dir, "09_cors_preflight_allowed_204.txt");
      const corrupted = fs.readFileSync(file204, "utf8") + "{}";
      fs.writeFileSync(file204, corrupted, "utf8");
      manifest.captures.find((c) => c.name === "09_cors_preflight_allowed_204").sha256 = computeSha(corrupted);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Unknown operation BANANA /unknown-codex-operation",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const item = manifest.captures.find((c) => c.name === "01_health_liveness_200");
      item.requestMethod = "BANANA";
      item.operationPath = "/unknown-codex-operation";
      item.requestPath = "/api/v1/unknown-codex-operation";
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Undeclared 204 status on GET /health",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const item = manifest.captures.find((c) => c.name === "01_health_liveness_200");
      item.expectedStatus = 204;
      item.actualStatus = 204;
      const file = path.join(dir, item.file);
      const raw204 =
        `HTTP/1.1 204 No Content\nHost: 127.0.0.1:18084\nConnection: close\nCache-Control: no-store\nX-Request-Id: ${testRequestId}\nX-Content-Type-Options: nosniff\nX-Frame-Options: DENY\nReferrer-Policy: strict-origin-when-cross-origin\n\n`;
      fs.writeFileSync(file, raw204, "utf8");
      item.sha256 = computeSha(raw204);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Wrong media type application/jsonp",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const item = manifest.captures.find((c) => c.name === "01_health_liveness_200");
      const file = path.join(dir, item.file);
      const content = fs.readFileSync(file, "utf8").replace("Content-Type: application/json", "Content-Type: application/jsonp");
      fs.writeFileSync(file, content, "utf8");
      item.sha256 = computeSha(content);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing meta in payload",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const item = manifest.captures.find((c) => c.name === "01_health_liveness_200");
      const file = path.join(dir, item.file);
      const lines = fs.readFileSync(file, "utf8").split("\n\n");
      const body = { success: true, data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" } };
      const content = `${lines[0]}\n\n${JSON.stringify(body)}\n`;
      fs.writeFileSync(file, content, "utf8");
      item.sha256 = computeSha(content);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Header / meta requestId mismatch",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      const item = manifest.captures.find((c) => c.name === "01_health_liveness_200");
      const file = path.join(dir, item.file);
      const lines = fs.readFileSync(file, "utf8").split("\n\n");
      const body = {
        success: true,
        data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" },
        meta: { requestId: "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee", timestamp: "2026-10-09T18:00:00Z" },
      };
      const content = `${lines[0]}\n\n${JSON.stringify(body)}\n`;
      fs.writeFileSync(file, content, "utf8");
      item.sha256 = computeSha(content);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing manifest file",
    setup: (dir) => {
      createBaseValidFixture(dir);
      fs.rmSync(path.join(dir, "manifest.json"));
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing capture file listed in manifest",
    setup: (dir) => {
      createBaseValidFixture(dir);
      fs.rmSync(path.join(dir, "01_health_liveness_200.txt"));
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Corrupted capture SHA-256 hash",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0].sha256 = "0000000000000000000000000000000000000000000000000000000000000000";
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Stale run identity (--run-id mismatch)",
    setup: (dir) => {
      createBaseValidFixture(dir, "run_old_stale_identity");
    },
    expectedExit: 1,
  },

  // --- REVIEWER-REQUIRED ISOLATED MATRIX REJECTIONS ---
  {
    name: "Subprocess Reject: Duplicate item in manifest",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures.push(structuredClone(manifest.captures[0]));
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Null item in manifest captures array",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0] = null;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing freshness (fresh === false)",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0].fresh = false;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing or invalid capture timestamp",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      delete manifest.captures[0].captureTimestamp;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Missing hash property (sha256 missing)",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      delete manifest.captures[0].sha256;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Wrong actualStatus (actualStatus mismatch)",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0].actualStatus = 500;
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Wrong wire path (contradictory wire path)",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0].requestPath = "/api/v1/unexpected_path";
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Wrong classification",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures[0].classification = "unauthorized_bogus_classification";
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },
  {
    name: "Subprocess Reject: Partial matrix (incomplete captures set)",
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      manifest.captures = manifest.captures.slice(0, 15);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
    expectedExit: 1,
  },

  // --- POSITIVE CONTROLS ---
  {
    name: "Subprocess Accept: Valid full-matrix positive control",
    setup: (dir) => {
      createBaseValidFixture(dir);
    },
    expectedExit: 0,
  },
  {
    name: "Subprocess Accept: Valid reusable response container ($ref in responses)",
    setup: (dir) => {
      createBaseValidFixture(dir);
      const rawSpec = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
      const customSpec = structuredClone(rawSpec);
      customSpec.components.responses ??= {};
      customSpec.components.responses.CodexReusableHealth = customSpec.paths["/health"].get.responses["200"];
      customSpec.paths["/health"].get.responses["200"] = { $ref: "#/components/responses/CodexReusableHealth" };
      fs.writeFileSync(path.join(dir, "custom_spec.json"), JSON.stringify(customSpec, null, 2), "utf8");
    },
    extraCliArgs: (dir) => ["--spec", path.join(dir, "custom_spec.json")],
    expectedExit: 0,
  },
];

for (const [name, mutate] of [
  ["Non-string hash", (manifest) => { manifest.captures[0].sha256 = {}; }],
  ["Non-string filename", (manifest) => { manifest.captures[0].file = {}; }],
  ["Future generated timestamp", (manifest) => { manifest.generatedAt = new Date(Date.now() + 86400000).toISOString(); }],
  ["Capture predates generation", (manifest) => { manifest.captures[0].captureTimestamp = new Date(Date.parse(manifest.generatedAt) - 1000).toISOString(); }],
  ["Invalid calendar timestamp", (manifest) => { manifest.captures[0].captureTimestamp = "2026-02-30T12:00:00.000Z"; }],
  ["Missing freshness property", (manifest) => { delete manifest.captures[0].fresh; }],
]) {
  cases.push({
    name: `Subprocess Reject: ${name}`,
    setup: (dir) => {
      const { manifest } = createBaseValidFixture(dir);
      mutate(manifest);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");
    },
    expectedExit: 1,
  });
}
cases.push({
  name: "Subprocess Reject: Unknown CLI option",
  setup: createBaseValidFixture,
  extraCliArgs: () => ["--allow-partial"],
  expectedExit: 1,
});

let passed = 0;
let failed = 0;

for (let idx = 0; idx < cases.length; idx++) {
  const tc = cases[idx];
  const caseDir = path.join(fixtureBaseDir, `case_${idx}`);
  fs.mkdirSync(caseDir, { recursive: true });

  tc.setup(caseDir);

  const manifestPath = path.join(caseDir, "manifest.json");
  const extraArgs = tc.extraCliArgs ? tc.extraCliArgs(caseDir) : [];

  const args = [
    "--captures-dir", caseDir,
    "--manifest", manifestPath,
    "--run-id", defaultRunId,
    ...extraArgs,
  ];

  const child = spawnSync(process.execPath, [validatorScript, ...args], {
    encoding: "utf8",
  });

  if (child.status === tc.expectedExit) {
    console.log(`  ✓ Subprocess exited with expected code ${tc.expectedExit}: [${tc.name}]`);
    passed++;
  } else {
    console.error(`  ✗ Subprocess failed! Expected exit ${tc.expectedExit}, got ${child.status} for [${tc.name}]`);
    if (child.stderr) console.error("    stderr:", child.stderr.trim());
    if (child.stdout) console.error("    stdout:", child.stdout.trim());
    failed++;
  }
}

// Cleanup isolated fixture dir
try {
  fs.rmSync(fixtureBaseDir, { recursive: true, force: true });
} catch {}

console.log(`\nSubprocess Tests Result: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
console.log("ALL SUBPROCESS TESTS PASSED.");
