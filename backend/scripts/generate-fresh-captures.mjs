import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROBES_MAP } from "./capture-probes-matrix.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

// Parse CLI flags or fall back to environment / defaults
const args = process.argv.slice(2);
let RUN_ID = process.env.RUN_ID || "run_0b1e5668a9b244e888de59f177367cf0";
let PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME || "gaza_gateway_phase13a_foundation";
let BASE_URL = process.env.BASE_URL || "http://127.0.0.1:18084";
let capturesDir = path.join(rootDir, "scratch/http-captures");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--run-id" && args[i + 1]) {
    RUN_ID = args[++i];
  } else if (args[i] === "--project" && args[i + 1]) {
    PROJECT_NAME = args[++i];
  } else if (args[i] === "--base-url" && args[i + 1]) {
    BASE_URL = args[++i];
  } else if (args[i] === "--captures-dir" && args[i + 1]) {
    capturesDir = path.resolve(args[++i]);
  }
}

const composeFile = path.join(rootDir, "backend/docker-compose.yml");
const urlObj = new URL(BASE_URL);
const targetHost = urlObj.hostname;
const targetPort = parseInt(urlObj.port || "80", 10);

if (!fs.existsSync(capturesDir)) {
  fs.mkdirSync(capturesDir, { recursive: true });
}

