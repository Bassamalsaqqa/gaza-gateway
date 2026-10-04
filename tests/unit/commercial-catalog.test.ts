import { LocalPassengerRepository } from "../../src/lib/passenger/repository.ts";
import { PassengerStorageCoordinator, StorageCommitError as PassengerStorageCommitError } from "../../src/lib/passenger/storage.ts";
import { commercialCatalogKeys } from "../../src/lib/commercial/keys.ts";
import { LocalBookingDraftRepository } from "../../src/lib/booking-draft/repository.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LocalCommercialCatalogRepository } from "../../src/lib/commercial/repository.ts";
import {
  CommercialStorageCoordinator,
  COMMERCIAL_STORAGE_KEY,
} from "../../src/lib/commercial/storage.ts";
import { CommercialCatalogError } from "../../src/lib/commercial/types.ts";
import { seedCommercialCatalog, legacyPricingBasis } from "../../src/lib/commercial/seed.ts";
import { parseCommercialCatalog, parsePricingSnapshot } from "../../src/lib/commercial/schema.ts";
import {
  pricingSnapshot,
  calculateBookingTotal,
  resolveBookingPricing,
  validateServiceSelections,
} from "../../src/lib/commercial/pricing.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import {
  RepoStorageCoordinator,
  REPO_STORAGE_KEY,
  StorageCommitError,
} from "../../src/lib/repositories/storage.ts";
import { normalizeBooking, type BookingCreateInput } from "../../src/lib/domain/booking.ts";
import {
  departuresOn,
  todayISO,
  addDaysISO,
  isSeatAvailable,
  cabinZone,
} from "../../src/lib/data.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { sanitizePassengerAccount } from "../../src/lib/passenger/domain.ts";

