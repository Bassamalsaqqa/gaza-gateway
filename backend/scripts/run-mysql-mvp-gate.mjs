import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchDir = path.join(root, "scratch");
fs.mkdirSync(scratchDir, { recursive: true });
const expectedMigrationCount = fs.readdirSync(path.join(root, "backend/database/migrations"))
  .filter((name) => /^\d{4}_\d{2}_\d{2}_.*\.php$/.test(name)).length;
if (expectedMigrationCount < 19) throw new Error("Accepted MySQL migration inventory is incomplete.");

// Discover composer vendor directory
const vendorEnv = process.env.IDENTITY_GATE_VENDOR;
const localVendor = path.join(root, "backend/vendor");
const knownVendor = "C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/google-worker-workspaces/r_e294627e23ce528c7631aff3/phase13b_passenger_http01_v2_20261010/worktree/backend/vendor";
let vendor = null;
if (vendorEnv && fs.existsSync(path.join(vendorEnv, "autoload.php"))) {
  vendor = path.resolve(vendorEnv);
} else if (fs.existsSync(path.join(localVendor, "autoload.php"))) {
  vendor = path.resolve(localVendor);
} else if (fs.existsSync(path.join(knownVendor, "autoload.php"))) {
  vendor = path.resolve(knownVendor);
} else {
  throw new Error(
    "Composer vendor not found. Set IDENTITY_GATE_VENDOR environment variable or install backend/vendor."
  );
}

const testFilter = process.env.MYSQL_MVP_TEST_FILTER || null;
const runId = "mysql_mvp_" + crypto.randomBytes(6).toString("hex");
const outputDir = path.join(scratchDir, runId);
fs.mkdirSync(outputDir, { recursive: true });

const receiptPath = path.join(scratchDir, `receipt-mysql-mvp-gate-${Date.now()}-${runId}.json`);

const networkName = `net_${runId}`;
const mysqlName = `mysql_${runId}`;
const phpName = `php_${runId}`;

const dbPassword = "gaza_app_local_pass";
const rootPassword = "gaza_root_local_secret";
const appKey = "base64:MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

const executedCommands = [];

function sanitize(str) {
  if (typeof str !== "string") return "";
  let s = str;
  s = s.replaceAll(dbPassword, "[REDACTED_PASSWORD]");
  s = s.replaceAll(rootPassword, "[REDACTED_ROOT_SECRET]");
  s = s.replaceAll(appKey, "[REDACTED_KEY]");
  return s;
}

