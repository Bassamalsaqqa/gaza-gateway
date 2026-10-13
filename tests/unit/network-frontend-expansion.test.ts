import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_CODES } from '../../src/lib/network/types.ts';
import { seedNetworkEnvelope } from '../../src/lib/network/seed.ts';
import { networkDestinationSchema, networkStorageSchema } from '../../src/lib/network/schema.ts';
import { airportWireSchema } from '../../src/lib/network/http-repository.ts';
import { ALL_NETWORK_DESTINATION_CODES, APPROVED_DESTINATION_PHOTO_IDS, DESTINATION_PHOTO_METADATA } from '../../src/lib/destination-media-base.ts';

describe('Twenty-destination memorial network compatibility', () => {
  const fixture = (code: string, blockMinutes = 750) => ({code, airportName:{en:'Synthetic airport',ar:'مطار اختباري'},city:{en:'Synthetic',ar:'اختبار'},country:{en:'Synthetic',ar:'اختبار'},timezone:'UTC',blockMinutes,active:true});
  it('admits only the approved twenty destinations plus the GZA API hub', () => {
    assert.equal(NETWORK_CODES.length,20);
    assert.deepEqual(ALL_NETWORK_DESTINATION_CODES,NETWORK_CODES);
    for (const code of NETWORK_CODES) {
      assert.ok(networkDestinationSchema.safeParse(fixture(code)).success);
      assert.ok(airportWireSchema.safeParse(fixture(code)).success);
    }
    assert.ok(airportWireSchema.safeParse(fixture('GZA')).success);
    assert.equal(networkDestinationSchema.safeParse(fixture('GZA')).success,false);
    assert.equal(airportWireSchema.safeParse(fixture('XYZ')).success,false);
  });
  it('keeps the complete seven-destination mock baseline valid without accepting incomplete storage', () => {
    const legacy = seedNetworkEnvelope();
    assert.equal(legacy.destinations.length,7);
    assert.ok(networkStorageSchema.safeParse(legacy).success);
    assert.equal(networkStorageSchema.safeParse({...legacy,destinations:legacy.destinations.slice(1)}).success,false);
    const expanded = {...legacy,destinations:[...legacy.destinations,...NETWORK_CODES.slice(7).map(code=>fixture(code))]};
    assert.ok(networkStorageSchema.safeParse(expanded).success);
    assert.equal(networkStorageSchema.safeParse({...expanded,destinations:[...expanded.destinations,fixture('BEY')]}).success,false);
  });
  it('rejects invalid durations and preserves only seven genuine photo catalog entries', () => {
    for (const duration of [20,600,750,1440]) assert.ok(airportWireSchema.safeParse(fixture('JFK',duration)).success);
    for (const duration of [19,1441,NaN,Infinity]) assert.equal(airportWireSchema.safeParse(fixture('JFK',duration)).success,false);
    assert.equal(APPROVED_DESTINATION_PHOTO_IDS.length,7);
    assert.equal(Object.keys(DESTINATION_PHOTO_METADATA).length,7);
    assert.equal(Object.values(DESTINATION_PHOTO_METADATA).some(photo=>photo.cityCode==='JFK'),false);
  });
});
