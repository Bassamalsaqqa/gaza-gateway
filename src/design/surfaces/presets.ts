/**
 * Gaza Gateway — Surface Grammar Presets & Sanitizer
 *
 * Defines canonical defaults for all six semantic families and safe deserialization logic.
 * Guarantees zero crash on missing, outdated, or corrupted stored preview settings.
 */

import { canonicalPatternId } from "../patterns/pattern-types.ts";
import {
  FAMILY_ALLOWLISTS,
  isAllowedAccent,
  isAllowedElevation,
  isAllowedFrame,
  isAllowedPatternPlacement,
  isAllowedRadius,
  isAllowedTone,
  isMediaAllowed,
} from "./allowlists.ts";
import type {
  MediaTreatment,
  SurfaceFamilyId,
  SurfaceGrammarConfig,
  SurfaceRecipe,
  TruthClass,
} from "./types.ts";
import { SURFACE_FAMILY_IDS } from "./types.ts";
import { isTargetId, sanitizeTargetOverride } from "./runtime-targets.ts";
import { sanitizeMediaTreatmentAuthoritative } from "../../lib/media-policy.ts";

export const DEFAULT_SURFACE_RECIPES: Record<SurfaceFamilyId, SurfaceRecipe> = {
  operational: {
    family: "operational",
    frame: "rail",
    tone: "paper",
    accent: "brand",
    radius: "compact",
    elevation: "flat",
    pattern: "none",
    patternPlacement: "none",
    patternIntensity: "subtle",
    patternScale: "standard",
  },
  fare: {
    family: "fare",
    frame: "indexed",
    tone: "paper",
    accent: "brand",
    radius: "soft",
    elevation: "soft",
    pattern: "none",
    patternPlacement: "none",
    patternIntensity: "subtle",
    patternScale: "standard",
  },
  dossier: {
    family: "dossier",
    frame: "ticket",
    tone: "paper",
    accent: "clay",
    radius: "compact",
    elevation: "soft",
    pattern: "none",
    patternPlacement: "none",
    patternIntensity: "subtle",
    patternScale: "standard",
  },
  "form-sheet": {
    family: "form-sheet",
    frame: "plain",
    tone: "paper",
    accent: "none",
    radius: "soft",
    elevation: "flat",
    pattern: "none",
    patternPlacement: "none",
    patternIntensity: "subtle",
    patternScale: "standard",
  },
  guide: {
    family: "guide",
    frame: "rail",
    tone: "limestone",
    accent: "brass",
    radius: "soft",
    elevation: "soft",
    pattern: "none",
    patternPlacement: "header",
    patternIntensity: "very-subtle",
    patternScale: "standard",
    mediaTreatment: {
      mediaId: "passenger-assistance",
      treatment: "cover",
      focalX: 50,
      focalY: 50,
      overlay: "subtle",
      aspect: "auto",
    },
  },
  editorial: {
    family: "editorial",
    frame: "chapter",
    tone: "ink",
    accent: "clay",
    radius: "editorial",
    elevation: "flat",
    pattern: "none",
    patternPlacement: "watermark",
    patternIntensity: "subtle",
    patternScale: "standard",
    mediaTreatment: {
      mediaId: "landside-day",
      treatment: "cover",
      focalX: 50,
      focalY: 50,
      overlay: "subtle",
      aspect: "auto",
    },
  },
};

export const DEFAULT_SURFACE_GRAMMAR_CONFIG: SurfaceGrammarConfig = {
  enabled: true,
  families: DEFAULT_SURFACE_RECIPES,
};

function sanitizeMediaTreatment(
  raw: unknown,
  familyId?: SurfaceFamilyId,
): MediaTreatment | undefined {
  const result = sanitizeMediaTreatmentAuthoritative(raw, familyId ? { familyId } : undefined);
  return result as MediaTreatment | undefined;
}

export function sanitizeSurfaceRecipe(
  family: SurfaceFamilyId,
  raw: unknown,
  fallback = DEFAULT_SURFACE_RECIPES[family],
): SurfaceRecipe {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const obj = raw as Partial<SurfaceRecipe>;

  const frame =
    typeof obj.frame === "string" && isAllowedFrame(family, obj.frame)
      ? obj.frame
      : fallback.frame;

  const tone =
    typeof obj.tone === "string" && isAllowedTone(family, obj.tone)
      ? obj.tone
      : fallback.tone;

  const accent =
    typeof obj.accent === "string" && isAllowedAccent(family, obj.accent)
      ? obj.accent
      : fallback.accent;

  const radius =
    typeof obj.radius === "string" && isAllowedRadius(family, obj.radius)
      ? obj.radius
      : fallback.radius;

  const elevation =
    typeof obj.elevation === "string" && isAllowedElevation(family, obj.elevation)
      ? obj.elevation
      : fallback.elevation;

  const patternPlacement =
    typeof obj.patternPlacement === "string" &&
    isAllowedPatternPlacement(family, obj.patternPlacement)
      ? obj.patternPlacement
      : fallback.patternPlacement;

  let pattern = fallback.pattern;
  if (typeof obj.pattern === "string") {
    // Only allow supported surface patterns: none, gza-lattice, runway-datum, pie-factory
    if (
      obj.pattern === "none" ||
      obj.pattern === "gza-lattice" ||
      obj.pattern === "runway-datum" ||
      obj.pattern === "pie-factory"
    ) {
      pattern = obj.pattern;
    } else {
      pattern = "none";
    }
  }

  const patternIntensity =
    obj.patternIntensity === "off" ||
    obj.patternIntensity === "very-subtle" ||
    obj.patternIntensity === "subtle" ||
    obj.patternIntensity === "present"
      ? obj.patternIntensity
      : fallback.patternIntensity;

  const patternScale =
    obj.patternScale === "small" ||
    obj.patternScale === "standard" ||
    obj.patternScale === "large"
      ? obj.patternScale
      : fallback.patternScale;

  const mediaTreatment = isMediaAllowed(family)
    ? sanitizeMediaTreatment(obj.mediaTreatment, family) ?? fallback.mediaTreatment
    : undefined;

  return {
    family,
    frame,
    tone,
    accent,
    radius,
    elevation,
    pattern,
    patternPlacement,
    patternIntensity,
    patternScale,
    ...(mediaTreatment ? { mediaTreatment } : {}),
  };
}

export function sanitizeSurfaceGrammarConfig(raw: unknown): SurfaceGrammarConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SURFACE_GRAMMAR_CONFIG };
  const obj = raw as Partial<SurfaceGrammarConfig>;

  const enabled = Boolean(obj.enabled);
  const rawFamilies = (obj.families ?? {}) as Record<string, unknown>;

  const families = {} as Record<SurfaceFamilyId, SurfaceRecipe>;
  for (const familyId of SURFACE_FAMILY_IDS) {
    families[familyId] = sanitizeSurfaceRecipe(
      familyId,
      rawFamilies[familyId],
      DEFAULT_SURFACE_RECIPES[familyId],
    );
  }

  const rawOverrides = (obj.targetOverrides ?? {}) as Record<string, unknown>;
  const targetOverrides: Record<string, Partial<SurfaceRecipe>> = {};
  for (const [targetKey, rawOverride] of Object.entries(rawOverrides)) {
    if (isTargetId(targetKey) && rawOverride && typeof rawOverride === "object") {
      const sanitized = sanitizeTargetOverride(targetKey, rawOverride);
      targetOverrides[targetKey] = sanitized;
    }
  }

  return {
    enabled,
    families,
    ...(Object.keys(targetOverrides).length > 0 ? { targetOverrides } : {}),
  };
}
