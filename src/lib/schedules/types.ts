/**
 * Gaza Gateway — Schedule Domain Types
 *
 * Recurring schedule planning for Palestinian Airlines.
 * Schedules are planning annotations only; they do NOT generate dated public
 * flights or alter booking search in Phase 6B2C1. See Phase 6B2C2 for
 * schedule-to-dated-flight materialization.
 */

export type ExceptionKind = "cancelled" | "time" | "aircraft" | "extra";

export type ScheduleException = {
  id: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  kind: ExceptionKind;
  /** Human-readable planning annotation. Never parsed into flight effects. */
  detail: string;
};

/** A recurring schedule entry for one route/direction. */
export type Schedule = {
  id: string;
  /** Flight number, e.g. "PS100" */
  number: string;
  /** out = GZA → destination, in = destination → GZA */
  direction: "out" | "in";
  /** Immutable route identity; new commands validate it through NetworkRepository. */
  destination: string;
  /** Days of week the schedule operates: 0 (Sun) … 6 (Sat). Unique integers. */
  days: number[];
  /** Departure time HH:mm */
  departTime: string;
  /** Arrival time HH:mm */
  arriveTime: string;
  /** Aircraft type name, e.g. "Airbus A320neo" */
  aircraft: string;
  /** Optional Fleet aircraft ID, e.g. "a320neo" */
  aircraftId?: string | undefined;
  /** Schedule effective from, ISO date YYYY-MM-DD */
  from: string;
  /** Schedule effective until, ISO date YYYY-MM-DD (>= from) */
  until: string;
  /** Whether this schedule entry is currently active */
  active: boolean;
  /** Planning exceptions (annotations only, not actual flight-data mutations) */
  exceptions: ScheduleException[];
};

export type ScheduleCreateInput = Schedule;

export interface ScheduleUpdateInput {
  number?: string;
  days?: number[];
  departTime?: string;
  arriveTime?: string;
  aircraft?: string;
  aircraftId?: string | undefined;
  from?: string;
  until?: string;
  active?: boolean;
  exceptions?: ScheduleException[];
}

/** Async, backend-ready ScheduleRepository contract. */
export interface ScheduleRepository {
  list(): Promise<Schedule[]>;
  getById(id: string): Promise<Schedule | null>;
  create(input: ScheduleCreateInput): Promise<Schedule>;
  update(id: string, patch: ScheduleUpdateInput): Promise<Schedule>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}
