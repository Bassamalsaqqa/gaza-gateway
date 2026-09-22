/**
 * Gaza Gateway — Pattern System Metadata & Surface Definitions
 *
 * Lightweight presets and candidates metadata without SVG geometry.
 * Safe to import in both root configuration and admin tooling.
 */

import type {
  CanonicalPatternId,
  IntensityLevel,
  ScaleLevel,
  SurfaceRole,
} from "./pattern-types";

export const SURFACE_COLORS: Record<SurfaceRole, { background: string; foreground: string }> = {
  public: {
    background: "#FBFAF6",
    foreground: "#073724",
  },
  sand: {
    background: "#F5F2E7",
    foreground: "#195B3B",
  },
  admin: {
    background: "#FCF9F2",
    foreground: "#073724",
  },
};

export const INTENSITY_VALUES: Record<SurfaceRole, Record<IntensityLevel, number>> = {
  public: {
    off: 0,
    "very-subtle": 0.02,
    subtle: 0.04,
    present: 0.065,
  },
  sand: {
    off: 0,
    "very-subtle": 0.018,
    subtle: 0.035,
    present: 0.055,
  },
  admin: {
    off: 0,
    "very-subtle": 0.012,
    subtle: 0.022,
    present: 0.035,
  },
};

export const SCALE_VALUES: Record<ScaleLevel, number> = {
  small: 0.75,
  standard: 1.0,
  large: 1.5,
};

export const PUBLIC_CANDIDATE_PATTERNS: readonly CanonicalPatternId[] = [
  "pie-factory",
  "architect",
  "graph-paper",
  "rails",
  "connections",
  "topography",
  "steel-beams",
  "overlapping-diamonds",
  "floor-tile",
  "none",
];

export const SAND_CANDIDATE_PATTERNS: readonly CanonicalPatternId[] = [
  "pie-factory",
  "architect",
  "graph-paper",
  "rails",
  "connections",
  "topography",
  "steel-beams",
  "overlapping-diamonds",
  "floor-tile",
  "none",
];

export const ADMIN_CANDIDATE_PATTERNS: readonly CanonicalPatternId[] = [
  "pie-factory",
  "architect",
  "graph-paper",
  "rails",
  "connections",
  "signal",
  "topography",
  "steel-beams",
  "overlapping-diamonds",
  "floor-tile",
  "circuit-board",
  "none",
];
