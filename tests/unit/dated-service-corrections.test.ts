import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  datedServiceId,
  parseDatedServiceId,
  fromBase64Url,
} from "../../src/lib/dated-services/identity.ts";
import {
  materializeScheduleOnDate,
  materializeSchedulesOnDate,
} from "../../src/lib/dated-services/materializer.ts";
import { DatedServiceMaterializationError } from "../../src/lib/dated-services/types.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { parseSchedule, ScheduleValidationError } from "../../src/lib/schedules/schema.ts";
import {
  ScheduleStorageCoordinator,
  SCHEDULE_STORAGE_KEY,
  parseScheduleStorage,
} from "../../src/lib/schedules/storage.ts";
import {
  LocalScheduleRepository,
  ScheduleIdentityConflictError,
} from "../../src/lib/schedules/repository.ts";
import { FleetStorageCoordinator, FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { LocalNetworkRepository } from "../../src/lib/network/repository.ts";
import { NetworkStorageCoordinator, NETWORK_STORAGE_KEY } from "../../src/lib/network/storage.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import type { Schedule, ScheduleException } from "../../src/lib/schedules/types.ts";

const date = "2026-10-06",
  extraDate = "2026-10-07",
  now = "2026-10-05T09:00:00Z";
const network = seedNetworkEnvelope().destinations.find((d) => d.code === "AMM")!;
const schedule = (): Schedule => ({
  ...structuredClone(seedSchedules()[0]!),
  id: "effects-proof",
  aircraftId: "a320neo",
  aircraft: "Airbus A320neo",
  days: [2],
  from: "2026-01-01",
  until: "2026-12-31",
  exceptions: [],
});
const aircraftEffect = (id = "a321neo", aircraft = "Airbus A321neo"): ScheduleException => ({
  id: "equipment",
  date,
  kind: "aircraft",
  detail: "note",
  effect: { aircraftId: id, aircraft },
});
const timeEffect = (): ScheduleException => ({
  id: "time",
  date,
  kind: "time",
  detail: "note",
  effect: { departTime: "23:50", arriveTime: "01:20" },
});
const extraEffect = (effect = {}): ScheduleException => ({
  id: "extra",
  date: extraDate,
  kind: "extra",
  detail: "note",
  effect,
});
const cancelled = (): ScheduleException => ({
  id: "cancel",
  date,
  kind: "cancelled",
  detail: "note",
  effect: { cancelled: true },
});
class MemoryStorage {
  values = new Map<string, string>();
  writes = 0;
  fail = false;
  get length() {
    return this.values.size;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  clear() {
    this.values.clear();
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error("quota");
    this.writes++;
    this.values.set(k, v);
  }
}
function rig(initial: Schedule[] = []) {
  const storage = new MemoryStorage();
  storage.values.set(
    SCHEDULE_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, revision: 0, schedules: initial }),
  );
  const coord = new ScheduleStorageCoordinator({ storage });
  const fleet = new LocalFleetRepository(new FleetStorageCoordinator({ storage }));
  const network = new LocalNetworkRepository(new NetworkStorageCoordinator({ storage }));
  const repo = new LocalScheduleRepository(coord, fleet, network);
  let events = 0;
  repo.subscribe(() => events++);
  return { storage, coord, fleet, network, repo, events: () => events };
}
const projection = (s: Schedule, d = date) =>
  materializeScheduleOnDate({ schedule: s, network, date: d, basePrice: 150, now });

for (const id of ["\ufeffstart", "emoji-\ud83d\ude80", " punctuation /?= ", "x".repeat(160)])
  test(`exact Node/browser identity roundtrip ${JSON.stringify(id)}`, () => {
    const nodeId = datedServiceId(id, "0099-01-01");
    assert.deepEqual(parseDatedServiceId(nodeId), { scheduleId: id, date: "0099-01-01" });
    const saved = globalThis.Buffer;
    try {
      globalThis.Buffer = undefined as unknown as typeof Buffer;
      assert.equal(datedServiceId(id, "0099-01-01"), nodeId);
      assert.deepEqual(parseDatedServiceId(nodeId), { scheduleId: id, date: "0099-01-01" });
    } finally {
      globalThis.Buffer = saved;
    }
  });
