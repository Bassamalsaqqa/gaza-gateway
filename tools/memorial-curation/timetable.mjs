const DAY = 86400000;
const formatters = new Map();
const offsets = new Map();
export const CORE = [
  ['AMM', [0,1,2,3,4,5,6], 0, '07:00'], ['CAI', [0,1,2,4,6], 0, '13:00'],
  ['IST', [0,2,4,6], 1, '07:00'], ['JED', [0,3,5], 1, '15:00'],
  ['DOH', [1,3,5], 2, '05:00'], ['DXB', [2,4,6], 2, '05:00'], ['RUH', [1,4,6], 2, '15:00'],
];

export const EXPANDED = [
  ['BEY', [0,1,2,4,5], [0,1,2,4,5], '09:30', '11:45', 'a320neo'],
  ['KWI', [0,1,3,6], [0,1,3,6], '10:30', '15:30', 'b737800'],
  ['AUH', [0,3,5], [0,3,5], '11:00', '16:30', 'a320neo'],
  ['ATH', [1,4,6], [1,4,6], '08:30', '12:30', 'a320neo'],
  ['FCO', [0,2,5], [0,2,5], '09:00', '14:30', 'a320neo'],
  ['CDG', [1,3,6], [1,3,6], '08:00', '14:00', 'a321neo'],
  ['LHR', [0,2,4], [0,2,4], '07:30', '13:00', 'a321neo'],
  ['FRA', [0,3,5], [0,3,5], '08:45', '14:15', 'a320neo'],
  ['MAD', [1,5], [1,5], '09:15', '15:30', 'a320neo'],
  ['BOM', [2,6], [2,6], '06:30', '18:15', 'a321neo'],
  ['KUL', [1,4], [2,5], '19:30', '14:30', 'a321neo'],
  ['JFK', [0,3], [1,4], '09:30', '18:00', 'a321neo'],
  ['YYZ', [2,5], [3,6], '09:00', '17:30', 'a321neo'],
  ['OSL', [1,4], [1,4], '08:15', '14:00', 'a321neo'],
  ['ARN', [2,5], [2,5], '08:30', '14:00', 'a320neo'],
];

export function addDays(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) throw new Error('Invalid calendar input.');
  const value = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0,10) !== date) throw new Error('Invalid calendar date.');
  return new Date(value + days * DAY).toISOString().slice(0,10);
}

export function firstUpcomingMonday(today) {
  addDays(today, 0);
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  return addDays(today, ((8 - weekday) % 7) || 7);
}

