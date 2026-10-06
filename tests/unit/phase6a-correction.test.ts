import { CommercialCatalogError } from "../../src/lib/commercial/types.ts";
import { resolveBookingPricing } from "../../src/lib/commercial/pricing.ts";
import { readFileSync } from "node:fs";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import {
  RepoStorageCoordinator,
  StorageCommitError,
  REPO_STORAGE_KEY,
} from "../../src/lib/repositories/storage.ts";
import {
  departuresOn,
  todayISO,
  addDaysISO,
  isSeatAvailable,
  cabinZone,
  type Flight,
} from "../../src/lib/data.ts";
import { bookingTotal } from "../../src/lib/domain/pricing.ts";
import {
  normalizeBooking,
  bookingToMockBooking,
  BookingCreationError,
  type Booking,
  type BookingCreateInput,
} from "../../src/lib/domain/booking.ts";
import { buildAdminCheckInRows, sanitizeAdminCheckInSearch } from "../../src/lib/domain/desk.ts";
import { commercialErrorKey } from "../../src/lib/domain/commercial-errors.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";

function available(f: Flight, index = 0, cabin = "economy") {
  const seats: string[] = [];
  const zone = cabinZone(cabin);
  for (let row = zone.firstRow; row <= zone.lastRow; row++)
    for (const letter of ["A", "B", "C", "D", "E", "F"])
      if (isSeatAvailable(f.id, row, letter)) seats.push(`${row}${letter}`);
  return seats[index]!;
}
function input(): BookingCreateInput {
  const f = Array.from({ length: 14 }, (_, i) => departuresOn(addDaysISO(todayISO(), 5 + i))).flat().find(f => f.aircraftId === "a320neo" && f.status === "Scheduled" && f.seatsLeft >= 2)!;
  return {
    outbound: f,
    inbound: null,
    criteria: {
      tripType: "oneway",
      origin: "GZA",
      destination: f.destinationCode,
      departDate: f.date,
      returnDate: "",
      adults: 1,
      children: 0,
      infants: 0,
      cabin: "economy",
    },
    fareId: "classic",
    passengers: [
      {
        type: "adult",
        firstName: "Audit",
        lastName: "Example",
        dob: "1980-01-01",
        nationality: "PS",
        document: "AUDIT-DOC",
      },
    ],
    contact: { email: "audit@example.com", phone: "" },
    seats: {},
    extras: { pax: [] },
    total: 999999,
    channel: "desk",
    submissionId: "audit-submission",
  };
}
function rig(bookings: Booking[] = []) {
  let fail = false,
    writes = 0;
  const map = new Map([
    [REPO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, bookings, flightOverrides: {} })],
  ]);
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw new Error("audit quota");
      writes++;
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  const repo = new LocalBookingRepository(new RepoStorageCoordinator({ storage }));
  let notifications = 0;
  repo.subscribe(() => notifications++);
  return {
    repo,
    storage,
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
    counts: () => ({ writes, notifications }),
  };
}
describe("Phase 6A Correction: canonical writer invariants", () => {
  const invalid: [string, (d: BookingCreateInput) => void][] = [
    [
      "blank first name",
      (d) => {
        d.passengers[0]!.firstName = " ";
      },
    ],
    [
      "blank surname",
      (d) => {
        d.passengers[0]!.lastName = "";
      },
    ],
    [
      "missing DOB",
      (d) => {
        d.passengers[0]!.dob = "";
      },
    ],
    [
      "impossible DOB",
      (d) => {
        d.passengers[0]!.dob = "1980-02-31";
      },
    ],
    [
      "future DOB",
      (d) => {
        d.passengers[0]!.dob = "2999-01-01";
      },
    ],
    [
      "email at sign",
      (d) => {
        d.contact.email = "@";
      },
    ],
    [
      "email whitespace",
      (d) => {
        d.contact.email = "a b@example.com";
      },
    ],
    [
      "count mismatch cannot underprice",
      (d) => {
        d.passengers.push({ ...d.passengers[0]! });
      },
    ],
    [
      "fractional count",
      (d) => {
        d.criteria.adults = 1.5;
      },
    ],
    [
      "negative children",
      (d) => {
        d.criteria.children = -1;
      },
    ],
    [
      "unknown fare",
      (d) => {
        (d as unknown as { fareId: string }).fareId = "invented";
      },
    ],
    [
      "unknown cabin",
      (d) => {
        d.criteria.cabin = "invented";
      },
    ],
    [
      "unsupported first class",
      (d) => {
        d.criteria.cabin = "first";
      },
    ],
    [
      "unknown channel",
      (d) => {
        (d as unknown as { channel: string }).channel = "invented";
      },
    ],
    [
      "economy first-cabin seat",
      (d) => {
        d.seats = { "out-0": "1A" };
      },
    ],
    [
      "nonexistent inbound seat",
      (d) => {
        d.seats = { "in-0": "16A" };
      },
    ],
    [
      "noncanonical seat key",
      (d) => {
        d.seats = { "out-00": "16A" };
      },
    ],
    [
      "padded seat code",
      (d) => {
        d.seats = { "out-0": " 16A " };
      },
    ],
    [
      "blank seat",
      (d) => {
        d.seats = { "out-0": "" };
      },
    ],
    [
      "invalid seat index",
      (d) => {
        d.seats = { "out-99": "16A" };
      },
    ],
    [
      "unknown meal",
      (d) => {
        d.extras = { pax: [{ extraBags: 0, meal: "invented", assistance: [] }] };
      },
    ],
    [
      "unknown assistance",
      (d) => {
        d.extras = { pax: [{ extraBags: 0, meal: "standard", assistance: ["invented"] }] };
      },
    ],
    [
      "duplicate assistance",
      (d) => {
        d.extras = {
          pax: [{ extraBags: 0, meal: "standard", assistance: ["wheelchair", "wheelchair"] }],
        };
      },
    ],
    [
      "negative bags",
      (d) => {
        d.extras = { pax: [{ extraBags: -1, meal: "standard", assistance: [] }] };
      },
    ],
    [
      "fractional bags",
      (d) => {
        d.extras = { pax: [{ extraBags: 1.5, meal: "standard", assistance: [] }] };
      },
    ],
    [
      "surplus Extras passengers",
      (d) => {
        d.extras = {
          pax: [
            { extraBags: 0, meal: "standard", assistance: [] },
            { extraBags: 0, meal: "standard", assistance: [] },
          ],
        };
      },
    ],
  ];
  for (const [name, change] of invalid)
    test(`rejects ${name} without committing or notifying`, async () => {
      const r = rig(),
        d = input();
      change(d);
      const raw = r.storage.getItem(REPO_STORAGE_KEY);
      await assert.rejects(r.repo.create(d), name === "unknown fare" || name === "unknown meal" || name === "unknown assistance" ? CommercialCatalogError : BookingCreationError);
      assert.deepEqual(await r.repo.list(), []);
      assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
      assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
    });
  test("rejects unavailable and duplicate physical seats", async () => {
    const d = input();
    const zone = cabinZone("economy");
    let blocked = "";
    for (let row = zone.firstRow; row <= zone.lastRow; row++)
      for (const letter of ["A", "B", "C", "D", "E", "F"])
        if (!isSeatAvailable(d.outbound.id, row, letter)) blocked = `${row}${letter}`;
    assert.ok(blocked);
    d.seats = { "out-0": blocked };
    await assert.rejects(rig().repo.create(d), BookingCreationError);
    d.criteria.adults = 2;
    d.passengers.push({ ...d.passengers[0]! });
    d.seats = { "out-0": available(d.outbound), "out-1": available(d.outbound) };
    await assert.rejects(rig().repo.create(d), BookingCreationError);
  });
  test("revalidates effective capacity snapshot rather than client seatsLeft", async () => {
    const d = input();
    const f = Array.from({ length: 14 }, (_, i) => departuresOn(addDaysISO(todayISO(), 5 + i))).flat().find((f) => f.seatsLeft < 20)!;
    assert.ok(f);
    d.outbound = { ...f, seatsLeft: 999 };
    d.criteria.destination = f.destinationCode;
    d.criteria.adults = f.seatsLeft + 1;
    d.passengers = Array.from({ length: d.criteria.adults }, () => ({ ...d.passengers[0]! }));
    await assert.rejects(
      rig().repo.create(d),
      (e: unknown) => e instanceof BookingCreationError && e.reason === "insufficient_seats",
    );
  });
  test("public and desk normalize identity and independently price fare/cabin/seats/Extras", async () => {
    for (const channel of ["web", "desk"] as const)
      for (const cabin of ["economy", "business", "premium"]) {
        const d = input();
        d.channel = channel;
        d.criteria.cabin = cabin;
        d.contact.email = "  AUDIT@EXAMPLE.COM  ";
        d.passengers[0]!.firstName = " Audit ";
        d.criteria.adults = 2;
        d.passengers.push({ ...d.passengers[0]! });
        d.seats = {
          "out-0": available(d.outbound, 0, cabin),
          "out-1": available(d.outbound, 1, cabin),
        };
        d.extras = { pax: [{ extraBags: 2, meal: "vegetarian", assistance: ["wheelchair"] }] };
        const b = await rig().repo.create(d);
        assert.equal(b.total, bookingTotal({ ...d, extras: b.extras }).total);
        assert.notEqual(b.total, d.total);
        assert.equal(b.contact.email, "audit@example.com");
        assert.equal(b.passengers[0]!.firstName, "Audit");
        assert.equal(b.extras.pax.length, 2);
        assert.equal(b.channel, channel);
        if (channel === "desk") assert.equal(b.ownerEmail, null);
      }
  });
  test("idempotent concurrent submission creates exactly one PNR", async () => {
    const r = rig();
    const [a, b] = await Promise.all([r.repo.create(input()), r.repo.create(input())]);
    assert.equal(a.ref, b.ref);
    assert.equal((await r.repo.list()).length, 1);
  });
  test("Extras update validation protects stored price; empty clears services", async () => {
    const r = rig(),
      b = await r.repo.create(input());
    const raw = r.storage.getItem(REPO_STORAGE_KEY),
      counts = r.counts();
    for (const bad of [-5, 1.5, 6, "2"])
      await assert.rejects(
        r.repo.updateExtras(b.ref, {
          pax: [{ extraBags: bad as number, meal: "standard", assistance: [] }],
        }),
        BookingCreationError,
      );
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    assert.deepEqual(r.counts(), counts);
    const updated = await r.repo.updateExtras(b.ref, {
      pax: [{ extraBags: 2, meal: "standard", assistance: [] }],
    });
    assert.equal(updated.total, b.total + 70);
    const cleared = await r.repo.updateExtras(b.ref, { pax: [] });
    assert.equal(cleared.total, b.total);
    assert.equal(cleared.extras.pax[0]!.extraBags, 0);
  });
  test("failed creation is rollback safe and retry uses stable identity", async () => {
    const r = rig();
    r.fail();
    await assert.rejects(r.repo.create(input()), StorageCommitError);
    assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
    assert.deepEqual(await r.repo.list(), []);
    r.recover();
    const b = await r.repo.create(input());
    assert.equal(b.submissionId, input().submissionId);
  });
});