for (const id of ["\ud800", "\udfff", "x\ud800y"])
  test("reject unpaired surrogate " + JSON.stringify(id), () =>
    assert.throws(() => datedServiceId(id, date)),
  );
for (const token of ["_w", "wK8", "YQ=", "YR", "a", "7aCA"])
  test("reject malformed or noncanonical payload " + token, () =>
    assert.equal(fromBase64Url(token), null),
  );
test("price, identity and simulation remain stable across mutable operational fields", () => {
  const s = schedule(),
    a = projection(s)!;
  const altered = materializeScheduleOnDate({
    schedule: {
      ...s,
      number: "PS 999",
      departTime: "22:30",
      aircraftId: "a321neo",
      aircraft: "Airbus A321neo",
    },
    network: { ...network, blockMinutes: 199, city: { en: "Changed", ar: "Changed" } },
    date,
    basePrice: 150,
    now,
  })!;
  for (const field of ["id", "basePrice", "gate", "terminal", "seatsLeft", "status"] as const)
    assert.equal(a[field], altered[field]);
  assert.equal(altered.durationMinutes, 199);
  assert.ok(Number.isFinite(a.basePrice));
  assert.deepEqual(
    materializeSchedulesOnDate({
      schedules: [s],
      networks: [network],
      routePrices: { AMM: 150 },
      date,
      now,
    }),
    [a],
  );
});
for (const price of [undefined, NaN, Infinity, -1])
  test("invalid explicit price fails " + price, () => {
    assert.throws(
      () =>
        materializeScheduleOnDate({
          schedule: schedule(),
          network,
          date,
          basePrice: price as number,
          now,
        }),
      (e: unknown) => e instanceof DatedServiceMaterializationError && e.code === "invalid_price",
    );
  });
test("bulk missing price never derives price from duration", () =>
  assert.throws(
    () => materializeSchedulesOnDate({ schedules: [schedule()], networks: [network], date, now }),
    /merchandising price/,
  ));
test("duplicate schedule identity rejects contradictory input", () =>
  assert.throws(
    () =>
      materializeSchedulesOnDate({
        schedules: [schedule(), { ...schedule(), number: "PS 999" }],
        networks: [network],
        date,
        defaultBasePrice: 150,
        now,
      }),
    (e: unknown) =>
      e instanceof DatedServiceMaterializationError && e.code === "duplicate_schedule",
  ));
test("numeric epoch is explicit and invalid clock fails", () => {
  const s = schedule();
  assert.deepEqual(
    materializeScheduleOnDate({ schedule: s, network, date, basePrice: 150, now: 0 }),
    materializeScheduleOnDate({
      schedule: s,
      network,
      date,
      basePrice: 150,
      now: "1970-01-01T00:00:00Z",
    }),
  );
  assert.throws(
    () => materializeScheduleOnDate({ schedule: s, network, date, basePrice: 150, now: "invalid" }),
    (e: unknown) => e instanceof DatedServiceMaterializationError && e.code === "invalid_clock",
  );
});
test("legacy annotation outside effective range preserves exact storage bytes and prose", async () => {
  const s = schedule();
  s.exceptions = [
    { id: "legacy", date: "2025-01-01", kind: "cancelled", detail: "cancel flight at 12:00" },
  ];
  const r = rig([s]),
    bytes = r.storage.getItem(SCHEDULE_STORAGE_KEY);
  assert.ok(parseScheduleStorage(bytes!));
  assert.deepEqual(await r.repo.getById(s.id), s);
  assert.equal(r.storage.writes, 0);
  assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), bytes);
  await r.repo.update(s.id, { number: "PS 901" });
  assert.deepEqual((await r.repo.getById(s.id))?.exceptions, s.exceptions);
  assert.equal(
    projection({ ...s, exceptions: [{ ...s.exceptions[0]!, date }] })!.status,
    "Scheduled",
  );
  assert.throws(
    () =>
      parseSchedule({ ...s, exceptions: [{ ...s.exceptions[0], effect: { cancelled: true } }] }),
    ScheduleValidationError,
  );
});
for (const effect of [
  {},
  { departTime: "23:00" },
  { arriveTime: "00:10" },
  { departTime: "23:00", arriveTime: "00:10" },
])
  test("extra optional independent overrides " + JSON.stringify(effect), () => {
    const s = parseSchedule({ ...schedule(), exceptions: [extraEffect(effect)] }),
      f = projection(s, extraDate)!;
    assert.equal(f.departTime, effect.departTime ?? s.departTime);
    assert.equal(f.arriveTime, effect.arriveTime ?? s.arriveTime);
    assert.equal(f.aircraftId, s.aircraftId);
  });
