import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const VERIFIER_SCRIPT = path.join(__dirname, "verify-runtime-openapi.mjs");
const SCRATCH_DIR = path.join(rootDir, "scratch/negative-control-runs");

if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

const TEST_PORT = 18099;
const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Standard valid responses generator
function getStandardValidResponse(method, reqPath, headers) {
  const reqId = headers["x-request-id"] && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headers["x-request-id"])
    ? headers["x-request-id"]
    : "11111111-2222-3333-4444-555555555555";

  const standardHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",
    "X-Request-Id": reqId,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  const nowIso = "2026-10-09T20:00:00.000Z";

  if (method === "OPTIONS" && reqPath === "/api/v1/health") {
    if (headers["origin"] === "https://www.gazaairport.com") {
      return {
        statusCode: 204,
        headers: {
          ...standardHeaders,
          "Access-Control-Allow-Origin": "https://www.gazaairport.com",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "X-Request-Id",
          "Content-Length": "0",
        },
        body: "",
      };
    } else {
      return {
        statusCode: 403,
        headers: standardHeaders,
        body: JSON.stringify({
          success: false,
          error: { code: "forbidden", message: "Origin not allowed by CORS policy." },
          meta: { requestId: reqId, timestamp: nowIso },
        }),
      };
    }
  }

  // Host checks
  if (headers["host"] === "evil.untrusted.com" || headers["x-forwarded-host"]) {
    return {
      statusCode: 400,
      headers: standardHeaders,
      body: JSON.stringify({
        success: false,
        error: { code: "untrusted_host", message: "Disallowed host header." },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  if (method === "POST" && reqPath === "/api/v1/health") {
    return {
      statusCode: 405,
      headers: { ...standardHeaders, Allow: "GET, HEAD, OPTIONS" },
      body: JSON.stringify({
        success: false,
        error: { code: "method_not_allowed", message: "Method not allowed." },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  if (reqPath === "/api/v1/unmatched_route") {
    return {
      statusCode: 404,
      headers: standardHeaders,
      body: JSON.stringify({
        success: false,
        error: { code: "not_found", message: "Endpoint not found." },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  if (reqPath === "/api/v1/health") {
    return {
      statusCode: 200,
      headers: standardHeaders,
      body: JSON.stringify({
        success: true,
        data: { status: "ok", timestamp: nowIso },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  if (reqPath === "/api/v1/health/ready") {
    return {
      statusCode: 200,
      headers: standardHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          database: "connected",
          migrations: "up_to_date",
          queue: "healthy",
        },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  if (reqPath === "/api/v1/version") {
    return {
      statusCode: 200,
      headers: standardHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          version: "1.0.0-phase13a-runtime",
          commit: "unreleased-runtime-proof",
          schemaVersion: 1,
        },
        meta: { requestId: reqId, timestamp: nowIso },
      }),
    };
  }

  return {
    statusCode: 404,
    headers: standardHeaders,
    body: JSON.stringify({
      success: false,
      error: { code: "not_found", message: "Not found" },
      meta: { requestId: reqId, timestamp: nowIso },
    }),
  };
}

let activeFault = null;
let requestCounter = 0;

const mockServer = http.createServer((req, res) => {
  requestCounter++;
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const reqPath = url.pathname;
  const method = req.method;

  let responseData = getStandardValidResponse(method, reqPath, req.headers);

  // Apply fault injections based on active test scenario
  if (activeFault === "invalid_schema" && reqPath === "/api/v1/health" && method === "GET") {
    // Inject invalid schema: success is a string instead of boolean
    responseData.body = JSON.stringify({
      success: "INVALID_NOT_A_BOOLEAN",
      data: { status: "ok", timestamp: "2026-10-09T20:00:00.000Z" },
      meta: { requestId: "11111111-2222-3333-4444-555555555555", timestamp: "2026-10-09T20:00:00.000Z" },
    });
  } else if (activeFault === "swapped_response_family" && reqPath === "/api/v1/health" && method === "GET") {
    // Inject swapped response family: HTTP 200 returning ErrorResponse payload
    responseData.body = JSON.stringify({
      success: false,
      error: { code: "service_unavailable", message: "Swapped error body on 200" },
      meta: { requestId: "11111111-2222-3333-4444-555555555555", timestamp: "2026-10-09T20:00:00.000Z" },
    });
  } else if (activeFault === "nonempty_204" && method === "OPTIONS" && reqPath === "/api/v1/health") {
    // Inject non-empty body on 204
    responseData.body = "{\"illegal\": \"body_on_204\"}";
    responseData.headers["Content-Length"] = String(responseData.body.length);
  } else if (activeFault === "missing_headers" && reqPath === "/api/v1/health" && method === "GET") {
    // Strip mandatory security headers
    delete responseData.headers["X-Request-Id"];
    delete responseData.headers["Cache-Control"];
  } else if (activeFault === "wrong_content_type" && reqPath === "/api/v1/health" && method === "GET") {
    // Use non-JSON Content-Type
    responseData.headers["Content-Type"] = "text/html; charset=utf-8";
  } else if (activeFault === "wrong_retry_after" && reqPath === "/api/v1/version" && requestCounter > 10) {
    // Reach the rate-limit probe, then reject malformed Retry-After
    responseData.statusCode = 429;
    responseData.headers["Retry-After"] = "not-a-delay";
    responseData.body = JSON.stringify({
      success: false,
      error: { code: "too_many_requests", message: "Too many requests." },
      meta: { requestId: "11111111-2222-3333-4444-555555555555", timestamp: "2026-10-09T20:00:00.000Z" },
    });
  } else if (reqPath === "/api/v1/version" && method === "GET" && requestCounter > 10) {
    // For standard positive rate-limit test
    responseData.statusCode = 429;
    responseData.headers["Retry-After"] = "60";
    responseData.body = JSON.stringify({
      success: false,
      error: { code: "too_many_requests", message: "Rate limit exceeded" },
      meta: { requestId: "11111111-2222-3333-4444-555555555555", timestamp: "2026-10-09T20:00:00.000Z" },
    });
  }

  res.writeHead(responseData.statusCode, responseData.headers);
  if (responseData.body) {
    res.end(responseData.body);
  } else {
    res.end();
  }
});

async function runScenario(scenarioName, expectedExitCode) {
  activeFault = scenarioName;
  requestCounter = 0;
  const runId = `test_${scenarioName}_${Date.now()}`;
  const outDir = path.join(SCRATCH_DIR, runId);

  let actualExitCode = 0;
  let stdout = "";
  let stderr = "";

  try {
    const res = await execFileAsync("node", [
      VERIFIER_SCRIPT,
      "--run-id", runId,
      "--base-url", TEST_BASE_URL,
      "--captures-dir", outDir,
    ], { timeout: 15000, windowsHide: true });
    stdout = res.stdout;
    stderr = res.stderr;
    actualExitCode = 0;
  } catch (err) {
    actualExitCode = err.code ?? 1;
    stdout = err.stdout || "";
    stderr = err.stderr || "";
  }

  const passed = actualExitCode === expectedExitCode;
  console.log(`[${scenarioName.padEnd(25)}] Expected exit: ${expectedExitCode}, Actual exit: ${actualExitCode} -> ${passed ? "PASS ✓" : "FAIL ✗"}`);
  if (!passed) {
    console.error(`  Output snippet: ${stderr.slice(0, 300) || stdout.slice(0, 300)}`);
  }
  return passed;
}

async function main() {
  console.log("=== Running Isolated Subprocess Negative & Positive Controls for Runtime Verifier ===");
  console.log(`Starting mock server on ${TEST_BASE_URL}...\n`);

  await new Promise((resolve) => mockServer.listen(TEST_PORT, "127.0.0.1", resolve));

  const scenarios = [
    { name: "invalid_schema", expectedExit: 1 },
    { name: "swapped_response_family", expectedExit: 1 },
    { name: "nonempty_204", expectedExit: 1 },
    { name: "missing_headers", expectedExit: 1 },
    { name: "wrong_content_type", expectedExit: 1 },
    { name: "wrong_retry_after", expectedExit: 1 },
    { name: "positive_intact_control", expectedExit: 0 },
  ];

  let allPassed = true;
  for (const s of scenarios) {
    const ok = await runScenario(s.name, s.expectedExit);
    if (!ok) allPassed = false;
  }

  mockServer.close();

  if (!allPassed) {
    console.error("\nFATAL: One or more verifier control checks failed!");
    process.exit(1);
  }

  console.log("\n=== All Negative Controls (Exit 1) and Positive Control (Exit 0) PASSED ===");
}

main().catch((err) => {
  console.error("FATAL in control suite:", err);
  process.exit(1);
});
