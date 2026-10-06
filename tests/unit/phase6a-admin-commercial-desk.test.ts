import { currentDeparturesOn } from "../helpers/current-service-fixture.ts";
import { describe, test } from "node:test";
import assert from "node:assert";
import {
  bookingToMockBooking,
  BookingCreationError,
  type Booking,
  type BookingCreateInput,
  type SearchCriteria,
} from "../../src/lib/domain/booking.ts";
import { LocalBookingRepository as BookingRepositoryImpl } from "../../src/lib/repositories/booking-repository.ts";
import { RepoStorageCoordinator } from "../../src/lib/repositories/storage.ts";
import { todayISO, addDaysISO, isSeatAvailable, type Flight } from "../../src/lib/data.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { bookingTotal, type BookingTotalInput } from "../../src/lib/domain/pricing.ts";
import { buildAdminCheckInRows } from "../../src/lib/domain/desk.ts";

describe("Phase 6A: Admin Commercial Desk Convergence Unit Suite", () => {
  const getTestFlight = (): Flight => {
    const flightDate = addDaysISO(todayISO(), 3);
    const flight = currentDeparturesOn(flightDate)[0];
    assert.ok(flight, `A test departure flight must exist on date ${flightDate}`);
    return flight;
  };

  const seatFor = (flight:Flight,index=0) => {
    const seats:string[]=[];
    for(let row=11;row<=28;row++) for(const letter of ["A","B","C","D","E","F"]) if(isSeatAvailable(flight.id,row,letter)) seats.push(`${row}${letter}`);
    return seats[index]!;
  };
  const getValidCriteria = (flight: Flight): SearchCriteria => ({
    tripType: "oneway",
    origin: "GZA",
    destination: flight.destinationCode,
    departDate: flight.date,
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "economy",
  });

  describe("1. Adapter Truth (bookingToMockBooking)", () => {
    test("accurately adapts desk booking without inventing facts", () => {
      const flight = getTestFlight();
      const booking: Booking = {
        ref: "GZA-DSK1",
        createdAt: "2026-10-03T10:00:00.000Z",
        channel: "desk",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          {
            id: "pax-1",
            type: "adult",
            firstName: "Sami",
            lastName: "Gaza",
            dob: "1988-04-12",
            document: "PAL-998822",
            nationality: "Palestinian",
          },
        ],
        seats: { "out-0": "14B" },
        extras: { pax: [{ extraBags: 1, meal: "vegetarian", assistance: ["wheelchair"] }] },
        contact: { email: "sami@example.com", phone: "+970599123456" },
        total: 180,
        status: "confirmed",
        checkedIn: { out: [], in: [] },
        ownerEmail: null,
      };

      const adapted = bookingToMockBooking(booking);

      assert.strictEqual(adapted.ref, "GZA-DSK1");
      assert.strictEqual(adapted.channel, "desk");
      assert.strictEqual(adapted.passengers[0].name, "Sami Gaza");
      assert.strictEqual(adapted.passengers[0].dob, "1988-04-12");
      assert.strictEqual(adapted.passengers[0].document, "PAL-998822");
      assert.strictEqual(adapted.passengers[0].seatOut, "14B");
      assert.strictEqual(adapted.passengers[0].bags, 1);
      assert.strictEqual(adapted.email, "sami@example.com");
      assert.strictEqual(adapted.phone, "+970599123456");
      assert.ok(adapted.history[0].what.en.includes("at the desk"));
      assert.ok(adapted.history[0].what.ar.includes("مكتب"));
    });

    test("accurately adapts web booking with online booking history note", () => {
      const flight = getTestFlight();
      const booking: Booking = {
        ref: "GZA-WEB1",
        createdAt: "2026-10-03T09:00:00.000Z",
        channel: "web",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "flex",
        passengers: [
          {
            id: "pax-1",
            type: "adult",
            firstName: "Leila",
            lastName: "Khaled",
            dob: "1992-06-15",
            document: "PAL-554433",
            nationality: "Palestinian",
          },
        ],
        seats: { "out-0": "3A" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "leila@example.com", phone: "+970599654321" },
        total: 250,
        status: "confirmed",
        checkedIn: { out: [0], in: [] },
        ownerEmail: "leila@example.com",
      };

      const adapted = bookingToMockBooking(booking);

      assert.strictEqual(adapted.ref, "GZA-WEB1");
      assert.strictEqual(adapted.channel, "web");
      assert.strictEqual(adapted.status, "checkedin");
      assert.ok(adapted.history[0].what.en.includes("website"));
    });
  });

  describe("2. Canonical Pricing on Creation", () => {
    test("recalculates total ignoring corrupted or zero client total", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const input: BookingCreateInput = {
        ref: "GZA-PRC1",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "classic",
        passengers: [
          {
            type: "adult",
            firstName: "Nasser",
            lastName: "Salah",
            dob: "1985-01-01",
            document: "PAL-100200",
            nationality: "Palestinian",
          },
        ],
        seats: { "out-0": seatFor(flight) },
        extras: { pax: [{ extraBags: 2, meal: "standard", assistance: [] }] },
        contact: { email: "nasser@example.com", phone: "+970599000111" },
        total: 0, // Corrupted / zero total sent by client
        channel: "desk",
      };

      const created = await repo.create(input);
      const expectedPricing = bookingTotal(input as BookingTotalInput);

      assert.ok(expectedPricing.total > 0, "Expected pricing must be > 0");
      assert.strictEqual(created.total, expectedPricing.total, "Stored total must match canonical calculation");
    });

    test("recalculates total even when an arbitrary inflated total is supplied", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const input: BookingCreateInput = {
        ref: "GZA-PRC2",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          {
            type: "adult",
            firstName: "Huda",
            lastName: "Omar",
            dob: "1994-03-20",
            document: "PAL-332211",
            nationality: "Palestinian",
          },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "huda@example.com", phone: "+970599222333" },
        total: 999999, // Fake inflated client price
        channel: "web",
      };

      const created = await repo.create(input);
      const expectedPricing = bookingTotal(input as BookingTotalInput);

      assert.strictEqual(created.total, expectedPricing.total);
      assert.notStrictEqual(created.total, 999999);
    });
  });

  describe("3. Channel Handling & Ownership", () => {
    test("desk booking sets ownerEmail to null", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const input: BookingCreateInput = {
        ref: "GZA-DSK2",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          {
            type: "adult",
            firstName: "Farah",
            lastName: "Zaid",
            dob: "1999-11-05",
            document: "PAL-776655",
            nationality: "Palestinian",
          },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "farah@example.com", phone: "+970599444555" },
        total: 100,
        channel: "desk",
      };

      const created = await repo.create(input);
      assert.strictEqual(created.channel, "desk");
      assert.strictEqual(created.ownerEmail, null);
    });

    test("web booking defaults channel to web and sets ownerEmail to contact email", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const input: BookingCreateInput = {
        ref: "GZA-WEB2",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          {
            type: "adult",
            firstName: "Tariq",
            lastName: "Amin",
            dob: "1991-08-14",
            document: "PAL-889900",
            nationality: "Palestinian",
          },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "tariq@example.com", phone: "+970599777888" },
        total: 100,
        ownerEmail: "tariq@example.com",
      };

      const created = await repo.create(input);
      assert.strictEqual(created.channel, "web");
      assert.strictEqual(created.ownerEmail, "tariq@example.com");
    });
  });

  describe("4. Boundary & Composition Validations", () => {
    test("rejects booking with no passengers or 0 adults", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const baseInput: BookingCreateInput = {
        ref: "GZA-INV1",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [],
        seats: {},
        extras: { pax: [] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(baseInput),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_passengers") || err.message.includes("adult"),
      );

      // Child only (no adult)
      const childOnlyInput: BookingCreateInput = {
        ...baseInput,
        passengers: [{ type: "child", firstName: "Baby", lastName: "Solo", dob: "2018-01-01", document: "", nationality: "Palestinian" }],
      };

      await assert.rejects(
        () => repo.create(childOnlyInput),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_passengers") || err.message.includes("adult"),
      );
    });

    test("rejects booking with infants exceeding adult count or invalid withAdult pointer", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const inputTwoInfantsOneAdult: BookingCreateInput = {
        ref: "GZA-INV2",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" },
          { type: "infant", firstName: "I1", lastName: "L", dob: "2026-01-01", document: "P2", nationality: "Palestinian", withAdult: 0 },
          { type: "infant", firstName: "I2", lastName: "L", dob: "2026-02-01", document: "P3", nationality: "Palestinian", withAdult: 0 },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputTwoInfantsOneAdult),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_infant") || err.message.includes("Infant"),
      );

      // Invalid withAdult pointer pointing to child or out-of-bounds
      const inputInvalidPointer: BookingCreateInput = {
        ref: "GZA-INV3",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" },
          { type: "infant", firstName: "I1", lastName: "L", dob: "2026-01-01", document: "P2", nationality: "Palestinian", withAdult: 99 },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputInvalidPointer),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_infant") || err.message.includes("Infant"),
      );
    });

    test("rejects invalid contact email", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const inputInvalidEmail: BookingCreateInput = {
        ref: "GZA-INV4",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [{ type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "not-an-email", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputInvalidEmail),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_contact") || err.message.includes("email"),
      );
    });

    test("rejects duplicate seats or seat assigned to infant", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      // Duplicate seats on same leg
      const inputDupSeats: BookingCreateInput = {
        ref: "GZA-INV5",
        criteria: {...getValidCriteria(flight),adults:2},
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" },
          { type: "adult", firstName: "A2", lastName: "L", dob: "1992-01-01", document: "P2", nationality: "Palestinian" },
        ],
        seats: { "out-0": "12A", "out-1": "12A" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputDupSeats),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_seats") || err.message.includes("Duplicate"),
      );

      // Infant assigned seat
      const inputInfantSeat: BookingCreateInput = {
        ref: "GZA-INV6",
        criteria: {...getValidCriteria(flight),infants:1},
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" },
          { type: "infant", firstName: "I1", lastName: "L", dob: "2026-01-01", document: "P2", nationality: "Palestinian", withAdult: 0 },
        ],
        seats: { "out-0": "12A", "out-1": "12B" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputInfantSeat),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_seats") || err.message.includes("Infant"),
      );
    });

    test("rejects invalid extras with bags exceeding max 5 per passenger", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const inputBagsOverLimit: BookingCreateInput = {
        ref: "GZA-INV7",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [{ type: "adult", firstName: "A1", lastName: "L", dob: "1990-01-01", document: "P1", nationality: "Palestinian" }],
        seats: {},
        extras: { pax: [{ extraBags: 6, meal: "standard", assistance: [] }] },
        contact: { email: "test@example.com", phone: "123" },
        total: 0,
      };

      await assert.rejects(
        () => repo.create(inputBagsOverLimit),
        (err: Error) => (err instanceof BookingCreationError && err.reason === "invalid_extras") || err.message.includes("Invalid extra bags"),
      );
    });
  });

  describe("5. undoCheckIn Specifications", () => {
    test("undoes single passenger check-in while preserving documents and seats", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const booking = await repo.create({
        ref: "GZA-UND1",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "flex",
        passengers: [
          { type: "adult", firstName: "Rami", lastName: "K", document: "DOC-101", dob: "1990-01-01", nationality: "Palestinian" },
        ],
        seats: { "out-0": seatFor(flight) },
        extras: { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] },
        contact: { email: "rami@example.com", phone: "123" },
        total: 0,
      });

      const scheduledEpoch = flightDepartureEpoch(flight);
      const checkInNow = new Date(scheduledEpoch - 2 * 60 * 60 * 1000);

      const checkedIn = await repo.completeCheckIn({
        ref: booking.ref,
        leg: "out",
        selectedPaxIndexes: [0],
        documents: { 0: "DOC-101" },
        seats: { 0: seatFor(flight) },
        now: checkInNow,
      });

      assert.deepStrictEqual(checkedIn.checkedIn.out, [0]);

      const undone = await repo.undoCheckIn({
        ref: booking.ref,
        leg: "out",
        selectedPaxIndexes: [0],
      });

      assert.deepStrictEqual(undone.checkedIn.out, []);
      // Verify preserved state
      assert.strictEqual(undone.passengers[0].document, "DOC-101");
      assert.strictEqual(undone.seats["out-0"], seatFor(flight));
      assert.strictEqual(undone.extras.pax[0].extraBags, 1);
      assert.strictEqual(undone.status, "confirmed");
    });

    test("undoes multiple passenger check-in correctly", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const booking = await repo.create({
        ref: "GZA-UND2",
        criteria: {...getValidCriteria(flight),adults:2,children:1},
        outbound: flight,
        inbound: null,
        fareId: "classic",
        passengers: [
          { type: "adult", firstName: "P1", lastName: "K", document: "D1", dob: "1990-01-01", nationality: "Palestinian" },
          { type: "adult", firstName: "P2", lastName: "K", document: "D2", dob: "1992-01-01", nationality: "Palestinian" },
          { type: "child", firstName: "P3", lastName: "K", document: "D3", dob: "2015-01-01", nationality: "Palestinian" },
        ],
        seats: { "out-0": seatFor(flight,0), "out-1": seatFor(flight,1), "out-2": seatFor(flight,2) },
        extras: {
          pax: [
            { extraBags: 0, meal: "standard", assistance: [] },
            { extraBags: 0, meal: "standard", assistance: [] },
            { extraBags: 0, meal: "standard", assistance: [] },
          ],
        },
        contact: { email: "multi@example.com", phone: "123" },
        total: 0,
      });

      const scheduledEpoch = flightDepartureEpoch(flight);
      const checkInNow = new Date(scheduledEpoch - 2 * 60 * 60 * 1000);

      await repo.completeCheckIn({
        ref: booking.ref,
        leg: "out",
        selectedPaxIndexes: [0, 1, 2],
        documents: { 0: "D1", 1: "D2", 2: "D3" },
        seats: { 0: seatFor(flight,0), 1: seatFor(flight,1), 2: seatFor(flight,2) },
        now: checkInNow,
      });

      // Partial undo: undo passenger 0 and 2, passenger 1 remains checked in
      const partialUndo = await repo.undoCheckIn({
        ref: booking.ref,
        leg: "out",
        selectedPaxIndexes: [0, 2],
      });

      assert.deepStrictEqual(partialUndo.checkedIn.out, [1]);
    });

    test("no-op when passenger is already not checked in", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const booking = await repo.create({
        ref: "GZA-UND3",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [{ type: "adult", firstName: "P1", lastName: "K", document: "D1", dob: "1990-01-01", nationality: "Palestinian" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "noop@example.com", phone: "123" },
        total: 0,
      });

      // Passenger 0 is NOT checked in
      assert.deepStrictEqual(booking.checkedIn.out, []);

      // Calling undoCheckIn must return booking safely with commit: false (no mutation)
      const res = await repo.undoCheckIn({
        ref: booking.ref,
        leg: "out",
        selectedPaxIndexes: [0],
      });

      assert.deepStrictEqual(res.checkedIn.out, []);
    });

    test("rejects undo check-in on cancelled booking", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const booking = await repo.create({
        ref: "GZA-UND4",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [{ type: "adult", firstName: "P1", lastName: "K", document: "D1", dob: "1990-01-01", nationality: "Palestinian" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "cancel@example.com", phone: "123" },
        total: 0,
      });

      await repo.cancel(booking.ref, "Customer request");

      await assert.rejects(
        () => repo.undoCheckIn({ ref: booking.ref, leg: "out", selectedPaxIndexes: [0] }),
        (err: Error) => err.message.includes("cancelled"),
      );
    });

    test("rejects undo check-in for infants or out of bounds passenger index", async () => {
      const coord = new RepoStorageCoordinator({ inMemoryOnly: true });
      const repo = new BookingRepositoryImpl(coord);
      const flight = getTestFlight();

      const booking = await repo.create({
        ref: "GZA-UND5",
        criteria: {...getValidCriteria(flight),infants:1},
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { type: "adult", firstName: "P1", lastName: "K", document: "D1", dob: "1990-01-01", nationality: "Palestinian" },
          { type: "infant", firstName: "I1", lastName: "K", document: "D2", dob: "2026-01-01", nationality: "Palestinian", withAdult: 0 },
        ],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "infant@example.com", phone: "123" },
        total: 0,
      });

      // Infant undo rejection
      await assert.rejects(
        () => repo.undoCheckIn({ ref: booking.ref, leg: "out", selectedPaxIndexes: [1] }),
        (err: Error) => err.message.includes("infant"),
      );

      // Out of bounds index
      await assert.rejects(
        () => repo.undoCheckIn({ ref: booking.ref, leg: "out", selectedPaxIndexes: [5] }),
        (err: Error) => err.message.includes("range") || err.message.includes("invalid"),
      );
    });
  });

  describe("6. Pure Selector: buildAdminCheckInRows", () => {
    test("correctly filters, orders status precedence, and omits lap infants", () => {
      const flight = getTestFlight();

      const bReady: Booking = {
        ref: "GZA-ROW1",
        createdAt: "2026-10-03T10:00:00.000Z",
        channel: "web",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { id: "p1", type: "adult", firstName: "Ahmad", lastName: "Nour", dob: "1980-01-01", document: "DOC1", nationality: "Palestinian" },
          { id: "p2", type: "infant", firstName: "Baby", lastName: "Nour", dob: "2026-01-01", document: "DOC2", nationality: "Palestinian", withAdult: 0 },
        ],
        seats: { "out-0": seatFor(flight) },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }, { extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "ahmad@example.com", phone: "123" },
        total: 100,
        status: "confirmed",
        checkedIn: { out: [], in: [] },
        ownerEmail: "ahmad@example.com",
      };

      const bNeedsSeat: Booking = {
        ref: "GZA-ROW2",
        createdAt: "2026-10-03T10:00:00.000Z",
        channel: "web",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { id: "p3", type: "adult", firstName: "Mona", lastName: "Saeed", dob: "1985-02-02", document: "DOC3", nationality: "Palestinian" },
        ],
        seats: {}, // No seat assigned
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "mona@example.com", phone: "123" },
        total: 100,
        status: "confirmed",
        checkedIn: { out: [], in: [] },
        ownerEmail: "mona@example.com",
      };

      const bNeedsDocs: Booking = {
        ref: "GZA-ROW3",
        createdAt: "2026-10-03T10:00:00.000Z",
        channel: "desk",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { id: "p4", type: "adult", firstName: "Kareem", lastName: "Taha", dob: "1990-03-03", document: "", nationality: "Palestinian" }, // No doc
        ],
        seats: { "out-0": "18C" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "kareem@example.com", phone: "123" },
        total: 100,
        status: "confirmed",
        checkedIn: { out: [], in: [] },
        ownerEmail: null,
      };

      const bDone: Booking = {
        ref: "GZA-ROW4",
        createdAt: "2026-10-03T10:00:00.000Z",
        channel: "web",
        criteria: getValidCriteria(flight),
        outbound: flight,
        inbound: null,
        fareId: "essential",
        passengers: [
          { id: "p5", type: "adult", firstName: "Dina", lastName: "Khalil", dob: "1995-04-04", document: "DOC5", nationality: "Palestinian" },
        ],
        seats: { "out-0": "7D" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "dina@example.com", phone: "123" },
        total: 100,
        status: "confirmed",
        checkedIn: { out: [0], in: [] }, // Checked in
        ownerEmail: "dina@example.com",
      };

      const bCancelled: Booking = {
        ...bDone,
        ref: "GZA-CAN1",
        status: "cancelled",
      };

      // Flight time within check-in window (24h before departure)
      const flightDepEpoch = flightDepartureEpoch(flight);
      const nowDuringCheckIn = new Date(flightDepEpoch - 2 * 60 * 60 * 1000); // 2 hours before departure

      const rows = buildAdminCheckInRows(
        flight,
        [bReady, bNeedsSeat, bNeedsDocs, bDone, bCancelled],
        nowDuringCheckIn,
      );

      // Verify bCancelled is excluded
      assert.ok(!rows.some((r) => r.ref === "GZA-CAN1"));

      // Verify infant is excluded from independent rows
      assert.strictEqual(rows.filter((r) => r.ref === "GZA-ROW1").length, 1);
      assert.strictEqual(rows.find((r) => r.ref === "GZA-ROW1")?.paxIndex, 0);

      // Verify status assignments
      const rowReady = rows.find((r) => r.ref === "GZA-ROW1");
      const rowSeat = rows.find((r) => r.ref === "GZA-ROW2");
      const rowDocs = rows.find((r) => r.ref === "GZA-ROW3");
      const rowDone = rows.find((r) => r.ref === "GZA-ROW4");

      assert.strictEqual(rowReady?.status, "ready");
      assert.strictEqual(rowSeat?.status, "seat");
      assert.strictEqual(rowDocs?.status, "docs");
      assert.strictEqual(rowDone?.status, "done");

      // Verify check-in closed / too early when now is 72 hours before flight
      const nowTooEarly = new Date(flightDepEpoch - 72 * 60 * 60 * 1000);
      const rowsTooEarly = buildAdminCheckInRows(flight, [bReady], nowTooEarly);
      assert.strictEqual(rowsTooEarly[0]?.status, "closed");
    });
  });
});
