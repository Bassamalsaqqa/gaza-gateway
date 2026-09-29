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
      const guestBooking = await bookingRepo.create({
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
          id: "PS-001",
          number: "PS 204",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "08:00",
          arriveTime: "09:00",
          aircraft: "Boeing 737",
          terminal: "1",
          basePrice: 150,
          status: "scheduled",
        },
        inbound: null,
        fareId: "classic",
        passengers: [{ firstName: "Guest", lastName: "Traveler", type: "adult" }],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "guest.owner@gza.ps", phone: "+970 8 000 0000" },
        total: 171,
        ownerEmail: null,
      });

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
});
