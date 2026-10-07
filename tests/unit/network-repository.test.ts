import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LocalNetworkRepository } from "../../src/lib/network/repository.ts";
import { NetworkStorageCoordinator, NETWORK_STORAGE_KEY } from "../../src/lib/network/storage.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { networkStorageSchema } from "../../src/lib/network/schema.ts";
import { NETWORK_CODES, NetworkError, type NetworkDestinationPatch } from "../../src/lib/network/types.ts";
import { destinations, departuresOn, arrivalsOn } from "../../src/lib/data.ts";
import { plannedWeeklyDepartures } from "../../src/lib/network/planning.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { StorageCommitError } from "../../src/lib/repositories/storage.ts";
import { createRepositories, getIsolatedStudioRepositories, resetIsolatedStudioRepositories } from "../../src/lib/repositories/registry.ts";
import { networkEn, networkAr } from "../../src/lib/i18n-network.ts";
import { LocalScheduleRepository, ScheduleIdentityConflictError } from "../../src/lib/schedules/repository.ts";
import { ScheduleStorageCoordinator, SCHEDULE_STORAGE_KEY } from "../../src/lib/schedules/storage.ts";
import { parseSchedule, ScheduleValidationError } from "../../src/lib/schedules/schema.ts";
import type { ScheduleUpdateInput } from "../../src/lib/schedules/types.ts";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { FleetStorageCoordinator, FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";

export class NetworkTestStorage implements Storage {
  values = new Map<string, string>();
  writes = 0;
  reads: string[] = [];
  fail = false;
  get length() { return this.values.size; }
  getItem(key: string) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error("quota"); this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
function setup(storage = new NetworkTestStorage()) {
  const coordinator = new NetworkStorageCoordinator({ storage });
  return { storage, coordinator, repo: new LocalNetworkRepository(coordinator) };
}
function locked() {
  let queue: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  const locks = { request: (name: string, _options: unknown, callback: () => unknown) => {
    names.push(name); const next = queue.then(callback); queue = next.catch(() => {}); return next;
  } } as unknown as Pick<LockManager, "request">;
  return { locks, names };
}

describe("C1 Network reference storage and commands", () => {
  it("missing key exposes all seven exact compiled operational seeds, no read-write", async () => {
    const { storage, repo } = setup();
    assert.deepEqual(await repo.list(), destinations.map(d => ({ code: d.code, airportName: d.name, city: d.city, country: d.country, timezone: d.tz, blockMinutes: d.flightMinutes, active: true })));
    assert.equal(storage.writes, 0);
    assert.equal(storage.getItem(NETWORK_STORAGE_KEY), null);
    assert.deepEqual((await repo.list()).map(d => d.code), [...NETWORK_CODES]);
  });
  it("stored operational edits are authoritative and survive a new coordinator", async () => {
    const { storage, repo } = setup();
    await repo.update("AMM", { blockMinutes: 123, active: false });
    assert.equal((await setup(storage).repo.getByCode("AMM"))!.blockMinutes, 123);
    assert.equal((await setup(storage).repo.getByCode("AMM"))!.active, false);
    assert.equal(JSON.parse(storage.getItem(NETWORK_STORAGE_KEY)!).revision, 1);
  });
  it("normalized no-op does not write, revise, or notify, including absent storage", async () => {
    const { repo, storage, coordinator } = setup(); let events = 0;
    coordinator.subscribe(() => events++);
    const original = (await repo.getByCode("AMM"))!;
    await repo.update("AMM", { city: { en: ` ${original.city.en} `, ar: original.city.ar } });
    assert.equal(storage.writes, 0); assert.equal(events, 0);
    await repo.update("AMM", { blockMinutes: 91 });
    const bytes = storage.getItem(NETWORK_STORAGE_KEY), count = storage.writes;
    await repo.update("AMM", { blockMinutes: 91 });
    assert.equal(storage.writes, count); assert.equal(storage.getItem(NETWORK_STORAGE_KEY), bytes); assert.equal(events, 1);
  });
  for (const [name, raw] of [
    ["malformed JSON", "{"], ["unsupported schema", JSON.stringify({ ...seedNetworkEnvelope(), schemaVersion: 2 })],
    ["duplicate code", JSON.stringify({ ...seedNetworkEnvelope(), destinations: seedNetworkEnvelope().destinations.map(d => ({ ...d, code: "AMM" })) })],
    ["missing route", JSON.stringify({ ...seedNetworkEnvelope(), destinations: seedNetworkEnvelope().destinations.slice(1) })],
    ["extra route", JSON.stringify({ ...seedNetworkEnvelope(), destinations: [...seedNetworkEnvelope().destinations, { ...seedNetworkEnvelope().destinations[0], code: "LHR" }] })],
    ["unknown replacement route", JSON.stringify({ ...seedNetworkEnvelope(), destinations: seedNetworkEnvelope().destinations.map(d => ({ ...d, code: d.code === "AMM" ? "XXX" : d.code })) })],
    ["invalid revision", JSON.stringify({ ...seedNetworkEnvelope(), revision: -1 })],
  ]) it(`${name} fails closed without overwriting`, async () => {
    const { storage, coordinator, repo } = setup(); storage.setItem(NETWORK_STORAGE_KEY, raw!); let events = 0;
    coordinator.subscribe(() => events++); const writes = storage.writes;
    await assert.rejects(repo.list(), (error: unknown) => error instanceof NetworkError && error.code === "network_unavailable");
    await assert.rejects(repo.update("AMM", { active: false }), NetworkError);
    assert.equal(storage.getItem(NETWORK_STORAGE_KEY), raw); assert.equal(storage.writes, writes); assert.equal(events, 0);
  });
  for (const patch of [
    { timezone: "Not/A_Zone" }, { timezone: "+02:00" }, { blockMinutes: 19 }, { blockMinutes: 601 }, { blockMinutes: 90.5 },
    { city: { en: " ", ar: "عمّان" } }, { airportName: { en: "x".repeat(161), ar: "المطار" } },
    { priceFrom: 1 }, { days: [1] }, { weeklyFlights: 1 }, { seo: "fake" }, { published: true },
  ]) it(`rejects invalid or foreign field ${JSON.stringify(patch).slice(0, 70)}`, async () => {
    const { storage, repo } = setup(); await assert.rejects(repo.update("AMM", patch as NetworkDestinationPatch), NetworkError); assert.equal(storage.writes, 0);
  });
  it("code cannot be changed and lifecycle has no create/remove authority", async () => {
    const { repo } = setup(); await assert.rejects(repo.update("AMM", { code: "CAI" } as unknown as NetworkDestinationPatch), NetworkError);
    assert.equal("create" in repo, false); assert.equal("remove" in repo, false);
    await repo.update("AMM", { active: false }); assert.equal((await repo.getByCode("AMM"))!.active, false);
    assert.equal(await repo.getByCode("XXX"), null);
  });
  it("quota failure rolls back, emits no notification, and retry commits", async () => {
    const { storage, coordinator, repo } = setup(); let events = 0; coordinator.subscribe(() => events++);
    const before = await repo.list(); storage.fail = true;
    await assert.rejects(repo.update("AMM", { active: false }), StorageCommitError);
    assert.deepEqual(await repo.list(), before); assert.equal(events, 0); assert.equal(storage.writes, 0);
    storage.fail = false; await repo.update("AMM", { active: false }); assert.equal(events, 1); assert.equal(storage.writes, 1);
  });
  it("independent coordinators serialize through the origin lock and reread canonical state", async () => {
    const storage = new NetworkTestStorage(), { locks, names } = locked();
    const a = new LocalNetworkRepository(new NetworkStorageCoordinator({ storage, locks }));
    const b = new LocalNetworkRepository(new NetworkStorageCoordinator({ storage, locks }));
    await Promise.all([a.update("AMM", { active: false }), b.update("AMM", { blockMinutes: 111 })]);
    const record = (await a.getByCode("AMM"))!;
    assert.equal(record.active, false); assert.equal(record.blockMinutes, 111);
    assert.equal(JSON.parse(storage.getItem(NETWORK_STORAGE_KEY)!).revision, 2); assert.deepEqual(names, [NETWORK_STORAGE_KEY, NETWORK_STORAGE_KEY]);
  });
  it("returned objects cannot mutate canonical state", async () => {
    const { repo } = setup(); const list = await repo.list(); list[0]!.city.en = "forged";
    const result = await repo.update("AMM", { blockMinutes: 122 }); result.city.en = "forged";
    assert.notEqual((await repo.getByCode("AMM"))!.city.en, "forged");
  });
  it("storage event invalidates readers without adopting a corrupt fallback", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window"); const storage = new NetworkTestStorage();
    const fake = Object.assign(new EventTarget(), { location: { search: "" }, localStorage: storage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
    try {
      const coordinator = new NetworkStorageCoordinator({ storage, locks: locked().locks }); const repo = new LocalNetworkRepository(coordinator); let events = 0;
      coordinator.subscribe(() => events++);
      const envelope = seedNetworkEnvelope(); envelope.destinations[0]!.active = false;
      storage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(envelope));
      fake.dispatchEvent(Object.assign(new Event("storage"), { key: NETWORK_STORAGE_KEY, storageArea: storage }));
      assert.equal(events, 1); assert.equal((await repo.getByCode("AMM"))!.active, false);
      storage.setItem(NETWORK_STORAGE_KEY, "{"); fake.dispatchEvent(Object.assign(new Event("storage"), { key: NETWORK_STORAGE_KEY, storageArea: storage }));
      await assert.rejects(repo.list(), NetworkError); coordinator.destroy();
    } finally { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); }
  });
  it("factory fixtures coexist and explicit Network coordinator takes precedence", async () => {
    const network = seedNetworkEnvelope(); network.revision = 6; network.destinations[0]!.blockMinutes = 111;
    const repositories = createRepositories({ inMemoryOnly: true, initialSchedules: [], initialNetworkData: network });
    assert.equal((await repositories.network.getByCode("AMM"))!.blockMinutes, 111); assert.deepEqual(await repositories.schedule.list(), []);
    const explicit = new NetworkStorageCoordinator({ inMemoryOnly: true });
    assert.equal((await createRepositories({ inMemoryOnly: true, initialNetworkData: network, networkCoordinator: explicit }).network.getByCode("AMM"))!.blockMinutes, destinations[0]!.flightMinutes);
  });
  it("Studio registry remains independent from corrupt browser Network storage", async () => {
    const storage = new NetworkTestStorage(); storage.setItem(NETWORK_STORAGE_KEY, "{");
    const isolated = createRepositories({ inMemoryOnly: true, storage }); await isolated.network.update("AMM", { blockMinutes: 111 });
    assert.equal(storage.getItem(NETWORK_STORAGE_KEY), "{");
    resetIsolatedStudioRepositories(); assert.equal((await getIsolatedStudioRepositories().network.list()).length, 7);
    resetIsolatedStudioRepositories();
  });
  it("Network edits do not materialize or change public dated services", async () => {
    const before = [departuresOn("2026-11-01"), arrivalsOn("2026-11-01")];
    const { repo } = setup(); await repo.update("AMM", { active: false, blockMinutes: 600, city: { en: "Different", ar: "مدينة" } });
    assert.deepEqual([departuresOn("2026-11-01"), arrivalsOn("2026-11-01")], before);
  });
  it("planning frequency sums active outbound day occurrences without commercial/network duplication", () => {
    const s = seedSchedules()[0]!;
    assert.equal(plannedWeeklyDepartures("AMM", [{ ...s, days: [0, 1, 2, 3, 4, 5, 6] }, { ...s, id: "2", days: [0, 1, 2, 3, 4, 5, 6] }, { ...s, id: "3", direction: "in" }, { ...s, id: "4", active: false }]), 14);
  });
});

describe("C1 authority and localization source guards", () => {
  const source = (file: string) => readFileSync(file, "utf8");
  it("AdminProvider has no product-domain OpsState or compatibility writer", () => {
    const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(path, entry.name)] : []);
    for (const file of walk("src")) assert.doesNotMatch(source(file), /ops\.destinations|patchOps\s*\(\s*["']destinations|seedOpsState|DestinationConfig|useAdmin\(\)\.ops/, file);
    assert.doesNotMatch(source("src/lib/admin-store.tsx"), /\bOpsState\b|\bpatchOps\b|\bops:/);
  });
  it("persisted Network excludes merchandising, schedules, content and equipment", () => {
    const forbidden = /priceFrom|weeklyFlights|\bdays\b|blurb|description|goodToKnow|featured|published|seo|aircraft|media|scheduleIds/;
    assert.doesNotMatch(source("src/lib/network/types.ts"), forbidden);
    assert.doesNotMatch(source("src/lib/network/schema.ts"), forbidden);
    assert.doesNotMatch(source("src/lib/network/seed.ts"), forbidden);
    assert.equal(networkStorageSchema.safeParse({ ...seedNetworkEnvelope(), priceFrom: 1 }).success, false);
    assert.doesNotMatch(source("src/lib/schedules/schema.ts"), /destinations|data\.ts/);
  });
  it("new strings have EN/AR parity and Fleet/Booking flight resolvers do not import Network", () => {
    assert.deepEqual(Object.keys(networkEn).sort(), Object.keys(networkAr).sort());
    assert.ok(networkAr["network.unavailable"]!.includes("الشبكة"));
    for (const file of ["src/lib/repositories/flight-repository.ts", "src/lib/repositories/booking-repository.ts", "src/lib/data.ts"]) assert.doesNotMatch(source(file), /from ["'][^"']*network\//);
    const page = source("src/routes/{-$locale}.admin.destinations.$code.tsx");
    assert.match(page, /key: "destinations.presentation"/);
    assert.match(page, /presentationCms\.save\(\)/);
    assert.match(page, /key: "destinations.editorial"/);
    assert.match(page, /editorialCms\.save\(\)/);
    assert.doesNotMatch(page, /import.*contentRepository/);
    assert.match(page, /search=\{\{ destination: code \}\}/);
  });
});

describe("C1 Schedule route identity and external-authority isolation", () => {
  function schedules() {
    const storage = new NetworkTestStorage();
    const network = setup(storage).repo;
    const fleet = new LocalFleetRepository(new FleetStorageCoordinator({ storage }));
    const coordinator = new ScheduleStorageCoordinator({ storage, initialSchedules: [] });
    const schedule = new LocalScheduleRepository(coordinator, fleet, network);
    const input = { ...structuredClone(seedSchedules()[0]!), id: "c1-new", aircraftId: "a320neo" };
    // Present empty list is authoritative; initialSchedules alone is a memory fixture.
    storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 0, schedules: [] }));
    return { storage, network, fleet, coordinator, schedule, input };
  }
  it("structural schema accepts a well-formed unknown code; repository rejects it", async () => {
    const { schedule, input } = schedules();
    assert.equal(parseSchedule({ ...input, destination: "XXX" }).destination, "XXX");
    await assert.rejects(schedule.create({ ...input, destination: "XXX" }), ScheduleValidationError);
    assert.deepEqual(await schedule.list(), []);
  });
  it("known inactive Network destinations may be planned", async () => {
    const { network, schedule, input } = schedules();
    await network.update("AMM", { active: false });
    assert.equal((await schedule.create(input)).destination, "AMM");
  });
  it("exact committed replay bypasses corrupt Network and Fleet, with zero write/revision/event", async () => {
    const { storage, coordinator, schedule, input } = schedules();
    const committed = await schedule.create(input); let events = 0; coordinator.subscribe(() => events++);
    storage.setItem(NETWORK_STORAGE_KEY, "{"); storage.setItem(FLEET_STORAGE_KEY, "broken");
    const bytes = storage.getItem(SCHEDULE_STORAGE_KEY), count = storage.writes; storage.reads = [];
    assert.deepEqual(await schedule.create(committed), committed);
    assert.equal(storage.writes, count); assert.equal(events, 0); assert.equal(storage.getItem(SCHEDULE_STORAGE_KEY), bytes);
    assert.equal(storage.reads.includes(NETWORK_STORAGE_KEY), false); assert.equal(storage.reads.includes(FLEET_STORAGE_KEY), false);
    assert.equal(storage.getItem(NETWORK_STORAGE_KEY), "{"); assert.equal(storage.getItem(FLEET_STORAGE_KEY), "broken");
    await assert.rejects(schedule.create({ ...committed, number: "PS777" }), ScheduleIdentityConflictError);
    await assert.rejects(schedule.create({ ...committed, id: "first-time" }), NetworkError);
  });
  for (const patch of [{ destination: "CAI" }, { direction: "in" }, { id: "different" }]) {
    it(`existing Schedule rejects identity change ${JSON.stringify(patch)} without writes`, async () => {
      const { storage, schedule, input } = schedules(); const original = await schedule.create(input); const writes = storage.writes;
      await assert.rejects(schedule.update(original.id, patch as unknown as ScheduleUpdateInput), ScheduleValidationError);
      assert.deepEqual(await schedule.getById(original.id), original); assert.equal(storage.writes, writes);
    });
  }
  it("existing stored schedules and safe edits survive corrupt Network and Fleet", async () => {
    const { storage, schedule, input } = schedules(); await schedule.create(input);
    storage.setItem(NETWORK_STORAGE_KEY, "{"); storage.setItem(FLEET_STORAGE_KEY, "{"); storage.reads = [];
    assert.equal((await schedule.list()).length, 1);
    const updated = await schedule.update(input.id, { number: "PS777", departTime: "09:00", arriveTime: "11:00", days: [0, 2], from: "2026-02-01", until: "2026-11-01" });
    assert.equal(updated.number, "PS777"); assert.deepEqual(updated.days, [0, 2]);
    assert.equal(storage.reads.includes(NETWORK_STORAGE_KEY), false); assert.equal(storage.reads.includes(FLEET_STORAGE_KEY), false);
  });
  it("concurrent same-identity creates preserve the transactional duplicate guard", async () => {
    const { storage, network, fleet, input } = schedules();
    const coordinator = new ScheduleStorageCoordinator({ storage }); const schedule = new LocalScheduleRepository(coordinator, fleet, network); let events = 0;
    coordinator.subscribe(() => events++);
    const writes = storage.writes; const results = await Promise.all([schedule.create(input), schedule.create(input)]);
    assert.deepEqual(results[0], results[1]); assert.equal((await schedule.list()).length, 1); assert.equal(storage.writes, writes + 1); assert.equal(events, 1);
  });
});
