import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

it("C1 authoritative docs preserve production/B2B acceptance and Network preparation boundaries", () => {
  const files = ["README.md", "PRODUCT.md", "roadmap.md", ...["ARCHITECTURE", "CANONICAL_REPOSITORIES", "DATA_FLOW", "FLEET_MODEL", "COMMERCIAL_MODEL", "SCHEDULE_MODEL", "CONTACT_MODEL", "CONTENT_MODEL", "SETTINGS_MODEL"].map(name => `docs/${name}.md`)];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const current = content.split("## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence")[1];
    assert.ok(current, file);
    assert.match(current, /Implemented \/ Awaiting Independent Review/);
    assert.match(current, /Phase 6B2B is Complete \/ Accepted Source/);
    assert.match(current, /release\/deployment is intentionally pending/);
    assert.match(current, /Production remains \*\*Phase 6B2A[^\n]*Complete \/ Accepted Source \/ Accepted Release \/ Deployed by Owner/);
    assert.match(current, /Phase 6B2C2[^\n]*Planned \/ Unstarted/);
    for (const truth of ["d0a411cb8a882298eb32a3222478fbc782ba5556", "2751e22be91ad74eacc9213489a57a21baf04807", "ae8c1e8071cf7f6412247f043e16a3ec2c88bd73", "gza.network.v1", "No product-domain OpsState remains", "Public Flight generation, Flight IDs and Booking Flight resolution are unchanged"]) assert.ok(current.includes(truth), `${file}: ${truth}`);
    assert.doesNotMatch(content, /remaining session-only destination OpsState|session-only `OpsState` containing destinations|Destinations remain session-only until|useAdmin\(\)\.patchOps/);
  }
  const model = readFileSync("docs/NETWORK_MODEL.md", "utf8");
  assert.match(model, /persist before adopting or notifying/);
  assert.match(model, /inactive destinations are permitted/);
  assert.match(model, /never silently repaired or replaced/);
  assert.match(model, /`id`, `destination` and `direction` are immutable/);
});
