import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LocalScheduleRepository,
  ScheduleIdentityConflictError,
  ScheduleNotFoundError,
} from "../../src/lib/schedules/repository.ts";
import {
  ScheduleStorageCoordinator,
  ScheduleStorageWriteError,
  parseScheduleStorage,
  SCHEDULE_STORAGE_KEY,
} from "../../src/lib/schedules/storage.ts";
import { parseSchedule, ScheduleValidationError } from "../../src/lib/schedules/schema.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { scheduleKeys } from "../../src/lib/schedules/keys.ts";
import {
  createRepositories,
  getIsolatedStudioRepositories,
  resetIsolatedStudioRepositories,
} from "../../src/lib/repositories/registry.ts";
import { flightBookingMetrics, dailyBookingMetrics } from "../../src/lib/admin-flight-metrics.ts";
import type { Booking } from "../../src/lib/domain/booking.ts";
import type { Schedule } from "../../src/lib/schedules/types.ts";
import { todayISO } from "../../src/lib/data.ts";
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  writes = 0;
  fail = false;
  get length() {
    return this.values.size;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("quota");
    this.writes++;
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}
const entry = (id = "new-schedule"): Schedule => ({ ...structuredClone(seedSchedules()[0]!), aircraftId: "a320neo", id });
function setup() {
  const storage = new MemoryStorage();
  const coordinator = new ScheduleStorageCoordinator({ storage });
  const repository = new LocalScheduleRepository(coordinator);
  return { storage, coordinator, repository };
}
const source = (file: string) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
describe("Phase 6B1 — schedule authority and transactions", () => {
  it("missing key exposes deterministic planning seeds without writing", async () => {
    const { storage, repository } = setup();
    assert.deepEqual(await repository.list(), seedSchedules());
    assert.equal(storage.writes, 0);
    assert.equal(storage.getItem(SCHEDULE_STORAGE_KEY), null);
  });
  it("valid stored schedules win over seeds", async () => {
    const { storage, repository } = setup();
    storage.setItem(
      SCHEDULE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, revision: 12, schedules: [entry()] }),
    );
    assert.deepEqual(await repository.list(), [parseSchedule(entry())]);
  });
  it("valid empty store (including omitted revision) never resurrects seeds", async () => {
    const { storage, repository } = setup();
    storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, schedules: [] }));
    assert.deepEqual(await repository.list(), []);
    await repository.create(entry());
    assert.equal((await repository.list()).length, 1);
    assert.equal(JSON.parse(storage.getItem(SCHEDULE_STORAGE_KEY)!).revision, 1);
  });
  for (const [name, raw] of [
    ["malformed JSON", "{"],
    ["unsupported version", '{"schemaVersion":2,"schedules":[]}'],
    ["invalid stored record", '{"schemaVersion":1,"schedules":[{}]}'],
    ["invalid revision", '{"schemaVersion":1,"revision":-1,"schedules":[]}'],
  ])
    it(name + " reads safely and blocks writes without overwriting", async () => {
      const { storage, repository } = setup();
      storage.setItem(SCHEDULE_STORAGE_KEY, raw!);
      assert.deepEqual(await repository.list(), []);
      await assert.rejects(repository.create(entry()), ScheduleStorageWriteError);
      assert.equal(storage.getItem(SCHEDULE_STORAGE_KEY), raw);
      assert.equal(storage.writes, 1);
    });
  it("storage parsing rejects duplicate schedule IDs and invalid stored exceptions", () => {
    assert.equal(
      parseScheduleStorage(JSON.stringify({ schemaVersion: 1, schedules: [entry(), entry()] })),
      null,
    );
    const bad = entry();
    bad.exceptions = [{ id: "x", date: "2026-02-30", kind: "time", detail: "" }];
    assert.equal(
      parseScheduleStorage(JSON.stringify({ schemaVersion: 1, schedules: [bad] })),
      null,
    );
  });
  it("create commits, increments revision and emits one notification", async () => {
    const { storage, coordinator, repository } = setup();
    let notifications = 0;
    coordinator.subscribe(() => notifications++);
    const created = await repository.create(entry());
    assert.equal(created.id, "new-schedule");
    assert.equal(JSON.parse(storage.getItem(SCHEDULE_STORAGE_KEY)!).revision, 1);
    assert.equal(notifications, 1);
  });
  it("same identity replay is a read; conflicting identity is rejected", async () => {
    const { storage, coordinator, repository } = setup();
    const created = await repository.create(entry());
    let notifications = 0;
    coordinator.subscribe(() => notifications++);
    const writes = storage.writes;
    assert.deepEqual(await repository.create(entry()), created);
    await assert.rejects(
      repository.create({ ...entry(), number: "PS999" }),
      ScheduleIdentityConflictError,
    );
    assert.equal(storage.writes, writes);
    assert.equal(notifications, 0);
  });
  it("update persists a stable identity and detached read snapshots", async () => {
    const { storage, repository } = setup();
    await repository.create(entry());
    await repository.update("new-schedule", { number: "PS999", departTime: "12:15" });
    const reloaded = new LocalScheduleRepository(new ScheduleStorageCoordinator({ storage }));
    const result = (await reloaded.getById("new-schedule"))!;
    assert.equal(result.number, "PS999");
    result.days.push(9);
    assert.ok(!(await reloaded.getById("new-schedule"))!.days.includes(9));
  });
  it("unchanged update and absent removal avoid writes and notifications", async () => {
    const { storage, coordinator, repository } = setup();
    const created = await repository.create(entry());
    const writes = storage.writes;
    let notifications = 0;
    coordinator.subscribe(() => notifications++);
    await repository.update(created.id, { number: created.number });
    await repository.remove("absent");
    assert.equal(storage.writes, writes);
    assert.equal(notifications, 0);
  });
  it("removing every schedule persists an authoritative empty list", async () => {
    const { storage, repository } = setup();
    for (const item of await repository.list()) await repository.remove(item.id);
    assert.deepEqual(
      await new LocalScheduleRepository(new ScheduleStorageCoordinator({ storage })).list(),
      [],
    );
  });
  for (const action of ["create", "update", "delete"] as const)
    it(action + " failure rolls back without notification and supports retry", async () => {
      const { storage, coordinator, repository } = setup();
      await repository.create(entry());
      const before = await repository.list(),
        raw = storage.getItem(SCHEDULE_STORAGE_KEY);
      let notifications = 0;
      coordinator.subscribe(() => notifications++);
      storage.fail = true;
      const mutate = () =>
        action === "create"
          ? repository.create(entry("second"))
          : action === "update"
            ? repository.update("new-schedule", { departTime: "11:11" })
            : repository.remove("new-schedule");
      await assert.rejects(mutate(), ScheduleStorageWriteError);
      assert.deepEqual(await repository.list(), before);
      assert.equal(storage.getItem(SCHEDULE_STORAGE_KEY), raw);
      assert.equal(notifications, 0);
      storage.fail = false;
      await mutate();
      assert.equal(notifications, 1);
    });
  it("queued rapid creates do not lose records and re-read current storage", async () => {
    const { storage, repository } = setup();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => repository.create(entry("rapid-" + index))),
    );
    assert.equal(
      (await repository.list()).filter((item) => item.id.startsWith("rapid-")).length,
      12,
    );
    const other = new LocalScheduleRepository(new ScheduleStorageCoordinator({ storage }));
    await other.create(entry("other-instance"));
    await repository.update("rapid-0", { active: false });
    assert.ok(await repository.getById("other-instance"));
  });
  it("missing update rejects and a throwing subscriber cannot falsify committed success", async () => {
    const { repository, coordinator } = setup();
    await assert.rejects(repository.update("missing", { active: false }), ScheduleNotFoundError);
    coordinator.subscribe(() => {
      throw Error("listener failure");
    });
    assert.equal((await repository.create(entry())).id, "new-schedule");
  });
});
describe("Phase 6B1 — central schedule validation", () => {
  for (const [field, value] of [
    ["id", ""],
    ["number", "BAD"],
    ["direction", "dep"],
    ["destination", "XXX"],
    ["days", []],
    ["days", [1, 1]],
    ["days", [7]],
    ["days", [1.5]],
    ["departTime", "24:00"],
    ["arriveTime", "12:99"],
    ["aircraft", " "],
    ["from", "2026-02-30"],
    ["until", "2025-01-01"],
    ["active", "yes"],
    ["exceptions", [{ id: "x", date: "2026-02-30", kind: "time", detail: "" }]],
    ["exceptions", [{ id: "x", date: "2026-02-01", kind: "bogus", detail: "" }]],
    ["exceptions", [{ id: "x", date: "2026-02-01", kind: "time", detail: "x".repeat(501) }]],
  ] as [string, unknown][])
    it("rejects invalid " + field + ": " + JSON.stringify(value).slice(0, 40), () => {
      assert.throws(() => parseSchedule({ ...entry(), [field]: value }), ScheduleValidationError);
    });
  it("rejects duplicate exception IDs", () => {
    const item = { id: "x", date: "2026-03-01", kind: "time", detail: "planning" };
    assert.throws(
      () => parseSchedule({ ...entry(), exceptions: [item, item] }),
      ScheduleValidationError,
    );
  });
  it("normalizes whitespace and sorts days without changing annotation meaning", () => {
    const result = parseSchedule({
      ...entry(),
      number: " PS 100 ",
      days: [5, 1, 3],
      aircraft: " A320 ",
    });
    assert.equal(result.number, "PS 100");
    assert.deepEqual(result.days, [1, 3, 5]);
    assert.equal(result.aircraft, "A320");
    assert.deepEqual(result.exceptions, entry().exceptions);
  });
});
describe("Phase 6B1 — integration and truth boundaries", () => {
  it("registry includes shared schedule identity and isolated Studio state", async () => {
    const storage = new MemoryStorage();
    const repositories = createRepositories({ inMemoryOnly: true, storage, initialSchedules: [] });
    await repositories.schedule.create(entry());
    assert.equal((await repositories.schedule.list()).length, 1);
    assert.equal(storage.getItem(SCHEDULE_STORAGE_KEY), null);
    resetIsolatedStudioRepositories();
    const studio = getIsolatedStudioRepositories();
    assert.equal(studio, getIsolatedStudioRepositories());
    await studio.schedule.create(entry("studio-only"));
    assert.equal(storage.writes, 0);
    resetIsolatedStudioRepositories();
  });
  it("schedule planning edits and exceptions do not change FlightRepository or booking search", async () => {
    const repositories = createRepositories({ inMemoryOnly: true });
    const date = "2026-10-06";
    const flights = await repositories.flight.getFlights(date);
    const search = await repositories.flight.searchFlights("GZA", "AMM", date);
    await repositories.schedule.create({ ...entry(), number: "PS999", active: false });
    await repositories.schedule.update("sch-AMM-out", { departTime: "23:59", active: false });
    await repositories.schedule.remove("sch-AMM-in");
    assert.deepEqual(await repositories.flight.getFlights(date), flights);
    assert.deepEqual(await repositories.flight.searchFlights("GZA", "AMM", date), search);
  });
  it("query keys and provider use one schedule invalidation authority", () => {
    assert.deepEqual(scheduleKeys.all, ["schedules"]);
    assert.deepEqual(scheduleKeys.detail("x"), ["schedules", "detail", "x"]);
    assert.match(source("src/lib/repositories/registry.ts"), /value\.schedule\.subscribe/);
    assert.match(source("src/lib/repositories/registry.ts"), /queryKey: scheduleKeys\.all/);
    assert.doesNotMatch(source("src/lib/schedules/queries.ts"), /\.subscribe\(/);
  });
  it("migrated flight paths have no raw reader composition or legacy booking store", () => {
    for (const file of [
      "src/routes/{-$locale}.admin.flights.index.tsx",
      "src/routes/{-$locale}.admin.flights.$flightId.tsx",
      "src/components/admin/dashboard-data.ts",
      "src/routes/{-$locale}.admin.index.tsx",
    ]) {
      assert.doesNotMatch(
        source(file),
        /\b(departuresOn|arrivalsOn|flightById|withOverride|useStore)\b/,
        file,
      );
    }
    assert.doesNotMatch(
      source("src/routes/{-$locale}.admin.flights.index.tsx"),
      /CAPACITY - f\.seatsLeft/,
    );
    assert.doesNotMatch(
      source("src/lib/admin-store.tsx"),
      /\b(applyOverride|withOverride|setOverrides)\b/,
    );
  });
  it("public successful empty flights cannot invoke raw-data fallback", () => {
    const route = source("src/routes/{-$locale}.flights.tsx");
    assert.doesNotMatch(route, /\b(departuresOn|arrivalsOn)\b/);
    assert.match(route, /repoFlights\.filter/);
    assert.match(route, /isPending/);
    assert.match(route, /isError/);
  });
  it("schedule consumers no longer use mixed OpsState and CRUD failures retain dialogs", () => {
    for (const file of [
      "src/routes/{-$locale}.admin.schedules.tsx",
      "src/routes/{-$locale}.admin.destinations.$code.tsx",
    ])
      assert.doesNotMatch(source(file), /ops\.schedules|patchOps\("schedules"/);
    assert.doesNotMatch(source("src/lib/admin-ops.ts"), /schedules:\s*Schedule/);
    const route = source("src/routes/{-$locale}.admin.schedules.tsx");
    assert.match(route, /preserveOpenOnConfirm/);
    assert.match(route, /aria-invalid/);
    assert.match(route, /aria-describedby/);
    assert.doesNotMatch(route, /err\.message/);
  });
  it("owner-deployed docs preserve production provenance and reject stale 6B1 status", () => {
    for (const file of [
      "README.md",
      "roadmap.md",
      "PRODUCT.md",
      "docs/ARCHITECTURE.md",
      "docs/CANONICAL_REPOSITORIES.md",
      "docs/DATA_FLOW.md",
      "docs/CONTENT_MODEL.md",
      "docs/SETTINGS_MODEL.md",
      "docs/CONTACT_MODEL.md",
      "docs/SCHEDULE_MODEL.md",
    ]) {
      const doc = source(file);
      assert.match(doc, /Phase 6B1[^]*Complete \/ Accepted Source \/ Accepted Release \/ Deployed by Owner/);
      assert.ok(doc.includes("b2e37ba4f7d2b0ae66a444747340acfe818a3832"));
      assert.doesNotMatch(doc, /Phase 6B1(?:(?!Phase 6B2)[^\n])*Implemented \/ Awaiting (?:Independent )?Review/);
      assert.doesNotMatch(doc, /6B1 awaiting independent review|no new release or deployment is performed/);
      // Deployment assertions concern 6B1; a later accepted-source phase may await deployment.
      assert.doesNotMatch(doc, /Phase 6B1(?:(?!Phase 6[A-Z0-9])[^.\n])*(?:not yet deployed|then owner deployment)/i);
      assert.doesNotMatch(doc, /production remains Phase 6A|Phase 6B1 (?:HostPapa )?deployment candidate/i);
      assert.ok(doc.includes("f8c0d0bdc579c5c2719670c8387fa543d8d6a170"));
      assert.ok(doc.includes("bcf284df3f0d7b24ec59372bb038ed9ae1e8c934"));
      assert.match(doc, /Phase 6B2[^]*Planned \/ Unstarted/);
      assert.ok(doc.includes("b5cff4db4b6e087907a9733ffd841880439fbfdb"));
      assert.ok(doc.includes("2ae1a876018992649074cbed1ebf0560e4da03ff"));
    }
  });
});
describe("Phase 6B1 — canonical booking metrics", () => {
  const booking = (ref = "TEST"): Booking =>
    ({
      ref,
      createdAt: "2026-10-02T22:30:00Z",
      status: "confirmed",
      outbound: { id: "f-out", date: "2026-10-03" },
      inbound: { id: "f-in", date: "2026-10-03" },
      passengers: [{ type: "adult" }, { type: "child" }, { type: "infant" }],
      checkedIn: { out: [0], in: [0, 1] },
    }) as unknown as Booking;
  it("flight counts use canonical passengers/check-in, excluding infants and cancelled bookings", () => {
    const active = booking(),
      cancelled = { ...booking("CANCEL"), status: "cancelled" as const };
    assert.deepEqual(flightBookingMetrics("f-out", [active, cancelled]), {
      total: 2,
      checked: 1,
      bookingCount: 1,
    });
    assert.deepEqual(flightBookingMetrics("f-in", [active]), {
      total: 2,
      checked: 2,
      bookingCount: 1,
    });
    assert.deepEqual(flightBookingMetrics("missing", [active]), {
      total: 0,
      checked: 0,
      bookingCount: 0,
    });
  });
  it("station-day booking creation and inbound travel are counted without naive UTC slicing", () => {
    const item = booking();
    assert.equal(todayISO(item.createdAt), "2026-10-03");
    const metrics = dailyBookingMetrics([item], "2026-10-03");
    assert.equal(metrics.bookingsToday, 1);
    assert.equal(metrics.passengersTravelling, 4);
    assert.equal(metrics.passengersCheckedIn, 3);
    assert.equal(metrics.travelling[1]?.leg, "in");
  });
  it("recent booking order is deterministic and cancelled travel is excluded", () => {
    const older = { ...booking("OLD"), createdAt: "2026-10-01T10:00:00Z" };
    const newer = {
      ...booking("NEW"),
      createdAt: "2026-10-03T10:00:00Z",
      status: "cancelled" as const,
    };
    const metrics = dailyBookingMetrics([older, newer], "2026-10-03");
    assert.equal(metrics.recent[0]?.ref, "NEW");
    assert.equal(metrics.travelling.length, 2);
  });
});

describe("Phase 6B2B — Schedule Fleet Identity & Source Guard", () => {
  it("parses schedule with optional aircraftId and preserves backwards compatibility", () => {
    const rawLegacy = {
      id: "legacy-sched-1",
      number: "PS100",
      direction: "out",
      destination: "AMM",
      days: [1, 3, 5],
      departTime: "08:00",
      arriveTime: "09:00",
      aircraft: "Airbus A320neo",
      from: "2026-01-01",
      until: "2026-12-31",
      active: true,
      exceptions: [],
    };
    const parsedLegacy = parseSchedule(rawLegacy);
    assert.equal(parsedLegacy.aircraft, "Airbus A320neo");
    assert.equal(parsedLegacy.aircraftId, undefined);

    const withFleetId = {
      ...rawLegacy,
      id: "new-sched-1",
      aircraftId: "a320neo",
    };
    const parsedWithFleet = parseSchedule(withFleetId);
    assert.equal(parsedWithFleet.aircraftId, "a320neo");
  });

  it("source guard: admin schedules route does NOT use ops.aircraft", () => {
    const schedulesSource = readFileSync(new URL("../../src/routes/{-$locale}.admin.schedules.tsx", import.meta.url), "utf8");
    assert.equal(schedulesSource.includes("ops.aircraft"), false, "Admin schedules must not reference ops.aircraft");
  });
});
