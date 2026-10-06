import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
import { RepoStorageCoordinator, REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { SCHEDULE_STORAGE_KEY } from "../../src/lib/schedules/storage.ts";
import { NETWORK_STORAGE_KEY } from "../../src/lib/network/storage.ts";
import { FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";
import { COMMERCIAL_STORAGE_KEY } from "../../src/lib/commercial/storage.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { datedServiceId } from "../../src/lib/dated-services/identity.ts";
import { CurrentFlightAuthorityError } from "../../src/lib/dated-services/resolver.ts";
import { legacyDeparturesOn } from "../../src/lib/dated-services/legacy.ts";
import { canonicalCreateFixture } from "../helpers/booking-create-fixture.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { sanitizeAdminCheckInSearch } from "../../src/lib/domain/desk.ts";
import { isSeatAvailable } from "../../src/lib/data.ts";
import type { Booking, BookingCreateInput } from "../../src/lib/domain/booking.ts";
import type { Flight } from "../../src/lib/data.ts";
import { reconcileDraft } from "../../src/lib/booking-draft/reconciliation.ts";
import type { Draft } from "../../src/lib/booking-draft/types.ts";
import { seedFleetLayouts } from "../../src/lib/fleet/seed.ts";
import { IsolatedStudioFlightResolver } from "../../src/lib/studio-flight-fixtures.ts";

class MemoryStorage implements Storage {
  values = new Map<string, string>(); writes = 0;
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes++; this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
  clear() { this.values.clear(); }
}
const date = "2026-11-10";
function command(flight: Flight, extra: Partial<BookingCreateInput> = {}): BookingCreateInput {
  return canonicalCreateFixture({ outbound: flight, passengers: [{ type: "adult", name: "Service Audit" }], contact: { email: "audit@example.com", phone: "+970599000000" }, ...extra });
}
function rig() {
  const storage = new MemoryStorage();
  storage.setItem(REPO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, bookings: [], flightOverrides: {} }));
  const repos = createRepositories({ storage });
  return { ...repos, storage };
}
async function current(r: ReturnType<typeof rig>) { return (await r.flight.searchFlights("GZA", "AMM", date))[0]!; }
function seat(f: Flight) {
  for (let row = 13; row <= 28; row++) for (const letter of "ABCDEF") if (isSeatAvailable(f.id, row, letter)) return `${row}${letter}`;
  throw new Error("Fixture has no free seat");
}
function historical(f: Flight): Booking {
  return { ...command(f), ref: "GZA-OLD1", status: "confirmed", createdAt: "2026-01-01T00:00:00Z", checkedIn: {}, total: 200 } as Booking;
}

