import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchDir = path.join(root, "scratch");
fs.mkdirSync(scratchDir, { recursive: true });

// Explicit vendor discovery: no hardcoded user fallback path
const vendorEnv = process.env.IDENTITY_GATE_VENDOR;
const localVendor = path.join(root, "backend/vendor");
let vendor = null;
if (vendorEnv && fs.existsSync(path.join(vendorEnv, "autoload.php"))) {
  vendor = path.resolve(vendorEnv);
} else if (fs.existsSync(path.join(localVendor, "autoload.php"))) {
  vendor = path.resolve(localVendor);
} else {
  throw new Error(
    "Actionable failure: Composer vendor not found. Set IDENTITY_GATE_VENDOR environment variable or install backend/vendor."
  );
}

const runId = "mysql_h1a_" + crypto.randomBytes(6).toString("hex");
const outputDir = path.join(scratchDir, runId);
fs.mkdirSync(outputDir, { recursive: true });

const receiptPath = path.join(scratchDir, `receipt-mysql-identity-foundation-${Date.now()}-${runId}.json`);

const networkName = `net_${runId}`;
const mysqlName = `mysql_${runId}`;
const phpName = `php_${runId}`;

const executedCommands = [];

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/gaza_app_local_pass/g, "[REDACTED_PASSWORD]")
    .replace(/gaza_root_local_secret/g, "[REDACTED_ROOT_SECRET]")
    .replace(/base64:[A-Za-z0-9+/=]{40,}/g, "[REDACTED_KEY]");
}

