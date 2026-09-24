/**
 * Gaza Gateway — Surface Grammar Per-Family Allowlists
 *
 * Strict guardrails ensuring each semantic family only receives aesthetically and
 * ergonomically appropriate frames, material tones, accents, elevations, and patterns.
 * Prevents arbitrary styling, illegible backgrounds, or inappropriate media.
 */

import type {
  PatternPlacement,
  SurfaceAccent,
  SurfaceElevation,
  SurfaceFamilyId,
  SurfaceFrame,
  SurfaceRadius,
  SurfaceTone,
} from "./types";

export interface FamilyAllowlist {
  frames: readonly SurfaceFrame[];
  tones: readonly SurfaceTone[];
  accents: readonly SurfaceAccent[];
  radii: readonly SurfaceRadius[];
  elevations: readonly SurfaceElevation[];
  patternPlacements: readonly PatternPlacement[];
  mediaAllowed: boolean;
}

export const FAMILY_ALLOWLISTS: Record<SurfaceFamilyId, FamilyAllowlist> = {
  operational: {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "corner"],
    mediaAllowed: false,
  },
  fare: {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "header", "corner"],
    mediaAllowed: false,
  },
  dossier: {
    frames: ["plain", "rail", "indexed", "ticket"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "watermark"],
    mediaAllowed: false,
  },
  "form-sheet": {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone"],
    accents: ["none", "brand"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft"],
    patternPlacements: ["none", "rail"],
    mediaAllowed: false,
  },
  guide: {
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner"],
    mediaAllowed: true,
  },
  editorial: {
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner", "watermark"],
    mediaAllowed: true,
  },
};

/**
 * Validates and clamps a property to its family allowlist.
 */
export function isAllowedFrame(family: SurfaceFamilyId, frame: string): frame is SurfaceFrame {
  return (FAMILY_ALLOWLISTS[family].frames as readonly string[]).includes(frame);
}

export function isAllowedTone(family: SurfaceFamilyId, tone: string): tone is SurfaceTone {
  return (FAMILY_ALLOWLISTS[family].tones as readonly string[]).includes(tone);
}

export function isAllowedAccent(family: SurfaceFamilyId, accent: string): accent is SurfaceAccent {
  return (FAMILY_ALLOWLISTS[family].accents as readonly string[]).includes(accent);
}

export function isAllowedRadius(family: SurfaceFamilyId, radius: string): radius is SurfaceRadius {
  return (FAMILY_ALLOWLISTS[family].radii as readonly string[]).includes(radius);
}

export function isAllowedElevation(family: SurfaceFamilyId, elevation: string): elevation is SurfaceElevation {
  return (FAMILY_ALLOWLISTS[family].elevations as readonly string[]).includes(elevation);
}

export function isAllowedPatternPlacement(
  family: SurfaceFamilyId,
  placement: string,
): placement is PatternPlacement {
  return (FAMILY_ALLOWLISTS[family].patternPlacements as readonly string[]).includes(placement);
}

export function isMediaAllowed(family: SurfaceFamilyId): boolean {
  return FAMILY_ALLOWLISTS[family].mediaAllowed;
}