describe("C2B current service authority and compatibility", () => {
  it("isolated Studio legacy simulation writes only memory and fixture resolver cannot enter persistent registry", async () => {
    const storage = new MemoryStorage();
    for (const key of [REPO_STORAGE_KEY, SCHEDULE_STORAGE_KEY, NETWORK_STORAGE_KEY, FLEET_STORAGE_KEY, COMMERCIAL_STORAGE_KEY]) storage.setItem(key, "{untouched");
    const before = [...storage.values], writes = storage.writes;
    const resolver = new IsolatedStudioFlightResolver();
    assert.throws(() => createRepositories({ storage, serviceResolver: resolver }), /isolated memory/);
    const isolated = createRepositories({ inMemoryOnly: true, storage, initialData: { schemaVersion:1, bookings:[], flightOverrides:{} }, serviceResolver: resolver });
    const fixture = (await isolated.flight.searchFlights("GZA", "AMM", date))[0]!;
    assert.ok(fixture.id.startsWith("PS"));
    const b = await isolated.booking.create(command(fixture));
    assert.equal(b.outbound.id, fixture.id);
    await isolated.flight.setOverride(fixture.id, { gate:"STUDIO" });
    assert.equal((await isolated.flight.getFlightById(fixture.id))?.gate, "STUDIO");
    assert.deepEqual([...storage.values], before); assert.equal(storage.writes, writes);
    const live = rig();
    await assert.rejects(live.booking.create(command(fixture)), /current Schedule authority/);
  });
  it("opening current outbound/inbound services use real Fleet layouts, without read writes", async () => {
    const r = rig(), writes = r.storage.writes;
    const pool = await r.flight.getFlights(date);
    assert.equal(pool.length, seedSchedules().filter(s => s.active && s.days.includes(2)).length);
    const fleet = await r.fleet.get();
    for (const f of pool) { assert.ok(f.id.startsWith("svc1-")); assert.ok(f.aircraftId && fleet.layouts[f.aircraftId]); }
    assert.equal((await r.flight.searchFlights("AMM", "GZA", date)).length, 1);
    assert.equal(r.storage.writes, writes);
  });
  it("number/time/base equipment refresh same identity and caller values are ignored at create", async () => {
    const r = rig(), stale = await current(r);
    await r.schedule.update(stale.scheduleId!, { number: "PS998", departTime: "09:45", aircraftId: "a321neo", aircraft: "Airbus A321neo" });
    const booked = await r.booking.create(command({ ...stale, gate: "FAKE", basePrice: 1 }));
    assert.equal(booked.outbound.id, stale.id); assert.equal(booked.outbound.number, "PS998");
    assert.equal(booked.outbound.departTime, "09:45"); assert.equal(booked.outbound.aircraftId, "a321neo");
    assert.equal(booked.seatLayouts?.out.capacity, 196); assert.notEqual(booked.outbound.basePrice, 1);
  });
  for (const mode of ["schedule inactive", "weekday removed", "network inactive"] as const) {
    it(`${mode} blocks new sale and keeps booked compatibility without cancellation`, async () => {
      const r = rig(), f = await current(r), b = await r.booking.create(command(f));
      if (mode === "schedule inactive") await r.schedule.update(f.scheduleId!, { active: false });
      if (mode === "weekday removed") await r.schedule.update(f.scheduleId!, { days: [1] });
      if (mode === "network inactive") await r.network.update("AMM", { active: false });
      assert.deepEqual(await r.flight.searchFlights("GZA", "AMM", date), []);
      assert.equal(await r.flight.getCurrentFlightById(f.id), null);
      assert.deepEqual(await r.flight.getFlightById(f.id), b.outbound);
      assert.ok((await r.flight.getFlights(date)).some(x => x.id === f.id));
      await assert.rejects(r.booking.create(command(f)), /current|missing|available/i);
      await r.booking.updateSeats(b.ref, { "out-0": seat(f) });
      assert.equal((await r.booking.getByRef(b.ref))?.status, "confirmed");
    });
  }
  it("reactivating Network restores the same ID and new block duration", async () => {
    const r = rig(), f = await current(r);
    await r.network.update("AMM", { active: false, blockMinutes: 123, city: { en: "Updated Amman", ar: "عمّان الجديدة" } });
    assert.equal(await r.flight.getCurrentFlightById(f.id), null);
    await r.network.update("AMM", { active: true });
    const next = await r.flight.getCurrentFlightById(f.id);
    assert.equal(next?.id, f.id); assert.equal(next?.durationMinutes, 123);
  });
  it("structured cancellation stays on board and supersedes booked snapshot, rejecting check-in/new sale", async () => {
    const r = rig(), f = await current(r), b = await r.booking.create(command(f));
    await r.schedule.update(f.scheduleId!, { exceptions: [{ id: "cancel", date, kind: "cancelled", detail: "Operational", effect: { cancelled: true } }] });
    assert.equal((await r.flight.getFlightById(f.id))?.status, "Cancelled");
    assert.equal((await r.flight.getFlights(date)).find(x => x.id === f.id)?.status, "Cancelled");
    await assert.rejects(r.booking.create(command(f)), /cancelled/i);
    await assert.rejects(r.booking.completeCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0], documents: { 0: "P123456" }, seats: { 0: seat(f) }, now: flightDepartureEpoch(f)! - 3 * 3_600_000 }), /cancel/i);
    const map = await r.flight.getMonthlyServiceMap(2026, 11, "GZA", "AMM", { now: "2026-10-01" });
    assert.equal(map[date]?.hasService, false);
  });
  it("time/equipment effects update operations and new PNR, preserve old layout and money", async () => {
    const r = rig(), f = await current(r), old = await r.booking.create(command(f));
    await r.schedule.update(f.scheduleId!, { exceptions: [
      { id: "time", date, kind: "time", detail: "", effect: { departTime: "10:15", arriveTime: "11:20" } },
      { id: "equipment", date, kind: "aircraft", detail: "", effect: { aircraftId: "a321neo", aircraft: "Airbus A321neo" } },
    ] });
    const changed = await r.flight.getFlightById(f.id);
    assert.equal(changed?.departTime, "10:15"); assert.equal(changed?.aircraftId, "a321neo");
    const next = await r.booking.create(command(f));
    assert.equal(next.seatLayouts?.out.capacity, 196);
    assert.deepEqual((await r.booking.getByRef(old.ref))?.seatLayouts, old.seatLayouts);
    assert.deepEqual((await r.booking.getByRef(old.ref))?.pricingSnapshot, old.pricingSnapshot);
    assert.equal((await r.booking.getByRef(old.ref))?.total, old.total);
  });
  it("structured extra creates one current instance on a nonrecurring weekday", async () => {
    const r = rig(), s = seedSchedules()[0]!;
    await r.schedule.update(s.id, { days: [1], exceptions: [{ id: "extra", date, kind: "extra", detail: "", effect: { departTime: "12:00" } }] });
    const pool = await r.flight.searchFlights("GZA", "AMM", date);
    assert.equal(pool.length, 1); assert.equal(pool[0]?.id, datedServiceId(s.id, date)); assert.equal(pool[0]?.departTime, "12:00");
  });
  it("valid empty Schedule never resurrects seeds/legacy sales, but both booked identities resolve", async () => {
    const r = rig(), f = await current(r), b = await r.booking.create(command(f));
    const legacy = historical(legacyDeparturesOn(date)[0]!);
    const raw = JSON.parse(r.storage.getItem(REPO_STORAGE_KEY)!); raw.bookings.push(legacy);
    r.storage.setItem(REPO_STORAGE_KEY, JSON.stringify(raw));
    r.storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 9, schedules: [] }));
    assert.deepEqual(await r.flight.searchFlights("GZA", "AMM", date), []);
    assert.equal(await r.flight.getCurrentFlightById(f.id), null);
    assert.equal((await r.flight.getFlightById(f.id))?.id, b.outbound.id);
    assert.equal((await r.flight.getFlightById(legacy.outbound.id))?.id, legacy.outbound.id);
    const board = await r.flight.getFlights(date); assert.equal(board.length, 2);
    const map = await r.flight.getMonthlyServiceMap(2026, 11, "GZA", "AMM");
    assert.ok(Object.values(map).every(x => !x.hasService && x.flightCount === 0));
    assert.equal(JSON.parse(r.storage.getItem(SCHEDULE_STORAGE_KEY)!).revision, 9);
  });
  for (const key of [SCHEDULE_STORAGE_KEY, NETWORK_STORAGE_KEY]) {
    it(`${key} corruption fails current discovery while existing PNR/replay survives without repair`, async () => {
      const r = rig(), f = await current(r), input = command(f, { submissionId: "replay" });
      const b = await r.booking.create(input);
      r.storage.setItem(key, "{corrupt");
      const writes = r.storage.writes;
      await assert.rejects(r.flight.searchFlights("GZA", "AMM", date), CurrentFlightAuthorityError);
      await assert.rejects(r.flight.getFlights(date), CurrentFlightAuthorityError);
      await assert.rejects(r.flight.getCurrentFlightById(f.id), CurrentFlightAuthorityError);
      await assert.rejects(r.flight.getFlightById(datedServiceId("unbooked", date)), CurrentFlightAuthorityError);
      assert.deepEqual(await r.flight.getFlightById(f.id), b.outbound);
      await assert.rejects(r.booking.create(command(f)), /authority|available/i);
      r.storage.setItem(FLEET_STORAGE_KEY, "{broken"); r.storage.setItem(COMMERCIAL_STORAGE_KEY, "{broken");
      const replayWrites = r.storage.writes;
      let notifications = 0; r.booking.subscribe(() => notifications++);
      assert.deepEqual(await r.booking.create(input), b);
      assert.equal(r.storage.writes, replayWrites); assert.equal(notifications, 0);
      await r.flight.setOverride(f.id, { gate: "B7", status: "Scheduled" });
      await r.booking.updateSeats(b.ref, { "out-0": seat(f) });
      await r.booking.completeCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0], documents: { 0: "P123456" }, now: flightDepartureEpoch(f)! - 3 * 3_600_000 });
      assert.equal(r.storage.getItem(key), "{corrupt"); assert.ok(r.storage.writes > writes);
    });
  }
  it("legacy new sale rejects but explicit legacy detail and override-only board remain", async () => {
    const r = rig(), f = legacyDeparturesOn(date)[0]!;
    await assert.rejects(r.booking.create(command(f)), /current|missing|available/i);
    assert.equal(await r.flight.getCurrentFlightById(f.id), null);
    assert.equal((await r.flight.getFlightById(f.id))?.id, f.id);
    assert.ok(!(await r.flight.getFlights(date)).some(x => x.id === f.id));
    await r.flight.setOverride(f.id, { gate: "B9" });
    assert.equal((await r.flight.getFlights(date)).find(x => x.id === f.id)?.gate, "B9");
    assert.ok(!(await r.flight.searchFlights("GZA", f.destinationCode, date)).some(x => x.id === f.id));
  });
  it("current base wins deduplication over stored PNR, then current override wins", async () => {
    const r = rig(), f = await current(r); await r.booking.create(command(f));
    await r.schedule.update(f.scheduleId!, { departTime: "12:45" });
    await r.flight.setOverride(f.id, { gate: "B12", revisedDepart: "13:00" });
    const rows = (await r.flight.getFlights(date)).filter(x => x.id === f.id);
    assert.equal(rows.length, 1); assert.equal(rows[0]?.departTime, "12:45"); assert.equal(rows[0]?.revisedDepart, "13:00"); assert.equal(rows[0]?.gate, "B12");
  });
  it("new orphan override is rejected, stored orphan is preserved by reads and may be cleared", async () => {
    const r = rig(); await assert.rejects(r.flight.setOverride("arbitrary", { gate: "A1" }));
    const raw = JSON.parse(r.storage.getItem(REPO_STORAGE_KEY)!); raw.flightOverrides.orphan = { gate: "A1" };
    r.storage.setItem(REPO_STORAGE_KEY, JSON.stringify(raw));
    await r.flight.getFlights(date); assert.ok((await r.flight.getOverrides()).orphan);
    await r.flight.clearOverride("orphan"); assert.equal((await r.flight.getOverrides()).orphan, undefined);
  });
  it("desk URL parsing accepts structurally valid current and legacy IDs without existence lookup", () => {
    for (const id of [datedServiceId("operator schedule", date), "PS100-2026-11-10-out"]) assert.equal(sanitizeAdminCheckInSearch({ flightId: id }).flightId, id);
    for (const id of ["random", "svc1-bad-date", "PS100-2026-02-30-out"]) assert.equal(sanitizeAdminCheckInSearch({ flightId: id }).flightId, undefined);
  });
  it("booking transaction composes an override committed after command-time service sampling", async () => {
    const storage = new MemoryStorage();
    storage.setItem(REPO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, bookings: [], flightOverrides: {} }));
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    class HeldCoordinator extends RepoStorageCoordinator {
      override async conditionalMutateAsync<T>(mutator: Parameters<RepoStorageCoordinator["conditionalMutateAsync"]>[0]): Promise<T> {
        entered(); await held;
        return super.conditionalMutateAsync(mutator) as Promise<T>;
      }
    }
    const r = createRepositories({ storage, coordinator: new HeldCoordinator({ storage }) });
    const writer = createRepositories({ storage });
    const f = (await r.flight.searchFlights("GZA", "AMM", date))[0]!;
    const pending = r.booking.create(command(f));
    await started; await writer.flight.setOverride(f.id, { gate: "B15", aircraftId: "a321neo" }); release();
    const b = await pending;
    assert.equal(b.outbound.gate, "B15"); assert.equal(b.outbound.aircraftId, "a321neo"); assert.equal(b.seatLayouts?.out.capacity, 196);
  });
  it("monthly command samples Schedule/Network once and subscription events converge without duplicates", async () => {
    const r = rig(); let schedules = 0, networks = 0, events = 0;
    const list = r.schedule.listForDiscovery.bind(r.schedule), networkList = r.network.list.bind(r.network);
    r.schedule.listForDiscovery = async () => { schedules++; return list(); };
    r.network.list = async () => { networks++; return networkList(); };
    r.flight.subscribe(() => { events++; });
    await r.flight.getMonthlyServiceMap(2026, 11, "GZA", "AMM", { now: "2026-10-01" });
    assert.equal(schedules, 1); assert.equal(networks, 1);
    await r.schedule.update("sch-AMM-out", { departTime: "10:00" }); assert.equal(events, 1);
    await r.network.update("AMM", { blockMinutes: 90 }); assert.equal(events, 2);
    await r.flight.setOverride(datedServiceId("sch-AMM-out", date), { gate: "B2" }); assert.equal(events, 3);
  });
  it("round-trip sale seals two current Flight/layout snapshots and revalidates each leg", async () => {
    const r = rig(), out = await current(r), inbound = (await r.flight.searchFlights("AMM", "GZA", "2026-11-12"))[0]!;
    const input = command(out, { inbound, criteria: { ...command(out).criteria, tripType: "round", returnDate: inbound.date } });
    const b = await r.booking.create(input);
    assert.equal(b.inbound?.id, inbound.id); assert.ok(b.seatLayouts?.in); assert.ok(b.pricingSnapshot);
    await r.schedule.update(inbound.scheduleId!, { active: false });
    await assert.rejects(r.booking.create(input), (error: unknown) => (error as {leg: string}).leg === "in");
    assert.equal((await r.flight.getFlightById(inbound.id))?.id, b.inbound?.id);
  });
  it("current sale rejects route/date mismatch and operational cancellation and monthly party capacity", async () => {
    const r = rig(), f = await current(r), input = command(f);
    await assert.rejects(r.booking.create({...input, criteria:{...input.criteria,destination:"CAI"}}), (e: unknown) => (e as {reason:string}).reason === "route_mismatch");
    await assert.rejects(r.booking.create({...input, criteria:{...input.criteria,departDate:"2026-11-11"}}), (e: unknown) => (e as {reason:string}).reason === "date_mismatch");
    const monthly = await r.flight.getMonthlyServiceMap(2026,11,"GZA","AMM",{paxCount:f.seatsLeft+1,now:"2026-10-01"});
    assert.equal(monthly[date]?.hasService,false);
    await r.flight.setOverride(f.id,{status:"Cancelled"});
    await assert.rejects(r.booking.create(input), (e: unknown) => (e as {reason:string}).reason === "cancelled");
    assert.equal((await r.booking.list()).length,0);
  });
  it("current B737 sale uses real historical assignment layout and rejects Premium without downgrade", async () => {
    const r = rig();
    const f = (await r.flight.searchFlights("GZA","IST","2026-11-09"))[0]!;
    assert.equal(f.aircraftId,"b737800");
    await r.flight.setOverride(f.id,{status:"Scheduled"});
    const input = command(f);
    const booked = await r.booking.create(input);
    assert.equal(booked.seatLayouts?.out.capacity,162);
    assert.deepEqual(booked.seatLayouts?.out.zones.map(z=>z.id),["business","economy"]);
    await assert.rejects(r.booking.create({...input,criteria:{...input.criteria,cabin:"premium"}}), (e: unknown) => (e as {reason:string}).reason === "cabin_unavailable");
    assert.equal((await r.booking.list()).length,1);
  });
  it("unknown legacy equipment is displayed unresolved and cannot create a normal new Booking", async () => {
    const r = rig(), s = { ...seedSchedules()[0]!, aircraft: "Legacy Charter Type", aircraftId: undefined };
    r.storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 7, schedules: [s] }));
    const f = await current(r), raw = r.storage.getItem(SCHEDULE_STORAGE_KEY);
    assert.equal(f.aircraft, "Legacy Charter Type"); assert.equal(f.aircraftId, undefined);
    await assert.rejects(r.booking.create(command(f)), (error: unknown) => (error as {reason: string}).reason === "fleet_unavailable");
    assert.equal(r.storage.getItem(SCHEDULE_STORAGE_KEY), raw);
  });
  it("current departure time drives check-in while historical Flight/layout/pricing remain unchanged", async () => {
    const r = rig(), f = await current(r), b = await r.booking.create(command(f));
    const now = flightDepartureEpoch(f)! - 3 * 3_600_000;
    await r.schedule.update(f.scheduleId!, { departTime: "04:00", arriveTime: "05:00" });
    await assert.rejects(r.booking.completeCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0], documents: {0:"P123456"}, seats: {0:seat(f)}, now }), /closed/i);
    const effective = (await r.flight.getFlightById(f.id))!;
    const done = await r.booking.completeCheckIn({ ref: b.ref, leg: "out", selectedPaxIndexes: [0], documents: {0:"P123456"}, seats: {0:seat(f)}, now: flightDepartureEpoch(effective)! - 3 * 3_600_000 });
    assert.deepEqual(done.outbound, b.outbound); assert.deepEqual(done.seatLayouts, b.seatLayouts); assert.deepEqual(done.pricingSnapshot, b.pricingSnapshot);
  });
  it("draft clears a noncurrent leg without substituting identity or losing other inputs", async () => {
    const r = rig(), out = await current(r), inbound = (await r.flight.searchFlights("AMM", "GZA", "2026-11-12"))[0]!;
    const draft = command(out, { inbound, criteria: { ...command(out).criteria, tripType: "round", returnDate: inbound.date }, seats: {"out-0":"12A","in-0":"12B"} }) as unknown as Draft;
    const result = reconcileDraft(draft, null, inbound, { inboundLayout: seedFleetLayouts().a320neo });
    assert.equal(result.reconciledDraft.outbound, null); assert.equal(result.reconciledDraft.seats["out-0"], undefined);
    assert.equal(result.reconciledDraft.inbound?.id, inbound.id); assert.equal(result.reconciledDraft.seats["in-0"], "12B");
    assert.deepEqual(result.reconciledDraft.passengers, draft.passengers); assert.deepEqual(result.reconciledDraft.contact, draft.contact); assert.deepEqual(result.reconciledDraft.extras, draft.extras);
    const legacy = { ...draft, outbound: legacyDeparturesOn(date)[0]! };
    assert.equal(reconcileDraft(legacy, null, inbound).reconciledDraft.outbound, null);
  });
  it("same-ID number/time/equipment refresh reconciles only invalid affected draft seats", async () => {
    const r = rig(), f = await current(r), draft = command(f, { seats: {"out-0":"28A"} }) as unknown as Draft;
    const renamed = {...f, number:"PS999", departTime:"10:30"};
    const updated = reconcileDraft(draft, renamed, null, { outboundLayout: seedFleetLayouts().a320neo });
    assert.equal(updated.changed, true); assert.equal(updated.reconciledDraft.outbound?.number, "PS999"); assert.equal(updated.reconciledDraft.outbound?.id, f.id);
    const layout = { ...seedFleetLayouts().a320neo!, rows: 20, zones: [{ cabin: "economy" as const, firstRow: 1, lastRow: 20 }] };
    const smaller = reconcileDraft(draft, { ...renamed, aircraftId: "custom", aircraft:"Custom aircraft" }, null, { outboundLayout: layout });
    assert.equal(smaller.reconciledDraft.seats["out-0"], undefined); assert.deepEqual(smaller.reconciledDraft.contact, draft.contact);
  });
  it("only confirmed PNRs retain board relevance after planning disappears; cancellation preserves history", async () => {
    const r = rig(), f = await current(r), b = await r.booking.create(command(f));
    await r.schedule.update(f.scheduleId!, { active:false });
    assert.ok((await r.flight.getFlights(date)).some(x => x.id === f.id));
    await r.booking.cancel(b.ref);
    assert.ok(!(await r.flight.getFlights(date)).some(x => x.id === f.id));
    assert.deepEqual(await r.flight.getBookingFlight(b.ref, "out"), b.outbound);
    assert.equal(await r.flight.getCurrentFlightById(f.id), null);
    const legacy = legacyDeparturesOn(date)[0]!;
    await r.flight.setOverride(legacy.id, {gate:"B9"});
    assert.ok((await r.flight.getFlights(date)).some(x => x.id === legacy.id && x.gate === "B9"));
  });
});


