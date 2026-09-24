/**
 * Gaza Gateway — Surface Grammar Styling Tokens & Resolvers
 *
 * Maps abstract surface recipes into concrete Tailwind / CSS utility classes.
 * Enforces logical inline-start directionality (RTL mirror) and reduced-motion compliance.
 */

import type {
  PatternPlacement,
  SurfaceAccent,
  SurfaceElevation,
  SurfaceFamilyId,
  SurfaceFrame,
  SurfaceRadius,
  SurfaceRecipe,
  SurfaceTone,
} from "./types";

export const TONE_CLASSES: Record<SurfaceTone, { bg: string; text: string; border: string }> = {
  paper: {
    bg: "bg-card",
    text: "text-card-foreground",
    border: "border-border",
  },
  limestone: {
    bg: "bg-sand",
    text: "text-foreground",
    border: "border-border/80",
  },
  "olive-soft": {
    bg: "bg-surface-olive-soft",
    text: "text-foreground",
    border: "border-brand/30",
  },
  olive: {
    bg: "bg-brand",
    text: "text-primary-foreground",
    border: "border-brand-deep",
  },
  ink: {
    bg: "bg-ink",
    text: "text-ink-foreground",
    border: "border-ink-border",
  },
};

export const ACCENT_RAIL_CLASSES: Record<SurfaceAccent, string> = {
  none: "border-s-border/80",
  brand: "border-s-brand",
  clay: "border-s-clay",
  brass: "border-s-[#C7A46A]",
};

export const ACCENT_TEXT_CLASSES: Record<SurfaceAccent, string> = {
  none: "text-muted-foreground",
  brand: "text-brand-deep",
  clay: "text-clay",
  brass: "text-[#9E7B35]",
};

export const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  compact: "rounded-lg",
  soft: "rounded-xl",
  editorial: "rounded-2xl",
};

export const ELEVATION_CLASSES: Record<SurfaceElevation, string> = {
  flat: "shadow-none",
  soft: "shadow-[var(--shadow-soft)]",
  lift: "shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5 transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none",
};

export const FRAME_BORDER_CLASSES: Record<SurfaceFrame, string> = {
  plain: "border",
  rail: "border border-s-[4px]",
  indexed: "border border-s-[5px]",
  ticket: "border border-dashed border-border/80",
  chapter: "border border-t-[3px]",
};

/**
 * Resolves complete container class name for a given SurfaceRecipe and active state.
 */
export function resolveSurfaceClasses(
  recipe: SurfaceRecipe,
  selected = false,
  extraClasses = "",
): string {
  const tone = selected ? (recipe.tone === "paper" ? "olive-soft" : recipe.tone) : recipe.tone;
  const toneClass = TONE_CLASSES[tone];
  const radiusClass = RADIUS_CLASSES[recipe.radius];
  const elevationClass = ELEVATION_CLASSES[recipe.elevation];
  const frameClass = FRAME_BORDER_CLASSES[recipe.frame];
  const railClass = recipe.frame === "rail" || recipe.frame === "indexed"
    ? ACCENT_RAIL_CLASSES[recipe.accent]
    : "";

  const selectedClasses = selected
    ? "ring-2 ring-primary/40 border-primary font-medium"
    : "";

  return [
    "relative overflow-hidden transition-colors duration-150",
    toneClass.bg,
    toneClass.text,
    toneClass.border,
    radiusClass,
    elevationClass,
    frameClass,
    railClass,
    selectedClasses,
    extraClasses,
  ]
    .filter(Boolean)
    .join(" ");
}
