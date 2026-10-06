import { currentDeparturesOn } from "../helpers/current-service-fixture.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { LocalBookingRepository, getCanonicalOccupiedSeats } from "../../src/lib/repositories/booking-repository.ts";
import { RepoStorageCoordinator, REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { LocalCommercialCatalogRepository } from "../../src/lib/commercial/repository.ts";
import { CommercialStorageCoordinator } from "../../src/lib/commercial/storage.ts";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { FleetStorageCoordinator } from "../../src/lib/fleet/storage.ts";
import { seedFleetLayouts } from "../../src/lib/fleet/seed.ts";
import {
  seatExists,
  seatStructurallyAvailable,
  layoutCapacity,
  parseSeatCode,
} from "../../src/lib/fleet/layout.ts";
import { SeatValidationError } from "../../src/lib/domain/seat-validation.ts";
import type { BookingCreateInput, BookingPassenger, Booking } from "../../src/lib/domain/booking.ts";
import {
  todayISO,
  addDaysISO,
  isSeatAvailable,
  suggestSeat,
  type Flight,
} from "../../src/lib/data.ts";

function storageRig() {
  const store = new Map<string, string>();
  let writes = 0;

  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      writes++;
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };

  return { storage, store, getWrites: () => writes };
}

function createRig(initialBookings: Booking[] = []) {
  const { storage, store, getWrites } = storageRig();

  storage.setItem(
    REPO_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, bookings: initialBookings, flightOverrides: {} }),
  );

  const commercialCoord = new CommercialStorageCoordinator({ storage });
  const commercial = new LocalCommercialCatalogRepository(commercialCoord);

  const fleetCoord = new FleetStorageCoordinator({ storage });
  const fleet = new LocalFleetRepository(fleetCoord);

  const bookingCoord = new RepoStorageCoordinator({ storage });
  const booking = new LocalBookingRepository(bookingCoord, { commercial, fleet });

  return { storage, store, getWrites, commercial, fleet, booking, bookingCoord };
}

function getScheduledFlight(): Flight {
  const date = addDaysISO(todayISO(), 5);
  const flight = currentDeparturesOn(date).find((f) => f.status === "Scheduled" && f.seatsLeft >= 4);
  if (!flight) throw new Error(`No scheduled departures found on ${date}`);
  return flight;
}

function makePassenger(id: string, firstName: string, lastName: string, type: "adult" | "infant" = "adult", withAdult?: number): BookingPassenger {
  return {
    id,
    type,
    firstName,
    lastName,
    dob: type === "infant" ? "2025-06-01" : "1992-04-15",
    nationality: "PS",
    document: `DOC-${id}`,
    ...(type === "infant" ? { withAdult: withAdult ?? 0 } : {}),
  };
}

