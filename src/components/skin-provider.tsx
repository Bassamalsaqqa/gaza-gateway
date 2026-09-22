import { useEffect, useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DEFAULT_SITE_SKIN,
  SKIN_PREVIEW_EVENT,
  clearDomSkinOverrides,
  generateSkinStyleDeclaration,
  isSkinPreviewActive,
} from "@/lib/skin";

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
 * Reactive client listener for `?skinPreview=1` query parameter during SPA transitions.
 * Normal URLs without `skinPreview=1` always use DEFAULT_SITE_SKIN and ignore preview storage.
 * The optional pattern catalog is loaded asynchronously ONLY when preview mode is active.
 */
export function SkinPreviewListener() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isPreview = isSkinPreviewActive(searchStr);

  useIsomorphicLayoutEffect(() => {
    let active = true;

    if (isPreview) {
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
    const onUpdate = () => {
      const currentQuery = typeof window !== "undefined" ? window.location.search : searchStr;
      if (!active || !isSkinPreviewActive(searchStr) || !isSkinPreviewActive(currentQuery)) {
        return;
      }
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
      if (e.key === "gza.skin.preview.v1") {
        onUpdate();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    };
  }, [isPreview, searchStr]);

  return null;
}
