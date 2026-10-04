import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dashboardReadState, dashboardMetric } from "../../src/lib/admin-dashboard-state.ts";
import { validateFlightEdit } from "../../src/lib/admin-flight-edit.ts";
const source = (file: string) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const ready = { isError: false, isPending: false, isSuccess: true };
describe("Phase 6B1 Correction 01 — Dashboard read truth", () => {
  it("successful empty queries remain ready with legitimate zero metrics", () => {
    assert.equal(dashboardReadState(ready, ready), "ready");
    assert.equal(dashboardMetric("ready", 0), 0);
  });
  it("one loading flight direction makes operations loading", () => {
    assert.equal(dashboardReadState(ready, { isError: false, isPending: true, isSuccess: false }), "loading");
    assert.equal(dashboardMetric("loading", 0), null);
  });
  it("a flight error never becomes successful empty operations", () => {
    assert.equal(dashboardReadState(ready, { isError: true, isPending: false, isSuccess: false }), "error");
    assert.equal(dashboardMetric("error", 0), null);
  });
  it("a booking/refetch failure with cached data is still unavailable", () => {
    assert.equal(dashboardReadState({ ...ready, isError: true }), "error");
    assert.equal(dashboardMetric("error", 12), null);
  });
  it("unresolved reads cannot become zero-state success", () => {
    assert.equal(dashboardReadState({ ...ready, isSuccess: false }), "loading");
  });
  it("Dashboard exposes separate statuses and guards healthy operational/commercial panels", () => {
    const data = source("src/components/admin/dashboard-data.ts"), route = source("src/routes/{-$locale}.admin.index.tsx");
    assert.match(data, /operationsStatus = dashboardReadState\(departuresQuery, arrivalsQuery\)/);
    assert.match(data, /commercialStatus = dashboardReadState\(bookingsQuery\)/);
    assert.match(data, /dashboardMetric\(operationsStatus, departures.length\)/);
    assert.match(data, /dashboardMetric\(commercialStatus, daily.bookingsToday\)/);
    assert.match(route, /const operationPanel = data.operationsStatus !== "ready"/);
    assert.match(route, /const recentBookingsPanel = !commercialReady/);
    assert.match(route, /dashboard-ops-state/);
    assert.match(route, /dashboard-commercial-state/);
    assert.match(route, /adm.dash.attentionPartial/);
  });
});
describe("Phase 6B1 Correction 01 — shared flight input policy", () => {
  it("accepts canonical trimmed gate and HH:mm values", () => {
    assert.equal(validateFlightEdit({ gate: " G1 ", revised: " 23:59 " }), null);
    assert.equal(validateFlightEdit({ gate: "", revised: "" }), null);
    assert.equal(validateFlightEdit({ gate: "  ", revised: "  " }), null);
  });
  it("rejects invalid gate, including punctuation and overlong values", () => {
    for (const gate of ["A!", "A 1", "ABCDEFGHIJK"]) assert.equal(validateFlightEdit({ gate, revised: "" }), "gate");
  });
  it("rejects invalid revised times", () => {
    for (const revised of ["24:00", "12:60", "1:00", "not-time"]) assert.equal(validateFlightEdit({ gate: "A1", revised }), "revised");
  });
  it("reports the first invalid input in DOM field order", () => {
    assert.equal(validateFlightEdit({ gate: "A!", revised: "25:99" }), "gate");
  });
  it("Dashboard validation occurs before mutation and focuses/describes only invalid fields", () => {
    const route = source("src/routes/{-$locale}.admin.index.tsx");
    assert.ok(route.indexOf("validateFlightEdit(edit)") < route.indexOf("overrideMutation.mutateAsync"));
    assert.match(route, /setInvalidField\(null\)/);
    assert.match(route, /invalid === "gate" \? "qe-gate" : "qe-revised"/);
    assert.match(route, /aria-invalid=\{invalidField === "gate"/);
    assert.match(route, /aria-describedby=\{invalidField === "revised"/);
    const catchBlock = route.slice(route.indexOf("} catch (err)"), route.indexOf("const summaryMetrics"));
    assert.doesNotMatch(catchBlock, /setInvalidField\(/);
    assert.match(catchBlock, /adm.ops.saveError/);
    assert.match(source("src/components/admin/flight-quick-edit.tsx"), /validateFlightEdit\(form\)/);
  });
  it("both responsive gate variants use flight/variant-specific descriptions", () => {
    const route = source("src/routes/{-$locale}.admin.flights.index.tsx");
    assert.equal((route.match(/aria-invalid=\{editingGate.invalid/g) ?? []).length, 2);
    for (const variant of ["desktop", "mobile"]) {
      assert.ok(route.includes('aria-describedby={editingGate.invalid ? "gate-error-' + variant + '-" + f.id'));
      assert.ok(route.includes('id={"gate-error-' + variant + '-" + f.id}'));
    }
    assert.doesNotMatch(route, /id="gate-validation-error"/);
  });
});
describe("Phase 6B1 Correction 01 — documentation current authority", () => {
  it("all authoritative documents identify AdminProvider as staff/session, not flight proxy", () => {
    for (const file of ["README.md", "PRODUCT.md", "roadmap.md", "docs/ARCHITECTURE.md", "docs/DATA_FLOW.md", "docs/CANONICAL_REPOSITORIES.md", "docs/SCHEDULE_MODEL.md"]) {
      const doc = source(file);
      assert.match(doc, /staff session \/ RBAC simulation/);
      assert.match(doc, /does not own or proxy canonical flight overrides/i);
      assert.match(doc, /FlightRepository/);
      assert.match(doc, /ScheduleRepository/);
      assert.doesNotMatch(doc, /Flight operational override mutations delegate directly to/);
      assert.doesNotMatch(doc, /legacy schedule search pending Phase 5/);
    }
  });
  it("historical facade description remains historical while current wired views are canonical", () => {
    const doc = source("docs/CANONICAL_REPOSITORIES.md");
    assert.match(doc.split("## 2.")[0] ?? "", /Prior to Phase 4/);
    const current = doc.slice(doc.indexOf("## 6."), doc.indexOf("## Phase 6A"));
    assert.match(current, /not a flight writer or proxy/);
    assert.doesNotMatch(current, /legacy store providers act as single-writer/);
    assert.doesNotMatch(current, /Manages non-migrated entities/);
  });
});
