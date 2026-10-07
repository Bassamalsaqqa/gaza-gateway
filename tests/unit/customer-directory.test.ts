/**
 * Gaza Gateway — Derived Customer Directory Unit Tests
 *
 * Exhaustive unit tests for Phase 6C Customer Directory:
 * 1. Non-persistent projection guarantee (no gza.customer.v1)
 * 2. Stable non-raw-email route IDs: reversible, bijective, zero '@' or '.', collision handling
 * 3. Account derivation: local passenger account, saved travelers, canonical ownerEmail bookings
 * 4. Invariant: Contact email match WITHOUT ownerEmail does NOT confer account ownership
 * 5. Guest derivation: unowned bookings grouped by normalized contact email, lead passenger name
 * 6. Deterministic clock: upcoming vs past vs cancelled calculations
 * 7. Customer detail queries (account vs guest vs not found)
 * 8. Reactive subscriptions to passenger and booking repositories
 * 9. Detached results preventing reference mutations
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerToRouteId,
  fromBase64Url,
  routeIdToCustomerInfo,
  toBase64Url,
  assertNoRouteIdCollisions,
} from "../../src/lib/customer-directory/id.ts";
import {
  LocalCustomerDirectoryService,
  isBookingUpcoming,
} from "../../src/lib/customer-directory/service.ts";
import {
  LocalPassengerRepository,
  PassengerStorageCoordinator,
  PASSENGER_STORAGE_KEY,
  StorageCommitError,
} from "../../src/lib/passenger/index.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
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

function makeSyntheticBooking(overrides: Partial<Booking> = {}): Booking {
  const pax = overrides.passengers ?? [
    {
      id: "pax-1",
      type: "adult" as const,
      firstName: "Tariq",
      lastName: "Nasser",
      dob: "1990-05-15",
      nationality: "Palestinian",
      document: "P12345678",
    },
  ];
  const outDate = overrides.outbound?.date ?? "2026-10-01";
  const adults = pax.filter((p) => p.type === "adult").length;
  const children = pax.filter((p) => p.type === "child").length;
  const infants = pax.filter((p) => p.type === "infant").length;

  return {
    ref: overrides.ref ?? "GZA-TEST",
    createdAt: overrides.createdAt ?? "2026-09-01T10:00:00.000Z",
    criteria: {
      tripType: "oneway",
      origin: "GZA",
      destination: "AMM",
      departDate: outDate,
      adults,
      children,
      infants,
      cabin: "economy",
    },
    outbound: {
      id: "fl-101",
      number: "PS 101",
      originCode: "GZA",
      destinationCode: "AMM",
      departTime: "08:00",
      arriveTime: "09:00",
      date: outDate,
      aircraft: "Boeing 737-800",
      status: "On Time",
      basePrice: 150,
      durationMinutes: 60,
    },
    inbound: null,
    fareId: "classic",
    passengers: pax,
    seats: { "out-0": "12A" },
    extras: { pax: pax.map(() => ({ extraBags: 0, meal: "standard", assistance: [] })) },
    contact: { email: "guest@example.com", phone: "+970 59 111 2233" },
    total: 180,
    status: "confirmed",
    checkedIn: { out: [], in: [] },
    channel: "web",
    ownerEmail: null,
    ...overrides,
  };
}

describe("Customer Directory — Route ID Bijection & Collision Resistance", () => {
  it("encodes and decodes URL-safe route IDs without raw email symbols", () => {
    const rawEmail = "Nadia.Sabbagh+vip@Example.COM";
    const accountId = customerToRouteId("account", rawEmail);
    const guestId = customerToRouteId("guest", rawEmail);

    assert.ok(accountId.startsWith("cus_acc_"));
    assert.ok(guestId.startsWith("cus_gst_"));

    // Crucial: no raw email characters in the route identifier
    assert.ok(!accountId.includes("@"));
    assert.ok(!accountId.includes(".COM"));
    assert.ok(!guestId.includes("@"));

    // Roundtrip verification
    const accountInfo = routeIdToCustomerInfo(accountId);
    assert.ok(accountInfo !== null);
    assert.equal(accountInfo.type, "account");
    assert.equal(accountInfo.normalizedEmail, "nadia.sabbagh+vip@example.com");

    const guestInfo = routeIdToCustomerInfo(guestId);
    assert.ok(guestInfo !== null);
    assert.equal(guestInfo.type, "guest");
    assert.equal(guestInfo.normalizedEmail, "nadia.sabbagh+vip@example.com");
  });

  it("handles 500 distinct synthetic emails with zero collisions", () => {
    const items: { id: string; email: string; type: "account" | "guest" }[] = [];
    for (let i = 0; i < 500; i++) {
      const email = `traveler.test_${i}.sub@domain-${i % 10}.ps`;
      const id = customerToRouteId(i % 2 === 0 ? "account" : "guest", email);
      items.push({ id, email, type: i % 2 === 0 ? "account" : "guest" });
    }

    const uniqueIds = new Set(items.map((x) => x.id));
    assert.equal(uniqueIds.size, 500, "Every distinct email must generate a unique route ID");
    assert.doesNotThrow(() => assertNoRouteIdCollisions(items));
  });

  it("detects and throws on synthetic route ID collisions", () => {
    const collisionItems = [
      { id: "cus_acc_identical", email: "user1@example.com", type: "account" as const },
      { id: "cus_acc_identical", email: "user2@example.com", type: "account" as const },
    ];
    assert.throws(
      () => assertNoRouteIdCollisions(collisionItems),
      /Customer route ID collision detected/,
    );
  });

  it("returns null on malformed or tampered route IDs", () => {
    assert.equal(routeIdToCustomerInfo(""), null);
    assert.equal(routeIdToCustomerInfo("invalid-id"), null);
    assert.equal(routeIdToCustomerInfo("cus_xyz_1234"), null);
    assert.equal(routeIdToCustomerInfo("cus_acc_!!!invalidbase64@@@"), null);
    assert.equal(routeIdToCustomerInfo("cus_acc_" + toBase64Url("not-an-email")), null);
    // Token with trailing = or === (must reject non-canonical tokens)
    const validCanonical = customerToRouteId("account", "test@example.com");
    assert.equal(routeIdToCustomerInfo(validCanonical + "==="), null);
    assert.equal(routeIdToCustomerInfo(validCanonical + "="), null);
  });
});

describe("Customer Directory — Account vs Guest Projection", () => {
  it("projects account customer and enforces strict ownerEmail ownership invariant", async () => {
    // Booking A: Owned by Huda
    const bookingA = makeSyntheticBooking({
      ref: "GZA-OWN1",
      ownerEmail: "huda.masri@example.com",
      contact: { email: "huda.masri@example.com", phone: "+970 59 999 8888" },
      outbound: { ...makeSyntheticBooking().outbound, date: "2026-10-15" },
    });
    // Booking B: Contact email matches Huda, BUT ownerEmail is null (UNOWNED / GUEST)
    // Invariant: Contact email match alone does NOT confer account ownership!
    const bookingB = makeSyntheticBooking({
      ref: "GZA-GST1",
      ownerEmail: null,
      contact: { email: "huda.masri@example.com", phone: "+970 59 111 0000" },
      outbound: { ...makeSyntheticBooking().outbound, date: "2026-09-01" },
    });
    // Booking C: Completely separate guest
    const bookingC = makeSyntheticBooking({
      ref: "GZA-GST2",
      ownerEmail: null,
      contact: { email: "separate.guest@example.com", phone: "+970 59 222 3333" },
      passengers: [{
        id: "pax-c",
        type: "adult" as const,
        firstName: "Layla",
        lastName: "Zaid",
        dob: "1988-12-10",
        nationality: "Palestinian",
        document: "P55443322",
      }],
    });

    const storage = createMockStorage();
    const repos = createRepositories({
      storage,
      inMemoryOnly: true,
      initialData: {
        schemaVersion: 1,
        bookings: [bookingA, bookingB, bookingC],
        overrides: {},
      },
    });

    // 1. Establish passenger account
    await repos.passenger.signIn("huda.masri@example.com", "Huda", "Masri");
    await repos.passenger.updateAccount({ phone: "+970 59 999 8888" });
    await repos.passenger.addTraveler({
      firstName: "Kareem",
      lastName: "Masri",
      dob: "2015-08-20",
      nationality: "Palestinian",
      document: "P99887766",
    });

    const clock = () => "2026-09-18";
    const customers = await repos.customerDirectory.listCustomers({ clock });

    // Should have:
    // 1. Account customer for huda.masri@example.com (owns ONLY bookingA)
    // 2. Guest customer for huda.masri@example.com (unowned bookingB)
    // 3. Guest customer for separate.guest@example.com (unowned bookingC)
    assert.equal(customers.length, 3);

    const accountCustomer = customers.find((c) => c.type === "account");
    assert.ok(accountCustomer);
    assert.equal(accountCustomer.name, "Huda Masri");
    assert.equal(accountCustomer.email, "huda.masri@example.com");
    assert.equal((accountCustomer as unknown as Record<string, unknown>).status, undefined, "Invented status must not exist");
    assert.equal((accountCustomer as unknown as Record<string, unknown>).language, undefined, "Invented language must not exist");
    assert.equal(accountCustomer.bookingCount, 1, "Only bookingA has canonical account ownership");
    assert.deepEqual(accountCustomer.refs, ["GZA-OWN1"]);
    assert.equal(accountCustomer.upcomingCount, 1);
    assert.equal(accountCustomer.travelerCount, 1);

    const guestHuda = customers.find((c) => c.type === "guest" && c.email === "huda.masri@example.com");
    assert.ok(guestHuda, "Unowned booking with matching contact email projects as guest");
    assert.equal(guestHuda.bookingCount, 1);
    assert.deepEqual(guestHuda.refs, ["GZA-GST1"]);
    assert.equal((guestHuda as unknown as Record<string, unknown>).status, undefined, "Invented status must not exist");

    const guestSeparate = customers.find((c) => c.type === "guest" && c.email === "separate.guest@example.com");
    assert.ok(guestSeparate);
    assert.equal(guestSeparate.name, "Layla Zaid");
    assert.equal((guestSeparate as unknown as Record<string, unknown>).status, undefined, "Invented status must not exist");
    assert.equal(guestSeparate.travelerCount, 0);
  });

  it("retrieves full customer details by route ID with detached results", async () => {
    const booking = makeSyntheticBooking({
      ref: "GZA-AHM1",
      ownerEmail: "ahmad@example.com",
      contact: { email: "ahmad@example.com", phone: "+970 59 777 6666" },
    });
    const storage = createMockStorage();
    const repos = createRepositories({
      storage,
      inMemoryOnly: true,
      initialData: {
        schemaVersion: 1,
        bookings: [booking],
        overrides: {},
      },
    });

    await repos.passenger.signIn("ahmad@example.com", "Ahmad", "K");

    const accountRouteId = customerToRouteId("account", "ahmad@example.com");
    const detail = await repos.customerDirectory.getCustomerById(accountRouteId);

    assert.ok(detail !== null);
    assert.equal(detail.id, accountRouteId);
    assert.equal(detail.name, "Ahmad K");
    assert.equal(detail.email, "ahmad@example.com");
    assert.equal(detail.type, "account");
    assert.equal(detail.bookings.length, 1);
    assert.ok(detail.account !== null);

    // Detached mutation safety
    detail.bookings[0].ref = "MUTATED";
    const freshDetail = await repos.customerDirectory.getCustomerById(accountRouteId);
    assert.equal(freshDetail?.bookings[0].ref, "GZA-AHM1", "Original repository data must remain untouched");
  });

  it("evaluates upcoming vs past vs cancelled with deterministic station clock", () => {
    const clock = "2026-09-18";

    const futureBooking = makeSyntheticBooking({
      status: "confirmed",
      outbound: { ...makeSyntheticBooking().outbound, date: "2026-09-25" },
    });
    assert.equal(isBookingUpcoming(futureBooking, clock), true);

    const pastBooking = makeSyntheticBooking({
      status: "confirmed",
      outbound: { ...makeSyntheticBooking().outbound, date: "2026-09-10" },
    });
    assert.equal(isBookingUpcoming(pastBooking, clock), false);

    const cancelledFutureBooking = makeSyntheticBooking({
      status: "cancelled",
      outbound: { ...makeSyntheticBooking().outbound, date: "2026-09-25" },
    });
    assert.equal(isBookingUpcoming(cancelledFutureBooking, clock), false);
  });

  it("subscribes to both passenger and booking changes", async () => {
    const booking1 = makeSyntheticBooking({ ref: "GZA-NOTIF1", status: "confirmed" });
    const booking2 = makeSyntheticBooking({ ref: "GZA-NOTIF2", status: "confirmed" });
    const storage = createMockStorage();
    const repos = createRepositories({
      storage,
      inMemoryOnly: true,
      initialData: {
        schemaVersion: 1,
        bookings: [booking1, booking2],
        overrides: {},
      },
    });

    let notifications = 0;
    const unsubscribe = repos.customerDirectory.subscribe(() => {
      notifications++;
    });

    // Mutate passenger repo
    await repos.passenger.signIn("sub.test@example.com", "Sub", "Test");
    assert.equal(notifications, 1, "Passenger mutation must trigger notification");

    // Mutate booking repo via real command
    await repos.booking.cancel("GZA-NOTIF1");
    assert.equal(notifications, 2, "Booking mutation must trigger notification");

    unsubscribe();
    await repos.booking.cancel("GZA-NOTIF2");
    assert.equal(notifications, 2, "Unsubscribed listener must not receive further notifications");
  });
});

describe("Passenger Account Identity Transaction Locking & Races", () => {
  it("rejects updateAccount inside transaction when account email does not match expectedEmail", async () => {
    const storage = createMockStorage();
    const coordinator = new PassengerStorageCoordinator({ storage });
    const repo = new LocalPassengerRepository(coordinator);

    await repo.signIn("active.user@example.com", "Active", "User");
    let notifyCount = 0;
    repo.subscribe(() => {
      notifyCount++;
    });

    // Attempt to update with a mismatched expectedEmail
    const result = await repo.updateAccount(
      { phone: "+970599112233" },
      { expectedEmail: "other.user@example.com" },
    );

    assert.equal(result, null, "Must return null when target email does not match");
    assert.equal(notifyCount, 0, "Must emit zero subscriber notifications on rejection");

    // Verify stored account phone was NOT modified
    const current = await repo.getAccount();
    assert.equal(current?.phone, "");
  });

  it("handles two-coordinator cross-tab race: second tab switches account, first tab write rejected with zero writes", async () => {
    const sharedStorage = createMockStorage();

    // Tab 1 coordinator & repo
    const coord1 = new PassengerStorageCoordinator({ storage: sharedStorage });
    const repo1 = new LocalPassengerRepository(coord1);

    // User A signs in
    await repo1.signIn("usera@example.com", "User", "A");

    // Tab 2 coordinator & repo sharing the exact same storage
    const coord2 = new PassengerStorageCoordinator({ storage: sharedStorage });
    const repo2 = new LocalPassengerRepository(coord2);

    let tab1Notified = false;
    coord1.subscribe(() => {
      tab1Notified = true;
    });

    // Tab 2 switches local account to User B
    await repo2.signIn("userb@example.com", "User", "B");
    tab1Notified = false; // reset notification tracker

    // Tab 1 now attempts to edit User A's phone, specifying expectedEmail: usera@example.com
    const receipt = await repo1.updateAccountWithReceipt(
      { phone: "+970599888888" },
      { expectedEmail: "usera@example.com" },
    );

    assert.equal(receipt.account, null, "Must reject write inside transaction reread");
    assert.equal(receipt.changed, false, "Must report changed: false");
    assert.equal(tab1Notified, false, "Must emit zero subscriber notifications");

    // Verify User B's account in storage remains intact and was NOT overwritten
    const coordCheck = new PassengerStorageCoordinator({ storage: sharedStorage });
    const repoCheck = new LocalPassengerRepository(coordCheck);
    const finalAccount = await repoCheck.getAccount();
    assert.equal(finalAccount?.email, "userb@example.com");
    assert.equal(finalAccount?.phone, "");
  });

  it("preserves public account updates without expectedEmail", async () => {
    const storage = createMockStorage();
    const coordinator = new PassengerStorageCoordinator({ storage });
    const repo = new LocalPassengerRepository(coordinator);

    await repo.signIn("public.user@example.com", "Public", "User");
    const updated = await repo.updateAccount({ phone: "+970599000111" });

    assert.ok(updated);
    assert.equal(updated.phone, "+970599000111");
  });

  it("rejects identity-checked update with StorageCommitError on corrupt canonical storage '{broken' with zero writes", async () => {
    const storage = createMockStorage();
    const coordinator = new PassengerStorageCoordinator({ storage });
    const repo = new LocalPassengerRepository(coordinator);

    // Initial sign-in succeeds and populates storage
    await repo.signIn("corrupt.check@example.com", "Corrupt", "Check");
    assert.equal((await repo.getAccount())?.email, "corrupt.check@example.com");

    // Foreign tab or storage corruption writes '{broken' into storage
    storage.setItem(PASSENGER_STORAGE_KEY, "{broken");

    let notified = false;
    coordinator.subscribe(() => {
      notified = true;
    });

    let rawWriteAttempted = false;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, val: string) => {
      rawWriteAttempted = true;
      originalSetItem(key, val);
    };

    // Attempt identity-checked update with expectedEmail
    await assert.rejects(
      async () => {
        await repo.updateAccountWithReceipt(
          { phone: "+970599999999" },
          { expectedEmail: "corrupt.check@example.com" },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof StorageCommitError);
        assert.match(
          (err as Error).message,
          /Cannot reread canonical passenger state: storage is unavailable or corrupt/,
        );
        return true;
      },
    );

    // Assert: zero storage writes, '{broken' preserved intact, zero notifications
    assert.equal(rawWriteAttempted, false, "Must not attempt to write to storage");
    assert.equal(storage.getItem(PASSENGER_STORAGE_KEY), "{broken", "Must retain raw corruption intact");
    assert.equal(notified, false, "Must emit zero subscriber notifications");
  });

  it("rejects identity-checked update with StorageCommitError when storage.getItem throws with zero writes", async () => {
    let setItemCalled = false;
    const throwingStorage: Storage = {
      getItem(key: string) {
        if (key === PASSENGER_STORAGE_KEY) {
          throw new Error("SecurityError: Access to localStorage is denied");
        }
        return null;
      },
      setItem() {
        setItemCalled = true;
      },
      removeItem() {},
      clear() {},
      key() {
        return null;
      },
      get length() {
        return 0;
      },
    };

    const coordinator = new PassengerStorageCoordinator({ storage: throwingStorage });
    const repo = new LocalPassengerRepository(coordinator);

    await assert.rejects(
      async () => {
        await repo.updateAccountWithReceipt(
          { phone: "+970599111222" },
          { expectedEmail: "throwing@example.com" },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof StorageCommitError);
        assert.match(
          (err as Error).message,
          /Cannot reread canonical passenger state: storage is unavailable or corrupt/,
        );
        return true;
      },
    );

    assert.equal(setItemCalled, false, "Must not call setItem when getItem throws");
  });

  it("returns null account and changed: false when canonical account is missing in storage (not resurrected)", async () => {
    const storage = createMockStorage();
    const coordinator = new PassengerStorageCoordinator({ storage });
    const repo = new LocalPassengerRepository(coordinator);

    // Initial sign-in
    await repo.signIn("missing.check@example.com", "Missing", "Check");

    // Canonical storage is cleared or account set to null (e.g. sign-out by other tab)
    storage.setItem(
      PASSENGER_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, account: null, travelers: [] }),
    );

    let notifyCount = 0;
    coordinator.subscribe(() => {
      notifyCount++;
    });

    let writes = 0;
    const origSet = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => {
      writes++;
      origSet(k, v);
    };

    const receipt = await repo.updateAccountWithReceipt(
      { phone: "+970599000000" },
      { expectedEmail: "missing.check@example.com" },
    );

    assert.equal(receipt.account, null, "Must return null account");
    assert.equal(receipt.changed, false, "Must report changed: false");
    assert.equal(writes, 0, "Must perform zero storage writes");
    assert.equal(notifyCount, 0, "Must emit zero subscriber notifications");

    // Verify account was NOT resurrected in storage
    const stateInStore = JSON.parse(storage.getItem(PASSENGER_STORAGE_KEY)!);
    assert.equal(stateInStore.account, null, "Account must not be resurrected");
  });

  it("reports changed: false and skips write on no-op identical update with expectedEmail", async () => {
    const storage = createMockStorage();
    const coordinator = new PassengerStorageCoordinator({ storage });
    const repo = new LocalPassengerRepository(coordinator);

    await repo.signIn("noop.user@example.com", "Noop", "User");
    await repo.updateAccount({ phone: "+970599111111" });

    let writes = 0;
    const origSet = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => {
      writes++;
      origSet(k, v);
    };

    let notified = false;
    coordinator.subscribe(() => {
      notified = true;
    });

    // Exact same phone update
    const receipt = await repo.updateAccountWithReceipt(
      { phone: "+970599111111" },
      { expectedEmail: "noop.user@example.com" },
    );

    assert.ok(receipt.account);
    assert.equal(receipt.changed, false, "Must report changed: false for identical values");
    assert.equal(writes, 0, "Must perform zero writes for identical values");
    assert.equal(notified, false, "Must not notify subscribers on no-op");
  });
});



describe("identity-bound administrative booking claims", () => {
  const account = { email: "claim@example.com", firstName: "Claim", lastName: "Example", phone: "+970599000000", seatPreference: "none", mealPreference: "standard", newsletter: false };
  const envelope = (email = account.email) => JSON.stringify({ schemaVersion: 1, account: { ...account, email }, travelers: [] });
  for (const raw of [null, "{broken", envelope("other@example.com")]) {
    it(`rejects absent, corrupt or shifted canonical account: ${raw}`, async () => {
      const storage = createMockStorage({ [PASSENGER_STORAGE_KEY]: envelope() });
      const coordinator = new PassengerStorageCoordinator({ storage });
      const repo = new LocalPassengerRepository(coordinator);
      if (raw === null) storage.removeItem(PASSENGER_STORAGE_KEY); else storage.setItem(PASSENGER_STORAGE_KEY, raw);
      let commands = 0, notices = 0;
      repo.subscribe(() => notices++);
      await assert.rejects(repo.withAccountIdentity(account.email, async () => { commands++; }), StorageCommitError);
      assert.equal(commands, 0); assert.equal(notices, 0);
      assert.equal(storage.getItem(PASSENGER_STORAGE_KEY), raw);
    });
  }
  it("rereads account after lock acquisition before claiming; zero claim or audit on a shifted identity", async () => {
    const storage = createMockStorage({ [PASSENGER_STORAGE_KEY]: envelope() });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const locks = { request: async (_name: string, command: () => Promise<unknown>) => { await held; return command(); } } as unknown as LockManager;
    const repo = new LocalPassengerRepository(new PassengerStorageCoordinator({ storage, locks }));
    let commands = 0;
    const claim = repo.withAccountIdentity(account.email, async () => { commands++; return "claimed"; });
    storage.setItem(PASSENGER_STORAGE_KEY, envelope("other@example.com"));
    release();
    await assert.rejects(claim, StorageCommitError);
    assert.equal(commands, 0);
    assert.equal(storage.getItem(PASSENGER_STORAGE_KEY), envelope("other@example.com"));
  });
  it("holds the passenger command boundary during booking claim without writing passenger storage", async () => {
    const storage = createMockStorage({ [PASSENGER_STORAGE_KEY]: envelope() });
    const repo = new LocalPassengerRepository(new PassengerStorageCoordinator({ storage }));
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const claim = repo.withAccountIdentity(" CLAIM@example.com ", async () => { entered(); await held; return "claimed"; });
    await started;
    const signOut = repo.signOut();
    await Promise.resolve();
    assert.equal(storage.getItem(PASSENGER_STORAGE_KEY), envelope());
    release();
    assert.equal(await claim, "claimed");
    await signOut;
    assert.equal((await repo.getAccount()), null);
  });
});
