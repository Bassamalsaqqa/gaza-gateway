/**
 * Gaza Gateway — Dated-Service Domain Types
 *
 * Types for pure projection of recurring Schedules onto concrete calendar dates.
 * Phase 6B2C2A provides this deterministic materializer foundation.
 * Note: Consumer cutover (Public Flights, Booking search) remains in Phase 6B2C2B.
 */

import type { Flight } from "../data.ts";
import type { Schedule } from "../schedules/types.ts";
import type { NetworkDestination } from "../network/types.ts";

export type DatedServiceMaterializationErrorCode =
  | "network_missing"
  | "network_mismatch"
  | "invalid_date"
  | "invalid_price"
  | "duplicate_schedule"
  | "invalid_clock"
  | "invalid_schedule";

export class DatedServiceMaterializationError extends Error {
  public readonly code: DatedServiceMaterializationErrorCode;

  constructor(code: DatedServiceMaterializationErrorCode, message: string) {
    super(message);
    this.name = "DatedServiceMaterializationError";
    this.code = code;
  }
}

export interface DatedServiceIdPayload {
  scheduleId: string;
  date: string; // YYYY-MM-DD
}

export interface MaterializeScheduleOptions {
  schedule: Schedule;
  network: NetworkDestination | null | undefined;
  date: string; // ISO date YYYY-MM-DD
  basePrice: number; // Explicit read-only route merchandising input
  now?: Date | string | number | undefined;
}

export interface MaterializeSchedulesOptions {
  schedules: Schedule[];
  networks: NetworkDestination[] | Map<string, NetworkDestination>;
  date: string; // ISO date YYYY-MM-DD
  routePrices?: Record<string, number> | ((destination: string) => number) | undefined;
  defaultBasePrice?: number | undefined;
  now?: Date | string | number | undefined;
}
