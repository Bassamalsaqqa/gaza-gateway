import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {offeringWireSchema} from '../../src/lib/offerings/schema.ts';
import {encodeDatedOfferingId} from '../../src/lib/offerings/codec.ts';
import {seedFleetLayouts} from '../../src/lib/fleet/seed.ts';

const offering=()=>({id:encodeDatedOfferingId('night-example','2026-01-01'),scheduleId:'night-example',date:'2026-01-01',number:'PS 201',direction:'in',
 originCode:'JFK',destinationCode:'GZA',departTime:'23:30',arriveTime:'07:30',durationMinutes:60,aircraftId:'a320neo',aircraft:'Airbus A320neo',layout:seedFleetLayouts().a320neo,
 revisions:{fleet:1,network:1,schedules:1},classification:'commemorative',priceMinor:0,
 originTimezone:'America/New_York',destinationTimezone:'Asia/Gaza',departAt:'2026-01-01T23:30:00-05:00',arriveAt:'2026-01-02T07:30:00+02:00',arrivalDate:'2026-01-02'});
describe('Offering local-date wire contract',()=> {
 it('validates coherent rollover and preserves untimed historical wire compatibility',()=> {
  assert.ok(offeringWireSchema.safeParse(offering()).success);
  const {originTimezone:_a,destinationTimezone:_b,departAt:_c,arriveAt:_d,arrivalDate:_e,...legacy}=offering();
  assert.ok(offeringWireSchema.safeParse(legacy).success);
 });
 it('rejects inconsistent date, duration, partial timing and unrelated fields',()=> {
  for(const patch of [{arrivalDate:'2026-01-01'},{durationMinutes:61},{arriveTime:'08:30'},{departTime:'22:30'},{arriveAt:undefined},{ownerApproved:true}]) {
   assert.equal(offeringWireSchema.safeParse({...offering(),...patch}).success,false);
  }
 });
});
