/**
 * Gaza Gateway — Site Skin Configuration and Preview Resolver (Root Safe)
 *
 * Defines site skin policy, approved surface configurations, and default CSS variables.
 * Designed for lightweight root bundling: ordinary browsing only loads the default skin
 * without the heavy ~100 KB optional pattern catalog.
 *
 * Storage key: `gza.skin.preview.v1` (consumed ONLY when `skinPreview=1` query is present).
 */

import type {
  IntensityLevel,
  PatternId,
  ScaleLevel,
} from "@/design/patterns/pattern-types";
import { canonicalPatternId } from "@/design/patterns/pattern-types";
import {
  PUBLIC_CANDIDATE_PATTERNS,
  SAND_CANDIDATE_PATTERNS,
  ADMIN_CANDIDATE_PATTERNS,
} from "@/design/patterns/pattern-meta";
import { PIE_FACTORY_DEFINITION } from "@/design/patterns/pie-factory";
import { renderPatternSvg } from "@/design/patterns/pattern-svg";

export const SKIN_PREVIEW_STORAGE_KEY = "gza.skin.preview.v1";

export type SurfaceSkinConfig = {
  pattern: PatternId;
  intensity: IntensityLevel;
  scale: ScaleLevel;
};

export type SiteSkinConfig = {
  publicCanvas: SurfaceSkinConfig;
  sandSection: SurfaceSkinConfig;
  adminCanvas: SurfaceSkinConfig;
  /** Reserved extension point for future Phase 4 CardSkin configuration. */
  cards?: Record<string, unknown>;
};

export const DEFAULT_SITE_SKIN: SiteSkinConfig = {
  publicCanvas: {
    pattern: "pie-factory",
    intensity: "present",
    scale: "standard",
  },
  sandSection: {
    pattern: "pie-factory",
    intensity: "present",
    scale: "standard",
  },
  adminCanvas: {
    pattern: "pie-factory",
    intensity: "present",
    scale: "standard",
  },
};

export {
  PUBLIC_CANDIDATE_PATTERNS,
  SAND_CANDIDATE_PATTERNS,
  ADMIN_CANDIDATE_PATTERNS,
};

const VALID_INTENSITIES: ReadonlySet<IntensityLevel> = new Set([
  "off",
  "very-subtle",
  "subtle",
  "present",
]);

const VALID_SCALES: ReadonlySet<ScaleLevel> = new Set([
  "small",
  "standard",
  "large",
]);

function sanitizeSurfaceConfig(
  raw: unknown,
  fallback: SurfaceSkinConfig,
): SurfaceSkinConfig {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const obj = raw as Partial<SurfaceSkinConfig>;

  let pattern = fallback.pattern;
  if (typeof obj.pattern === "string") {
    const canon = canonicalPatternId(obj.pattern);
    pattern = canon === "none" && obj.pattern !== "none" ? fallback.pattern : canon;
  }
  const intensity =
    typeof obj.intensity === "string" && VALID_INTENSITIES.has(obj.intensity as IntensityLevel)
      ? (obj.intensity as IntensityLevel)
      : fallback.intensity;
  const scale =
    typeof obj.scale === "string" && VALID_SCALES.has(obj.scale as ScaleLevel)
      ? (obj.scale as ScaleLevel)
      : fallback.scale;

  return { pattern, intensity, scale };
}

export function sanitizeSiteSkinConfig(raw: unknown): SiteSkinConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SITE_SKIN };
  const obj = raw as Partial<SiteSkinConfig>;

  return {
    publicCanvas: sanitizeSurfaceConfig(obj.publicCanvas, DEFAULT_SITE_SKIN.publicCanvas),
    sandSection: sanitizeSurfaceConfig(obj.sandSection, DEFAULT_SITE_SKIN.sandSection),
    adminCanvas: sanitizeSurfaceConfig(obj.adminCanvas, DEFAULT_SITE_SKIN.adminCanvas),
  };
}

export function isDefaultSiteSkin(config: SiteSkinConfig): boolean {
  if (!config) return true;
  return (
    config.publicCanvas.pattern === "pie-factory" &&
    config.publicCanvas.intensity === "present" &&
    config.publicCanvas.scale === "standard" &&
    config.sandSection.pattern === "pie-factory" &&
    config.sandSection.intensity === "present" &&
    config.sandSection.scale === "standard" &&
    config.adminCanvas.pattern === "pie-factory" &&
    config.adminCanvas.intensity === "present" &&
    config.adminCanvas.scale === "standard"
  );
}

