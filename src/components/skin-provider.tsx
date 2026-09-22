import { useEffect, useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DEFAULT_SITE_SKIN,
  SKIN_PREVIEW_EVENT,
  applySkinToDom,
  clearDomSkinOverrides,
  generateSkinStyleDeclaration,
  isSkinPreviewActive,
  readPreviewSkin,
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
 */
export function SkinPreviewListener() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isPreview = isSkinPreviewActive(searchStr);

  useIsomorphicLayoutEffect(() => {
    if (isPreview) {
      const previewSkin = readPreviewSkin();
      applySkinToDom(previewSkin);
    } else {
      clearDomSkinOverrides();
    }
  }, [isPreview]);

  // Listen for storage and custom preview update events only while preview mode is active
  useEffect(() => {
    if (!isPreview) return;

    const onUpdate = () => {
      if (isSkinPreviewActive(searchStr)) {
        const previewSkin = readPreviewSkin();
        applySkinToDom(previewSkin);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === "gza.skin.preview.v1") {
        onUpdate();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    };
  }, [isPreview, searchStr]);

  return null;
}
