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
  brass: "border-s-brass",
};

export const ACCENT_TEXT_CLASSES: Record<SurfaceAccent, string> = {
  none: "text-muted-foreground",
  brand: "text-brand-deep",
  clay: "text-clay",
  brass: "text-brass",
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
  const tone = (selected ? (recipe.tone === "paper" ? "olive-soft" : recipe.tone) : recipe.tone) ?? "paper";
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES["paper"];
  const radiusClass = (recipe.radius ? RADIUS_CLASSES[recipe.radius] : undefined) ?? RADIUS_CLASSES["soft"];
  const elevationClass = (recipe.elevation ? ELEVATION_CLASSES[recipe.elevation] : undefined) ?? ELEVATION_CLASSES["flat"];
  const frameClass = (recipe.frame ? FRAME_BORDER_CLASSES[recipe.frame] : undefined) ?? FRAME_BORDER_CLASSES["plain"];
  const railClass = (recipe.frame === "rail" || recipe.frame === "indexed") && recipe.accent
    ? (ACCENT_RAIL_CLASSES[recipe.accent] ?? "")
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
