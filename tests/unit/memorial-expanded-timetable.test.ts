import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {compiledNetworkReference} from '../../src/lib/destination-reference.ts';
import {GZA} from '../../src/lib/data.ts';
import {seedFleetAircraft,seedFleetLayouts} from '../../src/lib/fleet/seed.ts';
import {NETWORK_CODES} from '../../src/lib/network/types.ts';
import catalog from '../../tools/memorial-curation/catalog.v1.json' with {type:'json'};
import {
  addDays,
  firstUpcomingMonday,
  localInstant,
  localClock,
  CORE,
  EXPANDED,
  planTimetable,
  planExpandedTimetable,
  verifyNetworkTimetable,
  planFullNetworkTimetable,
} from '../../tools/memorial-curation/timetable.mjs';

const catalogAirports = catalog.airports.map(item => item.command);
const allAirports = [
  {code: 'GZA', airportName: GZA.name, city: GZA.city, country: GZA.country, timezone: GZA.tz, blockMinutes: 20, active: true},
  ...compiledNetworkReference,
  ...catalogAirports,
];
const fleet = seedFleetAircraft().map(aircraft => ({...aircraft, active: true}));
const layouts = seedFleetLayouts();

describe('Expanded 22-destination commemorative timetable curation', () => {
  it('plans all 15 expanded destinations with deterministic IDs and unique PS numbers', () => {
    const from = firstUpcomingMonday('2026-10-13');
    const until = addDays(from, 365);
    const result = planExpandedTimetable({airports: allAirports, fleet, from, until, baseIndex: 7});

    assert.equal(result.schedules.length, 30);
    const expectedExpandedCodes = [
      'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ', 'OSL', 'ARN',
    ];

    for (const [index, code] of expectedExpandedCodes.entries()) {
      const outSchedule = result.schedules.find(s => s.destination === code && s.direction === 'out');
      const inSchedule = result.schedules.find(s => s.destination === code && s.direction === 'in');

      assert.ok(outSchedule, `Missing outbound schedule for ${code}`);
      assert.ok(inSchedule, `Missing inbound schedule for ${code}`);

      assert.equal(outSchedule.id, `memorial-b01-${code.toLowerCase()}-out`);
      assert.equal(inSchedule.id, `memorial-b01-${code.toLowerCase()}-in`);

      const expectedOutNumber = `PS ${201 + (7 + index) * 2}`;
      const expectedInNumber = `PS ${201 + (7 + index) * 2 + 1}`;
      assert.equal(outSchedule.number, expectedOutNumber);
      assert.equal(inSchedule.number, expectedInNumber);

      // Verify layout exists for aircraft assigned
      assert.ok(layouts[outSchedule.aircraftId], `Layout missing for ${outSchedule.aircraftId}`);
      assert.ok(layouts[inSchedule.aircraftId], `Layout missing for ${inSchedule.aircraftId}`);
    }

    const numbers = new Set(result.schedules.map(s => s.number));
    assert.equal(numbers.size, 30);
    const ids = new Set(result.schedules.map(s => s.id));
    assert.equal(ids.size, 30);
  });

  it('covers all 22 destinations bidirectionally and audits the full commemorative network', () => {
    const from = '2026-10-19';
    const until = '2027-10-19';
    const plan = planFullNetworkTimetable({airports: allAirports, fleet, from, until});

    assert.equal(plan.schedules.length, 44);
    assert.equal(plan.coreSchedules.length, 14);
    assert.equal(plan.expandedSchedules.length, 30);

    // Verify all 20 schema codes are present
    const coveredDestinations = new Set(plan.schedules.map(s => s.destination));
    assert.equal(coveredDestinations.size, 22);
    for (const code of NETWORK_CODES) {
      assert.ok(coveredDestinations.has(code), `Destination ${code} must be covered`);
      const outLeg = plan.schedules.find(s => s.destination === code && s.direction === 'out');
      const inLeg = plan.schedules.find(s => s.destination === code && s.direction === 'in');
      assert.ok(outLeg, `Destination ${code} must have outbound`);
      assert.ok(inLeg, `Destination ${code} must have inbound`);
    }

    // Verify flight numbers are unique across all 40 schedules (PS 201 to PS 240)
    const allNumbers = new Set(plan.schedules.map(s => s.number));
    assert.equal(allNumbers.size, 44);
    for (let i = 201; i <= 244; i++) {
      assert.ok(allNumbers.has(`PS ${i}`), `Flight PS ${i} must exist in full network`);
    }

    // Core physical rotation verification must remain certified
    assert.equal(plan.verification.aircraftCount, 3);
    assert.ok(plan.verification.minimumTurnaroundMinutes >= 60);
    assert.ok(plan.verification.legCount > 2800);

    // Network verification audit
    assert.equal(plan.networkVerification.destinationCount, 22);
    assert.equal(plan.networkVerification.scheduleCount, 44);
    assert.equal(plan.networkVerification.bidirectionalPairCount, 22);
    assert.equal(plan.networkVerification.aircraftCount, 3);
    assert.ok(plan.networkVerification.totalLegCount > 6000);
    assert.equal(
      plan.networkVerification.totalLegCount,
      plan.networkVerification.coreLegCount + plan.networkVerification.expandedLegCount,
    );
  });

  it('validates duration from network authority, finite dates, and rejects falsified data', () => {
    const from = '2026-10-19';
    const until = '2027-10-19';
    const plan = planFullNetworkTimetable({airports: allAirports, fleet, from, until});

    for (const schedule of plan.schedules) {
      const dest = allAirports.find(a => a.code === schedule.destination);
      assert.ok(dest, `Destination ${schedule.destination} must exist in network authority`);
      assert.ok(dest.blockMinutes >= 55 && dest.blockMinutes <= 735);
      assert.ok(schedule.days.length >= 2 && schedule.days.length <= 7);
      assert.ok(schedule.from === from && schedule.until === until);
    }

    // Rejects invalid date format
    assert.throws(() => addDays('2026-13-40', 1), /Invalid calendar/);
    assert.throws(() => addDays('not-a-date', 1), /Invalid calendar/);

    // Rejects timetable horizon less than 1 year or over 3 years
    assert.throws(() => planFullNetworkTimetable({airports: allAirports, fleet, from: '2026-10-19', until: '2026-12-31'}), /full year/);
    assert.throws(() => planFullNetworkTimetable({airports: allAirports, fleet, from: '2026-10-19', until: '2030-10-19'}), /three years/);
  });

  it('correctly models overnight journeys, timezone progressions, and lagged inbound days', () => {
    const from = '2026-10-19';
    const until = '2027-10-19';
    const plan = planFullNetworkTimetable({airports: allAirports, fleet, from, until});

    // KUL: Outbound departs evening 19:30 on Mon/Thu [1, 4], arrives KUL next morning.
    // Inbound departs KUL on Tue/Fri [2, 5] (lagged by 1 day)
    const kulOut = plan.schedules.find(s => s.destination === 'KUL' && s.direction === 'out')!;
    const kulIn = plan.schedules.find(s => s.destination === 'KUL' && s.direction === 'in')!;
    assert.deepEqual(kulOut.days, [1, 4]);
    assert.deepEqual(kulIn.days, [2, 5]);

    // JFK: Outbound departs Sun/Wed [0, 3]. Inbound departs Mon/Thu [1, 4] (lagged by 1 day)
    const jfkOut = plan.schedules.find(s => s.destination === 'JFK' && s.direction === 'out')!;
    const jfkIn = plan.schedules.find(s => s.destination === 'JFK' && s.direction === 'in')!;
    assert.deepEqual(jfkOut.days, [0, 3]);
    assert.deepEqual(jfkIn.days, [1, 4]);

    // YYZ: Outbound departs Tue/Fri [2, 5]. Inbound departs Wed/Sat [3, 6] (lagged by 1 day)
    const yyzOut = plan.schedules.find(s => s.destination === 'YYZ' && s.direction === 'out')!;
    const yyzIn = plan.schedules.find(s => s.destination === 'YYZ' && s.direction === 'in')!;
    assert.deepEqual(yyzOut.days, [2, 5]);
    assert.deepEqual(yyzIn.days, [3, 6]);

    // Regional BEY: same day returns with 5 days/week
    const beyOut = plan.schedules.find(s => s.destination === 'BEY' && s.direction === 'out')!;
    const beyIn = plan.schedules.find(s => s.destination === 'BEY' && s.direction === 'in')!;
    assert.deepEqual(beyOut.days, [0, 1, 2, 4, 5]);
    assert.deepEqual(beyIn.days, [0, 1, 2, 4, 5]);

    // Half-hour zone (BOM Asia/Kolkata UTC+5:30)
    const bomInstant = localInstant('2026-10-20', '06:30', 'Asia/Gaza');
    const bomArrival = localClock(bomInstant + 345 * 60000, 'Asia/Kolkata');
    assert.ok(bomArrival.time.length === 5);

    // Rejection of ambiguous / nonexistent DST local times
    assert.throws(() => localInstant('2026-03-08', '02:30', 'America/New_York'), /nonexistent/);
    assert.throws(() => localInstant('2026-11-01', '01:30', 'America/New_York'), /ambiguous/);
  });

  it('rejects broken bidirectionality or duplicate flight numbers during network verification', () => {
    const from = '2026-10-19';
    const until = '2027-10-19';
    const plan = planFullNetworkTimetable({airports: allAirports, fleet, from, until});

    // Remove one inbound schedule
    const missingInbound = plan.schedules.filter(s => s.id !== 'memorial-b01-jfk-in');
    assert.throws(() => verifyNetworkTimetable(missingInbound, allAirports), /bidirectional symmetry/);

    // Duplicate flight number
    const duplicateNumber = plan.schedules.map(s => s.id === 'memorial-b01-yyz-in' ? {...s, number: 'PS 201'} : s);
    assert.throws(() => verifyNetworkTimetable(duplicateNumber, allAirports), /Duplicate flight number/);
  });

  it('never selects an inactive preferred aircraft and falls back to active approved physical fleet', () => {
    // Seed fleet with b737800 explicitly inactive (only a320neo and a321neo active)
    const fleetWithInactiveStandby = seedFleetAircraft();
    assert.equal(fleetWithInactiveStandby.find(a => a.id === 'b737800')!.active, false);

    const from = '2026-10-19';
    const until = '2027-10-19';
    const result = planExpandedTimetable({airports: allAirports, fleet: fleetWithInactiveStandby, from, until, baseIndex: 7});

    assert.equal(result.schedules.length, 30);
    for (const schedule of result.schedules) {
      assert.notEqual(schedule.aircraftId, 'b737800', `Schedule ${schedule.id} must not be assigned inactive b737800`);
      const assignedPlane = fleetWithInactiveStandby.find(a => a.id === schedule.aircraftId);
      assert.ok(assignedPlane?.active, `Assigned aircraft ${schedule.aircraftId} must be active`);
      assert.ok(layouts[schedule.aircraftId], `Layout for ${schedule.aircraftId} must exist`);
    }

    // KWI normally prefers b737800, but because b737800 is inactive, safely falls back to active a320neo
    const kwiOut = result.schedules.find(s => s.destination === 'KWI' && s.direction === 'out')!;
    assert.equal(kwiOut.aircraftId, 'a320neo');
  });
});
