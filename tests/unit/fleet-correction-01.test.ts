import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalFleetRepository } from "../../src/lib/fleet/repository.ts";
import { FleetStorageCoordinator, FLEET_STORAGE_KEY } from "../../src/lib/fleet/storage.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import { LocalScheduleRepository } from "../../src/lib/schedules/repository.ts";
import { ScheduleStorageCoordinator } from "../../src/lib/schedules/storage.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { RepoStorageCoordinator, REPO_STORAGE_KEY } from "../../src/lib/repositories/storage.ts";
import { LocalBookingRepository } from "../../src/lib/repositories/booking-repository.ts";
import { LocalCommercialCatalogRepository } from "../../src/lib/commercial/repository.ts";
import { CommercialStorageCoordinator } from "../../src/lib/commercial/storage.ts";
import { departuresOn, todayISO, addDaysISO, isSeatAvailable } from "../../src/lib/data.ts";
import { FROZEN_LEGACY_SEAT_LAYOUT, parseLegSeatLayoutSnapshot, normalizeBooking, type BookingCreateInput } from "../../src/lib/domain/booking.ts";
import { reconcileDraft } from "../../src/lib/booking-draft/reconciliation.ts";
import { bookingTotal } from "../../src/lib/domain/pricing.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";

class MemoryStorage implements Storage {
  values = new Map<string,string>(); writes=0;
  get length(){return this.values.size;}
  key(i:number){return [...this.values.keys()][i]??null;}
  getItem(k:string){return this.values.get(k)??null;}
  setItem(k:string,v:string){this.writes++;this.values.set(k,v);}
  removeItem(k:string){this.values.delete(k);}
  clear(){this.values.clear();}
}
function rig(){
  const storage = new MemoryStorage();
  storage.setItem(REPO_STORAGE_KEY, JSON.stringify({schemaVersion:1,bookings:[],flightOverrides:{}}));
  const coordinator=new RepoStorageCoordinator({storage});
  const fleet=new LocalFleetRepository(new FleetStorageCoordinator({storage}));
  const commercial=new LocalCommercialCatalogRepository(new CommercialStorageCoordinator({storage}));
  const flight=new LocalFlightRepository(coordinator,{fleet});
  const schedule=new LocalScheduleRepository(new ScheduleStorageCoordinator({storage}),fleet);
  const booking=new LocalBookingRepository(coordinator,{fleet,commercial});
  return {storage,coordinator,fleet,commercial,flight,schedule,booking};
}
function candidate():BookingCreateInput{
  const f=Array.from({ length: 14 }, (_, i) => departuresOn(addDaysISO(todayISO(), 5 + i))).flat().find(f=>f.aircraftId==="a320neo" && f.status==="Scheduled" && f.seatsLeft>3)!;
  assert.ok(f);
  return {criteria:{tripType:"oneway",origin:f.originCode,destination:f.destinationCode,departDate:f.date,returnDate:"",adults:1,children:0,infants:0,cabin:"economy"},outbound:f,fareId:"essential",passengers:[{type:"adult",firstName:"Seat",lastName:"Audit",dob:"1980-01-01",nationality:"PS",document:"AUDIT123"}],seats:{},extras:{pax:[{extraBags:0,meal:"standard",assistance:[]}]},contact:{email:"audit@example.com",phone:"+970599000000"},total:0};
}
describe("Phase 6B2B Correction 01 canonical boundaries",()=>{
  for(const id of ["missing-airframe","b737800"]){
    it(`Flight rejects new assignment ${id}`,async()=>{const r=rig();await assert.rejects(r.flight.setOverride(candidate().outbound.id,{aircraftId:id}));assert.equal(r.storage.writes,1);});
    it(`Schedule rejects new assignment ${id}`,async()=>{const r=rig();await assert.rejects(r.schedule.create({...seedSchedules()[0]!,id:"created",aircraftId:id,aircraft:id}));});
  }
  it("rejects free text and same-ID model mismatch",async()=>{
    const r=rig(),f=candidate().outbound;
    await assert.rejects(r.flight.setOverride(f.id,{aircraft:"Invented airplane"}));
    await assert.rejects(r.flight.setOverride(f.id,{aircraftId:f.aircraftId,aircraft:"Invented airplane"}));
    await assert.rejects(r.schedule.create({...seedSchedules()[0]!,id:"missing-id"}));
  });
  it("samples assignment lifecycle at command time, not earlier query",async()=>{
    const r=rig(),f=candidate().outbound;
    await r.fleet.get(); await r.fleet.updateAircraft("a320neo",{active:false});
    const target=f.aircraftId==="a320neo"?"a321neo":"a320neo";
    if(target==="a321neo")await r.fleet.updateAircraft(target,{active:false});
    await assert.rejects(r.flight.setOverride(f.id,{aircraftId:target}));
  });
  it("corrupt Fleet does not block unchanged aircraft or operational edits",async()=>{
    const r=rig(),f=candidate().outbound;
    r.storage.setItem(FLEET_STORAGE_KEY,"{broken");
    await r.flight.setOverride(f.id,{aircraftId:f.aircraftId,aircraft:f.aircraft,gate:"B12"});
    assert.equal((await r.flight.getFlightById(f.id))?.gate,"B12");
    const original=(await r.schedule.list())[0]!;
    await r.schedule.update(original.id,{departTime:"09:15"});
    assert.equal((await r.schedule.getById(original.id))?.departTime,"09:15");
    assert.equal(r.storage.getItem(FLEET_STORAGE_KEY),"{broken");
  });
  it("new booking fails truthfully with corrupt Fleet",async()=>{
    const r=rig();r.storage.setItem(FLEET_STORAGE_KEY,"{");
    await assert.rejects(r.booking.create(candidate()),(e:unknown)=>Boolean(e && typeof e==="object" && "reason" in e && e.reason==="fleet_unavailable"));
    assert.equal((await r.booking.list()).length,0);
  });
  it("independent coordinators concurrently compete for one seat; only one PNR wins",async()=>{
    const r=rig(),input=candidate();
    const f=input.outbound;
    const seat=Array.from({length:12},(_,i)=>`${13+i}A`).find(s=>isSeatAvailable(f.id,Number(s.slice(0,-1)),"A"))!;
    const second=new LocalBookingRepository(new RepoStorageCoordinator({storage:r.storage}),{fleet:r.fleet,commercial:r.commercial});
    const results=await Promise.allSettled([r.booking.create({...input,submissionId:"race-A",seats:{"out-0":seat}}),second.create({...input,submissionId:"race-B",seats:{"out-0":seat}})]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    const state=JSON.parse(r.storage.getItem(REPO_STORAGE_KEY)!);
    assert.equal(state.bookings.length,1);
    assert.equal(state.bookings[0].seats["out-0"],seat);
  });
  it("numeric Extras pricing retains layout category and historical money after Fleet/catalog edits and reload",async()=>{
    const r=rig(),input=candidate(),f=input.outbound;
    const layout=(await r.fleet.get()).layouts[f.aircraftId!]!;
    const seat=Array.from({length:12},(_,i)=>`${13+i}A`).find(s=>isSeatAvailable(f.id,Number(s.slice(0,-1)),"A"))!;
    await r.fleet.updateLayout(f.aircraftId!,{...layout,extraLegroomRows:[Number(seat.slice(0,-1))]});
    const created=await r.booking.create({...input,seats:{"out-0":seat}});
    const base=bookingTotal({...created,seats:{}},created.pricingSnapshot).total;
    assert.equal(created.total,base+18);
    await r.fleet.updateLayout(f.aircraftId!,{...layout,extraLegroomRows:[]});
    await r.commercial.updateBaggage({extraBagPrice:99});
    const updated=await r.booking.updateExtras(created.ref,{pax:[{extraBags:1,meal:"standard",assistance:[]}]});
    assert.equal(updated.total,created.total+created.pricingSnapshot!.extraBagPrice);
    const reloaded=new LocalBookingRepository(new RepoStorageCoordinator({storage:r.storage}),{fleet:r.fleet,commercial:r.commercial});
    assert.equal((await reloaded.getByRef(created.ref))?.total,updated.total);
    const newBooking=await reloaded.create({...input,seats:{}});
    assert.equal(newBooking.pricingSnapshot?.extraBagPrice,99);
  });
  it("same-ID layout edit clears only invalid affected-leg draft seats",()=>{
    const input=candidate();
    const draft={...input,outbound:input.outbound,inbound:null,entry:"results" as const,seats:{"out-0":"28A","in-0":"15B"}};
    const layout={...FROZEN_LEGACY_SEAT_LAYOUT,rows:27,zones:[{id:"business" as const,firstRow:1,lastRow:4},{id:"premium" as const,firstRow:5,lastRow:10},{id:"economy" as const,firstRow:11,lastRow:27}]};
    const result=reconcileDraft(draft,input.outbound,null,{outboundLayout:layout});
    assert.equal(result.reconciledDraft.seats["out-0"],undefined);
    assert.equal(result.reconciledDraft.seats["in-0"],"15B");
    assert.deepEqual(result.reconciledDraft.contact,input.contact);
    assert.deepEqual(result.reconciledDraft.extras,input.extras);
  });
  it("unsupported draft cabin invalidates flight without downgrade",()=>{
    const input=candidate();
    const draft={...input,outbound:input.outbound,inbound:null,entry:"results" as const,criteria:{...input.criteria,cabin:"premium" as const}};
    const result=reconcileDraft(draft,input.outbound,null,{outboundLayout:{...FROZEN_LEGACY_SEAT_LAYOUT,zones:[{id:"economy",firstRow:1,lastRow:28}]}});
    assert.equal(result.reconciledDraft.outbound,null);
    assert.equal(result.reconciledDraft.criteria.cabin,"premium");
    assert.equal(result.outbound.reason,"cabin_unavailable");
  });
  for(const [name,patch] of Object.entries({duplicateLetters:{letters:["A","A","C","D","E","F"]},overlap:{zones:[{id:"economy",firstRow:1,lastRow:29}]},legroom:{extraLegroomRows:[61]},invalidSeat:{unavailable:["90Z"]},capacity:{capacity:12345},invalidRevision:{basis:"fleet",aircraftId:"a320neo",fleetRevision:-1}})){
    it(`snapshot parser rejects ${name}`,()=>assert.equal(parseLegSeatLayoutSnapshot({...FROZEN_LEGACY_SEAT_LAYOUT,...patch}),null));
  }
  it("present invalid/round-trip mismatched snapshot is rejected, absent remains legacy",async()=>{
    const r=rig(),b=await r.booking.create(candidate());
    assert.ok(normalizeBooking({...b,seatLayouts:undefined}));
    assert.equal(normalizeBooking({...b,seatLayouts:{...b.seatLayouts,in:FROZEN_LEGACY_SEAT_LAYOUT}}),null);
  });
  it("a stale safe Schedule edit preserves the aircraft changed by another canonical writer", async () => {
    const r=rig(); const original=(await r.schedule.list())[0]!;
    const second=new LocalScheduleRepository(new ScheduleStorageCoordinator({storage:r.storage}),r.fleet);
    const read=r.schedule.getById.bind(r.schedule);
    r.schedule.getById=async id=>{const old=await read(id);await second.update(id,{aircraftId:"a321neo",aircraft:"Airbus A321neo"});return old;};
    const updated=await r.schedule.update(original.id,{departTime:"09:15"});
    assert.equal(updated.aircraftId,"a321neo"); assert.equal(updated.aircraft,"Airbus A321neo");
    assert.equal(updated.departTime,"09:15");
  });
  it("a stale operational Flight edit cannot restore equipment reassigned by another writer", async () => {
    const r=rig(),f=candidate().outbound;
    const original=await r.flight.getFlightById(f.id);assert.ok(original);
    const next=original.aircraftId==="a320neo"?"a321neo":"a320neo";
    const second=new LocalFlightRepository(new RepoStorageCoordinator({storage:r.storage}),{fleet:r.fleet});
    const read=r.flight.getFlightById.bind(r.flight);
    r.flight.getFlightById=async id=>{const old=await read(id);await second.setOverride(id,{aircraftId:next});return old;};
    await r.flight.setOverride(f.id,{gate:"B13",aircraftId:original.aircraftId,aircraft:original.aircraft});
    const updated=JSON.parse(r.storage.getItem(REPO_STORAGE_KEY)!).flightOverrides[f.id];assert.equal(updated.aircraftId,next);assert.equal(updated.gate,"B13");
  });

  it("check-in rejects another PNR seat without write and retains historical layout/pricing despite unavailable live Fleet",async()=>{
    const r=rig(),input=candidate(),f=input.outbound;
    const layout=(await r.fleet.get()).layouts[f.aircraftId!]!;
    const seat=Array.from({length:12},(_,i)=>`${13+i}A`).find(s=>isSeatAvailable(f.id,Number(s.slice(0,-1)),"A"))!;
    await r.fleet.updateLayout(f.aircraftId!,{...layout,extraLegroomRows:[Number(seat.slice(0,-1))]});
    const a=await r.booking.create({...input,seats:{"out-0":seat}});
    const b=await r.booking.create({...input,seats:{}});
    let events=0; const unsubscribe=r.booking.subscribe(()=>events++);
    const writes=r.storage.writes;
    const now=flightDepartureEpoch(f)-2*60*60*1000;
    await assert.rejects(r.booking.completeCheckIn({ref:b.ref,leg:"out",selectedPaxIndexes:[0],documents:{0:"AUDIT123"},seats:{0:seat},now}),/occupied|another|taken/i);
    assert.equal(r.storage.writes,writes); assert.equal(events,0);
    assert.deepEqual((await r.booking.getByRef(b.ref))?.checkedIn,b.checkedIn);
    await r.fleet.updateLayout(f.aircraftId!,{...layout,extraLegroomRows:[]});
    await r.commercial.updateFare("classic",{multiplier:2});
    await r.commercial.updateBaggage({extraBagPrice:99});
    r.storage.setItem(FLEET_STORAGE_KEY,"{broken");
    const checked=await r.booking.completeCheckIn({ref:a.ref,leg:"out",selectedPaxIndexes:[0],documents:{0:"AUDIT123"},seats:{0:seat},now});
    assert.equal(checked.total,a.total);
    assert.deepEqual(checked.seatLayouts,a.seatLayouts);
    assert.deepEqual(checked.pricingSnapshot,a.pricingSnapshot);
    assert.deepEqual(checked.checkedIn?.out,[0]); assert.equal(events,1);
    assert.equal(r.storage.getItem(FLEET_STORAGE_KEY),"{broken");
    unsubscribe();
  });

  it("aircraft/layout creation is atomic on write failure, retries with the same identity, and corrupt storage blocks mutations",async()=>{
    const r=rig(); let events=0; const unsubscribe=r.fleet.subscribe(()=>events++);
    const set=r.storage.setItem.bind(r.storage);
    r.storage.setItem=(key,value)=>{if(key===FLEET_STORAGE_KEY)throw new DOMException("Quota","QuotaExceededError");set(key,value);};
    const input={aircraft:{id:"atomic-airframe",model:"Atomic aircraft",registration:"PS-ATC"}};
    await assert.rejects(r.fleet.createAircraft(input));
    assert.equal(r.storage.getItem(FLEET_STORAGE_KEY),null); assert.equal(events,0);
    assert.equal((await r.fleet.get()).aircraft.some(a=>a.id===input.aircraft.id),false);
    r.storage.setItem=set;
    const created=await r.fleet.createAircraft(input);
    assert.equal(created.aircraft.id,input.aircraft.id); assert.equal(created.aircraft.active,false);
    assert.equal(created.layout.aircraftId,input.aircraft.id); assert.equal(events,1);
    r.storage.setItem(FLEET_STORAGE_KEY,"{broken");
    const writes=r.storage.writes;
    await assert.rejects(r.fleet.updateAircraft(input.aircraft.id,{active:true}));
    assert.equal(r.storage.getItem(FLEET_STORAGE_KEY),"{broken"); assert.equal(r.storage.writes,writes); assert.equal(events,1);
    unsubscribe();
  });

});
