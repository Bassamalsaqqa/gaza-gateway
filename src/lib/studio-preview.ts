/**
 * Gaza Gateway — Studio Preview URL & Environment Detector
 *
 * Provides URL query guards to isolate the Appearance Studio workspace
 * and prevent production state mutation, analytics tracking, or persistent draft leakage.
 */

export const STUDIO_PREVIEW_PARAM = "studioPreview";
export const STUDIO_SCENARIO_PARAM = "scenario";
export const STUDIO_BASELINE_PARAM = "baseline";

/**
 * Checks if the current environment is running inside the Appearance Studio preview.
 * When true, store operations MUST remain ephemeral and NEVER touch `gza.store.v1`.
 */
export function isStudioPreviewActive(searchStr?: string): boolean {
  if (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __GZA_STUDIO_ISOLATED__?: boolean }).__GZA_STUDIO_ISOLATED__)
  ) {
    return true;
  }
  try {
    const query =
      typeof searchStr === "string" && searchStr.trim().length > 0
        ? searchStr
        : typeof window !== "undefined"
          ? window.location.search
          : searchStr ?? "";
    if (!query) return false;
    const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`);
    const val = params.get(STUDIO_PREVIEW_PARAM);
    const active = val === "1" || val === '"1"' || val === "'1'" || val === "true";
    if (active && typeof window !== "undefined") {
      (window as unknown as { __GZA_STUDIO_ISOLATED__?: boolean }).__GZA_STUDIO_ISOLATED__ = true;
    }
    return active;
  } catch {
    return false;
  }
}

/**
 * Checks if the current preview is in explicit Baseline mode.
 * When true, Surface Grammar renders standard accessible baselines for 1:1 comparison.
 */
export function isBaselinePreviewActive(searchStr?: string): boolean {
  try {
    const query =
      typeof searchStr === "string" && searchStr.trim().length > 0
        ? searchStr
        : typeof window !== "undefined"
          ? window.location.search
          : searchStr ?? "";
    if (!query) return false;
    const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`);
    const val = params.get(STUDIO_BASELINE_PARAM);
    return val === "1" || val === '"1"' || val === "'1'" || val === "true";
  } catch {
    return false;
  }
}

/**
 * Extracts requested scenario from query parameters if present AND studioPreview is active.
 * Guarantees scenario fixtures can never be consumed on ordinary URLs.
 */
export function getStudioScenarioParam(searchStr?: string): string | null {
  if (!isStudioPreviewActive(searchStr)) return null;
  try {
    const query =
      typeof searchStr === "string" && searchStr.trim().length > 0
        ? searchStr
        : typeof window !== "undefined"
          ? window.location.search
          : searchStr ?? "";
    if (!query) return null;
    const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`);
    return params.get(STUDIO_SCENARIO_PARAM);
  } catch {
    return null;
  }
}
