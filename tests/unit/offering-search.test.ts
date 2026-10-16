import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getExactOfferings,
  getNearestPreviousDates,
  getNearestNextDates,
  calendarDayDifference,
  getRankedAlternatives,
  isReturnChronologyValid,
  filterValidReturnOfferings,
} from "../../src/lib/offerings/search.ts";
import type { DatedOffering } from "../../src/lib/offerings/schema.ts";

function createMockOffering(overrides: Partial<DatedOffering>): DatedOffering {
  return {
    id: "svc1-dGVzdC1pZA-2026-10-20",
    scheduleId: "sch-test-01",
    date: "2026-10-20",
    number: "PS 204",
    direction: "out",
    originCode: "GZA",
    destinationCode: "AMM",
    departTime: "10:00",
    arriveTime: "11:00",
    durationMinutes: 60,
    aircraftId: "ac-737",
    aircraft: "Boeing 737",
    layout: {
      aircraftId: "ac-737",
      rows: 20,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [{ id: "economy", firstRow: 1, lastRow: 20 }],
      extraLegroomRows: [],
      unavailable: [],
    },
    revisions: { fleet: 1, network: 1, schedules: 1 },
    classification: "commemorative",
    priceMinor: 0,
    originTimezone: "Asia/Gaza",
    destinationTimezone: "Asia/Amman",
    departAt: "2026-10-20T10:00:00+03:00",
    arriveAt: "2026-10-20T11:00:00+03:00",
    arrivalDate: "2026-10-20",
    ...overrides,
  };
}

