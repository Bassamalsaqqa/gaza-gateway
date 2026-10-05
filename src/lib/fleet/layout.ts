/**
 * Gaza Gateway — Fleet Pure Layout Helpers
 *
 * Provides pure, deterministic layout geometry helpers, capacity calculations,
 * cabin zone resolution, seat existence, structural availability, and seat position.
 */

import type { AircraftLayout, CabinId, SeatZone } from "./types.ts";

/**
 * Common shape for any object defining physical seat layout geometry.
 * Satisfied by both canonical AircraftLayout and LegSeatLayoutSnapshot.
 */
export type LayoutGeometry = Pick<
  AircraftLayout,
  "rows" | "letters" | "aisleAfter" | "zones" | "extraLegroomRows" | "unavailable"
>;

/**
 * Validates and parses a generic seat code string into row and column letter.
 * Syntax requirement: 1+ decimal digits followed by a single letter.
 * Valid rows: 1-60.
 * Canonical uppercase parsing; geometry determines whether that seat exists.
 */
export function parseSeatCode(code: string): { row: number; letter: string } | null {
  if (typeof code !== "string") return null;
  const match = /^([1-9]\d*)([A-Z])$/.exec(code);
  if (!match) return null;
  const row = Number.parseInt(match[1]!, 10);
  const letter = match[2]!;
  if (!Number.isSafeInteger(row) || row < 1 || row > 60) return null;
  return { row, letter };
}

/**
 * Returns all valid physical seat codes for the layout, in row-major order.
 */
export function layoutSeatCodes(layout: LayoutGeometry): string[] {
  const codes: string[] = [];
  for (let r = 1; r <= layout.rows; r++) {
    for (const letter of layout.letters) {
      codes.push(`${r}${letter}`);
    }
  }
  return codes;
}

/**
 * Calculates physical layout capacity:
 * Total grid seats (rows * letters.length) minus structurally unavailable seats.
 */
export function layoutCapacity(layout: LayoutGeometry): number {
  const total = layout.rows * layout.letters.length;
  return Math.max(0, total - layout.unavailable.length);
}

/**
 * Returns the distinct cabin IDs present in this layout in row order.
 */
export function layoutCabins(layout: LayoutGeometry): CabinId[] {
  const cabins: CabinId[] = [];
  for (const zone of layout.zones) {
    if (!cabins.includes(zone.id)) {
      cabins.push(zone.id);
    }
  }
  return cabins;
}

/**
 * Checks whether the given cabin is supported by this layout.
 */
export function layoutSupportsCabin(layout: LayoutGeometry, cabin: CabinId): boolean {
  return layout.zones.some((z) => z.id === cabin);
}

/**
 * Returns the cabin zone that contains the specified row number.
 */
export function layoutZone(layout: LayoutGeometry, row: number): SeatZone | undefined {
  return layout.zones.find((z) => row >= z.firstRow && row <= z.lastRow);
}

/**
 * Returns the cabin ID for a specified row number, or undefined if outside the layout.
 */
export function cabinOfLayoutRow(layout: LayoutGeometry, row: number): CabinId | undefined {
  return layoutZone(layout, row)?.id;
}

/**
 * Determines whether a seat code physically exists within the layout grid.
 */
export function seatExists(layout: LayoutGeometry, code: string): boolean {
  const parsed = parseSeatCode(code);
  if (!parsed) return false;
  return (
    parsed.row >= 1 &&
    parsed.row <= layout.rows &&
    layout.letters.includes(parsed.letter)
  );
}

/**
 * Determines whether a seat is structurally available (exists and not blocked/unavailable).
 */
export function seatStructurallyAvailable(layout: LayoutGeometry, code: string): boolean {
  if (!seatExists(layout, code)) return false;
  const parsed = parseSeatCode(code)!;
  const canonical = `${parsed.row}${parsed.letter}`;
  return !layout.unavailable.includes(canonical);
}

/**
 * Determines whether a seat is classified as extra legroom in this layout.
 */
export function seatIsExtraLegroom(layout: LayoutGeometry, code: string): boolean {
  if (!seatExists(layout, code)) return false;
  const parsed = parseSeatCode(code)!;
  return layout.extraLegroomRows.includes(parsed.row);
}

/**
 * Returns the physical seat category for pricing/selection: "extraLegroom" or "standard".
 * Returns null if the seat code does not exist in the layout.
 */
export function seatPhysicalCategory(
  layout: LayoutGeometry,
  code: string,
): "extraLegroom" | "standard" | null {
  if (!seatExists(layout, code)) return null;
  return seatIsExtraLegroom(layout, code) ? "extraLegroom" : "standard";
}

/**
 * Determines a seat column's physical position relative to windows and aisle.
 * - First and last columns are "window"
 * - Immediate neighbors of the aisle (aisleAfter-1 and aisleAfter) are "aisle"
 * - Others are "middle"
 */
export function seatPosition(
  layout: LayoutGeometry,
  letter: string,
): "window" | "aisle" | "middle" {
  const upper = letter.toUpperCase();
  const idx = layout.letters.indexOf(upper);
  if (idx === -1) return "middle";
  if (idx === 0 || idx === layout.letters.length - 1) return "window";
  if (idx === layout.aisleAfter - 1 || idx === layout.aisleAfter) return "aisle";
  return "middle";
}

/**
 * Maps known legacy aircraft model names to seed airframe IDs.
 */
export function aircraftNameToSeedId(name: string): string | undefined {
  if (name === "Airbus A320neo") return "a320neo";
  if (name === "Airbus A321neo") return "a321neo";
  if (name === "Boeing 737-800") return "b737800";
  return undefined;
}

/**
 * Resolves the physical capacity for a flight using the assigned fleet layout.
 * Returns null if fleet is not available, aircraft is unknown, or layout is missing.
 */
export function resolveFlightCapacity(
  flight: { aircraftId?: string | undefined; aircraft?: string | undefined },
  fleet?: { layouts: Record<string, AircraftLayout> } | null,
): number | null {
  if (!fleet) return null;
  const aircraftId =
    flight.aircraftId || (flight.aircraft ? aircraftNameToSeedId(flight.aircraft) : undefined);
  if (!aircraftId) return null;
  const layout = fleet.layouts[aircraftId];
  if (!layout) return null;
  return layoutCapacity(layout);
}

/**
 * Resolves aircraft model and optional registration for display.
 * Falls back to stored flight.aircraft if Fleet is unhealthy or missing.
 */
export function resolveFlightAircraftDisplay(
  flight: { aircraftId?: string | undefined; aircraft?: string | undefined },
  fleet?: { aircraft: { id: string; model: string; registration: string }[] } | null,
): { model: string; registration?: string } {
  if (fleet) {
    const aircraftId =
      flight.aircraftId || (flight.aircraft ? aircraftNameToSeedId(flight.aircraft) : undefined);
    if (aircraftId) {
      const ac = fleet.aircraft.find((a) => a.id === aircraftId);
      if (ac) {
        return { model: ac.model, registration: ac.registration };
      }
    }
  }
  return { model: flight.aircraft || "Aircraft" };
}
