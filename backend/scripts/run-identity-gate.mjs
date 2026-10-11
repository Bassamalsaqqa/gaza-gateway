import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

// Local, identity-only gate. No service publication, Actions or owner database reuse.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = process.env.IDENTITY_GATE_VENDOR ?? path.join(root, "backend/vendor");
if (!fs.existsSync(path.join(vendor, "autoload.php"))) throw new Error("Install locked Composer dependencies or provide IDENTITY_GATE_VENDOR.");
const run = crypto.randomBytes(16).toString("hex");
const namespace = `gaza_identity_gate_${run}`;
const pg = `${namespace}_postgres`; const php = `${namespace}_php`;
const output = path.join(root, "scratch", namespace);
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, APP_KEY: `base64:${crypto.randomBytes(32).toString("base64")}`,
  GUEST_OTP_PEPPER_BASE64: crypto.randomBytes(32).toString("base64") };
const commands = []; let success = false; const resources = [];
function command(label, program, args, timeout = 120000) {
  const result = spawnSync(program, args, { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 20 * 1024 * 1024 });
  const bytes = (result.stdout ?? "") + (result.stderr ?? "");
  fs.writeFileSync(path.join(output, `${label}.log`), bytes);
  commands.push({ label, program, args, exitCode: result.status,
    logSha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  if (result.error || result.status !== 0) throw new Error(`${label} failed; inspect its owned local log.`);
  console.log(`PASS ${label}`); return bytes;
}
function docker(label, args, timeout) { return command(label, "docker", args, timeout); }
function phpCommand(label, args, timeout) { return docker(label, ["exec", php, ...args], timeout); }
const captureRoot = path.join(root, "backend/storage/app/private", `final-identity-${run}`);
try {
  const head = command("source-head", "git", ["rev-parse", "HEAD"]).trim();
  command("source-whitespace", "git", ["diff", "--check"]);
  docker("network-create", ["network", "create", namespace]); resources.push("network");
  docker("postgres-create", ["run", "-d", "--rm", "--name", pg, "--network", namespace, "--network-alias", "postgres",
    "--tmpfs", "/var/lib/postgresql/data", "--mount", `type=bind,source=${path.join(root, "backend/docker/init-db.sql")},target=/docker-entrypoint-initdb.d/init-db.sql,readonly`,
    "-e", "POSTGRES_USER=gza_admin", "-e", "POSTGRES_PASSWORD=gza_local_secret", "-e", "POSTGRES_DB=gaza_gateway_dev",
    "postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3"]); resources.push("postgres");
  // Bounded readiness, requiring initialized test DB, not just a listening socket.
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const r = spawnSync("docker", ["exec", pg, "psql", "-U", "gza_admin", "-d", "gaza_gateway_test", "-tAc", "SELECT 1"], { encoding: "utf8", timeout: 3000 });
    if (r.status === 0 && r.stdout.trim() === "1") { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Owned PostgreSQL initialization timed out.");
  docker("php-create", ["run", "-d", "--rm", "--name", php, "--network", namespace,
    "--mount", `type=bind,source=${root},target=/workspace`,
    "--mount", `type=bind,source=${path.resolve(vendor)},target=/workspace/backend/vendor,readonly`,
    "-w", "/workspace/backend", "-e", "APP_KEY", "-e", "GUEST_OTP_PEPPER_BASE64", "-e", "APP_ENV=testing", "-e", "APP_DEBUG=false",
    "-e", "APP_URL=https://127.0.0.1:18090", "-e", "APP_ALLOWED_HOSTS=127.0.0.1,localhost,127.0.0.1:18090",
    "-e", "CORS_ALLOWED_ORIGINS=http://localhost:3000,https://127.0.0.1:5173,https://127.0.0.1:10001",
    "-e", "DB_CONNECTION=pgsql_test", "-e", "DB_HOST=postgres", "-e", "DB_TEST_DATABASE=gaza_gateway_test",
    "-e", "DB_USERNAME=gaza_app_user", "-e", "DB_PASSWORD=gaza_app_local_pass",
    "-e", "CACHE_STORE=database", "-e", "QUEUE_CONNECTION=database", "-e", "SESSION_DRIVER=array", "-e", "LOG_CHANNEL=stderr",
    "-e", "IDENTITY_MIGRATION_DISPOSABLE_INSTANCE=1", "-e", `IDENTITY_FINAL_CAPTURE_RUN=${run}`,
    "--entrypoint", "sleep", "gaza-gateway-backend:phase13a", "1800"]); resources.push("php");
  phpCommand("php-version", ["php", "--version"]);
  phpCommand("composer-validate", ["composer", "validate", "--strict"]);
  phpCommand("composer-platform", ["composer", "check-platform-reqs"]);
  const migrations = phpCommand("migrate-up", ["php", "artisan", "migrate", "--no-interaction"]);
  const roundtrip = phpCommand("migration-roundtrip", ["php", "vendor/bin/phpunit", "tests/Feature/IdentityPersistence/MigrationLifecycleTest.php"], 180000);
  const catalog = phpCommand("migration-status", ["php", "artisan", "migrate:status"]);
  const tests = phpCommand("identity-php-postgres", ["php", "vendor/bin/phpunit", "--configuration", "tests/identity-final.xml", "--log-junit", "/tmp/identity-final.xml"], 900000);
  const spec = JSON.parse(fs.readFileSync(path.join(root, "docs/backend/openapi.v1.json"), "utf8"));
  const contract = JSON.parse(fs.readFileSync(path.join(root, "src/lib/api/identity-contract.json"), "utf8"));
  const operations = Object.values(spec.paths).flatMap(item => Object.entries(item).filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method)).map(([, op]) => op));
  if (!fs.existsSync(captureRoot) || fs.readFileSync(path.join(captureRoot, ".owned"), "utf8") !== run) throw new Error("Owned response captures missing.");
  const captures = [];
  for (const file of fs.readdirSync(captureRoot).filter(name => name.endsWith(".json"))) {
    const bytes = fs.readFileSync(path.join(captureRoot, file)); const capture = JSON.parse(bytes);
    const operation = operations.find(op => op.operationId === capture.operationId);
    const response = operation?.responses?.[String(capture.status)];
    const node = response?.$ref ? response.$ref.slice(2).split("/").reduce((value, key) => value?.[key], spec) : response;
    const schema = node?.content?.["application/json"]?.schema;
    if (!schema || !capture.contentType?.startsWith("application/json")) throw new Error(`Missing exact response contract: ${capture.operationId}`);
    const payload = JSON.parse(capture.rawResponseBody);
    if (!validatePayloadAgainstSchema(schema, payload, spec).valid) throw new Error(`Actual response mismatch: ${capture.operationId}`);
    // Intact-schema negative control on every actual canonical response.
    const tampered = { ...payload, success: false };
    if (!capture.operationId.endsWith("CsrfBootstrap") && validatePayloadAgainstSchema(schema, tampered, spec).valid) throw new Error("False-success response accepted.");
    captures.push({ operationId: capture.operationId, status: capture.status, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
  // Independent closed runtime registry, not a count-only declaration.
  const expected = contract.operations.map(operation => operation.operationId);
  if (expected.length !== 46 || expected.some(id => !captures.some(c => c.operationId === id)) || captures.length !== 46) {
    throw new Error(`Actual operation coverage incomplete: ${captures.length}/46; missing ${expected.filter(id => !captures.some(c => c.operationId === id)).join(", ")}`);
  }
  console.log("PASS actual OpenAPI responses and negative controls: 46/46");
  command("identity-types", "node", ["scripts/generate-identity-api-types.mjs", "--check"]);
  command("backend-contracts", "node", ["scripts/validate-backend-contracts.mjs"]);
  const nodeTests = command("identity-node", "node", ["--test", "--experimental-strip-types", "tests/unit/identity-api-client.test.ts", "tests/unit/identity-ui-boundary.test.ts"]);
  const files = command("tracked-source", "git", ["ls-files", "backend", "src", "scripts", "docs/backend", "tests/unit", "AGENTS.md", "package.json", "package-lock.json"]).trim().split(/\r?\n/);
  const hashes = files.map(file => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") }));
  fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify({ head, run, status: "passed", phpSummary: tests.match(/OK \([^\n]+\)/)?.[0],
    migrationSummary: roundtrip.match(/OK \([^\n]+\)/)?.[0], nodeSummary: nodeTests.split(/\r?\n/).filter(line => /^# (tests|pass|fail|skipped)/.test(line)),
    migrations, catalog, captures, hashes, commands, mailEvidence: "Synthetic fixtures only; no remote provider acceptance or delivery", actions: "No Actions invoked" }, null, 2) + "\n");
  success = true; console.log(`Gate receipt: ${path.relative(root, path.join(output, "receipt.json"))}`);
} finally {
  // Remove only resources named by this random owned run, never retained volumes.
  for (const name of resources.slice().reverse()) {
    const args = name === "network" ? ["network", "rm", namespace] : ["rm", "-f", name === "php" ? php : pg];
    const result = spawnSync("docker", args, { encoding: "utf8", timeout: 20000 });
    if (result.status !== 0) console.error(`Owned ${name} teardown failed; retained for inspection.`);
  }
  // Captures contain synthetic short-lived authority. Validate marker and containment
  // before deleting just the fixed files; logs/secret-free receipt remain reviewable.
  if (fs.existsSync(captureRoot) && fs.lstatSync(captureRoot).isDirectory() && !fs.lstatSync(captureRoot).isSymbolicLink()
      && fs.readFileSync(path.join(captureRoot, ".owned"), "utf8") === run) {
    for (const name of fs.readdirSync(captureRoot)) {
      if (name !== ".owned" && !/^[A-Za-z0-9]+\.json$/.test(name)) throw new Error("Unexpected owned capture entry; cleanup stopped.");
      const file = path.join(captureRoot, name);
      if (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile()) throw new Error("Unsafe capture cleanup target.");
      fs.unlinkSync(file);
    }
    fs.rmdirSync(captureRoot);
  }
  if (!success) console.error(`Gate incomplete: inspect ${path.relative(root, output)}. No passing receipt emitted.`);
}