function makeRequest({ method = "GET", path: reqPath = "/api/v1/health", headers = {} }) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      Host: `${targetHost}:${targetPort}`,
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
        res.on("data", (chunk) => {
          rawBody += chunk;
        });
        res.on("end", () => {
          const statusMessage = res.statusMessage || (res.statusCode === 200 ? "OK" : res.statusCode === 204 ? "No Content" : "Error");
          let output = `HTTP/1.1 ${res.statusCode} ${statusMessage}\n`;
          output += `Host: ${targetHost}:${targetPort}\n`;
          output += `Connection: close\n`;

          for (const [key, val] of Object.entries(res.headers)) {
            const titleKey = key
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join("-");
            output += `${titleKey}: ${val}\n`;
          }

          // For 204, do NOT manufacture a body newline; retain exact delimiter without body
          if (res.statusCode === 204) {
            output += `\n`;
          } else {
            output += `\n${rawBody}\n`;
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawBody,
            rawText: output,
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function computeSha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`=== Generating Fresh Live HTTP Captures for Run [${RUN_ID}] ===`);
  console.log(`Project:      ${PROJECT_NAME}`);
  console.log(`Base URL:     ${BASE_URL}`);
  console.log(`Captures Dir: ${capturesDir}\n`);

  const manifest = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    host: `${targetHost}:${targetPort}`,
    captures: [],
  };

  function recordCapture(probeName, res) {
    const probeDef = REQUIRED_PROBES_MAP.get(probeName);
    if (!probeDef) {
      throw new Error(`FATAL: Unknown probe name '${probeName}' not found in REQUIRED_PROBES matrix!`);
    }

    const filePath = path.join(capturesDir, probeDef.file);
    fs.writeFileSync(filePath, res.rawText, "utf8");
    const sha = computeSha256(res.rawText);

    manifest.captures.push({
      name: probeDef.name,
      file: probeDef.file,
      requestMethod: probeDef.requestMethod,
      requestPath: probeDef.requestPath,
      operationPath: probeDef.operationPath,
      expectedStatus: probeDef.expectedStatus,
      actualStatus: res.statusCode,
      classification: probeDef.classification,
      captureTimestamp: new Date().toISOString(),
      sha256: sha,
      fresh: true,
    });

    console.log(`  ✓ Captured [${probeDef.name}] -> ${probeDef.file} (HTTP ${res.statusCode}, sha: ${sha.slice(0, 10)}...)`);
  }

  try {
    // 01: Liveness 200
    console.log("1. Probing Liveness 200...");
    const c01 = await makeRequest({ path: "/api/v1/health" });
    if (c01.statusCode !== 200) throw new Error(`Expected 200 for liveness, got ${c01.statusCode}`);
    recordCapture("01_health_liveness_200", c01);

    // 02: Readiness 200 (healthy database and worker)
    console.log("2. Probing Readiness 200...");
    const c02 = await makeRequest({ path: "/api/v1/health/ready" });
    if (c02.statusCode !== 200) throw new Error(`Expected 200 for readiness, got ${c02.statusCode}`);
    recordCapture("02_health_readiness_200", c02);

    // 03: Version 200
    console.log("3. Probing Version 200...");
    const c03 = await makeRequest({ path: "/api/v1/version" });
    if (c03.statusCode !== 200) throw new Error(`Expected 200 for version, got ${c03.statusCode}`);
    recordCapture("03_version_200", c03);

    // 04 & 05: Stop PostgreSQL container for DB fault injection
    console.log("4. Stopping PostgreSQL container for fault injection...");
    execSync(`docker compose -p "${PROJECT_NAME}" stop postgres`, { stdio: "inherit" });
    await sleep(2000);

    console.log("   Probing DB-down liveness (pure process health independent of DB)...");
    const c04 = await makeRequest({ path: "/api/v1/health" });
    if (c04.statusCode !== 200) throw new Error(`Expected 200 for DB-down liveness, got ${c04.statusCode}`);
    recordCapture("04_db_down_liveness_200", c04);

    console.log("   Probing DB-down readiness (fail-closed dependency check)...");
    const c05 = await makeRequest({ path: "/api/v1/health/ready" });
    if (c05.statusCode !== 503) throw new Error(`Expected 503 for DB-down readiness, got ${c05.statusCode}`);
    recordCapture("05_db_down_readiness_503", c05);

    console.log("   Restarting PostgreSQL container...");
    execSync(`docker compose -p "${PROJECT_NAME}" start postgres`, { stdio: "inherit" });
    console.log("   Waiting for PostgreSQL healthcheck...");
    await sleep(4000);

    // 06: Recovered readiness 200
    console.log("5. Probing Recovered Readiness 200...");
    let c06 = null;
    for (let i = 0; i < 15; i++) {
      const res = await makeRequest({ path: "/api/v1/health/ready" });
      if (res.statusCode === 200) {
        c06 = res;
        break;
      }
      await sleep(1000);
    }
    if (!c06 || c06.statusCode !== 200) throw new Error("Database recovery failed: readiness did not return 200");
    recordCapture("06_recovered_readiness_200", c06);

    // 07: Untrusted host 400
    console.log("6. Probing Untrusted Host 400...");
    const c07 = await makeRequest({ path: "/api/v1/health", headers: { Host: "evil.untrusted.com" } });
    if (c07.statusCode !== 400) throw new Error(`Expected 400 for untrusted host, got ${c07.statusCode}`);
    recordCapture("07_untrusted_host_400", c07);

    // 08: Forwarded host rejected 400
    console.log("7. Probing Forwarded Host Rejected 400...");
    const c08 = await makeRequest({ path: "/api/v1/health", headers: { "X-Forwarded-Host": "spoofed.domain.org" } });
    if (c08.statusCode !== 400) throw new Error(`Expected 400 for forwarded host, got ${c08.statusCode}`);
    recordCapture("08_forwarded_host_rejected_400", c08);

    // 09: CORS preflight allowed 204
    console.log("8. Probing CORS Preflight Allowed 204...");
    const c09 = await makeRequest({
      method: "OPTIONS",
      path: "/api/v1/health",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Booking-Token, X-Request-Id",
      },
    });
    if (c09.statusCode !== 204) throw new Error(`Expected 204 for allowed CORS preflight, got ${c09.statusCode}`);
    recordCapture("09_cors_preflight_allowed_204", c09);

    // 10: CORS preflight disallowed 403
    console.log("9. Probing CORS Preflight Disallowed 403...");
    const c10 = await makeRequest({
      method: "OPTIONS",
      path: "/api/v1/health",
      headers: {
        Origin: "https://malicious.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    if (c10.statusCode !== 403) throw new Error(`Expected 403 for disallowed CORS preflight, got ${c10.statusCode}`);
    recordCapture("10_cors_preflight_disallowed_403", c10);

    // 11: Correlation sanitized 200
    console.log("10. Probing Correlation Sanitized 200...");
    const c11 = await makeRequest({
      path: "/api/v1/health",
      headers: { "X-Request-Id": "invalid-non-uuid-characters" },
    });
    if (c11.statusCode !== 200) throw new Error(`Expected 200 for correlation probe, got ${c11.statusCode}`);
    recordCapture("11_correlation_sanitized_200", c11);

    // 12: Not found 404
    console.log("11. Probing Canonical 404 Not Found...");
    const c12 = await makeRequest({ path: "/api/v1/unmatched_route" });
    if (c12.statusCode !== 404) throw new Error(`Expected 404 for unmatched route, got ${c12.statusCode}`);
    recordCapture("12_not_found_canonical_404", c12);

    // 13: Throttled operation 429 against /api/v1/version
    console.log("12. Triggering actual HTTP 429 rate limit on /api/v1/version...");
    let c13 = null;
    for (let i = 0; i < 75; i++) {
      const res = await makeRequest({ path: "/api/v1/version" });
      if (res.statusCode === 429) {
        c13 = res;
        break;
      }
    }
    if (!c13 || c13.statusCode !== 429) {
      throw new Error("FATAL: Failed to trigger HTTP 429 rate limit on /api/v1/version within 75 requests!");
    }
    if (!c13.headers["retry-after"]) {
      throw new Error("FATAL: HTTP 429 response missing Retry-After header!");
    }
    recordCapture("13_rate_limit_429", c13);

    // 14: Method Not Allowed 405 (POST to GET-only route /api/v1/health)
    console.log("13. Probing 405 Method Not Allowed...");
    const c14 = await makeRequest({ method: "POST", path: "/api/v1/health" });
    if (c14.statusCode !== 405) throw new Error(`Expected 405 for POST /api/v1/health, got ${c14.statusCode}`);
    recordCapture("14_method_not_allowed_405", c14);

    // 15: Worker stopped / stale heartbeat 503
    console.log("14. Stopping worker container for worker fault injection...");
    execSync(`docker compose -p "${PROJECT_NAME}" stop worker`, { stdio: "inherit" });
    // Clear worker heartbeat from PostgreSQL cache table so heartbeat is immediately missing/stale
    try {
      execSync(
        `docker compose -p "${PROJECT_NAME}" exec -T postgres psql -U gaza_app_user -d gaza_gateway_dev -c "DELETE FROM cache WHERE key LIKE '%worker:heartbeat%';"`,
        { stdio: "inherit" }
      );
    } catch (e) {
      console.warn("Could not clear worker heartbeat cache key:", e.message);
    }
    await sleep(1500);

    console.log("   Probing worker-stopped readiness (fail-closed check for stale/missing heartbeat)...");
    const c15 = await makeRequest({ path: "/api/v1/health/ready" });
    if (c15.statusCode !== 503) throw new Error(`Expected 503 for worker-stopped readiness, got ${c15.statusCode}`);
    recordCapture("15_worker_stopped_readiness_503", c15);

    // 16: Worker recovered readiness 200
    console.log("15. Restarting worker container...");
    execSync(`docker compose -p "${PROJECT_NAME}" start worker`, { stdio: "inherit" });
    console.log("   Waiting 5 seconds for worker heartbeat initialization...");
    await sleep(5000);

    console.log("   Probing worker-recovered readiness 200...");
    let c16 = null;
    for (let i = 0; i < 15; i++) {
      const res = await makeRequest({ path: "/api/v1/health/ready" });
      if (res.statusCode === 200) {
        c16 = res;
        break;
      }
      await sleep(1000);
    }
    if (!c16 || c16.statusCode !== 200) throw new Error("Worker recovery failed: readiness did not return 200");
    recordCapture("16_worker_recovered_readiness_200", c16);

    // Write authoritative manifest
    const manifestPath = path.join(capturesDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`\nWritten capture manifest to ${manifestPath}`);
    console.log(`Successfully generated all ${manifest.captures.length} fresh HTTP captures for Run [${RUN_ID}].`);
  } finally {
    console.log("\nEnsuring all project containers are restored to healthy state...");
    try {
      execSync(`docker compose -p "${PROJECT_NAME}" start postgres`, { stdio: "ignore" });
    } catch {}
    try {
      execSync(`docker compose -p "${PROJECT_NAME}" start worker`, { stdio: "ignore" });
    } catch {}
    await sleep(2000);
    console.log("Project resources restored.");
  }
}

main().catch((err) => {
  console.error("FATAL in capture generation:", err);
  process.exit(1);
});
