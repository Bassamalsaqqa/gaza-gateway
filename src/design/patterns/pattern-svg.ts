/**
 * Gaza Gateway — Pattern SVG Rendering & Data URI Utilities
 *
 * Lightweight, pure TypeScript SVG encoder and CSS background resolver.
 * Zero external dependencies. Framework agnostic.
 */

import type {
  PatternDefinition,
  PatternStyle,
  ResolvedPatternCss,
} from "./pattern-types";

/**
 * Validates a CSS hex color string (#RGB, #RRGGBB).
 */
export function validateHexColor(color: string, fallback = "#073724"): string {
  if (!color || typeof color !== "string") return fallback;
  const trimmed = color.trim();
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    return hex;
  }
  return fallback;
}

/**
 * Safely encodes SVG text for CSS data:image/svg+xml URIs.
 *
 * Guarantees:
 * - Deterministic encoding of trusted registry SVG geometry.
 * - Colors starting with '#' are strictly encoded as '%23' in the final data URI.
 * - Characters with special meaning in URLs or CSS (<, >, #, ", %, {, }, spaces)
 *   are safely encoded.
 * - Preserves readable delimiters (/, :, =, ,, ') inside CSS url("...").
 */
export function encodeSvgDataUri(svg: string): string {
  const normalized = svg.replace(/%23/g, "#");
  const encoded = encodeURIComponent(normalized)
    .replace(/%2F/g, "/")
    .replace(/%3A/g, ":")
    .replace(/%3D/g, "=")
    .replace(/%2C/g, ",")
    .replace(/%27/g, "'");

  return "data:image/svg+xml," + encoded;
}

/**
 * Renders a specific PatternDefinition into ResolvedPatternCss given a PatternStyle.
 */
export function renderPatternSvg(
  def: PatternDefinition,
  style: PatternStyle,
): ResolvedPatternCss {
  const bgColor = validateHexColor(style.background, "#FBFAF6");
  const clampedOpacity = Math.max(
    0,
    Math.min(1, typeof style.opacity === "number" ? style.opacity : 0.05),
  );

  if (clampedOpacity <= 0) {
    return {
      backgroundColor: bgColor,
      backgroundImage: "none",
      backgroundSize: "auto",
    };
  }

  const fgHex = validateHexColor(style.foreground, "#073724");

  const body = def.svgBody
    .replace(/FILLCOLOR/g, fgHex)
    .replace(/FILLOPACITY/g, String(clampedOpacity));

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${def.width}' height='${def.height}' viewBox='${def.viewBox}'>${body}</svg>`;
  const uri = encodeSvgDataUri(svg);

  const clampedScale =
    typeof style.scale === "number" && style.scale > 0
      ? Math.max(0.2, Math.min(5, style.scale))
      : 1;

  return {
    backgroundColor: bgColor,
    backgroundImage: `url("${uri}")`,
    backgroundSize: `${Math.round(def.width * clampedScale)}px ${Math.round(def.height * clampedScale)}px`,
  };
}