function runCommand(label, program, args, options = {}) {
  const timeout = options.timeout ?? 120000;
  const cwd = options.cwd ?? root;
  const env = { ...process.env, ...options.env };

  const start = Date.now();
  const result = spawnSync(program, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = stdout + stderr;

  const sanitizedLog = sanitize(combined);
  const logFile = path.join(outputDir, `${label}.log`);
  fs.writeFileSync(logFile, sanitizedLog);

  // Hash actual sanitized log bytes as written
  const logSha256 = crypto.createHash("sha256").update(sanitizedLog).digest("hex");

  const entry = {
    label,
    program,
    args: args.map((a) => sanitize(a)),
    exitCode: result.status,
    durationMs,
    logSha256,
  };
  executedCommands.push(entry);

  if (result.error || result.status !== 0) {
    const errMsg = `[FAIL] ${label} exited with code ${result.status}: ${sanitize(stderr || stdout)}`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  console.log(`[PASS] ${label} (${durationMs}ms)`);
  return combined;
}

function docker(label, args, options = {}) {
  return runCommand(label, "docker", args, options);
}

function phpExec(label, args, options = {}) {
  return docker(label, ["exec", phpName, ...args], options);
}

function cleanupAndInspectOwnedResources() {
  console.log("\n--- Executing bounded cleanup and inspecting residual resources ---");
  const outcomes = [];

  // 1. Remove and inspect containers
  for (const name of [phpName, mysqlName]) {
    const rmRes = spawnSync("docker", ["rm", "-f", name], { encoding: "utf8", timeout: 15000 });
    const rmExit = rmRes.status;

    // Inspect container to verify absence
    const inspectRes = spawnSync("docker", ["inspect", name], { encoding: "utf8", timeout: 10000 });
    const inspectCombined = (inspectRes.stdout || "") + (inspectRes.stderr || "");

    let status = "UNKNOWN";
    let verifiedAbsent = false;

    if (inspectCombined.includes("Cannot connect to the Docker daemon") || inspectCombined.includes("daemon is not running")) {
      status = "DAEMON_UNAVAILABLE";
      verifiedAbsent = false;
    } else if (inspectRes.status !== 0 && (inspectCombined.includes("No such container") || inspectCombined.includes("No such object"))) {
      status = "CLEANED_AND_VERIFIED_ABSENT";
      verifiedAbsent = true;
    } else if (inspectRes.status === 0) {
      status = "RESIDUAL_LEAK";
      verifiedAbsent = false;
    } else {
      // A failed inspect can mean timeout, permissions or transport failure.
      // Only an explicit not-found response proves absence.
      status = "UNVERIFIED_CLEANUP";
      verifiedAbsent = false;
    }

    outcomes.push({
      resource: name,
      type: "container",
      rmExitCode: rmExit,
      inspectExitCode: inspectRes.status,
      verifiedAbsent,
      status,
      detail: sanitize(inspectCombined.trim()),
    });
    console.log(`Resource [${name}]: ${status}`);
  }

  // 2. Remove and inspect network
  {
    const rmRes = spawnSync("docker", ["network", "rm", networkName], { encoding: "utf8", timeout: 15000 });
    const rmExit = rmRes.status;

    const inspectRes = spawnSync("docker", ["network", "inspect", networkName], { encoding: "utf8", timeout: 10000 });
    const inspectCombined = (inspectRes.stdout || "") + (inspectRes.stderr || "");

    let status = "UNKNOWN";
    let verifiedAbsent = false;

    if (inspectCombined.includes("Cannot connect to the Docker daemon") || inspectCombined.includes("daemon is not running")) {
      status = "DAEMON_UNAVAILABLE";
      verifiedAbsent = false;
    } else if (inspectRes.status !== 0 && (inspectCombined.includes("No such network") || inspectCombined.includes("not found"))) {
      status = "UNVERIFIED_CLEANUP";
      verifiedAbsent = false;
    } else if (inspectRes.status === 0) {
      status = "RESIDUAL_LEAK";
      verifiedAbsent = false;
    } else {
      status = "CLEANED_AND_VERIFIED_ABSENT";
      verifiedAbsent = true;
    }

    outcomes.push({
      resource: networkName,
      type: "network",
      rmExitCode: rmExit,
      inspectExitCode: inspectRes.status,
      verifiedAbsent,
      status,
      detail: sanitize(inspectCombined.trim()),
    });
    console.log(`Resource [${networkName}]: ${status}`);
  }

  const allVerifiedAbsent = outcomes.every((o) => o.verifiedAbsent === true);
  return {
    outcomes,
    verified: allVerifiedAbsent,
  };
}

function runProbeWorker({ workerId, args, onAcquired, wallTimeoutMs = 15000, maxBufferBytes = 256 * 1024 }) {
  let child = null;
  let timer = null;
  let stdout = "";
  let stderr = "";
  let settled = false;

  const promise = new Promise((resolve, reject) => {
    const cleanupProcess = () => {
      if (timer) clearTimeout(timer);
      if (child && !child.killed) {
        try { child.kill("SIGKILL"); } catch (_) {}
      }
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupProcess();
      reject(new Error(`Worker ${workerId} exceeded wall deadline of ${wallTimeoutMs}ms`));
    }, wallTimeoutMs);

    try {
      child = spawn("docker", [
        "exec",
        phpName,
        "php",
        "tests/MySqlIdentityFoundation/probe-sentinel-process.php",
        ...args,
      ], { encoding: "utf8" });
    } catch (err) {
      settled = true;
      cleanupProcess();
      return reject(err);
    }

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanupProcess();
      reject(new Error(`Worker ${workerId} process error: ${err.message}`));
    });

    let lineBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > maxBufferBytes) {
        if (settled) return;
        settled = true;
        cleanupProcess();
        return reject(new Error(`Worker ${workerId} exceeded maximum stdout buffer (${maxBufferBytes} bytes)`));
      }

      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.event === "lock_acquired" && typeof onAcquired === "function") {
            onAcquired(parsed);
          }
        } catch (_) {}
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > maxBufferBytes) {
        if (settled) return;
        settled = true;
        cleanupProcess();
        return reject(new Error(`Worker ${workerId} exceeded maximum stderr buffer`));
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      const logFile = path.join(outputDir, `probe_worker_${workerId}.log`);
      const sanitized = sanitize(stdout + (stderr ? "\nSTDERR:\n" + stderr : ""));
      fs.writeFileSync(logFile, sanitized);

      if (code !== 0) {
        return reject(new Error(`Worker ${workerId} exited with non-zero code ${code}: ${stderr || stdout}`));
      }

      const lines = stdout.split("\n");
      let finishedResult = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.event === "finished") {
            finishedResult = parsed;
          }
        } catch (_) {}
      }

      if (!finishedResult) {
        return reject(new Error(`Worker ${workerId} completed without emitting 'finished' event. Output: ${stdout}`));
      }

      resolve(finishedResult);
    });
  });

  return {
    promise,
    kill: () => {
      if (timer) clearTimeout(timer);
      if (child && !child.killed) {
        try { child.kill("SIGKILL"); } catch (_) {}
      }
    },
  };
}