it("live source quarantines raw flight generators and shares one resolver without generated persistence", () => {
  const allowed = new Set(["src/lib/data.ts", "src/lib/dated-services/legacy.ts", "src/lib/studio-scenarios.ts"]);
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  }
  for (const file of walk("src").filter(f => /\.tsx?$/.test(f) && !allowed.has(f))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /import\s*{[^}]*\b(?:departuresOn|arrivalsOn|flightById|searchFlights)\b[^}]*}\s*from\s*["'][^"']*\bdata(?:\.ts)?["']/s, file);
    assert.doesNotMatch(text, /gza\.flight-instance\.v1/, file);
  }
  const registry = readFileSync("src/lib/repositories/registry.ts", "utf8");
  assert.match(registry, /new LocalDatedServiceResolver\(schedule, network\)/);
  assert.match(registry, /new LocalBookingRepository\(coordinator, { commercial, fleet, resolver }\)/);
  assert.match(registry, /new LocalFlightRepository\(coordinator, {\s*fleet,\s*resolver,/);
  const detail = readFileSync("src/routes/{-$locale}.flight.$flightId.tsx", "utf8");
  assert.match(detail, /useCurrentFlightQuery\(flight.id\)/);
  assert.match(detail, /Flight details.*Palestinian Airlines/);
  assert.match(detail, /legacyFlightById/);
});
