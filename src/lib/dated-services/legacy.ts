/**
 * Gaza Gateway — Legacy Flight Generator Compatibility Wrappers
 *
 * Explicitly-named wrappers around accepted pre-Phase 6B2C2 flight generation functions.
 * Runtime discovery uses the shared Schedule/Network resolver after C2B.
 * These wrappers are for explicit historical IDs, overrides, static legacy metadata
 * and isolated Studio fixtures; they never supply new-sale discovery.
 */

import { departuresOn, arrivalsOn, flightById, searchFlights, type Flight } from "../data.ts";
import { isValidISODate } from "./identity.ts";

/** Structural URL parsing only; semantic compatibility lookup remains separate. */
export function isLegacyFlightId(id: string): boolean {
  const match = /^PS\d{3}-(\d{4}-\d{2}-\d{2})-(out|in)$/.exec(id);
  return Boolean(match && isValidISODate(match[1]!));
}

/**
 * Compatibility wrapper for pre-C2 legacy departures generation.
 */
export function legacyDeparturesOn(date: string, now?: Date | string | number): Flight[] {
  return departuresOn(date, now);
}

/**
 * Compatibility wrapper for pre-C2 legacy arrivals generation.
 */
export function legacyArrivalsOn(date: string, now?: Date | string | number): Flight[] {
  return arrivalsOn(date, now);
}

/**
 * Compatibility wrapper for pre-C2 legacy flight lookup by ID.
 */
export function legacyFlightById(id: string): Flight | null {
  return flightById(id);
}

/**
 * Compatibility wrapper for pre-C2 legacy route flight search.
 */
export function legacySearchFlights(
  origin: string,
  destination: string,
  date: string,
  now?: Date | string | number,
): Flight[] {
  return searchFlights(origin, destination, date, now);
}
