import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
import { REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { SCHEDULE_STORAGE_KEY } from "../../src/lib/schedules/storage.ts";
import { NETWORK_STORAGE_KEY } from "../../src/lib/network/storage.ts";
import { CurrentFlightAuthorityError } from "../../src/lib/dated-services/resolver.ts";
import { canonicalCreateFixture } from "../helpers/booking-create-fixture.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { getCheckInEligibility } from "../../src/lib/domain/check-in.ts";
import { buildAdminCheckInRows } from "../../src/lib/domain/desk.ts";
import { isSeatAvailable } from "../../src/lib/data.ts";
import { legacyDeparturesOn } from "../../src/lib/dated-services/legacy.ts";
import { servicesEn, servicesAr } from "../../src/lib/i18n-services.ts";
import type { Flight } from "../../src/lib/data.ts";

class StorageFixture implements Storage {
  values = new Map<string, string>(); writes = 0;
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes++; this.values.set(k,v); }
  removeItem(k: string) { this.values.delete(k); }
  clear() { this.values.clear(); }
}
const date = "2026-11-10";
async function setup() {
  const storage = new StorageFixture();
  storage.setItem(REPO_STORAGE_KEY, JSON.stringify({schemaVersion:1,bookings:[],flightOverrides:{}}));
  const r = createRepositories({storage});
  await r.schedule.update("sch-AMM-out", {departTime:"08:10", arriveTime:"09:10"});
  const f = (await r.flight.searchFlights("GZA","AMM",date))[0]!;
  await r.flight.setOverride(f.id,{status:"Scheduled"});
  const a = await r.booking.create(canonicalCreateFixture({outbound:f, passengers:[{type:"adult",name:"Correction Audit"}],contact:{email:"correction@example.com",phone:"+970599000000"}}));
  await r.schedule.update(f.scheduleId!, {number:"PS998",departTime:"12:10",arriveTime:"13:10",aircraftId:"a321neo",aircraft:"Airbus A321neo"});
  const changed = (await r.flight.searchFlights("GZA","AMM",date))[0]!;
  const b = await r.booking.create(canonicalCreateFixture({outbound:changed, passengers:[{type:"adult",name:"Correction Audit"}],contact:{email:"correction@example.com",phone:"+970599000000"}}));
  return {r,storage,f,a,b};
}
function free(f: Flight) {
  for(let row=13;row<=27;row++) for(const letter of "ABCDEF") if(isSeatAvailable(f.id,row,letter)) return `${row}${letter}`;
  throw new Error("No fixture seat");
}
for(const failure of ["retired",SCHEDULE_STORAGE_KEY,NETWORK_STORAGE_KEY]) {
  it(`Correction 01 PNR-specific historical facts, timing and immutable money/layout survive ${failure}`,async()=>{
    const {r,storage,f,a,b}=await setup();
    assert.equal(a.outbound.id,b.outbound.id); assert.notEqual(a.outbound.departTime,b.outbound.departTime);
    assert.equal(a.seatLayouts?.out.capacity,168); assert.equal(b.seatLayouts?.out.capacity,196);
    assert.equal((await r.flight.getBookingFlight(a.ref,"out"))?.number,"PS998"); // healthy current wins
    if(failure==="retired") await r.schedule.update(f.scheduleId!,{active:false});
    else storage.setItem(failure,"{corrupt");
    await r.flight.setOverride(f.id,{gate:"B12",status:"Scheduled"});
    const bytes=storage.getItem(REPO_STORAGE_KEY), writes=storage.writes;
    const effectiveA=(await r.flight.getBookingFlight(a.ref,"out"))!;
    const effectiveB=(await r.flight.getBookingFlight(b.ref,"out"))!;
    assert.deepEqual(effectiveA,{...a.outbound,gate:"B12",status:"Scheduled"});
    assert.deepEqual(effectiveB,{...b.outbound,gate:"B12",status:"Scheduled"});
    assert.equal(await r.flight.getBookingFlight("missing","out"),null);
    assert.equal(await r.flight.getBookingFlight(a.ref,"in"),null);
    assert.equal(storage.getItem(REPO_STORAGE_KEY),bytes);assert.equal(storage.writes,writes);
    const now=flightDepartureEpoch(a.outbound)!+3_600_000;
    assert.equal(getCheckInEligibility(a,"out",effectiveA,{now}).eligible,false);
    assert.equal(getCheckInEligibility(b,"out",effectiveB,{now}).eligible,true);
    const desk=await r.flight.getCheckInFlights(date);
    assert.equal(desk.planningUnavailable,failure!=="retired");
    const rows=buildAdminCheckInRows(desk.flights.find(x=>x.id===f.id),[a,b],now,desk.bookingFlights);
    assert.equal(rows.find(row=>row.ref===a.ref)?.eligibility.eligible,false);
    assert.equal(rows.find(row=>row.ref===b.ref)?.eligibility.eligible,true);
    const refreshingRows=buildAdminCheckInRows(effectiveB,[a,b],now,{});
    assert.deepEqual(refreshingRows.find(row=>row.ref===a.ref)?.effectiveFlight,a.outbound);
    assert.equal(refreshingRows.find(row=>row.ref===a.ref)?.eligibility.eligible,false);
    await assert.rejects(r.booking.completeCheckIn({ref:a.ref,leg:"out",selectedPaxIndexes:[0],documents:{0:"P123456"},seats:{0:free(f)},now}),/closed/i);
    await r.booking.completeCheckIn({ref:b.ref,leg:"out",selectedPaxIndexes:[0],documents:{0:"P123456"},seats:{0:free(f)},now});
    for(const original of [a,b]) {
      const stored=(await r.booking.getByRef(original.ref))!;
      assert.deepEqual(stored.outbound,original.outbound);assert.deepEqual(stored.pricingSnapshot,original.pricingSnapshot);assert.deepEqual(stored.seatLayouts,original.seatLayouts);
    }
    if(failure!=="retired") {
      assert.equal(storage.getItem(failure),"{corrupt");
      await assert.rejects(r.flight.getFlights(date),CurrentFlightAuthorityError);
      await assert.rejects(r.flight.searchFlights("GZA","AMM",date),CurrentFlightAuthorityError);
    }
  });
}
it("Correction 01 only confirmed PNRs establish retired board relevance; cancelled history remains scoped",async()=>{
  const {r,f,a,b}=await setup();await r.schedule.update(f.scheduleId!,{active:false});
  await r.booking.cancel(b.ref);assert.ok((await r.flight.getFlights(date)).some(x=>x.id===f.id));
  await r.booking.cancel(a.ref);assert.ok(!(await r.flight.getFlights(date)).some(x=>x.id===f.id));
  assert.equal((await r.flight.getCheckInFlights(date)).flights.some(x=>x.id===f.id),false);
  assert.deepEqual(await r.flight.getBookingFlight(a.ref,"out"),a.outbound);
  assert.deepEqual(await r.flight.getBookingFlight(b.ref,"out"),b.outbound);
  const legacy=legacyDeparturesOn(date)[0]!;await r.flight.setOverride(legacy.id,{gate:"B9"});
  assert.equal((await r.flight.getFlights(date)).find(x=>x.id===legacy.id)?.gate,"B9");
});
it("Correction 01 PNR hooks and account pass cache use Booking/leg identity; desk warning is bilingual",()=>{
  const query=readFileSync("src/lib/repositories/queries.ts","utf8");
  const hook=query.slice(query.indexOf("export function useBookingEffectiveFlights"),query.indexOf("export function getEffectiveFlightForLeg"));
  assert.match(hook,/getBookingFlight\(booking.ref, "out"\)/);assert.match(hook,/getBookingFlight\(booking.ref, "in"\)/);assert.doesNotMatch(hook,/getFlightById|flightKeys.detail/);
  const account=readFileSync("src/routes/{-$locale}.account.boarding-passes.tsx","utf8");assert.match(account,/getBookingFlight\(ref, leg\)/);assert.doesNotMatch(account,/getFlightById|flightKeys.detail/);
  const desk=readFileSync("src/routes/{-$locale}.admin.check-in.tsx","utf8");assert.match(desk,/useCheckInFlightsQuery/);assert.match(desk,/role="alert"[^\n]*services.planningWarning/);
  assert.ok(servicesEn["services.planningWarning"]);assert.ok(servicesAr["services.planningWarning"]);
});
