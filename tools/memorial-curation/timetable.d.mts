import type {Aircraft} from '../../src/lib/fleet/types.ts';
import type {Schedule} from '../../src/lib/schedules/types.ts';
export interface PlanningAirport {code:string;timezone:string;blockMinutes:number;active:boolean;}
export interface TimetableVerification {legCount:number;minimumTurnaroundMinutes:number;aircraftCount:number;firstDate:string;lastDate:string;}
export interface NetworkVerification {
  destinationCount:number;
  scheduleCount:number;
  bidirectionalPairCount:number;
  totalLegCount:number;
  coreLegCount:number;
  expandedLegCount:number;
  destinations:string[];
  aircraftCount:number;
  firstDate:string;
  lastDate:string;
}
export const CORE: [string, number[], number, string][];
export const EXPANDED: [string, number[], number[], string, string, string][];
export function addDays(date:string,days:number):string;
export function firstUpcomingMonday(today:string):string;
export function localClock(instant:number,zone:string):{date:string;time:string;epoch:number};
export function localInstant(date:string,time:string,zone:string):number;
export function verifyTimetable(schedules:Schedule[],airports:PlanningAirport[]):TimetableVerification;
export function verifyNetworkTimetable(schedules:Schedule[],airports:PlanningAirport[]):NetworkVerification;
export function planTimetable(input:{airports:PlanningAirport[];fleet:Aircraft[];from:string;until:string}):{schemaVersion:1;classification:'commemorative';schedules:Schedule[];verification:TimetableVerification};
export function planExpandedTimetable(input:{airports:PlanningAirport[];fleet:Aircraft[];from:string;until:string;baseIndex?:number}):{schemaVersion:1;classification:'commemorative';schedules:Schedule[]};
export function planFullNetworkTimetable(input:{airports:PlanningAirport[];fleet:Aircraft[];from:string;until:string}):{
  schemaVersion:1;
  classification:'commemorative';
  schedules:Schedule[];
  coreSchedules:Schedule[];
  expandedSchedules:Schedule[];
  verification:TimetableVerification;
  networkVerification:NetworkVerification;
};
