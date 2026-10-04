import { canonicalCreateFixture } from "../helpers/booking-create-fixture.ts";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBooking,
  bookingLegs,
  seatedPassengers,
  checkedInPax,
  isPaxCheckedIn,
  isCheckedIn,
  openPaxForLeg,
  legFullyCheckedIn,
  openLegs,
  anyCheckedIn,
  passCount,
  bookingToMockBooking,
  BookingCreationError,
  type Booking,
} from "../../src/lib/domain/booking.ts";
import {
  getEffectiveFlight,
  sanitizeFlightOverride,
  isSyntheticFlightId,
  type FlightOverride,
} from "../../src/lib/domain/flight.ts";
import { INITIAL_BOOKING_SEEDS } from "../../src/lib/domain/booking-seeds.ts";
import {
  loadRepositoriesFromStorage,
  saveRepositoriesToStorage,
  migrateFromLegacyStores,
  getStorage,
  saveRepoStorage,
  REPO_STORAGE_KEY,
  RepoStorageCoordinator,
  StorageCommitError,
} from "../../src/lib/repositories/storage.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import {
  createRepositories,
  getIsolatedStudioRepositories,
  resetIsolatedStudioRepositories,
  resetDefaultRepositories,
} from "../../src/lib/repositories/registry.ts";
import { bookingKeys, flightKeys } from "../../src/lib/repositories/queries.ts";
import type { Flight } from "../../src/lib/data.ts";

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: "PS100-2026-10-15-out",
    number: "PS100",
    originCode: "GZA",
    destinationCode: "AMM",
    date: "2026-10-15",
    departTime: "19:45",
    arriveTime: "20:40",
    durationMinutes: 55,
    aircraft: "Boeing 737-800",
    status: "Scheduled",
    gate: "A6",
    terminal: "1",
    basePrice: 189,
    seatsLeft: 8,
    ...overrides,
  };
}

// In-memory mock storage implementation for Node test environment
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

class FailingStorage implements Storage {
  private store = new Map<string, string>();
  public shouldFail = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: storage write rejected");
    }
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

