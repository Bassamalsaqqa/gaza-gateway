/**
 * Gaza Gateway — Canonical Flight Domain Model
 *
 * Models static scheduled flight definitions, dated flight instances,
 * and operational overrides (status changes, gate changes, delays, notes).
 *
 * Availability & Inventory Policy:
 * The availability policy is strictly governed by `isFlightBookable()` and origin
 * station timezones from `booking-rules.ts`. Synthetic Studio scenario flights
 * and `CAP-PROOF-*` capacity test flights are explicitly isolated and blocked
 * from repository persistence.
 */

import type { Flight, FlightStatus } from "../data.ts";

export type { Flight, FlightStatus };

/** Operational change applied to a flight from airport operations or desk management. */
export interface FlightOverride {
  flightId?: string;
  status?: FlightStatus;
  gate?: string;
  terminal?: string;
  revisedDepart?: string;
  aircraft?: string;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const VALID_FLIGHT_STATUSES: ReadonlySet<FlightStatus> = new Set<FlightStatus>([
  "Scheduled",
  "OnTime",
  "Boarding",
  "Delayed",
  "Departed",
  "Landed",
  "Cancelled",
]);

type RawOverrideShape = {
  flightId?: unknown;
  status?: unknown;
  gate?: unknown;
  terminal?: unknown;
  revisedDepart?: unknown;
  aircraft?: unknown;
  note?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
};

/**
 * Pure, robust sanitizer for flight operational overrides.
 */
export function sanitizeFlightOverride(raw: unknown): FlightOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as RawOverrideShape;
  const clean: FlightOverride = {};

  if (typeof entry.flightId === "string" && entry.flightId.trim() !== "") {
    clean.flightId = entry.flightId.trim();
  }
  if (typeof entry.status === "string" && VALID_FLIGHT_STATUSES.has(entry.status as FlightStatus)) {
    clean.status = entry.status as FlightStatus;
  }
  if (typeof entry.gate === "string") {
    clean.gate = entry.gate.trim();
  }
  if (typeof entry.terminal === "string") {
    clean.terminal = entry.terminal.trim();
  }
  if (typeof entry.revisedDepart === "string") {
    clean.revisedDepart = entry.revisedDepart.trim();
  }
  if (typeof entry.aircraft === "string" && entry.aircraft.trim() !== "") {
    clean.aircraft = entry.aircraft.trim();
  }
  if (typeof entry.note === "string") {
    clean.note = entry.note.trim();
  }
  if (typeof entry.updatedAt === "string") {
    clean.updatedAt = entry.updatedAt.trim();
  }
  if (typeof entry.updatedBy === "string") {
    clean.updatedBy = entry.updatedBy.trim();
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Pure composition function: merges a base flight instance with operational overrides.
 * Governs both public boards/search and admin flight views identically.
 */
export function getEffectiveFlight(
  flight: Flight,
  override?: FlightOverride | null,
): Flight & { note?: string; revisedDepart?: string } {
  if (!flight || typeof flight !== "object") return flight;
  if (!override || typeof override !== "object") return flight;

  return {
    ...flight,
    status: override.status && VALID_FLIGHT_STATUSES.has(override.status) ? override.status : flight.status,
    gate: typeof override.gate === "string" ? override.gate : flight.gate,
    terminal: typeof override.terminal === "string" ? override.terminal : flight.terminal,
    aircraft: typeof override.aircraft === "string" && override.aircraft ? override.aircraft : flight.aircraft,
    ...(typeof override.revisedDepart === "string" && override.revisedDepart ? { revisedDepart: override.revisedDepart } : {}),
    ...(typeof override.note === "string" && override.note ? { note: override.note } : {}),
  };
}

/**
 * Returns true if the flight is a synthetic Studio test or capacity proof fixture
 * that must never be persisted into the canonical repository.
 */
export function isSyntheticFlightId(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  const upper = id.toUpperCase();
  return (
    upper.startsWith("CAP-PROOF") ||
    upper.includes("-PROOF-") ||
    upper.startsWith("TEST-") ||
    upper.includes("SCENARIO")
  );
}
