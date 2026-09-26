/**
 * Gaza Gateway — Lightweight Runtime Appearance-Target Resolution
 *
 * Provides minimal, tree-shakeable target mappings and recipe resolution for the public runtime.
 * Zero dependency on the heavy Appearance Studio editor registry or static MEDIA asset imports.
 */

import type { IntensityLevel, PatternId, ScaleLevel } from "../patterns/pattern-types.ts";
import { canonicalPatternId } from "../patterns/pattern-types.ts";
import type { TruthClass } from "../../lib/media-policy.ts";
import { sanitizeMediaTreatmentAuthoritative } from "../../lib/media-policy.ts";
import { FAMILY_ALLOWLISTS } from "./allowlists.ts";
import { DEFAULT_SURFACE_RECIPES } from "./presets.ts";
import type {
  MediaTreatment,
  PatternPlacement,
  SurfaceAccent,
  SurfaceElevation,
  SurfaceFamilyId,
  SurfaceFrame,
  SurfaceGrammarConfig,
  SurfaceRadius,
  SurfaceRecipe,
  SurfaceTone,
} from "./types";

export type CanvasTargetId = "canvas.public" | "canvas.sand";

export type FamilyTargetId =
  | "family.operational"
  | "family.fare"
  | "family.dossier"
  | "family.form-sheet"
  | "family.guide"
  | "family.editorial";

export type ComponentTargetId =
  | "booking.flight-option"
  | "booking.fare-option"
  | "booking.trip-summary"
  | "booking.passenger-sheet"
  | "booking.seat-console"
  | "booking.extras"
  | "booking.review-dossier"
  | "travel.guide"
  | "airport.chapter-card"
  | "airport.future-editorial"
  | "home.destination-card";

export type TargetId = CanvasTargetId | FamilyTargetId | ComponentTargetId;

export const CANVAS_TARGET_IDS: readonly CanvasTargetId[] = [
  "canvas.public",
  "canvas.sand",
] as const;

export const FAMILY_TARGET_IDS: readonly FamilyTargetId[] = [
  "family.operational",
  "family.fare",
  "family.dossier",
  "family.form-sheet",
  "family.guide",
  "family.editorial",
] as const;

export const COMPONENT_TARGET_IDS: readonly ComponentTargetId[] = [
  "booking.flight-option",
  "booking.fare-option",
  "booking.trip-summary",
  "booking.passenger-sheet",
  "booking.seat-console",
  "booking.extras",
  "booking.review-dossier",
  "travel.guide",
  "airport.chapter-card",
  "airport.future-editorial",
  "home.destination-card",
] as const;

export const ALL_TARGET_IDS: readonly TargetId[] = [
  ...CANVAS_TARGET_IDS,
  ...FAMILY_TARGET_IDS,
  ...COMPONENT_TARGET_IDS,
] as const;

const TARGET_ID_SET = new Set<string>(ALL_TARGET_IDS);

export function isTargetId(id: unknown): id is TargetId {
  return typeof id === "string" && TARGET_ID_SET.has(id);
}

export const TARGET_FAMILY_MAP: Record<TargetId, SurfaceFamilyId | null> = {
  "canvas.public": null,
  "canvas.sand": null,
  "family.operational": "operational",
  "family.fare": "fare",
  "family.dossier": "dossier",
  "family.form-sheet": "form-sheet",
  "family.guide": "guide",
  "family.editorial": "editorial",
  "booking.flight-option": "operational",
  "booking.fare-option": "fare",
  "booking.trip-summary": "dossier",
  "booking.passenger-sheet": "form-sheet",
  "booking.seat-console": "operational",
  "booking.extras": "operational",
  "booking.review-dossier": "dossier",
  "travel.guide": "guide",
  "airport.chapter-card": "editorial",
  "airport.future-editorial": "editorial",
  "home.destination-card": "operational",
};

export function getTargetFamily(targetId: TargetId): SurfaceFamilyId | null {
  return TARGET_FAMILY_MAP[targetId] ?? null;
}

export const TARGET_MEDIA_ALLOWED: Record<TargetId, boolean> = {
  "canvas.public": false,
  "canvas.sand": false,
  "family.operational": false,
  "family.fare": false,
  "family.dossier": false,
  "family.form-sheet": false,
  "family.guide": true,
  "family.editorial": true,
  "booking.flight-option": false,
  "booking.fare-option": false,
  "booking.trip-summary": false,
  "booking.passenger-sheet": false,
  "booking.seat-console": false,
  "booking.extras": false,
  "booking.review-dossier": false,
  "travel.guide": true,
  "airport.chapter-card": true,
  "airport.future-editorial": true,
  "home.destination-card": false,
};

