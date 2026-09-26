/**
 * Gaza Gateway — Surface Grammar System Types
 *
 * Framework-light TypeScript definitions for semantic surface families,
 * material tones, structural frames, accents, radii, elevations, and patterns.
 *
 * Six Semantic Families:
 * 1. operational  - Flight cards, seat maps, quick edit, airfield controls
 * 2. fare         - Coherent indexed fare cards (01 Essential, 02 Classic, 03 Flex)
 * 3. dossier      - Trip manifest, booking summary, review dossier
 * 4. form-sheet   - Passenger details, checkout inputs, document sheets
 * 5. guide        - Passenger wayfinding, baggage rules, terminal guides
 * 6. editorial    - Heritage chapters, Future concepts, curatorial showcases
 */

import type { IntensityLevel, PatternId, ScaleLevel } from "@/design/patterns/pattern-types";
import type { TruthClass } from "../../lib/media.ts";

export type { TruthClass };

export type PatternIntensity = IntensityLevel;
export type PatternScale = ScaleLevel;

export type SurfaceFamilyId =
  | "operational"
  | "fare"
  | "dossier"
  | "form-sheet"
  | "guide"
  | "editorial";

export const SURFACE_FAMILY_IDS: readonly SurfaceFamilyId[] = [
  "operational",
  "fare",
  "dossier",
  "form-sheet",
  "guide",
  "editorial",
] as const;

export type SurfaceFrame =
  | "plain"
  | "rail"
  | "indexed"
  | "ticket"
  | "chapter";

export const SURFACE_FRAMES: readonly SurfaceFrame[] = [
  "plain",
  "rail",
  "indexed",
  "ticket",
  "chapter",
] as const;

export type SurfaceTone =
  | "paper"
  | "limestone"
  | "olive-soft"
  | "olive"
  | "ink";

export const SURFACE_TONES: readonly SurfaceTone[] = [
  "paper",
  "limestone",
  "olive-soft",
  "olive",
  "ink",
] as const;

export type SurfaceAccent =
  | "none"
  | "brand"
  | "clay"
  | "brass";

export const SURFACE_ACCENTS: readonly SurfaceAccent[] = [
  "none",
  "brand",
  "clay",
  "brass",
] as const;

export type SurfaceRadius = "compact" | "soft" | "editorial";

export const SURFACE_RADII: readonly SurfaceRadius[] = [
  "compact",
  "soft",
  "editorial",
] as const;

export type SurfaceElevation = "flat" | "soft" | "lift";

export const SURFACE_ELEVATIONS: readonly SurfaceElevation[] = [
  "flat",
  "soft",
  "lift",
] as const;

export type PatternPlacement =
  | "none"
  | "rail"
  | "header"
  | "corner"
  | "watermark";

export const PATTERN_PLACEMENTS: readonly PatternPlacement[] = [
  "none",
  "rail",
  "header",
  "corner",
  "watermark",
] as const;

export interface MediaTreatment {
  mediaId?: string | undefined;
  treatment?: ("none" | "top" | "side" | "cover" | "watermark") | undefined;
  focalX?: number | undefined; // 0 to 100
  focalY?: number | undefined; // 0 to 100
  overlay?: ("none" | "subtle" | "dark" | "gradient") | undefined;
  aspect?: ("auto" | "16:9" | "4:3" | "3:2" | "1:1") | undefined;
  truthClass?: TruthClass | undefined;
}

export interface SurfaceRecipe {
  family: SurfaceFamilyId;
  frame: SurfaceFrame;
  tone: SurfaceTone;
  accent: SurfaceAccent;
  radius: SurfaceRadius;
  elevation: SurfaceElevation;
  pattern: PatternId;
  patternPlacement: PatternPlacement;
  patternIntensity?: IntensityLevel | undefined;
  patternScale?: ScaleLevel | undefined;
  mediaTreatment?: MediaTreatment | undefined;
}

export interface SurfaceGrammarConfig {
  /** Master preview toggle — only effective when `?skinPreview=1` is active */
  enabled: boolean;
  families: Record<SurfaceFamilyId, SurfaceRecipe>;
  /** Bounded semantic component target overrides (e.g. "booking.flight-option") */
  targetOverrides?: Record<string, Partial<SurfaceRecipe>> | undefined;
}
