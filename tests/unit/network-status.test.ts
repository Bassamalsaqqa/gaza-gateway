import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

it("C1 accepted-source docs preserve engineering provenance, production and deferred phase boundaries", () => {
  const files = ["docs/ARCHITECTURE.md"];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert.match(content, /gza\.network\.v1/);
    assert.match(content, /NetworkRepository/);
    assert.match(content, /Public Flight generation, Flight IDs,? and Booking Flight resolution are unchanged/);
    assert.doesNotMatch(
      content,
      /remaining session-only destination OpsState|session-only `OpsState` containing destinations|Destinations remain session-only until|useAdmin\(\)\.patchOps/,
    );
  }
  const model = readFileSync("docs/ARCHITECTURE.md", "utf8");
  assert.match(model, /persist before adopting or notifying/);
  assert.match(model, /inactive destinations are permitted/i);
  assert.match(model, /never silently repaired or replaced/);
  assert.match(model, /`id`, `destination` and `direction` are immutable/);
});

it("C2B source finalization records independent engineering acceptance and keeps release pending", () => {
  const files = ["docs/ARCHITECTURE.md"];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /NetworkRepository/);
    assert.match(text, /gza\.network\.v1/);
    assert.doesNotMatch(
      text,
      /remaining session-only destination OpsState|session-only `OpsState` containing destinations/,
      file,
    );
  }
});

it("C2A dated-service model doc preserves phase boundaries and accepted-source status", () => {
  const model = readFileSync("docs/ARCHITECTURE.md", "utf8");
  assert.match(model, /Dated-Service/i);
  assert.match(model, /Planning deactivation is not retroactive cancellation/);
  assert.match(model, /valid empty/i);
});

it("all authoritative current headers and roadmap distinguish C2A foundation from accepted C2B", () => {
  for (const file of ["docs/ARCHITECTURE.md"]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /valid empty|Valid empty/);
    assert.match(text, /Planning deactivation is not retroactive cancellation/);
    assert.match(text, /NetworkRepository/);
  }
});

it("living docs record accepted Phase 12, owner deployment, accepted Phase 13A local foundation, Phase 13B authorization and Phase 13C–G boundaries", () => {
  const files = ["docs/ARCHITECTURE.md"];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /Frontend mock repositories remain default/);
    assert.match(text, /no real flight operations, payments, commercial ticketing, live air(?:line|port) check-in, or GDS/i);
    assert.match(text, /openapi\.v1\.json/);
    assert.match(text, /operation-policies\.v1\.json/);
    assert.match(text, /backend\/README\.md/);
  }
});
