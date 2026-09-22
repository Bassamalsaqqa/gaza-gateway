/**
 * Gaza Gateway — Pattern Presets & Surface Resolvers
 *
 * Approved visual presets for Public Canvas, Sand/Editorial surfaces, and Admin Workspace.
 * Pure TypeScript, framework-agnostic, zero external dependencies.
 */

import type {
  CanonicalPatternId,
  IntensityLevel,
  PatternId,
  PatternStyle,
  ResolvedPatternCss,
  ScaleLevel,
} from "./pattern-types";
import { canonicalPatternId, patternCss } from "./hero-patterns";

export type SurfaceRole = "public" | "sand" | "admin";

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

export function resolveSurfaceStyle(
  surface: SurfaceRole,
  pattern: PatternId,
  intensity: IntensityLevel = "present",
  scale: ScaleLevel = "standard",
): PatternStyle {
  const canon = canonicalPatternId(pattern);
  const colors = SURFACE_COLORS[surface];
  const opacity = INTENSITY_VALUES[surface][intensity] ?? INTENSITY_VALUES[surface].present;
  const scaleVal = SCALE_VALUES[scale] ?? 1.0;

  return {
    pattern: canon,
    background: colors.background,
    foreground: colors.foreground,
    opacity,
    scale: scaleVal,
  };
}

export function resolveSurfaceCss(
  surface: SurfaceRole,
  pattern: PatternId,
  intensity: IntensityLevel = "present",
  scale: ScaleLevel = "standard",
): ResolvedPatternCss {
  const style = resolveSurfaceStyle(surface, pattern, intensity, scale);
  return patternCss(style);
}
