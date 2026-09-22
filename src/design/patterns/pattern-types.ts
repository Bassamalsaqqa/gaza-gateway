/**
 * Gaza Gateway — Portable Pattern Library Types
 *
 * Framework-agnostic, pure TypeScript definitions for repeatable SVG backgrounds.
 * Independent of React, TanStack, Tailwind, Radix, and application stores.
 */

export type PatternId =
  | "none"
  | "pie-factory"
  | "gza-geometric"
  | "architect"
  | "graph-paper"
  | "rails"
  | "connections"
  | "signal"
  | "topography"
  | "steel-beams"
  | "overlapping-diamonds"
  | "floor-tile"
  | "circuit-board";

export type CanonicalPatternId =
  | "none"
  | "pie-factory"
  | "architect"
  | "graph-paper"
  | "rails"
  | "connections"
  | "signal"
  | "topography"
  | "steel-beams"
  | "overlapping-diamonds"
  | "floor-tile"
  | "circuit-board";

export const CANONICAL_PATTERN_IDS: readonly CanonicalPatternId[] = [
  "none",
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
] as const;

/**
 * Maps pattern alias identifiers to their canonical Hero Patterns ID.
 * Specifically, "gza-geometric" is an alias for the canonical "pie-factory" geometry.
 * Pure string check with zero SVG dependencies.
 */
export function canonicalPatternId(id: string): CanonicalPatternId {
  if (id === "gza-geometric") return "pie-factory";
  if ((CANONICAL_PATTERN_IDS as readonly string[]).includes(id)) {
    return id as CanonicalPatternId;
  }
  return "none";
}

export type SurfaceRole = "public" | "sand" | "admin";

export type PatternDefinition = {
  id: CanonicalPatternId;
  name: string;
  source: "hero-patterns" | "gza";
  license: "CC-BY-4.0" | "project";
  tags: string[];
  width: number;
  height: number;
  viewBox: string;
  svgBody: string;
};

export type PatternStyle = {
  pattern: PatternId;
  foreground: string;
  background: string;
  opacity: number;
  scale?: number;
};

export type ResolvedPatternCss = {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize?: string;
};

export type IntensityLevel = "off" | "very-subtle" | "subtle" | "present";
export type ScaleLevel = "small" | "standard" | "large";
