/**
 * Gaza Gateway — Schedule Domain Types
 *
 * Recurring schedule planning for Palestinian Airlines.
 * Phase 6B2C2A provides backward-compatible structured effects and lifecycle hardening.
 * Destructive deletion has been removed; active=false is the sole retirement mechanism.
 */

export type ExceptionKind = "cancelled" | "time" | "aircraft" | "extra";

export interface ScheduleExceptionEffectCancelled {
  cancelled: true;
}

export interface ScheduleExceptionEffectTime {
  /** Planned departure time HH:mm */
  departTime: string;
  /** Planned arrival time HH:mm */
  arriveTime: string;
}

export interface ScheduleExceptionEffectAircraft {
  /** Stable Fleet aircraft ID */
  aircraftId: string;
  /** Aircraft model name */
  aircraft: string;
}

export interface ScheduleExceptionEffectExtra {
  /** Optional departure time HH:mm (defaults to base schedule) */
  departTime?: string | undefined;
  /** Optional arrival time HH:mm (defaults to base schedule) */
  arriveTime?: string | undefined;
  /** Optional Fleet aircraft ID (defaults to base schedule) */
  aircraftId?: string | undefined;
  /** Optional aircraft model name (defaults to base schedule) */
  aircraft?: string | undefined;
}

export type ScheduleExceptionEffect =
  | ScheduleExceptionEffectCancelled
  | ScheduleExceptionEffectTime
  | ScheduleExceptionEffectAircraft
  | ScheduleExceptionEffectExtra;

export interface ScheduleExceptionBase {
  id: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  /** Human-readable planning annotation. Never parsed into flight effects. */
  detail: string;
}

export interface ScheduleExceptionCancelled extends ScheduleExceptionBase {
  kind: "cancelled";
  effect?: ScheduleExceptionEffectCancelled | undefined;
}

export interface ScheduleExceptionTime extends ScheduleExceptionBase {
  kind: "time";
  effect?: ScheduleExceptionEffectTime | undefined;
}

export interface ScheduleExceptionAircraft extends ScheduleExceptionBase {
  kind: "aircraft";
  effect?: ScheduleExceptionEffectAircraft | undefined;
}

export interface ScheduleExceptionExtra extends ScheduleExceptionBase {
  kind: "extra";
  effect?: ScheduleExceptionEffectExtra | undefined;
}

export type ScheduleException =
  | ScheduleExceptionCancelled
  | ScheduleExceptionTime
  | ScheduleExceptionAircraft
  | ScheduleExceptionExtra;

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
  /** Planning exceptions with optional backward-compatible structured effects */
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

/** Async, backend-ready ScheduleRepository contract (destructive remove removed). */
export interface ScheduleRepository {
  list(): Promise<Schedule[]>;
  getById(id: string): Promise<Schedule | null>;
  create(input: ScheduleCreateInput): Promise<Schedule>;
  update(id: string, patch: ScheduleUpdateInput): Promise<Schedule>;
  subscribe(listener: () => void): () => void;
}