function storageRig(raw?: string) {
  const map = new Map<string, string>();
  if (raw !== undefined) map.set(COMMERCIAL_STORAGE_KEY, raw);
  let fail = false,
    writes = 0;
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw new Error("quota");
      writes++;
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  const coordinator = new CommercialStorageCoordinator({ storage });
  const repo = new LocalCommercialCatalogRepository(coordinator);
  let events = 0;
  repo.subscribe(() => events++);
  return {
    storage,
    repo,
    coordinator,
    counts: () => ({ writes, events }),
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}
function candidate(): BookingCreateInput {
  const flight = departuresOn(addDaysISO(todayISO(), 5)).find(
    (f) => f.status === "Scheduled" && f.seatsLeft >= 2,
  )!;
  return {
    criteria: {
      tripType: "oneway",
      origin: "GZA",
      destination: flight.destinationCode,
      departDate: flight.date,
      returnDate: "",
      adults: 1,
      children: 0,
      infants: 0,
      cabin: "economy",
    },
    outbound: flight,
    inbound: null,
    fareId: "classic",
    passengers: [
      {
        type: "adult",
        firstName: "Catalog",
        lastName: "Audit",
        dob: "1980-01-01",
        nationality: "PS",
        document: "CAT-DOC",
      },
    ],
    seats: {},
    extras: { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] },
    contact: { email: "catalog@example.ps", phone: "" },
    total: 999999,
    submissionId: "catalog-a",
    channel: "web",
  };
}
function seatsFor(input: BookingCreateInput, cabin = "economy") {
  const result: string[] = [];
  const zone = cabinZone(cabin);
  for (let row = zone.firstRow; row <= zone.lastRow; row++)
    for (const letter of ["A", "B", "C", "D", "E", "F"])
      if (isSeatAvailable(input.outbound.id, row, letter)) result.push(`${row}${letter}`);
  return result;
}
function bookingRig() {
  const r = storageRig();
  r.storage.setItem(
    REPO_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, bookings: [], flightOverrides: {} }),
  );
  const booking = new LocalBookingRepository(new RepoStorageCoordinator({ storage: r.storage }), {
    commercial: r.repo,
  });
  return { ...r, booking };
}
describe("6B2A catalog authority and transactional storage", () => {
  test("missing key exposes detached deterministic seeds without a read write", async () => {
    const r = storageRig();
    const a = await r.repo.get();
    assert.deepEqual(a.catalog, seedCommercialCatalog());
    a.catalog.fares[0]!.multiplier = 7;
    assert.equal((await r.repo.get()).catalog.fares[0]!.multiplier, 1);
    assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY), null);
    assert.deepEqual(r.counts(), { writes: 0, events: 0 });
  });
  test("valid persisted catalog wins and has exact revision", async () => {
    const c = seedCommercialCatalog();
    c.baggage.extraBagPrice = 99;
    const r = storageRig(JSON.stringify({ schemaVersion: 1, revision: 12, catalog: c }));
    assert.equal((await r.repo.get()).revision, 12);
    assert.equal((await r.repo.get()).catalog.baggage.extraBagPrice, 99);
  });
  for (const raw of [
    "{bad",
    JSON.stringify({ schemaVersion: 2, revision: 0, catalog: seedCommercialCatalog() }),
    JSON.stringify({ schemaVersion: 1, revision: 1, catalog: null }),
  ])
    test(`corrupt present state fails reads and never overwrites (${raw.slice(0, 30)})`, async () => {
      const r = storageRig(raw);
      await assert.rejects(r.repo.get(), CommercialCatalogError);
      await assert.rejects(r.repo.updateBaggage({ extraBagPrice: 99 }), CommercialCatalogError);
      assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY), raw);
      assert.deepEqual(r.counts(), { writes: 0, events: 0 });
    });
  test("quota rollback has zero success events and retains retry", async () => {
    const r = storageRig();
    const before = await r.repo.get();
    r.fail();
    await assert.rejects(r.repo.updateFare("classic", { multiplier: 2 }), StorageCommitError);
    assert.deepEqual(await r.repo.get(), before);
    assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY), null);
    assert.deepEqual(r.counts(), { writes: 0, events: 0 });
    r.recover();
    assert.equal((await r.repo.updateFare("classic", { multiplier: 2 })).revision, 1);
    assert.deepEqual(r.counts(), { writes: 1, events: 1 });
  });
  test("no-op catalog command neither writes nor notifies", async () => {
    const r = storageRig();
    await r.repo.updateBaggage({ extraBagPrice: 35 });
    assert.deepEqual(r.counts(), { writes: 0, events: 0 });
  });
  test("rapid same-instance writes retain all independent changes", async () => {
    const r = storageRig();
    await Promise.all([
      r.repo.updateFare("classic", { multiplier: 2 }),
      r.repo.updateBaggage({ extraBagPrice: 90 }),
      r.repo.updateCabinPricing("premium", { multiplier: 2 }),
    ]);
    const c = await r.repo.get();
    assert.equal(c.revision, 3);
    assert.equal(c.catalog.fares[1]!.multiplier, 2);
    assert.equal(c.catalog.baggage.extraBagPrice, 90);
    assert.equal(c.catalog.cabins[1]!.multiplier, 2);
  });
  test("independent coordinators reread inside shared origin lock", async () => {
    const r = storageRig();
    let queue = Promise.resolve();
    let locksEntered = 0;
    const locks = {
      request: (_name: string, _opts: unknown, fn: () => unknown) => {
        const result = queue.then(() => {
          locksEntered++;
          return fn();
        });
        queue = result.then(() => {});
        return result;
      },
    } as unknown as Pick<LockManager, "request">;
    const a = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ storage: r.storage, locks }),
    );
    const b = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ storage: r.storage, locks }),
    );
    await Promise.all([
      a.updateFare("classic", { multiplier: 2.2 }),
      b.updateBaggage({ extraBagPrice: 83 }),
    ]);
    assert.equal(locksEntered, 2);
    const c = await a.get();
    assert.equal(c.catalog.fares[1]!.multiplier, 2.2);
    assert.equal(c.catalog.baggage.extraBagPrice, 83);
    assert.equal(c.revision, 2);
  });
  test("memory/Studio-style isolated state never writes browser storage", async () => {
    const r = storageRig("{corrupt");
    const c = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ storage: r.storage, inMemoryOnly: true }),
    );
    await c.updateBaggage({ extraBagPrice: 44 });
    assert.equal((await c.get()).catalog.baggage.extraBagPrice, 44);
    assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY), "{corrupt");
  });
});
describe("6B2A catalog validation, structural anchors and lifecycle", () => {
  for (const [label, edit] of [
    [
      "Essential anchor",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.fares[0]!.multiplier = 2;
      },
    ],
    [
      "Economy anchor",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.cabins[0]!.multiplier = 2;
      },
    ],
    [
      "missing fare",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.fares.pop();
      },
    ],
    [
      "duplicate fare identity",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.fares[1]!.id = "essential";
      },
    ],
    [
      "no active cabin fare",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.fares.forEach((f) => (f.allowedCabins = ["economy"]));
      },
    ],
    [
      "unknown cabin",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.fares[0]!.allowedCabins = ["first" as "economy"];
      },
    ],
    [
      "invalid baggage",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.baggage.checkedKg = 99;
      },
    ],
    [
      "blank Arabic label",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.meals[0]!.label.ar = "";
      },
    ],
    [
      "missing default",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.defaultMealId = "missing";
      },
    ],
    [
      "retired default",
      (c: ReturnType<typeof seedCommercialCatalog>) => {
        c.meals[0]!.active = false;
      },
    ],
  ] as const)
    test(`rejects ${label}`, () => {
      const c = seedCommercialCatalog();
      edit(c);
      assert.throws(() => parseCommercialCatalog(c), CommercialCatalogError);
    });
  test("fare/cabin identities cannot be edited through crafted patch", async () => {
    const r = storageRig();
    await assert.rejects(
      r.repo.updateFare("classic", { id: "flex" } as never),
      CommercialCatalogError,
    );
    await assert.rejects(
      r.repo.updateCabinPricing("premium", { id: "economy" } as never),
      CommercialCatalogError,
    );
    assert.deepEqual(r.counts(), { writes: 0, events: 0 });
  });
  test("label editing, ordering, default and retirement survive reload without erasure", async () => {
    const r = storageRig();
    const m = await r.repo.createMeal({
      id: "meal-a",
      label: { en: "New meal", ar: "وجبة جديدة" },
      active: true,
      order: 4,
    });
    await r.repo.updateMeal(m.id, { label: { en: "Renamed", ar: "اسم جديد" } });
    await r.repo.setDefaultMeal(m.id);
    await r.repo.updateMeal("standard", { active: false });
    await r.repo.reorderMeals([m.id, "child", "diabetic", "vegetarian", "standard"]);
    const loaded = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ storage: r.storage }),
    );
    const c = await loaded.get();
    assert.equal(c.catalog.defaultMealId, m.id);
    assert.equal(c.catalog.meals.find((x) => x.id === "standard")!.active, false);
    assert.equal(c.catalog.meals.find((x) => x.id === m.id)!.order, 0);
    assert.equal(c.catalog.meals.length, 5);
    assert.equal(c.catalog.meals.find((x) => x.id === m.id)!.label.en, "Renamed");
  });
  test("cannot retire current default until another active default is chosen", async () => {
    const r = storageRig();
    await assert.rejects(r.repo.updateMeal("standard", { active: false }), CommercialCatalogError);
    await r.repo.setDefaultMeal("vegetarian");
    await r.repo.updateMeal("standard", { active: false });
    await assert.rejects(r.repo.setDefaultMeal("standard"), CommercialCatalogError);
  });
  test("assistance create/update/retire/reorder keep immutable IDs", async () => {
    const r = storageRig();
    await r.repo.createAssistance({
      id: "assistance-a",
      label: { en: "Support", ar: "دعم" },
      active: true,
      order: 4,
    });
    await r.repo.updateAssistance("assistance-a", {
      active: false,
      label: { en: "Retired support", ar: "دعم متوقف" },
    });
    await r.repo.reorderAssistance(["assistance-a", "minor", "hearing", "visual", "wheelchair"]);
    const c = await r.repo.get();
    assert.equal(c.catalog.assistance.length, 5);
    assert.equal(c.catalog.assistance.find((a) => a.id === "assistance-a")!.active, false);
  });
  test("creation identity retry is idempotent and conflicting identity fails", async () => {
    const r = storageRig();
    const x = { id: "meal-stable", label: { en: "Stable", ar: "ثابت" }, active: true, order: 4 };
    await r.repo.createMeal(x);
    const count = r.counts();
    await r.repo.createMeal(x);
    assert.deepEqual(r.counts(), count);
    await assert.rejects(
      r.repo.createMeal({ ...x, label: { en: "Changed", ar: "متغير" } }),
      CommercialCatalogError,
    );
  });
});
describe("6B2A booking snapshot authority and no retroactive repricing", () => {
  test("new creation independently samples catalog and ignores forged caller price/snapshot", async () => {
    const r = bookingRig();
    await r.repo.updateFare("classic", { multiplier: 2 });
    const d = candidate();
    const b = await r.booking.create({
      ...d,
      pricingSnapshot: { fareMultiplier: 99 },
    } as BookingCreateInput);
    assert.equal(b.pricingSnapshot!.fareMultiplier, 2);
    assert.equal(b.pricingSnapshot!.catalogRevision, 1);
    assert.equal(b.total, calculateBookingTotal(b, b.pricingSnapshot!).total);
    assert.notEqual(b.total, d.total);
  });
  for (const channel of ["web", "desk"] as const)
    test(`${channel} uses same price policy, tax and seat/extras charges`, async () => {
      const r = bookingRig();
      const d = candidate();
      d.channel = channel;
      const seat = seatsFor(d).find((s) => [11, 12].includes(Number(s.replace(/\D/g, ""))))!;
      d.seats = { "out-0": seat };
      const b = await r.booking.create(d);
      assert.equal(
        b.total,
        Math.round(d.outbound.basePrice * 1.35) +
          Math.round(Math.round(d.outbound.basePrice * 1.35) * 0.14) +
          18 +
          35,
      );
      assert.equal(b.channel, channel);
    });
  test("old seats, Extras and check-in use revision A; new PNR uses revision B; both reload correctly", async () => {
    const r = bookingRig(),
      d = candidate();
    d.criteria.cabin = "premium";
    const a = await r.booking.create(d);
    const basis = structuredClone(a.pricingSnapshot!);
    await r.repo.updateFare("classic", { multiplier: 2.5, checkedBags: 3 });
    await r.repo.updateCabinPricing("premium", { multiplier: 3 });
    await r.repo.updateBaggage({ extraBagPrice: 99, checkedKg: 30 });
    const seat = seatsFor(d, "premium")[0]!;
    const seated = await r.booking.updateSeats(a.ref, { "out-0": seat });
    assert.deepEqual(seated.pricingSnapshot, basis);
    assert.equal(seated.total, calculateBookingTotal(seated, basis).total);
    const extras = await r.booking.updateExtras(a.ref, {
      pax: [{ extraBags: 2, meal: "standard", assistance: [] }],
    });
    assert.deepEqual(extras.pricingSnapshot, basis);
    assert.equal(extras.total, calculateBookingTotal(extras, basis).total);
    const checked = await r.booking.completeCheckIn({
      ref: a.ref,
      leg: "out",
      selectedPaxIndexes: [0],
      documents: { 0: "CAT-DOC" },
      seats: { 0: seat },
      now: flightDepartureEpoch(d.outbound)! - 3 * 60 * 60 * 1000,
    });
    assert.deepEqual(checked.pricingSnapshot, basis);
    assert.equal(checked.total, calculateBookingTotal(checked, basis).total);
    const b = await r.booking.create({ ...d, submissionId: "catalog-b" });
    assert.equal(b.pricingSnapshot!.fareMultiplier, 2.5);
    assert.equal(b.pricingSnapshot!.cabinMultiplier, 3);
    assert.equal(b.pricingSnapshot!.extraBagPrice, 99);
    assert.equal(b.pricingSnapshot!.checkedBagKg, 30);
    assert.ok(b.pricingSnapshot!.catalogRevision > basis.catalogRevision);
    const reload = new LocalBookingRepository(new RepoStorageCoordinator({ storage: r.storage }), {
      commercial: r.repo,
    });
    assert.deepEqual((await reload.getByRef(a.ref))!.pricingSnapshot, basis);
    assert.deepEqual((await reload.getByRef(b.ref))!.pricingSnapshot, b.pricingSnapshot);
    assert.equal((await reload.getByRef(a.ref))!.total, checked.total);
  });
  test("legacy read does not reprice/write or seal snapshot; a real mutation seals exact frozen legacy basis", async () => {
    const r = bookingRig();
    const b = await r.booking.create(candidate());
    delete b.pricingSnapshot;
    b.total = 777;
    r.storage.setItem(
      REPO_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, bookings: [b], flightOverrides: {} }),
    );
    await r.repo.updateFare("classic", { multiplier: 3 });
    await r.repo.updateBaggage({ extraBagPrice: 123 });
    const raw = r.storage.getItem(REPO_STORAGE_KEY);
    const loaded = new LocalBookingRepository(new RepoStorageCoordinator({ storage: r.storage }), {
      commercial: r.repo,
    });
    const read = await loaded.getByRef(b.ref);
    assert.equal(read!.total, 777);
    assert.equal(read!.pricingSnapshot, undefined);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    const changed = await loaded.updateExtras(b.ref, {
      pax: [{ extraBags: 2, meal: "standard", assistance: [] }],
    });
    assert.deepEqual(changed.pricingSnapshot, legacyPricingBasis("classic", "economy"));
    assert.equal(
      changed.total,
      calculateBookingTotal(changed, legacyPricingBasis("classic", "economy")).total,
    );
  });
  test("snapshot normalization preserves validated basis and rejects corrupted identity", async () => {
    const r = bookingRig();
    const b = await r.booking.create(candidate());
    assert.deepEqual(normalizeBooking(b)!.pricingSnapshot, b.pricingSnapshot);
    assert.equal(
      normalizeBooking({ ...b, pricingSnapshot: { ...b.pricingSnapshot, fareId: "flex" } }),
      null,
    );
    assert.equal(parsePricingSnapshot({ version: 2 }), null);
  });
  test("inactive/unsupported fares and retired services cannot be newly created", async () => {
    const r = bookingRig();
    await r.repo.updateFare("classic", { active: false });
    await assert.rejects(
      r.booking.create(candidate()),
      (e: unknown) => e instanceof CommercialCatalogError && e.reason === "fare_unavailable",
    );
    await r.repo.updateFare("classic", { active: true, allowedCabins: ["economy"] });
    const d = candidate();
    d.criteria.cabin = "premium";
    await assert.rejects(r.booking.create(d), CommercialCatalogError);
    await r.repo.setDefaultMeal("vegetarian");
    await r.repo.updateMeal("standard", { active: false });
    await assert.rejects(
      r.booking.create(candidate()),
      (e: unknown) => e instanceof CommercialCatalogError && e.reason === "service_unavailable",
    );
  });
  test("stored retired options remain on original passenger, active replacement works, new retired options cannot be introduced", async () => {
    const r = bookingRig();
    const a = await r.booking.create(candidate());
    await r.repo.setDefaultMeal("vegetarian");
    await r.repo.updateMeal("standard", { active: false });
    await r.repo.updateAssistance("wheelchair", { active: false });
    const retained = await r.booking.updateExtras(a.ref, {
      pax: [{ extraBags: 2, meal: "standard", assistance: [] }],
    });
    assert.equal(retained.extras.pax[0]!.meal, "standard");
    await assert.rejects(
      r.booking.updateExtras(a.ref, {
        pax: [{ extraBags: 2, meal: "standard", assistance: ["wheelchair"] }],
      }),
      CommercialCatalogError,
    );
    const replaced = await r.booking.updateExtras(a.ref, {
      pax: [{ extraBags: 2, meal: "vegetarian", assistance: [] }],
    });
    assert.equal(replaced.extras.pax[0]!.meal, "vegetarian");
    await assert.rejects(
      r.booking.updateExtras(a.ref, { pax: [{ extraBags: 2, meal: "standard", assistance: [] }] }),
      CommercialCatalogError,
    );
  });
  test("retained assistance and unknown historical IDs resolve/validate without substitution", () => {
    const c = seedCommercialCatalog();
    c.assistance[0]!.active = false;
    const old = { pax: [{ extraBags: 0, meal: "old-meal", assistance: ["wheelchair"] }] };
    assert.doesNotThrow(() => validateServiceSelections(old, c, old));
    assert.throws(() => validateServiceSelections(old, c), CommercialCatalogError);
    assert.equal(
      sanitizePassengerAccount({ email: "a@example.ps", mealPreference: "meal-012345" })!
        .mealPreference,
      "meal-012345",
    );
  });
  test("Extras genuine no-op has no write/event and does not seal legacy state", async () => {
    const r = bookingRig();
    const a = await r.booking.create(candidate());
    let events = 0;
    r.booking.subscribe(() => events++);
    const raw = r.storage.getItem(REPO_STORAGE_KEY);
    await r.booking.updateExtras(a.ref, a.extras);
    assert.equal(events, 0);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
  });
  test("booking storage failure cannot adopt price/snapshot/services and retry uses same submission", async () => {
    const r = bookingRig();
    const raw = r.storage.getItem(REPO_STORAGE_KEY);
    r.fail();
    await assert.rejects(r.booking.create(candidate()), StorageCommitError);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    r.recover();
    const a = await r.booking.create(candidate());
    const b = await r.booking.create(candidate());
    assert.equal(a.ref, b.ref);
    assert.equal((await r.booking.list()).length, 1);
  });
});

