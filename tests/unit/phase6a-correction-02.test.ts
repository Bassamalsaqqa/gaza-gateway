import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  departuresOn,
  todayISO,
  addDaysISO,
  cabinZone,
  isSeatAvailable,
} from "../../src/lib/data.ts";
import { normalizeBooking, type Booking } from "../../src/lib/domain/booking.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { buildAdminCheckInRows, adminCheckInStatusKey } from "../../src/lib/domain/desk.ts";
import {
  validateUpdateSeatsAssignments,
  SeatValidationError,
} from "../../src/lib/domain/seat-validation.ts";
import { validateBookingContact } from "../../src/lib/domain/booking-validation.ts";
import {
  commercialFieldErrors,
  commercialErrorKey,
} from "../../src/lib/domain/commercial-errors.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import { StorageCommitError, RepoStorageCoordinator } from "../../src/lib/repositories/storage.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";

const source = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
function booking(): Booking {
  const f = departuresOn(addDaysISO(todayISO(), 5))[0]!;
  return normalizeBooking({
    ref: "GZA-C202",
    status: "confirmed",
    createdAt: "2026-01-01T10:00:00Z",
    outbound: f,
    inbound: null,
    fareId: "classic",
    channel: "desk",
    ownerEmail: null,
    criteria: {
      tripType: "oneway",
      origin: "GZA",
      destination: f.destinationCode,
      departDate: f.date,
      returnDate: "",
      cabin: "economy",
      adults: 2,
      children: 0,
      infants: 0,
    },
    passengers: [0, 1].map((i) => ({
      id: `c2-${i}`,
      type: "adult",
      firstName: "Audit",
      lastName: "Example",
      dob: "1980-01-01",
      nationality: "PS",
      document: "DOC",
    })),
    seats: {},
    extras: { pax: [] },
    contact: { email: "c2@example.com", phone: "" },
    checkedIn: { out: [], in: [] },
    total: 100,
  })!;
}
function seat(b: Booking): string {
  const zone = cabinZone("economy");
  for (let row = zone.firstRow; row <= zone.lastRow; row++)
    for (const l of ["A", "B", "C", "D", "E", "F"])
      if (isSeatAvailable(b.outbound.id, row, l)) return `${row}${l}`;
  throw Error("No fixture seat");
}
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw Error("Expected validation failure");
}

