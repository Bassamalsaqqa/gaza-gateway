import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  validateCapture,
} from "./validate-http-captures.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

// Parse CLI arguments
let cliRunId = null;
let cliBaseUrl = null;
let cliCapturesDir = null;
let cliSpecPath = null;

const argv = process.argv.slice(2);
const values = new Map();
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i];
  if (!["--run-id", "--base-url", "--captures-dir", "--spec"].includes(flag) || values.has(flag) || !argv[i+1] || argv[i+1].startsWith("--")) {
    console.error("FATAL: Invalid, duplicate or incomplete verifier arguments."); process.exit(1);
  }
  values.set(flag, argv[i+1]);
}
cliRunId=values.get("--run-id"); cliBaseUrl=values.get("--base-url");
cliCapturesDir=values.get("--captures-dir"); cliSpecPath=values.get("--spec");

// R02.4: Fresh generated or explicit validated runID; never hardcode a historical runID
const rawRunId = cliRunId || process.env.RUN_ID || `run_runtime_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawRunId)) {
  console.error("FATAL: Invalid run identity.");
  process.exit(1);
}
const RUN_ID = rawRunId;

// R02.4: Strict loopback target validation
const BASE_URL = cliBaseUrl || process.env.BASE_URL || "http://127.0.0.1:18086";
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

let targetHost;
let targetPort;
try {
  const urlObj = new URL(BASE_URL);
  targetHost = urlObj.hostname;
  targetPort = parseInt(urlObj.port || (urlObj.protocol === "https:" ? "443" : "80"), 10);
  if (!ALLOWED_HOSTS.has(targetHost) || ![18086, 18099].includes(targetPort) || urlObj.protocol !== "http:" || urlObj.username || urlObj.password || urlObj.search || urlObj.hash || urlObj.pathname !== "/") {
    console.error("FATAL: Target must be an unambiguous loopback HTTP origin on port 18086 (runtime) or 18099 (isolated controls).");
    process.exit(1);
  }
} catch (e) {
  console.error("FATAL: Invalid loopback target.");
  process.exit(1);
}

// R02.4: Run-specific directory; never silently overwrite a previous run's evidence
const capturesDir = cliCapturesDir
  ? path.resolve(cliCapturesDir)
  : path.join(rootDir, "scratch/runtime-http-captures", RUN_ID);

const openapiPath = cliSpecPath
  ? path.resolve(cliSpecPath)
  : path.join(rootDir, "docs/backend/openapi.v1.json");

if (!fs.existsSync(openapiPath)) {
  console.error(`FATAL: OpenAPI specification not found at ${openapiPath}`);
  process.exit(1);
}

let openapiDoc;
try {
  openapiDoc = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
} catch (e) {
  console.error(`FATAL: Failed to parse OpenAPI specification at ${openapiPath}: ${e.message}`);
  process.exit(1);
}

if (fs.existsSync(capturesDir)) {
  console.error("FATAL: Capture directory already exists; choose a new run and output directory."); process.exit(1);
}
fs.mkdirSync(capturesDir, { recursive: true });

const MAX_BODY_BYTES = 64 * 1024; // 64 KiB cap

// R02.4: Total deadline and body bounded HTTP request helper
function makeRequest({ method = "GET", path: reqPath = "/api/v1/health", headers = {} }) {
  const timeoutMs = 8000;
  const start = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let totalTimer = null;

    function cleanup() {
      if (totalTimer) {
        clearTimeout(totalTimer);
        totalTimer = null;
      }
    }

    function safeReject(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function safeResolve(val) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    }

    totalTimer = setTimeout(() => {
      try { req.destroy(); } catch {}
      safeReject(new Error(`Total HTTP deadline exceeded (${timeoutMs}ms)`));
    }, timeoutMs);

    const defaultHeaders = {
      Host: "api.gazaairport.com",
      Connection: "close",
      ...headers,
    };

    const req = http.request(
      {
        host: targetHost,
        port: targetPort,
        method,
        path: reqPath,
        headers: defaultHeaders,
      },
      (res) => {
        let rawBody = "";
        let bodyBytes = 0;

        res.on("data", (chunk) => {
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_BODY_BYTES) {
            try { req.destroy(); } catch {}
            safeReject(new Error(`Response body exceeded ${MAX_BODY_BYTES} byte limit`));
            return;
          }
          rawBody += chunk;
        });

        res.on("end", () => {
          const elapsed = performance.now() - start;
          const statusMessage =
            res.statusMessage ||
            (res.statusCode === 200 ? "OK" : res.statusCode === 204 ? "No Content" : "Error");

          let output = `HTTP/1.1 ${res.statusCode} ${statusMessage}\n`;
          output += `Host: ${defaultHeaders.Host}\n`;
          output += `Connection: close\n`;

          for (const [key, val] of Object.entries(res.headers)) {
            const titleKey = key
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join("-");
            output += `${titleKey}: ${val}\n`;
          }

          if (res.statusCode === 204) {
            output += `\n`;
          } else {
            output += `\n${rawBody}`;
          }

          let parsedBody = null;
          if (rawBody.length > 0) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = rawBody;
            }
          }

          safeResolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody,
            rawBody,
            hasRawBody: rawBody.length > 0,
            rawText: output,
            elapsedMs: Math.round(elapsed),
          });
        });

        res.on("error", (err) => {
          safeReject(err);
        });
      }
    );

    req.on("error", (err) => {
      safeReject(err);
    });

    req.end();
  });
}

function computeSha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function runVerification() {
  console.log("=== Verifying Runtime Image Against Accepted OpenAPI Specification ===");
  console.log(`Target:       ${BASE_URL} (Host: api.gazaairport.com)`);
  console.log(`Run ID:       ${RUN_ID}`);
  console.log(`Spec:         ${openapiPath}`);
  console.log(`Captures Dir: ${capturesDir}\n`);

  const manifest = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    target: `${targetHost}:${targetPort}`,
    runtimeImage: "gaza-gateway-backend:phase13a-runtime",
    captures: [],
  };

  const tests = [
    {
      name: "01_health_liveness_200",
      file: "01_health_liveness_200.txt",
      request: { method: "GET", path: "/api/v1/health" },
      routeMeta: { path: "/health", method: "GET", expectedStatus: 200, classification: null },
    },
    {
      name: "02_health_readiness_200",
      file: "02_health_readiness_200.txt",
      request: { method: "GET", path: "/api/v1/health/ready" },
      routeMeta: { path: "/health/ready", method: "GET", expectedStatus: 200, classification: null },
    },
    {
      name: "03_version_200",
      file: "03_version_200.txt",
      request: { method: "GET", path: "/api/v1/version" },
      routeMeta: { path: "/version", method: "GET", expectedStatus: 200, classification: null },
    },
    {
      name: "04_untrusted_host_400",
      file: "04_untrusted_host_400.txt",
      request: { method: "GET", path: "/api/v1/health", headers: { Host: "evil.untrusted.com" } },
      routeMeta: { path: "/health", method: "GET", expectedStatus: 400, classification: "untrusted_host" },
    },
    {
      name: "05_forwarded_host_rejected_400",
      file: "05_forwarded_host_rejected_400.txt",
      request: { method: "GET", path: "/api/v1/health", headers: { "X-Forwarded-Host": "spoofed.domain.org" } },
      routeMeta: { path: "/health", method: "GET", expectedStatus: 400, classification: "untrusted_host" },
    },
    {
      name: "06_cors_preflight_allowed_204",
      file: "06_cors_preflight_allowed_204.txt",
      request: {
        method: "OPTIONS",
        path: "/api/v1/health",
        headers: {
          Origin: "https://www.gazaairport.com",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "X-Request-Id",
        },
      },
      routeMeta: { path: "/health", method: "OPTIONS", expectedStatus: 204, classification: "cors_preflight" },
    },
    {
      name: "07_cors_preflight_disallowed_403",
      file: "07_cors_preflight_disallowed_403.txt",
      request: {
        method: "OPTIONS",
        path: "/api/v1/health",
        headers: {
          Origin: "https://malicious.example.com",
          "Access-Control-Request-Method": "GET",
        },
      },
      routeMeta: { path: "/health", method: "OPTIONS", expectedStatus: 403, classification: "cors_preflight" },
    },
    {
      name: "08_correlation_sanitized_200",
      file: "08_correlation_sanitized_200.txt",
      request: {
        method: "GET",
        path: "/api/v1/health",
        headers: { "X-Request-Id": "invalid-non-uuid-characters" },
      },
      routeMeta: { path: "/health", method: "GET", expectedStatus: 200, classification: null },
      customAssert: (res) => {
        const reqId = res.headers["x-request-id"];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(reqId)) {
          throw new Error(`Expected regenerated UUID in X-Request-Id, got: ${reqId}`);
        }
        if (res.body?.meta?.requestId !== reqId) {
          throw new Error(`Mismatched requestId between header (${reqId}) and body (${res.body?.meta?.requestId})`);
        }
      },
    },
    {
      name: "09_not_found_canonical_404",
      file: "09_not_found_canonical_404.txt",
      request: { method: "GET", path: "/api/v1/unmatched_route" },
      routeMeta: { path: "/unmatched_route", method: "GET", expectedStatus: 404, classification: "unmatched_route" },
    },
    {
      name: "10_method_not_allowed_405",
      file: "10_method_not_allowed_405.txt",
      request: { method: "POST", path: "/api/v1/health" },
      routeMeta: { path: "/health", method: "POST", expectedStatus: 405, classification: "method_not_allowed" },
    },
  ];

  let passed = 0;
  for (const t of tests) {
    console.log(`Testing [${t.name}] (${t.request.method || "GET"} ${t.request.path})...`);
    const res = await makeRequest(t.request);

    // Save capture to run-specific directory first
    const captureFilePath = path.join(capturesDir, t.file);
    fs.writeFileSync(captureFilePath, res.rawText, "utf8");
    const sha = computeSha256(res.rawText);

    // R02.4: Reuse committed validateCapture from validate-http-captures.mjs and assert result.valid
    const captureData = {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body,
      rawBody: res.rawBody,
      hasRawBody: res.hasRawBody,
    };

    const validationResult = validateCapture(captureData, t.routeMeta, openapiDoc);
    if (!validationResult.valid) {
      console.error(`  ✗ FAIL: [${t.name}] Contract validation errors:`);
      for (const err of validationResult.errors) {
        console.error("      - Capture failed the bounded contract gate.");
      }
      throw new Error(`Contract validation failed for [${t.name}].`);
    }

    if (t.customAssert) {
      t.customAssert(res);
      console.log(`  ✓ Custom assertions verified`);
    }

    manifest.captures.push({
      name: t.name,
      file: t.file,
      requestMethod: t.request.method || "GET",
      requestPath: t.request.path,
      operationPath: t.routeMeta.path,
      expectedStatus: t.routeMeta.expectedStatus,
      actualStatus: res.statusCode,
      classification: t.routeMeta.classification,
      elapsedMs: res.elapsedMs,
      sha256: sha,
      captureTimestamp: new Date().toISOString(),
      schemaSource: validationResult.schemaSource || "validated",
    });

    console.log(`  ✓ Validated against schema [${validationResult.schemaSource || "valid"}], Status: ${res.statusCode}, Elapsed: ${res.elapsedMs}ms, SHA: ${sha.slice(0, 12)}...\n`);
    passed++;
  }

  // Probe 11: Rate limit test (429) against /api/v1/version
  console.log("Testing [11_rate_limit_429] on /api/v1/version...");
  let rateLimitRes = null;
  for (let i = 0; i < 75; i++) {
    const res = await makeRequest({ method: "GET", path: "/api/v1/version" });
    if (res.statusCode === 429) {
      rateLimitRes = res;
      break;
    }
  }

  if (!rateLimitRes) {
    throw new Error("Failed to trigger HTTP 429 rate limit within 75 requests");
  }

  const rlFile = "11_rate_limit_429.txt";
  fs.writeFileSync(path.join(capturesDir, rlFile), rateLimitRes.rawText, "utf8");
  const rlSha = computeSha256(rateLimitRes.rawText);

  const rlRouteMeta = {
    path: "/version",
    method: "GET",
    expectedStatus: 429,
    classification: null,
  };

  const rlCaptureData = {
    statusCode: rateLimitRes.statusCode,
    headers: rateLimitRes.headers,
    body: rateLimitRes.body,
    rawBody: rateLimitRes.rawBody,
    hasRawBody: rateLimitRes.hasRawBody,
  };

  const retryAfter=rateLimitRes.headers["retry-after"];
  if (typeof retryAfter !== "string" || !/^\d{1,5}$/.test(retryAfter) || Number(retryAfter) > 86400) {
    throw new Error("Invalid Retry-After delay on HTTP429.");
  }
  const rlValidationResult = validateCapture(rlCaptureData, rlRouteMeta, openapiDoc);
  if (!rlValidationResult.valid) {
    console.error(`  ✗ FAIL: [11_rate_limit_429] Contract validation errors:`);
    for (const err of rlValidationResult.errors) {
      console.error(`      - ${err}`);
    }
    throw new Error("Contract validation failed for [11_rate_limit_429].");
  }

  manifest.captures.push({
    name: "11_rate_limit_429",
    file: rlFile,
    requestMethod: "GET",
    requestPath: "/api/v1/version",
    operationPath: "/version",
    expectedStatus: 429,
    actualStatus: 429,
    classification: null,
    elapsedMs: rateLimitRes.elapsedMs,
    sha256: rlSha,
    captureTimestamp: new Date().toISOString(),
    schemaSource: rlValidationResult.schemaSource || "ErrorResponse",
  });
  console.log(`  ✓ Validated against schema [${rlValidationResult.schemaSource}], Status: 429, Retry-After: ${rateLimitRes.headers["retry-after"]}, SHA: ${rlSha.slice(0, 12)}...\n`);
  passed++;

  // Write manifest
  const manifestPath = path.join(capturesDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nWritten runtime captures manifest to ${manifestPath}`);
  console.log(`=== All ${passed} OpenAPI Runtime Contract Checks PASSED ===\n`);

  return { passed, capturesDir, manifestPath, runId: RUN_ID };
}

// CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runVerification().catch((err) => {
    console.error("FATAL: Runtime contract verification failed.");
    process.exit(1);
  });
}