function checkedBooking(): Booking {
  const d = input();
  return {
    ...d,
    ref: "GZA-AUD1",
    createdAt: "2026-01-01T10:13:00Z",
    inbound: {
      ...d.outbound,
      id: "external-return",
      originCode: d.outbound.destinationCode,
      destinationCode: "GZA",
    },
    passengers: [
      { ...d.passengers[0]!, id: "pax-0" },
      { ...d.passengers[0]!, firstName: "Second", id: "pax-1" },
      { ...d.passengers[0]!, type: "infant", withAdult: 0, id: "pax-2" },
    ],
    criteria: { ...d.criteria, tripType: "round", adults: 2, infants: 1 },
    checkedIn: { out: [0, 1], in: [0] },
    status: "confirmed",
    seats: { "out-0": "16A", "out-1": "16B", "in-0": "16A" },
    extras: { pax: [{ extraBags: 1, meal: "standard", assistance: ["wheelchair"] }] },
    ownerEmail: null,
    channel: "desk",
  };
}
describe("Phase 6A Correction: undo, station selectors and presentation truth", () => {
  for (const indexes of [[0], [0, 1]])
    test(`undo ${indexes} preserves every other canonical field and leg`, async () => {
      const b = checkedBooking(),
        r = rig([b]),
        before = (await r.repo.getByRef(b.ref))!;
      const after = await r.repo.undoCheckIn({
        ref: b.ref,
        leg: "out",
        selectedPaxIndexes: indexes,
      });
      assert.deepEqual(
        after.checkedIn.out,
        [0, 1].filter((i) => !indexes.includes(i)),
      );
      assert.deepEqual(after.pricingSnapshot, resolveBookingPricing(before));
      assert.deepEqual({ ...after, pricingSnapshot: before.pricingSnapshot, checkedIn: before.checkedIn }, before);
      assert.deepEqual(r.counts(), { writes: 1, notifications: 1 });
      const loaded = new LocalBookingRepository(new RepoStorageCoordinator({ storage: r.storage }));
      assert.deepEqual(await loaded.getByRef(b.ref), after);
    });
  for (const indexes of [[-1], [0.5], [0, 0], [9], [2]])
    test(`undo rejects indexes ${indexes}`, async () => {
      const b = checkedBooking(),
        r = rig([b]);
      await assert.rejects(
        r.repo.undoCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: indexes }),
      );
      assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
    });
  test("undo rejects missing booking, cancelled booking and missing leg", async () => {
    const b = checkedBooking();
    for (const current of [
      { ...b, status: "cancelled" as const },
      { ...b, inbound: null },
    ]) {
      const r = rig([current]);
      await assert.rejects(r.repo.undoCheckIn({ ref: b.ref, leg: "in", selectedPaxIndexes: [0] }));
      assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
    }
    await assert.rejects(
      rig().repo.undoCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0] }),
    );
  });
  test("genuine undo no-op never writes or notifies", async () => {
    const b = { ...checkedBooking(), checkedIn: { out: [], in: [0] } },
      r = rig([b]);
    const raw = r.storage.getItem(REPO_STORAGE_KEY);
    await r.repo.undoCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0] });
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
  });
  test("undo storage failure rolls back all state and emits no event", async () => {
    const b = checkedBooking(),
      r = rig([b]),
      before = await r.repo.getByRef(b.ref),
      raw = r.storage.getItem(REPO_STORAGE_KEY);
    r.fail();
    await assert.rejects(
      r.repo.undoCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0] }),
      StorageCommitError,
    );
    assert.deepEqual(await r.repo.getByRef(b.ref), before);
    assert.equal(r.storage.getItem(REPO_STORAGE_KEY), raw);
    assert.deepEqual(r.counts(), { writes: 0, notifications: 0 });
  });
  test("GZA-origin return leg resolves correct checked-in seat, document and passenger indexes", () => {
    const b = checkedBooking(),
      f = b.outbound;
    const reversed = {
      ...b,
      outbound: b.inbound!,
      inbound: f,
      seats: { "in-0": "16A" },
      checkedIn: { out: [], in: [0] },
    };
    const rows = buildAdminCheckInRows(
      f,
      [reversed],
      new Date(flightDepartureEpoch(f) - 2 * 3600000),
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.leg, "in");
    assert.equal(rows[0]!.status, "done");
    assert.equal(rows[0]!.seat, "16A");
    assert.equal(rows[0]!.document, "AUDIT-DOC");
    assert.equal(buildAdminCheckInRows(reversed.outbound, [reversed]).length, 0);
  });
  test("station search rejects invalid calendar, PNR and stale flight preselection", () => {
    assert.deepEqual(
      sanitizeAdminCheckInSearch({ date: "not-a-date", ref: "!!!", flightId: "stale" }),
      { date: undefined, ref: undefined, flightId: undefined },
    );
    assert.deepEqual(sanitizeAdminCheckInSearch({ date: "2026-02-31" }), {
      date: undefined,
      ref: undefined,
      flightId: undefined,
    });
    const f = input().outbound;
    assert.deepEqual(
      sanitizeAdminCheckInSearch({ date: f.date, ref: " gza-aud1 ", flightId: f.id }),
      { date: f.date, ref: "GZA-AUD1", flightId: f.id },
    );
  });
  test("adapter reports only evidenced creation history; missing identities remain missing", () => {
    const b = checkedBooking(),
      a = bookingToMockBooking({
        ...b,
        status: "cancelled",
        passengers: [{ ...b.passengers[0]!, dob: "", document: "", nationality: "" }],
      });
    assert.equal(a.history.length, 1);
    assert.equal(a.history[0]!.when, b.createdAt);
    assert.equal(a.passengers[0]!.document, "");
    assert.equal(a.passengers[0]!.dob, "");
    assert.equal(a.passengers[0]!.nationality, "");
    assert.equal(bookingToMockBooking({ ...b, createdAt: "" }).history.length, 0);
  });
  test("legacy absent channel normalizes to web; expected errors use localized keys", () => {
    const b = checkedBooking();
    const { channel, ...legacy } = b;
    assert.equal(channel, "desk");
    assert.equal(normalizeBooking(legacy)!.channel, "web");
    assert.equal(commercialErrorKey(new StorageCommitError("quota")), "a6.err.storage");
    assert.equal(commercialErrorKey(new Error("arbitrary details")), "a6.err.retry");
  });
});

test("Phase 6A commercial route labels resolve in both locales and mobile cards render components", () => {
  const dictionaries = [
    { ...en, ...adminEn, ...admin2En },
    { ...ar, ...adminAr, ...admin2Ar },
  ];
  const routes = ["bookings.new", "bookings.$ref", "check-in"];
  for (const route of routes) {
    const source = readFileSync(
      new URL(`../../src/routes/{-$locale}.admin.${route}.tsx`, import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(/\bt\("([a-zA-Z0-9.]+)"/g))
      for (const dictionary of dictionaries)
        assert.ok(dictionary[match[1]!], `Missing commercial key ${match[1]}`);
    assert.ok(!source.includes("$<ServiceValue"));
    if (route === "bookings.$ref") assert.ok(!source.includes('description={t("a2.mock")}'));
  }
});
