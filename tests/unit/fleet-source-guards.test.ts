import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(__dirname, "../../src");

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("Phase 6B2B Source Guards (Requirements 64, 65, 66, 67)", () => {
  const allSourceFiles = getAllSourceFiles(srcDir);
  it("current architecture docs do not retain the removed aircraft/seat-map OpsState authority", () => {
    const files = ["README.md", "PRODUCT.md", "roadmap.md", "docs/ARCHITECTURE.md", "docs/CANONICAL_REPOSITORIES.md", "docs/DATA_FLOW.md", "docs/SCHEDULE_MODEL.md", "docs/COMMERCIAL_MODEL.md", "docs/CONTACT_MODEL.md", "docs/CONTENT_MODEL.md", "docs/SETTINGS_MODEL.md", "docs/FLEET_MODEL.md"];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /remaining session-only mixed product\/destination OpsState|OpsState` containing aircraft, seat maps|Aircraft\/seat maps remain session-only and do not control passenger seat geometry/);
      assert.match(content, /Phase 6B2B/);
      const current = content.split(/\n## Phase 6B2B accepted-source checkpoint\s*\n/)[1];
      assert.ok(current, `${file}: missing accepted-source checkpoint`);
      assert.match(current, /Phase 6B2B[^\n]*Complete \/ Accepted Source/);
      assert.ok(current.includes("7f8a2bef613fa0cd37af4f05684c98aebe94d23e"), file);
      assert.match(current, /Not yet Accepted Release/);
      assert.match(current, /Not yet Deployed/);
      assert.match(current, /Production remains \*\*Phase 6B2A[^\n]*Complete \/ Accepted Source \/ Accepted Release \/ Deployed by Owner/);
      assert.match(current, /Phase 6B2C[^\n]*Planned \/ Unstarted/);
      assert.ok(current.includes("2751e22be91ad74eacc9213489a57a21baf04807"), file);
      assert.ok(current.includes("ae8c1e8071cf7f6412247f043e16a3ec2c88bd73"), file);
      // Explicit historical audit sections may retain their former status.
      let historical = false;
      let section = "";
      for (const line of content.split(/\r?\n/)) {
        if (/^#{1,6} /.test(line)) {
          section = line;
          historical = /historical (?:review|audit|evidence)/i.test(line);
        }
        if (!historical && (/6B2B/.test(line) || /Phase 6B2B/.test(section))) {
          assert.doesNotMatch(line, /Implemented\s*\/\s*Awaiting\s+(?:Independent\s+)?Review/i, file);
        }
      }
      assert.ok(content.includes("2751e22be91ad74eacc9213489a57a21baf04807"));
      assert.ok(content.includes("ae8c1e8071cf7f6412247f043e16a3ec2c88bd73"));
    }
  });

  it("Req 64: no runtime references to ops.aircraft or ops.seatMaps across all src/ files", () => {
    const offendersAircraft: string[] = [];
    const offendersSeatMaps: string[] = [];

    for (const file of allSourceFiles) {
      const content = readFileSync(file, "utf8");
      if (content.includes("ops.aircraft")) {
        offendersAircraft.push(file);
      }
      if (content.includes("ops.seatMaps")) {
        offendersSeatMaps.push(file);
      }
    }

    assert.deepEqual(
      offendersAircraft,
      [],
      `Found references to ops.aircraft in: ${offendersAircraft.join(", ")}`
    );
    assert.deepEqual(
      offendersSeatMaps,
      [],
      `Found references to ops.seatMaps in: ${offendersSeatMaps.join(", ")}`
    );
  });

  it("Req 64: runtime seat geometry imports audit - only frozen legacy/seed/test paths permitted", () => {
    // Explicit allowlist of runtime files permitted to reference legacy geometry symbols:
    // 1. src/lib/data.ts: defines frozen legacy constants (SEAT_ROWS, SEAT_LETTERS, cabinZones, cabinZone, EXTRA_LEGROOM_ROWS)
    // 2. src/lib/domain/seat-validation.ts: legacy fallback for suggestSeat when layout is omitted
    const allowedLegacyFiles = new Set([
      join(srcDir, "lib", "data.ts"),
      join(srcDir, "lib", "domain", "seat-validation.ts"),
    ]);

    const legacySymbolsRegex = /import[\s\S]*?\b(SEAT_ROWS|SEAT_LETTERS|EXTRA_LEGROOM_ROWS|cabinZones|cabinZone)\b[\s\S]*?from ["'][^"']*data["']/;
    const offenders: string[] = [];

    for (const file of allSourceFiles) {
      if (allowedLegacyFiles.has(file)) continue;
      const content = readFileSync(file, "utf8");
      if (legacySymbolsRegex.test(content)) {
        offenders.push(file);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Unapproved files referencing legacy seat geometry constants: ${offenders.join(", ")}`
    );
  });

  it("Req 65: source guard prevents fixed CAPACITY rows*letters on current Admin flight surfaces", () => {
    const adminFlightSurfaces = [
      join(srcDir, "routes", "{-$locale}.admin.flights.$flightId.tsx"),
      join(srcDir, "routes", "{-$locale}.admin.flights.index.tsx"),
      join(srcDir, "routes", "{-$locale}.admin.index.tsx"),
    ];

    for (const file of adminFlightSurfaces) {
      const content = readFileSync(file, "utf8");
      assert.equal(
        content.includes("SEAT_ROWS * SEAT_LETTERS"),
        false,
        `${file} must not compute capacity using SEAT_ROWS * SEAT_LETTERS`
      );
      assert.equal(
        /const CAPACITY\s*=/.test(content),
        false,
        `${file} must not define fixed const CAPACITY`
      );
      assert.equal(
        content.includes("resolveFlightCapacity"),
        true,
        `${file} must use resolveFlightCapacity for dynamic fleet capacity calculation`
      );
    }
  });

  it("Req 66: Schedule source guard prevents ops.aircraft", () => {
    const schedulesRoute = join(srcDir, "routes", "{-$locale}.admin.schedules.tsx");
    const content = readFileSync(schedulesRoute, "utf8");
    assert.doesNotMatch(content, /a\.model === draft\.aircraft/, "Schedule legacy names only use the fixed known-name mapping");
    assert.equal(
      content.includes("ops.aircraft"),
      false,
      "admin.schedules.tsx must not reference ops.aircraft"
    );
    assert.equal(
      content.includes("useFleetQuery"),
      true,
      "admin.schedules.tsx must use useFleetQuery for fleet aircraft options"
    );
  });

  it("Req 67: New reassignment source guard requires stable Fleet ID, no free-text-only writer", () => {
    const quickEdit = join(srcDir, "components", "admin", "flight-quick-edit.tsx");
    const content = readFileSync(quickEdit, "utf8");
    assert.equal(
      content.includes("ops.aircraft"),
      false,
      "flight-quick-edit.tsx must not reference ops.aircraft"
    );
    assert.equal(
      content.includes("useFleetQuery"),
      true,
      "flight-quick-edit.tsx must use useFleetQuery for aircraft options"
    );
    assert.doesNotMatch(content, /a\.model === flight\.aircraft/, "unknown legacy names cannot identify arbitrary Fleet airframes");
    // Aircraft input must be a select dropdown (from fleet choices), not a free-text input
    assert.equal(
      /<input[^>]*aircraft/i.test(content),
      false,
      "flight-quick-edit.tsx must not contain a free-text input for aircraft"
    );
    assert.equal(
      /<select[^>]*aircraft/i.test(content) || /<select[^>]*f-aircraft/i.test(content),
      true,
      "flight-quick-edit.tsx must contain a select element for aircraft"
    );
  });
});
