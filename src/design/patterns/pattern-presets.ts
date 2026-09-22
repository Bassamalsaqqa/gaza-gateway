/**
 * Gaza Gateway — Pattern Presets & Surface Resolvers
 *
 * Approved visual presets for Public Canvas, Sand/Editorial surfaces, and Admin Workspace.
 * Pure TypeScript, framework-agnostic, zero external dependencies.
 */

import type {
  IntensityLevel,
  PatternId,
  PatternStyle,
  ResolvedPatternCss,
  ScaleLevel,
  SurfaceRole,
} from "./pattern-types";
import { canonicalPatternId } from "./pattern-types";
import { patternCss } from "./hero-patterns";
import {
  INTENSITY_VALUES,
  SCALE_VALUES,
  SURFACE_COLORS,
} from "./pattern-meta";

export * from "./pattern-meta";
export type { SurfaceRole } from "./pattern-types";

export function resolveSurfaceStyle(
  surface: SurfaceRole,
  pattern: PatternId,
  intensity: IntensityLevel = "present",
  scale: ScaleLevel = "standard",
): PatternStyle {
  const canon = canonicalPatternId(pattern);
  const colors = SURFACE_COLORS[surface];
  const opacity =
    INTENSITY_VALUES[surface][intensity] ?? INTENSITY_VALUES[surface].present;
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