describe("6B2A integration, preferences and source authority guards", () => {
  test("query keys are deterministic and registry shares one catalog with Booking, Draft and Passenger", () => {
    assert.deepEqual(commercialCatalogKeys.current(), ["commercial-catalog", "current"]);
    const source = readFileSync("src/lib/repositories/registry.ts", "utf8");
    assert.match(source, /new LocalBookingRepository\(coordinator,\s*\{ commercial \}\)/);
    assert.match(source, /new LocalPassengerRepository\(passengerCoordinator, commercial\)/);
    assert.match(source, /new LocalBookingDraftRepository\(bookingDraftCoordinator, commercial\)/);
    assert.match(source, /value\.commercial\.subscribe/);
    assert.match(source, /queryKey: commercialCatalogKeys\.all/);
    assert.match(source, /createRepositories\(\{ inMemoryOnly: true \}\)/);
  });
  test("storage events invalidate only matching origin storage; read adopts canonical revision without an echo write", async () => {
    const r = storageRig();
    const target = new EventTarget();
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "" },
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
      },
    });
    const coordinator = new CommercialStorageCoordinator({ storage: r.storage });
    let events = 0;
    coordinator.subscribe(() => events++);
    try {
      const c = seedCommercialCatalog();
      c.baggage.extraBagPrice = 80;
      r.storage.setItem(
        COMMERCIAL_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, revision: 7, catalog: c }),
      );
      const writes = r.counts().writes;
      const unrelated = new Event("storage");
      Object.assign(unrelated, { key: "gza.settings.draft.v1", storageArea: r.storage });
      target.dispatchEvent(unrelated);
      assert.equal(events, 0);
      const update = new Event("storage");
      Object.assign(update, { key: COMMERCIAL_STORAGE_KEY, storageArea: r.storage });
      target.dispatchEvent(update);
      assert.equal(events, 1);
      assert.equal(coordinator.read().revision, 7);
      assert.equal(r.counts().writes, writes);
      coordinator.destroy();
      target.dispatchEvent(update);
      assert.equal(events, 1);
    } finally {
      coordinator.destroy();
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
  test("new account/default draft use current default; preference retirement is retained but cannot be newly introduced", async () => {
    const r = storageRig();
    await r.repo.setDefaultMeal("vegetarian");
    const passenger = new LocalPassengerRepository(
      new PassengerStorageCoordinator({ inMemoryOnly: true }),
      r.repo,
    );
    assert.equal((await passenger.signIn("preference@example.ps")).mealPreference, "vegetarian");
    await r.repo.setDefaultMeal("standard");
    await r.repo.updateMeal("vegetarian", { active: false });
    assert.equal(
      (await passenger.updateAccount({ mealPreference: "vegetarian" }))!.mealPreference,
      "vegetarian",
    );
    await passenger.updateAccount({ mealPreference: "standard" });
    await assert.rejects(
      passenger.updateAccount({ mealPreference: "vegetarian" }),
      CommercialCatalogError,
    );
    await r.repo.createMeal({
      id: "meal-default-custom",
      label: { en: "Custom", ar: "مخصصة" },
      active: true,
      order: 5,
    });
    await r.repo.setDefaultMeal("meal-default-custom");
    const draft = new LocalBookingDraftRepository({ inMemoryOnly: true }, r.repo);
    await draft.resetDraft(candidate().criteria);
    assert.equal(draft.getDraft().extras.pax[0]!.meal, "meal-default-custom");
  });
  test("retired service cannot be transferred to another passenger", () => {
    const c = seedCommercialCatalog();
    c.meals[1]!.active = false;
    c.assistance[0]!.active = false;
    const previous = {
      pax: [
        { extraBags: 0, meal: "vegetarian", assistance: ["wheelchair"] },
        { extraBags: 0, meal: "standard", assistance: [] },
      ],
    };
    assert.throws(
      () =>
        validateServiceSelections(
          { pax: [previous.pax[0]!, { ...previous.pax[1]!, meal: "vegetarian" }] },
          c,
          previous,
        ),
      CommercialCatalogError,
    );
    assert.throws(
      () =>
        validateServiceSelections(
          { pax: [previous.pax[0]!, { ...previous.pax[1]!, assistance: ["wheelchair"] }] },
          c,
          previous,
        ),
      CommercialCatalogError,
    );
  });
  test("normalized option creation returns exact committed labels, with replay identity", async () => {
    const r = storageRig();
    const input = {
      id: "meal-trimmed",
      label: { en: "  Trimmed  ", ar: "  وجبة  " },
      active: true,
      order: 5,
    };
    const a = await r.repo.createMeal(input);
    assert.equal(a.label.en, "Trimmed");
    assert.deepEqual(
      (await r.repo.get()).catalog.meals.find((m) => m.id === a.id),
      a,
    );
    const counts = r.counts();
    await r.repo.createMeal(input);
    assert.deepEqual(r.counts(), counts);
  });
  test("all current runtime consumers avoid compiled commercial imports; only frozen seed remains", () => {
    const paths = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? paths(`${dir}/${e.name}`)
          : /\.tsx?$/.test(e.name)
            ? [`${dir}/${e.name}`]
            : [],
      );
    for (const file of paths("src")) {
      if (file === "src/lib/data.ts" || file === "src/lib/commercial/seed.ts") continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*["'][^"']*(?:\/data|\/data\.ts)["']/g,
      ))
        assert.doesNotMatch(
          match[1]!,
          /\b(?:EXTRA_BAG_PRICE|fares|mealOptions|assistanceOptions|farePrice|cabinMultiplier)\b/,
          file,
        );
    }
    const ops =
      readFileSync("src/lib/admin-ops.ts", "utf8")
        .split("export interface OpsState")[1]
        ?.split("}")[0] ?? "";
    assert.doesNotMatch(ops, /\b(?:fares|baggage|meals|assistance)\b/);
    assert.doesNotMatch(
      readFileSync("src/lib/booking-draft/factories.ts", "utf8"),
      /EXTRA_BAG_PRICE|farePrice\(/,
    );
    const resetQuery = readFileSync("src/lib/repositories/queries.ts", "utf8")
      .split("export function useResetBookingDraftMutation")[1]!
      .split("export function useClearBookingDraftMutation")[0]!;
    assert.doesNotMatch(resetQuery, /"standard"|emptyPaxExtras/);
  });
  test("no generic writer can replace a committed historical pricing snapshot", async () => {
    const r = bookingRig();
    const created = await r.booking.create(candidate());
    const before = r.storage.getItem(REPO_STORAGE_KEY);
    const api = r.booking as unknown as { update?: (ref: string, patch: unknown) => unknown };
    assert.equal(api.update, undefined);
    assert.throws(() => api.update!(created.ref, { pricingSnapshot: { ...created.pricingSnapshot!, fareMultiplier: 7 } }), TypeError);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), before);
    assert.deepEqual((await r.booking.getByRef(created.ref))?.pricingSnapshot, created.pricingSnapshot);
  });
  test("booking mutations resolve historical basis and never trust caller pricing snapshot", () => {
    const source = readFileSync("src/lib/repositories/booking-repository.ts", "utf8");
    assert.match(source, /pricingSnapshot\(catalog/);
    assert.match(source, /resolveBookingPricing\(existing\)/);
    assert.doesNotMatch(source, /data\.pricingSnapshot|data\.total\s*[,;]/);
  });
  test("feature docs retain deployed 6B1 truth and explicitly subdivide 6B2", () => {
    const stalePhrases = [
      "This feature is not accepted or deployed",
      "Independent review of Phase 6B2A",
      "6B2A awaiting review",
      "commercial product configuration is now repository-backed on the Phase 6B2A feature branch",
    ];
    for (const file of [
      "README.md",
      "PRODUCT.md",
      "roadmap.md",
      "docs/ARCHITECTURE.md",
      "docs/CANONICAL_REPOSITORIES.md",
      "docs/DATA_FLOW.md",
      "docs/COMMERCIAL_MODEL.md",
      "docs/SCHEDULE_MODEL.md",
      "docs/CONTACT_MODEL.md",
      "docs/CONTENT_MODEL.md",
      "docs/SETTINGS_MODEL.md",
    ]) {
      const doc = readFileSync(file, "utf8");
      assert.match(doc, /Phase 6B2A[^]*Complete \/ Accepted Source/);
      assert.ok(doc.includes("1c5e6b6259add7b59199725f6b23324e8d1c58eb"));
      assert.ok(doc.includes("gza.commercial.v1"));
      assert.ok(doc.includes("f8c0d0bdc579c5c2719670c8387fa543d8d6a170"));
      assert.ok(doc.includes("bcf284df3f0d7b24ec59372bb038ed9ae1e8c934"));
      assert.match(doc, /Phase 6B2B[^]*Planned \/ Unstarted/);
      assert.match(doc, /Phase 6B2C[^]*Planned \/ Unstarted/);
      // Scope current acceptance checks to 6B2A status statements. Later phases
      // and explicitly historical descriptions may still await their own review.
      const currentStatusLines = doc.split("\n").filter(line =>
        /Phase 6B2A|Commercial catalog|CommercialCatalogRepository/.test(line) &&
        !/\bhistorical\b/i.test(line));
      for (const line of currentStatusLines) {
        assert.doesNotMatch(line, /Implemented \/ Awaiting (?:Independent )?Review/);
        for (const phrase of stalePhrases) {
          assert.ok(!line.includes(phrase), `Expected "${file}" to reconcile current 6B2A status: "${phrase}"`);
        }
      }
      assert.doesNotMatch(doc, /^#{1,6} [^\n]*Phase 6B2A[^\n]*\n\s*\n\*\*Implemented \/ Awaiting (?:Independent )?Review/m);
    }
  });
});