for (const effect of [{ aircraftId: "a321neo" }, { aircraft: "Airbus A321neo" }])
  test("extra equipment requires pair " + JSON.stringify(effect), () => {
    assert.throws(
      () => parseSchedule({ ...schedule(), exceptions: [extraEffect(effect)] }),
      (e: unknown) =>
        e instanceof ScheduleValidationError &&
        e.issues.some((i) => i.path.join(".").startsWith("exceptions.0.effect.aircraft")),
    );
  });
for (const [name, effects] of [
  ["cancellation+time", [cancelled(), timeEffect()]],
  ["duplicate time", [timeEffect(), { ...timeEffect(), id: "time2" }]],
  ["duplicate aircraft", [aircraftEffect(), { ...aircraftEffect(), id: "eq2" }]],
  ["duplicate extra", [extraEffect(), { ...extraEffect(), id: "extra2" }]],
  ["extra on recurring day", [{ ...extraEffect(), date }]],
  ["normal effect on non-recurring day", [{ ...timeEffect(), date: extraDate }]],
  ["out of range effect", [{ ...cancelled(), date: "2027-01-01" }]],
] as [string, ScheduleException[]][])
  test("reject operational conflict " + name, () =>
    assert.throws(
      () => parseSchedule({ ...schedule(), exceptions: effects }),
      ScheduleValidationError,
    ),
  );
test("time+aircraft combine, annotations may coexist, cancellation retains identity", () => {
  const base = projection(schedule())!;
  const s = parseSchedule({
    ...schedule(),
    exceptions: [
      timeEffect(),
      aircraftEffect(),
      { ...cancelled(), id: "annotation", effect: undefined },
    ],
  });
  const f = projection(s)!;
  assert.equal(f.id, base.id);
  assert.equal(f.departTime, "23:50");
  assert.equal(f.arriveTime, "01:20");
  assert.equal(f.aircraftId, "a321neo");
  const c = projection(parseSchedule({ ...schedule(), exceptions: [cancelled()] }))!;
  assert.equal(c.id, base.id);
  assert.equal(c.status, "Cancelled");
});
for (const [id, model] of [
  ["a321neo", "Airbus A321neo"],
  ["unknown", "Unknown"],
  ["b737800", "Boeing 737-800"],
  ["a321neo", "Wrong model"],
])
  test("command validates new effect aircraft " + id + model, async () => {
    const r = rig(),
      s = { ...schedule(), exceptions: [aircraftEffect(id, model)] };
    if (id === "a321neo" && model === "Airbus A321neo") {
      const before = structuredClone(s);
      assert.deepEqual(await r.repo.create(s), parseSchedule(s));
      assert.deepEqual(s, before);
    } else {
      await assert.rejects(
        r.repo.create(s),
        (e: unknown) =>
          e instanceof ScheduleValidationError &&
          e.issues[0]?.path.join(".") === "exceptions.0.effect.aircraftId",
      );
      assert.equal(r.storage.writes, 0);
      assert.equal(r.events(), 0);
    }
  });
