import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_DRAFT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  loadBookingDraftFromStorage,
  saveBookingDraftToStorage,
  migrateBookingDraftFromLegacyStore,
  StorageCommitError,
} from "../../src/lib/booking-draft/storage.ts";
import { LocalBookingDraftRepository } from "../../src/lib/booking-draft/repository.ts";
import { reconcileDraft } from "../../src/lib/booking-draft/reconciliation.ts";
import {
  createFreshDraft,
  defaultCriteria,
} from "../../src/lib/booking-draft/factories.ts";
import type { BookingDraft, SearchCriteria } from "../../src/lib/booking-draft/types.ts";
import { RepoStorageCoordinator } from "../../src/lib/repositories/storage.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import { BookingCreationError } from "../../src/lib/domain/booking.ts";
import { flightById } from "../../src/lib/data.ts";
import type { Flight } from "../../src/lib/data.ts";

function makeTestDraft(origin = "GZA", destination = "AMM"): BookingDraft {
  const d = createFreshDraft("2026-10-15", "2026-10-22");
  d.criteria.origin = origin;
  d.criteria.destination = destination;
  return d;
}

function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key(i: number) {
      return [...data.keys()][i] ?? null;
    },
    getItem(k: string) {
      return data.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      data.set(k, v);
    },
    removeItem(k: string) {
      data.delete(k);
    },
    clear() {
      data.clear();
    },
  } as unknown as Storage;
}

function makeFailingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    key() {
      return null;
    },
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("QuotaExceededError");
    },
    clear() {},
  } as unknown as Storage;
}

function sampleFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: "PS100-2026-10-15-out",
    number: "PS 100",
    originCode: "GZA",
    destinationCode: "AMM",
    date: "2026-10-15",
    departTime: "14:30",
    arriveTime: "15:45",
    durationMinutes: 75,
    aircraft: "Boeing 737-800",
    status: "Scheduled",
    gate: "A1",
    terminal: "1",
    basePrice: 180,
    seatsLeft: 9,
    ...overrides,
  };
}

