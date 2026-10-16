import catalog from './catalog.v1.json' with {type:'json'};
import {addDays,firstUpcomingMonday,planTimetable,verifyTimetable,planFullNetworkTimetable,verifyNetworkTimetable} from './timetable.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

/** A deterministic preview built exclusively from real queried authority, with no browser seeds. */
export function buildCurationPlan(snapshot,{today,activateStandby=false,scope='all'}={}) {
  const additions=catalog.airports.map(item=>item.command).filter(item=>!snapshot.airports.some(airport=>airport.code===item.code));
  const airports=[...snapshot.airports,...additions].filter(airport=>airport.active);
  const fleet=snapshot.fleet.aircraft.map(aircraft=>({...aircraft}));const fleetUpdates=[];
  if(activateStandby && fleet.filter(aircraft=>aircraft.active).length<3) {
    const standby=fleet.find(aircraft=>aircraft.id==='b737800');
    if(!standby || standby.model!=='Boeing 737-800' || snapshot.fleet.layouts[standby.id]?.aircraftId!==standby.id) throw new Error('The approved standby aircraft and layout are unavailable.');
    if(!standby.active) {standby.active=true;fleetUpdates.push({id:standby.id,patch:{active:true}});}
  }
  const existing=snapshot.schedules.filter(schedule=>/^memorial-b01-[a-z]{3}-(?:out|in)$/.test(schedule.id));
  const starts=[...new Set(existing.map(schedule=>schedule.from))];
  if(starts.length>1) throw new Error('Existing curated periods differ; manual review is required.');
  const from=starts[0]??firstUpcomingMonday(today);
  const until=[addDays(firstUpcomingMonday(today),365),...existing.map(schedule=>schedule.until)].sort().at(-1);

  const planned=scope==='core'
    ?planTimetable({airports,fleet,from,until})
    :planFullNetworkTimetable({airports,fleet,from,until});

  for(const schedule of planned.schedules) {
    if(snapshot.fleet.layouts[schedule.aircraftId]?.aircraftId!==schedule.aircraftId) throw new Error('An approved physical seat layout is missing.');
  }
  const scheduleAdds=[];const scheduleExtensions=[];
  const compare=schedule=>JSON.stringify(canonical({...schedule,days:[...schedule.days].sort(),until:undefined}));
  for(const desired of planned.schedules) {
    const prior=snapshot.schedules.find(schedule=>schedule.id===desired.id);
    if(!prior) {scheduleAdds.push(desired);continue;}
    if(compare(prior)!==compare(desired)) throw new Error('An existing curated schedule was edited; no overwrite is allowed.');
    if(prior.until<until) scheduleExtensions.push({id:prior.id,patch:{until}});
  }
  const others=snapshot.schedules.filter(schedule=>schedule.active&&!planned.schedules.some(item=>item.id===schedule.id))
    .map(schedule=>({...schedule,from:schedule.from<from?from:schedule.from,until:schedule.until>until?until:schedule.until})).filter(schedule=>schedule.from<=schedule.until);
  const numbers=new Set(planned.schedules.map(schedule=>schedule.number.replace(/\s/g,'')));
  if(others.some(schedule=>numbers.has(schedule.number.replace(/\s/g,'')))) throw new Error('A curated flight number is already in use; manual review is required.');

  const verification=others.length>0
    ?verifyTimetable([...(planned.coreSchedules??planned.schedules),...others],airports)
    :planned.verification;
  const networkVerification=others.length>0
    ?verifyNetworkTimetable([...planned.schedules,...others],airports)
    :planned.networkVerification;

  return {schemaVersion:1,classification:'commemorative',from,until,additions,fleetUpdates,scheduleAdds,scheduleExtensions,
    verification,networkVerification,snapshotFingerprint:snapshotFingerprint(snapshot)};
}

export function snapshotFingerprint(snapshot) {
  const sort=items=>[...items].sort((a,b)=>(a.id??a.code??a.aircraftId).localeCompare(b.id??b.code??b.aircraftId));
  return JSON.stringify(canonical({airports:sort(snapshot.airports),fleet:{...snapshot.fleet,aircraft:sort(snapshot.fleet.aircraft)},schedules:sort(snapshot.schedules)}));
}

/** Ordinary authorized API commands. Preflight blocks stale previews; partial commits are reported. */
export async function applyCurationPlan(plan,adapter) {
  if(snapshotFingerprint(await adapter.read())!==plan.snapshotFingerprint) throw new Error('Authority changed after preview. Refresh the preview before publishing.');
  let completed=0;
  try {
    for(const airport of plan.additions) {await adapter.createAirport(airport);completed++;}
    for(const update of plan.fleetUpdates) {await adapter.patchAircraft(update.id,update.patch);completed++;}
    for(const schedule of plan.scheduleAdds) {await adapter.createSchedule(schedule);completed++;}
    for(const update of plan.scheduleExtensions) {await adapter.patchSchedule(update.id,update.patch);completed++;}
    return {completed};
  } catch {
    throw new Error(`Curation stopped after ${completed} committed changes. Refresh the preview; do not undo unrelated records.`);
  }
}