describe("Phase 6B2B Checkpoint D — Seat Occupancy, Invariants & Cross-PNR Collision Prevention", () => {
  test("distinguishes four separate occupancy concepts (Requirement 31)", () => {
    const layouts = seedFleetLayouts();
    const a321 = layouts["a321neo"]!;

    // 1. Nonexistent geometry: row 34 does not exist on A321 (33 rows)
    assert.equal(seatExists(a321, "34A"), false);
    assert.equal(seatExists(a321, "12Z"), false); // letter Z does not exist
    assert.equal(seatExists(a321, "12A"), true);

    // 2. Structural blocked seats: 33B and 33E are physically absent on A321neo
    assert.equal(seatExists(a321, "33B"), true); // physically exists in rows/letters
    assert.equal(seatStructurallyAvailable(a321, "33B"), false); // structurally blocked
    assert.equal(seatStructurallyAvailable(a321, "33E"), false);
    assert.equal(seatStructurallyAvailable(a321, "33A"), true);

    // 3. Deterministic flight hash pseudo-occupancy
    const flight = getScheduledFlight();
    const hashAvailable = isSeatAvailable(flight.id, 11, "A");
    assert.equal(typeof hashAvailable, "boolean");

    // 4. Canonical confirmed-PNR occupancy derived purely from repository confirmed bookings
    const mockBookings: Booking[] = [
      {
        ref: "GZA-CONF",
        createdAt: "2026-10-01T10:00:00Z",
        criteria: {
          tripType: "oneway",
          origin: flight.originCode,
          destination: flight.destinationCode,
          departDate: flight.date,
          returnDate: "",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: flight,
        fareId: "essential",
        passengers: [makePassenger("p1", "Fatima", "Nasser")],
        seats: { "out-0": "11C" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "fatima@example.ps", phone: "" },
        total: 150,
        status: "confirmed",
        ownerEmail: "fatima@example.ps",
        channel: "web",
      },
      {
        ref: "GZA-CANC",
        createdAt: "2026-10-01T10:00:00Z",
        criteria: {
          tripType: "oneway",
          origin: flight.originCode,
          destination: flight.destinationCode,
          departDate: flight.date,
          returnDate: "",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: flight,
        fareId: "essential",
        passengers: [makePassenger("p2", "Sami", "Nasser")],
        seats: { "out-0": "11D" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "sami@example.ps", phone: "" },
        total: 150,
        status: "cancelled", // Cancelled booking seats are NOT occupied
        ownerEmail: "sami@example.ps",
        channel: "web",
      },
    ];

    const occupied = getCanonicalOccupiedSeats(mockBookings, flight.id);
    assert.ok(occupied.has("11C"), "Confirmed booking seat must be canonical occupied");
    assert.ok(!occupied.has("11D"), "Cancelled booking seat must NOT be canonical occupied");
  });

  test("two competing creation attempts on the same seat: only one winner commits (Requirement 32, 34, 59)", async () => {
    const rig = createRig();
    const flight = getScheduledFlight();

    // Find a seat that is available in prototype hash
    const targetSeat = ["11A", "11B", "11C", "11D", "11E", "11F", "12A", "12B", "12C"]
      .find((s) => isSeatAvailable(flight.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter))!;
    assert.ok(targetSeat);

    const input1: BookingCreateInput = {
      criteria: {
        tripType: "oneway",
        origin: flight.originCode,
        destination: flight.destinationCode,
        departDate: flight.date,
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      outbound: flight,
      fareId: "essential",
      passengers: [makePassenger("p1", "Buyer", "One")],
      seats: { "out-0": targetSeat },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "buyer1@example.ps", phone: "" },
      submissionId: "sub-race-1",
      channel: "web",
    };

    const input2: BookingCreateInput = {
      ...input1,
      passengers: [makePassenger("p2", "Buyer", "Two")],
      contact: { email: "buyer2@example.ps", phone: "" },
      submissionId: "sub-race-2",
    };

    // Buyer 1 creates first and claims targetSeat
    const winner = await rig.booking.create(input1);
    assert.equal(winner.seats["out-0"], targetSeat);

    // Buyer 2 attempts to claim the exact same seat -> REJECTED
    await assert.rejects(
      () => rig.booking.create(input2),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, new RegExp(`Seat ${targetSeat} is already occupied`));
        return true;
      },
    );

    // Only 1 booking committed in storage
    const all = await rig.booking.list();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.ref, winner.ref);
  });

  test("updateSeats rejects collision with another confirmed PNR on the same flight (Requirement 32, 59)", async () => {
    const flight = getScheduledFlight();
    const candidateSeats = ["11A", "11B", "11C", "11D", "11E", "11F", "12A", "12B", "12C"]
      .filter((s) => isSeatAvailable(flight.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter));
    assert.ok(candidateSeats.length >= 3);

    const seatPnr1 = candidateSeats[0]!;
    const seatPnr2 = candidateSeats[1]!;
    const seatContested = seatPnr1; // PNR 2 will try to steal PNR 1's seat

    const booking1: Booking = {
      ref: "GZA-PNR1",
      createdAt: "2026-10-01T10:00:00Z",
      criteria: {
        tripType: "oneway",
        origin: flight.originCode,
        destination: flight.destinationCode,
        departDate: flight.date,
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      outbound: flight,
      fareId: "essential",
      passengers: [makePassenger("p1", "Owner", "One")],
      seats: { "out-0": seatPnr1 },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "owner1@example.ps", phone: "" },
      total: 180,
      status: "confirmed",
      ownerEmail: "owner1@example.ps",
      channel: "web",
    };

    const booking2: Booking = {
      ref: "GZA-PNR2",
      createdAt: "2026-10-01T10:00:00Z",
      criteria: {
        tripType: "oneway",
        origin: flight.originCode,
        destination: flight.destinationCode,
        departDate: flight.date,
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      outbound: flight,
      fareId: "essential",
      passengers: [makePassenger("p2", "Owner", "Two")],
      seats: { "out-0": seatPnr2 },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "owner2@example.ps", phone: "" },
      total: 180,
      status: "confirmed",
      ownerEmail: "owner2@example.ps",
      channel: "web",
    };

    const rig = createRig([booking1, booking2]);

    // PNR 2 tries to update seats to seatPnr1 (held by PNR 1)
    await assert.rejects(
      () => rig.booking.updateSeats("GZA-PNR2", { "out-0": seatContested }),
      (err: unknown) => {
        assert.ok(err instanceof SeatValidationError);
        assert.match(err.message, new RegExp(`Seat ${seatContested} is already occupied`));
        return true;
      },
    );

    // Same PNR updating with its OWN seat is grandfathered / allowed (same-owner privilege)
    const selfUpdate = await rig.booking.updateSeats("GZA-PNR1", { "out-0": seatPnr1 });
    assert.equal(selfUpdate.seats["out-0"], seatPnr1);
  });

  test("cancelled booking releases seat for another booking (Requirement 59)", async () => {
    const flight = getScheduledFlight();
    const candidateSeats = ["11A", "11B", "11C", "11D", "11E", "11F"]
      .filter((s) => isSeatAvailable(flight.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter));
    const targetSeat = candidateSeats[0]!;

    const initialBooking: Booking = {
      ref: "GZA-RELEASE",
      createdAt: "2026-10-01T10:00:00Z",
      criteria: {
        tripType: "oneway",
        origin: flight.originCode,
        destination: flight.destinationCode,
        departDate: flight.date,
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      outbound: flight,
      fareId: "essential",
      passengers: [makePassenger("p1", "Soon", "Cancelled")],
      seats: { "out-0": targetSeat },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "cancel@example.ps", phone: "" },
      total: 180,
      status: "confirmed",
      ownerEmail: "cancel@example.ps",
      channel: "web",
    };

    const rig = createRig([initialBooking]);

    // Another buyer cannot take targetSeat while initialBooking is confirmed
    const secondBuyerInput: BookingCreateInput = {
      criteria: initialBooking.criteria,
      outbound: flight,
      fareId: "essential",
      passengers: [makePassenger("p2", "Second", "Buyer")],
      seats: { "out-0": targetSeat },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "buyer2@example.ps", phone: "" },
      submissionId: "sub-release-2",
      channel: "web",
    };

    await assert.rejects(() => rig.booking.create(secondBuyerInput));

    // Cancel initial booking
    await rig.booking.cancel("GZA-RELEASE");
    const cancelled = await rig.booking.getByRef("GZA-RELEASE");
    assert.equal(cancelled?.status, "cancelled");

    // Now second buyer CAN acquire targetSeat
    const created = await rig.booking.create(secondBuyerInput);
    assert.equal(created.seats["out-0"], targetSeat);
  });

  test("infant passengers travel on adult lap and cannot be assigned seats (Requirement 35)", async () => {
    const flight = getScheduledFlight();
    const adult = makePassenger("adult-1", "Maya", "Khatib", "adult");
    const infant = makePassenger("infant-1", "Baby", "Khatib", "infant");

    const candidate: BookingCreateInput = {
      criteria: {
        tripType: "oneway",
        origin: flight.originCode,
        destination: flight.destinationCode,
        departDate: flight.date,
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 1,
        cabin: "economy",
      },
      outbound: flight,
      fareId: "essential",
      passengers: [adult, infant],
      seats: {
        "out-0": "11A",
        "out-1": "11B", // Attempt to assign seat to infant (index 1)
      },
      extras: {
        pax: [
          { extraBags: 0, meal: "standard", assistance: [] },
          { extraBags: 0, meal: "standard", assistance: [] },
        ],
      },
      contact: { email: "maya@example.ps", phone: "" },
      submissionId: "sub-infant-seat",
      channel: "web",
    };

    const rig = createRig();
    await assert.rejects(
      () => rig.booking.create(candidate),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot assign seat to infant passenger/i);
        return true;
      },
    );
  });

  test("suggestSeat dynamically evaluates layout geometry and avoids canonical occupied seats (Requirement 36)", () => {
    const layouts = seedFleetLayouts();
    const a321 = layouts["a321neo"]!;
    const flight = getScheduledFlight();

    // 1. Suggest window seat in economy
    const suggested = suggestSeat(flight.id, "economy", "window", [], a321);
    assert.ok(suggested, "Must suggest a valid seat");
    const parsed = parseSeatCode(suggested)!;
    assert.ok(["A", "F"].includes(parsed.letter), "Window seat must be column A or F");
    assert.ok(parsed.row >= 11 && parsed.row <= 33, "Economy zone is 11-33");

    // 2. Structurally unavailable seats (33B, 33E) are never suggested
    for (let i = 0; i < 20; i++) {
      const s = suggestSeat(flight.id, "economy", "aisle", [], a321);
      assert.notEqual(s, "33B");
      assert.notEqual(s, "33E");
    }

    // 3. Occupied seats passed into suggestSeat are strictly avoided
    const taken = new Set<string>();
    const first = suggestSeat(flight.id, "economy", "window", Array.from(taken), a321)!;
    taken.add(first);
    const second = suggestSeat(flight.id, "economy", "window", Array.from(taken), a321)!;
    assert.notEqual(first, second, "Suggested seat must not match taken seats");
  });
});
