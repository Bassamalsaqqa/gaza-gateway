import { isStudioPreviewActive } from "../studio-preview.ts";
import { isSkinPreviewActive } from "../skin.ts";

/**
 * Detects if the current page view is in Studio preview, skin preview, or diagnostic mode.
 * Any preview or diagnostic query strictly excludes telemetry recording and banner presentation.
 */
export function isPreviewOrDiagnosticMode(searchStr?: string): boolean {
  if (typeof window === "undefined") {
    if (typeof searchStr === "string" && searchStr.length > 0) {
      try {
        const query = searchStr.startsWith("?") ? searchStr : `?${searchStr}`;
        const params = new URLSearchParams(query);
        return (
          isStudioPreviewActive(query) ||
          isSkinPreviewActive(query) ||
          params.has("diagnostic") ||
          params.has("diagnosticPreview") ||
          params.has("scenario") ||
          params.has("baseline")
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  if (isStudioPreviewActive(searchStr) || isSkinPreviewActive(searchStr)) {
    return true;
  }

  try {
    const query =
      typeof searchStr === "string" && searchStr.trim().length > 0
        ? searchStr
        : window.location.search;
    if (!query) return false;
    const params = new URLSearchParams(query.startsWith("?") ? query : `?${query}`);
    return (
      params.has("diagnostic") ||
      params.has("diagnosticPreview") ||
      params.has("scenario") ||
      params.has("baseline")
    );
  } catch {
    return false;
  }
}