export function localClock(instant, zone) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {timeZone:zone,calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    formatters.set(zone,formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(instant).filter(item=>item.type !== 'literal').map(item=>[item.type,item.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,epoch:Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)};
}

/** Same policy as PHP: no normalization or arbitrary choice of an ambiguous DST occurrence. */
export function localInstant(date,time,zone) {
  addDays(date,0);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid local time.');
  const wall = Date.parse(date+'T'+time+':00Z');
  const key = zone+':'+date;
  let candidates = offsets.get(key);
  if (!candidates) {
    candidates = new Set();
    for (let delta=-2*DAY;delta<=2*DAY;delta+=6*3600000) candidates.add(localClock(wall+delta,zone).epoch-(wall+delta));
    offsets.set(key,candidates);
  }
  const matches = [...candidates].map(offset=>wall-offset).filter(instant=> {
    const projected = localClock(instant,zone); return projected.date===date && projected.time===time;
  });
  if (matches.length !== 1) throw new Error('Local departure is nonexistent or ambiguous.');
  return matches[0];
}

function dates(from,until) {
  addDays(from,0); addDays(until,0);
  if (until<from || Date.parse(until)-Date.parse(from)>1096*DAY) throw new Error('Timetable horizon must be bounded to three years.');
  const values=[]; for(let date=from;date<=until;date=addDays(date,1)) values.push(date); return values;
}

function airportsByCode(airports) {
  const result = new Map();
  for(const airport of airports) {
    if (result.has(airport.code) || !airport.active || !Number.isInteger(airport.blockMinutes) || airport.blockMinutes<20 || airport.blockMinutes>1440) throw new Error('Airport authority is invalid.');
    localClock(Date.now(),airport.timezone); result.set(airport.code,airport);
  }
  if (!result.has('GZA')) throw new Error('Active GZA authority is required.');
  return result;
}

export function verifyTimetable(schedules,airports) {
  const byCode=airportsByCode(airports); const gza=byCode.get('GZA'); const legs=[];
  for(const schedule of schedules) {
    const target=byCode.get(schedule.destination); if(!target) throw new Error('Schedule destination authority is missing.');
    for(const date of dates(schedule.from,schedule.until)) {
      const effects=(schedule.exceptions??[]).filter(item=>item.date===date&&item.effect);
      if(effects.some(item=>item.kind==='cancelled'&&item.effect.cancelled)) continue;
      const extra=effects.find(item=>item.kind==='extra')?.effect;
      if (!schedule.days.includes(new Date(date+'T00:00:00Z').getUTCDay())&&!extra) continue;
      const time=effects.find(item=>item.kind==='time')?.effect;
      const equipment=effects.find(item=>item.kind==='aircraft')?.effect;
      const out=schedule.direction==='out';
      const departure=localInstant(date,time?.departTime??extra?.departTime??schedule.departTime,out?gza.timezone:target.timezone);
      const aircraftId=equipment?.aircraftId??extra?.aircraftId??schedule.aircraftId;
      if(!/^[A-Za-z0-9_-]{1,64}$/.test(aircraftId??'')) throw new Error('A dated rotation requires approved aircraft identity.');
      legs.push({aircraftId,id:schedule.id,date,departure,arrival:departure+target.blockMinutes*60000,
        origin:out?'GZA':target.code,destination:out?target.code:'GZA'});
    }
  }
  legs.sort((a,b)=>a.aircraftId.localeCompare(b.aircraftId)||a.departure-b.departure);
  let previous=null; let minimum=Infinity;
  for(const leg of legs) {
    if(previous?.aircraftId===leg.aircraftId) {
      const ground=(leg.departure-previous.arrival)/60000;
      if(previous.destination!==leg.origin || ground<60) throw new Error('Aircraft rotation has overlap, disconnected airports, or less than 60-minute turnaround.');
      minimum=Math.min(minimum,ground);
    }
    previous=leg;
  }
  return {legCount:legs.length,minimumTurnaroundMinutes:minimum,aircraftCount:new Set(legs.map(leg=>leg.aircraftId)).size,
    firstDate:schedules[0]?.from,lastDate:schedules[0]?.until};
}

export function planTimetable({airports,fleet,from,until}) {
  if(Date.parse(until)-Date.parse(from)<365*DAY) throw new Error('At least a full year of recurring service is required.');
  const calendar=dates(from,until); const byCode=airportsByCode(airports); const gza=byCode.get('GZA');
  const aircraft=fleet.filter(item=>item.active).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,3);
  if(aircraft.length!==3 || new Set(aircraft.map(item=>item.id)).size!==3) throw new Error('Three distinct approved active aircraft are required.');
  for(const plane of aircraft) if(!/^[A-Za-z0-9_-]{1,64}$/.test(plane.id)||!plane.model) throw new Error('Aircraft authority is invalid.');
  const schedules=[];
  CORE.forEach(([code,days,planeIndex,departure],index)=> {
    const target=byCode.get(code); if(!target) throw new Error('Core destination authority is missing.');
    let latestArrival=-1;
    for(const date of calendar) {
      if(!days.includes(new Date(date+'T00:00:00Z').getUTCDay())) continue;
      const arrival=localClock(localInstant(date,departure,gza.timezone)+target.blockMinutes*60000,target.timezone);
      if(arrival.date!==date) throw new Error('Core rotation unexpectedly crosses a local calendar date.');
      latestArrival=Math.max(latestArrival,+arrival.time.slice(0,2)*60 + +arrival.time.slice(3));
    }
    const inboundMinutes=latestArrival+60;
    if(inboundMinutes>=1440) throw new Error('Core inbound cannot fit the local day.');
    const inbound=`${String(Math.floor(inboundMinutes/60)).padStart(2,'0')}:${String(inboundMinutes%60).padStart(2,'0')}`;
    for(const [direction,clock] of [['out',departure],['in',inbound]]) {
      const out=direction==='out';
      const arrival=localClock(localInstant(from,clock,out?gza.timezone:target.timezone)+target.blockMinutes*60000,out?target.timezone:gza.timezone);
      schedules.push({id:`memorial-b01-${code.toLowerCase()}-${direction}`,number:`PS ${201+index*2+(out?0:1)}`,direction,destination:code,
        days:[...days],departTime:clock,arriveTime:arrival.time,aircraft:aircraft[planeIndex].model,aircraftId:aircraft[planeIndex].id,
        from,until,active:true,exceptions:[]});
    }
  });
  return {schemaVersion:1,classification:'commemorative',schedules,verification:verifyTimetable(schedules,airports)};
}

export function planExpandedTimetable({airports,fleet,from,until,baseIndex=7}) {
  if(Date.parse(until)-Date.parse(from)<365*DAY) throw new Error('At least a full year of recurring service is required.');
  const byCode=airportsByCode(airports); const gza=byCode.get('GZA');
  const activeFleet=fleet.filter(item=>item.active);
  if(!activeFleet.length) throw new Error('At least one active approved aircraft is required.');
  const schedules=[];
  EXPANDED.forEach(([code,days,inDays,outDepart,inDepart,preferredAircraftId],index)=> {
    const target=byCode.get(code); if(!target) throw new Error(`Expanded destination authority is missing: ${code}.`);
    const plane=activeFleet.find(item=>item.id===preferredAircraftId)??activeFleet[0];
    if(!plane||!plane.model||!plane.id||!plane.active) throw new Error(`Approved active aircraft authority is required for commemorative route ${code}.`);
    const scheduleIndex=baseIndex+index;
    const outArrival=localClock(localInstant(from,outDepart,gza.timezone)+target.blockMinutes*60000,target.timezone);
    schedules.push({id:`memorial-b01-${code.toLowerCase()}-out`,number:`PS ${201+scheduleIndex*2}`,direction:'out',destination:code,
      days:[...days],departTime:outDepart,arriveTime:outArrival.time,aircraft:plane.model,aircraftId:plane.id,
      from,until,active:true,exceptions:[]});
    const inArrival=localClock(localInstant(from,inDepart,target.timezone)+target.blockMinutes*60000,gza.timezone);
    schedules.push({id:`memorial-b01-${code.toLowerCase()}-in`,number:`PS ${201+scheduleIndex*2+1}`,direction:'in',destination:code,
      days:[...inDays],departTime:inDepart,arriveTime:inArrival.time,aircraft:plane.model,aircraftId:plane.id,
      from,until,active:true,exceptions:[]});
  });
  return {schemaVersion:1,classification:'commemorative',schedules};
}