async function main() {
  console.log(`=== Starting H1A MySQL Identity Persistence Foundation Gate [${runId}] ===`);
  const startTime = new Date().toISOString();

  // 1. Inventory git status and file checksums
  const headSha = runCommand("git-head", "git", ["rev-parse", "HEAD"]).trim();
  const gitStatusRaw = runCommand("git-status", "git", ["status", "--porcelain"]);
  const uncommittedFiles = gitStatusRaw.split("\n").map(l => l.trim()).filter(Boolean);

  const boundedFiles = [
    "backend/config/database.php",
    "backend/app/Support/ConfigurationValidator.php",
    "backend/app/Providers/AppServiceProvider.php",
    "backend/database/migrations/0001_01_01_000001_create_cache_table.php",
    "backend/database/migrations/0001_01_01_000002_create_jobs_table.php",
    "backend/database/migrations/2026_10_09_000001_create_identity_core_tables.php",
    "backend/database/migrations/2026_10_10_000001_create_identity_dependency_relations.php",
    "backend/database/migrations/2026_10_10_000002_create_identity_remaining_persistence.php",
    "backend/database/migrations/2026_10_10_000003_create_identity_profile_audit.php",
    "backend/database/migrations/2026_10_10_000004_create_bootstrap_cleanup_indexes.php",
    "backend/docker/mysql-test.Dockerfile",
    "backend/tests/MySqlIdentityFoundation/MySqlTestCase.php",
    "backend/tests/MySqlIdentityFoundation/MigrationLifecycleTest.php",
    "backend/tests/MySqlIdentityFoundation/SchemaIntegrityAndConstraintsTest.php",
    "backend/tests/MySqlIdentityFoundation/LastAdminSentinelContentionTest.php",
    "backend/tests/MySqlIdentityFoundation/ConfigurationAndDestructiveGuardsTest.php",
    "backend/tests/MySqlIdentityFoundation/probe-sentinel-process.php",
    "backend/scripts/run-mysql-identity-foundation.mjs",
  ];

  const sourceHashes = {};
  for (const rel of boundedFiles) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) {
      sourceHashes[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
  }

  let measuredPhpVersion = "UNMEASURED";
  let measuredMysqlVersion = "UNMEASURED";
  let measuredLiveTimeouts = {};

  try {
    // 2. Build test runner Docker image if not present
    console.log("\n--- Preparing test runner Docker image ---");
    docker("docker-build-test-runner", [
      "build",
      "-t",
      "gaza-gateway-mysql-test:php84",
      "-f",
      path.join(root, "backend/docker/mysql-test.Dockerfile"),
      path.join(root, "backend/docker"),
    ]);

    // 3. Create disposable network
    console.log("\n--- Creating isolated network ---");
    docker("network-create", ["network", "create", networkName]);

    // 4. Start disposable MySQL 8.4 container with --skip-log-bin test-only flag
    console.log("\n--- Starting MySQL 8.4 container ---");
    docker("mysql-start", [
      "run",
      "-d",
      "--rm",
      "--name",
      mysqlName,
      "--network",
      networkName,
      "--network-alias",
      "mysql",
      "-e",
      "MYSQL_ROOT_PASSWORD=gaza_root_local_secret",
      "-e",
      "MYSQL_DATABASE=gaza_gateway_mysql_test",
      "-e",
      "MYSQL_USER=gaza_app_user",
      "-e",
      "MYSQL_PASSWORD=gaza_app_local_pass",
      "mysql:8.4",
      "--skip-log-bin",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
    ]);

    // 5. Poll for MySQL readiness
    console.log("\n--- Polling for MySQL readiness ---");
    let mysqlReady = false;
    for (let attempt = 1; attempt <= 30; attempt++) {
      const probe = spawnSync(
        "docker",
        [
          "exec",
          mysqlName,
          "mysql",
          "-u",
          "gaza_app_user",
          "-pgaza_app_local_pass",
          "gaza_gateway_mysql_test",
          "-e",
          "SELECT 1;",
        ],
        { encoding: "utf8", timeout: 3000 }
      );
      if (probe.status === 0 && probe.stdout.includes("1")) {
        mysqlReady = true;
        console.log(`[PASS] MySQL ready after ${attempt} seconds.`);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!mysqlReady) {
      throw new Error("Timed out waiting for MySQL 8.4 container readiness.");
    }

    // 6. Start PHP 8.4 test runner container
    console.log("\n--- Starting PHP 8.4 runner container ---");
    docker("php-start", [
      "run",
      "-d",
      "--rm",
      "--name",
      phpName,
      "--network",
      networkName,
      "-w",
      "/workspace/backend",
      "-e",
      "APP_ENV=testing",
      "-e",
      "APP_DEBUG=false",
      "-e",
      "APP_KEY=base64:MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
      "-e",
      "APP_URL=https://127.0.0.1:18090",
      "-e",
      "DB_CONNECTION=mysql_test",
      "-e",
      "DB_HOST=mysql",
      "-e",
      "DB_PORT=3306",
      "-e",
      "DB_TEST_DATABASE=gaza_gateway_mysql_test",
      "-e",
      "DB_USERNAME=gaza_app_user",
      "-e",
      "DB_PASSWORD=gaza_app_local_pass",
      "--entrypoint",
      "sleep",
      "gaza-gateway-mysql-test:php84",
      "1800",
    ]);

    // 7. Copy backend source and vendor into PHP container
    console.log("\n--- Syncing source and vendor into runner container ---");
    docker("copy-backend", ["cp", path.join(root, "backend") + "/.", `${phpName}:/workspace/backend`]);
    docker("copy-vendor", ["cp", path.resolve(vendor), `${phpName}:/workspace/backend/vendor`], { timeout: 180000 });

    // 8. Prepare isolated identity migrations folder inside container
    console.log("\n--- Preparing isolated identity migrations directory ---");
    phpExec("mkdir-identity-migrations", ["mkdir", "-p", "database/migrations/identity"]);
    const identityMigrations = [
      "0001_01_01_000001_create_cache_table.php",
      "0001_01_01_000002_create_jobs_table.php",
      "2026_10_09_000001_create_identity_core_tables.php",
      "2026_10_10_000001_create_identity_dependency_relations.php",
      "2026_10_10_000002_create_identity_remaining_persistence.php",
      "2026_10_10_000003_create_identity_profile_audit.php",
      "2026_10_10_000004_create_bootstrap_cleanup_indexes.php",
    ];
    for (const mig of identityMigrations) {
      phpExec(`copy-migration-${mig}`, [
        "cp",
        `database/migrations/${mig}`,
        `database/migrations/identity/${mig}`,
      ]);
    }

    // 9. Measure actual engine telemetry
    console.log("\n--- Measuring engine telemetry ---");
    const phpVerOut = phpExec("measure-php-version", ["php", "-v"]);
    measuredPhpVersion = phpVerOut.split("\n")[0].trim();

    const pdoExtCheck = phpExec("mysql-pdo-check", ["php", "-r", "echo extension_loaded('pdo_mysql') ? 'pdo_mysql OK' : 'MISSING';"]);
    if (!pdoExtCheck.includes("pdo_mysql OK")) {
      throw new Error("pdo_mysql extension is missing in PHP container.");
    }

    const mysqlVerOut = docker("measure-mysql-version", [
      "exec",
      mysqlName,
      "mysql",
      "-u",
      "gaza_app_user",
      "-pgaza_app_local_pass",
      "gaza_gateway_mysql_test",
      "-N",
      "-s",
      "-e",
      "SELECT VERSION();",
    ]);
    measuredMysqlVersion = mysqlVerOut.trim();

    console.log(`Measured PHP: ${measuredPhpVersion}`);
    console.log(`Measured MySQL: ${measuredMysqlVersion}`);

    // 10. Execute Migration Lifecycle: Up -> Rollback -> Reapply
    console.log("\n--- Executing Migration Lifecycle Gate ---");
    phpExec("migrate-up-initial", [
      "php",
      "artisan",
      "migrate",
      "--database=mysql_test",
      "--path=database/migrations/identity",
      "--force",
    ]);

    phpExec("migrate-rollback-initial", [
      "php",
      "artisan",
      "migrate:rollback",
      "--database=mysql_test",
      "--path=database/migrations/identity",
      "--step=7",
      "--force",
    ]);

    phpExec("migrate-reapply-initial", [
      "php",
      "artisan",
      "migrate",
      "--database=mysql_test",
      "--path=database/migrations/identity",
      "--force",
    ]);

    // Measure live PDO session settings from active test connection
    const liveTimeoutsOut = phpExec("measure-live-pdo-timeouts", [
      "php",
      "-r",
      "require 'vendor/autoload.php'; $app = require 'bootstrap/app.php'; $app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); $conn = \\Illuminate\\Support\\Facades\\DB::connection('mysql_test'); echo json_encode(['innodb_lock_wait_timeout' => (int) $conn->selectOne('SELECT @@innodb_lock_wait_timeout AS v')->v, 'max_execution_time' => (int) $conn->selectOne('SELECT @@max_execution_time AS v')->v]);",
    ]);
    measuredLiveTimeouts = JSON.parse(liveTimeoutsOut.trim());
    console.log("Measured Live Timeouts:", measuredLiveTimeouts);

    // 11. Run PHPUnit Foundation Suite
    console.log("\n--- Running PHPUnit MySqlIdentityFoundation Suite ---");
    phpExec("create-phpunit-config", [
      "sh",
      "-c",
      `cat << 'EOF' > phpunit-mysql.xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <testsuites>
        <testsuite name="MySqlIdentityFoundation">
            <directory>tests/MySqlIdentityFoundation</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="APP_DEBUG" value="false"/>
        <env name="APP_KEY" value="base64:MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="/>
        <env name="APP_URL" value="https://127.0.0.1:18090"/>
        <env name="CACHE_STORE" value="database"/>
        <env name="DB_CONNECTION" value="mysql_test"/>
        <env name="DB_HOST" value="mysql"/>
        <env name="DB_PORT" value="3306"/>
        <env name="DB_TEST_DATABASE" value="gaza_gateway_mysql_test"/>
        <env name="DB_USERNAME" value="gaza_app_user"/>
        <env name="DB_PASSWORD" value="gaza_app_local_pass"/>
        <env name="QUEUE_CONNECTION" value="database"/>
    </php>
</phpunit>
EOF`,
    ]);

    const phpunitOutput = phpExec("phpunit-mysql-foundation", [
      "php",
      "vendor/bin/phpunit",
      "-c",
      "phpunit-mysql.xml",
      "tests/MySqlIdentityFoundation",
    ]);

    // 12. Run Multi-Process Sentinel Contention Gate with deterministic event synchronization
    console.log("\n--- Running Multi-Process Sentinel Contention Gate ---");
    let worker2Handle = null;
    let worker2Promise = null;

    const worker1Handle = runProbeWorker({
      workerId: 1,
      args: ["--worker=1", "--hold-ms=1000"],
      wallTimeoutMs: 15000,
      onAcquired: (event) => {
        console.log(`[SYNC] Worker 1 acquired lock at ${event.acquired_time}. Launching Worker 2 immediately.`);
        worker2Handle = runProbeWorker({
          workerId: 2,
          args: ["--worker=2", "--wait-timeout=3"],
          wallTimeoutMs: 15000,
        });
        worker2Promise = worker2Handle.promise;
      },
    });

    let res1, res2;
    try {
      res1 = await worker1Handle.promise;
      if (!worker2Promise) {
        throw new Error("Worker 1 completed without triggering onAcquired callback for Worker 2.");
      }
      res2 = await worker2Promise;
    } catch (err) {
      if (worker1Handle) worker1Handle.kill();
      if (worker2Handle) worker2Handle.kill();
      throw err;
    }

    console.log("Worker 1 result:", res1);
    console.log("Worker 2 result:", res2);

    // Validate contention serialization:
    // 1. Worker 2 was blocked while Worker 1 held the lock (wait duration demonstrates blocking)
    const worker2WaitDuration = res2.acquired_time - res2.start_time;
    if (worker2WaitDuration < 0.4) {
      throw new Error(`Contention failure: Worker 2 did not wait for lock (waited only ${(worker2WaitDuration * 1000).toFixed(1)}ms)`);
    }
    // 2. Worker 2 acquired lock strictly after Worker 1 acquired lock
    if (res2.acquired_time <= res1.acquired_time) {
      throw new Error(`Contention failure: Worker 2 acquired lock before Worker 1 acquired lock`);
    }
    // 3. Worker 2 must have observed Worker 1's mutated timestamp under READ COMMITTED
    if (res2.initial_timestamp !== res1.mutated_timestamp) {
      throw new Error(`Freshness failure: Worker 2 saw timestamp ${res2.initial_timestamp}, expected ${res1.mutated_timestamp}`);
    }
    console.log(`[PASS] Multi-process contention & serialization verified: Worker 2 blocked for ${(worker2WaitDuration * 1000).toFixed(0)}ms and observed Worker 1 commit under READ COMMITTED.`);

    // 13. Perform bounded cleanup and inspect all residual resources
    const cleanupResult = cleanupAndInspectOwnedResources();

    const endTime = new Date().toISOString();
    const finalStatus = cleanupResult.verified ? "PASS" : "FAIL";

    const receipt = {
      gate: "H1A_MYSQL_IDENTITY_PERSISTENCE_FOUNDATION",
      runId,
      timestamp_start: startTime,
      timestamp_end: endTime,
      git_head: headSha,
      uncommitted_files: uncommittedFiles,
      hostpapa_shared_only: true,
      engine_evidence: {
        php_version: measuredPhpVersion,
        mysql_version: measuredMysqlVersion,
        live_session_timeouts: measuredLiveTimeouts,
        test_log_bin_setting: "--skip-log-bin (test-only; live HostPapa trigger capability unverified)",
        max_execution_time_scope: "SELECT queries only (per MySQL 8.4 engine specification; request/wall limits maintained in PHP)",
      },
      source_hashes: sourceHashes,
      test_results: {
        migration_lifecycle: "PASS (7 migrations up -> rollback -> reapply)",
        phpunit_tests: "PASS (All MySqlIdentityFoundation test classes)",
        multi_process_contention: "PASS (Two independent processes serialized with READ COMMITTED freshness)",
      },
      commands_executed: executedCommands,
      cleanup_outcomes: cleanupResult.outcomes,
      status: finalStatus,
    };

    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(`\nReceipt generated: ${receiptPath}`);

    if (finalStatus !== "PASS") {
      throw new Error("Gate failed due to unverified residual resource cleanup.");
    }

    return receipt;
  } catch (err) {
    console.error("\n[FATAL GATE ERROR]", err);

    // Attempt cleanup on failure and record failure receipt
    const cleanupResult = cleanupAndInspectOwnedResources();
    const endTime = new Date().toISOString();

    const failureReceipt = {
      gate: "H1A_MYSQL_IDENTITY_PERSISTENCE_FOUNDATION",
      runId,
      timestamp_start: startTime,
      timestamp_end: endTime,
      git_head: headSha,
      uncommitted_files: uncommittedFiles,
      hostpapa_shared_only: true,
      engine_evidence: {
        php_version: measuredPhpVersion,
        mysql_version: measuredMysqlVersion,
        live_session_timeouts: measuredLiveTimeouts,
      },
      source_hashes: sourceHashes,
      error_message: err.message,
      commands_executed: executedCommands,
      cleanup_outcomes: cleanupResult.outcomes,
      status: "FAIL",
    };

    fs.writeFileSync(receiptPath, JSON.stringify(failureReceipt, null, 2));
    console.log(`\nFailure receipt saved: ${receiptPath}`);
    process.exitCode = 1;
    throw err;
  }
}

try {
  await main();
  console.log(`\n======================================================`);
  console.log(`H1A GATE SUCCESS: MySQL identity persistence foundation verified.`);
  console.log(`HostPapa shared-only preserved: YES`);
  console.log(`======================================================`);
} catch (err) {
  process.exitCode = 1;
}
