/**
 * Gaza Gateway — Surface Grammar Presets & Sanitizer
 *
 * Defines canonical defaults for all six semantic families and safe deserialization logic.
 * Guarantees zero crash on missing, outdated, or corrupted stored preview settings.
 */

import { canonicalPatternId } from "@/design/patterns/pattern-types";
import {
  FAMILY_ALLOWLISTS,
  isAllowedAccent,
  isAllowedElevation,
  isAllowedFrame,
  isAllowedPatternPlacement,
  isAllowedRadius,
  isAllowedTone,
  isMediaAllowed,
} from "./allowlists";
import type {
  MediaTreatment,
  SurfaceFamilyId,
  SurfaceGrammarConfig,
  SurfaceRecipe,
} from "./types";
import { SURFACE_FAMILY_IDS } from "./types";
import { isTargetId, sanitizeTargetOverride } from "./targets";

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

function sanitizeMediaTreatment(raw: unknown): MediaTreatment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Partial<MediaTreatment>;
  const mediaId =
    typeof obj.mediaId === "string" && obj.mediaId.trim().length > 0
      ? obj.mediaId.trim()
      : undefined;
  const treatment =
    obj.treatment === "none" ||
    obj.treatment === "top" ||
    obj.treatment === "side" ||
    obj.treatment === "cover" ||
    obj.treatment === "watermark"
      ? obj.treatment
      : "cover";
  const focalX =
    typeof obj.focalX === "number" && obj.focalX >= 0 && obj.focalX <= 100
      ? Math.round(obj.focalX)
      : 50;
  const focalY =
    typeof obj.focalY === "number" && obj.focalY >= 0 && obj.focalY <= 100
      ? Math.round(obj.focalY)
      : 50;
  const overlay =
    obj.overlay === "subtle" || obj.overlay === "dark" || obj.overlay === "gradient"
      ? obj.overlay
      : "none";
  const aspect =
    obj.aspect === "16:9" || obj.aspect === "4:3" || obj.aspect === "3:2" || obj.aspect === "1:1"
      ? obj.aspect
      : "auto";
  const truthClass = obj.truthClass === "illustrative" ? "illustrative" : "documentary";

  return { mediaId, treatment, focalX, focalY, overlay, aspect, truthClass };
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
    ? sanitizeMediaTreatment(obj.mediaTreatment) ?? fallback.mediaTreatment
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
    if (isTargetId(targetKey)) {
      const sanitized = sanitizeTargetOverride(targetKey, rawOverride);
      if (Object.keys(sanitized).length > 0) {
        targetOverrides[targetKey] = sanitized;
      }
    }
  }

  return {
    enabled,
    families,
    ...(Object.keys(targetOverrides).length > 0 ? { targetOverrides } : {}),
  };
}