export type ResolvedSkinVars = {
  "--skin-public-bg": string;
  "--skin-public-image": string;
  "--skin-public-size": string;
  "--skin-sand-bg": string;
  "--skin-sand-image": string;
  "--skin-sand-size": string;
  "--skin-admin-bg": string;
  "--skin-admin-image": string;
  "--skin-admin-size": string;
};

// Pure rendering of default surface patterns using isolated pie-factory geometry
const defaultPublicCss = renderPatternSvg(PIE_FACTORY_DEFINITION, {
  pattern: "pie-factory",
  background: "#FBFAF6",
  foreground: "#073724",
  opacity: 0.065,
  scale: 1.0,
});

const defaultSandCss = renderPatternSvg(PIE_FACTORY_DEFINITION, {
  pattern: "pie-factory",
  background: "#F5F2E7",
  foreground: "#195B3B",
  opacity: 0.055,
  scale: 1.0,
});

const defaultAdminCss = renderPatternSvg(PIE_FACTORY_DEFINITION, {
  pattern: "pie-factory",
  background: "#FCF9F2",
  foreground: "#073724",
  opacity: 0.035,
  scale: 1.0,
});

export const DEFAULT_SKIN_CSS_VARS: ResolvedSkinVars = {
  "--skin-public-bg": defaultPublicCss.backgroundColor,
  "--skin-public-image": defaultPublicCss.backgroundImage,
  "--skin-public-size": defaultPublicCss.backgroundSize ?? "auto",
  "--skin-sand-bg": defaultSandCss.backgroundColor,
  "--skin-sand-image": defaultSandCss.backgroundImage,
  "--skin-sand-size": defaultSandCss.backgroundSize ?? "auto",
  "--skin-admin-bg": defaultAdminCss.backgroundColor,
  "--skin-admin-image": defaultAdminCss.backgroundImage,
  "--skin-admin-size": defaultAdminCss.backgroundSize ?? "auto",
};

export function generateSkinStyleDeclaration(config?: SiteSkinConfig): string {
  const vars = DEFAULT_SKIN_CSS_VARS;
  return `:root {
  --skin-public-bg: ${vars["--skin-public-bg"]};
  --skin-public-image: ${vars["--skin-public-image"]};
  --skin-public-size: ${vars["--skin-public-size"]};
  --skin-sand-bg: ${vars["--skin-sand-bg"]};
  --skin-sand-image: ${vars["--skin-sand-image"]};
  --skin-sand-size: ${vars["--skin-sand-size"]};
  --skin-admin-bg: ${vars["--skin-admin-bg"]};
  --skin-admin-image: ${vars["--skin-admin-image"]};
  --skin-admin-size: ${vars["--skin-admin-size"]};
}`;
}

export const SKIN_PREVIEW_EVENT = "gza:skin-preview-update";

export function isSkinPreviewActive(searchStr?: string): boolean {
  try {
    const query =
      searchStr !== undefined
        ? searchStr
        : typeof window !== "undefined"
          ? window.location.search
          : "";
    if (!query) return false;
    const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`);
    return params.get("skinPreview") === "1";
  } catch {
    return false;
  }
}

export function readPreviewSkin(): SiteSkinConfig {
  if (typeof window === "undefined") return DEFAULT_SITE_SKIN;
  try {
    const raw = window.localStorage.getItem(SKIN_PREVIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_SITE_SKIN;
    return sanitizeSiteSkinConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_SITE_SKIN;
  }
}

export function writePreviewSkin(config: SiteSkinConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SKIN_PREVIEW_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(SKIN_PREVIEW_EVENT, { detail: config }));
  } catch {
    /* storage restricted */
  }
}

export function clearPreviewSkin(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SKIN_PREVIEW_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SKIN_PREVIEW_EVENT, { detail: DEFAULT_SITE_SKIN }));
  } catch {
    /* storage restricted */
  }
}

export function applySkinVarsToDom(vars: ResolvedSkinVars): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function clearDomSkinOverrides(): void {
  applySkinVarsToDom(DEFAULT_SKIN_CSS_VARS);
}
