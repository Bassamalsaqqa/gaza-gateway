import { en, ar } from "../../src/lib/i18n-public.ts";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LocalScheduleRepository, ScheduleIdentityConflictError } from "../../src/lib/schedules/repository.ts";
import { ScheduleStorageCoordinator, SCHEDULE_STORAGE_KEY } from "../../src/lib/schedules/storage.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { FleetStorageCoordinator, FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";
import { FleetError } from "../../src/lib/fleet/types.ts";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";
import { RepoStorageCoordinator, REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { LocalBookingRepository, getCanonicalOccupiedSeats } from "../../src/lib/repositories/booking-repository.ts";
import { createRepositories, getIsolatedStudioRepositories, resetIsolatedStudioRepositories } from "../../src/lib/repositories/registry.ts";
import { departuresOn, addDaysISO, todayISO, isSeatAvailable } from "../../src/lib/data.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { FROZEN_LEGACY_SEAT_LAYOUT, normalizeBooking, type Booking } from "../../src/lib/domain/booking.ts";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  writes = new Map<string, number>();
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.set(k, (this.writes.get(k) ?? 0) + 1); this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
  clear() { this.values.clear(); }
}
function schedules() {
  const storage = new MemoryStorage();
  const fleet = new LocalFleetRepository(new FleetStorageCoordinator({ storage }));
  const coordinator = new ScheduleStorageCoordinator({ storage });
  const repo = new LocalScheduleRepository(coordinator, fleet);
  const input = { ...seedSchedules()[0]!, id: "review-schedule", aircraftId: "a320neo", aircraft: "Airbus A320neo" };
  return { storage, fleet, coordinator, repo, input };
}
function legacy(): Booking {
  const f = departuresOn(addDaysISO(todayISO(), 5)).find(f => f.status === "Scheduled" && f.seatsLeft > 2)!;
  assert.ok(f);
  return {
    ref: "GZA-REVIEW", createdAt: "2026-09-01T00:00:00Z", status: "confirmed",
    outbound: f, criteria: { tripType: "oneway", origin: f.originCode, destination: f.destinationCode, departDate: f.date, returnDate: "", adults: 1, children: 0, infants: 0, cabin: "economy" },
    fareId: "essential", passengers: [{ id: "pax-review", firstName: "Review", lastName: "Passenger", type: "adult", dob: "1980-01-01", nationality: "PS", document: "DOC123" }],
    seats: {}, extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] }, contact: { email: "review@example.ps", phone: "+970599000000" }, total: 345, ownerEmail: null,
  };
}
describe("Phase 6B2B independent review Correction 01", () => {
  for (const failure of ["corrupt", "inactive"] as const) {
    it(`exact Schedule replay bypasses ${failure} Fleet without writes/revision/events`, async () => {
      const r = schedules(); const created = await r.repo.create(r.input);
      if (failure === "corrupt") r.storage.setItem(FLEET_STORAGE_KEY, "{corrupt-fleet");
      else await r.fleet.updateAircraft("a320neo", { active: false });
      const bytes = r.storage.getItem(SCHEDULE_STORAGE_KEY); const fleetBytes = r.storage.getItem(FLEET_STORAGE_KEY);
      const writes = r.storage.writes.get(SCHEDULE_STORAGE_KEY); let events = 0;
      r.repo.subscribe(() => events++);
      const readFleet = r.fleet.get.bind(r.fleet); let fleetReads = 0;
      r.fleet.get = async () => { fleetReads++; return readFleet(); };
      assert.deepEqual(await r.repo.create(created), created);
      assert.equal(fleetReads, 0); assert.equal(events, 0); assert.equal(r.storage.writes.get(SCHEDULE_STORAGE_KEY), writes);
      assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), bytes); assert.equal(r.storage.getItem(FLEET_STORAGE_KEY), fleetBytes);
      await assert.rejects(r.repo.create({ ...created, id: "first-time" }), (error: unknown) => {
        assert.ok(error instanceof FleetError);
        assert.equal(error.reason, failure === "corrupt" ? "fleet_unavailable" : "inactive_aircraft");
        return true;
      });
      assert.equal(fleetReads, 1); assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), bytes);
      for (const patch of [{ departTime: "23:59" }, { number: "PS9999" }, { aircraft: "Different" }]) {
        await assert.rejects(r.repo.create({ ...created, ...patch }), ScheduleIdentityConflictError);
      }
      assert.equal(fleetReads, 1); assert.equal(events, 0);
    });
  }
  for (const conflicting of [false, true]) {
    it(`Schedule transaction repeats identity guard for a concurrent ${conflicting ? "conflict" : "replay"}`, async () => {
      const r = schedules();
      const other = new LocalScheduleRepository(new ScheduleStorageCoordinator({ storage: r.storage }), new LocalFleetRepository(new FleetStorageCoordinator({ storage: r.storage })));
      const get = r.fleet.get.bind(r.fleet);
      r.fleet.get = async () => {
        await other.create({ ...r.input, ...(conflicting ? { departTime: "23:59" } : {}) });
        return get();
      };
      let events = 0; r.repo.subscribe(() => events++);
      if (conflicting) await assert.rejects(r.repo.create(r.input), ScheduleIdentityConflictError);
      else assert.deepEqual(await r.repo.create(r.input), await other.getById(r.input.id));
      assert.equal(r.storage.writes.get(SCHEDULE_STORAGE_KEY), 1); assert.equal(events, 0);
    });
  }
  it("legacy check-in rejects without migration, seals frozen snapshot on success, and replay is no-write", async () => {
    const storage = new MemoryStorage(), b = legacy();
    storage.setItem(REPO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, bookings: [b], flightOverrides: {} }));
    const repo = new LocalBookingRepository(new RepoStorageCoordinator({ storage })); let events = 0;
    repo.subscribe(() => events++);
    const command = { ref: b.ref, leg: "out" as const, selectedPaxIndexes: [0], now: flightDepartureEpoch(b.outbound)! - 2 * 3600000 };
    const before = storage.getItem(REPO_STORAGE_KEY), writes = storage.writes.get(REPO_STORAGE_KEY)!;
    assert.equal((await repo.getByRef(b.ref))?.seatLayouts, undefined);
    await assert.rejects(repo.completeCheckIn({ ...command, documents: { 0: "" } }), /document/);
    assert.equal(storage.getItem(REPO_STORAGE_KEY), before); assert.equal(events, 0);
    const seat = Array.from({ length: 18 }, (_, i) => `${11 + i}A`).find(s => isSeatAvailable(b.outbound.id, Number(s.slice(0, -1)), "A"))!;
    const input = { ...command, seats: { 0: seat } };
    const checked = await repo.completeCheckIn(input);
    assert.deepEqual(checked.seatLayouts, { version: 1, out: FROZEN_LEGACY_SEAT_LAYOUT, in: undefined });
    assert.equal(checked.seatLayouts?.out.basis, "legacy");
    assert.equal(storage.writes.get(REPO_STORAGE_KEY), writes + 1); assert.equal(events, 1);
    const committed = storage.getItem(REPO_STORAGE_KEY);
    assert.deepEqual(await repo.completeCheckIn(input), normalizeBooking(checked));
    assert.equal(storage.getItem(REPO_STORAGE_KEY), committed); assert.equal(storage.writes.get(REPO_STORAGE_KEY), writes + 1); assert.equal(events, 1);
  });
  it("already checked snapshotless legacy replay does not seal or write", async () => {
    const storage = new MemoryStorage(), b = { ...legacy(), checkedIn: { out: [0], in: [] } };
    storage.setItem(REPO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, bookings: [b], flightOverrides: {} }));
    const repo = new LocalBookingRepository(new RepoStorageCoordinator({ storage }));
    let events = 0; repo.subscribe(() => events++);
    const bytes = storage.getItem(REPO_STORAGE_KEY), writes = storage.writes.get(REPO_STORAGE_KEY);
    const replay = await repo.completeCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0] });
    assert.equal(replay.seatLayouts, undefined);
    assert.equal(storage.getItem(REPO_STORAGE_KEY), bytes);
    assert.equal(storage.writes.get(REPO_STORAGE_KEY), writes); assert.equal(events, 0);
  });
  it("independent booking and Fleet fixture inputs coexist; explicit coordinator wins and Studio remains isolated", async () => {
    const b = legacy(), fleet = seedFleetEnvelope();
    fleet.revision = 7; fleet.aircraft[0]!.registration = "PS-REV";
    const storage = new MemoryStorage(); storage.setItem(FLEET_STORAGE_KEY, "{browser-corrupt");
    const initialData = { schemaVersion: 1 as const, bookings: [b], flightOverrides: {} };
    const repos = createRepositories({ inMemoryOnly: true, storage, initialData, initialFleetData: fleet });
    assert.equal((await repos.booking.getByRef(b.ref))?.total, b.total);
    assert.equal((await repos.fleet.get()).aircraft[0]?.registration, "PS-REV");
    assert.equal((await repos.fleet.get()).revision, 7);
    const explicit = new FleetStorageCoordinator({ inMemoryOnly: true, initialData: { ...fleet, revision: 9 } });
    assert.equal((await createRepositories({ inMemoryOnly: true, initialData, initialFleetData: fleet, fleetCoordinator: explicit }).fleet.get()).revision, 9);
    resetIsolatedStudioRepositories();
    try {
      const studio = getIsolatedStudioRepositories();
      assert.equal((await studio.fleet.get()).aircraft[0]?.registration, "PS-GZA");
      await studio.fleet.updateAircraft("a320neo", { registration: "PS-STU" });
      assert.equal((await repos.fleet.get()).aircraft[0]?.registration, "PS-REV");
      assert.equal(storage.getItem(FLEET_STORAGE_KEY), "{browser-corrupt");
    } finally { resetIsolatedStudioRepositories(); }
  });
  it("same physical flight occupied inbound collides with an outbound acquisition", async () => {
    const b = legacy();
    const seat = Array.from({ length: 18 }, (_, i) => `${11 + i}A`).find(s => isSeatAvailable(b.outbound.id, Number(s.slice(0, -1)), "A"))!;
    const other = { ...legacy(), ref: "GZA-OTHER", inbound: b.outbound, outbound: { ...b.outbound, id: "another-flight" }, seats: { "in-0": seat }, criteria: { ...b.criteria, tripType: "round" as const, returnDate: b.outbound.date } };
    const repo = new LocalBookingRepository(new RepoStorageCoordinator({ inMemoryOnly: true, initialData: { schemaVersion: 1, bookings: [b, other], flightOverrides: {} } }));
    assert.deepEqual(await repo.getOccupiedSeats(b.outbound.id), [seat]);
    assert.ok(getCanonicalOccupiedSeats([other], b.outbound.id).has(seat));
    assert.deepEqual(await repo.getOccupiedSeats(b.outbound.id, { excludeRef: other.ref }), []);
    await assert.rejects(repo.updateSeats(b.ref, { "out-0": seat }), /already occupied/);
    assert.deepEqual((await repo.getByRef(b.ref))?.seats, {});
  });
  for (const [locale, dictionary] of Object.entries({ en, ar })) {
    it(`seat workspace retains retry and uses dedicated ${locale} Fleet failure copy`, () => {
      const source = readFileSync(new URL("../../src/components/booking/seat-selection-workspace.tsx", import.meta.url), "utf8");
      const branch = source.slice(source.indexOf(") : fleetQuery.isError ? ("), source.indexOf(") : !layout ? ("));
      assert.match(branch, /t\("fleet\.error\.unavailable"\)/);
      assert.doesNotMatch(branch, /commercial\.error\.catalog_unavailable/);
      assert.match(branch, /role="alert"/);
      assert.match(branch, /fleetQuery\.refetch\(\)/);
      assert.ok(dictionary["fleet.error.unavailable"]);
      assert.notEqual(dictionary["fleet.error.unavailable"], dictionary["commercial.error.catalog_unavailable"]);
    });
  }
  it("production API/source has no writable generic check-in or leg occupancy filter", () => {
    const root = new URL("../../src/", import.meta.url);
    const files = readdirSync(root, { recursive: true }).map(String).filter(f => /\.tsx?$/.test(f));
    for (const file of files) {
      const text = readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8");
      assert.doesNotMatch(text, /\bcheckIn\s*\(|\bcheckInLeg\s*[:(]/, file);
    }
    const types = readFileSync(new URL("lib/repositories/types.ts", root), "utf8");
    assert.doesNotMatch(types, /getOccupiedSeats[^;]+leg\?/);
    assert.equal(typeof (LocalBookingRepository.prototype as unknown as Record<string, unknown>)["checkIn"], "undefined");
    assert.equal(typeof LocalBookingRepository.prototype.completeCheckIn, "function");
  });
});
