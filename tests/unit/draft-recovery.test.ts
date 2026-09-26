import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMaxStep,
  createFreshDraft,
  defaultCriteria,
  emptyPassenger,
  stepRanks,
  validateAndSanitizeDraft,
} from "../../src/lib/booking-draft.ts";
import type { Draft, Passenger } from "../../src/lib/booking-draft.ts";
import type { Flight } from "../../src/lib/data.ts";

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

describe("Draft Recovery, Sanitization & Step Gating", () => {
  const testToday = "2026-10-01";
  const testReturn = "2026-10-07";

  describe("Passenger Details Preservation", () => {
    it("preserves passenger names, DOB, document and nationality when route criteria change", () => {
      const passenger1: Passenger = {
        type: "adult",
        firstName: "Layla",
        lastName: "Arafat",
        dob: "1990-05-12",
        nationality: "PS",
        document: "P12345678",
      };

      const passenger2: Passenger = {
        type: "child",
        firstName: "Tariq",
        lastName: "Arafat",
        dob: "2018-09-20",
        nationality: "PS",
        document: "P87654321",
      };

      const rawDraft = {
        entry: "search",
        criteria: {
          tripType: "round",
          origin: "UNKNOWN_ORIGIN", // Invalid route will trigger routeReset
          destination: "UNKNOWN_DEST",
          departDate: "2026-09-01", // Past date will trigger date roll
          returnDate: "2026-09-05",
          adults: 1,
          children: 1,
          infants: 0,
          cabin: "economy",
        },
        passengers: [passenger1, passenger2],
        seats: { "out-0": "12A", "in-0": "12B" },
        contact: { email: "layla@example.com", phone: "+970599123456" },
      };

      const sanitized = validateAndSanitizeDraft(rawDraft, testToday, testReturn);

      // Route and dates should be corrected
      assert.equal(sanitized.criteria.origin, "GZA");
      assert.equal(sanitized.criteria.destination, "AMM");
      assert.equal(sanitized.criteria.departDate, testToday);
      assert.equal(sanitized.criteria.returnDate, testReturn);

      // Passenger details MUST BE PRESERVED
      assert.equal(sanitized.passengers.length, 2);
      assert.equal(sanitized.passengers[0]?.firstName, "Layla");
      assert.equal(sanitized.passengers[0]?.lastName, "Arafat");
      assert.equal(sanitized.passengers[0]?.dob, "1990-05-12");
      assert.equal(sanitized.passengers[0]?.document, "P12345678");

      assert.equal(sanitized.passengers[1]?.firstName, "Tariq");
      assert.equal(sanitized.passengers[1]?.lastName, "Arafat");
      assert.equal(sanitized.passengers[1]?.dob, "2018-09-20");

      // Contact details preserved
      assert.equal(sanitized.contact.email, "layla@example.com");
      assert.equal(sanitized.contact.phone, "+970599123456");
    });
  });

  describe("Stale & Unbookable Flight Clearance", () => {
    it("clears outbound flight and dependent seats when flight is in the past", () => {
      const rawDraft = {
        entry: "results",
        criteria: {
          tripType: "oneway",
          origin: "GZA",
          destination: "AMM",
          departDate: testToday,
          returnDate: "",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "PS204-2026-09-01-out", // Date doesn't match criteria
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-09-01",
        },
        seats: { "out-0": "14C" },
      };

      const sanitized = validateAndSanitizeDraft(rawDraft, testToday, testReturn);

      assert.equal(sanitized.outbound, null);
      assert.equal(sanitized.seats["out-0"], undefined);
      assert.deepEqual(sanitized.seats, {});
    });

    it("clears inbound seats if inbound flight is cleared", () => {
      const rawDraft = {
        entry: "results",
        criteria: {
          tripType: "round",
          origin: "GZA",
          destination: "AMM",
          departDate: testToday,
          returnDate: testReturn,
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: null,
        inbound: null,
        seats: { "out-0": "10A", "in-0": "10C" },
      };

      const sanitized = validateAndSanitizeDraft(rawDraft, testToday, testReturn);

      assert.equal(sanitized.inbound, null);
      assert.deepEqual(sanitized.seats, {});
    });

    it("sanitizes and rejects forged CAP-PROOF-* test fixture flights from stored drafts on reload", () => {
      const forgedDraft = {
        entry: "results",
        criteria: {
          tripType: "round",
          origin: "GZA",
          destination: "AMM",
          departDate: testToday,
          returnDate: testReturn,
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "CAP-PROOF-AVAILABLE",
          number: "PS 210",
          originCode: "GZA",
          destinationCode: "AMM",
          date: testToday,
          departTime: "18:00",
          arriveTime: "19:00",
          durationMinutes: 60,
          aircraft: "Airbus A320neo",
          status: "Scheduled",
          gate: "A4",
          terminal: "1",
          basePrice: 150,
          seatsLeft: 15,
        },
        inbound: {
          id: "CAP-PROOF-1SEAT",
          number: "PS 204",
          originCode: "AMM",
          destinationCode: "GZA",
          date: testReturn,
          departTime: "10:00",
          arriveTime: "11:00",
          durationMinutes: 60,
          aircraft: "Airbus A320neo",
          status: "Scheduled",
          gate: "A1",
          terminal: "1",
          basePrice: 150,
          seatsLeft: 1,
        },
        fareId: "classic",
        passengers: [
          {
            type: "adult",
            firstName: "Samir",
            lastName: "Khoury",
            dob: "1985-05-15",
            nationality: "PS",
            document: "P12345678",
          },
        ],
        seats: { "out-0": "12A", "in-0": "12F" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "samir@example.ps", phone: "+970 59 912 3456" },
      };

      const sanitized = validateAndSanitizeDraft(forgedDraft, testToday, testReturn);
      assert.equal(sanitized.outbound, null, "Forged CAP-PROOF outbound flight must be discarded");
      assert.equal(sanitized.inbound, null, "Forged CAP-PROOF inbound flight must be discarded");
      assert.deepEqual(sanitized.seats, {}, "Dependent seat assignments for forged flights must be cleared");
    });
  });

  describe("Step Gating Semantics (calculateMaxStep)", () => {
    it("clamps to 'results' when outbound flight is not selected", () => {
      const draft = createFreshDraft(testToday, testReturn);
      draft.outbound = null;

      const maxStep = calculateMaxStep(draft, draft.passengers, { now: testToday });
      assert.equal(maxStep, "results");
      assert.equal(stepRanks[maxStep], stepRanks["results"]);
    });

    it("clamps to 'results' when trip is round-trip and inbound flight is missing", () => {
      const draft = createFreshDraft(testToday, testReturn);
      draft.criteria.tripType = "round";
      draft.outbound = createMockFlight({ date: "2026-10-15", status: "Scheduled", seatsLeft: 10 });
      draft.inbound = null;

      const maxStep = calculateMaxStep(draft, draft.passengers, { now: "2026-10-01" });
      assert.equal(maxStep, "results");
    });

    it("clamps to 'results' when selected flight is unbookable (e.g. departed)", () => {
      const draft = createFreshDraft(testToday, testReturn);
      draft.criteria.tripType = "oneway";
      draft.outbound = createMockFlight({
        date: "2026-10-15",
        status: "Departed", // Non-bookable status
        seatsLeft: 10,
      });

      const maxStep = calculateMaxStep(draft, draft.passengers, { now: "2026-10-01" });
      assert.equal(maxStep, "results");
    });

    it("clamps to 'passengers' when passenger details are incomplete", () => {
      const draft = createFreshDraft(testToday, testReturn);
      draft.criteria.tripType = "oneway";
      draft.criteria.departDate = "2026-10-15";
      draft.outbound = createMockFlight({ date: "2026-10-15", status: "Scheduled", seatsLeft: 10 });
      draft.passengers = [
        {
          type: "adult",
          firstName: "Samir",
          lastName: "", // Missing last name
          dob: "1985-04-10",
          nationality: "PS",
          document: "",
        },
      ];

      const maxStep = calculateMaxStep(draft, draft.passengers, { now: "2026-10-01" });
      assert.equal(maxStep, "passengers");
      assert.equal(stepRanks[maxStep], stepRanks["passengers"]);
    });

    it("allows 'review' when flights are bookable and passenger details + contact email are complete", () => {
      const draft = createFreshDraft(testToday, testReturn);
      draft.criteria.tripType = "oneway";
      draft.criteria.departDate = "2026-10-15";
      draft.outbound = createMockFlight({ date: "2026-10-15", status: "Scheduled", seatsLeft: 10 });
      draft.passengers = [
        {
          type: "adult",
          firstName: "Samir",
          lastName: "Khoury",
          dob: "1985-04-10",
          nationality: "PS",
          document: "P99887766",
        },
      ];
      draft.contact = { email: "samir@example.ps", phone: "+970 59 912 3456" };

      const maxStep = calculateMaxStep(draft, draft.passengers, { now: "2026-10-01" });
      assert.equal(maxStep, "review");
      assert.ok(stepRanks[maxStep] >= stepRanks["seats"]);
    });
  });

  describe("Corrupt / Fallback Inputs", () => {
    it("returns safe fresh fallback draft on undefined or null raw data", () => {
      const fallback = validateAndSanitizeDraft(null, testToday, testReturn);
      assert.equal(fallback.entry, "search");
      assert.equal(fallback.criteria.origin, "GZA");
      assert.equal(fallback.criteria.destination, "AMM");
      assert.equal(fallback.outbound, null);
      assert.equal(fallback.inbound, null);
    });
  });
});
