import { canonicalCreateFixture } from "../helpers/booking-create-fixture.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeEmailIdentity,
  sanitizePassengerAccount,
  sanitizeTravelers,
  sanitizePassengerStorage,
  bookingBelongsToAccount,
  bookingsForAccount,
} from "../../src/lib/passenger/domain.ts";
import {
  PassengerStorageCoordinator,
  PASSENGER_STORAGE_KEY,
  LEGACY_STORE_KEY,
  StorageCommitError,
} from "../../src/lib/passenger/storage.ts";
import { LocalPassengerRepository } from "../../src/lib/passenger/repository.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { RepoStorageCoordinator } from "../../src/lib/repositories/storage.ts";
import type { Booking } from "../../src/lib/domain/booking.ts";
import {
  buildLegacyStoreEnvelope,
  initialDraft,
  type Draft,
} from "../../src/lib/booking-draft.ts";

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

function createFailingStorage(initial: Record<string, string> = {}): Storage {
  const inner = createMockStorage(initial);
  return {
    ...inner,
    setItem() {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    },
  };
}

describe("Phase 5A Passenger Aggregate & Invariants", () => {
  describe("Email Normalization & Sanitization", () => {
    it("normalizes email identity by trimming whitespace and lowercasing", () => {
      assert.equal(normalizeEmailIdentity("  User.Name@Example.COM  "), "user.name@example.com");
      assert.equal(normalizeEmailIdentity(null), "");
      assert.equal(normalizeEmailIdentity(undefined), "");
      assert.equal(normalizeEmailIdentity(""), "");
    });

    it("sanitizes passenger account and enforces valid preferences", () => {
      const valid = sanitizePassengerAccount({
        email: "  PILOT@gza.ps  ",
        firstName: "  Sami ",
        lastName: " Al-Saqqa ",
        phone: " +970 8 000 0000 ",
        seatPreference: "window",
        mealPreference: "halal",
        newsletter: true,
      });
      assert.ok(valid);
      assert.equal(valid.email, "pilot@gza.ps");
      assert.equal(valid.firstName, "Sami");
      assert.equal(valid.lastName, "Al-Saqqa");
      assert.equal(valid.phone, "+970 8 000 0000");
      assert.equal(valid.seatPreference, "window");
      assert.equal(valid.mealPreference, "halal");
      assert.equal(valid.newsletter, true);

      // Rejects invalid seat preference, falls back to none
      const invalidSeat = sanitizePassengerAccount({
        email: "pilot@gza.ps",
        seatPreference: "cockpit",
        mealPreference: "unknown",
      });
      assert.ok(invalidSeat);
      assert.equal(invalidSeat.seatPreference, "none");
      assert.equal(invalidSeat.mealPreference, "standard");

      // Rejects missing/malformed email
      assert.equal(sanitizePassengerAccount({ firstName: "Sami" }), null);
      assert.equal(sanitizePassengerAccount({ email: "invalid-email" }), null);
      assert.equal(sanitizePassengerAccount(null), null);
    });

    it("sanitizes saved travelers and enforces stable unique IDs", () => {
      const travelers = sanitizeTravelers([
        {
          id: "trv-1",
          firstName: "  Tariq ",
          lastName: " Al-Kurd ",
          dob: "1990-05-12",
          nationality: "Palestinian",
          document: " P1234567 ",
        },
        {
          // missing id
          firstName: " Layla ",
          lastName: " Masri ",
        },
        {
          // duplicate id
          id: "trv-1",
          firstName: "Duplicate",
          lastName: "ID",
        },
      ]);

      assert.equal(travelers.length, 3);
      assert.equal(travelers[0].id, "trv-1");
      assert.equal(travelers[0].firstName, "Tariq");
      assert.equal(travelers[0].lastName, "Al-Kurd");
      assert.equal(travelers[0].document, "P1234567");

      assert.ok(travelers[1].id.startsWith("trv-"));
      assert.notEqual(travelers[1].id, "trv-1");

      assert.ok(travelers[2].id.startsWith("trv-"));
      assert.notEqual(travelers[2].id, "trv-1");
      assert.notEqual(travelers[2].id, travelers[1].id);
    });
  });

  describe("Legacy Migration & Anti-Resurrection Invariants", () => {
    it("migrates legacy account and travelers only when canonical key is absent", () => {
      const legacyStore = JSON.stringify({
        account: {
          email: "legacy@gza.ps",
          firstName: "Legacy",
          lastName: "User",
          phone: "+970 8 000 0000",
          seatPreference: "aisle",
          mealPreference: "halal",
          newsletter: false,
        },
        travelers: [
          {
            id: "trv-leg-1",
            firstName: "Child",
            lastName: "User",
            dob: "2015-01-01",
            nationality: "Palestinian",
            document: "C987654",
          },
        ],
        draft: { entry: "results" },
        bookings: [{ ref: "GZA-OLD1" }],
      });

      const storage = createMockStorage({
        [LEGACY_STORE_KEY]: legacyStore,
      });

      const coordinator = new PassengerStorageCoordinator({ storage });
      const account = coordinator.getAccount();
      const travelers = coordinator.getTravelers();

      assert.ok(account);
      assert.equal(account.email, "legacy@gza.ps");
      assert.equal(account.seatPreference, "aisle");
      assert.equal(travelers.length, 1);
      assert.equal(travelers[0].id, "trv-leg-1");

      // Canonical key was written
      const canonicalRaw = storage.getItem(PASSENGER_STORAGE_KEY);
      assert.ok(canonicalRaw);
      const parsed = JSON.parse(canonicalRaw);
      assert.equal(parsed.schemaVersion, 1);
      assert.equal(parsed.account.email, "legacy@gza.ps");
      assert.equal(parsed.travelers[0].id, "trv-leg-1");

      // Invariant: legacy store was NOT altered or erased
      assert.equal(storage.getItem(LEGACY_STORE_KEY), legacyStore);
    });

    it("anti-resurrection rule: present empty canonical storage never resurrects legacy state", () => {
      const legacyStore = JSON.stringify({
        account: { email: "zombie@gza.ps", firstName: "Zombie" },
        travelers: [{ id: "t-1", firstName: "Ghost" }],
      });

      // Canonical key exists with null account and empty travelers
      const storage = createMockStorage({
        [LEGACY_STORE_KEY]: legacyStore,
        [PASSENGER_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 1,
          account: null,
          travelers: [],
        }),
      });

      const coordinator = new PassengerStorageCoordinator({ storage });
      assert.equal(coordinator.getAccount(), null);
      assert.deepEqual(coordinator.getTravelers(), []);
    });

    it("anti-resurrection rule: present corrupt canonical storage falls back safely without reading legacy", () => {
      const legacyStore = JSON.stringify({
        account: { email: "zombie@gza.ps", firstName: "Zombie" },
      });

      const storage = createMockStorage({
        [LEGACY_STORE_KEY]: legacyStore,
        [PASSENGER_STORAGE_KEY]: "{corrupt-json",
      });

      const coordinator = new PassengerStorageCoordinator({ storage });
      assert.equal(coordinator.getAccount(), null);
      assert.deepEqual(coordinator.getTravelers(), []);
    });
  });

  describe("Passenger Repository CRUD & Email Immutability", () => {
    it("signs in, normalizes email, and signs out while preserving saved travelers", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      // Add a saved traveler first
      const traveler = await repo.addTraveler({
        firstName: "Salma",
        lastName: "Arafat",
        dob: "1995-02-14",
        nationality: "Palestinian",
        document: "P776655",
      });
      assert.ok(traveler.id);

      // Sign in
      const account = await repo.signIn("  Passenger.One@GZA.ps  ", "Passenger", "One");
      assert.equal(account.email, "passenger.one@gza.ps");
      assert.equal(account.firstName, "Passenger");

      // Sign out
      await repo.signOut();
      assert.equal(await repo.getAccount(), null);

      // Saved travelers survive sign out
      const remainingTravelers = await repo.listTravelers();
      assert.equal(remainingTravelers.length, 1);
      assert.equal(remainingTravelers[0].id, traveler.id);
    });

    it("enforces profile email immutability on updateAccount", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      await repo.signIn("fixed@gza.ps", "Original", "Name");

      // Attempting to change email via updateAccount
      const updated = await repo.updateAccount({
        firstName: "Updated",
        // @ts-expect-error - testing email property attack/attempt
        email: "hacked@evil.com",
        phone: "+970 8 111 2222",
      });

      assert.ok(updated);
      assert.equal(updated.firstName, "Updated");
      assert.equal(updated.email, "fixed@gza.ps"); // strictly preserved
      assert.equal(updated.phone, "+970 8 111 2222");

      const inStorage = coordinator.getAccount();
      assert.equal(inStorage?.email, "fixed@gza.ps");
    });

    it("updates and removes saved travelers with stable IDs", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      const created = await repo.addTraveler({
        firstName: "Ahmad",
        lastName: "Najjar",
        dob: "1988-10-10",
        nationality: "Palestinian",
        document: "A123456",
      });

      const updated = await repo.updateTraveler(created.id, {
        document: "A999999",
      });
      assert.ok(updated);
      assert.equal(updated.id, created.id);
      assert.equal(updated.document, "A999999");
      assert.equal(updated.firstName, "Ahmad");

      const removed = await repo.removeTraveler(created.id);
      assert.equal(removed, true);
      assert.deepEqual(await repo.listTravelers(), []);
    });
  });

  describe("Ownership Selectors & Hardened Claim Rules", () => {
    it("selects bookings for account using normalized email identity", () => {
      const bookings: Booking[] = [
        {
          ref: "GZA-001",
          ownerEmail: "pilot@gza.ps",
          contact: { email: "contact1@gza.ps", phone: "" },
        } as Booking,
        {
          ref: "GZA-002",
          ownerEmail: "other@gza.ps",
          contact: { email: "contact2@gza.ps", phone: "" },
        } as Booking,
        {
          ref: "GZA-003",
          ownerEmail: null,
          contact: { email: "pilot@gza.ps", phone: "" },
        } as Booking,
      ];

      assert.equal(bookingBelongsToAccount(bookings[0], "  PILOT@GZA.PS "), true);
      assert.equal(bookingBelongsToAccount(bookings[1], "pilot@gza.ps"), false);
      assert.equal(bookingBelongsToAccount(bookings[2], "pilot@gza.ps"), false); // unowned guest booking

      const myBookings = bookingsForAccount(bookings, "PILOT@gza.ps");
      assert.equal(myBookings.length, 1);
      assert.equal(myBookings[0].ref, "GZA-001");
    });

    it("verifies all claim statuses and contact preservation in BookingRepository", async () => {
      const storage = createMockStorage();
      const repoCoordinator = new RepoStorageCoordinator({ storage });
      const bookingRepo = new LocalBookingRepository(repoCoordinator);

      // Create an unowned guest booking
      const guestBooking = await bookingRepo.create(canonicalCreateFixture({
        criteria: {
          tripType: "one-way",
          originCode: "GZA",
          destinationCode: "AMM",
          departDate: "2026-10-10",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "PS100-2026-10-10-out",
          number: "PS100",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "07:15",
          arriveTime: "08:10",
          aircraft: "Airbus A321neo",
          terminal: "1",
          basePrice: 177,
          status: "Scheduled",
          gate: "A1",
          durationMinutes: 55,
          seatsLeft: 19,
        },
        inbound: null,
        fareId: "classic",
        passengers: [{ firstName: "Guest", lastName: "Traveler", type: "adult" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "guest.owner@gza.ps", phone: "+970 8 000 0000" },
        total: 171,
        ownerEmail: null,
      }));

      const ref = guestBooking.ref;

      // 1. Not found
      const notFoundRes = await bookingRepo.claim("NONEXISTENT", "guest.owner@gza.ps");
      assert.equal(notFoundRes.status, "not-found");

      // 2. Contact mismatch (unowned booking, but claimant email does not match contact email)
      const mismatchRes = await bookingRepo.claim(ref, "stranger@gza.ps");
      assert.equal(mismatchRes.status, "contact-mismatch");

      // 3. Successfully claimed with matching contact email
      const claimRes = await bookingRepo.claim(ref, "  GUEST.OWNER@GZA.PS ");
      assert.equal(claimRes.status, "claimed");
      if (claimRes.status === "claimed") {
        assert.equal(claimRes.booking.ownerEmail, "guest.owner@gza.ps");
        // Invariant: contact email remains untouched
        assert.equal(claimRes.booking.contact.email, "guest.owner@gza.ps");
      }

      // 4. Idempotent: already owned by same user
      const alreadyOwnedRes = await bookingRepo.claim(ref, "guest.owner@gza.ps");
      assert.equal(alreadyOwnedRes.status, "already-owned-by-user");

      // 5. Owned by another user (reject claim attempt by someone else)
      const ownedByAnotherRes = await bookingRepo.claim(ref, "different.user@gza.ps");
      assert.equal(ownedByAnotherRes.status, "owned-by-another");
    });
  });

  describe("Transactional Storage Failure Rollback", () => {
    it("rolls back state and suppresses notifications on storage quota error", async () => {
      const failingStorage = createFailingStorage();
      const coordinator = new PassengerStorageCoordinator({ storage: failingStorage });
      const repo = new LocalPassengerRepository(coordinator);

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.signIn("test@gza.ps", "Test", "User");
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      // State was rolled back and subscribers were not notified
      assert.equal(coordinator.getAccount(), null);
      assert.equal(notifications, 0);
    });

    it("rolls back updateAccount and preserves previous account on storage error", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      // Successfully sign in first
      await repo.signIn("safe@gza.ps", "Safe", "User");

      // Now break storage setItem
      storage.setItem = () => {
        throw new Error("Quota exceeded");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.updateAccount({ firstName: "Unsafe" });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      // Name remains "Safe" and notifications = 0
      assert.equal(coordinator.getAccount()?.firstName, "Safe");
      assert.equal(notifications, 0);
    });
  });

  describe("Studio Preview Isolation", () => {
    it("isolated in-memory coordinator never touches persistent storage keys", async () => {
      const persistentStorage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({
        inMemoryOnly: true,
        storage: persistentStorage,
      });
      const repo = new LocalPassengerRepository(coordinator);

      const account = await repo.signIn("studio@gza.ps", "Studio", "Preview");
      assert.equal(account.email, "studio@gza.ps");

      await repo.addTraveler({
        firstName: "Studio",
        lastName: "Traveler",
        dob: "2000-01-01",
        nationality: "Palestinian",
        document: "ST123",
      });

      // Storage was never touched
      assert.equal(persistentStorage.getItem(PASSENGER_STORAGE_KEY), null);
      assert.equal(persistentStorage.getItem(LEGACY_STORE_KEY), null);
    });
  });

  describe("Legacy Envelope Shape Preservation (Correction 0.1)", () => {
    const updatedDraft: Draft = {
      ...initialDraft,
      fareId: "flex",
      contact: { email: "passenger@gza.ps", phone: "+970 8 111 2222" },
    };

    it("Scenario 1: draft-only legacy envelope keeps absent account and travelers absent", () => {
      const draftOnlyEnvelope = {
        draft: { ...initialDraft, fareId: "classic" },
      };

      const result = buildLegacyStoreEnvelope(draftOnlyEnvelope, updatedDraft);

      // Draft is updated
      assert.equal(result.draft, updatedDraft);
      // Invariant: absent account and travelers must NOT be instantiated
      assert.equal("account" in result, false);
      assert.equal("travelers" in result, false);
      assert.deepEqual(Object.keys(result).sort(), ["draft"]);
    });

    it("Scenario 2: existing legacy passenger fields survive semantically on draft update", () => {
      const existingAccount = {
        email: "legacy@gza.ps",
        firstName: "Legacy",
        lastName: "Traveller",
        phone: "+970 8 000 0000",
        seatPreference: "window",
        mealPreference: "halal",
        newsletter: false,
      };
      const existingTravelers = [
        {
          id: "tr-legacy-1",
          firstName: "Companion",
          lastName: "Traveller",
          dob: "2015-05-05",
          nationality: "Palestinian",
          document: "PS-001122",
        },
      ];
      const existingBookings = [{ ref: "LEGACY1" }];

      const envelopeWithPassenger = {
        draft: { ...initialDraft },
        account: existingAccount,
        travelers: existingTravelers,
        bookings: existingBookings,
      };

      const result = buildLegacyStoreEnvelope(envelopeWithPassenger, updatedDraft);

      // Draft is updated
      assert.equal(result.draft, updatedDraft);
      // Invariant: existing fields survive semantically
      assert.deepEqual(result.account, existingAccount);
      assert.deepEqual(result.travelers, existingTravelers);
      assert.deepEqual(result.bookings, existingBookings);
    });

    it("Scenario 3: canonical profile update does not flow back into legacy draft envelope", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const passengerRepo = new LocalPassengerRepository(coordinator);

      // Sign in and update canonical passenger state in gza.passenger.v1
      await passengerRepo.signIn("canonical@gza.ps", "Canonical", "User");
      await passengerRepo.updateAccount({ firstName: "CanonicalUpdated" });

      // In legacy store, previous envelope had NO account
      const legacyEnvelope = {
        draft: { ...initialDraft },
      };

      const result = buildLegacyStoreEnvelope(legacyEnvelope, updatedDraft);

      // Invariant: canonical changes NEVER dual-write or resurrect into legacy envelope
      assert.equal("account" in result, false);
      assert.equal("travelers" in result, false);
    });

    it("Scenario 4: unknown keys and rollback fields survive draft save", () => {
      const envelopeWithUnknown = {
        draft: { ...initialDraft },
        rollbackToken: "rb-987654321",
        customAuditTag: "verified-preflight",
        retryCount: 3,
        systemFlags: { safeMode: true },
      };

      const result = buildLegacyStoreEnvelope(envelopeWithUnknown, updatedDraft);

      assert.equal(result.draft, updatedDraft);
      // Invariant: unknown keys, rollback tokens, and metadata survive untouched
      assert.equal(result.rollbackToken, "rb-987654321");
      assert.equal(result.customAuditTag, "verified-preflight");
      assert.equal(result.retryCount, 3);
      assert.deepEqual(result.systemFlags, { safeMode: true });
    });
  });

  describe("Read-Only No-Op Booking Claims & Mutation Invariants (Correction 0.1)", () => {
    it("all 4 no-op claim outcomes are read-only: return domain result on throwing storage with zero writes and zero notifications", async () => {
      // 1. Prepare initial state with an unowned booking and an owned booking
      const seedUnowned: Booking = {
        ref: "UNOWNED1",
        createdAt: "2026-10-01T10:00:00Z",
        status: "confirmed",
        criteria: {
          tripType: "one-way",
          originCode: "GZA",
          destinationCode: "AMM",
          departDate: "2026-10-15",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "PS-001",
          number: "PS 204",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-15",
          departTime: "08:00",
          arriveTime: "09:00",
          aircraft: "Boeing 737",
          terminal: "1",
          basePrice: 150,
          status: "scheduled",
        },
        inbound: null,
        fareId: "classic",
        passengers: [{ id: "p1", firstName: "Ali", lastName: "Gaza", type: "adult" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "eligible@gza.ps", phone: "+970 8 000 0000" },
        total: 171,
        checkedIn: { out: [], in: [] },
        ownerEmail: null,
      };

      const seedOwned: Booking = {
        ...seedUnowned,
        ref: "OWNED1",
        ownerEmail: "owner@gza.ps",
        contact: { email: "owner@gza.ps", phone: "+970 8 000 0000" },
      };

      let writeCount = 0;
      const initialStore: Record<string, string> = {
        "gza.repo.v1": JSON.stringify({
          schemaVersion: 1,
          bookings: [seedUnowned, seedOwned],
          flightOverrides: {},
        }),
      };
      const mockStorage = createMockStorage(initialStore);

      // Now create failing storage that counts any setItem attempt and throws
      mockStorage.setItem = (_key: string, _val: string) => {
        writeCount++;
        const err = new Error("Storage is broken or full");
        err.name = "QuotaExceededError";
        throw err;
      };

      const repoCoordinator = new RepoStorageCoordinator({ storage: mockStorage });
      const bookingRepo = new LocalBookingRepository(repoCoordinator);

      let notificationCount = 0;
      bookingRepo.subscribe(() => {
        notificationCount++;
      });

      // No-Op Outcome 1: not-found
      const notFoundRes = await bookingRepo.claim("NONEXISTENT", "eligible@gza.ps");
      assert.equal(notFoundRes.status, "not-found");
      assert.equal(writeCount, 0, "not-found must perform zero storage writes");
      assert.equal(notificationCount, 0, "not-found must notify zero subscribers");

      // No-Op Outcome 2: contact-mismatch
      const mismatchRes = await bookingRepo.claim("UNOWNED1", "mismatch@gza.ps");
      assert.equal(mismatchRes.status, "contact-mismatch");
      assert.equal(writeCount, 0, "contact-mismatch must perform zero storage writes");
      assert.equal(notificationCount, 0, "contact-mismatch must notify zero subscribers");

      // No-Op Outcome 3: owned-by-another
      const ownedAnotherRes = await bookingRepo.claim("OWNED1", "intruder@gza.ps");
      assert.equal(ownedAnotherRes.status, "owned-by-another");
      assert.equal(writeCount, 0, "owned-by-another must perform zero storage writes");
      assert.equal(notificationCount, 0, "owned-by-another must notify zero subscribers");

      // No-Op Outcome 4: already-owned-by-user
      const alreadyOwnedRes = await bookingRepo.claim("OWNED1", "owner@gza.ps");
      assert.equal(alreadyOwnedRes.status, "already-owned-by-user");
      assert.equal(writeCount, 0, "already-owned-by-user must perform zero storage writes");
      assert.equal(notificationCount, 0, "already-owned-by-user must notify zero subscribers");
    });

    it("genuine claim mutation executes single transaction, writes storage, notifies subscribers, sets ownerEmail, and leaves contact email unchanged", async () => {
      const seedUnowned: Booking = {
        ref: "GENUINE1",
        createdAt: "2026-10-01T10:00:00Z",
        status: "confirmed",
        criteria: {
          tripType: "one-way",
          originCode: "GZA",
          destinationCode: "AMM",
          departDate: "2026-10-15",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "PS-001",
          number: "PS 204",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-15",
          departTime: "08:00",
          arriveTime: "09:00",
          aircraft: "Boeing 737",
          terminal: "1",
          basePrice: 150,
          status: "scheduled",
        },
        inbound: null,
        fareId: "classic",
        passengers: [{ id: "p1", firstName: "Ali", lastName: "Gaza", type: "adult" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "claimant.contact@gza.ps", phone: "+970 8 000 0000" },
        total: 171,
        checkedIn: { out: [], in: [] },
        ownerEmail: null,
      };

      let writeCount = 0;
      const initialStore: Record<string, string> = {
        "gza.repo.v1": JSON.stringify({
          schemaVersion: 1,
          bookings: [seedUnowned],
          flightOverrides: {},
        }),
      };
      const mockStorage = createMockStorage(initialStore);
      const originalSetItem = mockStorage.setItem.bind(mockStorage);
      mockStorage.setItem = (key: string, val: string) => {
        writeCount++;
        originalSetItem(key, val);
      };

      const repoCoordinator = new RepoStorageCoordinator({ storage: mockStorage });
      const bookingRepo = new LocalBookingRepository(repoCoordinator);

      let notificationCount = 0;
      bookingRepo.subscribe(() => {
        notificationCount++;
      });

      // Claim with matching contact email (case-insensitive)
      const res = await bookingRepo.claim("GENUINE1", "  CLAIMANT.CONTACT@gza.ps  ");
      assert.equal(res.status, "claimed");

      // Verify single write and single notification
      assert.equal(writeCount, 1, "Successful claim must commit exactly 1 transaction to storage");
      assert.equal(notificationCount, 1, "Successful claim must notify subscribers exactly once");

      if (res.status === "claimed") {
        // Invariant: ownerEmail is normalized; contact.email is strictly UNCHANGED
        assert.equal(res.booking.ownerEmail, "claimant.contact@gza.ps");
        assert.equal(res.booking.contact.email, "claimant.contact@gza.ps");
      }
    });

    it("evaluates claims against freshest storage snapshot when in-memory view is stale: zero writes/notifications on rejected claims and single-commit on valid claim (Correction 0.2 Finding 1)", async () => {
      const initialBooking: Booking = {
        ref: "STALE_VIEW1",
        createdAt: "2026-10-01T10:00:00Z",
        status: "confirmed",
        criteria: {
          tripType: "one-way",
          originCode: "GZA",
          destinationCode: "AMM",
          departDate: "2026-10-15",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "PS-001",
          number: "PS 204",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-15",
          departTime: "08:00",
          arriveTime: "09:00",
          aircraft: "Boeing 737",
          terminal: "1",
          basePrice: 150,
          status: "scheduled",
        },
        inbound: null,
        fareId: "classic",
        passengers: [{ id: "p1", firstName: "Bassem", lastName: "Gaza", type: "adult" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "claimant@gza.ps", phone: "+970 8 000 0000" },
        total: 171,
        checkedIn: { out: [], in: [] },
        ownerEmail: null, // Initially unowned in repository in-memory state
      };

      const initialStore: Record<string, string> = {
        "gza.repo.v1": JSON.stringify({
          schemaVersion: 1,
          bookings: [initialBooking],
          flightOverrides: {},
        }),
      };
      const mockStorage = createMockStorage(initialStore);
      let storageWrites = 0;
      const rawSetItem = mockStorage.setItem.bind(mockStorage);
      mockStorage.setItem = (k: string, v: string) => {
        storageWrites++;
        rawSetItem(k, v);
      };

      // Construct coordinator and repository with in-memory state initialized to initialStore
      const coordinator = new RepoStorageCoordinator({ storage: mockStorage });
      const repo = new LocalBookingRepository(coordinator);

      let subscriberNotifications = 0;
      repo.subscribe(() => {
        subscriberNotifications++;
      });

      // Confirm in-memory view sees booking as unowned
      const memSnapshot = coordinator.getState().bookings.find((b) => b.ref === "STALE_VIEW1");
      assert.equal(memSnapshot?.ownerEmail, null);

      // --- Scenario 1: Backing storage modified by another tab to 'owned-by-another' WITHOUT firing storage event ---
      const tabBUpdatedStore1 = {
        schemaVersion: 1,
        bookings: [
          {
            ...initialBooking,
            ownerEmail: "rival@gza.ps", // Another tab claimed it in storage
          },
        ],
        flightOverrides: {},
      };
      // Write directly to underlying storage (simulating another tab) without notifying coordinator
      rawSetItem("gza.repo.v1", JSON.stringify(tabBUpdatedStore1));
      storageWrites = 0;
      subscriberNotifications = 0;

      // In-memory view is still stale (ownerEmail === null), but claim must evaluate fresh storage snapshot
      const resOwnedByAnother = await repo.claim("STALE_VIEW1", "claimant@gza.ps");
      assert.equal(resOwnedByAnother.status, "owned-by-another");
      assert.equal(storageWrites, 0, "owned-by-another on stale memory must perform zero storage writes");
      assert.equal(subscriberNotifications, 0, "owned-by-another on stale memory must notify zero subscribers");

      // --- Scenario 2: Backing storage changed contact email to mismatch WITHOUT firing storage event ---
      const tabBUpdatedStore2 = {
        schemaVersion: 1,
        bookings: [
          {
            ...initialBooking,
            ownerEmail: null,
            contact: { email: "other.contact@gza.ps", phone: "+970 8 000 0000" },
          },
        ],
        flightOverrides: {},
      };
      rawSetItem("gza.repo.v1", JSON.stringify(tabBUpdatedStore2));
      storageWrites = 0;
      subscriberNotifications = 0;

      const resContactMismatch = await repo.claim("STALE_VIEW1", "claimant@gza.ps");
      assert.equal(resContactMismatch.status, "contact-mismatch");
      assert.equal(storageWrites, 0, "contact-mismatch on stale memory must perform zero storage writes");
      assert.equal(subscriberNotifications, 0, "contact-mismatch on stale memory must notify zero subscribers");

      // --- Scenario 3: Backing storage deleted booking WITHOUT firing storage event ---
      const tabBUpdatedStore3 = {
        schemaVersion: 1,
        bookings: [],
        flightOverrides: {},
      };
      rawSetItem("gza.repo.v1", JSON.stringify(tabBUpdatedStore3));
      storageWrites = 0;
      subscriberNotifications = 0;

      const resNotFound = await repo.claim("STALE_VIEW1", "claimant@gza.ps");
      assert.equal(resNotFound.status, "not-found");
      assert.equal(storageWrites, 0, "not-found on stale memory must perform zero storage writes");
      assert.equal(subscriberNotifications, 0, "not-found on stale memory must notify zero subscribers");

      // --- Scenario 4: Backing storage already claimed by this user WITHOUT firing storage event ---
      const tabBUpdatedStore4 = {
        schemaVersion: 1,
        bookings: [
          {
            ...initialBooking,
            ownerEmail: "claimant@gza.ps",
          },
        ],
        flightOverrides: {},
      };
      rawSetItem("gza.repo.v1", JSON.stringify(tabBUpdatedStore4));
      storageWrites = 0;
      subscriberNotifications = 0;

      const resAlreadyOwned = await repo.claim("STALE_VIEW1", "claimant@gza.ps");
      assert.equal(resAlreadyOwned.status, "already-owned-by-user");
      assert.equal(storageWrites, 0, "already-owned-by-user on stale memory must perform zero storage writes");
      assert.equal(subscriberNotifications, 0, "already-owned-by-user on stale memory must notify zero subscribers");

      // --- Scenario 5: Successful claim from stale in-memory view ---
      // In-memory view thinks STALE_NEW does not exist, but backing storage has it unowned and matching contact email
      const newBookingInStorage: Booking = {
        ...initialBooking,
        ref: "STALE_NEW",
        contact: { email: "claimant@gza.ps", phone: "+970 8 000 0000" },
        ownerEmail: null,
      };
      const tabBUpdatedStore5 = {
        schemaVersion: 1,
        bookings: [newBookingInStorage],
        flightOverrides: {},
      };
      rawSetItem("gza.repo.v1", JSON.stringify(tabBUpdatedStore5));
      storageWrites = 0;
      subscriberNotifications = 0;

      const resClaimed = await repo.claim("STALE_NEW", "  CLAIMANT@GZA.PS  ");
      assert.equal(resClaimed.status, "claimed");
      assert.equal(storageWrites, 1, "Successful claim from stale in-memory view must commit exactly 1 transaction");
      assert.equal(subscriberNotifications, 1, "Successful claim from stale in-memory view must notify subscribers once");

      if (resClaimed.status === "claimed") {
        assert.equal(resClaimed.booking.ownerEmail, "claimant@gza.ps");
        assert.equal(resClaimed.booking.contact.email, "claimant@gza.ps");
      }
    });
  });

  describe("Storage Failure Rollback on All Passenger Mutations (Correction 0.1)", () => {
    it("signOut rejects with StorageCommitError, retains account in memory, and suppresses notifications on storage error", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      // Sign in successfully
      await repo.signIn("retain@gza.ps", "Retain", "User");
      assert.ok(coordinator.getAccount());

      // Break storage
      storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.signOut();
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      // Invariant: account is retained in memory and no notifications fired
      assert.equal(coordinator.getAccount()?.email, "retain@gza.ps");
      assert.equal(notifications, 0);
    });

    it("addTraveler rejects with StorageCommitError, preserves travelers list, and suppresses notifications", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      // Break storage immediately
      storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.addTraveler({
            firstName: "Failed",
            lastName: "Traveler",
            dob: "2010-01-01",
            nationality: "Palestinian",
            document: "FAIL1",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      assert.deepEqual(coordinator.getTravelers(), []);
      assert.equal(notifications, 0);
    });

    it("updateTraveler rejects with StorageCommitError, retains traveler state, and suppresses notifications", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      const traveler = await repo.addTraveler({
        firstName: "Original",
        lastName: "Traveler",
        dob: "1995-05-05",
        nationality: "Palestinian",
        document: "ORIG1",
      });

      storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.updateTraveler(traveler.id, { firstName: "ChangedName" });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      const found = coordinator.getTravelers().find((t) => t.id === traveler.id);
      assert.equal(found?.firstName, "Original");
      assert.equal(notifications, 0);
    });

    it("removeTraveler rejects with StorageCommitError, retains traveler, and suppresses notifications", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      const traveler = await repo.addTraveler({
        firstName: "Stay",
        lastName: "Traveler",
        dob: "1992-02-02",
        nationality: "Palestinian",
        document: "STAY1",
      });

      storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.removeTraveler(traveler.id);
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      assert.equal(coordinator.getTravelers().length, 1);
      assert.equal(notifications, 0);
    });

    it("updateAccount for preferences rejects with StorageCommitError, retains previous preference, and suppresses notifications", async () => {
      const storage = createMockStorage();
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);

      await repo.signIn("pref@gza.ps", "Pref", "User");
      assert.equal(coordinator.getAccount()?.mealPreference, "standard");

      storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      let notifications = 0;
      repo.subscribe(() => {
        notifications++;
      });

      await assert.rejects(
        async () => {
          await repo.updateAccount({ mealPreference: "vegetarian" });
        },
        (err: unknown) => {
          assert.ok(err instanceof StorageCommitError);
          return true;
        },
      );

      assert.equal(coordinator.getAccount()?.mealPreference, "standard");
      assert.equal(notifications, 0);
    });
  });

  describe("Deterministic Cross-Tab Storage Event Adoption (Correction 0.1)", () => {
    it("adopts external passenger storage events without reload and notifies subscribers", () => {
      let listener: ((e: { key: string }) => void) | null = null;
      const fakeWindow = {
        addEventListener: (event: string, handler: (e: { key: string }) => void) => {
          if (event === "storage") listener = handler;
        },
        removeEventListener: () => {},
      };
      // @ts-expect-error - simulating browser window in unit test
      globalThis.window = fakeWindow;

      try {
        const storage = createMockStorage();
        const coordinator = new PassengerStorageCoordinator({ storage });
        let notified = 0;
        coordinator.subscribe(() => notified++);

        // Tab B writes new passenger account to localStorage
        storage.setItem(
          PASSENGER_STORAGE_KEY,
          JSON.stringify({
            schemaVersion: 1,
            account: {
              email: "cross.tab@gza.ps",
              firstName: "Cross",
              lastName: "Tab",
              phone: "+970 8 999 9999",
              seatPreference: "aisle",
              mealPreference: "halal",
              newsletter: true,
            },
            travelers: [],
          }),
        );

        // Fire storage event
        assert.ok(listener, "storage event listener must be registered on window");
        listener({ key: PASSENGER_STORAGE_KEY });

        // Assert coordinator adopted external state and notified subscribers
        assert.equal(coordinator.getAccount()?.email, "cross.tab@gza.ps");
        assert.equal(coordinator.getAccount()?.firstName, "Cross");
        assert.equal(notified, 1);
      } finally {
        // @ts-expect-error - cleanup mock window
        delete globalThis.window;
      }
    });
  });
});
