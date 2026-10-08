import { test } from "node:test";
import assert from "node:assert/strict";
import { createSmokeSelection, smokeGroups, smokeCheckId } from "../helpers/smoke-selection.mjs";
import { installTestClock } from "../helpers/test-clock.mjs";
import { externalResponse } from "../helpers/browser-harness.mjs";

test("focused smoke groups keep critical journeys and exclude unrelated checks", () => {
  const selected = createSmokeSelection({ group: "public" });
  assert.equal(selected.accepts("9. Real booking journey"), true);
  assert.equal(selected.accepts("Check 60: Desk"), false);
  assert.equal(smokeCheckId("Check 42: Manage"), "42");
  assert.equal(smokeCheckId("3b. Fixture isolation"), "3b");
  for (const group of Object.keys(smokeGroups)) {
    const selection = createSmokeSelection({ group });
    for (const id of smokeGroups[group]) assert.equal(selection.accepts(/^\d/.test(id) ? `Check ${id}: registered` : /^Phase/.test(id) ? `${id} registered` : id), true);
    selection.verify();
  }
});
test("unknown, empty and incomplete selections fail closed", () => {
  assert.throws(() => createSmokeSelection({ group: "typo" }), /Unknown/);
  assert.throws(() => createSmokeSelection({ filter: "no-match" }).verify(), /zero checks/);
  const selection = createSmokeSelection({ group: "admin" });
  selection.accepts("10. Operations");
  assert.throws(() => selection.verify(), /missing registered/);
  const filtered = createSmokeSelection({ group: "admin", filter: "Operations" });
  assert.equal(filtered.accepts("10. Operations"), true);
  filtered.verify();
});
test("clock injection is reversible and preserves explicit date calculations", () => {
  const target = { Date };
  const restore = installTestClock("2026-10-08T09:00:00Z", target);
  assert.equal(new target.Date().toISOString(), "2026-10-08T09:00:00.000Z");
  assert.equal(new target.Date("2020-01-01").getUTCFullYear(), 2020);
  assert.equal(target.Date.now(), Date.parse("2026-10-08T09:00:00Z"));
  restore();
  assert.equal(target.Date, Date);
  assert.throws(() => installTestClock("bad", target), /Invalid/);
});
test("browser network boundary stubs only declared external services", () => {
  assert.equal(externalResponse("http://localhost:4173/assets/app.js", "http://localhost:4173"), null);
  assert.equal(externalResponse("https://fonts.googleapis.com/css2?family=X", "http://localhost:4173").contentType, "text/css");
  assert.equal(externalResponse("https://www.youtube-nocookie.com/embed/x", "http://localhost:4173").status, 200);
  assert.throws(() => externalResponse("https://unknown.example/image.jpg", "http://localhost:4173"), /Unexpected external/);
});