export const TARGET_ALLOWED_TRUTH_CLASSES: Partial<Record<TargetId, readonly TruthClass[]>> = {
  "family.guide": ["future-concept-ai", "brand-mark", "placeholder"],
  "family.editorial": ["future-concept-ai", "brand-mark", "placeholder"],
  "travel.guide": ["future-concept-ai", "brand-mark", "placeholder"],
  "airport.chapter-card": ["brand-mark", "placeholder"],
  "airport.future-editorial": ["future-concept-ai", "placeholder"],
};

/**
 * Resolves effective SurfaceRecipe for a semantic target ID, taking into account:
 * 1. Authored default recipe for target's family
 * 2. Family recipe override from SurfaceGrammarConfig
 * 3. Component target override from SurfaceGrammarConfig.targetOverrides
 */
export function resolveTargetRecipe(
  targetId: TargetId,
  config: SurfaceGrammarConfig,
): SurfaceRecipe {
  const family = TARGET_FAMILY_MAP[targetId] ?? "operational";
  const familyDefault = DEFAULT_SURFACE_RECIPES[family];
  const familyRecipe = config.families[family] ?? familyDefault;
  const targetOverride = config.targetOverrides?.[targetId];

  if (!targetOverride) {
    return familyRecipe;
  }

  return {
    ...familyRecipe,
    ...targetOverride,
    family,
  };
}

/**
 * Validates and sanitizes a partial SurfaceRecipe for a specific TargetId,
 * enforcing family allowlists and media truth classification policies without
 * importing the full media assets catalog.
 */
export function sanitizeTargetOverride(
  targetId: TargetId,
  raw: unknown,
): Partial<SurfaceRecipe> {
  if (!raw || typeof raw !== "object") return {};
  const family = TARGET_FAMILY_MAP[targetId];
  if (!family) return {};

  const allowlist = FAMILY_ALLOWLISTS[family];
  const obj = raw as Partial<SurfaceRecipe>;
  const clean: Partial<SurfaceRecipe> = {};

  if (obj.frame && (allowlist.frames as readonly string[]).includes(obj.frame)) {
    clean.frame = obj.frame as SurfaceFrame;
  }
  if (obj.tone && (allowlist.tones as readonly string[]).includes(obj.tone)) {
    clean.tone = obj.tone as SurfaceTone;
  }
  if (obj.accent && (allowlist.accents as readonly string[]).includes(obj.accent)) {
    clean.accent = obj.accent as SurfaceAccent;
  }
  if (obj.radius && (allowlist.radii as readonly string[]).includes(obj.radius)) {
    clean.radius = obj.radius as SurfaceRadius;
  }
  if (obj.elevation && (allowlist.elevations as readonly string[]).includes(obj.elevation)) {
    clean.elevation = obj.elevation as SurfaceElevation;
  }
  if (typeof obj.pattern === "string") {
    clean.pattern = canonicalPatternId(obj.pattern);
  }
  if (
    obj.patternPlacement &&
    (allowlist.patternPlacements as readonly string[]).includes(obj.patternPlacement)
  ) {
    clean.patternPlacement = obj.patternPlacement as PatternPlacement;
  }
  if (
    obj.patternIntensity &&
    ["off", "very-subtle", "subtle", "present"].includes(obj.patternIntensity)
  ) {
    clean.patternIntensity = obj.patternIntensity as IntensityLevel;
  }
  if (
    obj.patternScale &&
    ["small", "standard", "large"].includes(obj.patternScale)
  ) {
    clean.patternScale = obj.patternScale as ScaleLevel;
  }

  // Media treatment sanitization
  const mediaAllowed = TARGET_MEDIA_ALLOWED[targetId] && allowlist.mediaAllowed;
  if (mediaAllowed && obj.mediaTreatment && typeof obj.mediaTreatment === "object") {
    const sanitizedMt = sanitizeMediaTreatmentAuthoritative(obj.mediaTreatment, { targetId });
    if (sanitizedMt) {
      clean.mediaTreatment = sanitizedMt as MediaTreatment;
    }
  }

  return clean;
}
