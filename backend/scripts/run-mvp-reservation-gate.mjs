import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// MVP Reservations gate: fresh owned PostgreSQL, disposable network, no retained database access.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultVendor = "C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/google-worker-workspaces/r_e294627e23ce528c7631aff3/phase13b_passenger_http01_v2_20261010/worktree/backend/vendor";
const vendor = path.resolve(process.env.REFERENCE_GATE_VENDOR ?? (fs.existsSync(path.join(root, "backend/vendor/autoload.php")) ? path.join(root, "backend/vendor") : defaultVendor));
if (!fs.existsSync(path.join(vendor, "autoload.php"))) throw new Error("Provide locked Composer vendor via REFERENCE_GATE_VENDOR.");
const run = crypto.randomBytes(16).toString("hex");
const namespace = "gaza_reservations_gate_" + run;
const pg = namespace + "_postgres", php = namespace + "_php";
const output = path.join(root, "scratch", namespace), isolated = path.join(output, "source");
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  APP_KEY: "base64:" + crypto.randomBytes(32).toString("base64"),
  GUEST_OTP_PEPPER_BASE64: crypto.randomBytes(32).toString("base64"),
};
const commands = [], resources = [], hashes = [];
let passed = false, failure = null, head = null, cleaned = true;

function command(label, program, args, timeout = 120000) {
  const result = spawnSync(program, args, { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  const bytes = (result.stdout ?? "") + (result.stderr ?? "");
  fs.writeFileSync(path.join(output, label + ".log"), bytes);
  commands.push({ label, exitCode: result.status, logSha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  if (result.error || result.status !== 0) throw new Error(label + " failed; see " + output);
  console.log("PASS " + label);
  return bytes;
}

const docker = (label, args, timeout) => command(label, "docker", args, timeout);
const inside = (label, args, timeout) => docker(label, ["exec", php, ...args], timeout);

try {
  head = command("head", "git", ["rev-parse", "HEAD"]).trim();
  const files = command("inventory", "git", ["ls-files", "--cached", "--others", "--exclude-standard",
    "backend", "docs/backend", "scripts/lib"]).trim().split(/\r?\n/).filter(Boolean);
  for (const file of files) {
    if (!fs.statSync(path.join(root, file)).isFile()) continue;
    const bytes = fs.readFileSync(path.join(root, file));
    const target = path.join(isolated, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    hashes.push({ file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
    if ((file.endsWith(".php") || file.endsWith(".mjs")) && (/[\t ]+\r?$/m.test(bytes.toString()) || !bytes.toString().endsWith("\n"))) {
      throw new Error("Whitespace: " + file);
    }
  }

  docker("network", ["network", "create", namespace]);
  resources.push("network");

  docker("postgres", ["run", "-d", "--rm", "--name", pg, "--network", namespace, "--network-alias", "postgres",
    "--tmpfs", "/var/lib/postgresql/data",
    "--mount", "type=bind,source=" + path.join(root, "backend/docker/init-db.sql") + ",target=/docker-entrypoint-initdb.d/init-db.sql,readonly",
    "-e", "POSTGRES_USER=gza_admin", "-e", "POSTGRES_PASSWORD=gza_local_secret", "-e", "POSTGRES_DB=gaza_gateway_dev",
    "postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3"]);
  resources.push("postgres");

  let ready = false;
  for (let i = 0; i < 30; i++) {
    const r = spawnSync("docker", ["exec", pg, "psql", "-U", "gza_admin", "-d", "gaza_gateway_test", "-tAc", "SELECT 1"],
      { encoding: "utf8", timeout: 3000 });
    if (r.status === 0 && r.stdout.trim() === "1") { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Owned PostgreSQL initialization deadline.");

  docker("php", ["run", "-d", "--rm", "--name", php, "--network", namespace, "--network-alias", "mailpit", "-w", "/workspace/backend",
    "-e", "APP_KEY", "-e", "GUEST_OTP_PEPPER_BASE64", "-e", "APP_ENV=testing", "-e", "APP_DEBUG=false",
    "-e", "APP_URL=https://127.0.0.1:18090", "-e", "APP_ALLOWED_HOSTS=127.0.0.1,localhost,127.0.0.1:18090",
    "-e", "CORS_ALLOWED_ORIGINS=https://127.0.0.1:5173",
    "-e", "DB_CONNECTION=pgsql_test", "-e", "DB_HOST=postgres", "-e", "DB_TEST_DATABASE=gaza_gateway_test",
    "-e", "DB_USERNAME=gaza_app_user", "-e", "DB_PASSWORD=gaza_app_local_pass",
    "-e", "CACHE_STORE=database", "-e", "QUEUE_CONNECTION=database", "-e", "LOG_CHANNEL=stderr",
    "-e", "IDENTITY_MIGRATION_DISPOSABLE_INSTANCE=1", "-e", "REFERENCE_GATE_OWNED=1",
    "-e", "MVP_RESERVATIONS_GATE_OWNED=1", "-e", "MVP_MAIL_ENABLED=true", "-e", "MVP_SITE_ENABLED=true",
    "-e", "RESERVATIONS_ENABLED=true", "-e", "RESERVATIONS_AUTHORITY=resolver",
    "--entrypoint", "sleep", "gaza-gateway-backend:phase13a", "1800"]);
  resources.push("php");

  docker("copy-source", ["cp", isolated + "/.", php + ":/workspace"]);
  docker("copy-vendor", ["cp", vendor, php + ":/workspace/backend/vendor"], 180000);

  inside("php-version", ["php", "--version"]);
  docker("postgres-version", ["exec", pg, "psql", "-U", "gza_admin", "-d", "gaza_gateway_test", "-tAc", "SHOW server_version"]);
  inside("composer-platform", ["composer", "check-platform-reqs"]);
  inside("migrate", ["php", "artisan", "migrate", "--no-interaction"]);
  inside("migrate-rollback", ["php", "artisan", "migrate:rollback", "--step=1", "--no-interaction"]);
  inside("migrate-reapply", ["php", "artisan", "migrate", "--no-interaction"]);
  const filter = process.env.RESERVATION_GATE_TEST_FILTER;
  inside("reservations-tests", ["php", "vendor/bin/phpunit", "tests/Feature/MvpReservations", "--log-junit", "/tmp/reservations.xml", ...(filter ? ["--filter", filter] : [])], 240000);

  docker("copy-junit", ["cp", php + ":/tmp/reservations.xml", path.join(output, "reservations.xml")]);
  const isIdentitySmtpOnly = Boolean(filter && filter.includes("identity_smtp"));
  if (!isIdentitySmtpOnly && (!filter || (!filter.includes("mail") && !filter.includes("site")))) {
    docker("copy-captures", ["cp", php + ":/tmp/reference-captures.json", path.join(output, "captures.json")]);
    command("reservation-http-contracts", process.execPath, [path.join(root, "backend/scripts/verify-reservation-gate-evidence.mjs"), path.join(output, "captures.json")]);
  }
  if (!isIdentitySmtpOnly && (!filter || filter.includes("mail"))) {
    docker("copy-mail-captures", ["cp", php + ":/tmp/mail-captures.json", path.join(output, "mail-captures.json")]);
    command("mail-http-contracts", process.execPath, [path.join(root, "backend/scripts/verify-mail-gate-evidence.mjs"), path.join(output, "mail-captures.json")]);
  }
  if (!isIdentitySmtpOnly && (!filter || filter.includes("site"))) {
    docker("copy-site-captures", ["cp", php + ":/tmp/site-captures.json", path.join(output, "site-captures.json")]);
    command("site-http-contracts", process.execPath, [path.join(root, "backend/scripts/verify-site-gate-evidence.mjs"), path.join(output, "site-captures.json")]);
  }
  command("whitespace", "git", ["diff", "--check"]);
  passed = true;
} catch (error) {
  failure = error.message;
  console.error(failure);
  process.exitCode = 1;
} finally {
  for (const kind of ["php", "postgres"]) {
    if (resources.includes(kind)) {
      const r = spawnSync("docker", ["rm", "-f", kind === "php" ? php : pg], { encoding: "utf8", timeout: 15000 });
      if (r.status !== 0) { passed = false; cleaned = false; failure = "Owned container cleanup failed."; process.exitCode = 1; }
    }
  }
  if (resources.includes("network")) {
    const r = spawnSync("docker", ["network", "rm", namespace], { encoding: "utf8", timeout: 15000 });
    if (r.status !== 0) { passed = false; cleaned = false; failure = "Owned network cleanup failed."; process.exitCode = 1; }
  }
  fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify({
    run, head, passed, failure, testFilter: process.env.RESERVATION_GATE_TEST_FILTER ?? null,
    sourceState: "working-tree snapshot; hashes bind proposed bytes, not a clean committed candidate",
    scope: "W2 reservations package bounded implementation; actual persisted OfferingResolver integrated; provider delivery and frontend cutover remain deferred",
    hashes, commands, resourcesCleaned: cleaned,
  }, null, 2) + "\n");
  console.log("Evidence: " + output);
}
