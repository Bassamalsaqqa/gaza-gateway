/**
 * Gaza Gateway — Legacy Flight Generator Compatibility Wrappers
 *
 * Explicitly-named wrappers around accepted pre-Phase 6B2C2 flight generation functions.
 * In Phase 6B2C2A, the live application (Public Flights, Booking Wizard, Flight Detail, Admin)
 * continues to consume the legacy deterministic generator from src/lib/data.ts.
 *
 * These wrappers provide a canonical transition bridge for Phase 6B2C2B discovery cutover
 * without altering existing callers, PNRs, overrides, or drafts.
 */

import { departuresOn, arrivalsOn, flightById, searchFlights, type Flight } from "../data.ts";

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
