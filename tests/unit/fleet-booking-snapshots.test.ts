import { currentDeparturesOn, currentArrivalsOn } from "../helpers/current-service-fixture.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { RepoStorageCoordinator, REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { LocalCommercialCatalogRepository } from "../../src/lib/commercial/repository.ts";
import { CommercialStorageCoordinator, COMMERCIAL_STORAGE_KEY } from "../../src/lib/commercial/storage.ts";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { FleetStorageCoordinator, FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";
import type { BookingCreateInput, BookingPassenger, Booking } from "../../src/lib/domain/booking.ts";
import { FROZEN_LEGACY_SEAT_LAYOUT, resolveBookingLegLayout, BookingCreationError } from "../../src/lib/domain/booking.ts";
import { todayISO, addDaysISO, isSeatAvailable, type Flight } from "../../src/lib/data.ts";
import { parseSeatCode } from "../../src/lib/fleet/layout.ts";

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

function createFleetBookingRig(initialRepoData?: { bookings: Booking[]; flightOverrides: Record<string, unknown> }) {
  const { storage, store, getWrites } = storageRig();

  storage.setItem(
    REPO_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, bookings: [], flightOverrides: {}, ...(initialRepoData ?? {}) }),
  );

  const commercialCoord = new CommercialStorageCoordinator({ storage });
  const commercial = new LocalCommercialCatalogRepository(commercialCoord);

  const fleetCoord = new FleetStorageCoordinator({ storage });
  const fleet = new LocalFleetRepository(fleetCoord);

  const bookingCoord = new RepoStorageCoordinator({ storage });
  const booking = new LocalBookingRepository(bookingCoord, { commercial, fleet });

  return { storage, store, getWrites, commercial, fleet, booking, bookingCoord };
}

function samplePassengers(): BookingPassenger[] {
  return [
    {
      id: "pax-1",
      type: "adult",
      firstName: "Hiba",
      lastName: "Al-Masri",
      dob: "1990-05-12",
      nationality: "PS",
      document: "P12345678",
    },
    {
      id: "pax-2",
      type: "adult",
      firstName: "Tariq",
      lastName: "Al-Masri",
      dob: "1988-11-20",
      nationality: "PS",
      document: "P87654321",
    },
  ];
}

function getScheduledOutbound(offsetDays = 5): Flight {
  const date = addDaysISO(todayISO(), offsetDays);
  const flight = Array.from({ length: 14 }, (_, i) => currentDeparturesOn(addDaysISO(date, i))).flat().find((f) => f.aircraftId === "a320neo" && f.status === "Scheduled" && f.seatsLeft >= 2);
  if (!flight) throw new Error(`No scheduled departures found on ${date}`);
  return flight;
}

function getMatchingInbound(outbound: Flight, offsetDays = 10): Flight {
  const date = addDaysISO(todayISO(), offsetDays);
  const flight = Array.from({ length: 21 }, (_, i) => currentArrivalsOn(addDaysISO(date, i))).flat().find(
    (f) =>
      f.date > outbound.date &&
      f.originCode === outbound.destinationCode &&
      f.destinationCode === outbound.originCode &&
      f.status === "Scheduled" &&
      f.seatsLeft >= 2,
  );
  if (!flight) {
    throw new Error(`No matching return arrival found from ${outbound.destinationCode} to ${outbound.originCode} on ${date}`);
  }
  return flight;
}

function makeCandidateInput(overrides?: Partial<BookingCreateInput>): BookingCreateInput {
  const outbound = getScheduledOutbound(5);

  return {
    criteria: {
      tripType: "oneway",
      origin: outbound.originCode,
      destination: outbound.destinationCode,
      departDate: outbound.date,
      returnDate: "",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "economy",
    },
    outbound,
    inbound: null,
    fareId: "essential",
    passengers: samplePassengers(),
    seats: Object.fromEntries(Array.from({ length: 18 }, (_, i) => i + 11).flatMap(row => ["A", "B", "C", "D", "E", "F"].filter(letter => isSeatAvailable(outbound.id, row, letter)).map(letter => `${row}${letter}`)).slice(0, 2).map((seat, i) => [`out-${i}`, seat])),
    extras: {
      pax: [
        { extraBags: 0, meal: "standard", assistance: [] },
        { extraBags: 0, meal: "standard", assistance: [] },
      ],
    },
    contact: {
      email: "traveler@example.ps",
      phone: "+970 8 282 1234",
    },
    submissionId: "sub-init-01",
    channel: "web",
    ...overrides,
  };
}

