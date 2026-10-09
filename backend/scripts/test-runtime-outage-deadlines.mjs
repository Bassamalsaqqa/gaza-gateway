import http from "node:http";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = path.resolve(__dirname, "../docker-compose.runtime.yml");

// R02.2: Strict containment - reject arbitrary Compose projects or non-loopback BASE_URL before any action
const ALLOWED_PROJECTS = new Set(["gaza_gateway_phase13a_runtime"]);
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_PORTS = new Set([18086]);

const PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME || "gaza_gateway_phase13a_runtime";
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:18086";

if (!ALLOWED_PROJECTS.has(PROJECT_NAME)) {
  console.error("FATAL: Unsupported Compose project.");
  process.exit(1);
}

let targetHost;
let targetPort;
try {
  const url = new URL(BASE_URL);
  targetHost = url.hostname;
  targetPort = parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10);
  if (!ALLOWED_HOSTS.has(targetHost) || !ALLOWED_PORTS.has(targetPort) || url.protocol !== "http:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    console.error("FATAL: Target must be an unambiguous loopback HTTP origin on port18086.");
    process.exit(1);
  }
} catch (e) {
  console.error("FATAL: Invalid loopback target.");
  process.exit(1);
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KiB cap

// R02.2: Total request/body deadline with capped buffer and clean timer clearance
function makeRequest(reqPath, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
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
      const elapsed = Math.round(performance.now() - start);
      reject(new Error(`HTTP request failed after ${elapsed}ms.`));
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

    const req = http.request(
      {
        host: targetHost,
        port: targetPort,
        method: options.method || "GET",
        path: reqPath,
        headers: {
          Host: "api.gazaairport.com",
          Connection: "close",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = "";
        let bodyBytes = 0;

        res.on("data", (chunk) => {
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_BODY_BYTES) {
            try { req.destroy(); } catch {}
            safeReject(new Error(`Response body exceeded ${MAX_BODY_BYTES} byte limit`));
            return;
          }
          body += chunk;
        });

        res.on("end", () => {
          const elapsed = performance.now() - start;
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {}
          safeResolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: body,
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bounded Docker subprocess executions
async function dockerCompose(args, execOptions = {}) {
  const envFile = path.resolve(__dirname, "../.env.runtime");
  const envArgs = fs.existsSync(envFile) ? ["--env-file", envFile] : [];
  const cmdArgs = ["compose", ...envArgs, "-p", PROJECT_NAME, "-f", COMPOSE_FILE, ...args];
  return execFileAsync("docker", cmdArgs, {
    timeout: execOptions.timeout || 30000,
    windowsHide: true,
    env: process.env,
    ...execOptions,
  });
}

function execPhpInContainer(script, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const envFile = path.resolve(__dirname, "../.env.runtime");
    const envArgs = fs.existsSync(envFile) ? ["--env-file", envFile] : [];
    const cmdArgs = ["compose", ...envArgs, "-p", PROJECT_NAME, "-f", COMPOSE_FILE, "exec", "-T", "web", "php"];

    const proc = execFile("docker", cmdArgs, { timeout: timeoutMs, windowsHide: true, env: process.env }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error("PHP runtime probe subprocess failed."));
      } else {
        resolve({ stdout, stderr });
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  });
}

async function run() {
  console.log("=== Testing Runtime Outage & Deadline Behavior ===");
  console.log(`Target:          ${BASE_URL} (Host: api.gazaairport.com)`);
  console.log(`Compose Project: ${PROJECT_NAME}\n`);

  const results = {
    scenarioA_stopped_port: {},
    scenarioB_connection_timeout: {},
    scenarioC_statement_timeout: {},
  };

  let executionPassed = false;
  let executionError = null;

  try {
    // -------------------------------------------------------------------------
    // SCENARIO A: Stopped-Port Connection Refusal (TCP RST)
    // -------------------------------------------------------------------------
    console.log("--- SCENARIO A: Stopped-Port Connection Refusal (TCP RST) ---");
    console.log("Stopping postgres-runtime container...");
    await dockerCompose(["stop", "postgres-runtime"]);
    await sleep(1000);

    console.log("1. Testing GET /api/v1/health (DB-independent liveness)...");
    const livenessA = await makeRequest("/api/v1/health");
    console.log(`   Status: ${livenessA.statusCode}, Elapsed: ${livenessA.elapsedMs}ms, status: ${livenessA.body?.data?.status}`);
    if (livenessA.statusCode !== 200) {
      throw new Error(`Expected liveness 200, got ${livenessA.statusCode}`);
    }
    results.scenarioA_stopped_port.liveness = {
      status: livenessA.statusCode,
      elapsedMs: livenessA.elapsedMs,
      verified: true,
    };

    console.log("2. Testing GET /api/v1/health/ready (fail-closed readiness)...");
    const readinessA = await makeRequest("/api/v1/health/ready");
    console.log(`   Status: ${readinessA.statusCode}, Elapsed: ${readinessA.elapsedMs}ms, code: ${readinessA.body?.error?.code}`);
    if (readinessA.statusCode !== 503) {
      throw new Error(`Expected readiness 503, got ${readinessA.statusCode}`);
    }
    results.scenarioA_stopped_port.readiness = {
      status: readinessA.statusCode,
      elapsedMs: readinessA.elapsedMs,
      code: readinessA.body?.error?.code,
      verified: true,
    };

    console.log("3. Testing GET /api/v1/version (prompt 503 version endpoint with DB stopped)...");
    const versionA = await makeRequest("/api/v1/version");
    console.log(`   Status: ${versionA.statusCode}, Elapsed: ${versionA.elapsedMs}ms, code: ${versionA.body?.error?.code}`);
    if (versionA.statusCode !== 503) {
      throw new Error(`Expected version 503 for DB-down outage, got ${versionA.statusCode}`);
    }
    if (versionA.elapsedMs > 8000) {
      throw new Error(`Version response exceeded 8s deadline: ${versionA.elapsedMs}ms`);
    }
    results.scenarioA_stopped_port.version = {
      status: versionA.statusCode,
      elapsedMs: versionA.elapsedMs,
      code: versionA.body?.error?.code,
      verified: true,
    };

    console.log("Restarting postgres-runtime container...");
    await dockerCompose(["start", "postgres-runtime"]);
    console.log("Waiting for postgres recovery...");
    let recoveredA = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      try {
        const check = await makeRequest("/api/v1/health/ready");
        if (check.statusCode === 200) {
          console.log(`   Readiness recovered to 200 OK after ${i + 1}s`);
          results.scenarioA_stopped_port.recovered = { status: 200, attempts: i + 1, verified: true };
          recoveredA = true;
          break;
        }
      } catch {}
    }
    if (!recoveredA) {
      throw new Error("Failed to recover readiness after starting postgres-runtime in Scenario A");
    }

    // -------------------------------------------------------------------------
    // SCENARIO B: Real TCP Connection Timeout (Accepting listener that never responds)
    // -------------------------------------------------------------------------
    console.log("\n--- SCENARIO B: Genuine TCP Connection Timeout ---");
    console.log("Starting local TCP listener on 127.0.0.1:5433 inside container that accepts and hangs...");

    // Bounded listener lifetime: accepts connections with 15s timeout
    await dockerCompose([
      "exec", "-d", "web",
      "php", "-r",
      "$s = stream_socket_server('tcp://127.0.0.1:5433'); while ($c = stream_socket_accept($s, 15)) { sleep(10); fclose($c); }"
    ]);
    await sleep(1000);

    // R02.2: Derive actual PDO timeout from loaded Laravel effective connection rather than hand-setting 3
    console.log("Deriving actual PDO timeout from loaded Laravel configuration and probing hanging listener...");
    const timeoutProbeScript = `<?php
      require 'vendor/autoload.php';
      $app = require 'bootstrap/app.php';
      $app->make(\\Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();

      $config = config('database.connections.pgsql');
      $rawTimeout = $config['options'][\\PDO::ATTR_TIMEOUT] ?? null;
      $effectiveTimeout = is_numeric($rawTimeout) ? (int) $rawTimeout : null;

      if ($effectiveTimeout !== 3) {
          echo json_encode([
              'status' => 'config_error',
              'message' => 'Configured PDO ATTR_TIMEOUT does not match expected 3s requirement',
              'effectiveTimeout' => $effectiveTimeout,
          ]);
          exit(1);
      }

      $start = microtime(true);
      try {
          $pdo = new PDO('pgsql:host=127.0.0.1;port=5433;dbname=' . $config['database'], $config['username'], $config['password'], [
              \\PDO::ATTR_TIMEOUT => $effectiveTimeout,
              \\PDO::ATTR_ERRMODE => \\PDO::ERRMODE_EXCEPTION,
          ]);
          echo json_encode(['status' => 'unexpected_success']);
      } catch (\\Throwable $e) {
          $elapsed = microtime(true) - $start;
          $msg = $e->getMessage();
          $isTimeout = str_contains($msg, 'timeout expired') || str_contains($msg, 'Connection timed out');
          echo json_encode([
              'status' => 'timeout_caught',
              'derivedTimeoutSec' => $effectiveTimeout,
              'elapsedSec' => round($elapsed, 3),
              'sqlstate' => $e->getCode(),
              'isTimeout' => $isTimeout,
          ]);
      }
    `;

    const { stdout: timeoutOut } = await execPhpInContainer(timeoutProbeScript);

    const timeoutResult = JSON.parse(timeoutOut.trim());
    console.log(`   Probe result: derivedTimeout=${timeoutResult.derivedTimeoutSec}s, elapsed=${timeoutResult.elapsedSec}s, isTimeout=${timeoutResult.isTimeout}, sqlstate=${timeoutResult.sqlstate}`);
    results.scenarioB_connection_timeout = timeoutResult;

    if (!timeoutResult.isTimeout) {
      throw new Error(`Expected genuine connection timeout, probe status: ${timeoutResult.status}`);
    }
    if (timeoutResult.elapsedSec < 2.8 || timeoutResult.elapsedSec > 8.0) {
      throw new Error(`Connection timeout out of expected bounds (2.8s - 8.0s): ${timeoutResult.elapsedSec}s`);
    }
    console.log(`   ✓ Genuine connection timeout verified at ${timeoutResult.elapsedSec}s (derived from config, <= 8.0s)`);

    // -------------------------------------------------------------------------
    // SCENARIO C: PostgreSQL Query Cancellation (statement_timeout) via Laravel DB
    // -------------------------------------------------------------------------
    console.log("\n--- SCENARIO C: Query Cancellation via Loaded Laravel DB Configuration ---");
    console.log("Executing long query (SELECT pg_sleep(5)) through Laravel DB::select()...");

    const statementProbeScript = `<?php
      require 'vendor/autoload.php';
      $app = require 'bootstrap/app.php';
      $app->make(\\Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();

      $start = microtime(true);
      try {
          \\Illuminate\\Support\\Facades\\DB::select('SELECT pg_sleep(5);');
          echo json_encode(['status' => 'unexpected_success']);
      } catch (\\Illuminate\\Database\\QueryException $e) {
          $elapsed = microtime(true) - $start;
          $prev = $e->getPrevious();
          $sqlstate = $prev instanceof \\PDOException ? $prev->getCode() : $e->getCode();
          $msg = $e->getMessage();
          $isCanceled = str_contains($msg, '57014') || str_contains($msg, 'canceling statement');
          echo json_encode([
              'status' => 'query_canceled',
              'elapsedSec' => round($elapsed, 3),
              'sqlstate' => $sqlstate,
              'canceled' => $isCanceled,
          ]);
      }
    `;

    const { stdout: statementOut } = await execPhpInContainer(statementProbeScript);

    const statementResult = JSON.parse(statementOut.trim());
    console.log(`   Probe result: elapsed=${statementResult.elapsedSec}s, canceled=${statementResult.canceled}, sqlstate=${statementResult.sqlstate}`);
    results.scenarioC_statement_timeout = statementResult;

    if (!statementResult.canceled) {
      throw new Error(`Expected statement cancellation due to statement_timeout, probe status: ${statementResult.status}`);
    }
    if (statementResult.elapsedSec < 2.5 || statementResult.elapsedSec > 8.0) {
      throw new Error(`Statement timeout out of expected bounds (2.5s - 8.0s): ${statementResult.elapsedSec}s`);
    }
    console.log(`   ✓ Query canceled by PostgreSQL at ${statementResult.elapsedSec}s with SQLSTATE 57014 (strictly <= 8.0s)`);

    executionPassed = true;
  } catch (err) {
    executionError = err;
  } finally {
    // R02.2: In finally, restore PostgreSQL and prove readiness recovers. Recovery failure is an exit 1; do not print PASS before successful recovery.
    console.log("\n[Cleanup/Recovery] Ensuring postgres-runtime is running and healthy...");
    let recoverySuccess = false;
    try {
      await dockerCompose(["start", "postgres-runtime"]);
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        try {
          const check = await makeRequest("/api/v1/health/ready");
          if (check.statusCode === 200) {
            console.log(`[Cleanup/Recovery] Database and readiness verified 200 OK after ${i + 1}s.`);
            recoverySuccess = true;
            break;
          }
        } catch {}
      }
    } catch (cleanupErr) {
      console.error("[Cleanup/Recovery] Subprocess error during container recovery:", cleanupErr.code || "FAILED");
    }

    if (!recoverySuccess) {
      console.error("FATAL: Readiness recovery failed after restoring postgres-runtime!");
      process.exit(1);
    }

    if (executionError) {
      console.error("FATAL: Runtime fault scenario failed; recovery was attempted.");
      process.exit(1);
    }

    if (executionPassed && recoverySuccess) {
      console.log("\n=== All Runtime Outage & Deadline Checks PASSED ===");
      console.log(JSON.stringify(results, null, 2));
    }
  }
}

run().catch((err) => {
  console.error("FATAL: Runtime fault harness failed.");
  process.exit(1);
});
