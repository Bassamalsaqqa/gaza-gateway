import { useEffect, useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DEFAULT_SITE_SKIN,
  SKIN_PREVIEW_EVENT,
  SETTINGS_DRAFT_STORAGE_KEY,
  clearDomSkinOverrides,
  generateSkinStyleDeclaration,
  isDefaultSiteSkin,
  isSkinPreviewActive,
  type SiteSkinConfig,
} from "@/lib/skin";
import type { SettingsDraftEnvelope } from "@/lib/settings/types";
import { isBaselinePreviewActive, isStudioPreviewActive } from "@/lib/studio-preview";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Server-rendered and client-hydrated initial style declaration for site skin variables.
 * Ensures identical SSR/prerender output without flash or mismatch.
 */
export function SkinStyle() {
  return (
    <style
      id="gza-skin-vars"
      dangerouslySetInnerHTML={{ __html: generateSkinStyleDeclaration(DEFAULT_SITE_SKIN) }}
    />
  );
}

/**
 * Reactive client listener for `?skinPreview=1` and `?studioPreview=1` query parameters during SPA transitions.
 * Normal URLs without preview always use DEFAULT_SITE_SKIN and ignore preview storage.
 * The optional pattern catalog is loaded asynchronously ONLY when preview mode is active.
 */
export function SkinPreviewListener() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isPreview = isSkinPreviewActive(searchStr);

  useIsomorphicLayoutEffect(() => {
    let active = true;
    const isBaseline =
      isBaselinePreviewActive(searchStr) ||
      (typeof window !== "undefined" && isBaselinePreviewActive(window.location.search));

    if (isPreview && !isBaseline) {
      import("@/lib/skin-preview")
        .then(({ applyActivePreviewSkin }) => {
          const currentQuery = typeof window !== "undefined" ? window.location.search : searchStr;
          if (active && isSkinPreviewActive(searchStr) && isSkinPreviewActive(currentQuery)) {
            applyActivePreviewSkin();
          }
        })
        .catch(() => {
          if (active) {
            clearDomSkinOverrides();
          }
        });
    } else {
      clearDomSkinOverrides();
    }

    return () => {
      active = false;
    };
  }, [isPreview, searchStr]);

  // Listen for storage and custom preview update events only while preview mode is active
  useEffect(() => {
    if (!isPreview) return;

    let active = true;
    const onUpdate = (e?: Event) => {
      const currentQuery = typeof window !== "undefined" ? window.location.search : searchStr;
      if (!active || !isSkinPreviewActive(searchStr) || !isSkinPreviewActive(currentQuery)) {
        return;
      }
      const isBaseline =
        isBaselinePreviewActive(searchStr) ||
        (typeof window !== "undefined" && isBaselinePreviewActive(window.location.search));
      if (isBaseline) {
        clearDomSkinOverrides();
        return;
      }

      // Case 1: Live working skin preview from Studio
      if (e?.type === SKIN_PREVIEW_EVENT && e instanceof CustomEvent && e.detail) {
        const config = e.detail as SiteSkinConfig;
        if (isDefaultSiteSkin(config)) {
          clearDomSkinOverrides();
          return;
        }
        import("@/lib/skin-preview")
          .then(({ applySkinToDom }) => {
            if (active) {
              applySkinToDom(config);
            }
          })
          .catch(() => {
            if (active) clearDomSkinOverrides();
          });
        return;
      }

      // Case 2: Canonical settings draft update event
      if (e?.type === "gza:settings-draft-update") {
        const envelope = (e instanceof CustomEvent ? e.detail : null) as SettingsDraftEnvelope | null;
        const appearance = envelope?.site?.appearance;
        if (!appearance || isDefaultSiteSkin(appearance)) {
          clearDomSkinOverrides();
          return;
        }
        import("@/lib/skin-preview")
          .then(({ applySkinToDom }) => {
            if (active) {
              applySkinToDom(appearance);
            }
          })
          .catch(() => {
            if (active) clearDomSkinOverrides();
          });
        return;
      }

      // Case 3: Storage event from another tab or URL parameter change
      import("@/lib/skin-preview")
        .then(({ applyActivePreviewSkin }) => {
          const recheckQuery = typeof window !== "undefined" ? window.location.search : searchStr;
          if (active && isSkinPreviewActive(searchStr) && isSkinPreviewActive(recheckQuery)) {
            applyActivePreviewSkin();
          }
        })
        .catch(() => {
          if (active) {
            clearDomSkinOverrides();
          }
        });
    };

    const onStorage = (e: StorageEvent) => {
      // In Appearance Studio preview frame, the preview is controlled exclusively by the parent Studio controller
      if (isStudioPreviewActive(searchStr)) return;
      if (e.key === SETTINGS_DRAFT_STORAGE_KEY || e.key === "gza.skin.preview.v1") {
        onUpdate(e);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    window.addEventListener("gza:settings-draft-update", onUpdate);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SKIN_PREVIEW_EVENT, onUpdate);
      window.removeEventListener("gza:settings-draft-update", onUpdate);
    };
  }, [isPreview, searchStr]);

  return null;
}
