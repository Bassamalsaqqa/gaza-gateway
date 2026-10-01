import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getCheckInEligibility } from "../../src/lib/domain/check-in.ts";
import {
  normalizePnr,
  normalizeIdentifier,
  matchesBookingIdentifier,
} from "../../src/lib/domain/booking-lookup.ts";
import { bookingTotal } from "../../src/lib/domain/pricing.ts";
import {
  buildBoardingPassViewModel,
  getBoardingPassData,
  computeBoardingOpensTime,
  computeBoardingClosesTime,
} from "../../src/lib/domain/boarding-pass.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import { RepoStorageCoordinator, StorageCommitError } from "../../src/lib/repositories/storage.ts";
import type { Booking } from "../../src/lib/domain/booking.ts";
import type { Flight } from "../../src/lib/data.ts";

interface MockStorageWithFail extends Storage {
  setFailWrites(fail: boolean): void;
}

function createMockStorage(initialData: Record<string, string> = {}): MockStorageWithFail {
  const store = new Map<string, string>(Object.entries(initialData));
  let failWrites = false;

  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (failWrites) {
        throw new Error("QuotaExceededError: simulated storage failure");
      }
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    get length(): number {
      return store.size;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    setFailWrites(fail: boolean) {
      failWrites = fail;
    },
  };
}

