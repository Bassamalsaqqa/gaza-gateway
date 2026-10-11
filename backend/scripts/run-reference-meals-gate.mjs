import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mealOperations, verifyMealCapture } from "./meals-capture-contracts.mjs";
import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

// Meals-only gate: fresh owned PostgreSQL, no published ports or retained database access.
const commandBoundaryOnly = process.argv.includes("--command-boundary");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = path.resolve(process.env.REFERENCE_GATE_VENDOR ?? path.join(root, "backend/vendor"));
if (!fs.existsSync(path.join(vendor, "autoload.php"))) throw new Error("Provide locked Composer vendor via REFERENCE_GATE_VENDOR.");
const run = crypto.randomBytes(16).toString("hex");
const namespace = "gaza_meals_gate_"+run;
const pg = namespace+"_postgres", php = namespace+"_php";
const output = path.join(root, "scratch", namespace), isolated = path.join(output, "source");
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  APP_KEY: "base64:"+crypto.randomBytes(32).toString("base64"),
  GUEST_OTP_PEPPER_BASE64: crypto.randomBytes(32).toString("base64"),
};
const commands = [], resources = [], hashes = [];
let passed = false, failure = null, head = null, cleaned = true;

function command(label, program, args, timeout = 120000) {
  const result = spawnSync(program, args, { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 8*1024*1024 });
  const bytes = (result.stdout ?? "")+(result.stderr ?? "");
  fs.writeFileSync(path.join(output, label+".log"), bytes);
  commands.push({ label, exitCode: result.status, logSha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  if (result.error || result.status !== 0) throw new Error(label+" failed; see "+output);
  console.log("PASS "+label);
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
      throw new Error("Whitespace: "+file);
    }
  }

  docker("network", ["network", "create", namespace]);
  resources.push("network");

  docker("postgres", ["run", "-d", "--rm", "--name", pg, "--network", namespace, "--network-alias", "postgres",
    "--tmpfs", "/var/lib/postgresql/data",
    "--mount", "type=bind,source="+path.join(root, "backend/docker/init-db.sql")+",target=/docker-entrypoint-initdb.d/init-db.sql,readonly",
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

  docker("php", ["run", "-d", "--rm", "--name", php, "--network", namespace, "-w", "/workspace/backend",
    "-e", "APP_KEY", "-e", "GUEST_OTP_PEPPER_BASE64", "-e", "APP_ENV=testing", "-e", "APP_DEBUG=false",
    "-e", "APP_URL=https://127.0.0.1:18090", "-e", "APP_ALLOWED_HOSTS=127.0.0.1,localhost,127.0.0.1:18090",
    "-e", "CORS_ALLOWED_ORIGINS=https://127.0.0.1:5173",
    "-e", "DB_CONNECTION=pgsql_test", "-e", "DB_HOST=postgres", "-e", "DB_TEST_DATABASE=gaza_gateway_test",
    "-e", "DB_USERNAME=gaza_app_user", "-e", "DB_PASSWORD=gaza_app_local_pass",
    "-e", "CACHE_STORE=database", "-e", "QUEUE_CONNECTION=database", "-e", "LOG_CHANNEL=stderr",
    "-e", "IDENTITY_MIGRATION_DISPOSABLE_INSTANCE=1", "-e", "REFERENCE_GATE_OWNED=1",
    "--entrypoint", "sleep", "gaza-gateway-backend:phase13a", "1800"]);
  resources.push("php");

  docker("copy-source", ["cp", isolated+"/.", php+":/workspace"]);
  docker("copy-vendor", ["cp", vendor, php+":/workspace/backend/vendor"], 180000);

  inside("php-version", ["php", "--version"]);
  docker("postgres-version", ["exec", pg, "psql", "-U", "gza_admin", "-d", "gaza_gateway_test", "-tAc", "SHOW server_version"]);
  inside("composer-platform", ["composer", "check-platform-reqs"]);
  inside("migrate", ["php", "artisan", "migrate", "--no-interaction"]);
  inside("meals-tests", ["php", "vendor/bin/phpunit", "tests/Feature/ReferenceMeals", ...(commandBoundaryOnly ? ["--filter", "test_reviewed_commands_are_closed_flat_objects"] : []), "--log-junit", "/tmp/meals.xml"], 180000);

  docker("copy-junit", ["cp", php+":/tmp/meals.xml", path.join(output, "meals.xml")]);
  docker("copy-captures", ["cp", php+":/tmp/reference-captures.json", path.join(output, "captures.json")]);

  const spec = JSON.parse(fs.readFileSync(path.join(root, "docs/backend/mvp-meals.openapi.json")));
  const expected = commandBoundaryOnly ? {
      postAdminMeal: ["post", "/admin/meals", 201],
      putAdminMealsOrder: ["put", "/admin/meals/order", 200],
      putAdminMealsDefault: ["put", "/admin/meals/default", 200],
    } : {
    getMeals: ["get", "/meals", 200],
    getAdminMeals: ["get", "/admin/meals", 200],
    postAdminMeal: ["post", "/admin/meals", 201],
    patchAdminMeal: ["patch", "/admin/meals/{id}", 200],
    putAdminMealsOrder: ["put", "/admin/meals/order", 200],
    putAdminMealsDefault: ["put", "/admin/meals/default", 200],
  };

  const captures = JSON.parse(fs.readFileSync(path.join(output, "captures.json")));

  for (const [id, [method, route, status]] of Object.entries(expected)) {
    const operation = spec.paths[route]?.[method], capture = captures[id+":"+status];
    if (operation?.operationId !== id || !capture || capture.status !== status || !capture.contentType.startsWith("application/json")) {
      throw new Error("Operation capture: "+id);
    }
    const schema = operation.responses[String(status)].content["application/json"].schema;
    if (!validatePayloadAgainstSchema(schema, capture.payload, spec).valid) {
      throw new Error("Response contract: "+id);
    }
    if (validatePayloadAgainstSchema(schema, { ...capture.payload, success: false }, spec).valid
      || validatePayloadAgainstSchema(schema, { ...capture.payload, injected: true }, spec).valid) {
      throw new Error("Negative response: "+id);
    }

    // Policy verification
    if (id === "getMeals") {
      if (operation.security.length !== 0 || operation["x-authority-policy"] !== "public") {
        throw new Error("Policy drift: public getMeals");
      }
    } else if (id === "getAdminMeals") {
      if (operation["x-required-permission"] !== "commercial.view"
        || JSON.stringify(operation.security) !== '[{"StaffCookieAuth":[]}]') {
        throw new Error("Policy drift: getAdminMeals");
      }
    } else {
      if (operation["x-required-permission"] !== "commercial.edit"
        || JSON.stringify(operation.security) !== '[{"StaffCookieAuth":[]}]'
        || operation["x-protocol"]?.branches?.[0]?.csrf !== "staff"
        || operation["x-protocol"]?.branches?.[0]?.origin !== "configured_frontend") {
        throw new Error("Policy drift: write operation "+id);
      }
    }
    console.log("PASS actual response + negative controls + policy "+id);
  }

  let negatives = 0;
  for (const capture of Object.values(captures)) {
    verifyMealCapture(spec, capture);
    if (capture.status >= 400) {
      negatives++;
      const corrupt = structuredClone(spec), [method, route] = mealOperations[capture.operationId];
      delete corrupt.paths[route][method].responses[String(capture.status)];
      let rejected = false;
      try { verifyMealCapture(corrupt, capture); } catch { rejected = true; }
      if (!rejected) throw new Error("Undocumented status control escaped: "+capture.operationId+":"+capture.status);

      rejected = false;
      try { verifyMealCapture(spec, { ...capture, contentType: "text/plain" }); } catch { rejected = true; }
      if (!rejected) throw new Error("Negative content-type control escaped: "+capture.operationId+":"+capture.status);

      rejected = false;
      try { verifyMealCapture(spec, { ...capture, payload: { ...capture.payload, success: true } }); } catch { rejected = true; }
      if (!rejected) throw new Error("Negative schema control escaped: "+capture.operationId+":"+capture.status);
    }
  }

  const required = commandBoundaryOnly ? { postAdminMeal: [422], patchAdminMeal: [422], putAdminMealsOrder: [422], putAdminMealsDefault: [422] } : {
    getMeals: [400, 429, 503],
    getAdminMeals: [400, 401, 403, 429, 503],
    postAdminMeal: [400, 401, 403, 409, 422, 429, 503],
    patchAdminMeal: [400, 401, 403, 404, 422, 429, 503],
    putAdminMealsOrder: [400, 401, 403, 422, 429, 503],
    putAdminMealsDefault: [400, 401, 403, 404, 422, 429, 503],
  };

  for (const [id, statuses] of Object.entries(required)) {
    for (const status of statuses) {
      if (!captures[id+":"+status]) throw new Error("Missing actual negative response: "+id+" "+status);
    }
  }
  console.log("PASS "+negatives+" actual error contracts + undocumented-status/content-type/schema controls");

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
    run, head, passed, failure,
    sourceState: "working-tree snapshot; hashes bind proposed bytes, not a clean committed candidate",
    scope: commandBoundaryOnly ? "reviewed meal command boundaries only; one focused PHP/PG test" : "W1 meals only; no remote/provider/production/full identity certification",
    hashes, commands, resourcesCleaned: cleaned,
  }, null, 2)+"\n");
  console.log("Evidence: "+output);
}
