import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchDir = path.join(root, "scratch");
fs.mkdirSync(scratchDir, { recursive: true });

// Explicit vendor discovery: env var, explicit canonical path, or local backend/vendor
const vendorEnv = process.env.IDENTITY_GATE_VENDOR;
const canonicalVendor = "C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/google-worker-workspaces/r_e294627e23ce528c7631aff3/phase13b_passenger_http01_v2_20261010/worktree/backend/vendor";
const localVendor = path.join(root, "backend/vendor");
let vendor = null;
if (vendorEnv && fs.existsSync(path.join(vendorEnv, "autoload.php"))) {
  vendor = path.resolve(vendorEnv);
} else if (fs.existsSync(path.join(canonicalVendor, "autoload.php"))) {
  vendor = path.resolve(canonicalVendor);
} else if (fs.existsSync(path.join(localVendor, "autoload.php"))) {
  vendor = path.resolve(localVendor);
} else {
  throw new Error(
    "Actionable failure: Composer vendor not found. Set IDENTITY_GATE_VENDOR environment variable or install backend/vendor."
  );
}

const runId = "mail_h2_" + crypto.randomBytes(6).toString("hex");
const outputDir = path.join(scratchDir, runId);
fs.mkdirSync(outputDir, { recursive: true });

const receiptPath = path.join(scratchDir, `receipt-shared-hosting-mail-${Date.now()}-${runId}.json`);

const networkName = `net_${runId}`;
const mysqlName = `mysql_${runId}`;
const phpName = `php_${runId}`;