describe("Phase 6A Correction 02 — truthful commercial presentation", () => {
  test("canonical override preserves an intentionally empty gate; desk cannot invent A1", async () => {
    const f = booking().outbound;
    const repo = new LocalFlightRepository(new RepoStorageCoordinator({ inMemoryOnly: true }));
    await repo.setOverride(f.id, { gate: "" });
    assert.equal((await repo.getFlightById(f.id))!.gate, "");
    assert.equal((await repo.getOverride(f.id))!.gate, "");
    const route = source("src/routes/{-$locale}.admin.check-in.tsx");
    assert.ok(!route.includes('f.gate || "A1"'));
    assert.ok(route.includes('f.gate || "—"'));
    await repo.setOverride(f.id, { gate: "A1" });
    assert.equal((await repo.getFlightById(f.id))!.gate, "A1");
    repo.destroy();
  });
  test("too early, closed and operationally unavailable retain distinct canonical reasons", () => {
    const b = booking(),
      epoch = flightDepartureEpoch(b.outbound);
    const early = buildAdminCheckInRows(b.outbound, [b], epoch - 48 * 3600000)[0]!;
    const closed = buildAdminCheckInRows(b.outbound, [b], epoch - 30 * 60000)[0]!;
    const unavailable = buildAdminCheckInRows(
      { ...b.outbound, status: "Cancelled" },
      [b],
      epoch - 2 * 3600000,
    )[0]!;
    assert.equal(early.eligibility.reason, "too_early");
    assert.equal(adminCheckInStatusKey(early), "a2.ci.st.early");
    assert.equal(adminCheckInStatusKey(closed), "a2.ci.st.closed");
    assert.equal(adminCheckInStatusKey(unavailable), "a2.ci.st.unavailable");
    for (const dict of [admin2En, admin2Ar])
      assert.notEqual(dict["a2.ci.st.early"], dict["a2.ci.st.closed"]);
  });
  test("Date label is natural language; only technical input is LTR", () => {
    const route = source("src/routes/{-$locale}.admin.check-in.tsx");
    assert.ok(!route.includes('<Ltr>{t("flights.date")}</Ltr>'));
    assert.match(route, /id="desk-date"\s+dir="ltr"/);
  });
  test("departures wording works for selected dates in both languages", () => {
    assert.ok(!/today/i.test(admin2En["a2.ci.today"]! + admin2En["a2.ci.sub"]!));
    assert.ok(!/اليوم/.test(admin2Ar["a2.ci.today"]! + admin2Ar["a2.ci.sub"]!));
  });
  test("boarding pass and Counter labels expose availability/creation, not issuance", () => {
    for (const dict of [admin2En, admin2Ar]) {
      for (const key of [
        "a2.ci.issue",
        "a2.bd.bp.issued",
        "a2.bd.bp.notIssued",
        "a2.nb.issueDesk",
        "a2.nb.nextReview",
      ])
        assert.ok(!/issu|صادر|صدرت|تُصدر|إصدار/i.test(dict[key]!));
      assert.ok(!/nothing is stored|لا يُحفظ شيء/i.test(dict["a2.nb.successBody"]!));
    }
    assert.equal(admin2En["a2.nb.issueDesk"], "Create desk booking");
    assert.equal(admin2En["a2.bd.bp.notIssued"], "Available after check-in");
  });
  test("contact validation carries only the addressable email/phone field", () => {
    assert.deepEqual(
      commercialFieldErrors(caught(() => validateBookingContact({ email: "bad", phone: "" }))),
      { email: "a6.err.contact" },
    );
    assert.deepEqual(
      commercialFieldErrors(
        caught(() => validateBookingContact({ email: "valid@example.com", phone: "x".repeat(51) })),
      ),
      { phone: "a6.err.contact" },
    );
  });
  test("malformed seat identifies its exact leg/passenger field", () => {
    const b = booking();
    const error = caught(() =>
      validateUpdateSeatsAssignments(b, { "out-1": "garbage" }, b.outbound),
    );
    assert.ok(error instanceof SeatValidationError);
    assert.deepEqual(commercialFieldErrors(error), { "out-1": "a6.err.seats" });
  });
  test("duplicate seats identify only both affected assignments", () => {
    const b = booking(),
      s = seat(b);
    const error = caught(() =>
      validateUpdateSeatsAssignments(b, { "out-0": s, "out-1": s }, b.outbound),
    );
    assert.deepEqual(commercialFieldErrors(error), {
      "out-0": "a6.err.seats",
      "out-1": "a6.err.seats",
    });
  });
  test("storage, missing booking, changed flight and generic failures carry no invalid field", () => {
    for (const error of [
      new StorageCommitError("quota"),
      new Error("Booking not found"),
      new Error("Flight unavailable"),
      new Error("retry"),
    ])
      assert.deepEqual(commercialFieldErrors(error), {});
    assert.equal(commercialErrorKey(new StorageCommitError("quota")), "a6.err.storage");
  });
  test("missing effective flight stays a general error, even during a seat edit", () => {
    const b = booking();
    const error = caught(() => validateUpdateSeatsAssignments(b, { "out-0": seat(b) }, null));
    assert.deepEqual(commercialFieldErrors(error), {});
  });
  test("fields use associated errors; mutation alerts do not set blanket invalidity", () => {
    const input = source("src/components/admin/commercial-fields.tsx");
    assert.ok(input.includes("aria-invalid={error ? true : undefined}"));
    assert.ok(input.includes("aria-describedby={error ? errorId"));
    for (const route of ["check-in", "bookings.$ref", "bookings.new"]) {
      const text = source(`src/routes/{-$locale}.admin.${route}.tsx`);
      assert.ok(!/error=\{(?:sheetError|mutationError)\s*\?/.test(text));
      assert.ok(text.includes('role="alert"'));
      assert.ok(text.includes("commercialFieldErrors"));
    }
  });
  test("Phase 6A documentation records accepted source status", () => {
    const doc = source("docs/DATA_FLOW.md");
    assert.ok(!/Phase 6A is uncommitted and unstaged/.test(doc));
    assert.ok(!/Implemented \/ Awaiting Independent Review/.test(doc));
    assert.ok(doc.includes("Complete / Accepted Source"));
    assert.ok(doc.includes("59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea"));
    assert.ok(doc.includes("898adc36701f138b54787fa14caecf55321b453f"));
    assert.ok(doc.includes("2e166ed815010728d25a891939b84db4109ae65e"));
    // Phase 6B/6C/7/7B remain Planned / Unstarted
    assert.ok(/Phase 6B[^.]+Planned \/ Unstarted/.test(doc));
  });
  test("authoritative current-status blocks consistently record accepted Phase 6A", () => {
    // Scope current metadata, status tables and checkpoint paragraphs, not historical audits.
    const currentBlocks = (doc: string) => doc.split(/\r?\n/).filter((line) =>
      /^> \*\*(?:Engineering Status|Current Status|Document Status|Status|Production \/ Source Checkpoint|Immediate Next Step)\*\*:/.test(line) ||
      /^\|.*Phase 6A/.test(line) ||
      /^Phase 5D is Complete/.test(line) ||
      /^- \*\*(?:Master Roadmap Progression|Accepted Phase 5D Production \/ Source Checkpoint)\*\*:/.test(line),
    ).join("\n");
    const stale = [
      /Implemented \/ Awaiting Independent Review/i,
      /Implemented \/ Awaiting Review/i,
      /Phase 6A remains on its feature branch awaiting (?:independent )?review/i,
      /Independent review of Phase 6A/i,
      /Phase 6 (?:— Admin Workflows Convergence \()?Planned \/ Unstarted/i,
      /Phase 6 and Phase 7\/7B remain Planned \/ Unstarted/i,
    ];
    for (const path of [
      "README.md", "roadmap.md", "PRODUCT.md", "docs/ARCHITECTURE.md",
      "docs/CANONICAL_REPOSITORIES.md", "docs/DATA_FLOW.md", "docs/SETTINGS_MODEL.md",
      "docs/CONTACT_MODEL.md", "docs/CONTENT_MODEL.md",
    ]) {
      const doc = source(path);
      const current = currentBlocks(doc);
      assert.ok(current.includes("Complete / Accepted Source"), path);
      assert.ok(current.includes("59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea"), path);
      assert.ok(current.includes("898adc36701f138b54787fa14caecf55321b453f"), path);
      assert.ok(current.includes("2e166ed815010728d25a891939b84db4109ae65e"), path);
      for (const phrase of stale) assert.ok(!phrase.test(current), `${path}: ${phrase}`);
      assert.ok(doc.includes("Planned / Unstarted"), path);
    }
    const inventory = source("docs/CONTENT_MODEL.md");
    assert.match(inventory, /Admin Check-in Desk[^\n]+Canonical repository-backed functionality/);
    assert.ok(!/Check-in desk, analytics, CRM and operational simulation/.test(inventory));
    // An explicitly historical paragraph is outside the current-status contract.
    assert.equal(currentBlocks("## Historical review\nIn the prior review, Phase 6A was Implemented / Awaiting Independent Review."), "");
  });
});
