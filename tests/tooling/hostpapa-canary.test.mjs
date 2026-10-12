import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const canaryDir = path.join(root, "tools", "hostpapa-canary");

function runPhp(code, args = []) {
  return spawnSync("php", ["-r", code, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
}

test("dated H0 database names require an exact disposable marker and owner binding", () => {
  const result = runPhp(`
    require 'tools/hostpapa-canary/src/CanaryException.php';
    require 'tools/hostpapa-canary/src/ConfigValidator.php';
    $names = ['gaza5045_h0_canary_20261012' => true,
      'gaza5045_h0_canary_20261012_extra' => false,
      'gaza5045_h0_canary_2026101' => false,
      'production_h0_canary_20261012' => false];
    foreach ($names as $name => $expected) {
      try {
        \\HostPapaCanary\\ConfigValidator::validate([
          'CANARY_EXECUTION_AUTHORIZED' => true,
          'CANARY_DATABASE' => $name,
          'CONFIRMED_DISPOSABLE_DATABASE_NAME' => $name,
        ]);
        $actual = true;
      } catch (\\Throwable $e) { $actual = false; }
      if ($actual !== $expected) { exit(1); }
    }
    try {
      \\HostPapaCanary\\ConfigValidator::validate([
        'CANARY_EXECUTION_AUTHORIZED' => true,
        'CANARY_DATABASE' => 'gaza5045_h0_canary_20261012',
        'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'other_canary',
      ]);
      exit(2);
    } catch (\\HostPapaCanary\\DatabaseGuardException $e) {}
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("ConfigValidator strictly rejects unauthorized runs, production database names, and consent mismatches", () => {
  const phpScript = `
    require 'tools/hostpapa-canary/src/CanaryException.php';
    require 'tools/hostpapa-canary/src/ConfigValidator.php';
    use HostPapaCanary\\ConfigValidator;
    use HostPapaCanary\\SecurityException;
    use HostPapaCanary\\DatabaseGuardException;

    // 1. Missing CANARY_EXECUTION_AUTHORIZED
    try {
        ConfigValidator::validate(['CANARY_EXECUTION_AUTHORIZED' => false], false);
        echo "FAIL_NO_AUTH_CHECK\\n";
    } catch (SecurityException \$e) {
        echo "PASS_REJECTED_UNAUTHORIZED\\n";
    }

    // 2. Production database names must be rejected
    \$forbiddenDbs = ['gazaairport', 'gaza_gateway', 'gazagateway_prod', 'production_live', 'main_db'];
    foreach (\$forbiddenDbs as \$db) {
        try {
            ConfigValidator::validate([
                'CANARY_EXECUTION_AUTHORIZED' => true,
                'CANARY_DATABASE' => \$db,
                'CONFIRMED_DISPOSABLE_DATABASE_NAME' => \$db,
            ], true);
            echo "FAIL_ACCEPTED_PROD_DB_" . \$db . "\\n";
        } catch (DatabaseGuardException \$e) {
            echo "PASS_REJECTED_PROD_DB_" . \$db . "\\n";
        }
    }

    // 3. Database lacking disposable marker must be rejected
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'ordinary_database_name',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'ordinary_database_name',
        ], true);
        echo "FAIL_ACCEPTED_NON_DISPOSABLE_DB\\n";
    } catch (DatabaseGuardException \$e) {
        echo "PASS_REJECTED_NON_DISPOSABLE_DB\\n";
    }

    // 4. Owner consent mismatch (CONFIRMED_DISPOSABLE_DATABASE_NAME !== CANARY_DATABASE)
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'cpaneluser_canary_test',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'wrong_unconfirmed_db',
        ], true);
        echo "FAIL_ACCEPTED_CONSENT_MISMATCH\\n";
    } catch (DatabaseGuardException \$e) {
        echo "PASS_REJECTED_CONSENT_MISMATCH\\n";
    }

    // 5. Properly named disposable database with matching consent must be accepted
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'cpaneluser_canary_test',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'cpaneluser_canary_test',
            'CANARY_TABLE_PREFIX' => 'canary_h0_tmp_',
        ], true);
        echo "PASS_ACCEPTED_VALID_DISPOSABLE_DB\\n";
    } catch (\\Throwable \$e) {
        echo "FAIL_REJECTED_VALID_DISPOSABLE_DB: " . \$e->getMessage() . "\\n";
    }
  `;

  const result = runPhp(phpScript);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS_REJECTED_UNAUTHORIZED/);
  assert.match(result.stdout, /PASS_REJECTED_PROD_DB_gazaairport/);
  assert.match(result.stdout, /PASS_REJECTED_PROD_DB_gaza_gateway/);
  assert.match(result.stdout, /PASS_REJECTED_PROD_DB_production_live/);
  assert.match(result.stdout, /PASS_REJECTED_NON_DISPOSABLE_DB/);
  assert.match(result.stdout, /PASS_REJECTED_CONSENT_MISMATCH/);
  assert.match(result.stdout, /PASS_ACCEPTED_VALID_DISPOSABLE_DB/);
});

test("ConfigValidator strictly rejects malicious prefixes with backticks, semicolons, newlines, and invalid DSN grammar", () => {
  const phpScript = `
    require 'tools/hostpapa-canary/src/CanaryException.php';
    require 'tools/hostpapa-canary/src/ConfigValidator.php';
    use HostPapaCanary\\ConfigValidator;
    use HostPapaCanary\\SecurityException;
    use HostPapaCanary\\DatabaseGuardException;

    // 1. Malicious table prefixes
    \$maliciousPrefixes = [
        'canary_h0_tmp_\`; DROP TABLE users; --',
        "canary_h0_tmp_\\nusers_",
        'canary_h0_tmp_;SELECT 1',
        'canary_h0_tmp_ with spaces',
        'canary_h0_tmp_"quotes"',
        'canary_h0_tmp_-dashes-',
        'too_short',
        'canary_h0_tmp_this_prefix_is_way_too_long_exceeding_the_thirty_two_char_bound_',
    ];

    foreach (\$maliciousPrefixes as \$prefix) {
        try {
            ConfigValidator::validateTablePrefix(\$prefix);
            echo "FAIL_ACCEPTED_MALICIOUS_PREFIX: " . \$prefix . "\\n";
        } catch (SecurityException \$e) {
            echo "PASS_REJECTED_MALICIOUS_PREFIX\\n";
        }
    }

    // 2. Malicious host grammar
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'test_db',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'test_db',
            'CANARY_DB_HOST' => '127.0.0.1; DROP TABLE users',
        ], true);
        echo "FAIL_ACCEPTED_MALICIOUS_HOST\\n";
    } catch (SecurityException \$e) {
        echo "PASS_REJECTED_MALICIOUS_HOST\\n";
    }

    // 3. Out-of-range port
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'test_db',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'test_db',
            'CANARY_DB_PORT' => 999999,
        ], true);
        echo "FAIL_ACCEPTED_INVALID_PORT\\n";
    } catch (SecurityException \$e) {
        echo "PASS_REJECTED_INVALID_PORT\\n";
    }

    // 4. Malicious username
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'test_db',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'test_db',
            'CANARY_DB_USER' => "admin'--",
        ], true);
        echo "FAIL_ACCEPTED_INVALID_USER\\n";
    } catch (SecurityException \$e) {
        echo "PASS_REJECTED_INVALID_USER\\n";
    }

    // 5. Prohibition of DROP DATABASE
    try {
        ConfigValidator::validate([
            'CANARY_EXECUTION_AUTHORIZED' => true,
            'CANARY_DATABASE' => 'test_db',
            'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'test_db',
            'CLEANUP_DROP_DATABASE' => true,
        ], true);
        echo "FAIL_ACCEPTED_DROP_DATABASE\\n";
    } catch (DatabaseGuardException \$e) {
        echo "PASS_REJECTED_DROP_DATABASE\\n";
    }
  `;

  const result = runPhp(phpScript);
  assert.equal(result.status, 0, result.stderr);
  // Verify all 8 malicious prefixes were rejected
  const matches = result.stdout.match(/PASS_REJECTED_MALICIOUS_PREFIX/g);
  assert.equal(matches?.length, 8);
  assert.match(result.stdout, /PASS_REJECTED_MALICIOUS_HOST/);
  assert.match(result.stdout, /PASS_REJECTED_INVALID_PORT/);
  assert.match(result.stdout, /PASS_REJECTED_INVALID_USER/);
  assert.match(result.stdout, /PASS_REJECTED_DROP_DATABASE/);
});

test("Sanitizer effectively redacts passwords, tokens, hashes, PII, and filesystem paths", () => {
  const phpScript = `
    require 'tools/hostpapa-canary/src/Sanitizer.php';
    use HostPapaCanary\\Sanitizer;

    \$sanitizer = new Sanitizer(['super_secret_password_123', 'bearer_token_xyz']);

    // 1. Secret string redaction
    \$rawStr = "Connection with pass: super_secret_password_123 and token bearer_token_xyz";
    \$cleanStr = \$sanitizer->sanitizeString(\$rawStr);
    echo "STR_CHECK:" . (str_contains(\$cleanStr, 'super_secret_password_123') ? "LEAKED" : "REDACTED") . "\\n";

    // 2. Argon2id hash redaction
    \$argonHash = "\$argon2id\$v=19\$m=65536,t=4,p=1\$dGVzdHNhbHQ\$YWJjZGVmZ2hpamtsbW5vcA";
    \$cleanArgon = \$sanitizer->sanitizeString("Generated hash: " . \$argonHash);
    echo "ARGON_CHECK:" . (str_contains(\$cleanArgon, 'dGVzdHNhbHQ') ? "LEAKED" : "REDACTED") . "\\n";

    // 3. Email redaction
    \$emailStr = "Notice sent to admin@gazaairport.com for verification";
    \$cleanEmail = \$sanitizer->sanitizeString(\$emailStr);
    echo "EMAIL_CHECK:" . (str_contains(\$cleanEmail, 'admin@gazaairport.com') ? "LEAKED" : "REDACTED") . "\\n";

    // 4. cPanel home directory redaction
    \$homePath = "Logs saved at /home/hostpapauser/canary-artifacts/report.md";
    \$cleanHome = \$sanitizer->sanitizeString(\$homePath);
    echo "HOME_CHECK:" . (str_contains(\$cleanHome, 'hostpapauser') ? "LEAKED" : "REDACTED") . "\\n";

    // 5. Recursive array key redaction
    \$sensitiveArray = [
        'status' => 'OK',
        'db_user' => 'canary_user',
        'database_password' => 'unmasked_password_here',
        'nested' => [
            'api_key' => 'secret_api_key_here',
            'public_metric' => 42,
        ],
    ];
    \$cleanArr = \$sanitizer->sanitizeArray(\$sensitiveArray);
    \$json = json_encode(\$cleanArr);
    echo "ARR_PASS_CHECK:" . (str_contains(\$json, 'unmasked_password_here') ? "LEAKED" : "REDACTED") . "\\n";
    echo "ARR_KEY_CHECK:" . (str_contains(\$json, 'secret_api_key_here') ? "LEAKED" : "REDACTED") . "\\n";
  `;

  const result = runPhp(phpScript);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /STR_CHECK:REDACTED/);
  assert.match(result.stdout, /ARGON_CHECK:REDACTED/);
  assert.match(result.stdout, /EMAIL_CHECK:REDACTED/);
  assert.match(result.stdout, /HOME_CHECK:REDACTED/);
  assert.match(result.stdout, /ARR_PASS_CHECK:REDACTED/);
  assert.match(result.stdout, /ARR_KEY_CHECK:REDACTED/);
});

test("web-api-canary/index.php enforces strict HTTPS and Apache Directory Privacy authentication", () => {
  // Test 1: Insecure HTTP must return 403
  const insecureHttp = spawnSync("php", ["tools/hostpapa-canary/web-api-canary/index.php"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, HTTPS: "off", SERVER_PORT: "80" },
  });
  assert.match(insecureHttp.stdout, /FORBIDDEN_INSECURE_HTTP/);

  // Test 2: HTTPS without Apache REMOTE_USER must return 401 AUTH_REQUIRED
  const unauthenticatedHttps = spawnSync("php", ["tools/hostpapa-canary/web-api-canary/index.php"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, HTTPS: "on", SERVER_PORT: "443" },
  });
  assert.match(unauthenticatedHttps.stdout, /AUTH_REQUIRED/);

  // Test 3: Raw supplied PHP_AUTH_USER without Apache REMOTE_USER must remain denied
  const fakeAuth = spawnSync("php", ["tools/hostpapa-canary/web-api-canary/index.php"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HTTPS: "on",
      SERVER_PORT: "443",
      PHP_AUTH_USER: "fake_user",
      PHP_AUTH_PW: "fake_pass",
    },
  });
  assert.match(fakeAuth.stdout, /AUTH_REQUIRED/);

  // Test 4: Legitimate Apache Directory Privacy (REMOTE_USER + AUTH_TYPE Basic) over HTTPS
  const authenticatedApache = spawnSync("php", ["tools/hostpapa-canary/web-api-canary/index.php"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HTTPS: "on",
      SERVER_PORT: "443",
      REMOTE_USER: "canaryadmin",
      AUTH_TYPE: "Basic",
      REDIRECT_STATUS: "200",
      REQUEST_URI: "/canary-api/v1/test",
    },
  });
  assert.match(authenticatedApache.stdout, /"status": "PASS"/);
  assert.match(authenticatedApache.stdout, /"directory_privacy_verified": true/);
  assert.match(authenticatedApache.stdout, /"mod_rewrite_verified": true/);

  // Test 5: Direct index.php call flags WARNING_DIRECT_CALL
  const directIndexCall = spawnSync("php", ["tools/hostpapa-canary/web-api-canary/index.php"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HTTPS: "on",
      SERVER_PORT: "443",
      REMOTE_USER: "canaryadmin",
      AUTH_TYPE: "Basic",
      REQUEST_URI: "/canary-api/index.php?canary_route=test",
    },
  });
  assert.match(directIndexCall.stdout, /WARNING_DIRECT_CALL/);
  assert.match(directIndexCall.stdout, /"mod_rewrite_verified": false/);
});

test("ApiRoutingCanary labels offline presence as PREPARED/UNVERIFIED", () => {
  const phpScript = `
    require 'tools/hostpapa-canary/src/ApiRoutingCanary.php';
    use HostPapaCanary\\ApiRoutingCanary;

    \$prober = new ApiRoutingCanary();
    \$report = \$prober->probe();

    echo "PREPARATION:" . \$report['preparation_status'] . "\\n";
    echo "STATUS:" . \$report['status'] . "\\n";
    echo "OPERATIONAL:" . \$report['operational_http_proof'] . "\\n";
  `;

  const result = runPhp(phpScript);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PREPARATION:PREPARED_OFFLINE/);
  assert.match(result.stdout, /STATUS:UNVERIFIED/);
  assert.match(result.stdout, /OPERATIONAL:UNVERIFIED/);
});

test("canary_runner CLI rejects output-dir inside public_html and path traversal", () => {
  // 1. Path traversal rejected
  const traversal = spawnSync(
    "php",
    ["tools/hostpapa-canary/canary_runner.php", "--skip-db", "--output-dir=../unsafe-dir"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(traversal.status, 1);
  assert.match(traversal.stderr, /output-dir contains path traversal sequence/);

  // 2. Output directory inside public_html rejected
  const webroot = spawnSync(
    "php",
    ["tools/hostpapa-canary/canary_runner.php", "--skip-db", "--output-dir=/home/user/public_html/canary"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(webroot.status, 1);
  assert.match(webroot.stderr, /output-dir must strictly reside outside public_html\/webroot/);
});

test("canary_runner CLI displays help cleanly and generates sanitized reports with --skip-db", async () => {
  const helpResult = spawnSync("php", ["tools/hostpapa-canary/canary_runner.php", "--help"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(helpResult.status, 0, helpResult.stderr);
  assert.match(helpResult.stdout, /HostPapa H0 Capability Canary Runner/);
  assert.match(helpResult.stdout, /--skip-db/);

  const tempDir = await mkdtemp(path.join(root, "scratch", "canary-test-"));
  try {
    const runResult = spawnSync(
      "php",
      [
        "tools/hostpapa-canary/canary_runner.php",
        "--skip-db",
        `--output-dir=${tempDir}`,
        "--format=both",
      ],
      { cwd: root, encoding: "utf8" }
    );

    assert.match(runResult.stdout, /Gaza Gateway — HostPapa H0 Capability Canary/);
    assert.match(runResult.stdout, /Probing PHP Runtime and Platform Extensions/);
    assert.match(runResult.stdout, /Probing MySQL 8.4 \/ InnoDB Capabilities/);
    assert.match(runResult.stdout, /Reports written to private path/);

    const children = await readdir(tempDir);
    assert.equal(children.length,1);
    assert.match(children[0], /^run-[a-f0-9]{24}$/);
    const reportDir=path.join(tempDir,children[0]);
    const files = await readdir(reportDir);
    const jsonFile = files.find((f) => f.endsWith(".json"));
    const mdFile = files.find((f) => f.endsWith(".md"));

    assert.ok(jsonFile, "Expected JSON report to be generated");
    assert.ok(mdFile, "Expected Markdown report to be generated");

    const jsonContent = JSON.parse(await readFile(path.join(reportDir, jsonFile), "utf8"));
    assert.equal(jsonContent.metadata.execution_mode, "OFFLINE_RUNTIME_ONLY");
    assert.equal(jsonContent.probes.mysql_capabilities.status, "UNVERIFIED");
    assert.equal(jsonContent.probes.api_routing.status, "UNVERIFIED");
    assert.equal(jsonContent.probes.api_routing.preparation_status, "PREPARED_OFFLINE");

    const mdContent = await readFile(path.join(reportDir, mdFile), "utf8");
    assert.match(mdContent, /HostPapa shared-only/);
    assert.match(mdContent, /Probe: `php_runtime`/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("All PHP files in tools/hostpapa-canary pass syntax checking", () => {
  const phpFiles = [
    "canary_config.sample.php",
    "canary_runner.php",
    "src/CanaryException.php",
    "src/ConfigValidator.php",
    "src/Sanitizer.php",
    "src/RuntimeProber.php",
    "src/DatabaseProber.php",
    "src/SmtpProber.php",
    "src/GitStageProber.php",
    "src/ApiRoutingCanary.php",
    "web-api-canary/index.php",
  ];

  for (const file of phpFiles) {
    const fullPath = path.join(canaryDir, file);
    const result = spawnSync("php", ["-l", fullPath], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `Syntax error in ${file}: ${result.stderr}`);
    assert.match(result.stdout, /No syntax errors detected/);
  }
});

// Simulated PHP server variables are negative-unit evidence, not an Apache hosting proof.
test("untrusted forwarded TLS and unverified Basic credentials cannot admit the canary", () => {
  const specimens = [
    { HTTPS: "off", SERVER_PORT: 80, HTTP_X_FORWARDED_PROTO: "https", REMOTE_USER: "operator", AUTH_TYPE: "Basic" },
    { HTTPS: "on", SERVER_PORT: 443, PHP_AUTH_USER: "arbitrary", PHP_AUTH_PW: "arbitrary" },
  ];
  for (const server of specimens) {
    const payload = Buffer.from(JSON.stringify(server)).toString("base64");
    const result = runPhp(`$_SERVER=json_decode(base64_decode('${payload}'),true); require 'tools/hostpapa-canary/web-api-canary/index.php';`);
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(JSON.parse(result.stdout).status, "PASS");
    assert.equal(JSON.parse(result.stdout).authenticated, undefined);
  }
});

test("private filesystem copy ignores caller-selected existing paths and leaves their files intact", async () => {
  const fixture = await mkdtemp(path.join(root, "scratch", "h0-owned-stage-"));
  const {writeFile} = await import("node:fs/promises");
  const sentinel = path.join(fixture,"release-manifest.txt");
  await writeFile(sentinel,"OWNER FILE MUST SURVIVE");
  try {
    const input = Buffer.from(JSON.stringify({STAGE_TEST_DIR:fixture})).toString("base64");
    const result = runPhp(`require 'tools/hostpapa-canary/src/Sanitizer.php'; require 'tools/hostpapa-canary/src/GitStageProber.php'; $c=json_decode(base64_decode('${input}'),true); echo json_encode((new HostPapaCanary\\GitStageProber($c,new HostPapaCanary\\Sanitizer()))->probe());`);
    assert.equal(result.status,0,result.stderr);
    const receipt=JSON.parse(result.stdout);
    assert.equal(receipt.status,"PASS");assert.equal(receipt.cleanup,true);
    assert.equal(receipt.git_cpanel_execution,"UNVERIFIED");
    assert.equal(await readFile(sentinel,"utf8"),"OWNER FILE MUST SURVIVE");
  } finally { await rm(fixture,{recursive:true,force:true}); }
});
