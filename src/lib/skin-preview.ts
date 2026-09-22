/**
 * Gaza Gateway — Lazy Skin Preview Resolver & Applicator
 *
 * Dynamically imported ONLY when `?skinPreview=1` is present or inside Appearance Lab.
 * Contains the full pattern resolver and pulls in the curated artwork catalog asynchronously.
 * Ordinary passenger browsing NEVER loads this module.
 */

import { resolveSurfaceCss } from "@/design/patterns/pattern-presets";
import {
  DEFAULT_SKIN_CSS_VARS,
  applySkinVarsToDom,
  isDefaultSiteSkin,
  readPreviewSkin,
  type ResolvedSkinVars,
  type SiteSkinConfig,
} from "./skin";

/**
 * Resolves CSS variables for any pattern in the curated catalog across all 3 surfaces.
 */
export function resolveSkinCssVars(config: SiteSkinConfig): ResolvedSkinVars {
  if (isDefaultSiteSkin(config)) {
    return DEFAULT_SKIN_CSS_VARS;
  }

  const pub = resolveSurfaceCss(
    "public",
    config.publicCanvas.pattern,
    config.publicCanvas.intensity,
    config.publicCanvas.scale,
  );
  const sand = resolveSurfaceCss(
    "sand",
    config.sandSection.pattern,
    config.sandSection.intensity,
    config.sandSection.scale,
  );
  const adm = resolveSurfaceCss(
    "admin",
    config.adminCanvas.pattern,
    config.adminCanvas.intensity,
    config.adminCanvas.scale,
  );

  return {
    "--skin-public-bg": pub.backgroundColor,
    "--skin-public-image": pub.backgroundImage,
    "--skin-public-size": pub.backgroundSize ?? "auto",
    "--skin-sand-bg": sand.backgroundColor,
    "--skin-sand-image": sand.backgroundImage,
    "--skin-sand-size": sand.backgroundSize ?? "auto",
    "--skin-admin-bg": adm.backgroundColor,
    "--skin-admin-image": adm.backgroundImage,
    "--skin-admin-size": adm.backgroundSize ?? "auto",
  };
}

/**
 * Resolves full preview skin and sets the CSS custom properties on document.documentElement.
 */
export function applySkinToDom(config: SiteSkinConfig): void {
  if (typeof document === "undefined") return;
  const vars = resolveSkinCssVars(config);
  applySkinVarsToDom(vars);
}

/**
 * Reads the stored preview skin from localStorage and applies it to DOM.
 */
export function applyActivePreviewSkin(): void {
  if (typeof window === "undefined") return;
  const preview = readPreviewSkin();
  applySkinToDom(preview);
}
