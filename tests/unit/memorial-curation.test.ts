import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {compiledNetworkReference} from '../../src/lib/destination-reference.ts';
import {GZA} from '../../src/lib/data.ts';
import {seedFleetAircraft,seedFleetLayouts} from '../../src/lib/fleet/seed.ts';
import {buildCurationPlan,applyCurationPlan,type CurationSnapshot,type CurationAdapter} from '../../tools/memorial-curation/plan.mjs';
const snapshot=():CurationSnapshot=>({airports:[{code:'GZA',airportName:GZA.name,city:GZA.city,country:GZA.country,timezone:GZA.tz,blockMinutes:20,active:true},...structuredClone(compiledNetworkReference)],
 fleet:{revision:0,aircraft:seedFleetAircraft(),layouts:seedFleetLayouts()},schedules:[]});
function adapter(state:CurationSnapshot, failAt=Infinity) {
 let count=0;
 const writes:Array<string>=[];
 const accept=(label:string)=>{if(count++===failAt)throw new Error('Synthetic API failure');writes.push(label);};
 const api:CurationAdapter={read:async()=>structuredClone(state),
  createAirport:async airport=>{accept('airport');state.airports.push(airport);},
  patchAircraft:async(id,patch)=>{accept('aircraft');Object.assign(state.fleet.aircraft.find(aircraft=>aircraft.id===id)!,patch);state.fleet.revision++;},
  createSchedule:async schedule=>{accept('schedule');state.schedules.push(structuredClone(schedule));},
  patchSchedule:async(id,patch)=>{accept('extension');Object.assign(state.schedules.find(schedule=>schedule.id===id)!,patch);}};
 return {api,writes};
}
describe('Authenticated curation planning semantics (synthetic API adapter)',()=> {
 it('requires explicit standby choice and previews exact additions without modifying authority',()=> {
  const state=snapshot();const original=structuredClone(state);
  assert.throws(()=>buildCurationPlan(state,{today:'2026-10-13'}),/Three distinct/);
  const plan=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});
  assert.equal(plan.additions.length,13);assert.equal(plan.fleetUpdates.length,1);assert.equal(plan.scheduleAdds.length,14);
  assert.deepEqual(state,original);assert.equal(plan.classification,'commemorative');
 });
 it('is idempotent after complete and partial commits; never overwrites edited schedules',async()=> {
  const state=snapshot();let plan=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});
  const first=adapter(state,5);await assert.rejects(()=>applyCurationPlan(plan,first.api),/after 5 committed/);
  plan=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});assert.equal(plan.additions.length,8);
  await applyCurationPlan(plan,adapter(state).api);
  plan=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});
  assert.equal(plan.additions.length+plan.fleetUpdates.length+plan.scheduleAdds.length+plan.scheduleExtensions.length,0);
  state.schedules[0]!.number='PS 999';
  assert.throws(()=>buildCurationPlan(state,{today:'2026-10-13',activateStandby:true}),/edited/);
 });
 it('blocks a stale preview before any write and extends periods without changing historical identities',async()=> {
  const state=snapshot();const plan=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});
  const api=adapter(state);state.airports[1]!.city.en='Owner edit';
  await assert.rejects(()=>applyCurationPlan(plan,api.api),/Authority changed/);assert.equal(api.writes.length,0);
  const refreshed=buildCurationPlan(state,{today:'2026-10-13',activateStandby:true});await applyCurationPlan(refreshed,api.api);
  const existing=structuredClone(state.schedules);
  const extended=buildCurationPlan(state,{today:'2027-01-01',activateStandby:true});
  assert.equal(extended.scheduleAdds.length,0);assert.equal(extended.scheduleExtensions.length,14);
  await applyCurationPlan(extended,adapter(state).api);
  for(const [index,schedule] of state.schedules.entries()) assert.deepEqual({...schedule,until:existing[index]!.until},existing[index]);
 });
});