describe("Phase 6B2B Checkpoint D — Fleet Booking Layout Snapshots & Geometry Authority", () => {
  test("creates booking with canonical revision-A layout snapshot sealed from Fleet", async () => {
    const rig = createFleetBookingRig();
    const candidate = makeCandidateInput();

    const created = await rig.booking.create(candidate);
    assert.ok(created.seatLayouts, "Booking must have sealed seatLayouts snapshot");
    assert.equal(created.seatLayouts.version, 1);
    assert.equal(created.seatLayouts.out.basis, "fleet");
    assert.equal(created.seatLayouts.out.aircraftId, created.outbound.aircraftId ?? "a320neo");
    assert.ok(created.seatLayouts.out.rows >= 27);
    assert.ok(created.seatLayouts.out.letters.length >= 6);
    assert.ok(created.seatLayouts.out.capacity > 0);
  });

  test("confirmed PNR geometry remains stable when Fleet layout is subsequently mutated (Requirement 24, 57)", async () => {
    const rig = createFleetBookingRig();
    const candidateA = makeCandidateInput({ submissionId: "sub-pnr-a" });
    const pnrA = await rig.booking.create(candidateA);

    const snapshotA = structuredClone(pnrA.seatLayouts);
    assert.ok(snapshotA);
    const originalAircraftId = pnrA.seatLayouts!.out.aircraftId ?? "a320neo";

    // Mutate Fleet: layout changed to 20 rows, different legroom, registration updated (PS-GZX format)
    await rig.fleet.updateAircraft(originalAircraftId, { registration: "PS-GZX" });
    await rig.fleet.updateLayout(originalAircraftId, {
      rows: 20,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "premium", firstRow: 5, lastRow: 8 },
        { id: "economy", firstRow: 9, lastRow: 20 },
      ],
      extraLegroomRows: [9, 10],
      unavailable: [],
    });

    const fleetAfter = await rig.fleet.get();
    assert.equal(fleetAfter.layouts[originalAircraftId]?.rows, 20);

    // Old confirmed PNR reloaded from booking repository MUST remain byte-for-byte unchanged
    const pnrARefetched = await rig.booking.getByRef(pnrA.ref);
    assert.ok(pnrARefetched);
    assert.deepEqual(pnrARefetched.seatLayouts, snapshotA);
    assert.equal(pnrARefetched.seatLayouts?.out.rows, snapshotA.out.rows);
    assert.equal(pnrARefetched.seatLayouts?.out.registration, snapshotA.out.registration);
    assert.equal(pnrARefetched.total, pnrA.total);

    // New booking created now receives mutated layout with 20 rows
    const candidateB = makeCandidateInput({
      submissionId: "sub-pnr-b",
      seats: Object.fromEntries(["A", "B", "C", "D", "E", "F"].filter(letter => isSeatAvailable(candidateA.outbound.id, 9, letter)).slice(0, 2).map((letter, i) => [`out-${i}`, `9${letter}`])), // available row 9 economy seats
    });
    const pnrB = await rig.booking.create(candidateB);
    assert.ok(pnrB.seatLayouts);
    assert.equal(pnrB.seatLayouts.out.rows, 20);
    assert.equal(pnrB.seatLayouts.out.registration, "PS-GZX");

    // Both coexist stably on reload
    const freshBookingRepo = new LocalBookingRepository(
      new RepoStorageCoordinator({ storage: rig.storage }),
      { commercial: rig.commercial, fleet: rig.fleet },
    );
    const reloadedA = await freshBookingRepo.getByRef(pnrA.ref);
    const reloadedB = await freshBookingRepo.getByRef(pnrB.ref);

    assert.equal(reloadedA?.seatLayouts?.out.rows, snapshotA.out.rows);
    assert.equal(reloadedB?.seatLayouts?.out.rows, 20);
  });

  test("snapshotless legacy booking falls back to frozen 28xA-F geometry without read-time write migration (Requirement 23, 58)", async () => {
    const outbound = getScheduledOutbound(5);

    // Fabricate raw pre-phase legacy booking without seatLayouts in initial data
    const legacyBooking: Booking = {
      ref: "GZA-LEGACY",
      createdAt: "2026-09-01T12:00:00Z",
      criteria: {
        tripType: "oneway",
        origin: outbound.originCode,
        destination: outbound.destinationCode,
        departDate: outbound.date,
        returnDate: "",
        adults: 2,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      outbound,
      fareId: "essential",
      passengers: samplePassengers(),
      seats: { "out-0": "11A", "out-1": "11B" },
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
      contact: { email: "legacy@example.ps", phone: "+970 8 282 0000" },
      total: 360,
      status: "confirmed",
      ownerEmail: "legacy@example.ps",
      channel: "web",
    };

    const rig = createFleetBookingRig({
      bookings: [legacyBooking],
      flightOverrides: {},
    });

    const initialWrites = rig.getWrites();

    // 1. Reading legacy booking returns undefined seatLayouts and DOES NOT write to storage
    const read = await rig.booking.getByRef("GZA-LEGACY");
    assert.ok(read);
    assert.equal(read.seatLayouts, undefined);
    assert.equal(rig.getWrites(), initialWrites, "Read-only access must not migrate or write to storage");

    // Pure domain helper resolves the canonical frozen legacy layout
    const resolvedLayout = resolveBookingLegLayout(read, "out");
    assert.deepEqual(resolvedLayout, FROZEN_LEGACY_SEAT_LAYOUT);
    assert.equal(resolvedLayout.rows, 28);
    assert.equal(resolvedLayout.capacity, 168);

    // 2. Unchanged updateSeats call is a genuine no-op and preserves unmigrated state without write
    const noOpUpdate = await rig.booking.updateSeats("GZA-LEGACY", {
      "out-0": "11A",
      "out-1": "11B",
    });
    assert.equal(noOpUpdate.seatLayouts, undefined);
    assert.equal(rig.getWrites(), initialWrites, "No-op seat update must not write to storage");

    // 3. Real seat mutation seals the legacy snapshot into the booking
    const availOut = ["12A", "12B", "12C", "12D", "12E", "12F", "13A", "13B", "14A", "14B", "15A", "15B"]
      .filter((s) => isSeatAvailable(outbound.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter));
    assert.ok(availOut.length >= 2, "Must find at least 2 available seats on flight");

    const mutated = await rig.booking.updateSeats("GZA-LEGACY", {
      "out-0": availOut[0]!,
      "out-1": availOut[1]!,
    });
    assert.ok(mutated.seatLayouts, "Real seat mutation must seal legacy layout snapshot");
    assert.equal(mutated.seatLayouts.version, 1);
    assert.equal(mutated.seatLayouts.out.basis, "legacy");
    assert.equal(mutated.seatLayouts.out.rows, 28);
    assert.equal(mutated.seats["out-0"], availOut[0]!);
    assert.equal(mutated.seats["out-1"], availOut[1]!);
    assert.ok(rig.getWrites() > initialWrites, "Real seat mutation must persist updated booking");
  });

  test("rejects booking creation when requested cabin is unsupported on aircraft (Requirement 26, 60)", async () => {
    const rig = createFleetBookingRig();
    const outbound = getScheduledOutbound(5);

    // Override outbound flight to use B737-800 which has NO Premium cabin in seed
    await rig.bookingCoord.mutate((state) => {
      state.flightOverrides[outbound.id] = {
        flightId: outbound.id,
        aircraftId: "b737800",
        aircraft: "Boeing 737-800",
      };
    });

    const candidate = makeCandidateInput({
      outbound: {
        ...outbound,
        aircraftId: "b737800",
        aircraft: "Boeing 737-800",
      },
      criteria: {
        tripType: "oneway",
        origin: outbound.originCode,
        destination: outbound.destinationCode,
        departDate: outbound.date,
        returnDate: "",
        adults: 2,
        children: 0,
        infants: 0,
        cabin: "premium", // B737 does NOT support premium
      },
      seats: {},
    });

    await assert.rejects(
      () => rig.booking.create(candidate),
      (err: unknown) => {
        assert.ok(err instanceof BookingCreationError);
        assert.equal(err.reason, "cabin_unavailable");
        assert.equal(err.leg, "out");
        return true;
      },
    );
  });

  test("roundtrip booking requires cabin supported on BOTH legs (Requirement 26, 60)", async () => {
    const rig = createFleetBookingRig();
    const outbound = getScheduledOutbound(5);
    const inbound = getMatchingInbound(outbound, 10);

    // Override inbound flight to use B737-800 (no Premium cabin)
    await rig.bookingCoord.mutate((state) => {
      state.flightOverrides[inbound.id] = {
        flightId: inbound.id,
        aircraftId: "b737800",
        aircraft: "Boeing 737-800",
      };
    });

    const candidate = makeCandidateInput({
      outbound: {
        ...outbound,
        aircraftId: "a320neo",
      },
      inbound: {
        ...inbound,
        aircraftId: "b737800",
        aircraft: "Boeing 737-800",
      },
      criteria: {
        tripType: "round",
        origin: outbound.originCode,
        destination: outbound.destinationCode,
        departDate: outbound.date,
        returnDate: inbound.date,
        adults: 2,
        children: 0,
        infants: 0,
        cabin: "premium", // Outbound (A320) supports it, Inbound (B737) does NOT
      },
      seats: {},
    });

    await assert.rejects(
      () => rig.booking.create(candidate),
      (err: unknown) => {
        assert.ok(err instanceof BookingCreationError);
        assert.equal(err.reason, "cabin_unavailable");
        assert.equal(err.leg, "in");
        return true;
      },
    );
  });

  test("applies leg-aware seat pricing using each leg's layout extraLegroomRows (Requirement 30)", async () => {
    const rig = createFleetBookingRig();
    const outbound = getScheduledOutbound(5);
    const inbound = getMatchingInbound(outbound, 10);

    // Override inbound to use b737800 and customize extraLegroomRows to only [1, 25]
    await rig.fleet.updateAircraft("b737800", { active: true });
    await rig.fleet.updateLayout("b737800", {
      rows: 27,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "economy", firstRow: 5, lastRow: 27 },
      ],
      extraLegroomRows: [1, 25],
      unavailable: [],
    });

    await rig.bookingCoord.mutate((state) => {
      state.flightOverrides[outbound.id] = {
        flightId: outbound.id,
        aircraftId: "a320neo",
      };
      state.flightOverrides[inbound.id] = {
        flightId: inbound.id,
        aircraftId: "b737800",
        aircraft: "Boeing 737-800",
      };
    });

    // Passenger selects:
    // Outbound: row 11 (extra legroom on A320 [5, 11, 12] -> +$18)
    // Inbound: row 11 (STANDARD on B737 [1, 25] -> +$0)
    const candidate = makeCandidateInput({
      outbound: { ...outbound, aircraftId: "a320neo" },
      inbound: { ...inbound, aircraftId: "b737800", aircraft: "Boeing 737-800" },
      criteria: {
        tripType: "round",
        origin: outbound.originCode,
        destination: outbound.destinationCode,
        departDate: outbound.date,
        returnDate: inbound.date,
        adults: 1,
        children: 0,
        infants: 0,
        cabin: "economy",
      },
      passengers: [samplePassengers()[0]!],
      seats: {
        "out-0": ["11A", "11B", "11C", "11D", "11E", "11F", "12A", "12B"].find((s) => isSeatAvailable(outbound.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter))!,
        "in-0": ["11A", "11B", "11C", "11D", "11E", "11F", "14A", "14B"].find((s) => isSeatAvailable(inbound.id, parseSeatCode(s)!.row, parseSeatCode(s)!.letter))!,
      },
      fareId: "essential",
      extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
    });

    const booking = await rig.booking.create(candidate);
    assert.ok(booking.seatLayouts);
    assert.deepEqual(booking.seatLayouts.out.extraLegroomRows, [5, 11, 12]);
    assert.equal(booking.pricingSnapshot?.seatPricing.extraLegroomPrice, 18);
    const airfare = booking.outbound.basePrice + booking.inbound!.basePrice;
    const baseTotal = airfare + Math.round(airfare * .14);
    assert.equal(booking.total, baseTotal + 18, "outbound extra-legroom is charged; inbound row 11 is standard");
    // A later physical reclassification and price change must not alter either leg's historical fees.
    await rig.fleet.updateLayout("a320neo", { ...booking.seatLayouts!.out, extraLegroomRows: [13] });
    await rig.commercial.updateBaggage({ extraBagPrice: 99 });
    const extras = await rig.booking.updateExtras(booking.ref, { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] });
    assert.equal(extras.total, baseTotal + 18 + booking.pricingSnapshot!.extraBagPrice);
    assert.deepEqual(extras.seatLayouts, booking.seatLayouts);
    assert.deepEqual((await rig.booking.getByRef(booking.ref))!.seatLayouts, booking.seatLayouts);
  });

  test("committed replay guard works even when Fleet and Commercial stores are corrupt (Requirement 22, 119)", async () => {
    const rig = createFleetBookingRig();
    const candidate = makeCandidateInput({ submissionId: "replay-guard-sub" });

    // Initial creation succeeds
    const created = await rig.booking.create(candidate);
    assert.ok(created);

    // Corrupt Fleet and Commercial catalog storage completely
    rig.storage.setItem(FLEET_STORAGE_KEY, "{corrupt JSON garbage");
    rig.storage.setItem(COMMERCIAL_STORAGE_KEY, "{corrupt JSON garbage");

    // Replay creation with identical submissionId MUST succeed via the replay-first guard
    const replayed = await rig.booking.create(candidate);
    assert.equal(replayed.ref, created.ref);
    assert.equal(replayed.submissionId, "replay-guard-sub");
  });
});