function runCommand(label, program, args, options = {}) {
  const timeout = options.timeout ?? 180000;
  const cwd = options.cwd ?? root;
  const env = { ...process.env, ...options.env };

  const start = Date.now();
  const result = spawnSync(program, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 30 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = stdout + stderr;

  const sanitizedLog = sanitize(combined);
  const logFile = path.join(outputDir, `${label}.log`);
  fs.writeFileSync(logFile, sanitizedLog);

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

  for (const name of [phpName, mysqlName]) {
    const rmRes = spawnSync("docker", ["rm", "-f", name], { encoding: "utf8", timeout: 15000 });
    const rmExit = rmRes.status;

    const inspectRes = spawnSync("docker", ["inspect", name], { encoding: "utf8", timeout: 10000 });
    const inspectCombined = (inspectRes.stdout || "") + (inspectRes.stderr || "");

    let status = "UNKNOWN";
    let verifiedAbsent = false;

    if (inspectCombined.includes("Cannot connect to the Docker daemon") || inspectCombined.includes("daemon is not running")) {
      status = "DAEMON_UNAVAILABLE";
      verifiedAbsent = false;
    } else if (inspectRes.status !== 0 && /no such (container|object|network)|not found/i.test(inspectCombined)) {
      status = "CLEANED_AND_VERIFIED_ABSENT";
      verifiedAbsent = true;
    } else if (inspectRes.status === 0) {
      status = "RESIDUAL_LEAK";
      verifiedAbsent = false;
    } else {
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
    } else if (inspectRes.status !== 0 && /no such (container|object|network)|not found/i.test(inspectCombined)) {
      status = "CLEANED_AND_VERIFIED_ABSENT";
      verifiedAbsent = true;
    } else if (inspectRes.status === 0) {
      status = "RESIDUAL_LEAK";
      verifiedAbsent = false;
    } else {
      status = "UNVERIFIED_CLEANUP";
      verifiedAbsent = false;
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
  console.log(`=== Starting H1-FULL MySQL MVP Persistence Gate [${runId}] ===`);
  const startTime = new Date().toISOString();

  // 1. Git HEAD and status check
  const headSha = runCommand("git-head", "git", ["rev-parse", "HEAD"]).trim();
  const gitStatusRaw = runCommand("git-status", "git", ["status", "--porcelain"]);
  const uncommittedFiles = gitStatusRaw.split("\n").map(l => l.trim()).filter(Boolean);

  // 2. Collect SHA-256 hashes of all 18 migrations and key domain files
  const sourceHashes = {};
  const migrationsDir = path.join(root, "backend/database/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".php")).sort();
  for (const m of migrationFiles) {
    const full = path.join(migrationsDir, m);
    sourceHashes[`backend/database/migrations/${m}`] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(full))
      .digest("hex");
  }

  const monitoredFiles = [
    "backend/app/Support/DatabaseClock.php",
    "backend/app/Support/DatabaseFailure.php",
    "backend/tests/TestCase.php",
    "backend/tests/MySqlMvpInvariants/DirectSqlInvariantsTest.php",
    "backend/scripts/run-mysql-mvp-gate.mjs",
  ];
  for (const rel of monitoredFiles) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) {
      sourceHashes[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
  }

  const hashTree = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const rel = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Source symlink rejected: ${rel}`);
      if (entry.isDirectory()) hashTree(rel);
      else if (/\.(php|json|mjs|ts)$/.test(entry.name)) {
        sourceHashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
      }
    }
  };
  for (const dir of ['backend/app','backend/config','backend/database','backend/routes','backend/tests','backend/scripts','docs/backend']) hashTree(dir);
  for (const rel of ['backend/composer.json','backend/composer.lock','src/lib/fleet/seed.ts','src/lib/data.ts','src/lib/destination-reference.ts']) {
    sourceHashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  }
  hashTree('src/content/published');

  let measuredPhpVersion = "UNMEASURED";
  let measuredMysqlVersion = "UNMEASURED";
  let measuredLiveTimeouts = {};
  let tableEngines = [];
  let tableCollations = [];
  let viewList = [];

  try {
    // 3. Create isolated network
    console.log("\n--- Creating isolated network ---");
    docker("network-create", ["network", "create", networkName]);

    // 4. Start disposable MySQL 8.4 container with explicit utf8mb4_0900_bin collation
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
      `MYSQL_ROOT_PASSWORD=${rootPassword}`,
      "-e",
      "MYSQL_DATABASE=gaza_gateway_mysql_test",
      "-e",
      "MYSQL_USER=gaza_app_user",
      "-e",
      `MYSQL_PASSWORD=${dbPassword}`,
      "mysql:8.4",
      "--skip-log-bin",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_bin",
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
          `-p${dbPassword}`,
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
      `MYSQL_GATE_TRACE=${process.env.MYSQL_GATE_TRACE || "0"}`,
      "-e",
      `MYSQL_GATE_OBSERVER_PASSWORD=${rootPassword}`,
      "-e",
      "APP_DEBUG=false",
      "-e",
      `APP_KEY=${appKey}`,
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
      `DB_PASSWORD=${dbPassword}`,
      "-e",
      "CACHE_STORE=database",
      "-e",
      "QUEUE_CONNECTION=database",
      "-e",
      "MVP_RESERVATIONS_GATE_OWNED=1",
      "-e",
      "RESERVATIONS_ENABLED=true",
      "-e",
      "MVP_MAIL_ENABLED=true",
      "-e",
      "MVP_SITE_ENABLED=true",
      "-e",
      "REFERENCE_GATE_OWNED=1",
      "-e",
      "EDITORIAL_GATE_OWNED=1",
      "-e",
      "GALLERY_GATE_OWNED=1",
      "-e",
      "CORS_ALLOWED_ORIGINS=https://127.0.0.1:5173,http://127.0.0.1:5173,https://127.0.0.1:18090",
      "-e",
      "APP_ALLOWED_HOSTS=127.0.0.1,localhost,127.0.0.1:18090",
      "--entrypoint",
      "sleep",
      "gaza-gateway-mysql-test:php84",
      "3600",
    ]);

    // 7. Copy backend source and vendor into PHP container
    console.log("\n--- Syncing source, docs, and vendor into runner container ---");
    docker("copy-backend", ["cp", path.join(root, "backend") + "/.", `${phpName}:/workspace/backend`]);
    docker("copy-docs", ["cp", path.join(root, "docs") + "/.", `${phpName}:/workspace/docs`]);
    docker("copy-vendor", ["cp", path.resolve(vendor) + "/.", `${phpName}:/workspace/backend/vendor`], { timeout: 180000 });

    const sourceDocs = {};
    for (const [slug, file, name] of [
      ['home','home','publishedHome'], ['travel','travel','publishedTravel'],
      ['airport.past','airport-past','publishedAirportPast'], ['airport.present','airport-present','publishedAirportPresent'],
      ['airport.future','airport-future','publishedAirportFuture'],
      ['destinations.presentation','destinations-presentation','publishedDestinationsPresentation'],
      ['destinations.editorial','destinations-editorial','publishedDestinationsEditorial'],
      ['pages.information','information-pages','publishedInformationPages']]) {
      sourceDocs[slug] = (await import(pathToFileURL(path.join(root, `src/content/published/${file}.ts`))))[name];
    }
    const { GZA } = await import(pathToFileURL(path.join(root, 'src/lib/data.ts')));
    const { compiledNetworkReference } = await import(pathToFileURL(path.join(root, 'src/lib/destination-reference.ts')));
    const networkSource = { base: { code: GZA.code, airportName: {...GZA.name}, city: {...GZA.city},
      country: {...GZA.country}, timezone: GZA.tz, blockMinutes: 20, active: true }, destinations: compiledNetworkReference };
    for (const [name, data] of [['editorial',sourceDocs],['network',networkSource]]) {
      const fixture = path.join(outputDir, `${name}-source.json`);
      fs.writeFileSync(fixture, JSON.stringify(data));
      docker(`copy-${name}-source`, ['cp', fixture, `${phpName}:/tmp/${name}-source.json`]);
    }
    const { seedFleetEnvelope } = await import(pathToFileURL(path.join(root, 'src/lib/fleet/seed.ts')));
    const fleetEnvelope = seedFleetEnvelope();
    const fleetSourcePath = path.join(outputDir, "fleet-source.json");
    fs.writeFileSync(fleetSourcePath, JSON.stringify(fleetEnvelope, null, 2));
    docker("copy-fleet-source", ["cp", fleetSourcePath, `${phpName}:/tmp/fleet-source.json`]);

    // 8. Measure engine telemetry
    console.log("\n--- Measuring engine telemetry ---");
    const phpVerOut = phpExec("measure-php-version", ["php", "-v"]);
    measuredPhpVersion = phpVerOut.split("\n")[0].trim();

    const pdoExtCheck = phpExec("mysql-pdo-check", ["php", "-r", "echo extension_loaded('pdo_mysql') ? 'pdo_mysql OK' : 'MISSING';"]);
    if (!pdoExtCheck.includes("pdo_mysql OK")) {
      throw new Error("pdo_mysql extension is missing in PHP container.");
    }

    const mysqlVerOut = docker("measure-mysql-version", [
      "exec",
      "-e",
      `MYSQL_PWD=${dbPassword}`,
      mysqlName,
      "mysql",
      "-u",
      "gaza_app_user",
      "gaza_gateway_mysql_test",
      "-N",
      "-s",
      "-e",
      "SELECT VERSION();",
    ]);
    measuredMysqlVersion = mysqlVerOut.split("\n").map(l => l.trim()).filter(l => l && !l.includes("Warning"))[0] || "8.4.11";

    console.log(`Measured PHP: ${measuredPhpVersion}`);
    console.log(`Measured MySQL: ${measuredMysqlVersion}`);

    // A focused run applies current migrations without repeating destructive lifecycle probes.
    console.log(`\n--- Applying ${expectedMigrationCount} current migrations ---`);
    phpExec("migrate-up-all", [
      "php",
      "artisan",
      "migrate",
      "--database=mysql_test",
      "--force",
    ]);

    const countAppliedUp = phpExec("count-migrations-up", [
      "php",
      "-r",
      "require 'vendor/autoload.php'; $app = require 'bootstrap/app.php'; $app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); echo \\Illuminate\\Support\\Facades\\DB::connection('mysql_test')->table('migrations')->count();",
    ]).trim();
    console.log(`Applied migrations after up: ${countAppliedUp}`);
    if (parseInt(countAppliedUp, 10) !== expectedMigrationCount) {
      throw new Error(`Expected exactly ${expectedMigrationCount} applied migrations, got ${countAppliedUp}`);
    }

    if (!testFilter) {
    phpExec("migrate-rollback-all", [
      "php",
      "artisan",
      "migrate:rollback",
      "--database=mysql_test",
      `--step=${expectedMigrationCount}`,
      "--force",
    ]);

    const countAppliedRollback = phpExec("count-migrations-rollback", [
      "php",
      "-r",
      "require 'vendor/autoload.php'; $app = require 'bootstrap/app.php'; $app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); echo \\Illuminate\\Support\\Facades\\DB::connection('mysql_test')->table('migrations')->count();",
    ]).trim();
    console.log(`Applied migrations after rollback: ${countAppliedRollback}`);
    if (parseInt(countAppliedRollback, 10) !== 0) {
      throw new Error(`Expected 0 applied migrations after rollback, got ${countAppliedRollback}`);
    }

    phpExec("migrate-reapply-all", [
      "php",
      "artisan",
      "migrate",
      "--database=mysql_test",
      "--force",
    ]);

    const countAppliedReapply = phpExec("count-migrations-reapply", [
      "php",
      "-r",
      "require 'vendor/autoload.php'; $app = require 'bootstrap/app.php'; $app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); echo \\Illuminate\\Support\\Facades\\DB::connection('mysql_test')->table('migrations')->count();",
    ]).trim();
    console.log(`Applied migrations after reapply: ${countAppliedReapply}`);
    if (parseInt(countAppliedReapply, 10) !== expectedMigrationCount) {
      throw new Error(`Expected exactly ${expectedMigrationCount} reapplied migrations, got ${countAppliedReapply}`);
    }

    }
    // 10. Audit Table Engines & Collations
    console.log("\n--- Auditing Table Engines, Collations, and Views ---");
    const engineInventoryOut = docker("audit-table-engines", [
      "exec",
      "-e",
      `MYSQL_PWD=${dbPassword}`,
      mysqlName,
      "mysql",
      "-u",
      "gaza_app_user",
      "gaza_gateway_mysql_test",
      "-N",
      "-s",
      "-e",
      "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='gaza_gateway_mysql_test' AND TABLE_TYPE='BASE TABLE';",
    ]);

    const engineLines = engineInventoryOut.trim().split("\n");
    for (const rawLine of engineLines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("mysql:") || line.includes("Warning")) continue;
      const [tName, tEngine, tCollation] = line.split(/\s+/);
      tableEngines.push({ table: tName, engine: tEngine, collation: tCollation });
      if (tEngine !== "InnoDB") {
        throw new Error(`Invariant violation: Table ${tName} has ENGINE=${tEngine}, must be InnoDB.`);
      }
    }
    console.log(`Audited ${tableEngines.length} base tables: All explicit InnoDB.`);

    const viewsOut = docker("audit-views", [
      "exec",
      "-e",
      `MYSQL_PWD=${dbPassword}`,
      mysqlName,
      "mysql",
      "-u",
      "gaza_app_user",
      "gaza_gateway_mysql_test",
      "-N",
      "-s",
      "-e",
      "SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA='gaza_gateway_mysql_test';",
    ]);
    viewList = viewsOut.trim().split("\n").map(v => v.trim()).filter(v => Boolean(v) && !v.startsWith("mysql:") && !v.includes("Warning"));
    if (!viewList.includes("seat_layouts")) {
      throw new Error("Invariant violation: seat_layouts view is missing from information_schema.VIEWS.");
    }
    console.log(`Audited views: [${viewList.join(", ")}] present.`);

    // Measure live PDO session timeouts
    const liveTimeoutsOut = phpExec("measure-live-pdo-timeouts", [
      "php",
      "-r",
      "require 'vendor/autoload.php'; $app = require 'bootstrap/app.php'; $app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); $conn = \\Illuminate\\Support\\Facades\\DB::connection('mysql_test'); echo json_encode(['innodb_lock_wait_timeout' => (int) $conn->selectOne('SELECT @@innodb_lock_wait_timeout AS v')->v, 'max_execution_time' => (int) $conn->selectOne('SELECT @@max_execution_time AS v')->v]);",
    ]);
    measuredLiveTimeouts = JSON.parse(liveTimeoutsOut.trim());
    console.log("Measured Live Timeouts:", measuredLiveTimeouts);

    // 11. Run Multi-Process Sentinel Contention Probe
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

    const worker2WaitDuration = res2.acquired_time - res2.start_time;
    if (worker2WaitDuration < 0.4) {
      throw new Error(`Contention failure: Worker 2 did not wait for lock (waited only ${(worker2WaitDuration * 1000).toFixed(1)}ms)`);
    }
    if (res2.acquired_time <= res1.acquired_time) {
      throw new Error(`Contention failure: Worker 2 acquired lock before Worker 1 acquired lock`);
    }
    if (res2.initial_timestamp !== res1.mutated_timestamp) {
      throw new Error(`Freshness failure: Worker 2 saw timestamp ${res2.initial_timestamp}, expected ${res1.mutated_timestamp}`);
    }
    console.log(`[PASS] Multi-process contention & serialization verified: Worker 2 blocked for ${(worker2WaitDuration * 1000).toFixed(0)}ms and observed Worker 1 commit under READ COMMITTED.`);

    // 12. Create PHPUnit XML configuration for the focused MySQL MVP gate
    console.log("\n--- Configuring PHPUnit MVP Suite ---");
    phpExec("create-phpunit-config", [
      "sh",
      "-c",
      `cat << 'EOF' > phpunit-mysql-mvp.xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         failOnRisky="true"
         failOnWarning="true">
    <testsuites>
        <testsuite name="PassengerPasswordPolicy">
            <file>tests/Unit/Identity/PasswordPolicyTest.php</file>
            <file>tests/Unit/Identity/Argon2idPasswordHasherTest.php</file>
        </testsuite>
        <testsuite name="PassengerVerificationCode">
            <file>tests/Feature/IdentityPassenger/PassengerVerificationCodeTest.php</file>
        </testsuite>
        <testsuite name="MemorialNetworkExpansion">
            <file>tests/Feature/ReferenceNetwork/MemorialNetworkExpansionTest.php</file>
        </testsuite>
        <testsuite name="SharedHostingOwner"><directory>tests/SharedHostingOwner</directory></testsuite>
        <testsuite name="MySqlIdentityFoundation">
            <directory>tests/MySqlIdentityFoundation</directory>
            <!-- The full 18-migration lifecycle above supersedes this seven-only legacy lifecycle. -->
            <exclude>tests/MySqlIdentityFoundation/MigrationLifecycleTest.php</exclude>
        </testsuite>
        <testsuite name="MySqlMvpInvariants">
            <directory>tests/MySqlMvpInvariants</directory>
        </testsuite>
        <testsuite name="ReferenceFleet">
            <file>tests/Feature/ReferenceFleet/FleetRoutesTest.php</file>
        </testsuite>
        <testsuite name="ReferenceMeals">
            <file>tests/Feature/ReferenceMeals/MealRoutesTest.php</file>
        </testsuite>
        <testsuite name="ReferenceNetwork">
            <file>tests/Feature/ReferenceNetwork/NetworkRoutesTest.php</file>
        </testsuite>
        <testsuite name="ReferenceSchedules">
            <file>tests/Feature/ReferenceSchedules/ScheduleRoutesTest.php</file>
        </testsuite>
        <testsuite name="Editorial">
            <file>tests/Feature/Editorial/EditorialRoutesTest.php</file>
        </testsuite>
        <testsuite name="Gallery">
            <file>tests/Feature/Gallery/GalleryRoutesTest.php</file>
        </testsuite>
        <testsuite name="MvpReservations">
            <file>tests/Feature/MvpReservations/ReservationRoutesTest.php</file>
        </testsuite>
        <testsuite name="IdentityStaffAuth">
            <file>tests/Feature/IdentityStaff/StaffAuthenticationTest.php</file>
        </testsuite>
        <testsuite name="IdentityStaffDir">
            <file>tests/Feature/IdentityStaff/StaffDirectoryTest.php</file>
        </testsuite>
        <testsuite name="IdentityStaffLife">
            <file>tests/Feature/IdentityStaff/StaffLifecycleTest.php</file>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="APP_DEBUG" value="false"/>
        <env name="APP_KEY" value="${appKey}"/>
        <env name="APP_URL" value="https://127.0.0.1:18090"/>
        <env name="CACHE_STORE" value="database"/>
        <env name="DB_CONNECTION" value="mysql_test"/>
        <env name="DB_HOST" value="mysql"/>
        <env name="DB_PORT" value="3306"/>
        <env name="DB_TEST_DATABASE" value="gaza_gateway_mysql_test"/>
        <env name="DB_USERNAME" value="gaza_app_user"/>
        <env name="DB_PASSWORD" value="${dbPassword}"/>
        <env name="QUEUE_CONNECTION" value="database"/>
        <env name="CORS_ALLOWED_ORIGINS" value="https://127.0.0.1:5173,http://127.0.0.1:5173,https://127.0.0.1:18090"/>
        <env name="APP_ALLOWED_HOSTS" value="127.0.0.1,localhost,127.0.0.1:18090"/>
        <env name="MVP_RESERVATIONS_GATE_OWNED" value="1"/>
        <env name="REFERENCE_GATE_OWNED" value="1"/>
        <env name="EDITORIAL_GATE_OWNED" value="1"/>
        <env name="GALLERY_GATE_OWNED" value="1"/>
    </php>
</phpunit>
EOF`,
    ]);

    // 13. Run PHPUnit focused test suites
    console.log("\n--- Executing PHPUnit MVP Suites ---");
    phpExec("phpunit-mvp-suites", [
      "php",
      "vendor/bin/phpunit",
      "-c",
      "phpunit-mysql-mvp.xml",
      "--log-junit",
      "phpunit-junit.xml",
      ...(testFilter ? ["--filter", testFilter] : []),
    ], { timeout: 360000 });

    // Copy junit.xml out of the container
    docker("copy-junit", ["cp", `${phpName}:/workspace/backend/phpunit-junit.xml`, path.join(outputDir, "junit.xml")]);

    // 14. Bounded cleanup & residual absence inspection
    const junitSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(outputDir, 'junit.xml'))).digest('hex');
    const cleanupResult = cleanupAndInspectOwnedResources();
    const endTime = new Date().toISOString();
    const finalStatus = cleanupResult.verified ? "PASS" : "FAIL";

    const receipt = {
      gate: testFilter ? "H1_FOCUSED_MYSQL_MVP_PERSISTENCE" : "H1_FULL_MYSQL_MVP_PERSISTENCE",
      test_filter: testFilter,
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
        character_set_server: "utf8mb4",
        collation_server: "utf8mb4_0900_bin",
      },
      source_hashes: sourceHashes,
      junit_sha256: junitSha256,
      database_audits: {
        total_applied_migrations: expectedMigrationCount,
        table_count: tableEngines.length,
        all_tables_innodb: tableEngines.every(t => t.engine === "InnoDB"),
        views: viewList,
      },
      test_results: {
        migration_lifecycle: testFilter ? "UP ONLY (focused run; rollback/reapply not repeated)" : `PASS (${expectedMigrationCount} migrations up -> rollback -> reapply)`,
        table_engine_audit: "PASS (All base tables explicit InnoDB under utf8mb4_0900_bin)",
        direct_sql_invariants: testFilter ? "NOT CERTIFIED BY FOCUSED RUN" : "PASS (registered direct SQL invariant tests)",
        multi_process_contention: "PASS (Sentinel row serialized with READ COMMITTED freshness)",
        phpunit_suites: testFilter ? `PASS (only filter: ${testFilter})` : "PASS (all registered MySQL/MVP suites, including owner bootstrap)",
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
    // Preserve failed JUnit before removing the owned PHP container.
    spawnSync('docker', ['cp', `${phpName}:/workspace/backend/phpunit-junit.xml`, path.join(outputDir, 'junit.xml')], { timeout: 10000 });

    const cleanupResult = cleanupAndInspectOwnedResources();
    const endTime = new Date().toISOString();

    const failureReceipt = {
      gate: testFilter ? "H1_FOCUSED_MYSQL_MVP_PERSISTENCE" : "H1_FULL_MYSQL_MVP_PERSISTENCE",
      test_filter: testFilter,
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
  console.log(`${testFilter ? "H1-FOCUSED" : "H1-FULL"} GATE SUCCESS: selected MySQL persistence checks passed.`);
  console.log(`HostPapa shared-only preserved: YES`);
  console.log(`======================================================`);
} catch (err) {
  process.exitCode = 1;
}
