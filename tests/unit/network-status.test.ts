import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

it("C1 accepted-source docs preserve engineering provenance, production and deferred phase boundaries", () => {
  const files = [
    "README.md",
    "PRODUCT.md",
    "roadmap.md",
    ...[
      "ARCHITECTURE",
      "CANONICAL_REPOSITORIES",
      "DATA_FLOW",
      "FLEET_MODEL",
      "COMMERCIAL_MODEL",
      "SCHEDULE_MODEL",
      "CONTACT_MODEL",
      "CONTENT_MODEL",
      "SETTINGS_MODEL",
    ].map((name) => `docs/${name}.md`),
  ];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const current = content.split(
      "## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence",
    )[1];
    assert.ok(current, file);
    assert.match(current, /Complete \/ Accepted Source/);
    assert.ok(
      current.includes("9846f9ad90760a5e47ca231a838d146c4d7096a0"),
      `${file}: accepted engineering SHA`,
    );
    assert.match(current, /C1 has no Accepted Release and is not deployed/);
    assert.match(
      content,
      /(?:Status|Progression)[^\n]*Phase 6B2C1[^\n]*Complete \/ Accepted Source/,
    );
    const c1Section = current.split(/(?:##\s*)?Phase 6B2C2/)[0] ?? current;
    assert.doesNotMatch(c1Section, /Implemented\s*\/\s*Awaiting\s+Independent\s+Review/);
    assert.doesNotMatch(content, /Independent engineering review of Phase 6B2C1/);
    assert.match(current, /Phase 6B2B is Complete \/ Accepted Source/);
    assert.match(current, /release\/deployment is intentionally pending/);
    assert.match(
      current,
      /Production remains \*\*Phase 6B2A[^\n]*Complete \/ Accepted Source \/ Accepted Release \/ Deployed by Owner/,
    );
    assert.match(current, /Phase 6B2C2A[^\n]*Complete \/ Accepted Source/);
    assert.match(current, /Phase 6B2C2B[^\n]*Complete \/ Accepted Source/);
    for (const truth of [
      "d0a411cb8a882298eb32a3222478fbc782ba5556",
      "2751e22be91ad74eacc9213489a57a21baf04807",
      "ae8c1e8071cf7f6412247f043e16a3ec2c88bd73",
      "gza.network.v1",
      "No product-domain OpsState remains",
      "Public Flight generation, Flight IDs and Booking Flight resolution are unchanged",
    ])
      assert.ok(current.includes(truth), `${file}: ${truth}`);
    assert.doesNotMatch(
      content,
      /remaining session-only destination OpsState|session-only `OpsState` containing destinations|Destinations remain session-only until|useAdmin\(\)\.patchOps/,
    );
  }
  const model = readFileSync("docs/NETWORK_MODEL.md", "utf8");
  assert.match(model, /Status: \*\*Phase 6B2C1 Complete \/ Accepted Source\*\*/);
  assert.ok(model.includes("9846f9ad90760a5e47ca231a838d146c4d7096a0"));
  assert.match(model, /C1 has no Accepted Release and is not deployed/);
  assert.match(
    model,
    /Phase 6B2B is Complete \/ Accepted Source[^\n]*release\/deployment is intentionally pending/,
  );
  assert.match(model, /Production remains owner-deployed Phase 6B2A/);
  for (const truth of [
    "2751e22be91ad74eacc9213489a57a21baf04807",
    "ae8c1e8071cf7f6412247f043e16a3ec2c88bd73",
  ])
    assert.ok(model.includes(truth));
  assert.match(model, /Phase 6B2C2A[^\n]*Complete \/ Accepted Source/);
  assert.match(model, /Phase 6B2C2B[^\n]*Complete \/ Accepted Source/);
  assert.doesNotMatch(model, /Phase 6B2C1[ -]+Implemented\s*\/\s*Awaiting\s+Independent\s+Review/);
  assert.match(model, /persist before adopting or notifying/);
  assert.match(model, /inactive destinations are permitted/);
  assert.match(model, /never silently repaired or replaced/);
  assert.match(model, /`id`, `destination` and `direction` are immutable/);
});

it("C2B source finalization records independent engineering acceptance and keeps release pending", () => {
  const files = [
    "README.md", "PRODUCT.md", "roadmap.md",
    ...["ARCHITECTURE", "CANONICAL_REPOSITORIES", "DATA_FLOW", "DATED_SERVICE_MODEL",
      "NETWORK_MODEL", "FLEET_MODEL", "COMMERCIAL_MODEL", "SCHEDULE_MODEL",
      "CONTENT_MODEL", "CONTACT_MODEL", "SETTINGS_MODEL"].map((name) => `docs/${name}.md`),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const checkpoint = text.split("## Phase 6B2C2B accepted-source checkpoint")[1];
    assert.ok(checkpoint, `${file}: C2B accepted-source checkpoint`);
    assert.match(checkpoint, /Phase 6B2C2B Complete \/ Accepted Source/);
    assert.match(checkpoint, /Phase 6B Complete \/ Accepted Source/);
    assert.ok(checkpoint.includes("b4cd96a3eda97ae1442119c4fde03c0a463c7cb4"), file);
    assert.ok(checkpoint.includes("ff46f8e7ab606731be679eaedbada9e07d09e91a"), file);
    assert.match(checkpoint, /Production remains \*\*Phase 6B2A|production remained Phase 6B2A/);
    assert.ok(checkpoint.includes("2751e22be91ad74eacc9213489a57a21baf04807"), file);
    assert.ok(checkpoint.includes("ae8c1e8071cf7f6412247f043e16a3ec2c88bd73"), file);
    assert.match(checkpoint, /Phase 6B2B, Phase 6B2C1, Phase 6B2C2A and Phase 6B2C2B release\/deployment remain pending|Phase 6B consolidated release/);
    assert.match(checkpoint, /Phase 6B has no consolidated Accepted Release|Deployed by Owner/);
    assert.match(checkpoint, /Phase 6C \/ 7 \/ 7B remain Planned \/ Unstarted|Phase 6C(?:(?!Phase 7)[^\n])*(?:Implemented \/ Awaiting Independent Review|Complete \/ Accepted Source)/);
    assert.doesNotMatch(text, /Phase 6B(?:(?!Phase 6C)[^\n])*Implemented \/ Awaiting Independent Review|Phase 6B(?: as a whole)? (?:is not complete|remains incomplete|is incomplete)/, file);
  }
  const roadmap = readFileSync("roadmap.md", "utf8");
  const phase6BRow = roadmap.split("\n").find((line) => line.startsWith("| **Phase 6B** |"));
  assert.ok(phase6BRow);
  assert.match(phase6BRow, /Complete \/ Accepted Source/);
  assert.match(phase6BRow, /release\/deployment pending|Deployed by Owner/);
  const snapshot = readFileSync("GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md", "utf8");
  assert.match(snapshot, /ENGINEERING ACCEPTED/);
  assert.ok(snapshot.includes("b4cd96a3eda97ae1442119c4fde03c0a463c7cb4"));
  assert.match(snapshot, /Do \*\*not\*\* start Phase 6C yet/);
});

it("C2A dated-service model doc preserves phase boundaries and accepted-source status", () => {
  const model = readFileSync("docs/DATED_SERVICE_MODEL.md", "utf8");
  assert.match(model, /Phase 6B2C2A Complete \/ Accepted Source/);
  assert.match(model, /Phase 6B2C2B[^\n]*Complete \/ Accepted Source/);
  assert.match(model, /Phase 6B2C1 Complete \/ Accepted Source/);
  assert.match(model, /Phase 6B2B Complete \/ Accepted Source/);
  assert.match(
    model,
    /Phase 6B2A Complete \/ Accepted Source \/ Accepted Release \/ Deployed by Owner/,
  );
});

it("all authoritative current headers and roadmap distinguish C2A foundation from accepted C2B", () => {
  for (const file of [
    "README.md",
    "PRODUCT.md",
    "roadmap.md",
    ...[
      "ARCHITECTURE",
      "CANONICAL_REPOSITORIES",
      "DATA_FLOW",
      "FLEET_MODEL",
      "NETWORK_MODEL",
      "COMMERCIAL_MODEL",
      "SCHEDULE_MODEL",
      "CONTACT_MODEL",
      "CONTENT_MODEL",
      "SETTINGS_MODEL",
      "DATED_SERVICE_MODEL",
    ].map((n) => `docs/${n}.md`),
  ]) {
    const text = readFileSync(file, "utf8");
    assert.match(
      text,
      /(?:Status|Progression)[^\n]*Phase 6B2C2A[^\n]*Complete \/ Accepted Source/,
      file,
    );
    assert.match(text, /Phase 6B2C2B[^\n]*Complete \/ Accepted Source/, file);
    const cutover = text.split("## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover")[1];
    assert.ok(cutover, `${file}: current C2B authority`);
    assert.match(cutover, /valid empty|Valid empty/);
    assert.match(cutover, /Planning deactivation is not retroactive cancellation/);
    assert.match(cutover, /C2B has no Accepted Release and is not deployed|consolidated Phase 6B owner deployment|Historical milestone record/);
    assert.match(cutover, /Phase 6C \/ 7 \/ 7B remain Planned \/ Unstarted|Phase 6C (?:is )?(?:Implemented \/ Awaiting Independent Review|Complete \/ Accepted Source)/);
    const accepted = text.split("## Phase 6B2C2A accepted-source checkpoint")[1];
    assert.ok(accepted, `${file}: C2A accepted-source checkpoint`);
    assert.match(accepted, /Phase 6B2C2A Complete \/ Accepted Source/, file);
    assert.ok(accepted.includes("429ca82dfa3db0453feeab5b53bb45e9e14cf45a"), file);
    assert.match(accepted, /C2A has no Accepted Release and is not deployed/, file);
    assert.match(
      accepted,
      /Phase 6B2B and Phase 6B2C1 are Complete \/ Accepted Source; their release\/deployment is intentionally pending/,
      file,
    );
    assert.match(accepted, /Production remains owner-deployed Phase 6B2A/, file);
    for (const sha of [
      "2751e22be91ad74eacc9213489a57a21baf04807",
      "ae8c1e8071cf7f6412247f043e16a3ec2c88bd73",
    ])
      assert.ok(accepted.includes(sha), `${file}: current production ${sha}`);
    assert.doesNotMatch(
      text,
      /Phase 6B2C2A(?:\s+is)?\s*(?:[-:]\s*)?Implemented\s*\/\s*Awaiting\s+Independent\s+Review|Independent engineering review of Phase 6B2C2A/,
      file,
    );
    assert.match(text, /Phase 6B as a whole is Complete \/ Accepted Source/, file);
    assert.doesNotMatch(
      text,
      /Phase 6B2C2[^AB\n][^\n]*Network & Dated-Service Materialization(?: is| remains) Planned \/ Unstarted/,
      file,
    );
  }
});

it("living docs record accepted editorial source, owner deployment and Phase 8 review boundary", () => {
  const files = ["README.md", "PRODUCT.md", "roadmap.md", ...["ARCHITECTURE", "CANONICAL_REPOSITORIES", "DATA_FLOW", "SCHEDULE_MODEL", "SETTINGS_MODEL", "NETWORK_MODEL", "FLEET_MODEL", "DATED_SERVICE_MODEL", "COMMERCIAL_MODEL", "CONTENT_MODEL", "CONTACT_MODEL"].map(name => `docs/${name}.md`)];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const current = text.split("## Current checkpoint — Phase 8")[1];
    assert.ok(current, file);
    assert.match(current, /Phase 6, Phase 7 and Phase 7B are \*\*Complete \/ Accepted Source/);
    assert.ok(current.includes("deb9f6e2a4246f4f5c70ca1b56797ccf0588388e"), file);
    assert.ok(current.includes("f68adcc60ec195f8099252b0d2d78da9a7c5ef4e"), file);
    assert.match(current, /product owner's instruction/);
    assert.match(current, /no cPanel deployment or independent live verification/);
    assert.match(current, /Phase 9 remains Planned \/ Unstarted/);
    assert.match(current, /Phase 8 — Visual System & Assets Finalization: Implemented \/ Awaiting Independent Review/);
    assert.match(current, /Earlier milestone sections are historical/);
    for (const historicalSha of [
      "d5dd2942fad517cc5f1be353ad206511cc0724cc",
      "3ac3c8a078f7ffa82b411744b656c3575a3955c4",
      "4374e9f37cd6f23798cfd20ccfa7e43bcec77f89",
      "8e3136c22156c9acf800d25e94e8cd3d29a8bfc8",
      "2749c26714258871c32bd2b14a75fc4e87a68b62",
    ]) assert.ok(text.includes(historicalSha), `${file}: retained history ${historicalSha}`);
  }
});
