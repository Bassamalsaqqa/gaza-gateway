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
import {
  parseSeatCode,
  parseSeatKey,
  isSeatInCabinZone,
  validateUpdateSeatsAssignments,
  validateCheckInSeats,
} from "../../src/lib/domain/seat-validation.ts";
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
      "out-0": "11A",
      "out-1": "11B",
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
        () => repo.updateExtras("GZA-5C01", { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] }),
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
      // Set up checked-in passenger 0 on outbound leg (currently in 11A)
      const booking = (await repo.getByRef("GZA-5C01"))!;
      booking.checkedIn.out = [0];
      coordinator.mutate(state => { state.bookings[0]!.checkedIn = booking.checkedIn; });

      // Attempt to change passenger 0's seat on outbound leg to "12B" -> MUST REJECT
      await assert.rejects(
        () => repo.updateSeats("GZA-5C01", { "out-0": "12B", "out-1": "11B" }),
        /checked-in/i,
      );

      // Unchecked passenger 1's seat on outbound leg CAN be changed
      const updated = await repo.updateSeats("GZA-5C01", { "out-0": "11A", "out-1": "12B" });
      assert.equal(updated.seats["out-1"], "12B");
      assert.equal(updated.seats["out-0"], "11A");
    });

    it("updateSeats recalculates total price canonically", async () => {
      const updated = await repo.updateSeats("GZA-5C01", { "out-0": "11C", "out-1": "12B" });
      assert.ok(updated.total > 0);
      const persisted = await repo.getByRef("GZA-5C01");
      assert.equal(persisted?.total, updated.total);
    });

    it("updateExtras updates extras and recalculates total canonically", async () => {
      const updated = await repo.updateExtras("GZA-5C01", {
        pax: [
          { extraBags: 2, meal: "vegetarian", assistance: [] },
          { extraBags: 0, meal: "standard", assistance: [] },
        ],
      });
      assert.equal(updated.extras.pax[0]?.extraBags, 2);
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
          0: "15A",
          1: "15B",
        },
        now: checkInClock,
      });

      assert.deepEqual(updated.checkedIn.out, [0, 1]);
      assert.equal(updated.seats["out-0"], "15A");
      assert.equal(updated.seats["out-1"], "15B");
      assert.equal(updated.passengers[0]?.document, "DOC-AHMAD-99");
      assert.equal(updated.passengers[1]?.document, "DOC-FATIMA-99");

      // Verify in storage
      const persisted = await repo.getByRef("GZA-5C01");
      assert.deepEqual(persisted?.checkedIn.out, [0, 1]);
      assert.equal(persisted?.seats["out-0"], "15A");
    });

    it("completeCheckIn is idempotent on repeated identical submission", async () => {
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");
      const input = {
        ref: "GZA-5C01",
        leg: "out" as const,
        selectedPaxIndexes: [0],
        documents: { 0: "DOC-IDEMPOTENT-1" },
        seats: { 0: "11A" },
        now: checkInClock,
      };

      const first = await repo.completeCheckIn(input);
      assert.deepEqual(first.checkedIn.out, [0]);

      // Repeated identical submission should succeed idempotently
      const second = await repo.completeCheckIn(input);
      assert.deepEqual(second.checkedIn.out, [0]);
      assert.equal(second.seats["out-0"], "11A");
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
        /duplicate/i,
      );
    });

    describe("5.1 Storage Rollback Matrix Across All 5 Bounded Commands", () => {
      it("completeCheckIn rolls back memory and storage when storage throws StorageCommitError", async () => {
        let notifications = 0;
        coordinator.subscribe(() => {
          notifications++;
        });

        const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
        const baselineRaw = mockStorage.getItem("gza.repo.v1");
        const checkInClock = new Date("2026-10-10T04:00:00+03:00");

        const execute = () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "DOC-FAIL" },
            seats: { 0: "15A" },
            now: checkInClock,
          });

        mockStorage.setFailWrites(true);

        // 1. Rejection with StorageCommitError
        await assert.rejects(execute, StorageCommitError);

        // 2. In-memory booking completely unchanged
        const inMemory = await repo.getByRef("GZA-5C01");
        assert.deepEqual(inMemory, baselineBooking);

        // 3. Backing persisted envelope unchanged
        assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

        // 4. Subscribers received no false notification
        assert.equal(notifications, 0);

        // 5. Retrying after storage recovery succeeds
        mockStorage.setFailWrites(false);
        const recovered = await execute();
        assert.deepEqual(recovered.checkedIn.out, [0]);
        assert.equal(recovered.seats["out-0"], "15A");
        assert.equal(recovered.passengers[0]?.document, "DOC-FAIL");
        assert.equal(notifications, 1);

        const persisted = await repo.getByRef("GZA-5C01");
        assert.deepEqual(persisted?.checkedIn.out, [0]);
      });

      it("cancel rolls back memory and storage when storage throws StorageCommitError", async () => {
        let notifications = 0;
        coordinator.subscribe(() => {
          notifications++;
        });

        const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
        const baselineRaw = mockStorage.getItem("gza.repo.v1");

        const execute = () => repo.cancel("GZA-5C01");

        mockStorage.setFailWrites(true);

        // 1. Rejection with StorageCommitError
        await assert.rejects(execute, StorageCommitError);

        // 2. In-memory booking completely unchanged
        const inMemory = await repo.getByRef("GZA-5C01");
        assert.deepEqual(inMemory, baselineBooking);

        // 3. Backing persisted envelope unchanged
        assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

        // 4. Subscribers received no false notification
        assert.equal(notifications, 0);

        // 5. Retrying after storage recovery succeeds
        mockStorage.setFailWrites(false);
        const recovered = await execute();
        assert.equal(recovered.status, "cancelled");
        assert.equal(notifications, 1);

        const persisted = await repo.getByRef("GZA-5C01");
        assert.equal(persisted?.status, "cancelled");
      });

      it("updateContact rolls back memory and storage when storage throws StorageCommitError", async () => {
        let notifications = 0;
        coordinator.subscribe(() => {
          notifications++;
        });

        const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
        const baselineRaw = mockStorage.getItem("gza.repo.v1");

        const execute = () =>
          repo.updateContact("GZA-5C01", {
            email: "recovered@example.ps",
            phone: "+970 59 777 6666",
          });

        mockStorage.setFailWrites(true);

        // 1. Rejection with StorageCommitError
        await assert.rejects(execute, StorageCommitError);

        // 2. In-memory booking completely unchanged
        const inMemory = await repo.getByRef("GZA-5C01");
        assert.deepEqual(inMemory, baselineBooking);

        // 3. Backing persisted envelope unchanged
        assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

        // 4. Subscribers received no false notification
        assert.equal(notifications, 0);

        // 5. Retrying after storage recovery succeeds
        mockStorage.setFailWrites(false);
        const recovered = await execute();
        assert.equal(recovered.contact.email, "recovered@example.ps");
        assert.equal(recovered.contact.phone, "+970 59 777 6666");
        assert.equal(notifications, 1);

        const persisted = await repo.getByRef("GZA-5C01");
        assert.equal(persisted?.contact.email, "recovered@example.ps");
      });

      it("updateSeats rolls back memory and storage when storage throws StorageCommitError", async () => {
        let notifications = 0;
        coordinator.subscribe(() => {
          notifications++;
        });

        const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
        const baselineRaw = mockStorage.getItem("gza.repo.v1");

        const execute = () =>
          repo.updateSeats("GZA-5C01", {
            "out-0": "15A",
            "out-1": "15B",
          });

        mockStorage.setFailWrites(true);

        // 1. Rejection with StorageCommitError
        await assert.rejects(execute, StorageCommitError);

        // 2. In-memory booking completely unchanged
        const inMemory = await repo.getByRef("GZA-5C01");
        assert.deepEqual(inMemory, baselineBooking);

        // 3. Backing persisted envelope unchanged
        assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

        // 4. Subscribers received no false notification
        assert.equal(notifications, 0);

        // 5. Retrying after storage recovery succeeds
        mockStorage.setFailWrites(false);
        const recovered = await execute();
        assert.equal(recovered.seats["out-0"], "15A");
        assert.equal(recovered.seats["out-1"], "15B");
        assert.equal(notifications, 1);

        const persisted = await repo.getByRef("GZA-5C01");
        assert.equal(persisted?.seats["out-0"], "15A");
        assert.equal(persisted?.seats["out-1"], "15B");
      });

      it("updateExtras rolls back memory and storage when storage throws StorageCommitError", async () => {
        let notifications = 0;
        coordinator.subscribe(() => {
          notifications++;
        });

        const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
        const baselineRaw = mockStorage.getItem("gza.repo.v1");

        const execute = () =>
          repo.updateExtras("GZA-5C01", {
            pax: [
              { extraBags: 2, meal: "vegetarian", assistance: [] },
              { extraBags: 1, meal: "standard", assistance: [] },
            ],
          });

        mockStorage.setFailWrites(true);

        // 1. Rejection with StorageCommitError
        await assert.rejects(execute, StorageCommitError);

        // 2. In-memory booking completely unchanged
        const inMemory = await repo.getByRef("GZA-5C01");
        assert.deepEqual(inMemory, baselineBooking);

        // 3. Backing persisted envelope unchanged
        assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

        // 4. Subscribers received no false notification
        assert.equal(notifications, 0);

        // 5. Retrying after storage recovery succeeds
        mockStorage.setFailWrites(false);
        const recovered = await execute();
        assert.equal(recovered.extras.pax[0]?.extraBags, 2);
        assert.equal(recovered.extras.pax[1]?.extraBags, 1);
        assert.equal(notifications, 1);

        const persisted = await repo.getByRef("GZA-5C01");
        assert.equal(persisted?.extras.pax[0]?.extraBags, 2);
      });
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

    it("presents gate '—' and terminal '—' when effective flight is null (missing/error)", () => {
      const vm = buildBoardingPassViewModel(booking, "out", 0, null);
      assert.equal(vm.flight.gate, "—");
      assert.equal(vm.flight.terminal, "—");
      assert.equal(vm.operationalStatus, "unavailable");
      // Booked scheduled facts survive
      assert.equal(vm.scheduledDepartureTime, "07:15");
      assert.equal(vm.revisedDepartureTime, undefined);
    });

    it("presents operational override gate B9 and revised departure 08:30 distinct from scheduled 07:15", () => {
      const overrideFlight: Flight = {
        ...mockOutboundFlight,
        gate: "B9",
        terminal: "T2",
        revisedDepart: "08:30",
        status: "Delayed",
      };
      const vm = buildBoardingPassViewModel(booking, "out", 0, overrideFlight);
      assert.equal(vm.flight.gate, "B9");
      assert.equal(vm.flight.terminal, "T2");
      assert.equal(vm.scheduledDepartureTime, "07:15");
      assert.equal(vm.revisedDepartureTime, "08:30");
      assert.equal(vm.operationalStatus, "active");
    });
  });

  describe("7. Canonical Seat Validation Domain Rules (Finding 1)", () => {
    const booking = createBaseBooking();

    describe("parseSeatCode", () => {
      it("parses valid seat codes correctly", () => {
        assert.deepEqual(parseSeatCode("1A"), { row: 1, letter: "A" });
        assert.deepEqual(parseSeatCode("11C"), { row: 11, letter: "C" });
        assert.deepEqual(parseSeatCode("28F"), { row: 28, letter: "F" });
      });

      it("returns null for malformed or out-of-range seat codes", () => {
        assert.equal(parseSeatCode(""), null);
        assert.equal(parseSeatCode("A"), null);
        assert.equal(parseSeatCode("12"), null);
        assert.equal(parseSeatCode("0A"), null);
        assert.equal(parseSeatCode("61A"), null);
        assert.equal(parseSeatCode("100A"), null);
        assert.equal(parseSeatCode("11AA"), null);
        assert.equal(parseSeatCode("row11"), null);
        assert.equal(parseSeatCode(" 11A"), null);
        assert.equal(parseSeatCode("11A "), null);
        assert.equal(parseSeatCode(" 11A  "), null);
        assert.equal(parseSeatCode("01A"), null);
        assert.equal(parseSeatCode("001A"), null);
        assert.equal(parseSeatCode("11a"), null);
      });
    });

    describe("isSeatInCabinZone", () => {
      it("validates rows according to cabin zone boundaries", () => {
        // Business: 1-4
        assert.equal(isSeatInCabinZone("1A", "business"), true);
        assert.equal(isSeatInCabinZone("4F", "business"), true);
        assert.equal(isSeatInCabinZone("5A", "business"), false);
        assert.equal(isSeatInCabinZone("11A", "business"), false);

        // Premium: 5-10
        assert.equal(isSeatInCabinZone("5A", "premium"), true);
        assert.equal(isSeatInCabinZone("10F", "premium"), true);
        assert.equal(isSeatInCabinZone("4A", "premium"), false);
        assert.equal(isSeatInCabinZone("11A", "premium"), false);

        // Economy: 11-28
        assert.equal(isSeatInCabinZone("11A", "economy"), true);
        assert.equal(isSeatInCabinZone("28F", "economy"), true);
        assert.equal(isSeatInCabinZone("1A", "economy"), false);
        assert.equal(isSeatInCabinZone("10A", "economy"), false);
      });
    });

    describe("validateUpdateSeatsAssignments", () => {
      it("accepts valid in-cabin available seats", () => {
        assert.doesNotThrow(() =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-0": "11C", "out-1": "12B" },
            booking.outbound,
            booking.inbound,
          ),
        );
      });

      it("rejects malformed seat code", () => {
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-0": "INVALID" },
              booking.outbound,
              booking.inbound,
            ),
          /invalid seat syntax/i,
        );
      });

      it("rejects seat outside booked cabin zone", () => {
        // Booking is economy (11-28), 1A is business
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-0": "1A" },
              booking.outbound,
              booking.inbound,
            ),
          /outside booked cabin/i,
        );
      });

      it("rejects deterministically unavailable seat", () => {
        // 12A is unavailable on PS100
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-0": "12A" },
              booking.outbound,
              booking.inbound,
            ),
          /not available/i,
        );
      });

      it("rejects duplicate physical seat among passengers on the same leg", () => {
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-0": "11C", "out-1": "11C" },
              booking.outbound,
              booking.inbound,
            ),
          /duplicate/i,
        );
      });

      it("rejects assigning a seat to an infant passenger", () => {
        // Passenger index 2 is an infant
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-2": "11C" },
              booking.outbound,
              booking.inbound,
            ),
          /infant/i,
        );
      });

      it("rejects assignment for nonexistent passenger key", () => {
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-99": "11C" },
              booking.outbound,
              booking.inbound,
            ),
          /passenger/i,
        );

        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "invalid-key": "11C" },
              booking.outbound,
              booking.inbound,
            ),
          /invalid seat assignment key/i,
        );
      });

      it("rejects inbound seat assignment on a one-way booking", () => {
        const oneWayBooking = { ...booking, inbound: null };
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              oneWayBooking,
              { "in-0": "11C" },
              oneWayBooking.outbound,
              null,
            ),
          /one-way trip/i,
        );
      });

      it("retains same passenger's existing canonical seat privilege", () => {
        // Passenger 0 currently has 11A. Retaining 11A passes even though 11A might be considered occupied for others.
        assert.doesNotThrow(() =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-0": "11A" },
            booking.outbound,
            booking.inbound,
          ),
        );
      });

      it("prevents another passenger from acquiring the existing seat of another passenger", () => {
        // 12A is deterministically unavailable on PS100.
        // Passenger 0 has 12A in their booking.
        const bookingWithUnavailableSeat = createBaseBooking({
          seats: { "out-0": "12A" },
        });

        // Passenger 0 can retain 12A due to same-owner privilege
        assert.doesNotThrow(() =>
          validateUpdateSeatsAssignments(
            bookingWithUnavailableSeat,
            { "out-0": "12A" },
            bookingWithUnavailableSeat.outbound,
            bookingWithUnavailableSeat.inbound,
          ),
        );

        // Passenger 1 attempting to acquire 12A cannot bypass availability and must reject!
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              bookingWithUnavailableSeat,
              { "out-1": "12A" },
              bookingWithUnavailableSeat.outbound,
              bookingWithUnavailableSeat.inbound,
            ),
          /not available/i,
        );
      });

      it("resolves the correct canonical flight for the requested leg (inbound vs outbound)", () => {
        // Deterministic facts:
        // On Outbound (PS100): 13A is AVAILABLE, 12A is OCCUPIED.
        // On Inbound (PS101):  12A is AVAILABLE, 13A is OCCUPIED.

        // Outbound leg: 13A succeeds, 12A fails
        assert.doesNotThrow(() =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-0": "13A" },
            booking.outbound,
            booking.inbound,
          ),
        );
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "out-0": "12A" },
              booking.outbound,
              booking.inbound,
            ),
          /not available on flight PS100/i,
        );

        // Inbound leg: 12A succeeds, 13A fails
        assert.doesNotThrow(() =>
          validateUpdateSeatsAssignments(
            booking,
            { "in-0": "12A" },
            booking.outbound,
            booking.inbound,
          ),
        );
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(
              booking,
              { "in-0": "13A" },
              booking.outbound,
              booking.inbound,
            ),
          /not available on flight PS101/i,
        );
      });

      it("preserves unrelated leg assignments when updating seats", async () => {
        const repoStorage = createMockStorage({
          "gza.repo.v1": JSON.stringify({
            schemaVersion: 1,
            bookings: [
              {
                ...booking,
                seats: {
                  "out-0": "11A",
                  "in-0": "12B",
                },
              },
            ],
            flightOverrides: {},
          }),
        });
        const c = new RepoStorageCoordinator({ storage: repoStorage });
        const r = new LocalBookingRepository(c);

        // Update outbound seat only
        const updated = await r.updateSeats("GZA-5C01", { "out-0": "11C" });
        assert.equal(updated.seats["out-0"], "11C");
        // Inbound seat preserved!
        assert.equal(updated.seats["in-0"], "12B");
      });
    });

    describe("validateCheckInSeats", () => {
      it("validates check-in seats with correct flight ID and cabin rules", () => {
        assert.doesNotThrow(() =>
          validateCheckInSeats(
            booking,
            "out",
            [0, 1],
            { 0: "15A", 1: "15B" },
            mockOutboundFlight,
          ),
        );
      });

      it("rejects unavailable seat during check-in", () => {
        // 12A is unavailable on PS100
        assert.throws(
          () =>
            validateCheckInSeats(
              booking,
              "out",
              [0],
              { 0: "12A" },
              mockOutboundFlight,
            ),
          /not available/i,
        );
      });

      it("rejects seat outside cabin during check-in", () => {
        assert.throws(
          () =>
            validateCheckInSeats(
              booking,
              "out",
              [0],
              { 0: "1A" },
              mockOutboundFlight,
            ),
          /cabin/i,
        );
      });

      it("rejects duplicate physical seat assignment during check-in", () => {
        assert.throws(
          () =>
            validateCheckInSeats(
              booking,
              "out",
              [0, 1],
              { 0: "15A", 1: "15A" },
              mockOutboundFlight,
            ),
          /duplicate/i,
        );
      });
    });
  });

  describe("8. Checked-in Seat State Exact Immutability (Finding 2)", () => {
    it("allows keeping the same seat for a checked-in passenger", () => {
      const booking = createBaseBooking({
        seats: { "out-0": "11A", "out-1": "11B" },
        checkedIn: { out: [0], in: [] },
      });

      // Passenger 0 is checked in with 11A. Keeping 11A succeeds.
      assert.doesNotThrow(() =>
        validateUpdateSeatsAssignments(
          booking,
          { "out-0": "11A", "out-1": "12B" },
          booking.outbound,
          booking.inbound,
        ),
      );
    });

    it("rejects seat change for a checked-in passenger (11A to 12B)", () => {
      const booking = createBaseBooking({
        seats: { "out-0": "11A", "out-1": "11B" },
        checkedIn: { out: [0], in: [] },
      });

      // Passenger 0 is checked in with 11A. Changing to 12B must reject.
      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-0": "12B", "out-1": "11B" },
            booking.outbound,
            booking.inbound,
          ),
        /checked-in/i,
      );
    });

    it("rejects seat removal for a checked-in passenger", () => {
      const booking = createBaseBooking({
        seats: { "out-0": "11A", "out-1": "11B" },
        checkedIn: { out: [0], in: [] },
      });

      // Passenger 0 is checked in with 11A. Omitting out-0 must reject.
      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-1": "11B" },
            booking.outbound,
            booking.inbound,
          ),
        /checked-in/i,
      );
    });

    it("allows absent-to-absent for a checked-in passenger who has no assigned seat", () => {
      const booking = createBaseBooking({
        seats: { "out-1": "11B" }, // out-0 has no assigned seat
        checkedIn: { out: [0], in: [] },
      });

      // Passenger 0 is checked in with NO seat. Leaving out-0 absent succeeds.
      assert.doesNotThrow(() =>
        validateUpdateSeatsAssignments(
          booking,
          { "out-1": "12B" },
          booking.outbound,
          booking.inbound,
        ),
      );
    });

    it("rejects absent-to-seat for a checked-in passenger who has no assigned seat", () => {
      const booking = createBaseBooking({
        seats: { "out-1": "11B" }, // out-0 has no assigned seat
        checkedIn: { out: [0], in: [] },
      });

      // Passenger 0 is checked in with NO seat. Assigning 11A must reject.
      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            booking,
            { "out-0": "11A", "out-1": "11B" },
            booking.outbound,
            booking.inbound,
          ),
        /checked-in/i,
      );
    });

    it("enforces seat immutability inside the completeCheckIn repository command", async () => {
      const initialBooking = createBaseBooking({
        seats: { "out-0": "11A", "out-1": "11B" },
        checkedIn: { out: [0], in: [] },
      });
      const repoStorage = createMockStorage({
        "gza.repo.v1": JSON.stringify({
          schemaVersion: 1,
          bookings: [initialBooking],
          flightOverrides: {},
        }),
      });
      const c = new RepoStorageCoordinator({ storage: repoStorage });
      const r = new LocalBookingRepository(c);
      const checkInClock = new Date("2026-10-10T04:00:00+03:00");

      // Passenger 0 is already checked in with 11A. Attempting to check in with 15A must reject!
      await assert.rejects(
        () =>
          r.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "P10001" },
            seats: { 0: "15A" },
            now: checkInClock,
          }),
        /already checked in/i,
      );
    });
  });

  describe("9. Duplicate Check-in Passenger Indexes & Replay Ordering (Finding 3)", () => {
    let mockStorage: ReturnType<typeof createMockStorage>;
    let coordinator: RepoStorageCoordinator;
    let repo: LocalBookingRepository;
    const checkInClock = new Date("2026-10-10T04:00:00+03:00");

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
    });

    it("rejects duplicate passenger indexes [0, 0] BEFORE replay check", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0, 0],
            documents: { 0: "P10001" },
            seats: { 0: "11A" },
            now: checkInClock,
          }),
        /duplicate passenger index/i,
      );
    });

    it("rejects [0, 0] even when passenger 0 is already checked in (strictly before replay check)", async () => {
      // First successfully check in passenger 0
      await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });

      // Now attempt duplicate index submission [0, 0] — must reject with duplicate error, NOT succeed as replay
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0, 0],
            documents: { 0: "P10001" },
            seats: { 0: "11A" },
            now: checkInClock,
          }),
        /duplicate passenger index/i,
      );
    });

    it("rejects negative passenger index [-1]", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [-1],
            documents: {},
            seats: {},
            now: checkInClock,
          }),
        /out of range/i,
      );
    });

    it("rejects out-of-range passenger index [99]", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [99],
            documents: {},
            seats: {},
            now: checkInClock,
          }),
        /out of range/i,
      );
    });

    it("rejects non-integer passenger index [1.5]", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [1.5 as unknown as number],
            documents: {},
            seats: {},
            now: checkInClock,
          }),
        /must be an integer/i,
      );
    });

    it("rejects empty passenger index list []", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [],
            documents: {},
            seats: {},
            now: checkInClock,
          }),
        /at least one passenger/i,
      );
    });

    it("rejects infant passenger index [2]", async () => {
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [2],
            documents: { 2: "P10003" },
            seats: {},
            now: checkInClock,
          }),
        /infant/i,
      );
    });

    it("preserves idempotent replay for identical completed submission", async () => {
      const input = {
        ref: "GZA-5C01",
        leg: "out" as const,
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      };

      const first = await repo.completeCheckIn(input);
      assert.deepEqual(first.checkedIn.out, [0]);
      assert.equal(first.seats["out-0"], "11A");

      // Identical replay returns existing booking
      const replay = await repo.completeCheckIn(input);
      assert.deepEqual(replay.checkedIn.out, [0]);
      assert.equal(replay.seats["out-0"], "11A");
      assert.equal(replay.passengers[0]?.document, "P10001");
    });

    it("rejects non-identical request for already checked-in passenger (changed document)", async () => {
      await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });

      // Submitting changed document for already checked-in passenger must reject
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "NEW-DOC-CHANGED" },
            seats: { 0: "11A" },
            now: checkInClock,
          }),
        /already checked in/i,
      );
    });

    it("rejects non-identical request for already checked-in passenger (changed seat)", async () => {
      await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });

      // Submitting changed seat for already checked-in passenger must reject
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "P10001" },
            seats: { 0: "15A" },
            now: checkInClock,
          }),
        /already checked in/i,
      );
    });
  });

  describe("12. Phase 5C Correction 02: Selected-Only Passenger Check-in Seats (Defect 1)", () => {
    let mockStorage: ReturnType<typeof createMockStorage>;
    let coordinator: RepoStorageCoordinator;
    let repo: LocalBookingRepository;
    const checkInClock = new Date("2026-10-10T04:00:00+03:00");

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
    });

    it("rejects explicit unselected seat entry, leaving booking and backing storage unchanged", async () => {
      let notifications = 0;
      coordinator.subscribe(() => {
        notifications++;
      });

      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");

      // Attempt to check in passenger 0, but provide seat for unselected passenger 1
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "NEW-DOC-0" },
            seats: { 0: "15A", 1: "15B" }, // 1 is unselected!
            now: checkInClock,
          }),
        /unselected passenger/i,
      );

      // Verify in-memory state completely unchanged
      const inMemory = await repo.getByRef("GZA-5C01");
      assert.deepEqual(inMemory, baselineBooking);

      // Verify backing storage unchanged
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

      // Verify subscribers received zero notifications
      assert.equal(notifications, 0);
    });

    it("legitimate partial check-in commits only selected passenger and preserves unselected passenger facts", async () => {
      const updated = await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "NEW-DOC-AHMAD", 1: "STALE-DOC-FATIMA" }, // doc for 1 should be ignored
        seats: { 0: "15A" }, // only selected passenger 0 seat provided
        now: checkInClock,
      });

      // Passenger 0 committed
      assert.deepEqual(updated.checkedIn.out, [0]);
      assert.equal(updated.seats["out-0"], "15A");
      assert.equal(updated.passengers[0]?.document, "NEW-DOC-AHMAD");

      // Passenger 1 preserved completely: seat remains 11B, document remains P10002, unchecked
      assert.equal(updated.seats["out-1"], "11B");
      assert.equal(updated.passengers[1]?.document, "P10002");

      // Persisted in storage
      const persisted = await repo.getByRef("GZA-5C01");
      assert.deepEqual(persisted?.checkedIn.out, [0]);
      assert.equal(persisted?.seats["out-0"], "15A");
      assert.equal(persisted?.seats["out-1"], "11B");
      assert.equal(persisted?.passengers[1]?.document, "P10002");
    });

    it("invalid extra seat entries cannot bypass the boundary through identical replay handling", async () => {
      // First, check in passenger 0 legitimately
      await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });

      // Valid identical replay succeeds idempotently
      const replay = await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });
      assert.deepEqual(replay.checkedIn.out, [0]);

      // Replay attempt with unselected passenger seat MUST REJECT in Step 1, not return existing booking!
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "P10001" },
            seats: { 0: "11A", 1: "11B" }, // extra seat entry for unselected passenger 1
            now: checkInClock,
          }),
        /unselected passenger/i,
      );
    });

    it("validateCheckInSeats rejects unselected passenger seat and non-integer keys", () => {
      const b = createBaseBooking();
      assert.throws(
        () =>
          validateCheckInSeats(
            b,
            "out",
            [0],
            { 0: "15A", 1: "15B" },
            mockOutboundFlight,
          ),
        /unselected passenger/i,
      );

      assert.throws(
        () =>
          validateCheckInSeats(
            b,
            "out",
            [0],
            { "0abc": "15A" } as unknown as Record<number, string>,
            mockOutboundFlight,
          ),
        /invalid passenger index key/i,
      );
    });
  });

  describe("13. Phase 5C Correction 02: Canonical Flight Authority for updateSeats() (Defect 2)", () => {
    let mockStorage: ReturnType<typeof createMockStorage>;
    let coordinator: RepoStorageCoordinator;
    let repo: LocalBookingRepository;

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
    });

    it("canonical outbound exists -> valid outbound change succeeds", async () => {
      // PS100 exists in schedule (data.ts)
      const updated = await repo.updateSeats("GZA-5C01", {
        "out-0": "11C",
        "out-1": "12B",
      });
      assert.equal(updated.seats["out-0"], "11C");
      assert.equal(updated.seats["out-1"], "12B");

      const persisted = await repo.getByRef("GZA-5C01");
      assert.equal(persisted?.seats["out-0"], "11C");
      assert.equal(persisted?.seats["out-1"], "12B");
    });

    it("outbound missing -> new/reassigned seat rejected, complete memory/storage unchanged", async () => {
      // Point the booking to a non-existent flight ID in the catalog
      coordinator.mutate(state => {
        // Fixture setup only: production booking mutations use typed commands.
        Object.assign(state.bookings[0]!, {
          outbound: {
            ...mockOutboundFlight,
            id: "PS999-2026-10-10-out",
          },
        });
      });

      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");

      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-0": "11C",
            "out-1": "12B",
          }),
        /unavailable/i,
      );

      // Memory unchanged
      const inMemory = await repo.getByRef("GZA-5C01");
      assert.deepEqual(inMemory, baselineBooking);

      // Storage unchanged
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);
    });

    it("actual removal on missing leg also rejected", async () => {
      // Point the booking to a non-existent flight ID in the catalog
      coordinator.mutate(state => {
        // Fixture setup only: production booking mutations use typed commands.
        Object.assign(state.bookings[0]!, {
          outbound: {
            ...mockOutboundFlight,
            id: "PS999-2026-10-10-out",
          },
        });
      });

      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");

      // Attempt to remove passenger 0's seat by only specifying passenger 1
      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-1": "11B", // out-0 omitted -> removal
          }),
        /unavailable/i,
      );

      // Memory and storage unchanged
      assert.deepEqual(await repo.getByRef("GZA-5C01"), baselineBooking);
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);
    });

    it("round trip with resolvable outbound and missing inbound -> outbound-only mutation succeeds and inbound stays unchanged; inbound mutation rejects", async () => {
      // Outbound PS100 is in catalog; inbound PS999 is missing from catalog
      coordinator.mutate(state => {
        // Fixture setup only: production booking mutations use typed commands.
        Object.assign(state.bookings[0]!, {
          inbound: {
            ...mockInboundFlight,
            id: "PS999-2026-10-15-in",
          },
          seats: {
            "out-0": "11A",
            "out-1": "11B",
            "in-0": "14A",
            "in-1": "14B",
          },
        });
      });

      // 1. Outbound-only mutation succeeds
      const updated = await repo.updateSeats("GZA-5C01", {
        "out-0": "11C",
        "out-1": "12B",
      });
      assert.equal(updated.seats["out-0"], "11C");
      assert.equal(updated.seats["out-1"], "12B");
      // Inbound seats untouched!
      assert.equal(updated.seats["in-0"], "14A");
      assert.equal(updated.seats["in-1"], "14B");

      // 2. Inbound mutation rejects
      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "in-0": "15A",
          }),
        /unavailable/i,
      );
    });

    it("genuine unchanged request on missing leg is non-destructive under the chosen documented rule", async () => {
      // Point the booking to a non-existent flight ID
      coordinator.mutate(state => {
        // Fixture setup only: production booking mutations use typed commands.
        Object.assign(state.bookings[0]!, {
          outbound: {
            ...mockOutboundFlight,
            id: "PS999-2026-10-10-out",
          },
        });
      });

      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");

      // 1. Unchanged explicit seat map passes non-destructively
      const sameSeats = await repo.updateSeats("GZA-5C01", {
        "out-0": "11A",
        "out-1": "11B",
      });
      assert.equal(sameSeats.seats["out-0"], "11A");
      assert.equal(sameSeats.seats["out-1"], "11B");
      assert.deepEqual(sameSeats, baselineBooking);

      // 2. Empty map (omitting both legs preserves both) passes non-destructively
      const emptyUpdate = await repo.updateSeats("GZA-5C01", {});
      assert.deepEqual(emptyUpdate, baselineBooking);
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);
    });

    it("operational overrides retain canonical flight-ID seat availability identity", async () => {
      // Apply operational delay / gate override on PS100
      coordinator.mutate((state) => {
        state.flightOverrides["PS100-2026-10-10-out"] = {
          flightId: "PS100-2026-10-10-out",
          gate: "B9",
          status: "Delayed",
          revisedDepart: "08:30",
        };
      });

      // 11C is available on PS100 schedule -> succeeds
      const updated = await repo.updateSeats("GZA-5C01", {
        "out-0": "11C",
      });
      assert.equal(updated.seats["out-0"], "11C");

      // 12A is occupied on PS100 schedule -> must reject with not available
      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-0": "12A",
          }),
        /not available/i,
      );
    });
  });

  describe("14. Phase 5C Correction 03: Canonical Seat Representation & Alias Rejection", () => {
    let mockStorage: ReturnType<typeof createMockStorage>;
    let coordinator: RepoStorageCoordinator;
    let repo: LocalBookingRepository;
    let notifyCount = 0;
    const checkInClock = new Date("2026-10-10T04:00:00+03:00");

    beforeEach(() => {
      notifyCount = 0;
      const booking = createBaseBooking();
      const initialJson = JSON.stringify({
        schemaVersion: 1,
        bookings: [booking],
        flightOverrides: {},
      });
      mockStorage = createMockStorage({ "gza.repo.v1": initialJson });
      coordinator = new RepoStorageCoordinator({ storage: mockStorage });
      repo = new LocalBookingRepository(coordinator);
      repo.subscribe(() => {
        notifyCount++;
      });
    });

    it("1. repository-level update with missing canonical outbound and out-00 rejects; complete booking and backing storage unchanged; zero successful notification/write", async () => {
      // Point outbound to missing flight ID in catalog and clear seats
      coordinator.mutate(state => {
        // Fixture setup only: production booking mutations use typed commands.
        Object.assign(state.bookings[0]!, {
          outbound: {
            ...mockOutboundFlight,
            id: "PS999-2026-10-10-out",
          },
          seats: {},
        });
      });

      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");
      notifyCount = 0;

      // Attempt to update with out-00 alias
      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-00": "15A",
          }),
        /Invalid seat assignment key 'out-00'/i,
      );

      // Memory unchanged
      const inMemory = await repo.getByRef("GZA-5C01");
      assert.deepEqual(inMemory, baselineBooking);
      assert.deepEqual(inMemory?.seats, {});

      // Backing storage unchanged
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);

      // Zero successful notifications
      assert.equal(notifyCount, 0);
    });

    it("2. rejects leading-zero and whitespace assignment-key aliases; exact out-0 and in-1 remain valid", async () => {
      // Direct unit validation on parseSeatKey
      assert.equal(parseSeatKey("out-00"), null);
      assert.equal(parseSeatKey("out-01"), null);
      assert.equal(parseSeatKey("out-000"), null);
      assert.equal(parseSeatKey(" out-0"), null);
      assert.equal(parseSeatKey("out-0 "), null);
      assert.equal(parseSeatKey(" out-0 "), null);
      assert.equal(parseSeatKey("in-00"), null);
      assert.equal(parseSeatKey("in-01"), null);
      assert.equal(parseSeatKey(" in-0"), null);
      assert.equal(parseSeatKey("in-0 "), null);
      assert.equal(parseSeatKey(" in-1 "), null);

      assert.deepEqual(parseSeatKey("out-0"), { leg: "out", paxIndex: 0 });
      assert.deepEqual(parseSeatKey("out-1"), { leg: "out", paxIndex: 1 });
      assert.deepEqual(parseSeatKey("in-0"), { leg: "in", paxIndex: 0 });
      assert.deepEqual(parseSeatKey("in-1"), { leg: "in", paxIndex: 1 });
      assert.deepEqual(parseSeatKey("out-10"), { leg: "out", paxIndex: 10 });
      assert.deepEqual(parseSeatKey("in-20"), { leg: "in", paxIndex: 20 });

      // Shared validator rejects aliases
      const b = createBaseBooking();
      for (const invalidKey of ["out-00", "out-01", " out-0", "out-0 ", "in-00", " in-1 "]) {
        assert.throws(
          () =>
            validateUpdateSeatsAssignments(b, { [invalidKey]: "11A" }, {
              outbound: mockOutboundFlight,
              inbound: mockInboundFlight,
            }),
          /Invalid seat assignment key/i,
        );
      }

      // Repository update rejects aliases
      await assert.rejects(
        () => repo.updateSeats("GZA-5C01", { "out-00": "11A" }),
        /Invalid seat assignment key 'out-00'/i,
      );
      await assert.rejects(
        () => repo.updateSeats("GZA-5C01", { " out-0": "11A" }),
        /Invalid seat assignment key ' out-0'/i,
      );

      // Exact valid out-0 and in-1 remain valid
      const updated = await repo.updateSeats("GZA-5C01", {
        "out-0": "11C",
        "in-1": "14B",
      });
      assert.equal(updated.seats["out-0"], "11C");
      assert.equal(updated.seats["in-1"], "14B");
    });

    it("3. rejects padded seat strings; two passengers cannot acquire same physical seat through 11A / 11A  aliases", async () => {
      const b = createBaseBooking();

      // Pure validator rejects padded seat strings with invalid syntax
      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            b,
            { "out-0": "11A", "out-1": "11A " },
            { outbound: mockOutboundFlight, inbound: mockInboundFlight },
          ),
        /Invalid seat syntax '11A '/i,
      );

      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            b,
            { "out-0": "11A", "out-1": " 11A" },
            { outbound: mockOutboundFlight, inbound: mockInboundFlight },
          ),
        /Invalid seat syntax ' 11A'/i,
      );

      // Pure validator rejects duplicate exact canonical seats
      assert.throws(
        () =>
          validateUpdateSeatsAssignments(
            b,
            { "out-0": "11A", "out-1": "11A" },
            { outbound: mockOutboundFlight, inbound: mockInboundFlight },
          ),
        /Duplicate seat assignment 11A for passengers 0 and 1/i,
      );

      // Repository command rejects padded seat string, preserving state and zero notifications
      const baselineBooking = structuredClone(await repo.getByRef("GZA-5C01"));
      const baselineRaw = mockStorage.getItem("gza.repo.v1");
      notifyCount = 0;

      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-0": "11A",
            "out-1": "11A ",
          }),
        /Invalid seat syntax '11A '/i,
      );

      assert.deepEqual(await repo.getByRef("GZA-5C01"), baselineBooking);
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);
      assert.equal(notifyCount, 0);

      // Repository command rejects duplicate exact canonical seats
      await assert.rejects(
        () =>
          repo.updateSeats("GZA-5C01", {
            "out-0": "11A",
            "out-1": "11A",
          }),
        /Duplicate seat assignment 11A/i,
      );

      assert.deepEqual(await repo.getByRef("GZA-5C01"), baselineBooking);
      assert.equal(mockStorage.getItem("gza.repo.v1"), baselineRaw);
      assert.equal(notifyCount, 0);
    });

    it("4. check-in cannot use a padded seat value or replay to circumvent exact canonical seat validation; legitimate identical replay still works", async () => {
      // 1. Initial check-in attempt with padded seat rejects
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "P10001" },
            seats: { 0: "11A " },
            now: checkInClock,
          }),
        /Invalid seat syntax '11A '/i,
      );

      // 2. Legitimate check-in with canonical seat succeeds
      const checkedIn = await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });
      assert.deepEqual(checkedIn.checkedIn.out, [0]);
      assert.equal(checkedIn.seats["out-0"], "11A");

      // 3. Legitimate identical replay succeeds idempotently
      const replay = await repo.completeCheckIn({
        ref: "GZA-5C01",
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "P10001" },
        seats: { 0: "11A" },
        now: checkInClock,
      });
      assert.deepEqual(replay.checkedIn.out, [0]);

      // 4. Replay attempt with padded seat code is rejected in Step 1 before replay handling
      await assert.rejects(
        () =>
          repo.completeCheckIn({
            ref: "GZA-5C01",
            leg: "out",
            selectedPaxIndexes: [0],
            documents: { 0: "P10001" },
            seats: { 0: "11A " },
            now: checkInClock,
          }),
        /Invalid seat syntax '11A '/i,
      );
    });
  });
});