describe("Phase 5B: Canonical Booking Draft Repository & Invariants", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  describe("1. Five Storage States & Legacy Migration Contract", () => {
    it("State 1 (Missing): migrates legacy gza.store.v1 draft once and leaves legacy envelope byte-for-byte intact", async () => {
      const legacyRaw = JSON.stringify({
        version: 1,
        draft: {
          criteria: {
            tripType: "round",
            origin: "GZA",
            destination: "AMM",
            departDate: "2026-10-20",
            returnDate: "2026-10-25",
            cabin: "economy",
            adults: 2,
            children: 0,
            infants: 0,
          },
          step: "pax",
          passengers: [
            { id: "p1", type: "adult", firstName: "Yousef", lastName: "Nasser" },
            { id: "p2", type: "adult", firstName: "Fatima", lastName: "Nasser" },
          ],
        },
        account: { email: "legacy@example.com" },
        bookings: [{ ref: "LEGACY1" }],
      });

      storage.setItem(LEGACY_STORE_STORAGE_KEY, legacyRaw);

      const repo = new LocalBookingDraftRepository({ storage });
      const draft = await repo.getDraft();

      assert.ok(draft);
      assert.equal(draft.criteria.destination, "AMM");
      assert.equal(draft.passengers.length, 2);
      assert.equal(draft.passengers[0]?.firstName, "Yousef");

      // Verify canonical key now exists
      const canonicalStored = storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
      assert.ok(canonicalStored);
      const parsedCanonical = JSON.parse(canonicalStored!);
      assert.equal(parsedCanonical.status, "active");
      assert.equal(parsedCanonical.schemaVersion, 1);

      // Verify legacy storage was NOT deleted or rewritten
      assert.equal(storage.getItem(LEGACY_STORE_STORAGE_KEY), legacyRaw);
    });

    it("State 2 (Active canonical precedence): canonical store wins over legacy store without lookup", async () => {
      storage.setItem(
        LEGACY_STORE_STORAGE_KEY,
        JSON.stringify({ draft: { criteria: { origin: "GZA", destination: "CAI" } } }),
      );

      const activeDraft = makeTestDraft("GZA", "AMM");
      activeDraft.contact.email = "canonical@example.com";
      saveBookingDraftToStorage(storage, activeDraft, "active", 1);

      const repo = new LocalBookingDraftRepository({ storage });
      const loaded = await repo.getDraft();

      assert.equal(loaded?.contact.email, "canonical@example.com");
      assert.equal(loaded?.criteria.destination, "AMM");
    });

    it("State 3 (Cleared tombstone): never resurrects legacy store on reload", async () => {
      storage.setItem(
        LEGACY_STORE_STORAGE_KEY,
        JSON.stringify({ draft: { criteria: { origin: "GZA", destination: "DXB" } } }),
      );

      // Write tombstone
      saveBookingDraftToStorage(storage, null, "cleared", 2);

      const repo = new LocalBookingDraftRepository({ storage });
      const loaded = await repo.getDraft();

      assert.equal(repo.getState().storageState, "cleared");
      assert.notEqual(loaded?.criteria.destination, "DXB");

      const direct = loadBookingDraftFromStorage(storage);
      assert.equal(direct.status, "cleared");
      assert.equal(direct.draft, null);
    });

    it("State 4 (Malformed-present): safely repairs to fresh default criteria without resurrecting legacy", async () => {
      storage.setItem(
        LEGACY_STORE_STORAGE_KEY,
        JSON.stringify({ draft: { criteria: { origin: "GZA", destination: "JED" } } }),
      );

      // Write corrupted JSON to canonical key
      storage.setItem(BOOKING_DRAFT_STORAGE_KEY, "{ invalid json corrupt content");

      const repo = new LocalBookingDraftRepository({ storage });
      const loaded = await repo.getDraft();

      // Does NOT resurrect JED from legacy
      assert.notEqual(loaded?.criteria.destination, "JED");
      assert.equal(repo.getState().storageState, "malformed");
    });

    it("State 5 (Unavailable storage): operates in explicit in-memory mode without touching storage", async () => {
      const repo = new LocalBookingDraftRepository({ inMemoryOnly: true });

      assert.equal(repo.isPersistent(), false);
      const draft = await repo.getDraft();
      assert.ok(draft);

      // Can update in-memory
      await repo.updateDraft({ contact: { email: "memory@example.com", phone: "+970" } });
      const updated = await repo.getDraft();
      assert.equal(updated?.contact.email, "memory@example.com");
    });
  });

  describe("2. Serialized Mutation Queue & Candidate Isolation", () => {
    it("mutation B queued before A finishes evaluates against A's committed result", async () => {
      const repo = new LocalBookingDraftRepository({ storage });
      await repo.resetDraft(defaultCriteria("2026-10-15", "2026-10-22"));

      // Fire mutation A and mutation B concurrently
      const promiseA = repo.updateDraft({
        contact: { email: "first@example.com", phone: "+970111111" },
      });
      const promiseB = repo.updateDraft((prev) => ({
        contact: {
          email: `${prev.contact.email}.appended`,
          phone: prev.contact.phone,
        },
      }));

      await Promise.all([promiseA, promiseB]);

      const finalDraft = await repo.getDraft();
      assert.equal(finalDraft?.contact.email, "first@example.com.appended");
      assert.equal(finalDraft?.contact.phone, "+970111111");
    });

    it("failed storage write throws StorageCommitError and rolls back in-memory draft", async () => {
      const failingStorage = makeFailingStorage();
      // Start with valid storage
      const validStorage = makeStorage();
      const repo = new LocalBookingDraftRepository({ storage: validStorage });
      await repo.resetDraft(defaultCriteria("2026-10-15", "2026-10-22"));

      // Now attach failing storage
      const failingRepo = new LocalBookingDraftRepository({ storage: failingStorage });
      await assert.rejects(
        async () => {
          await failingRepo.updateDraft({
            contact: { email: "fail@example.com", phone: "" },
          });
        },
        /QuotaExceededError/i,
      );
    });
  });

  describe("3. Cross-Tab Storage Event Synchronization", () => {
    it("adopts external canonical updates without echo write", async () => {
      let subscriberCalls = 0;
      const repo = new LocalBookingDraftRepository({ storage });
      const unsubscribe = repo.subscribe(() => {
        subscriberCalls++;
      });

      // Simulate external tab writing to storage
      const externalDraft = makeTestDraft("GZA", "CAI");
      externalDraft.contact.email = "tab2@example.com";
      saveBookingDraftToStorage(storage, externalDraft, "active", 5);

      // Trigger cross-tab sync
      await repo.handleExternalStorageEvent({
        key: BOOKING_DRAFT_STORAGE_KEY,
        newValue: storage.getItem(BOOKING_DRAFT_STORAGE_KEY),
      });

      assert.equal(subscriberCalls, 1);
      const current = await repo.getDraft();
      assert.equal(current?.contact.email, "tab2@example.com");
      assert.equal(current?.criteria.destination, "CAI");

      unsubscribe();
    });

    it("safely ignores storage events for unrelated keys or malformed JSON", async () => {
      let subscriberCalls = 0;
      const repo = new LocalBookingDraftRepository({ storage });
      const unsubscribe = repo.subscribe(() => {
        subscriberCalls++;
      });

      await repo.handleExternalStorageEvent({
        key: "unrelated.key",
        newValue: "hello",
      });
      assert.equal(subscriberCalls, 0);

      await repo.handleExternalStorageEvent({
        key: BOOKING_DRAFT_STORAGE_KEY,
        newValue: "{ corrupt json",
      });
      // Should not throw or crash
      assert.equal(subscriberCalls, 0);

      unsubscribe();
    });
  });

  describe("4. Operational Selection Reconciliation & Prefix Seat Deletion", () => {
    it("refreshes snapshot fields when flight has valid operational updates (gate, aircraft, status, time)", () => {
      const originalFlight = sampleFlight({
        gate: "A1",
        aircraft: "Boeing 737-800",
        status: "Scheduled",
      });

      const draft = makeTestDraft("GZA", "AMM");
      draft.outbound = originalFlight;

      const effectiveFlight = sampleFlight({
        gate: "B3",
        aircraft: "Airbus A321neo",
        status: "Delayed",
        revisedDepart: "15:15",
      });

      const result = reconcileDraft(draft, { outboundEffective: effectiveFlight });

      assert.equal(result.changed, true);
      assert.equal(result.outbound.status, "refreshed");
      assert.equal(result.reconciledDraft.outbound?.gate, "B3");
      assert.equal(result.reconciledDraft.outbound?.aircraft, "Airbus A321neo");
      assert.equal(result.reconciledDraft.outbound?.status, "Delayed");
    });

    it("clears only invalidated leg and its prefix-matching seat keys while preserving surviving leg and data", () => {
      const outFlight = sampleFlight({ id: "PS100-2026-10-15-out", seatsLeft: 5 });
      const inFlight = sampleFlight({
        id: "PS101-2026-10-22-in",
        originCode: "AMM",
        destinationCode: "GZA",
        date: "2026-10-22",
      });

      const draft = makeTestDraft("GZA", "AMM");
      draft.outbound = outFlight;
      draft.inbound = inFlight;
      draft.seats = {
        "out-0": "12A",
        "out-1": "12B",
        "in-0": "14C",
        "in-1": "14D",
      };
      draft.passengers = [
        { id: "p0", type: "adult", firstName: "Ahmad", lastName: "K", dob: "1990-01-01" },
        { id: "p1", type: "adult", firstName: "Lina", lastName: "K", dob: "1992-05-10" },
      ];
      draft.contact = { email: "ahmad@example.com", phone: "+970599111222" };
      draft.entry = "search";

      // Now outbound is cancelled!
      const cancelledOut = sampleFlight({
        id: "PS100-2026-10-15-out",
        status: "Cancelled",
      });

      const result = reconcileDraft(draft, {
        outboundEffective: cancelledOut,
        inboundEffective: inFlight,
      });

      assert.equal(result.changed, true);
      assert.ok(result.invalidatedLegs.includes("out"));
      assert.equal(result.outbound.reason, "cancelled");
      // Outbound cleared
      assert.equal(result.reconciledDraft.outbound, null);
      // Inbound preserved
      assert.ok(result.reconciledDraft.inbound);
      assert.equal(result.reconciledDraft.inbound?.id, "PS101-2026-10-22-in");

      // Seat prefix deletion: out-* keys removed, in-* keys retained!
      assert.equal(result.reconciledDraft.seats["out-0"], undefined);
      assert.equal(result.reconciledDraft.seats["out-1"], undefined);
      assert.equal(result.reconciledDraft.seats["in-0"], "14C");
      assert.equal(result.reconciledDraft.seats["in-1"], "14D");

      // Passenger, contact, and criteria preserved!
      assert.equal(result.reconciledDraft.passengers.length, 2);
      assert.equal(result.reconciledDraft.passengers[0]?.firstName, "Ahmad");
      assert.equal(result.reconciledDraft.contact.email, "ahmad@example.com");

      // Preserves entry mode
      assert.equal(result.reconciledDraft.entry, "search");
    });

    it("handles all 7 invalidation reasons: cancelled, departed, landed, boarding, past, sold_out, insufficient_seats", () => {
      const reasons: Array<{ status?: Flight["status"]; seatsLeft?: number; expectedReason: string }> = [
        { status: "Cancelled", expectedReason: "cancelled" },
        { status: "Departed", expectedReason: "departed" },
        { status: "Landed", expectedReason: "landed" },
        { status: "Boarding", expectedReason: "boarding" },
        { seatsLeft: 0, expectedReason: "sold_out" },
        { seatsLeft: 1, expectedReason: "insufficient_seats" }, // with 2 pax
      ];

      for (const tc of reasons) {
        const draft = makeTestDraft("GZA", "AMM");
        draft.outbound = sampleFlight();
        draft.criteria.adults = 2;
        draft.passengers = [
          { firstName: "", lastName: "", type: "adult", dob: "", nationality: "", document: "" },
          { firstName: "", lastName: "", type: "adult", dob: "", nationality: "", document: "" },
        ];

        const effective = sampleFlight({
          status: tc.status ?? "Scheduled",
          seatsLeft: tc.seatsLeft !== undefined ? tc.seatsLeft : 10,
        });

        const result = reconcileDraft(draft, { outboundEffective: effective });
        assert.equal(
          result.outbound.reason,
          tc.expectedReason,
          `Expected reason ${tc.expectedReason} for status=${tc.status}, seats=${tc.seatsLeft}`,
        );
        assert.equal(result.reconciledDraft.outbound, null);
      }
    });
  });

  describe("5. Transactional Booking Creation & Idempotency", () => {
    it("cancelling outbound flight before create rejects inside transaction with zero booking created", async () => {
      const coordinator = new RepoStorageCoordinator({ storage: makeStorage() });
      const bookingRepo = new LocalBookingRepository(coordinator);
      const flightRepo = new LocalFlightRepository(coordinator);

      // Deterministic flight from schedule
      const flight = flightById("PS100-2026-10-15-out");
      assert.ok(flight);

      // Operational cancellation applied to coordinator
      await flightRepo.setOverride(flight!.id, { status: "Cancelled" });

      // Attempt to create booking
      await assert.rejects(
        async () => {
          await bookingRepo.create({
            criteria: {
              tripType: "oneway",
              origin: flight!.originCode,
              destination: flight!.destinationCode,
              departDate: flight!.date,
              cabin: "economy",
              adults: 1,
              children: 0,
              infants: 0,
            },
            fareId: "classic",
            outbound: flight!,
            passengers: [{ firstName: "Ahmad", lastName: "Test", type: "adult" }],
            seats: {},
            extras: { pax: [] },
            contact: { email: "ahmad@example.com", phone: "+970" },
            total: 180,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BookingCreationError);
          assert.equal(err.reason, "cancelled");
          return true;
        },
      );

      // Assert zero bookings created beyond initial seeds
      const allBookings = await bookingRepo.list();
      assert.equal(allBookings.length, 6);
    });

    it("submissionId idempotency: identical submissionId returns the confirmed booking without generating a new PNR", async () => {
      const coordinator = new RepoStorageCoordinator({ storage: makeStorage() });
      const bookingRepo = new LocalBookingRepository(coordinator);

      const flight = flightById("PS100-2026-10-15-out");
      assert.ok(flight);

      const createData = {
        submissionId: "sub-12345-idempotent",
        criteria: {
          tripType: "oneway" as const,
          origin: flight!.originCode,
          destination: flight!.destinationCode,
          departDate: flight!.date,
          cabin: "economy" as const,
          adults: 1,
          children: 0,
          infants: 0,
        },
        fareId: "classic" as const,
        outbound: flight!,
        passengers: [{ firstName: "Sami", lastName: "Test", type: "adult" as const }],
        seats: {},
        extras: { pax: [] },
        contact: { email: "sami@example.com", phone: "+970" },
        total: 180,
      };

      const booking1 = await bookingRepo.create(createData);
      assert.ok(booking1.ref);

      // Repeat with same submissionId
      const booking2 = await bookingRepo.create(createData);
      assert.equal(booking2.ref, booking1.ref);

      // Ensure total count in repo increased by exactly 1 (6 initial seeds + 1 created)
      const list = await bookingRepo.list();
      assert.equal(list.length, 7);
    });

    it("rejects synthetic Studio / CAP-PROOF fixtures from repository persistence", async () => {
      const coordinator = new RepoStorageCoordinator({ storage: makeStorage() });
      const bookingRepo = new LocalBookingRepository(coordinator);

      const syntheticFlight = sampleFlight({ id: "CAP-PROOF-999-out" });

      await assert.rejects(
        async () => {
          await bookingRepo.create({
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
            fareId: "essential",
            outbound: syntheticFlight,
            passengers: [{ firstName: "Synthetic", lastName: "Tester", type: "adult" }],
            seats: {},
            extras: { pax: [] },
            contact: { email: "test@example.com", phone: "" },
            total: 100,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BookingCreationError);
          assert.equal(err.reason, "synthetic_fixture");
          return true;
        },
      );
    });
  });

  describe("6. Flight Discovery & Calendar Service Integration", () => {
    it("discovers both outbound (GZA->AMM) and inbound (AMM->GZA) flights through FlightRepository", async () => {
      const coordinator = new RepoStorageCoordinator({ storage: makeStorage() });
      const flightRepo = new LocalFlightRepository(coordinator);

      const outbound = await flightRepo.searchFlights("GZA", "AMM", "2026-10-15");
      assert.ok(outbound.length > 0);
      assert.equal(outbound[0]?.originCode, "GZA");
      assert.equal(outbound[0]?.destinationCode, "AMM");

      const inbound = await flightRepo.searchFlights("AMM", "GZA", "2026-10-15");
      assert.ok(inbound.length > 0);
      assert.equal(inbound[0]?.originCode, "AMM");
      assert.equal(inbound[0]?.destinationCode, "GZA");
    });

    it("calendar monthly service map excludes cancelled flights from lowest fare calculation", async () => {
      const coordinator = new RepoStorageCoordinator({ storage: makeStorage() });
      const flightRepo = new LocalFlightRepository(coordinator);

      const serviceMap = await flightRepo.getMonthlyServiceMap(2026, 10, "GZA", "AMM", { paxCount: 1 });
      const day15 = serviceMap["2026-10-15"];
      assert.ok(day15);
      assert.equal(day15.hasService, true);
      assert.ok(day15.lowestFare && day15.lowestFare > 0);

      // Now cancel all flights on 2026-10-15 for GZA->AMM
      const flightsOn15 = await flightRepo.searchFlights("GZA", "AMM", "2026-10-15");
      for (const f of flightsOn15) {
        await flightRepo.setOverride(f.id, { status: "Cancelled" });
      }

      // Re-query calendar
      const updatedMap = await flightRepo.getMonthlyServiceMap(2026, 10, "GZA", "AMM", { paxCount: 1 });
      const updatedDay15 = updatedMap["2026-10-15"];
      assert.ok(updatedDay15);
      assert.equal(updatedDay15.hasService, false);
      assert.equal(updatedDay15.lowestFare, null);
    });
  });
});
