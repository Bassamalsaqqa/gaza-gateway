import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {compiledNetworkReference} from '../../src/lib/destination-reference.ts';
import {GZA} from '../../src/lib/data.ts';
import {seedFleetAircraft} from '../../src/lib/fleet/seed.ts';
import {addDays,firstUpcomingMonday,localInstant,localClock,planTimetable,verifyTimetable} from '../../tools/memorial-curation/timetable.mjs';

const airports=[{code:'GZA',timezone:GZA.tz,blockMinutes:20,active:true},...compiledNetworkReference];
// The historical third memorial airframe is inactive. This fixture explicitly models a reviewed
// future Admin activation; the planner must not silently activate it in live authority.
const fleet=seedFleetAircraft().map(aircraft=>({...aircraft,active:true}));
describe('Bounded memorial timetable curation',()=> {
 it('plans fourteen symmetric recurring schedules across a full year with real source IDs',()=> {
  const from=firstUpcomingMonday('2026-10-13'),until=addDays(from,365);
  const plan=planTimetable({airports,fleet,from,until});
  assert.equal(from,'2026-10-19');assert.equal(firstUpcomingMonday(from),'2026-10-26');
  assert.equal(plan.schedules.length,14);assert.equal(plan.verification.aircraftCount,3);
  assert.ok(plan.verification.legCount>2800);assert.ok(plan.verification.minimumTurnaroundMinutes>=60);
  assert.equal(new Set(plan.schedules.map(schedule=>schedule.number)).size,14);
  for(const schedule of plan.schedules) assert.ok(fleet.some(aircraft=>aircraft.id===schedule.aircraftId&&aircraft.model===schedule.aircraft));
 });
 it('refuses insufficient active fleet, too short horizon and impossible rotations',()=> {
  const from='2026-10-19',until='2027-10-19';
  assert.throws(()=>planTimetable({airports,fleet:seedFleetAircraft(),from,until}),/Three distinct/);
  assert.throws(()=>planTimetable({airports,fleet,from,until:'2026-10-20'}),/full year/);
  const plan=planTimetable({airports,fleet,from,until});
  const bad=plan.schedules.map(schedule=>({...schedule,aircraftId:'a320neo'}));
  assert.throws(()=>verifyTimetable(bad,airports),/overlap|disconnected/);
 });
 it('handles half-hour zones and overnight arrivals while rejecting DST ambiguity',()=> {
  assert.equal(localClock(localInstant('2026-01-01','23:30','America/New_York')+3600000,'Asia/Gaza').date,'2026-01-02');
  assert.equal(localClock(localInstant('2026-01-02','04:30','Asia/Kolkata')+75*60000,'Asia/Gaza').time,'02:15');
  assert.throws(()=>localInstant('2026-03-08','02:30','America/New_York'),/nonexistent/);
  assert.throws(()=>localInstant('2026-11-01','01:30','America/New_York'),/ambiguous/);
  assert.throws(()=>addDays('2026-02-30',1),/Invalid calendar/);
 });
 it('checks actual extra-service and equipment exceptions instead of only weekly templates',()=> {
  const plan=planTimetable({airports,fleet,from:'2026-10-19',until:'2027-10-19'});
  const first=plan.schedules.find(schedule=>schedule.destination==='AMM'&&schedule.direction==='out')!;
  const extra={...first,id:'owner-extra',aircraftId:'other-approved-plane',days:[0],from:'2026-10-19',until:'2026-10-19',
   exceptions:[{id:'extra-1',date:'2026-10-19',kind:'extra' as const,detail:'Synthetic extra',effect:{aircraftId:first.aircraftId,aircraft:first.aircraft}}]};
  assert.throws(()=>verifyTimetable([...plan.schedules,extra],airports),/overlap|disconnected/);
  const cancelled={...extra,exceptions:[...extra.exceptions,{id:'cancel-1',date:'2026-10-19',kind:'cancelled' as const,detail:'Synthetic cancellation',effect:{cancelled:true as const}}]};
  assert.equal(verifyTimetable([...plan.schedules,cancelled],airports).legCount,plan.verification.legCount);
 });
});
