import type {FleetSnapshot,AircraftUpdatePatch} from '../../src/lib/fleet/types.ts';
import type {Schedule,ScheduleUpdateInput} from '../../src/lib/schedules/types.ts';
import type {NetworkDestination} from '../../src/lib/network/types.ts';
import type {AirportReference} from '../../src/lib/network/http-repository.ts';
import type {TimetableVerification} from './timetable.mjs';
export interface CurationSnapshot {airports:AirportReference[];fleet:FleetSnapshot;schedules:Schedule[];}
export interface CurationPlan {schemaVersion:1;classification:'commemorative';from:string;until:string;additions:NetworkDestination[];fleetUpdates:{id:string;patch:AircraftUpdatePatch}[];scheduleAdds:Schedule[];scheduleExtensions:{id:string;patch:ScheduleUpdateInput}[];verification:TimetableVerification;snapshotFingerprint:string;}
export interface CurationAdapter {read():Promise<CurationSnapshot>;createAirport(airport:NetworkDestination):Promise<unknown>;patchAircraft(id:string,patch:AircraftUpdatePatch):Promise<unknown>;createSchedule(schedule:Schedule):Promise<unknown>;patchSchedule(id:string,patch:ScheduleUpdateInput):Promise<unknown>;}
export function buildCurationPlan(snapshot:CurationSnapshot,options:{today:string;activateStandby?:boolean}):CurationPlan;
export function snapshotFingerprint(snapshot:CurationSnapshot):string;
export function applyCurationPlan(plan:CurationPlan,adapter:CurationAdapter):Promise<{completed:number}>;
