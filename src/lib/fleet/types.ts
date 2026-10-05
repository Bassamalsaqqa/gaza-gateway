/**
 * Gaza Gateway — Fleet Domain Types
 *
 * Defines the canonical fleet and seat layout data model, storage envelope,
 * mutation contracts, and domain error types for Palestinian Airlines.
 */

import type { CabinId } from "../data.ts";

export type { CabinId };

export interface SeatZone {
  id: CabinId;
  firstRow: number;
  lastRow: number;
}

export interface Aircraft {
  /** Stable immutable identifier (e.g. "a320neo", "a321neo", "b737800", or crypto.randomUUID). */
  id: string;
  /** Bounded model name, 1-120 characters (e.g. "Airbus A320neo"). */
  model: string;
  /** Normalized uppercase registration, unique case-insensitive (e.g. "PS-GZA"). */
  registration: string;
  /** Whether the aircraft is active for new flight/schedule assignments. */
  active: boolean;
}

export interface AircraftLayout {
  /** Target aircraft ID this layout belongs to. Exactly one layout per aircraft. */
  aircraftId: string;
  /** Total row count, integer 1-60. */
  rows: number;
  /** Non-empty unique uppercase single letters A-Z in ascending order. */
  letters: string[];
  /** Column count before the single aisle (>= 1 and < letters.length). */
  aisleAfter: number;
  /** Cabin zones covering all rows 1-rows without gaps or overlaps. */
  zones: SeatZone[];
  /** Rows offering extra legroom. Unique row numbers within 1-rows. */
  extraLegroomRows: number[];
  /** Structurally unavailable or non-existent seat codes (e.g. ["33B", "33E"]). */
  unavailable: string[];
}

export interface FleetEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  aircraft: Aircraft[];
  layouts: Record<string, AircraftLayout>;
}

export type FleetStorageV1 = FleetEnvelopeV1;

export interface FleetSnapshot {
  revision: number;
  aircraft: Aircraft[];
  layouts: Record<string, AircraftLayout>;
}

export interface AircraftCreateInput {
  aircraft: {
    id?: string;
    model: string;
    registration: string;
    active?: boolean;
  };
  initialLayout?: Omit<AircraftLayout, "aircraftId">;
}

export interface AircraftUpdatePatch {
  model?: string;
  registration?: string;
  active?: boolean;
}

export type LayoutUpdateInput = Omit<AircraftLayout, "aircraftId">;

export interface FleetRepository {
  get(): Promise<FleetSnapshot>;
  getAircraftById(id: string): Promise<Aircraft | null>;
  getLayoutByAircraftId(aircraftId: string): Promise<AircraftLayout | null>;
  createAircraft(input: AircraftCreateInput): Promise<{ aircraft: Aircraft; layout: AircraftLayout }>;
  updateAircraft(id: string, patch: AircraftUpdatePatch): Promise<Aircraft>;
  updateLayout(aircraftId: string, input: LayoutUpdateInput): Promise<AircraftLayout>;
  subscribe(listener: () => void): () => void;
}

export type FleetFailureReason =
  | "fleet_unavailable"
  | "invalid_fleet"
  | "aircraft_not_found"
  | "layout_not_found"
  | "duplicate_registration"
  | "duplicate_aircraft_id"
  | "inactive_aircraft"
  | "invalid_layout"
  | "immutable_field"
  | "storage_error";

export class FleetError extends Error {
  public readonly reason: FleetFailureReason;
  public readonly fields: Record<string, string>;

  constructor(reason: FleetFailureReason, fields: Record<string, string> = {}) {
    super(reason);
    this.name = "FleetError";
    this.reason = reason;
    this.fields = fields;
  }
}

export function fleetErrorKey(error: unknown): string {
  if (error instanceof FleetError) {
    return `fleet.error.${error.reason}`;
  }
  if (error instanceof Error && error.name === "StorageCommitError") {
    return "fleet.error.storage";
  }
  return "fleet.error.retry";
}