describe("Offering pure search logic", () => {
  it("filters exact date offerings correctly", () => {
    const o1 = createMockOffering({ id: "o1", date: "2026-10-20" });
    const o2 = createMockOffering({ id: "o2", date: "2026-10-22" });
    const o3 = createMockOffering({ id: "o3", date: "2026-10-20", number: "PS 206" });

    const results = getExactOfferings([o1, o2, o3], "2026-10-20");
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((o) => o.id), ["o1", "o3"]);

    const empty = getExactOfferings([o1, o2, o3], "2026-10-21");
    assert.equal(empty.length, 0);
  });

  it("calculates calendar day differences accurately", () => {
    assert.equal(calendarDayDifference("2026-10-20", "2026-10-20"), 0);
    assert.equal(calendarDayDifference("2026-10-20", "2026-10-25"), 5);
    assert.equal(calendarDayDifference("2026-10-25", "2026-10-20"), -5);
    assert.equal(calendarDayDifference("2026-10-31", "2026-11-02"), 2);
  });

  it("finds nearest previous and next available dates ranked closest first", () => {
    const dates = ["2026-10-15", "2026-10-18", "2026-10-20", "2026-10-23", "2026-10-27"];

    const prev = getNearestPreviousDates(dates, "2026-10-20", 2);
    assert.deepEqual(prev, ["2026-10-18", "2026-10-15"]);

    const next = getNearestNextDates(dates, "2026-10-20", 2);
    assert.deepEqual(next, ["2026-10-23", "2026-10-27"]);
  });

  it("ranks alternatives by calendar proximity", () => {
    const oPrev = createMockOffering({ id: "prev", date: "2026-10-18" });
    const oNext1 = createMockOffering({ id: "next1", date: "2026-10-22" }); // 2 days away
    const oNext2 = createMockOffering({ id: "next2", date: "2026-10-25" }); // 5 days away
    const availableDates = ["2026-10-18", "2026-10-22", "2026-10-25"];

    const alternatives = getRankedAlternatives([oPrev, oNext1, oNext2], availableDates, "2026-10-20");

    assert.equal(alternatives.length, 3);
    // 2026-10-18 is 2 days away, 2026-10-22 is 2 days away. Closest first:
    assert.equal(alternatives[0].date, "2026-10-22");
    assert.equal(alternatives[0].differenceDays, 2);
    assert.equal(alternatives[1].date, "2026-10-18");
    assert.equal(alternatives[1].differenceDays, 2);
    assert.equal(alternatives[2].date, "2026-10-25");
    assert.equal(alternatives[2].differenceDays, 5);
  });

  it("enforces return chronology across timezones and flight arrival times", () => {
    // Outbound arrives 2026-10-20 at 14:00 UTC (17:00 local Amman +03:00)
    const outbound = createMockOffering({
      id: "out",
      departAt: "2026-10-20T14:00:00+03:00",
      arriveAt: "2026-10-20T17:00:00+03:00",
      arrivalDate: "2026-10-20",
      originCode: "GZA",
      destinationCode: "AMM",
    });

    // Return departing earlier same day at 12:00 UTC (15:00 local +03:00) -> INVALID
    const returnEarly = createMockOffering({
      id: "ret-early",
      departAt: "2026-10-20T15:00:00+03:00",
      arriveAt: "2026-10-20T18:00:00+03:00",
      direction: "in",
      originCode: "AMM",
      destinationCode: "GZA",
    });
    assert.equal(isReturnChronologyValid(outbound, returnEarly), false);

    // Return departing later same day at 16:00 UTC (19:00 local +03:00) -> VALID
    const returnLaterSameDay = createMockOffering({
      id: "ret-later",
      departAt: "2026-10-20T19:00:00+03:00",
      arriveAt: "2026-10-20T22:00:00+03:00",
      direction: "in",
      originCode: "AMM",
      destinationCode: "GZA",
    });
    assert.equal(isReturnChronologyValid(outbound, returnLaterSameDay), true);

    // Return departing next day -> VALID
    const returnNextDay = createMockOffering({
      id: "ret-next",
      date: "2026-10-21",
      departAt: "2026-10-21T09:00:00+03:00",
      arriveAt: "2026-10-21T12:00:00+03:00",
      direction: "in",
      originCode: "AMM",
      destinationCode: "GZA",
    });
    assert.equal(isReturnChronologyValid(outbound, returnNextDay), true);

    // Filter list
    const filtered = filterValidReturnOfferings([returnEarly, returnLaterSameDay, returnNextDay], outbound);
    assert.deepEqual(filtered.map((r) => r.id), ["ret-later", "ret-next"]);
  });

  it("fails closed on missing/invalid timing, identical IDs, unrelated routes, and equal departure times", () => {
    const outbound = createMockOffering({
      id: "out-base",
      originCode: "GZA",
      destinationCode: "AMM",
      departAt: "2026-10-20T10:00:00+03:00",
      arriveAt: "2026-10-20T11:00:00+03:00",
    });

    // 1. Identical IDs
    assert.equal(isReturnChronologyValid(outbound, { ...outbound, originCode: "AMM", destinationCode: "GZA", departAt: "2026-10-20T15:00:00+03:00" }), false);

    // 2. Unrelated / non-reversed route (e.g. return origin is CAI instead of AMM)
    const unrelatedReturn = createMockOffering({
      id: "ret-unrelated",
      originCode: "CAI",
      destinationCode: "GZA",
      departAt: "2026-10-20T15:00:00+03:00",
    });
    assert.equal(isReturnChronologyValid(outbound, unrelatedReturn), false);

    // 3. Same route direction (both out: GZA -> AMM)
    const forwardReturn = createMockOffering({
      id: "ret-forward",
      originCode: "GZA",
      destinationCode: "AMM",
      departAt: "2026-10-20T15:00:00+03:00",
    });
    assert.equal(isReturnChronologyValid(outbound, forwardReturn), false);

    // 4. Missing outbound arriveAt
    assert.equal(isReturnChronologyValid({ ...outbound, arriveAt: undefined }, createMockOffering({ id: "ret-1", originCode: "AMM", destinationCode: "GZA", departAt: "2026-10-20T15:00:00+03:00" })), false);

    // 5. Missing return departAt
    assert.equal(isReturnChronologyValid(outbound, createMockOffering({ id: "ret-2", originCode: "AMM", destinationCode: "GZA", departAt: undefined })), false);

    // 6. Invalid ISO timestamp strings
    assert.equal(isReturnChronologyValid({ ...outbound, arriveAt: "invalid-timestamp" }, createMockOffering({ id: "ret-3", originCode: "AMM", destinationCode: "GZA", departAt: "2026-10-20T15:00:00+03:00" })), false);
    assert.equal(isReturnChronologyValid(outbound, createMockOffering({ id: "ret-4", originCode: "AMM", destinationCode: "GZA", departAt: "not-a-date" })), false);

    // 7. Equal return departure and outbound arrival instant
    const exactEqualReturn = createMockOffering({
      id: "ret-equal",
      originCode: "AMM",
      destinationCode: "GZA",
      departAt: "2026-10-20T11:00:00+03:00",
    });
    assert.equal(isReturnChronologyValid(outbound, exactEqualReturn), false);

    // 8. Positive case across different timezone offsets (e.g. outbound arrives at 14:00 UTC (+03:00 local 17:00), return departs London at 15:00 UTC (+01:00 local 16:00))
    const lonOutbound = createMockOffering({
      id: "out-lon",
      originCode: "GZA",
      destinationCode: "LON",
      arriveAt: "2026-10-20T17:00:00+03:00", // 14:00:00 UTC
    });
    const lonReturn = createMockOffering({
      id: "ret-lon",
      originCode: "LON",
      destinationCode: "GZA",
      departAt: "2026-10-20T16:00:00+01:00", // 15:00:00 UTC (1 hour after arrival!)
    });
    assert.equal(isReturnChronologyValid(lonOutbound, lonReturn), true);
  });

  it("handles overnight outbound flights correctly", () => {
    // Overnight flight: departs 2026-10-20 23:00, arrives 2026-10-21 03:00
    const overnightOutbound = createMockOffering({
      id: "out-night",
      originCode: "GZA",
      destinationCode: "AMM",
      date: "2026-10-20",
      departAt: "2026-10-20T23:00:00+03:00",
      arriveAt: "2026-10-21T03:00:00+03:00",
      arrivalDate: "2026-10-21",
    });

    // Flight on 2026-10-21 morning at 02:00 (before arrival) -> INVALID
    const returnMorningBefore = createMockOffering({
      id: "ret-0200",
      originCode: "AMM",
      destinationCode: "GZA",
      date: "2026-10-21",
      departAt: "2026-10-21T02:00:00+03:00",
      arriveAt: "2026-10-21T06:00:00+03:00",
    });
    assert.equal(isReturnChronologyValid(overnightOutbound, returnMorningBefore), false);

    // Flight on 2026-10-21 morning at 06:00 (after arrival) -> VALID
    const returnMorningAfter = createMockOffering({
      id: "ret-0600",
      originCode: "AMM",
      destinationCode: "GZA",
      date: "2026-10-21",
      departAt: "2026-10-21T06:00:00+03:00",
      arriveAt: "2026-10-21T10:00:00+03:00",
    });
    assert.equal(isReturnChronologyValid(overnightOutbound, returnMorningAfter), true);
  });
});