describe("Canonical Repositories & Domain Layer", () => {
  let mockStorage: MemoryStorage;

  const createTestRepos = (options?: { inMemoryOnly?: boolean }) =>
    createRepositories({ storage: mockStorage, ...options });
  const createTestBookingRepo = () => new LocalBookingRepository(undefined, { storage: mockStorage });
  const createTestFlightRepo = () => new LocalFlightRepository(undefined, { storage: mockStorage });

  beforeEach(() => {
    mockStorage = new MemoryStorage();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = mockStorage;
  });

  describe("Domain Model: Booking Normalization & Stable Passenger IDs", () => {
    it("generates deterministic stable passenger IDs based on booking reference and index", () => {
      const raw = {
        ref: "GZATEST1",
        account: false,
        passengers: [
          { name: "Yasser Arafat", type: "adult" },
          { name: "Leila Khaled", type: "adult" },
        ],
        outbound: createMockFlight(),
        contact: { email: "test@example.com", phone: "+970599000000" },
        fareFamily: "essential",
        cabin: "economy",
        total: 360,
        currency: "USD",
        status: "confirmed",
        bookedAt: "2026-09-26T12:00:00Z",
      };

      const normalized = normalizeBooking(raw);
      assert.equal(normalized.ref, "GZATEST1");
      assert.equal(normalized.passengers.length, 2);
      assert.equal(normalized.passengers[0]!.id, "pax-GZATEST1-0");
      assert.equal(normalized.passengers[1]!.id, "pax-GZATEST1-1");
    });

    it("preserves pre-existing passenger IDs if already provided", () => {
      const raw = {
        ref: "GZATEST2",
        account: false,
        passengers: [
          { id: "custom-pax-id-99", name: "Rami Hamdallah", type: "adult" },
        ],
        outbound: createMockFlight(),
        contact: { email: "rami@example.com", phone: "+970599111222" },
        fareFamily: "essential",
        cabin: "economy",
        total: 180,
        currency: "USD",
        status: "confirmed",
        bookedAt: "2026-09-26T12:00:00Z",
      };

      const normalized = normalizeBooking(raw);
      assert.equal(normalized.passengers[0]!.id, "custom-pax-id-99");
    });

    it("calculates leg check-in and helper selectors accurately", () => {
      const flight1 = createMockFlight({ id: "PS204-1" });
      const flight2 = createMockFlight({ id: "PS205-2", originCode: "AMM", destinationCode: "GZA" });

      const booking: Booking = {
        ref: "GZACHECK",
        account: false,
        contact: { email: "pax@example.com", phone: "+970599000000" },
        fareFamily: "essential",
        cabin: "economy",
        total: 360,
        currency: "USD",
        status: "confirmed",
        bookedAt: "2026-09-26T10:00:00Z",
        outbound: flight1,
        inbound: flight2,
        checkedIn: { out: [0], in: [] }, // passenger index 0 checked in on out leg
        seats: { "out-0": "12A" },
        passengers: [
          {
            id: "pax-1",
            firstName: "Hanan",
            lastName: "Ashrawi",
            type: "adult",
            nationality: "PS",
          },
          {
            id: "pax-2",
            firstName: "Mahmoud",
            lastName: "Darwish",
            type: "adult",
            nationality: "PS",
          },
        ],
      };

      assert.equal(passCount(booking), 1);
      assert.equal(booking.passengers.length, 2);
      assert.equal(bookingLegs(booking).length, 2);
      assert.equal(isPaxCheckedIn(booking, "out", 0), true);
      assert.equal(isPaxCheckedIn(booking, "out", 1), false);
      assert.equal(isPaxCheckedIn(booking, "in", 0), false);
      assert.equal(checkedInPax(booking, "out").length, 1);
      assert.equal(checkedInPax(booking, "in").length, 0);
      assert.equal(legFullyCheckedIn(booking, "out"), false);
      assert.equal(anyCheckedIn(booking), true);
      assert.equal(isCheckedIn(booking, "out"), true);
      assert.equal(isCheckedIn(booking, "in"), false);

      const openLegList = openLegs(booking);
      assert.equal(openLegList.length, 2);

      const openPax = openPaxForLeg(booking, "out");
      assert.equal(openPax.length, 1);
      assert.equal(openPax[0], 1); // passenger index 1 is open
    });

    it("losslessly maps canonical Booking to AdaptedAdminBooking via bookingToMockBooking", () => {
      const flight = createMockFlight({ number: "PS 204", originCode: "GZA", destinationCode: "AMM", date: "2026-10-15" });
      const booking: Booking = {
        ref: "GZAADAPT",
        account: true,
        contact: { email: "admin-check@example.com", phone: "+970599888777" },
        fareFamily: "plus",
        cabin: "business",
        total: 540,
        currency: "USD",
        status: "confirmed",
        bookedAt: "2026-09-26T09:00:00Z",
        createdAt: "2026-09-26T09:00:00Z",
        outbound: flight,
        checkedIn: { out: [0], in: [] },
        seats: { "out-0": "2A" },
        passengers: [
          {
            id: "pax-GZAADAPT-0",
            firstName: "Edward",
            lastName: "Said",
            type: "adult",
            dob: "1975-11-01",
            nationality: "PS",
            document: "P12345678",
          },
        ],
        extras: {
          pax: [
            { extraBags: 2, meal: "Standard", assistance: [] },
          ],
        },
      };

      const adapted = bookingToMockBooking(booking);
      assert.equal(adapted.ref, "GZAADAPT");
      assert.equal(adapted.account, true);
      assert.equal(adapted.lead, "Edward Said");
      assert.equal(adapted.email, "admin-check@example.com");
      assert.equal(adapted.phone, "+970599888777");
      assert.equal(adapted.flightOut, "PS 204");
      assert.equal(adapted.route, "GZA → AMM");
      assert.equal(adapted.date, "2026-10-15");
      assert.equal(adapted.status, "checkedin");
      assert.equal(adapted.paxCount, 1);
      assert.equal(adapted.passengers.length, 1);
      assert.equal(adapted.passengers[0]!.name, "Edward Said");
      assert.equal(adapted.passengers[0]!.seatOut, "2A");
      assert.equal(adapted.passengers[0]!.checkedOut, true);
      assert.equal(adapted.passengers[0]!.bags, 2);
    });
  });

  describe("Domain Model: Flight Override Pure Composition", () => {
    it("purely composes base flight with operational override", () => {
      const baseFlight = createMockFlight({
        departTime: "14:30",
        status: "Scheduled",
        gate: "A2",
        terminal: "1",
        aircraft: "Boeing 737-700",
      });

      const override: FlightOverride = {
        flightId: baseFlight.id,
        status: "Delayed",
        gate: "B4",
        terminal: "2",
        aircraft: "Airbus A320",
        revisedDepart: "15:45",
        note: "Late inbound aircraft",
        updatedAt: "2026-09-26T14:00:00Z",
        updatedBy: "OPS_MANAGER",
      };

      const effective = getEffectiveFlight(baseFlight, override);
      assert.equal(effective.status, "Delayed");
      assert.equal(effective.gate, "B4");
      assert.equal(effective.terminal, "2");
      assert.equal(effective.aircraft, "Airbus A320");
      assert.equal(effective.departTime, "14:30"); // original departTime unchanged
      // Non-overridden fields are preserved
      assert.equal(effective.number, baseFlight.number);
      assert.equal(effective.originCode, baseFlight.originCode);
      assert.equal(effective.destinationCode, baseFlight.destinationCode);
    });

    it("returns base flight unmodified when override is undefined or null", () => {
      const baseFlight = createMockFlight();
      assert.deepEqual(getEffectiveFlight(baseFlight, undefined), baseFlight);
      assert.deepEqual(getEffectiveFlight(baseFlight, null), baseFlight);
    });

    it("sanitizes flight override removing invalid statuses and trimming strings", () => {
      const raw = {
        flightId: "  PS204-1  ",
        status: "NonExistentStatus",
        gate: "  C1 ",
        note: "  Weather delay  ",
      };

      const sanitized = sanitizeFlightOverride(raw);
      assert.ok(sanitized);
      assert.equal(sanitized?.flightId, "PS204-1");
      assert.equal(sanitized?.status, undefined); // rejected invalid status
      assert.equal(sanitized?.gate, "C1");
      assert.equal(sanitized?.note, "Weather delay");
    });

    it("detects synthetic / test flight IDs (CAP-PROOF) accurately", () => {
      assert.equal(isSyntheticFlightId("CAP-PROOF-PS204-out"), true);
      assert.equal(isSyntheticFlightId("cap-proof-123"), true);
      assert.equal(isSyntheticFlightId("PS204-2026-10-15-out"), false);
      assert.equal(isSyntheticFlightId(""), false);
    });
  });

  describe("Storage, Resilience & Idempotent Legacy Migrations", () => {
    it("falls back gracefully to seed bookings on clean/empty storage", () => {
      const loaded = loadRepositoriesFromStorage(mockStorage);
      assert.equal(loaded.schemaVersion, 1);
      assert.ok(loaded.bookings.length >= INITIAL_BOOKING_SEEDS.length);
      assert.equal(loaded.bookings.some((b) => b.ref === "GZA4TQ"), true);
      assert.deepEqual(loaded.flightOverrides, {});
    });

    it("survives corrupt JSON in storage without throwing, falling back to defaults", () => {
      mockStorage.setItem(REPO_STORAGE_KEY, "{ invalid json corrupt content !!!");
      const loaded = loadRepositoriesFromStorage(mockStorage);
      assert.equal(loaded.schemaVersion, 1);
      assert.ok(loaded.bookings.length >= INITIAL_BOOKING_SEEDS.length);
      assert.deepEqual(loaded.flightOverrides, {});
    });

    it("performs idempotent legacy migration from gza.store.v1 without destroying legacy store", () => {
      const legacyBooking = {
        ref: "GZALEGACY1",
        account: false,
        passengers: [{ name: "Legacy User", type: "adult" }],
        outbound: createMockFlight(),
        contact: { email: "legacy@example.com", phone: "+970599000000" },
        fareFamily: "essential",
        cabin: "economy",
        total: 180,
        currency: "USD",
        status: "confirmed",
        bookedAt: "2026-09-20T10:00:00Z",
      };

      const legacyStoreState = {
        bookings: [legacyBooking],
        draft: { step: "results" },
      };

      const legacyAdminState = {
        overrides: {
          "PS204-2026-10-15-out": {
            flightId: "PS204-2026-10-15-out",
            status: "Boarding",
            gate: "B1",
          },
        },
      };

      mockStorage.setItem("gza.store.v1", JSON.stringify(legacyStoreState));
      mockStorage.setItem("gza.admin.v1", JSON.stringify(legacyAdminState));

      // Clear repo storage so loadRepositoriesFromStorage triggers migration
      mockStorage.removeItem(REPO_STORAGE_KEY);
      const migrated1 = loadRepositoriesFromStorage(mockStorage);

      assert.ok(migrated1.bookings.some((b) => b.ref === "GZALEGACY1"));
      assert.equal(migrated1.flightOverrides["PS204-2026-10-15-out"]?.status, "Boarding");

      // Verify legacy stores were NOT wiped or corrupted
      assert.ok(mockStorage.getItem("gza.store.v1")?.includes("GZALEGACY1"));
      assert.ok(mockStorage.getItem("gza.admin.v1")?.includes("Boarding"));

      // Run migration 2nd time directly via migrateFromLegacyStores (idempotency check)
      const migrated2 = migrateFromLegacyStores(
        JSON.stringify(legacyStoreState),
        JSON.stringify(legacyAdminState),
      );
      assert.equal(migrated2.bookings.length, migrated1.bookings.length);
      assert.deepEqual(migrated2.flightOverrides, migrated1.flightOverrides);
    });
  });

  describe("LocalBookingRepository Operations & Fixture Protection", () => {
    it("creates, reads, updates and deletes bookings via repository contract", async () => {
      const repo = createTestBookingRepo();

      // Read initial seed
      const seed = await repo.getByRef("GZA4TQ");
      assert.ok(seed);
      assert.equal(seed?.ref, "GZA4TQ");

      // Create new booking
      const newBooking = await repo.create(canonicalCreateFixture({
        ref: "GZANEW01",
        contact: { email: "new@example.com", phone: "+970599123456" },
        fareFamily: "essential",
        cabin: "economy",
        passengers: [
          { name: "Sami Al-Husseini", type: "adult", nationality: "PS" },
        ],
        outbound: createMockFlight(),
        total: 180,
      }));

      assert.equal(newBooking.ref, "GZANEW01");
      assert.equal(newBooking.passengers[0]!.id, "pax-GZANEW01-0");

      // Get by ref
      const fetched = await repo.getByRef("GZANEW01");
      assert.equal(fetched?.contact.email, "new@example.com");

      // Check-in passenger while confirmed
      const checked = await repo.checkIn("GZANEW01", "out", [0]);
      assert.ok(checked);
      assert.equal(isPaxCheckedIn(checked, "out", 0), true);

      // Update booking to cancelled
      const updated = await repo.cancel("GZANEW01");
      assert.equal(updated.status, "cancelled");

      // Verify check-in is rejected when booking is cancelled
      const cannotCheckInCancelled = await repo.checkIn("GZANEW01", "out", [0]);
      assert.equal(cannotCheckInCancelled, null);

      // Claim booking with mismatching contact email
      const mismatch = await repo.claim("GZANEW01", "other@example.com");
      assert.equal(mismatch.status, "contact-mismatch");

      // Claim booking with matching contact email
      const claimed = await repo.claim("GZANEW01", "new@example.com");
      assert.equal(claimed.status, "claimed");
      if (claimed.status === "claimed") {
        assert.equal(claimed.booking.ownerEmail, "new@example.com");
        assert.equal(claimed.booking.contact.email, "new@example.com");
      }


      // Delete booking
      const deleted = await repo.delete("GZANEW01");
      assert.equal(deleted, true);

      const afterDelete = await repo.getByRef("GZANEW01");
      assert.equal(afterDelete, null);
    });

    it("strictly isolates synthetic capacity proof flights from booking creation", async () => {
      const repo = createTestBookingRepo();

      const testProofFlight = createMockFlight({
        id: "CAP-PROOF-PS204-out",
        number: "PS 204",
      });

      await assert.rejects(
        async () => {
          await repo.create(canonicalCreateFixture({
            ref: "GZAPROOF",
            contact: { email: "proof@example.com", phone: "+970599000000" },
            fareFamily: "essential",
            cabin: "economy",
            passengers: [{ name: "Test Pax", type: "adult" }],
            outbound: testProofFlight,
            total: 180,
          }));
        },
        /synthetic.*test.*fixture.*flight.*cannot be booked/i
      );
    });

    it("notifies active subscribers on repository change", async () => {
      const repo = createTestBookingRepo();
      let callCount = 0;

      const unsubscribe = repo.subscribe(() => {
        callCount++;
      });

      await repo.create(canonicalCreateFixture({
        ref: "GZANOTIFY",
        contact: { email: "notify@example.com", phone: "+970599000000" },
        fareFamily: "essential",
        cabin: "economy",
        passengers: [{ name: "Test Pax", type: "adult" }],
        outbound: createMockFlight(),
        total: 180,
      }));

      assert.ok(callCount >= 1);
      const all = await repo.list();
      assert.ok(all.some((b) => b.ref === "GZANOTIFY"));

      unsubscribe();
    });
  });

  describe("LocalFlightRepository Operations & Effective Flight Merging", () => {
    it("manages operational flight overrides and returns effective flight", async () => {
      const repo = createTestFlightRepo();
      const flightId = "PS100-2026-10-15-out";

      // Set override
      const override: FlightOverride = {
        flightId,
        status: "Delayed",
        gate: "B7",
        revisedDepart: "16:00",
        note: "Technical maintenance",
        updatedAt: "2026-09-26T15:00:00Z",
      };

      await repo.setOverride(flightId, override);

      const storedOverride = await repo.getOverride(flightId);
      assert.equal(storedOverride?.status, "Delayed");
      assert.equal(storedOverride?.gate, "B7");

      // Verify effective flight
      const effectiveFlight = await repo.getFlightById(flightId);
      assert.ok(effectiveFlight);
      assert.equal(effectiveFlight?.status, "Delayed");
      assert.equal(effectiveFlight?.gate, "B7");

      // Clear override
      await repo.clearOverride(flightId);
      const afterClear = await repo.getOverride(flightId);
      assert.equal(afterClear, null);

      const restoredFlight = await repo.getFlightById(flightId);
      assert.equal(restoredFlight?.status, "Scheduled");
    });
  });

  describe("Central Query Key Factory Stability", () => {
    it("generates consistent query keys for booking queries", () => {
      assert.deepEqual(bookingKeys.all, ["bookings"]);
      assert.deepEqual(bookingKeys.lists(), ["bookings", "list"]);
      assert.deepEqual(bookingKeys.list(), ["bookings", "list", undefined]);
      assert.deepEqual(bookingKeys.details(), ["bookings", "detail"]);
      assert.deepEqual(bookingKeys.detail("GZA4TQ"), ["bookings", "detail", "GZA4TQ"]);
    });

    it("generates consistent query keys for flight queries", () => {
      assert.deepEqual(flightKeys.all, ["flights"]);
      assert.deepEqual(flightKeys.lists(), ["flights", "list"]);
      assert.deepEqual(flightKeys.list("2026-10-15", "dep"), ["flights", "list", { date: "2026-10-15", direction: "dep" }]);
      assert.deepEqual(flightKeys.details(), ["flights", "detail"]);
      assert.deepEqual(flightKeys.detail("PS204-1"), ["flights", "detail", "PS204-1"]);
      assert.deepEqual(flightKeys.overrides(), ["flights", "overrides"]);
      assert.deepEqual(flightKeys.searches(), ["flights", "search"]);
      assert.deepEqual(flightKeys.search("GZA", "AMM", "2026-10-15"), [
        "flights",
        "search",
        { origin: "GZA", destination: "AMM", date: "2026-10-15" },
      ]);
      assert.deepEqual(flightKeys.search("gza", "amm", "2026-10-15"), [
        "flights",
        "search",
        { origin: "GZA", destination: "AMM", date: "2026-10-15" },
      ]);
      assert.deepEqual(flightKeys.monthlyServices(), ["flights", "monthlyService"]);
      assert.deepEqual(
        flightKeys.monthlyService("GZA", "AMM", 2026, 10, 2, "2026-10-01T12:00:00Z"),
        [
          "flights",
          "monthlyService",
          { origin: "GZA", destination: "AMM", year: 2026, month: 10, paxCount: 2, now: "2026-10-01T12:00:00Z" },
        ],
      );
      // Distinct explicit clock inputs produce distinct query keys to prevent stale cache reuse
      assert.notDeepEqual(
        flightKeys.monthlyService("GZA", "AMM", 2026, 10, 1, "2026-10-01T00:00:00Z"),
        flightKeys.monthlyService("GZA", "AMM", 2026, 10, 1, "2026-10-15T00:00:00Z"),
      );
    });
  });

  describe("Shared State Coordinator & Mutual Overwrite Prevention", () => {
    it("preserves flight overrides when booking is updated (Order 1)", async () => {
      const repos = createTestRepos();
      const flightId = "PS100-2026-10-15-out";

      // 1. Set flight override with gate B2
      await repos.flight.setOverride(flightId, {
        flightId,
        gate: "B2",
        status: "Boarding",
      });

      const overrideBefore = await repos.flight.getOverride(flightId);
      assert.equal(overrideBefore?.gate, "B2");

      // 2. Update seed booking GZA4TQ
      const updatedBooking = await repos.booking.updateContact("GZA4TQ", { email: "updated-email@example.com", phone: "+970599112233" });
      assert.ok(updatedBooking);
      assert.equal(updatedBooking?.contact.email, "updated-email@example.com");

      // 3. Verify flight override gate B2 was NOT erased
      const overrideAfter = await repos.flight.getOverride(flightId);
      assert.equal(overrideAfter?.gate, "B2");
      assert.equal(overrideAfter?.status, "Boarding");

      // 4. Verify in backing storage
      const rawStorage = mockStorage.getItem(REPO_STORAGE_KEY);
      assert.ok(rawStorage);
      const parsed = JSON.parse(rawStorage!);
      assert.equal(parsed.flightOverrides[flightId]?.gate, "B2");
      assert.ok(parsed.bookings.some((b: Booking) => b.ref === "GZA4TQ" && b.contact.email === "updated-email@example.com"));

      // 5. Verify fresh repository load retains both
      const freshRepos = createTestRepos();
      const freshOverride = await freshRepos.flight.getOverride(flightId);
      const freshBooking = await freshRepos.booking.getByRef("GZA4TQ");
      assert.equal(freshOverride?.gate, "B2");
      assert.equal(freshBooking?.contact.email, "updated-email@example.com");
    });

    it("preserves booking updates when flight override is set (Order 2)", async () => {
      const repos = createTestRepos();
      const flightId = "PS100-2026-10-15-out";

      // 1. Update seed booking GZA4TQ
      const updatedBooking = await repos.booking.cancel("GZA4TQ");
      assert.ok(updatedBooking);
      assert.equal(updatedBooking?.status, "cancelled");

      // 2. Set flight override with gate B4
      await repos.flight.setOverride(flightId, {
        flightId,
        gate: "B4",
        status: "Delayed",
      });

      // 3. Verify booking status "cancelled" was NOT erased
      const bookingAfter = await repos.booking.getByRef("GZA4TQ");
      assert.equal(bookingAfter?.status, "cancelled");

      // 4. Verify flight override is also present
      const overrideAfter = await repos.flight.getOverride(flightId);
      assert.equal(overrideAfter?.gate, "B4");

      // 5. Verify backing storage contains both
      const rawStorage = mockStorage.getItem(REPO_STORAGE_KEY);
      assert.ok(rawStorage);
      const parsed = JSON.parse(rawStorage!);
      assert.equal(parsed.flightOverrides[flightId]?.gate, "B4");
      assert.ok(parsed.bookings.some((b: Booking) => b.ref === "GZA4TQ" && b.status === "cancelled"));

      // 6. Verify fresh repository load retains both
      const freshRepos = createTestRepos();
      const freshBooking = await freshRepos.booking.getByRef("GZA4TQ");
      const freshOverride = await freshRepos.flight.getOverride(flightId);
      assert.equal(freshBooking?.status, "cancelled");
      assert.equal(freshOverride?.gate, "B4");
    });

    it("notifies subscribers of both aggregates when coordinator mutates", async () => {
      const repos = createTestRepos();
      let bookingNotified = 0;
      let flightNotified = 0;

      repos.booking.subscribe(() => {
        bookingNotified++;
      });
      repos.flight.subscribe(() => {
        flightNotified++;
      });

      // Mutate flight
      await repos.flight.setOverride("PS100-2026-10-15-out", { gate: "C3" });
      assert.ok(flightNotified >= 1);

      // Mutate booking
      await repos.booking.updateContact("GZA4TQ", { email: "notification@example.ps", phone: "" });
      assert.ok(bookingNotified >= 1);
    });
  });

  describe("Appearance Studio Isolation Boundary", () => {
    it("operates strictly in-memory without reading or writing to persistent storage", async () => {
      // 1. Establish sentinel in localStorage
      const sentinel = {
        schemaVersion: 1,
        bookings: [{
          ref: "SENTINEL-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "confirmed",
          total: 100,
          outbound: createMockFlight(),
          inbound: null,
          fareId: "classic",
          passengers: [{ id: "pax-SENTINEL-1-0", type: "adult", firstName: "Sentinel", lastName: "User" }],
          seats: {},
          extras: { pax: [] },
          contact: { email: "sentinel@test.com", phone: "+12345" },
          checkedIn: { out: [], in: [] },
          ownerEmail: null,
        }],
        flightOverrides: {
          "PS-SENTINEL": {
            flightId: "PS-SENTINEL",
            gate: "SENTINEL-GATE",
            status: "Scheduled",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };
      mockStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(sentinel));

      // 2. Instantiate isolated Studio repositories
      const studioRepos = createRepositories({ inMemoryOnly: true });

      // In-memory isolated repo should initialize from clean seeds, NOT persistent sentinel
      const studioBookings = await studioRepos.booking.list();
      assert.ok(!studioBookings.some((b) => b.ref === "SENTINEL-1"));
      const studioOverride = await studioRepos.flight.getOverride("PS-SENTINEL");
      assert.equal(studioOverride, null);

      // 3. Mutate within Studio (create booking and set override)
      const createdInStudio = await studioRepos.booking.create(canonicalCreateFixture({
        ref: "GZASTUDIO1",
        contact: { email: "studio@example.com", phone: "+970599000000" },
        fareId: "classic",
        passengers: [{ name: "Studio Passenger", type: "adult" }],
        seats: {},
        extras: { pax: [] },
        outbound: createMockFlight(),
        total: 180,
      }));

      assert.equal(createdInStudio.ref, "GZASTUDIO1");
      await studioRepos.flight.setOverride("PS100-2026-10-15-out", {
        flightId: "PS100-2026-10-15-out",
        gate: "STUDIO-GATE",
        status: "Boarding",
      });

      // 4. Verify in-memory isolated repository holds the changes
      const foundInStudio = await studioRepos.booking.getByRef("GZASTUDIO1");
      assert.ok(foundInStudio);
      const studioFlight = await studioRepos.flight.getOverride("PS100-2026-10-15-out");
      assert.equal(studioFlight?.gate, "STUDIO-GATE");

      // 5. CRITICAL: Verify persistent storage was NEVER modified
      const currentStorageRaw = mockStorage.getItem(REPO_STORAGE_KEY);
      assert.equal(currentStorageRaw, JSON.stringify(sentinel));
      assert.equal(mockStorage.getItem("gza.store.v1"), null);
      assert.equal(mockStorage.getItem("gza.admin.v1"), null);

      // 6. Verify normal browser repository sees only the persistent sentinel
      const normalRepos = createTestRepos();
      const normalBookings = await normalRepos.booking.list();
      assert.ok(normalBookings.some((b) => b.ref === "SENTINEL-1"));
      assert.ok(!normalBookings.some((b) => b.ref === "GZASTUDIO1"));
    });
  });

  describe("Deterministic Migration & Malformed Record Identity", () => {
    it("rejects records missing ref without inventing new PNRs", () => {
      // Completely missing ref
      const noRef = {
        outbound: createMockFlight(),
        contact: { email: "test@example.com" },
      };
      assert.equal(normalizeBooking(noRef), null);

      // Empty whitespace ref
      const emptyRef = {
        ref: "   ",
        outbound: createMockFlight(),
      };
      assert.equal(normalizeBooking(emptyRef), null);

      // Non-string ref
      const nonStringRef = {
        ref: 12345,
        outbound: createMockFlight(),
      };
      assert.equal(normalizeBooking(nonStringRef), null);
    });

    it("deterministically derives missing createdAt and yields identical output on repeat loads", () => {
      const malformedInput = {
        ref: "GZAMALF01",
        outbound: createMockFlight({ date: "2026-11-20" }),
        // createdAt intentionally omitted
      };

      const norm1 = normalizeBooking(malformedInput);
      const norm2 = normalizeBooking(malformedInput);

      assert.ok(norm1);
      assert.ok(norm2);
      assert.equal(norm1?.ref, "GZAMALF01");
      assert.equal(norm2?.ref, "GZAMALF01");
      assert.equal(norm1?.createdAt, "2026-11-20T00:00:00.000Z");
      assert.equal(norm2?.createdAt, "2026-11-20T00:00:00.000Z");
      assert.deepEqual(norm1, norm2);
    });

    it("loads the same malformed legacy storage twice with 100% idempotent output", () => {
      const legacyRaw = JSON.stringify({
        bookings: [
          { ref: "LEGACY-STABLE-1", outbound: createMockFlight({ date: "2026-10-15" }) },
          { outbound: createMockFlight() }, // Malformed: missing ref, must be discarded
          { ref: "   ", outbound: createMockFlight() }, // Malformed: empty ref, must be discarded
          { ref: "LEGACY-STABLE-2", outbound: createMockFlight({ date: "2026-12-01" }) },
        ],
      });

      const res1 = migrateFromLegacyStores(legacyRaw, null);
      const res2 = migrateFromLegacyStores(legacyRaw, null);

      assert.equal(res1.bookings.length, res2.bookings.length);
      assert.deepEqual(
        res1.bookings.map((b) => b.ref),
        res2.bookings.map((b) => b.ref),
      );
      assert.ok(res1.bookings.some((b) => b.ref === "LEGACY-STABLE-1"));
      assert.ok(res1.bookings.some((b) => b.ref === "LEGACY-STABLE-2"));
      // Verify no invented PNRs
      assert.equal(
        res1.bookings.filter((b) => b.ref.startsWith("LEGACY-STABLE-")).length,
        2,
      );
    });
  });

  describe("Authoritative Booking Creation & Availability Guards", () => {
    it("resolves forced PNR collision by generating a fresh unique PNR", async () => {
      const repo = createTestBookingRepo();
      // Candidate PNR GZA4TQ is already an initial seed
      const candidatePnr = "GZA4TQ";

      const created = await repo.create(canonicalCreateFixture({
        ref: candidatePnr,
        criteria: {
          tripType: "oneway",
          origin: "GZA",
          destination: "AMM",
          departDate: "2026-10-15",
          cabin: "economy",
          adults: 1,
          children: 0,
          infants: 0,
        },
        fareId: "classic",
        outbound: createMockFlight({ date: "2026-10-15" }),
        passengers: [{ name: "New Traveller", type: "adult" }],
        seats: {},
        extras: { pax: [] },
        contact: { email: "collision@example.com", phone: "+970599000000" },
        total: 180,
      }));

      // The repository MUST NOT overwrite GZA4TQ; it must generate a new unique PNR
      assert.notEqual(created.ref, candidatePnr);
      assert.match(created.ref, /^[A-Z]{3}[0-9]{3}$/);

      // Verify original seed booking GZA4TQ is still intact
      const originalSeed = await repo.getByRef(candidatePnr);
      assert.ok(originalSeed);
      assert.notEqual(originalSeed?.contact.email, "collision@example.com");

      // Verify the new booking is stored under its assigned PNR
      const storedNew = await repo.getByRef(created.ref);
      assert.ok(storedNew);
      assert.equal(storedNew?.contact.email, "collision@example.com");
    });

    it("rejects booking creation when outbound or inbound flight is unbookable", async () => {
      const storage = new MemoryStorage();
      const repos = createRepositories({ storage });
      await repos.flight.setOverride("PS100-2026-10-15-out", { status: "Cancelled" });
      const repo = repos.booking;

      await assert.rejects(
        async () => {
          await repo.create(canonicalCreateFixture({
            criteria: {
              tripType: "oneway",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              cabin: "economy",
              adults: 1,
              children: 0,
              infants: 0,
            },
            fareId: "classic",
            outbound: createMockFlight(),
            passengers: [{ name: "Traveller", type: "adult" }],
            seats: {},
            extras: { pax: [] },
            contact: { email: "unbookable@example.com", phone: "+970599000000" },
            total: 180,
          }));
        },
        (err: unknown) => {
          assert.ok(err instanceof BookingCreationError);
          assert.equal(err.reason, "cancelled");
          assert.equal(err.leg, "out");
          return true;
        },
      );
    });

    it("rejects booking creation when outbound or inbound flight is unknown in canonical schedule", async () => {
      const repo = createTestBookingRepo();
      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      // Plausible unknown outbound
      await assert.rejects(
        async () => {
          await repo.create(canonicalCreateFixture({
            criteria: {
              tripType: "oneway",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              cabin: "economy",
              adults: 1,
              children: 0,
              infants: 0,
            },
            fareId: "classic",
            outbound: {
              ...createMockFlight(),
              id: "PS999-2026-10-15-out",
              number: "PS999",
            },
            passengers: [{ name: "Traveller", type: "adult" }],
            seats: {},
            extras: { pax: [] },
            contact: { email: "unknown@example.com", phone: "+970599000000" },
            total: 180,
          }));
        },
        (err: unknown) => {
          assert.ok(err instanceof BookingCreationError);
          assert.equal(err.reason, "flight_missing");
          assert.equal(err.leg, "out");
          return true;
        },
      );

      // Plausible unknown inbound on round trip
      await assert.rejects(
        async () => {
          await repo.create(canonicalCreateFixture({
            criteria: {
              tripType: "round",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              returnDate: "2026-10-20",
              cabin: "economy",
              adults: 1,
              children: 0,
              infants: 0,
            },
            fareId: "classic",
            outbound: createMockFlight(),
            inbound: {
              ...createMockFlight(),
              id: "PS998-2026-10-20-in",
              number: "PS998",
              originCode: "AMM",
              destinationCode: "GZA",
              date: "2026-10-20",
            },
            passengers: [{ name: "Traveller", type: "adult" }],
            seats: {},
            extras: { pax: [] },
            contact: { email: "unknown-inbound@example.com", phone: "+970599000000" },
            total: 360,
          }));
        },
        (err: unknown) => {
          assert.ok(err instanceof BookingCreationError);
          assert.equal(err.reason, "flight_missing");
          assert.equal(err.leg, "in");
          return true;
        },
      );

      // Verify ZERO bookings were persisted
      const all = await repo.list();
      assert.ok(!all.some((b) => b.contact.email.includes("unknown")));
      assert.equal(notifications, 0, "No notifications dispatched on rejected booking creation");
    });
  });
  describe("Transactional Mutation & Storage Failure Resilience (Correction 2)", () => {
    it("flight override write failure: rejects with StorageCommitError, does not notify subscribers, leaves in-memory state unchanged, and recovers on retry", async () => {
      const failingStorage = new FailingStorage();
      const repos = createRepositories({ storage: failingStorage });
      const flightId = "PS100-2026-10-15-out";

      // Verify baseline flight state
      const initialFlight = await repos.flight.getFlightById(flightId);
      assert.ok(initialFlight);
      assert.equal(initialFlight?.status, "Scheduled");
      assert.equal(initialFlight?.gate, "A6");

      // Subscribe to flight changes
      let subscriberNotified = 0;
      const unsubscribe = repos.flight.subscribe(() => {
        subscriberNotified++;
      });

      // 1. Arm storage to fail on write
      failingStorage.shouldFail = true;

      // 2. Mutation attempt must reject with StorageCommitError
      await assert.rejects(
        async () => {
          await repos.flight.setOverride(flightId, {
            flightId,
            gate: "B2",
            status: "Boarding",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          assert.ok((err as Error).message.includes("Failed to persist"));
          return true;
        }
      );

      // 3. INVARIANTS ON FAILED COMMIT:
      // a. Subscribers must NOT have been notified
      assert.equal(subscriberNotified, 0, "Subscriber must NOT be notified on storage failure");

      // b. In-memory override state must NOT have adopted candidate override
      const overrideAfterFailure = await repos.flight.getOverride(flightId);
      assert.equal(overrideAfterFailure, null, "In-memory override must be null after failed write");

      // c. In-memory effective flight must retain base values
      const flightAfterFailure = await repos.flight.getFlightById(flightId);
      assert.equal(flightAfterFailure?.status, "Scheduled", "Effective status must remain Scheduled");
      assert.equal(flightAfterFailure?.gate, "A6", "Effective gate must remain A6");

      // d. Persistent storage must NOT contain the override
      const rawStorage = failingStorage.getItem(REPO_STORAGE_KEY);
      if (rawStorage) {
        const parsed = JSON.parse(rawStorage);
        assert.equal(parsed.flightOverrides?.[flightId], undefined);
      }

      // 4. RETRY & RECOVERY AFTER STORAGE UNBLOCKS:
      failingStorage.shouldFail = false; // storage recovers

      await repos.flight.setOverride(flightId, {
        flightId,
        gate: "B2",
        status: "Boarding",
      });

      // After recovery: subscriber notified, in-memory updated, storage persisted
      assert.equal(subscriberNotified, 1, "Subscriber must be notified on successful retry");
      const recoveredOverride = await repos.flight.getOverride(flightId);
      assert.equal(recoveredOverride?.gate, "B2");
      assert.equal(recoveredOverride?.status, "Boarding");

      const recoveredFlight = await repos.flight.getFlightById(flightId);
      assert.equal(recoveredFlight?.gate, "B2");
      assert.equal(recoveredFlight?.status, "Boarding");

      unsubscribe();
    });

    it("booking create write failure: rejects with StorageCommitError, does not notify subscribers, does not commit booking, and recovers on retry", async () => {
      const failingStorage = new FailingStorage();
      const repos = createRepositories({ storage: failingStorage });

      let bookingNotified = 0;
      const unsubscribe = repos.booking.subscribe(() => {
        bookingNotified++;
      });

      failingStorage.shouldFail = true;

      const input = {
        ref: "GZAFAIL1",
        contact: { email: "fail@test.com", phone: "+970599000000" },
        fareFamily: "essential" as const,
        cabin: "economy" as const,
        passengers: [{ name: "Failure Passenger", type: "adult" as const }],
        outbound: createMockFlight(),
        total: 180,
      };

      await assert.rejects(
        async () => {
          await repos.booking.create(canonicalCreateFixture(input));
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        }
      );

      // Invariants: no subscriber notification, not in memory, not in storage
      assert.equal(bookingNotified, 0, "Booking subscriber must NOT be notified on failed write");
      const found = await repos.booking.getByRef("GZAFAIL1");
      assert.equal(found, null, "Booking must NOT exist in memory after failed write");
      const list = await repos.booking.list();
      assert.ok(!list.some((b) => b.ref === "GZAFAIL1"));

      // Recovery on retry
      failingStorage.shouldFail = false;
      const created = await repos.booking.create(canonicalCreateFixture(input));
      assert.equal(created.ref, "GZAFAIL1");
      assert.equal(bookingNotified, 1, "Booking subscriber must be notified on successful retry");

      const fetched = await repos.booking.getByRef("GZAFAIL1");
      assert.ok(fetched);
      assert.equal(fetched?.ref, "GZAFAIL1");

      unsubscribe();
    });

    it("booking update write failure: rejects with StorageCommitError, preserves prior state in memory, and recovers on retry", async () => {
      const failingStorage = new FailingStorage();
      const repos = createRepositories({ storage: failingStorage });

      // GZA4TQ is an initial seed booking
      const original = await repos.booking.getByRef("GZA4TQ");
      assert.ok(original);
      assert.equal(original?.status, "confirmed");

      let bookingNotified = 0;
      const unsubscribe = repos.booking.subscribe(() => {
        bookingNotified++;
      });

      failingStorage.shouldFail = true;

      await assert.rejects(
        async () => {
          await repos.booking.cancel("GZA4TQ");
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        }
      );

      // Invariants: no notification, in-memory status remains "confirmed"
      assert.equal(bookingNotified, 0);
      const afterFail = await repos.booking.getByRef("GZA4TQ");
      assert.equal(afterFail?.status, "confirmed", "Booking status must remain confirmed after failed update");

      // Recovery on retry
      failingStorage.shouldFail = false;
      const updated = await repos.booking.cancel("GZA4TQ");
      assert.equal(updated?.status, "cancelled");
      assert.equal(bookingNotified, 1);

      unsubscribe();
    });

    it("legacy override sentinel protection: canonical flight operations do not modify gza.admin.v1, and staff changes preserve legacy overrides", async () => {
      const legacySentinel = {
        staffId: "st-ops-01",
        overrides: {
          "LEGACY-PRE-MIGRATION-FLIGHT": {
            gate: "SENTINEL-LEGACY-GATE",
            status: "Delayed",
            note: "DO_NOT_ERASE",
          },
        },
        customLegacyConfig: "PRESERVE_ROLLBACK_BYTES",
      };

      mockStorage.setItem("gza.admin.v1", JSON.stringify(legacySentinel));

      // 1. Boot repository with mockStorage
      const repos = createRepositories({ storage: mockStorage });

      // 2. Perform canonical flight override mutation
      await repos.flight.setOverride("PS100-2026-10-15-out", {
        flightId: "PS100-2026-10-15-out",
        gate: "NEW-CANONICAL-GATE",
        status: "Boarding",
      });

      // 3. INVARIANT: gza.admin.v1 MUST REMAIN 100% UNTOUCHED
      const adminRawAfterMutation = mockStorage.getItem("gza.admin.v1");
      assert.equal(
        adminRawAfterMutation,
        JSON.stringify(legacySentinel),
        "Canonical flight override must NOT modify or mirror into gza.admin.v1"
      );

      // 4. Verify canonical override is safely persisted in gza.repo.v1
      const repoRaw = mockStorage.getItem(REPO_STORAGE_KEY);
      assert.ok(repoRaw);
      const parsedRepo = JSON.parse(repoRaw!);
      assert.equal(parsedRepo.flightOverrides["PS100-2026-10-15-out"]?.gate, "NEW-CANONICAL-GATE");

      // 5. Verify staff-session update preserves legacy overrides and custom legacy fields
      const parsedAdmin = JSON.parse(adminRawAfterMutation!);
      const updatedAdminSession = {
        ...parsedAdmin,
        staffId: "st-commercial-01",
      };
      mockStorage.setItem("gza.admin.v1", JSON.stringify(updatedAdminSession));

      const finalAdmin = JSON.parse(mockStorage.getItem("gza.admin.v1")!);
      assert.equal(finalAdmin.staffId, "st-commercial-01");
      assert.deepEqual(finalAdmin.overrides, legacySentinel.overrides);
      assert.equal(finalAdmin.customLegacyConfig, "PRESERVE_ROLLBACK_BYTES");
    });
  });

  describe("Storage Getter Guard & Absent-Storage Mutation Rejection (Correction 3)", () => {
    it("getStorage returns null when window.localStorage getter throws SecurityError", () => {
      // Save and override window.localStorage to throw SecurityError
      const origDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      Object.defineProperty(globalThis, "localStorage", {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
        configurable: true,
      });
      try {
        const result = getStorage();
        assert.equal(result, null, "getStorage must return null when getter throws");
      } finally {
        // Restore original descriptor
        if (origDesc) {
          Object.defineProperty(globalThis, "localStorage", origDesc);
        } else {
          delete (globalThis as Record<string, unknown>).localStorage;
        }
      }
    });

    it("getStorage returns the provided custom storage even when window.localStorage would throw", () => {
      const custom = new MemoryStorage();
      const origDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      Object.defineProperty(globalThis, "localStorage", {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
        configurable: true,
      });
      try {
        const result = getStorage(custom);
        assert.equal(result, custom, "getStorage must return custom storage when provided");
      } finally {
        if (origDesc) {
          Object.defineProperty(globalThis, "localStorage", origDesc);
        } else {
          delete (globalThis as Record<string, unknown>).localStorage;
        }
      }
    });

    it("saveRepoStorage throws StorageCommitError when persistent storage is unavailable (not Studio)", () => {
      const data = {
        schemaVersion: 1 as const,
        bookings: [],
        flightOverrides: {},
      };
      // Pass null as custom storage to simulate unavailable storage
      assert.throws(
        () => saveRepoStorage(data, null),
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          assert.ok((err as Error).message.includes("unavailable"));
          return true;
        },
      );
    });

    it("persistent coordinator mutation rejects with StorageCommitError when storage is absent, memory unchanged", () => {
      // Create coordinator in persistent mode but with null storage
      const coordinator = new RepoStorageCoordinator({ storage: null });

      // Capture initial state snapshot
      const initialBookings = coordinator.getState().bookings.map((b) => b.ref);

      // Attempt mutation — should throw because saveRepoStorage rejects null storage
      assert.throws(
        () => {
          coordinator.mutate((state) => {
            state.bookings.push({
              ref: "GZANOPERSIST",
              account: false,
              contact: { email: "test@test.com", phone: "+1234" },
              fareFamily: "essential",
              cabin: "economy",
              total: 100,
              currency: "USD",
              status: "confirmed",
              bookedAt: "2026-01-01T00:00:00Z",
              createdAt: "2026-01-01T00:00:00Z",
              outbound: createMockFlight(),
              inbound: null,
              checkedIn: { out: [], in: [] },
              seats: {},
              passengers: [{ id: "pax-0", firstName: "Test", lastName: "User", type: "adult" }],
              extras: { pax: [] },
              ownerEmail: null,
            } as unknown as import("../../src/lib/domain/booking.ts").Booking);
            return null;
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError, "Must throw StorageCommitError");
          return true;
        },
      );

      // Memory must be unchanged — GZANOPERSIST must NOT be in state
      const afterBookings = coordinator.getState().bookings.map((b) => b.ref);
      assert.deepEqual(afterBookings, initialBookings, "Bookings must remain unchanged after failed mutation");
      assert.ok(!afterBookings.includes("GZANOPERSIST"), "Failed mutation must NOT appear in memory");
    });

    it("in-memory conditional mutation leaves canonical state and subscribers untouched when rejected (commit: false)", () => {
      const coordinator = new RepoStorageCoordinator({
        inMemoryOnly: true,
        initialData: {
          schemaVersion: 1,
          bookings: [
            {
              ref: "GZAINMEM01",
              account: false,
              contact: { email: "original@gza.ps", phone: "+970 8 000 0000" },
              fareFamily: "essential",
              cabin: "economy",
              total: 100,
              currency: "USD",
              status: "confirmed",
              bookedAt: "2026-01-01T00:00:00Z",
              createdAt: "2026-01-01T00:00:00Z",
              outbound: createMockFlight(),
              inbound: null,
              checkedIn: { out: [], in: [] },
              seats: {},
              passengers: [{ id: "pax-0", firstName: "Original", lastName: "User", type: "adult" }],
              extras: { pax: [] },
              ownerEmail: null,
            } as unknown as import("../../src/lib/domain/booking.ts").Booking,
          ],
          flightOverrides: {},
        },
      });

      let notifications = 0;
      coordinator.subscribe(() => {
        notifications++;
      });

      // Mutate a nested booking field, push a new booking, and add a flight override in candidate
      const result = coordinator.conditionalMutate((candidate) => {
        candidate.flightOverrides.PROBE = { status: "cancelled" };
        candidate.bookings[0].contact = { email: "tampered@gza.ps", phone: "+999" };
        candidate.bookings.push({
          ref: "GZAEXTRA",
          account: false,
          contact: { email: "extra@gza.ps", phone: "" },
          fareFamily: "essential",
          cabin: "economy",
          total: 50,
          currency: "USD",
          status: "confirmed",
          bookedAt: "2026-01-01T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          outbound: createMockFlight(),
          inbound: null,
          checkedIn: { out: [], in: [] },
          seats: {},
          passengers: [],
          extras: { pax: [] },
          ownerEmail: null,
        } as unknown as import("../../src/lib/domain/booking.ts").Booking);

        return { commit: false, result: "rejected-probe" };
      });

      assert.equal(result, "rejected-probe", "Should return callback result");
      assert.equal(notifications, 0, "Zero notifications must be emitted on rejected in-memory mutation");

      const current = coordinator.getState();
      assert.deepEqual(current.flightOverrides, {}, "flightOverrides must remain empty");
      assert.equal(current.bookings.length, 1, "bookings length must remain 1");
      assert.equal(current.bookings[0].ref, "GZAINMEM01", "booking ref must remain original");
      assert.equal(current.bookings[0].contact.email, "original@gza.ps", "nested contact email must not be mutated");
    });

    it("in-memory conditional mutation adopts state and notifies subscribers once when committed (commit: true)", () => {
      const coordinator = new RepoStorageCoordinator({
        inMemoryOnly: true,
        initialData: {
          schemaVersion: 1,
          bookings: [],
          flightOverrides: {},
        },
      });

      let notifications = 0;
      coordinator.subscribe(() => {
        notifications++;
      });

      const result = coordinator.conditionalMutate((candidate) => {
        candidate.flightOverrides.COMMITTED = { status: "delayed" };
        return { commit: true, result: "committed-ok" };
      });

      assert.equal(result, "committed-ok", "Should return callback result");
      assert.equal(notifications, 1, "Exactly 1 notification must be emitted on committed in-memory mutation");

      const current = coordinator.getState();
      assert.deepEqual(
        current.flightOverrides.COMMITTED,
        { status: "delayed" },
        "Committed override must be adopted into canonical memory",
      );
    });
  });
});
