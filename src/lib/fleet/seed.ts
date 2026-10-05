/**
 * Gaza Gateway — Fleet Seed Data
 *
 * Provides the authoritative, immutable seed aircraft and layouts for Palestinian Airlines.
 * Exact seeds:
 * 1. a320neo (Airbus A320neo, PS-GZA) — 168 seats, 28 rows, 3 cabins, active: true
 * 2. a321neo (Airbus A321neo, PS-GZB) — 196 seats, 33 rows, 3 cabins, unavailable ["33B", "33E"], active: true
 * 3. b737800 (Boeing 737-800, PS-GZC) — 162 seats, 27 rows, 2 cabins (Business & Economy, NO Premium), active: false
 */

import type { Aircraft, AircraftLayout, FleetEnvelopeV1 } from "./types.ts";

export function seedFleetAircraft(): Aircraft[] {
  return [
    {
      id: "a320neo",
      model: "Airbus A320neo",
      registration: "PS-GZA",
      active: true,
    },
    {
      id: "a321neo",
      model: "Airbus A321neo",
      registration: "PS-GZB",
      active: true,
    },
    {
      id: "b737800",
      model: "Boeing 737-800",
      registration: "PS-GZC",
      active: false,
    },
  ];
}

export function seedFleetLayouts(): Record<string, AircraftLayout> {
  return {
    a320neo: {
      aircraftId: "a320neo",
      rows: 28,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "premium", firstRow: 5, lastRow: 10 },
        { id: "economy", firstRow: 11, lastRow: 28 },
      ],
      extraLegroomRows: [5, 11, 12],
      unavailable: [],
    },
    a321neo: {
      aircraftId: "a321neo",
      rows: 33,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "premium", firstRow: 5, lastRow: 10 },
        { id: "economy", firstRow: 11, lastRow: 33 },
      ],
      extraLegroomRows: [5, 11, 12],
      unavailable: ["33B", "33E"],
    },
    b737800: {
      aircraftId: "b737800",
      rows: 27,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "economy", firstRow: 5, lastRow: 27 },
      ],
      extraLegroomRows: [1, 11, 12],
      unavailable: [],
    },
  };
}

/**
 * Generates a conservative, documented initial 28 x A-F Economy-only layout
 * for newly registered aircraft drafts.
 */
export function defaultNewAircraftLayout(aircraftId: string): AircraftLayout {
  return {
    aircraftId,
    rows: 28,
    letters: ["A", "B", "C", "D", "E", "F"],
    aisleAfter: 3,
    zones: [{ id: "economy", firstRow: 1, lastRow: 28 }],
    extraLegroomRows: [],
    unavailable: [],
  };
}

/**
 * Returns a complete, valid seed Fleet envelope.
 */
export function seedFleetEnvelope(): FleetEnvelopeV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    aircraft: seedFleetAircraft(),
    layouts: seedFleetLayouts(),
  };
}
