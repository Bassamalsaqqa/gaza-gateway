import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { discoverTests, selectTests, parseArguments, executeTests, runUnitCli, repositoryRoot } from "../../scripts/test-unit.mjs";

test("all inventory files are assigned and tooling joins the milestone gate", () => {
  const inventory = discoverTests();
  assert.deepEqual(selectTests(["all"]), [...inventory.unit,...inventory.tooling].sort());
  assert.ok(selectTests(["booking"]).includes("tests/unit/dated-service-cutover.test.ts"));
  assert.ok(!selectTests(["booking"]).includes("tests/unit/archive-foundation.test.ts"));
});
test("multi-domain union runs each overlapping regression once", () => {
  const files = selectTests(["booking","operations","booking"]);
  assert.equal(files.length, new Set(files).size);
  assert.equal(files.filter(file => file === "tests/unit/dated-service-cutover.test.ts").length, 1);
});
test("unknown, empty, missing and unassigned tests fail closed", () => {
  assert.throws(() => selectTests(["typo"]), /Unknown unit group/);
  assert.throws(() => selectTests([]), /Empty/);
  assert.throws(() => parseArguments(["--typo"]), /Unknown/);
  assert.throws(() => parseArguments(["--list","--list"]), /Duplicate/);
  const inventory = discoverTests();
  assert.throws(() => selectTests(["all"], { ...inventory, unit: [...inventory.unit,"tests/unit/unclassified.test.ts"] }), /Unassigned: tests\/unit\/unclassified/);
  assert.throws(() => selectTests(["all"], { ...inventory, unit: inventory.unit.slice(1) }), /Missing: tests\/unit/);
  assert.throws(() => selectTests(["tooling"], { ...inventory, tooling: [] }), /zero tests/);
});
test("list has no execution side effects and works outside repository cwd", () => {
  let output = "";
  assert.equal(runUnitCli(["--list","archive"], { print: text => { output = text; }, execute: () => { throw new Error("must not execute"); } }), 0);
  assert.match(output, /archive-foundation/);
  const result = spawnSync(process.execPath,[path.join(repositoryRoot,"scripts/test-unit.mjs"),"--list","archive"], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), output);
});
test("runner preserves child failure/signal and passes paths as arguments, not shell globs", () => {
  let received;
  const spawn = (...args) => { received = args; return { status: 17 }; };
  assert.equal(executeTests(["tests/unit/a.test.ts"], { spawn }), 17);
  assert.deepEqual(received[1],["--test","--experimental-strip-types","tests/unit/a.test.ts"]);
  assert.equal(received[2].cwd, repositoryRoot);
  assert.equal(executeTests(["x"], { spawn: () => ({ status: null, signal: "SIGTERM" }) }), 1);
  assert.throws(() => executeTests(["x"], { spawn: () => ({ error: new Error("spawn failed") }) }), /spawn failed/);
});