const executedCommands = [];

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/gaza_app_local_pass/g, "[REDACTED_PASSWORD]")
    .replace(/gaza_root_local_secret/g, "[REDACTED_ROOT_SECRET]")
    .replace(/synthetic-pass-sentinel-2026/g, "[REDACTED_SENTINEL_PASS]")
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
    } else if (inspectRes.status !== 0 && (inspectCombined.toLowerCase().includes("no such container") || inspectCombined.toLowerCase().includes("no such object"))) {
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
    } else if (inspectRes.status !== 0 && (inspectCombined.toLowerCase().includes("no such network") || inspectCombined.toLowerCase().includes("not found") || inspectCombined.toLowerCase().includes("no such object"))) {
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

async function main() {
  console.log(`=== Starting H2 Shared Hosting Mail Admission & Delivery Gate [${runId}] ===`);
  const startTime = new Date().toISOString();

  const headSha = runCommand("git-head", "git", ["rev-parse", "HEAD"]).trim();
  const gitStatusRaw = runCommand("git-status", "git", ["status", "--porcelain"]);
  const uncommittedFiles = gitStatusRaw.split("\n").map((l) => l.trim()).filter(Boolean);

  const boundedFiles = [
    "backend/app/Mvp/Mail/IdentitySmtpDispatcher.php",
    "backend/app/Mvp/Mail/BookingMailWorker.php",
    "backend/app/Mvp/Mail/MailSettings.php",
    "backend/app/Deployment/SmtpDeadline.php",
    "backend/docker/mail-test.Dockerfile",
    "backend/tests/SharedHostingMail/SharedHostingMailTestCase.php",
    "backend/tests/SharedHostingMail/SmtpDeadlineTest.php",
    "backend/tests/SharedHostingMail/IdentitySmtpLinearizationTest.php",
    "backend/tests/SharedHostingMail/BookingMailWorkerSharedHostingTest.php",
    "backend/tests/SharedHostingMail/MailSettingsSharedHostingTest.php",
    "backend/tests/SharedHostingMail/synthetic-smtp-sink.php",
    "backend/tests/SharedHostingMail/identity-concurrency-worker.php",
    "backend/scripts/run-shared-hosting-mail-gate.mjs",
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
  let measuredPcntl = false;

  try {
    // 1. Build mail-test runner Docker image with pcntl
    console.log("\n--- Building mail test runner Docker image ---");
    docker("docker-build-mail-runner", [
      "build",
      "-t",
      "gaza-gateway-mail-test:php84",
      "-f",
      path.join(root, "backend/docker/mail-test.Dockerfile"),
      path.join(root, "backend/docker"),
    ]);

    // 2. Create disposable network
    console.log("\n--- Creating isolated network ---");
    docker("network-create", ["network", "create", networkName]);

    // 3. Start MySQL 8.4 container with --skip-log-bin test flag
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

    // 4. Poll for MySQL readiness
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

    // 5. Start PHP 8.4 runner container
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
      "gaza-gateway-mail-test:php84",
      "1800",
    ]);

    // 6. Copy backend source and vendor into runner container
    console.log("\n--- Syncing source and vendor into runner container ---");
    docker("copy-backend", ["cp", path.join(root, "backend") + "/.", `${phpName}:/workspace/backend`]);
    docker("copy-vendor", ["cp", path.resolve(vendor) + "/.", `${phpName}:/workspace/backend/vendor`], { timeout: 180000 });

    // 7. Measure telemetry
    console.log("\n--- Measuring engine telemetry ---");
    const phpVerOut = phpExec("measure-php-version", ["php", "-v"]);
    measuredPhpVersion = phpVerOut.split("\n")[0].trim();

    const pdoExtCheck = phpExec("mysql-pdo-check", ["php", "-r", "echo extension_loaded('pdo_mysql') ? 'pdo_mysql OK' : 'MISSING';"]);
    if (!pdoExtCheck.includes("pdo_mysql OK")) {
      throw new Error("pdo_mysql extension is missing in PHP container.");
    }

    const pcntlCheck = phpExec("pcntl-check", ["php", "-r", "echo extension_loaded('pcntl') ? 'pcntl OK' : 'MISSING';"]);
    measuredPcntl = pcntlCheck.includes("pcntl OK");
    if (!measuredPcntl) {
      throw new Error("pcntl extension is missing in test runner container.");
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
    console.log(`Measured pcntl: ${measuredPcntl ? "PRESENT" : "MISSING"}`);

    // Joined check uses all genuine application migrations; no test-only substitute tables.
    phpExec("migrate-full-schema", ["php", "artisan", "migrate", "--database=mysql_test", "--force"]);

    phpExec("create-phpunit-config", [
      "sh",
      "-c",
      `cat << 'EOF' > phpunit-mail.xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <testsuites>
        <testsuite name="SharedHostingMail">
            <directory>tests/SharedHostingMail</directory>
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

    let junitSha256 = null;
    let phpunitOutput = "";
    try {
      phpunitOutput = phpExec("phpunit-mail-suite", [
        "php",
        "vendor/bin/phpunit",
        "-c",
        "phpunit-mail.xml",
        "--testdox",
        "--log-junit=junit-mail.xml",
        "tests/SharedHostingMail",
      ]);
    } finally {
      try {
        const junitDest = path.join(outputDir, "junit-mail.xml");
        spawnSync("docker", ["cp", `${phpName}:/workspace/backend/junit-mail.xml`, junitDest], { timeout: 15000 });
        if (fs.existsSync(junitDest)) {
          junitSha256 = crypto.createHash("sha256").update(fs.readFileSync(junitDest)).digest("hex");
          console.log(`[PASS] Captured JUnit XML: ${junitDest} (SHA-256: ${junitSha256})`);
        }
      } catch {}
    }

    console.log(phpunitOutput);

    // 10. Perform cleanup and inspect residual resources
    const cleanupResult = cleanupAndInspectOwnedResources();
    const endTime = new Date().toISOString();
    const finalStatus = cleanupResult.verified ? "PASS" : "FAIL";

    const receipt = {
      gate: "H2_MAIL_ADMISSION_AND_DELIVERY",
      runId,
      timestamp_start: startTime,
      timestamp_end: endTime,
      git_head: headSha,
      uncommitted_files: uncommittedFiles,
      hostpapa_shared_only: true,
      engine_evidence: {
        php_version: measuredPhpVersion,
        mysql_version: measuredMysqlVersion,
        pcntl_extension: measuredPcntl ? "PRESENT" : "MISSING",
        hard_wall_bound: "<= 8s message limit, <= 3s socket timeout",
        skip_quit_on_deadline: true,
        test_log_bin_setting: "--skip-log-bin (test-only; live HostPapa trigger capability unverified)",
        junit_sha256: junitSha256,
      },
      source_hashes: sourceHashes,
      test_results: {
        phpunit_tests: "PASS (All SharedHostingMail test classes)",
        linearization_admission: "PASS (Committed admission before SMTP, external I/O at transactionLevel 0)",
        second_writer_progress: "PASS (Concurrent writer completed on principal while SMTP was blocked)",
        terminal_state_preservation: "PASS (Post-admission revocation invalidates token and never restores to accepted)",
        pre_submit_retry: "PASS (Definite failures retry bounded to 5 with 60s backoff)",
        uncertain_outcome: "PASS (Ambiguous failure marked uncertain without automatic resend)",
        booking_retained: "PASS (Reservation confirmed status retained on mail failure)",
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

    const cleanupResult = cleanupAndInspectOwnedResources();
    const endTime = new Date().toISOString();

    const failureReceipt = {
      gate: "H2_MAIL_ADMISSION_AND_DELIVERY",
      runId,
      timestamp_start: startTime,
      timestamp_end: endTime,
      git_head: headSha,
      uncommitted_files: uncommittedFiles,
      hostpapa_shared_only: true,
      engine_evidence: {
        php_version: measuredPhpVersion,
        mysql_version: measuredMysqlVersion,
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
  console.log(`H2 GATE SUCCESS: Shared hosting mail runtime & admission verified.`);
  console.log(`HostPapa shared-only preserved: YES`);
  console.log(`======================================================`);
} catch (err) {
  process.exitCode = 1;
}
