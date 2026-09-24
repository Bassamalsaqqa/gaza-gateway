/**
 * Gaza Gateway — Compact Original Project SVG Motifs
 *
 * Authored geometric motifs designed as preview candidates for the Gaza Surface Grammar.
 *
 * Provenance & Attribution:
 * - Source: "gza" (Internal project engineering)
 * - License: "project" (Gaza International Airport / Palestinian Airlines project license)
 * - IMPORTANT: These are contemporary architectural and aeronautical structural geometries.
 *   They must NEVER be described as authentic tatreez, traditional Palestinian embroidery,
 *   or historical folk ornament.
 */

import type { PatternDefinition } from "@/design/patterns/pattern-types";

/**
 * Gaza Lattice — Experimental
 * Structural bay/rib geometry inspired by contemporary airfield terminal canopy
 * arches and diagonal lattice trusses.
 */
export const GAZA_LATTICE_DEFINITION: PatternDefinition = {
  id: "gza-lattice",
  name: "Gaza Lattice — Experimental",
  source: "gza",
  license: "project",
  tags: ["structural", "bay", "rib", "architecture", "experimental"],
  width: 40,
  height: 40,
  viewBox: "0 0 40 40",
  svgBody:
    "<g stroke='FILLCOLOR' stroke-opacity='FILLOPACITY'>" +
    '<path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke-width="1.2"/>' +
    '<path d="M20 0 L20 40 M0 20 L40 20" fill="none" stroke-width="0.8" stroke-dasharray="2,2"/>' +
    '<circle cx="20" cy="20" r="1.5" fill="FILLCOLOR" fill-opacity="FILLOPACITY"/>' +
    "</g>",
};

/**
 * Runway Datum — Experimental
 * Aviation wayfinding and airfield datum geometry inspired by runway centerlines,
 * threshold markings, and navigational compass ticks.
 */
export const RUNWAY_DATUM_DEFINITION: PatternDefinition = {
  id: "runway-datum",
  name: "Runway Datum — Experimental",
  source: "gza",
  license: "project",
  tags: ["aviation", "wayfinding", "runway", "datum", "experimental"],
  width: 48,
  height: 48,
  viewBox: "0 0 48 48",
  svgBody:
    "<g stroke='FILLCOLOR' stroke-opacity='FILLOPACITY'>" +
    '<line x1="24" y1="0" x2="24" y2="16" stroke-width="2"/>' +
    '<line x1="24" y1="32" x2="24" y2="48" stroke-width="2"/>' +
    '<line x1="8" y1="24" x2="18" y2="24" stroke-width="1.2"/>' +
    '<line x1="30" y1="24" x2="40" y2="24" stroke-width="1.2"/>' +
    '<circle cx="24" cy="24" r="2.5" fill="none" stroke-width="1"/>' +
    '<path d="M4 4 L8 4 L8 8 M44 4 L40 4 L40 8 M4 44 L8 44 L8 40 M44 44 L40 44 L40 40" fill="none" stroke-width="0.8"/>' +
    "</g>",
};

export const PROJECT_MOTIFS: readonly PatternDefinition[] = [
  GAZA_LATTICE_DEFINITION,
  RUNWAY_DATUM_DEFINITION,
];

/**
 * Generates an optimized inline SVG data URI for local surface decoration.
 */
export function createMotifDataUri(
  definition: PatternDefinition,
  colorHex = "#073724",
  opacity = 0.08,
): string {
  const fg = colorHex.startsWith("#") ? colorHex : `#${colorHex}`;
  const body = definition.svgBody
    .replace(/FILLCOLOR/g, fg)
    .replace(/FILLOPACITY/g, String(opacity));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${definition.width}' height='${definition.height}' viewBox='${definition.viewBox}'>${body}</svg>`;
  const encoded = encodeURIComponent(svg.replace(/%23/g, "#"))
    .replace(/%2F/g, "/")
    .replace(/%3A/g, ":")
    .replace(/%3D/g, "=")
    .replace(/%2C/g, ",")
    .replace(/%27/g, "'");
  return `url("data:image/svg+xml,${encoded}")`;
}