export function verifyNetworkTimetable(schedules,airports) {
  const byCode=airportsByCode(airports); const gza=byCode.get('GZA');
  if(!gza) throw new Error('Active GZA authority is required.');
  if(!schedules||schedules.length===0) throw new Error('At least one schedule is required.');
  const numbers=new Set(); const ids=new Set(); const destinations=new Set(); const pairs=new Map();
  let totalLegs=0;
  for(const schedule of schedules) {
    if(ids.has(schedule.id)) throw new Error(`Duplicate schedule ID: ${schedule.id}`);
    ids.add(schedule.id);
    const num=schedule.number.replace(/\s/g,'');
    if(numbers.has(num)) throw new Error(`Duplicate flight number: ${schedule.number}`);
    numbers.add(num);
    const target=byCode.get(schedule.destination);
    if(!target) throw new Error(`Schedule destination authority is missing for ${schedule.destination}.`);
    destinations.add(schedule.destination);
    const pair=pairs.get(schedule.destination)??{out:false,in:false};
    if(schedule.direction==='out') pair.out=true;
    if(schedule.direction==='in') pair.in=true;
    pairs.set(schedule.destination,pair);
    const out=schedule.direction==='out';
    const originZone=out?gza.timezone:target.timezone;
    const destZone=out?target.timezone:gza.timezone;
    for(const date of dates(schedule.from,schedule.until)) {
      const effects=(schedule.exceptions??[]).filter(item=>item.date===date&&item.effect);
      if(effects.some(item=>item.kind==='cancelled'&&item.effect.cancelled)) continue;
      const extra=effects.find(item=>item.kind==='extra')?.effect;
      if(!schedule.days.includes(new Date(date+'T00:00:00Z').getUTCDay())&&!extra) continue;
      const time=effects.find(item=>item.kind==='time')?.effect;
      const departTime=time?.departTime??extra?.departTime??schedule.departTime;
      const depInstant=localInstant(date,departTime,originZone);
      const arrInstant=depInstant+target.blockMinutes*60000;
      localClock(arrInstant,destZone);
      totalLegs++;
    }
  }
  for(const [code,pair] of pairs.entries()) {
    if(!pair.out||!pair.in) throw new Error(`Destination ${code} lacks bidirectional symmetry.`);
  }
  const coreDestCodes=new Set(CORE.map(([c])=>c));
  let coreLegs=0; let expandedLegs=0;
  for(const schedule of schedules) {
    let count=0;
    for(const date of dates(schedule.from,schedule.until)) {
      const effects=(schedule.exceptions??[]).filter(item=>item.date===date&&item.effect);
      if(effects.some(item=>item.kind==='cancelled'&&item.effect.cancelled)) continue;
      const extra=effects.find(item=>item.kind==='extra')?.effect;
      if(!schedule.days.includes(new Date(date+'T00:00:00Z').getUTCDay())&&!extra) continue;
      count++;
    }
    if(coreDestCodes.has(schedule.destination)) coreLegs+=count;
    else expandedLegs+=count;
  }
  return {
    destinationCount:destinations.size,
    scheduleCount:schedules.length,
    bidirectionalPairCount:pairs.size,
    totalLegCount:totalLegs,
    coreLegCount:coreLegs,
    expandedLegCount:expandedLegs,
    destinations:[...destinations],
    aircraftCount:new Set(schedules.map(s=>s.aircraftId).filter(Boolean)).size,
    firstDate:schedules[0]?.from,
    lastDate:schedules[0]?.until,
  };
}

export function planFullNetworkTimetable({airports,fleet,from,until}) {
  const coreResult=planTimetable({airports,fleet,from,until});
  const expandedResult=planExpandedTimetable({airports,fleet,from,until,baseIndex:7});
  const allSchedules=[...coreResult.schedules,...expandedResult.schedules];
  const networkVerification=verifyNetworkTimetable(allSchedules,airports);
  return {
    schemaVersion:1,
    classification:'commemorative',
    schedules:allSchedules,
    coreSchedules:coreResult.schedules,
    expandedSchedules:expandedResult.schedules,
    verification:coreResult.verification,
    networkVerification,
  };
}