describe("Phase 5C: Manage, Check-in & Boarding Pass Convergence", () => {
  // Deterministic canonical flights from data.ts schedule
  const mockOutboundFlight: Flight = {
    id: "PS100-2026-10-10-out",
    number: "PS100",
    date: "2026-10-10",
    departTime: "07:15",
    arriveTime: "08:10",
    originCode: "GZA",
    destinationCode: "AMM",
    status: "Scheduled",
    aircraft: "Airbus A321neo",
    gate: "A1",
    terminal: "1",
    basePrice: 177,
    durationMinutes: 55,
    seatsLeft: 19,
  };

  const mockInboundFlight: Flight = {
    id: "PS101-2026-10-15-in",
    number: "PS101",
    date: "2026-10-15",
    departTime: "10:40",
    arriveTime: "11:35",
    originCode: "AMM",
    destinationCode: "GZA",
    status: "Scheduled",
    aircraft: "Airbus A321neo",
    gate: "A5",
    terminal: "1",
    basePrice: 157,
    durationMinutes: 55,
    seatsLeft: 16,
  };

  const createBaseBooking = (overrides?: Partial<Booking>): Booking => ({
    ref: "GZA-5C01",
    createdAt: "2026-10-01T10:00:00Z",
    status: "confirmed",
    ownerEmail: "traveler@example.ps",
    total: 350,
    contact: { email: "traveler@example.ps", phone: "+970 8 282 0000" },
    criteria: {
      tripType: "round",
      origin: "GZA",
      destination: "AMM",
      departDate: "2026-10-10",
      returnDate: "2026-10-15",
      adults: 2,
      children: 0,
      infants: 1,
      cabin: "economy",
    },
    outbound: mockOutboundFlight,
    inbound: mockInboundFlight,
    fareId: "classic",
    passengers: [
      { id: "pax-GZA-5C01-0", firstName: "Ahmad", lastName: "Khalil", type: "adult", dob: "1985-05-15", nationality: "PS", document: "P10001" },
      { id: "pax-GZA-5C01-1", firstName: "Fatima", lastName: "Khalil", type: "adult", dob: "1988-08-20", nationality: "PS", document: "P10002" },
      { id: "pax-GZA-5C01-2", firstName: "Nour", lastName: "Khalil", type: "infant", dob: "2025-11-01", nationality: "PS", document: "P10003", withAdult: 0 },
    ],
    seats: {
      "out-0": "10A",
      "out-1": "10B",
    },
    extras: { pax: [] },
    checkedIn: {
      out: [],
      in: [],
    },
    ...overrides,
  });

  describe("1. Check-in Eligibility Window & Station Timezone Policy", () => {
    const booking = createBaseBooking();
    // Departure: 2026-10-10 07:15 at GZA (Asia/Gaza UTC+3)
    // 24h prior: 2026-10-09 07:15 (exact open)
    // 60m prior: 2026-10-10 06:15 (exact close)

    it("returns too_early when before the 24-hour window", () => {
      // 24 hours and 1 minute before scheduled departure
      const checkClock = new Date("2026-10-09T07:14:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", mockOutboundFlight, { now: checkClock });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "too_early");
      assert.ok(eligibility.opensAt);
    });

    it("returns eligible exactly 24 hours before scheduled departure (inclusive boundary)", () => {
      // Exactly 24 hours before
      const checkClock = new Date("2026-10-09T07:15:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", mockOutboundFlight, { now: checkClock });
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.reason, undefined);
    });

    it("returns eligible inside the window (61 minutes before scheduled departure)", () => {
      // 61 minutes before
      const checkClock = new Date("2026-10-10T06:14:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", mockOutboundFlight, { now: checkClock });
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.reason, undefined);
    });

    it("returns closed exactly 60 minutes before scheduled departure (exclusive boundary)", () => {
      // Exactly 60 minutes before scheduled departure
      const checkClock = new Date("2026-10-10T06:15:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", mockOutboundFlight, { now: checkClock });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "closed");
    });

    it("returns closed after scheduled departure time", () => {
      const checkClock = new Date("2026-10-10T07:30:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", mockOutboundFlight, { now: checkClock });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "closed");
    });

    it("revisedDepart NEVER extends the check-in eligibility window", () => {
      // Flight was scheduled for 07:15, revised to 09:15 (2h delay)
      const delayedFlight: Flight = {
        ...mockOutboundFlight,
        status: "Delayed",
        revisedDepart: "09:15",
      };
      // At 06:30, we are past the 60m cutoff for the SCHEDULED departure (07:15)
      const checkClock = new Date("2026-10-10T06:30:00+03:00");
      const eligibility = getCheckInEligibility(booking, "out", delayedFlight, { now: checkClock });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "closed");
    });

    it("evaluates inbound flight in origin station timezone (AMM Asia/Amman)", () => {
      // Inbound departs AMM at 2026-10-15 10:40 (Asia/Amman UTC+3)
      // Exactly 24h prior: 2026-10-14 10:40
      const openClock = new Date("2026-10-14T10:40:00+03:00");
      const elOpen = getCheckInEligibility(booking, "in", mockInboundFlight, { now: openClock });
      assert.equal(elOpen.eligible, true);
      assert.equal(elOpen.reason, undefined);

      const closedClock = new Date("2026-10-15T09:45:00+03:00"); // 55m before
      const elClosed = getCheckInEligibility(booking, "in", mockInboundFlight, { now: closedClock });
      assert.equal(elClosed.eligible, false);
      assert.equal(elClosed.reason, "closed");
    });
  });

  describe("2. Flight Status Permitted vs Blocked Rules", () => {
    const booking = createBaseBooking();
    const inWindowClock = new Date("2026-10-10T04:00:00+03:00"); // 3h15m before 07:15

    it("allows Scheduled, OnTime, and Delayed flights within window", () => {
      for (const status of ["Scheduled", "OnTime", "Delayed"] as const) {
        const flight: Flight = { ...mockOutboundFlight, status };
        const el = getCheckInEligibility(booking, "out", flight, { now: inWindowClock });
        assert.equal(el.eligible, true, `Expected ${status} to be allowed`);
        assert.equal(el.reason, undefined);
      }
    });

    it("blocks Cancelled flight with flight_cancelled status", () => {
      const flight: Flight = { ...mockOutboundFlight, status: "Cancelled" };
      const el = getCheckInEligibility(booking, "out", flight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "flight_cancelled");
    });

    it("blocks Boarding flight with flight_boarding status", () => {
      const flight: Flight = { ...mockOutboundFlight, status: "Boarding" };
      const el = getCheckInEligibility(booking, "out", flight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "flight_boarding");
    });

    it("blocks Departed flight with flight_departed status", () => {
      const flight: Flight = { ...mockOutboundFlight, status: "Departed" };
      const el = getCheckInEligibility(booking, "out", flight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "flight_departed");
    });

    it("blocks Landed flight with flight_landed status", () => {
      const flight: Flight = { ...mockOutboundFlight, status: "Landed" };
      const el = getCheckInEligibility(booking, "out", flight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "flight_landed");
    });

    it("blocks missing effective flight with missing_flight status", () => {
      const el = getCheckInEligibility(booking, "out", null, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "missing_flight");
    });

    it("blocks cancelled booking with booking_cancelled status", () => {
      const cancelledBooking = { ...booking, status: "cancelled" as const };
      const el = getCheckInEligibility(cancelledBooking, "out", mockOutboundFlight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "booking_cancelled");
    });

    it("blocks missing leg with missing_leg status", () => {
      const oneWayBooking = { ...booking, inbound: null };
      const el = getCheckInEligibility(oneWayBooking, "in", mockInboundFlight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "missing_leg");
    });

    it("blocks check-in if all seat-requiring passengers are already checked in", () => {
      const fullyCheckedBooking = {
        ...booking,
        checkedIn: { out: [0, 1], in: [] },
      };
      const el = getCheckInEligibility(fullyCheckedBooking, "out", mockOutboundFlight, { now: inWindowClock });
      assert.equal(el.eligible, false);
      assert.equal(el.reason, "already_checked_in");
    });
  });

  describe("3. Lookup Normalization & Matching Consistency", () => {
    it("normalizes PNR consistently (trims, uppercases)", () => {
      assert.equal(normalizePnr("gza-7k8p"), "GZA-7K8P");
      assert.equal(normalizePnr("  gza-7k8p  "), "GZA-7K8P");
      assert.equal(normalizePnr("GZA-7K8P"), "GZA-7K8P");
      assert.equal(normalizePnr("7k8p"), "7K8P");
    });

    it("normalizes general identifier (trims, lowercases)", () => {
      assert.equal(normalizeIdentifier("  Traveler@Example.PS  "), "traveler@example.ps");
      assert.equal(normalizeIdentifier(" Khalil "), "khalil");
    });

    it("matches booking by contact email or passenger last name", () => {
      const booking = createBaseBooking();

      // Contact email matches (case-insensitive, whitespace-insensitive)
      assert.equal(matchesBookingIdentifier(booking, "traveler@example.ps"), true);
      assert.equal(matchesBookingIdentifier(booking, " TRAVELER@EXAMPLE.PS "), true);

      // Passenger last name matches
      assert.equal(matchesBookingIdentifier(booking, "khalil"), true);
      assert.equal(matchesBookingIdentifier(booking, " Khalil "), true);

      // Non-matching input
      assert.equal(matchesBookingIdentifier(booking, "unknown"), false);
      assert.equal(matchesBookingIdentifier(booking, "other@example.com"), false);
    });
  });

  describe("4. Canonical Pricing Recalculation (bookingTotal)", () => {
    it("calculates canonical total with base fare, passenger multiplier, seat fees, and extras", () => {
      const booking = createBaseBooking();
      const result = bookingTotal({
        outbound: booking.outbound,
        inbound: booking.inbound,
        fareId: booking.fareId,
        criteria: booking.criteria,
        seats: booking.seats,
        extras: booking.extras,
      });
      assert.ok(result.total > 0);
      assert.equal(typeof result.total, "number");
    });
  });

  describe("5. BookingRepository Bounded Commands & Atomicity", () => {
    let mockStorage: ReturnType<typeof createMockStorage>;
    let coordinator: RepoStorageCoordinator;
    let repo: LocalBookingRepository;
    let flightRepo: LocalFlightRepository;

    beforeEach(() => {
      const booking = createBaseBooking();
      const initialJson = JSON.stringify({
        schemaVersion: 1,
        bookings: [booking],
        flightOverrides: {},
      });
      mockStorage = createMockStorage({ "gza.repo.v1": initialJson });
      coordinator = new RepoStorageCoordinator({ storage: mockStorage });
      repo = new LocalBookingRepository(coordinator);
      flightRepo = new LocalFlightRepository(coordinator);
    });

    it("cancel command sets status to cancelled and persists", async () => {
      const cancelled = await repo.cancel("GZA-5C01");
      assert.equal(cancelled.status, "cancelled");

      const reRead = await repo.getByRef("GZA-5C01");
      assert.equal(reRead?.status, "cancelled");
    });

    it("cancel is idempotent on already cancelled booking", async () => {
      await repo.cancel("GZA-5C01");
      const secondCancel = await repo.cancel("GZA-5C01");
      assert.equal(secondCancel.status, "cancelled");
    });

    it("updateContact rejects modification on cancelled booking", async () => {
      await repo.cancel("GZA-5C01");
      await assert.rejects(
        () => repo.updateContact("GZA-5C01", { email: "new@example.com", phone: "+970 8 000 0000" }),
        /cancelled/i,
      );
    });

    it("updateSeats rejects modification on cancelled booking", async () => {
      await repo.cancel("GZA-5C01");
      await assert.rejects(
        () => repo.updateSeats("GZA-5C01", { "out-0": "12A" }),
        /cancelled/i,
      );
    });

    it("updateExtras rejects modification on cancelled booking", async () => {
      await repo.cancel("GZA-5C01");
      await assert.rejects(
        () => repo.updateExtras("GZA-5C01", { pax: [{ bags: 1, meal: "standard", assistance: "none" }] }),
        /cancelled/i,
      );
    });

    it("updateContact updates contact and persists", async () => {
      const updated = await repo.updateContact("GZA-5C01", {
        email: "newemail@example.ps",
        phone: "+970 59 123 4567",
      });
      assert.equal(updated.contact.email, "newemail@example.ps");
      assert.equal(updated.contact.phone, "+970 59 123 4567");

      const persisted = await repo.getByRef("GZA-5C01");
      assert.equal(persisted?.contact.email, "newemail@example.ps");
    });

    it("updateSeats prevents altering seat of an already checked-in passenger on that leg", async () => {
      // First check in passenger 0 on outbound leg (currently in 10A)
      const booking = (await repo.getByRef("GZA-5C01"))!;
      booking.checkedIn.out = [0];
      await repo.update("GZA-5C01", { checkedIn: booking.checkedIn });

      // Attempt to change passenger 0's seat on outbound leg to "12A" -> MUST REJECT
      await assert.rejects(
        () => repo.updateSeats("GZA-5C01", { "out-0": "12A", "out-1": "10B" }),
        /checked-in passenger/i,
      );

      // Unchecked passenger 1's seat on outbound leg CAN be changed
      const updated = await repo.updateSeats("GZA-5C01", { "out-0": "10A", "out-1": "12B" });
      assert.equal(updated.seats["out-1"], "12B");
      assert.equal(updated.seats["out-0"], "10A");
    });

    it("updateSeats recalculates total price canonically", async () => {
      const updated = await repo.updateSeats("GZA-5C01", { "out-0": "1A", "out-1": "1B" });
      assert.ok(updated.total > 0);
      const persisted = await repo.getByRef("GZA-5C01");
      assert.equal(persisted?.total, updated.total);
    });

    it("updateExtras updates extras and recalculates total canonically", async () => {
      const updated = await repo.updateExtras("GZA-5C01", {
        pax: [
          { bags: 2, meal: "gourmet", assistance: "none" },
          { bags: 0, meal: "standard", assistance: "none" },
        ],
      });
      assert.equal(updated.extras.pax[0]?.bags, 2);
      assert.ok(updated.total > 350);
    });

    it("completeCheckIn persists documents, seats, and checkedIn atomically", async () => {
      // In-window clock: 2026-10-10 04:00 (departure is 07:15)
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");
      const updated = await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0, 1],
        documents: {
          0: "DOC-AHMAD-99",
          1: "DOC-FATIMA-99",
        },
        seats: {
          0: "14A",
          1: "14B",
        },
        now: checkInClock,
      });

      assert.deepEqual(updated.checkedIn.out, [0, 1]);
      assert.equal(updated.seats["out-0"], "14A");
      assert.equal(updated.seats["out-1"], "14B");
      assert.equal(updated.passengers[0]?.document, "DOC-AHMAD-99");
      assert.equal(updated.passengers[1]?.document, "DOC-FATIMA-99");

      // Verify in storage
      const persisted = await repo.getByRef("GZA-5C01");
      assert.deepEqual(persisted?.checkedIn.out, [0, 1]);
      assert.equal(persisted?.seats["out-0"], "14A");
    });

    it("completeCheckIn is idempotent on repeated identical submission", async () => {
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");
      const input = {
        ref: "GZA-5C01",
        leg: "out" as const,
        selectedPaxIndexes: [0],
        documents: { 0: "DOC-IDEMPOTENT-1" },
        seats: { 0: "10A" },
        now: checkInClock,
      };

      const first = await repo.completeCheckIn(input);
      assert.deepEqual(first.checkedIn.out, [0]);

      // Repeated identical submission should succeed idempotently
      const second = await repo.completeCheckIn(input);
      assert.deepEqual(second.checkedIn.out, [0]);
      assert.equal(second.seats["out-0"], "10A");
    });

    it("completeCheckIn rejects infant passenger index", async () => {
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [2], // infant
            documents: { 2: "DOC-INFANT" },
            seats: {},
            now: checkInClock,
          }),
        /infant/i,
      );
    });

    it("completeCheckIn rejects duplicate seat assignment on same leg", async () => {
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0, 1],
            documents: {
              0: "D1",
              1: "D2",
            },
            seats: {
              0: "15A",
              1: "15A", // DUPLICATE SEAT
            },
            now: checkInClock,
          }),
        /duplicate seat/i,
      );
    });

    it("completeCheckIn rolls back memory and storage when storage throws StorageCommitError", async () => {
      mockStorage.setFailWrites(true);
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");

      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "DOC-FAIL" },
            seats: { 0: "20A" },
            now: checkInClock,
          }),
        StorageCommitError,
      );

      // Verify that after failure, storage and memory remained unchanged
      mockStorage.setFailWrites(false);
      const restored = await repo.getByRef("GZA-5C01");
      assert.deepEqual(restored?.checkedIn.out, []);
      assert.notEqual(restored?.seats["out-0"], "20A");
    });
  });

  describe("6. Boarding Pass View Model & Operational Status Treatment", () => {
    const booking = createBaseBooking({
      checkedIn: { out: [0], in: [0] },
    });

    it("builds boarding pass with distinct scheduled and revised departure times", () => {
      const effectiveFlight: Flight = {
        ...mockOutboundFlight,
        gate: "B3",
        terminal: "T2",
        revisedDepart: "08:45",
      };

      const vm = buildBoardingPassViewModel(booking, "out", 0, effectiveFlight);
      assert.equal(vm.scheduledDepartureTime, "07:15");
      assert.equal(vm.revisedDepartureTime, "08:45");
      assert.equal(vm.flight.gate, "B3");
      assert.equal(vm.flight.terminal, "T2");
      // Boarding opens is strictly 45 minutes before scheduled (07:15 - 45m = 06:30)
      assert.equal(vm.boardingOpensTime, "06:30");
      assert.equal(vm.boardingClosesTime, "06:55");
      assert.equal(vm.operationalStatus, "active");
    });

    it("flags non-active operational status for Cancelled flight", () => {
      const cancelledFlight: Flight = {
        ...mockOutboundFlight,
        status: "Cancelled",
      };
      const vm = buildBoardingPassViewModel(booking, "out", 0, cancelledFlight);
      assert.equal(vm.operationalStatus, "cancelled");
    });

    it("flags non-active operational status for Departed and Landed flights", () => {
      const departedFlight: Flight = { ...mockOutboundFlight, status: "Departed" };
      const vmDeparted = buildBoardingPassViewModel(booking, "out", 0, departedFlight);
      assert.equal(vmDeparted.operationalStatus, "departed");

      const landedFlight: Flight = { ...mockOutboundFlight, status: "Landed" };
      const vmLanded = buildBoardingPassViewModel(booking, "out", 0, landedFlight);
      assert.equal(vmLanded.operationalStatus, "landed");
    });

    it("flags operationalStatus as unavailable when effective flight is missing", () => {
      const data = getBoardingPassData(booking, "out", 0, null);
      assert.equal(data?.operationalStatus, "unavailable");
    });

    it("computes boarding opens and closes times across midnight boundary safely", () => {
      // 00:30 scheduled departure
      assert.equal(computeBoardingOpensTime("00:30"), "23:45");
      assert.equal(computeBoardingClosesTime("00:30"), "00:10");

      // 00:10 scheduled departure
      assert.equal(computeBoardingOpensTime("00:10"), "23:25");
      assert.equal(computeBoardingClosesTime("00:10"), "23:50");
    });

    it("rejects unchecked passenger with clear error", () => {
      assert.throws(
        () => buildBoardingPassViewModel(booking, "out", 1),
        /not checked in/i,
      );
    });

    it("rejects infant passenger directly with clear error", () => {
      assert.throws(
        () => buildBoardingPassViewModel(booking, "out", 2),
        /infant/i,
      );
    });
  });
});