describe("6B2A Correction 01 command failure isolation", () => {
  test("committed submission replay survives corrupt catalog without writes, events or another PNR", async () => {
    const r = bookingRig();
    let bookingEvents = 0;
    r.booking.subscribe(() => bookingEvents++);
    const input = candidate();
    const created = await r.booking.create(input);
    const bookingRaw = r.storage.getItem(REPO_STORAGE_KEY);
    r.storage.setItem(COMMERCIAL_STORAGE_KEY, "{corrupt");
    const baseline = r.counts();
    const events = bookingEvents;
    const replay = await r.booking.create(input);
    assert.deepEqual(replay, created);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), bookingRaw);
    assert.deepEqual(r.counts(), baseline);
    assert.equal(bookingEvents, events);
    assert.equal((await r.booking.list()).length, 1);
    assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY), "{corrupt");
  });
  test("committed replay reads fresh canonical state even in a stale repository instance", async () => {
    const r = bookingRig();
    const stale = new LocalBookingRepository(new RepoStorageCoordinator({ storage: r.storage }), { commercial: r.repo });
    const created = await r.booking.create(candidate());
    r.storage.setItem(COMMERCIAL_STORAGE_KEY, "{corrupt");
    const before = r.counts();
    assert.deepEqual(await stale.create(candidate()), created);
    assert.deepEqual(r.counts(), before);
  });
  test("new submission with corrupt catalog fails closed without booking writes or events", async () => {
    const r = bookingRig();
    await r.booking.create(candidate());
    r.storage.setItem(COMMERCIAL_STORAGE_KEY, "{corrupt");
    let events = 0; r.booking.subscribe(() => events++);
    const raw = r.storage.getItem(REPO_STORAGE_KEY), counts = r.counts();
    await assert.rejects(r.booking.create({ ...candidate(), submissionId: "brand-new" }),
      e => e instanceof CommercialCatalogError && e.reason === "catalog_unavailable");
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    assert.deepEqual(r.counts(), counts); assert.equal(events, 0);
  });
  test("transactional guard keeps concurrent first submissions to one write/event and PNR", async () => {
    const r = bookingRig(); let events = 0; r.booking.subscribe(() => events++);
    const before = r.counts();
    const [a,b] = await Promise.all([r.booking.create(candidate()), r.booking.create(candidate())]);
    assert.deepEqual(a,b); assert.equal((await r.booking.list()).length,1);
    assert.equal(r.counts().writes-before.writes,1); assert.equal(events,1);
  });
  test("generic booking patch APIs are absent and cannot alter any canonical commercial facts", async () => {
    const r = bookingRig(); const created = await r.booking.create(candidate());
    const raw = r.storage.getItem(REPO_STORAGE_KEY); let events = 0; r.booking.subscribe(() => events++);
    const api = r.booking as unknown as {update?: (ref:string, patch:unknown)=>unknown};
    for (const field of ["total","fareId","criteria","pricingSnapshot","seats","extras","checkedIn","outbound","inbound","status","channel","createdAt"]) {
      assert.equal(api.update,undefined);
      assert.throws(()=>api.update!(created.ref,{[field]:"forged"}),TypeError);
    }
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY),raw); assert.equal(events,0);
    assert.deepEqual(await r.booking.getByRef(created.ref),created);
    for (const file of ["src/lib/repositories/types.ts","src/lib/repositories/booking-repository.ts","src/lib/repositories/queries.ts","src/lib/store.tsx"]) {
      const source = readFileSync(file,"utf8");
      assert.doesNotMatch(source,/Partial<Booking>|useUpdateBookingMutation|updateBooking:/);
    }
    const trip = readFileSync("src/routes/{-$locale}.account.trips.$ref.tsx","utf8");
    assert.match(trip,/useCancelBookingMutation/); assert.match(trip,/bookingBelongsToAccount/);
    assert.doesNotMatch(trip,/useUpdateBookingMutation|patch:\s*\{/);
  });
  test("existing normalized passenger sign-in preserves preference/names without a catalog read", async () => {
    const r = storageRig();
    await r.repo.setDefaultMeal("vegetarian");
    const coordinator = new PassengerStorageCoordinator({ storage: r.storage });
    let reads=0;
    const commercial = Object.create(r.repo) as typeof r.repo;
    commercial.get=async()=>{reads++;return r.repo.get();};
    const passenger = new LocalPassengerRepository(coordinator,commercial);
    const first = await passenger.signIn("Existing@Example.ps","First","Last");
    assert.equal(first.mealPreference,"vegetarian"); const initialReads=reads;
    r.storage.setItem(COMMERCIAL_STORAGE_KEY,"{corrupt");
    const again = await passenger.signIn("  EXISTING@example.ps  "," Renamed ");
    assert.equal(again.email,"existing@example.ps"); assert.equal(again.firstName,"Renamed");
    assert.equal(again.lastName,"Last"); assert.equal(again.mealPreference,"vegetarian");
    assert.equal(reads,initialReads); assert.equal(r.storage.getItem(COMMERCIAL_STORAGE_KEY),"{corrupt");
  });
  test("genuinely new passenger identity still fails closed on unavailable catalog", async () => {
    const r=storageRig();const coordinator=new PassengerStorageCoordinator({storage:r.storage});
    const passenger=new LocalPassengerRepository(coordinator,r.repo);
    const old=await passenger.signIn("existing@example.ps");
    r.storage.setItem(COMMERCIAL_STORAGE_KEY,"{corrupt");
    const raw=r.storage.getItem("gza.passenger.v1");let events=0;passenger.subscribe(()=>events++);
    await assert.rejects(passenger.signIn("different@example.ps"),e=>e instanceof CommercialCatalogError && e.reason==="catalog_unavailable");
    assert.deepEqual(await passenger.getAccount(),old);assert.equal(r.storage.getItem("gza.passenger.v1"),raw);assert.equal(events,0);
    const source=readFileSync("src/routes/{-$locale}.signin.tsx","utf8");
    assert.match(source,/catch\s*\{\s*setError\(t\("error.saveFailed"\)\)/);
    assert.doesNotMatch(source,/setError\([^)]*\.message/);
  });
  test("existing account adoption retains storage rollback semantics", async()=>{
    const r=storageRig();const passenger=new LocalPassengerRepository(new PassengerStorageCoordinator({storage:r.storage}),r.repo);
    const old=await passenger.signIn("existing@example.ps","Original");
    r.storage.setItem(COMMERCIAL_STORAGE_KEY,"{corrupt");r.fail();let events=0;passenger.subscribe(()=>events++);
    await assert.rejects(passenger.signIn("existing@example.ps","Changed"),PassengerStorageCommitError);
    assert.deepEqual(await passenger.getAccount(),old);assert.equal(events,0);
  });
  test("draft reset catalog failure preserves canonical draft, identity and no-notification state", async()=>{
    const r=storageRig();const draft=new LocalBookingDraftRepository({storage:r.storage},r.repo);
    await draft.resetDraft(candidate().criteria);const previous=draft.getState();
    const raw=r.storage.getItem("gza.booking.draft.v1");let events=0;draft.subscribe(()=>events++);
    r.storage.setItem(COMMERCIAL_STORAGE_KEY,"{corrupt");
    await assert.rejects(draft.resetDraft({...candidate().criteria,adults:2}),e=>e instanceof CommercialCatalogError && e.reason==="catalog_unavailable");
    assert.deepEqual(draft.getState(),previous);assert.equal(r.storage.getItem("gza.booking.draft.v1"),raw);assert.equal(events,0);
    const source=readFileSync("src/components/flight-search-form.tsx","utf8");
    assert.match(source,/catch \(failure\) \{\s*setSubmissionError\(t\(catalogErrorKey\(failure\)\)\);\s*return;/);
    assert.match(source,/error \?\? submissionError/);assert.match(source,/role="alert"/);
  });
  test("successful legacy claim seals frozen basis without repricing; repeated claim is no-write",async()=>{
    const r=bookingRig();const created=await r.booking.create(candidate());
    const legacy={...created};delete legacy.pricingSnapshot;
    r.storage.setItem(REPO_STORAGE_KEY,JSON.stringify({schemaVersion:1,bookings:[legacy],flightOverrides:{}}));
    const booking=new LocalBookingRepository(new RepoStorageCoordinator({storage:r.storage}),{commercial:r.repo});
    assert.equal((await booking.getByRef(created.ref))?.pricingSnapshot,undefined);
    const counts=r.counts();let events=0;booking.subscribe(()=>events++);
    const claimed=await booking.claim(created.ref,created.contact.email);
    assert.equal(claimed.status,"claimed");if(claimed.status!=="claimed")throw new Error("expected claim");
    assert.equal(claimed.booking.total,created.total);
    assert.deepEqual(claimed.booking.pricingSnapshot,legacyPricingBasis(created.fareId,created.criteria.cabin));
    assert.equal(r.counts().writes-counts.writes,1);assert.equal(events,1);
    const raw=r.storage.getItem(REPO_STORAGE_KEY),after=r.counts();
    assert.equal((await booking.claim(created.ref,created.contact.email)).status,"already-owned-by-user");
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY),raw);assert.deepEqual(r.counts(),after);assert.equal(events,1);
  });
  test("unsuccessful legacy claim outcomes never seal or write a snapshot",async()=>{
    const r=bookingRig();const created=await r.booking.create(candidate());
    const legacy={...created};delete legacy.pricingSnapshot;
    r.storage.setItem(REPO_STORAGE_KEY,JSON.stringify({schemaVersion:1,bookings:[legacy],flightOverrides:{}}));
    const booking=new LocalBookingRepository(new RepoStorageCoordinator({storage:r.storage}),{commercial:r.repo});
    let events=0;booking.subscribe(()=>events++);let raw=r.storage.getItem(REPO_STORAGE_KEY),counts=r.counts();
    assert.equal((await booking.claim(created.ref,"other@example.ps")).status,"contact-mismatch");
    assert.equal((await booking.claim("missing",created.contact.email)).status,"not-found");
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY),raw);assert.deepEqual(r.counts(),counts);assert.equal(events,0);
    legacy.ownerEmail="owner@example.ps";
    r.storage.setItem(REPO_STORAGE_KEY,JSON.stringify({schemaVersion:1,bookings:[legacy],flightOverrides:{}}));
    raw=r.storage.getItem(REPO_STORAGE_KEY);counts=r.counts();
    assert.equal((await booking.claim(created.ref,"other@example.ps")).status,"owned-by-another");
    assert.equal((await booking.claim(created.ref,"owner@example.ps")).status,"already-owned-by-user");
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY),raw);assert.deepEqual(r.counts(),counts);assert.equal(events,0);
  });
});
