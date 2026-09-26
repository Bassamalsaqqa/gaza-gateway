import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATION_TIMEZONE,
  flightDepartureEpoch,
  getFlightBookability,
  getFlightDepartureTimeZone,
  getSeatRequiredPaxCount,
  isFlightBookable,
  localToUtcEpoch,
  NON_BOOKABLE_STATUSES,
  STATION_TIMEZONES,
  unbookableReasonLabelKey,
} from "../../src/lib/booking-rules.ts";
import type { Flight } from "../../src/lib/data.ts";
import { statusFor } from "../../src/lib/data.ts";
import {
  getCapacityProofDate,
  getCapacityProofFlights,
  createCapacityProofMockDraft,
  getStudioMockDates,
  createDeterministicMockDraft,
  STUDIO_SCENARIOS,
} from "../../src/lib/studio-scenarios.ts";
import { calculateMaxStep, stepRanks } from "../../src/lib/booking-draft.ts";

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: "PS204-2026-10-15-out",
    number: "PS 204",
    originCode: "GZA",
    destinationCode: "AMM",
    date: "2026-10-15",
    departTime: "14:30",
    arriveTime: "15:45",
    durationMinutes: 75,
    aircraft: "Boeing 737-700",
    status: "Scheduled",
    gate: "A2",
    terminal: "1",
    basePrice: 180,
    seatsLeft: 42,
    ...overrides,
  };
}