test("structured exact replay bypasses corrupt dependencies and conflict rejects before reads", async () => {
  const r = rig(),
    committed = await r.repo.create({ ...schedule(), exceptions: [aircraftEffect()] });
  r.storage.values.set(FLEET_STORAGE_KEY, "{");
  r.storage.values.set(NETWORK_STORAGE_KEY, "{");
  let reads = 0;
  r.fleet.get = async () => {
    reads++;
    throw new Error("no Fleet read");
  };
  r.network.getByCode = async () => {
    reads++;
    throw new Error("no Network read");
  };
  const writes = r.storage.writes,
    events = r.events();
  assert.deepEqual(await r.repo.create(committed), committed);
  await assert.rejects(
    r.repo.create({ ...committed, number: "PS 999" }),
    ScheduleIdentityConflictError,
  );
  assert.equal(reads, 0);
  assert.equal(r.storage.writes, writes);
  assert.equal(r.events(), events);
  assert.equal(r.storage.getItem(FLEET_STORAGE_KEY), "{");
  assert.equal(r.storage.getItem(NETWORK_STORAGE_KEY), "{");
});
test("unchanged stored equipment survives inactive/corrupt Fleet and detached input", async () => {
  const r = rig(),
    s = await r.repo.create({ ...schedule(), exceptions: [aircraftEffect()] });
  await r.fleet.updateAircraft("a321neo", { active: false });
  await r.repo.update(s.id, { exceptions: [{ ...s.exceptions[0]!, detail: "new note" }] });
  r.storage.values.set(FLEET_STORAGE_KEY, "{");
  await r.repo.update(s.id, {
    departTime: "09:01",
    exceptions: [{ ...(await r.repo.getById(s.id))!.exceptions[0]!, detail: "another note" }],
  });
  assert.equal((await r.repo.getById(s.id))!.exceptions[0]!.effect?.aircraftId, "a321neo");
});
test("caller mutation while coordinator commit waits cannot change captured effect", async () => {
  const s = { ...schedule(), exceptions: [aircraftEffect("a320neo", "Airbus A320neo")] },
    r = rig([s]);
  const mutate = r.coord.mutate.bind(r.coord);
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve)),
    queued = new Promise<void>((resolve) => (entered = resolve));
  r.coord.mutate = async (fn) => {
    entered();
    await held;
    return mutate(fn);
  };
  const patch = { exceptions: structuredClone(s.exceptions) },
    before = structuredClone(patch);
  const pending = r.repo.update(s.id, patch);
  await queued;
  assert.deepEqual(patch, before);
  Object.assign(patch.exceptions[0]!.effect!, {
    aircraftId: "b737800",
    aircraft: "Boeing 737-800",
  });
  release();
  assert.equal((await pending).exceptions[0]!.effect?.aircraftId, "a320neo");
  assert.equal(r.storage.writes, 0);
});
test("locked reread rejects stale unchanged-equipment assumption", async () => {
  const s = { ...schedule(), exceptions: [aircraftEffect()] },
    r = rig([s]);
  const mutate = r.coord.mutate.bind(r.coord);
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve)),
    queued = new Promise<void>((resolve) => (entered = resolve));
  r.coord.mutate = async (fn) => {
    entered();
    await held;
    return mutate(fn);
  };
  const pending = r.repo.update(s.id, {
    exceptions: [{ ...s.exceptions[0]!, detail: "stale edit" }],
  });
  await queued;
  const changed = { ...s, exceptions: [aircraftEffect("a320neo", "Airbus A320neo")] };
  r.storage.values.set(
    SCHEDULE_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, revision: 1, schedules: [changed] }),
  );
  release();
  await assert.rejects(pending, ScheduleIdentityConflictError);
  assert.equal(r.storage.writes, 0);
  assert.deepEqual(await r.repo.getById(s.id), changed);
});
test("simultaneous duplicate create commits only once; conflicting payload fails", async () => {
  const r = rig(),
    s = { ...schedule(), exceptions: [timeEffect()] };
  const [a, b] = await Promise.all([r.repo.create(s), r.repo.create(s)]);
  assert.deepEqual(a, b);
  assert.equal(r.storage.writes, 1);
  assert.equal(r.events(), 1);
  await assert.rejects(r.repo.create({ ...s, number: "PS 999" }), ScheduleIdentityConflictError);
});
test("effect write failure preserves canonical bytes, draft and notifications, then retry", async () => {
  const r = rig([schedule()]),
    bytes = r.storage.getItem(SCHEDULE_STORAGE_KEY),
    patch = { exceptions: [timeEffect()] },
    before = structuredClone(patch);
  r.storage.fail = true;
  await assert.rejects(r.repo.update(schedule().id, patch));
  assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), bytes);
  assert.equal(r.events(), 0);
  assert.deepEqual(patch, before);
  r.storage.fail = false;
  assert.deepEqual((await r.repo.update(schedule().id, patch)).exceptions, before.exceptions);
  assert.equal(r.events(), 1);
});
test("pure materializer and lifecycle guards remain repository independent", () => {
  const source = (p: string) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
  for (const file of ["materializer", "simulation", "identity"])
    assert.doesNotMatch(
      source("src/lib/dated-services/" + file + ".ts"),
      /from\s+["'][^"']*(react|tanstack|repositories|repository-provider|admin-store)[^"']*["']|\blocalStorage\b(?=\s*[.(])/,
    );
  assert.doesNotMatch(
    source("src/lib/schedules/queries.ts"),
    /useDeleteScheduleMutation|deleteSchedule/,
  );
  for (const dict of [adminEn, adminAr])
    for (const key of [
      "adm.sch.error.exceptions.aircraftId",
      "adm.sch.error.exceptions.extraDate",
      "adm.sch.useScheduleAircraft",
    ])
      assert.ok(dict[key] && dict[key] !== key);
});

test("Network and Schedule lifecycle changes preserve the service identity on restoration", () => {
  const s = schedule(),
    first = projection(s)!;
  assert.equal(
    materializeScheduleOnDate({
      schedule: s,
      network: { ...network, active: false },
      date,
      basePrice: 150,
      now,
    }),
    null,
  );
  assert.equal(projection({ ...s, active: false }), null);
  for (const patch of [{ days: [1] }, { from: "2026-11-01" }, { until: "2026-09-01" }]) {
    assert.equal(projection({ ...s, ...patch }), null);
    assert.equal(datedServiceId({ ...s, ...patch }.id, date), first.id);
  }
  assert.deepEqual(projection(s), first);
});
test("changed extra equipment validates Fleet; unchanged equipment permits optional time edits during failure", async () => {
  const r = rig(),
    s = await r.repo.create({
      ...schedule(),
      exceptions: [extraEffect({ aircraftId: "a320neo", aircraft: "Airbus A320neo" })],
    });
  r.storage.values.set(FLEET_STORAGE_KEY, "{");
  const patch = {
    exceptions: [
      {
        ...s.exceptions[0]!,
        effect: { aircraftId: "a320neo", aircraft: "Airbus A320neo", departTime: "22:40" },
      },
    ],
  };
  assert.equal((await r.repo.update(s.id, patch)).exceptions[0]?.effect?.departTime, "22:40");
  const bytes = r.storage.getItem(SCHEDULE_STORAGE_KEY),
    events = r.events();
  await assert.rejects(
    r.repo.update(s.id, {
      exceptions: [extraEffect({ aircraftId: "a321neo", aircraft: "Airbus A321neo" })],
    }),
  );
  assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), bytes);
  assert.equal(r.events(), events);
});

test("update normalizes detached structured equipment before Fleet validation", async () => {
  const r = rig([schedule()]);
  const patch = { exceptions: [aircraftEffect(" a321neo ", " Airbus A321neo ")] };
  const before = structuredClone(patch);
  const result = await r.repo.update(schedule().id, patch);
  assert.deepEqual(result.exceptions[0]!.effect, {
    aircraftId: "a321neo",
    aircraft: "Airbus A321neo",
  });
  assert.deepEqual(patch, before);
});