describe("Offering availability wire schema", () => {
  it("validates a compliant availability payload", async () => {
    const { offeringAvailabilityWireSchema } = await import("../../src/lib/offerings/schema.ts");
    const { encodeDatedOfferingId } = await import("../../src/lib/offerings/codec.ts");
    const { seedFleetLayouts } = await import("../../src/lib/fleet/seed.ts");

    const layout = seedFleetLayouts().a320neo;
    const scheduleId = "sch-amm-01";
    const date = "2026-10-20";
    const validOffering = {
      id: encodeDatedOfferingId(scheduleId, date),
      scheduleId,
      date,
      number: "PS 204",
      direction: "out" as const,
      originCode: "GZA" as const,
      destinationCode: "AMM" as const,
      departTime: "10:00",
      arriveTime: "11:00",
      durationMinutes: 60,
      aircraftId: "a320neo",
      aircraft: "Airbus A320neo",
      layout,
      revisions: { fleet: 1, network: 1, schedules: 1 },
      classification: "commemorative" as const,
      priceMinor: 0 as const,
      originTimezone: "Asia/Gaza",
      destinationTimezone: "Asia/Amman",
      departAt: "2026-10-20T10:00:00+03:00",
      arriveAt: "2026-10-20T11:00:00+03:00",
      arrivalDate: "2026-10-20",
    };

    const payload = {
      origin: "GZA",
      destination: "AMM",
      date: "2026-10-20",
      days: 28,
      rangeStart: "2026-10-18",
      rangeEnd: "2026-11-14",
      offerings: [validOffering],
      availableDates: ["2026-10-20"],
    };

    const parsed = offeringAvailabilityWireSchema.safeParse(payload);
    assert.equal(parsed.success, true);
  });

  it("rejects payloads violating invariants", async () => {
    const { offeringAvailabilityWireSchema } = await import("../../src/lib/offerings/schema.ts");
    const { encodeDatedOfferingId } = await import("../../src/lib/offerings/codec.ts");
    const { seedFleetLayouts } = await import("../../src/lib/fleet/seed.ts");

    const layout = seedFleetLayouts().a320neo;
    const validOffering = {
      id: encodeDatedOfferingId("sch-amm-01", "2026-10-20"),
      scheduleId: "sch-amm-01",
      date: "2026-10-20",
      number: "PS 204",
      direction: "out" as const,
      originCode: "GZA" as const,
      destinationCode: "AMM" as const,
      departTime: "10:00",
      arriveTime: "11:00",
      durationMinutes: 60,
      aircraftId: "a320neo",
      aircraft: "Airbus A320neo",
      layout,
      revisions: { fleet: 1, network: 1, schedules: 1 },
      classification: "commemorative" as const,
      priceMinor: 0 as const,
      originTimezone: "Asia/Gaza",
      destinationTimezone: "Asia/Amman",
      departAt: "2026-10-20T10:00:00+03:00",
      arriveAt: "2026-10-20T11:00:00+03:00",
      arrivalDate: "2026-10-20",
    };

    const base = {
      origin: "GZA" as const,
      destination: "AMM" as const,
      date: "2026-10-20",
      days: 28,
      rangeStart: "2026-10-18",
      rangeEnd: "2026-11-14",
      offerings: [validOffering],
      availableDates: ["2026-10-20"],
    };

    // 1. Range start > range end
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, rangeStart: "2026-11-20", rangeEnd: "2026-11-14" }).success, false);
    // 2. Range span > 60 days
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, rangeStart: "2026-10-01", rangeEnd: "2026-12-15" }).success, false);
    // 3. Days < 1
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, days: 0 }).success, false);
    // 4. Days > 60
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, days: 61 }).success, false);
    // 5. Incoherent route (neither GZA)
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, origin: "AMM", destination: "CAI" }).success, false);
    // 6. Incoherent route (both GZA)
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, origin: "GZA", destination: "GZA" }).success, false);
    // 7. Duplicate offering IDs
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, offerings: [validOffering, validOffering] }).success, false);
    // 8. Offering origin mismatch with envelope
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, offerings: [{ ...validOffering, originCode: "CAI" }] }).success, false);
    // 9. Offering date outside range
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, offerings: [{ ...validOffering, date: "2026-12-01", id: encodeDatedOfferingId("sch-amm-01", "2026-12-01") }] }).success, false);
    // 10. Offering missing projected timing
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, offerings: [{ ...validOffering, departAt: undefined }] }).success, false);
    // 11. availableDates unsorted
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, availableDates: ["2026-10-22", "2026-10-20"] }).success, false);
    // 12. availableDates does not match offerings dates set
    assert.equal(offeringAvailabilityWireSchema.safeParse({ ...base, availableDates: ["2026-10-20", "2026-10-21"] }).success, false);
  });
});