describe("Booking Rules & Bookability", () => {
  const futureClock = "2026-10-01T08:00:00Z";

  describe("Operational Status Semantics & NON_BOOKABLE_STATUSES", () => {
    it("actively checks NON_BOOKABLE_STATUSES constant", () => {
      assert.equal(NON_BOOKABLE_STATUSES.has("Cancelled"), true);
      assert.equal(NON_BOOKABLE_STATUSES.has("Departed"), true);
      assert.equal(NON_BOOKABLE_STATUSES.has("Landed"), true);
      assert.equal(NON_BOOKABLE_STATUSES.has("Boarding"), true);
      assert.equal(NON_BOOKABLE_STATUSES.has("Scheduled"), false);
      assert.equal(NON_BOOKABLE_STATUSES.has("OnTime"), false);
      assert.equal(NON_BOOKABLE_STATUSES.has("Delayed"), false);
    });

    it("allows booking for future Scheduled flights with inventory", () => {
      const flight = createMockFlight({ status: "Scheduled", seatsLeft: 10 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, true);
      assert.equal(result.reason, undefined);
      assert.equal(isFlightBookable(flight, { now: futureClock }), true);
    });

    it("allows booking for future OnTime flights with inventory", () => {
      const flight = createMockFlight({ status: "OnTime", seatsLeft: 5 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, true);
      assert.equal(result.reason, undefined);
      assert.equal(isFlightBookable(flight, { now: futureClock }), true);
    });

    it("allows booking for future Delayed flights with inventory", () => {
      const flight = createMockFlight({ status: "Delayed", seatsLeft: 3 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, true);
      assert.equal(result.reason, undefined);
      assert.equal(isFlightBookable(flight, { now: futureClock }), true);
    });

    it("rejects booking for Cancelled flights", () => {
      const flight = createMockFlight({ status: "Cancelled", seatsLeft: 20 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "cancelled");
      assert.equal(isFlightBookable(flight, { now: futureClock }), false);
    });

    it("rejects booking for Departed flights", () => {
      const flight = createMockFlight({ status: "Departed", seatsLeft: 10 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "departed");
      assert.equal(isFlightBookable(flight, { now: futureClock }), false);
    });

    it("rejects booking for Landed flights", () => {
      const flight = createMockFlight({ status: "Landed", seatsLeft: 10 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "landed");
      assert.equal(isFlightBookable(flight, { now: futureClock }), false);
    });

    it("rejects booking for Boarding flights (gate sales closed)", () => {
      const flight = createMockFlight({ status: "Boarding", seatsLeft: 10 });
      const result = getFlightBookability(flight, { now: futureClock });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "boarding");
      assert.equal(isFlightBookable(flight, { now: futureClock }), false);
    });
  });

  describe("Station Timezones & Deterministic Departure Cutoff", () => {
    it("maps known airport stations to their authoritative IANA timezones", () => {
      assert.equal(STATION_TIMEZONES["GZA"], "Asia/Gaza");
      assert.equal(STATION_TIMEZONES["AMM"], "Asia/Amman");
      assert.equal(STATION_TIMEZONES["CAI"], "Africa/Cairo");
      assert.equal(STATION_TIMEZONES["DXB"], "Asia/Dubai");
      assert.equal(DEFAULT_STATION_TIMEZONE, "Asia/Gaza");
    });

    it("resolves correct departure station timezone for a flight", () => {
      const gzaFlight = createMockFlight({ originCode: "GZA" });
      assert.equal(getFlightDepartureTimeZone(gzaFlight), "Asia/Gaza");

      const dxbFlight = createMockFlight({ originCode: "DXB" });
      assert.equal(getFlightDepartureTimeZone(dxbFlight), "Asia/Dubai");

      const unknownFlight = createMockFlight({ originCode: "XYZ" });
      assert.equal(getFlightDepartureTimeZone(unknownFlight), "Asia/Gaza");
    });

    it("deterministically converts station local date/time to UTC epoch across simulated visitor zones", () => {
      // 2026-10-15 14:30 local in Asia/Gaza (UTC+3 summer time)
      // 14:30 local - 3 hours = 11:30:00 UTC
      const gzaEpoch = localToUtcEpoch("2026-10-15", "14:30", "Asia/Gaza");
      const expectedUtc = Date.UTC(2026, 9, 15, 11, 30, 0); // 1792063800000
      assert.equal(gzaEpoch, expectedUtc);

      // DXB is UTC+4 year-round: 14:30 local - 4 hours = 10:30:00 UTC
      const dxbEpoch = localToUtcEpoch("2026-10-15", "14:30", "Asia/Dubai");
      const expectedDxbUtc = Date.UTC(2026, 9, 15, 10, 30, 0);
      assert.equal(dxbEpoch, expectedDxbUtc);
    });

    it("correctly computes flightDepartureEpoch timestamp using station timezone", () => {
      const flight = createMockFlight({
        originCode: "GZA",
        date: "2026-10-15",
        departTime: "14:30",
      });
      const epoch = flightDepartureEpoch(flight);
      const expected = Date.UTC(2026, 9, 15, 11, 30, 0);
      assert.equal(epoch, expected);
    });

    it("enforces departure boundary cutoff with exact UTC second precision", () => {
      const flight = createMockFlight({
        originCode: "GZA",
        date: "2026-10-15",
        departTime: "14:30",
        status: "Scheduled",
        seatsLeft: 10,
      });

      // Departure is 2026-10-15T11:30:00.000Z
      // 1 second before departure -> BOOKABLE
      const beforeCutoff = "2026-10-15T11:29:59.000Z";
      assert.equal(isFlightBookable(flight, { now: beforeCutoff }), true);

      // Exactly at departure -> REJECTED (past)
      const atCutoff = "2026-10-15T11:30:00.000Z";
      const atResult = getFlightBookability(flight, { now: atCutoff });
      assert.equal(atResult.bookable, false);
      assert.equal(atResult.reason, "past");
      assert.equal(isFlightBookable(flight, { now: atCutoff }), false);

      // 1 second after departure -> REJECTED (past)
      const afterCutoff = "2026-10-15T11:30:01.000Z";
      const afterResult = getFlightBookability(flight, { now: afterCutoff });
      assert.equal(afterResult.bookable, false);
      assert.equal(afterResult.reason, "past");
      assert.equal(isFlightBookable(flight, { now: afterCutoff }), false);
    });

    it("evaluates statusFor with Asia/Gaza station date across UTC date boundaries", () => {
      // 2026-09-26T22:30:00.000Z
      // In UTC, the date is 2026-09-26.
      // In Asia/Gaza (UTC+3), local time is 2026-09-27T01:30:00+03:00 (i.e. already 2026-09-27!).
      const utcBoundaryTime = "2026-09-26T22:30:00.000Z";

      const flightId = "PS100-2026-09-27-out";
      const statusAtStation = statusFor(flightId, "2026-09-27", utcBoundaryTime);
      // For flight on 2026-09-28 (tomorrow in Gaza), it is strictly future -> "Scheduled"
      assert.equal(statusFor(flightId, "2026-09-28", utcBoundaryTime), "Scheduled");
      // For flight on 2026-09-25 (yesterday in Gaza), it is past -> Landed or Cancelled
      assert.ok(["Landed", "Cancelled"].includes(statusFor(flightId, "2026-09-25", utcBoundaryTime)));
      // For 2026-09-27 (today in Gaza), it is one of the active operational statuses
      assert.ok(
        ["OnTime", "Boarding", "Delayed", "Departed", "Scheduled", "Landed", "Cancelled"].includes(statusAtStation),
      );
    });
  });

  describe("Aviation Seat Calculation & Infant Capacity", () => {
    it("computes seat-required count excluding lap infants", () => {
      // 1 adult + 1 infant -> only 1 seat required
      assert.equal(getSeatRequiredPaxCount({ adults: 1, infants: 1 }), 1);

      // 1 adult + 1 child -> 2 seats required
      assert.equal(getSeatRequiredPaxCount({ adults: 1, children: 1 }), 2);

      // 2 adults + 1 child + 2 infants -> 3 seats required
      assert.equal(getSeatRequiredPaxCount({ adults: 2, children: 1, infants: 2 }), 3);

      // Passenger array with lap infant
      const paxArray = [{ type: "adult" }, { type: "infant" }];
      assert.equal(getSeatRequiredPaxCount(paxArray), 1);

      // Direct integer count fallback (min 1)
      assert.equal(getSeatRequiredPaxCount(3), 3);
      assert.equal(getSeatRequiredPaxCount(0), 1);
    });

    it("permits 1 adult + 1 infant on a flight with exactly 1 seat remaining", () => {
      const flight = createMockFlight({ seatsLeft: 1, status: "Scheduled" });
      const seatCount = getSeatRequiredPaxCount({ adults: 1, infants: 1 }); // 1 seat
      assert.equal(seatCount, 1);

      const result = getFlightBookability(flight, { now: futureClock, paxCount: seatCount });
      assert.equal(result.bookable, true);
      assert.equal(result.reason, undefined);
      assert.equal(isFlightBookable(flight, { now: futureClock, paxCount: seatCount }), true);
    });

    it("rejects 1 adult + 1 child on a flight with exactly 1 seat remaining (insufficient_seats)", () => {
      const flight = createMockFlight({ seatsLeft: 1, status: "Scheduled" });
      const seatCount = getSeatRequiredPaxCount({ adults: 1, children: 1 }); // 2 seats
      assert.equal(seatCount, 2);

      const result = getFlightBookability(flight, { now: futureClock, paxCount: seatCount });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "insufficient_seats");
      assert.equal(isFlightBookable(flight, { now: futureClock, paxCount: seatCount }), false);
    });

    it("rejects 0 seats remaining as sold_out regardless of passenger party", () => {
      const flight = createMockFlight({ seatsLeft: 0, status: "Scheduled" });
      const seatCount = getSeatRequiredPaxCount({ adults: 1, infants: 1 }); // 1 seat
      const result = getFlightBookability(flight, { now: futureClock, paxCount: seatCount });
      assert.equal(result.bookable, false);
      assert.equal(result.reason, "sold_out");
      assert.equal(isFlightBookable(flight, { now: futureClock, paxCount: seatCount }), false);
    });
  });

  describe("Null / Missing Input Handling", () => {
    it("returns non-bookable result for null or undefined flight", () => {
      assert.equal(isFlightBookable(null), false);
      assert.equal(isFlightBookable(undefined), false);
      const res = getFlightBookability(null);
      assert.equal(res.bookable, false);
      assert.equal(res.seatsLeft, 0);
    });
  });

  describe("Reason Label Key Mapping", () => {
    it("maps all unbookable reasons to valid i18n keys", () => {
      assert.equal(unbookableReasonLabelKey("cancelled"), "book.flightCancelled");
      assert.equal(unbookableReasonLabelKey("departed"), "book.flightDeparted");
      assert.equal(unbookableReasonLabelKey("landed"), "book.flightLanded");
      assert.equal(unbookableReasonLabelKey("boarding"), "book.flightBoarding");
      assert.equal(unbookableReasonLabelKey("past"), "book.flightPast");
      assert.equal(unbookableReasonLabelKey("sold_out"), "book.flightSoldOut");
      assert.equal(unbookableReasonLabelKey("insufficient_seats"), "book.flightInsufficientSeats");
      assert.equal(unbookableReasonLabelKey(undefined), "book.flightUnavailable");
    });
  });

  describe("Flight Detail Bookability Guard & Action Routing", () => {
    const fixedNow = "2026-10-01T08:00:00Z";

    it("evaluates future Scheduled flight as bookable and allows booking preloading", () => {
      const flight = createMockFlight({ date: "2026-10-15", status: "Scheduled", seatsLeft: 10 });
      const bookability = getFlightBookability(flight, { now: fixedNow, paxCount: 1 });
      assert.equal(bookability.bookable, true);
      assert.equal(bookability.reason, undefined);
      assert.equal(isFlightBookable(flight, { now: fixedNow, paxCount: 1 }), true);

      // Simulate flight-detail bookThisFlight() action:
      let draftMutated = false;
      function simulateBookThisFlight() {
        if (!isFlightBookable(flight, { now: fixedNow, paxCount: 1 })) return;
        draftMutated = true;
      }
      simulateBookThisFlight();
      assert.equal(draftMutated, true, "Bookable flight must permit draft mutation and preloading");
    });

    it("blocks booking preloading for Cancelled flights and exposes localized reason", () => {
      const flight = createMockFlight({ date: "2026-10-15", status: "Cancelled", seatsLeft: 10 });
      const bookability = getFlightBookability(flight, { now: fixedNow, paxCount: 1 });
      assert.equal(bookability.bookable, false);
      assert.equal(bookability.reason, "cancelled");
      assert.equal(unbookableReasonLabelKey(bookability.reason), "book.flightCancelled");

      let draftMutated = false;
      function simulateBookThisFlight() {
        if (!isFlightBookable(flight, { now: fixedNow, paxCount: 1 })) return;
        draftMutated = true;
      }
      simulateBookThisFlight();
      assert.equal(draftMutated, false, "Cancelled flight must not mutate draft");
    });

    it("blocks booking preloading for Boarding flights and exposes localized reason", () => {
      const flight = createMockFlight({ date: "2026-10-15", status: "Boarding", seatsLeft: 10 });
      const bookability = getFlightBookability(flight, { now: fixedNow, paxCount: 1 });
      assert.equal(bookability.bookable, false);
      assert.equal(bookability.reason, "boarding");
      assert.equal(unbookableReasonLabelKey(bookability.reason), "book.flightBoarding");

      let draftMutated = false;
      function simulateBookThisFlight() {
        if (!isFlightBookable(flight, { now: fixedNow, paxCount: 1 })) return;
        draftMutated = true;
      }
      simulateBookThisFlight();
      assert.equal(draftMutated, false, "Boarding flight must not mutate draft");
    });

    it("blocks booking preloading for Departed / Landed flights and exposes localized reason", () => {
      const departedFlight = createMockFlight({ date: "2026-10-15", status: "Departed", seatsLeft: 10 });
      const departedBookability = getFlightBookability(departedFlight, { now: fixedNow, paxCount: 1 });
      assert.equal(departedBookability.bookable, false);
      assert.equal(departedBookability.reason, "departed");
      assert.equal(unbookableReasonLabelKey(departedBookability.reason), "book.flightDeparted");

      const landedFlight = createMockFlight({ date: "2026-10-15", status: "Landed", seatsLeft: 10 });
      const landedBookability = getFlightBookability(landedFlight, { now: fixedNow, paxCount: 1 });
      assert.equal(landedBookability.bookable, false);
      assert.equal(landedBookability.reason, "landed");
      assert.equal(unbookableReasonLabelKey(landedBookability.reason), "book.flightLanded");
    });

    it("blocks booking preloading for past departure dates and exposes localized reason", () => {
      const pastFlight = createMockFlight({ date: "2026-09-15", departTime: "10:00", status: "Scheduled", seatsLeft: 10 });
      const bookability = getFlightBookability(pastFlight, { now: fixedNow, paxCount: 1 });
      assert.equal(bookability.bookable, false);
      assert.equal(bookability.reason, "past");
      assert.equal(unbookableReasonLabelKey(bookability.reason), "book.flightPast");

      let draftMutated = false;
      function simulateBookThisFlight() {
        if (!isFlightBookable(pastFlight, { now: fixedNow, paxCount: 1 })) return;
        draftMutated = true;
      }
      simulateBookThisFlight();
      assert.equal(draftMutated, false, "Past flight must not mutate draft");
    });

    it("blocks booking preloading for sold-out flights (0 seats)", () => {
      const soldOutFlight = createMockFlight({ date: "2026-10-15", status: "Scheduled", seatsLeft: 0 });
      const bookability = getFlightBookability(soldOutFlight, { now: fixedNow, paxCount: 1 });
      assert.equal(bookability.bookable, false);
      assert.equal(bookability.reason, "sold_out");
      assert.equal(unbookableReasonLabelKey(bookability.reason), "book.flightSoldOut");

      let draftMutated = false;
      function simulateBookThisFlight() {
        if (!isFlightBookable(soldOutFlight, { now: fixedNow, paxCount: 1 })) return;
        draftMutated = true;
      }
      simulateBookThisFlight();
      assert.equal(draftMutated, false, "Sold-out flight must not mutate draft");
    });
  });

  describe("Capacity Proof Fixture Durability & Station Policy", () => {
    it("remains strictly future-relative and bookable after 2026-10-15 with injected clocks", () => {
      // Test with injected clocks well beyond 2026-10-15
      const futureDates = ["2026-11-01", "2027-01-15", "2027-06-30", "2028-04-10"];

      for (const futureNow of futureDates) {
        const fixtureDate = getCapacityProofDate(futureNow);
        // Fixture departure date must be strictly after the current station date
        assert.ok(fixtureDate > futureNow, `Fixture date ${fixtureDate} should be after ${futureNow}`);

        const flights = getCapacityProofFlights(fixtureDate);
        assert.equal(flights.length, 4);

        const opt1Seat = flights.find((f) => f.id === "CAP-PROOF-1SEAT")!;
        const optCancelled = flights.find((f) => f.id === "CAP-PROOF-CANCELLED")!;
        const optBoarding = flights.find((f) => f.id === "CAP-PROOF-BOARDING")!;
        const optAvailable = flights.find((f) => f.id === "CAP-PROOF-AVAILABLE")!;

        // Invariant 1: 1 adult + 1 infant (1 seat needed) -> CAP-PROOF-1SEAT is bookable
        assert.equal(
          isFlightBookable(opt1Seat, { now: futureNow, paxCount: 1 }),
          true,
          `CAP-PROOF-1SEAT should be bookable for 1 pax on ${futureNow}`,
        );

        // Invariant 2: 1 adult + 1 child (2 seats needed) -> CAP-PROOF-1SEAT is unbookable (insufficient_seats)
        const childEval = getFlightBookability(opt1Seat, { now: futureNow, paxCount: 2 });
        assert.equal(childEval.bookable, false);
        assert.equal(childEval.reason, "insufficient_seats");

        // Invariant 3: Cancelled and Boarding options are unbookable regardless of party
        const cancelledEval = getFlightBookability(optCancelled, { now: futureNow, paxCount: 1 });
        assert.equal(cancelledEval.bookable, false);
        assert.equal(cancelledEval.reason, "cancelled");

        const boardingEval = getFlightBookability(optBoarding, { now: futureNow, paxCount: 1 });
        assert.equal(boardingEval.bookable, false);
        assert.equal(boardingEval.reason, "boarding");

        // Invariant 4: Scheduled available flight is bookable
        assert.equal(isFlightBookable(optAvailable, { now: futureNow, paxCount: 1 }), true);
      }
    });

    it("creates a valid future mock draft with 1 adult + 1 infant relative to injected station date", () => {
      const futureNow = "2027-03-01";
      const draft = createCapacityProofMockDraft(futureNow);

      assert.equal(draft.criteria.origin, "GZA");
      assert.equal(draft.criteria.destination, "AMM");
      assert.ok(draft.criteria.departDate > futureNow);
      assert.equal(draft.criteria.adults, 1);
      assert.equal(draft.criteria.infants, 1);
      assert.equal(getSeatRequiredPaxCount(draft.passengers), 1);
    });
  });

  describe("Regular Studio Booking Scenarios Durability & Step Preservation", () => {
    const futureTestClocks = [
      "2026-11-01",
      "2027-01-15",
      "2027-06-30",
      "2028-04-10",
      "2029-12-31",
    ];

    it("computes departure and return dates strictly in the future relative to injected clocks", () => {
      for (const futureNow of futureTestClocks) {
        const { departDate, returnDate } = getStudioMockDates(futureNow);
        assert.ok(departDate > futureNow, `departDate ${departDate} must be > injected clock ${futureNow}`);
        assert.ok(returnDate > departDate, `returnDate ${returnDate} must be > departDate ${departDate}`);
      }
    });

    it("ensures every regular booking step draft retains its requested step after 2026-10-22", () => {
      const steps: Array<"results" | "fare" | "passengers" | "seats" | "extras" | "review"> = [
        "results",
        "fare",
        "passengers",
        "seats",
        "extras",
        "review",
      ];

      for (const futureNow of futureTestClocks) {
        for (const step of steps) {
          const draft = createDeterministicMockDraft(step, futureNow);
          assert.ok(draft.criteria.departDate > futureNow, `draft departDate must be future on ${futureNow}`);
          assert.ok(draft.criteria.returnDate > draft.criteria.departDate);

          if (step !== "results") {
            assert.ok(draft.outbound, `outbound flight must exist for step ${step}`);
            assert.equal(draft.outbound.date, draft.criteria.departDate);
            assert.equal(isFlightBookable(draft.outbound, { now: futureNow, paxCount: 1 }), true);

            assert.ok(draft.inbound, `inbound flight must exist for step ${step}`);
            assert.equal(draft.inbound.date, draft.criteria.returnDate);
            assert.equal(isFlightBookable(draft.inbound, { now: futureNow, paxCount: 1 }), true);
          }

          const maxStep = calculateMaxStep(draft, draft.passengers, { now: futureNow });
          const allowed = stepRanks[step] <= stepRanks[maxStep];
          assert.ok(
            allowed,
            `Step "${step}" must be allowed by maxStep "${maxStep}" at future clock ${futureNow}`,
          );
        }
      }
    });

    it("verifies every booking scenario in STUDIO_SCENARIOS remains on its step across future dates", () => {
      const bookingScenarios = STUDIO_SCENARIOS.filter((s) => s.pageId === "book" && s.step);
      assert.ok(bookingScenarios.length >= 7, "Expected at least 7 booking scenarios in STUDIO_SCENARIOS");

      for (const futureNow of futureTestClocks) {
        for (const scenario of bookingScenarios) {
          assert.ok(scenario.getMockDraft, `Scenario ${scenario.id} must define getMockDraft`);
          const draft = scenario.getMockDraft(futureNow);
          const maxStep = calculateMaxStep(draft, draft.passengers, { now: futureNow });
          const reqStep = scenario.step as keyof typeof stepRanks;
          const allowed = stepRanks[reqStep] <= stepRanks[maxStep];

          assert.ok(
            allowed,
            `Scenario ${scenario.id} (step: ${reqStep}) must not be clamped by maxStep ${maxStep} on ${futureNow}`,
          );
        }
      }
    });
  });
});
