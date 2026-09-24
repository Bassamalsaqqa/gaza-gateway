/**
 * Gaza Gateway — Surface Grammar React Context & Hooks
 *
 * Lightweight reactive bridge between stored preview configuration and surface primitives.
 * Automatically respects `?skinPreview=1` URL isolation.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { isSkinPreviewActive, readPreviewSkin, SKIN_PREVIEW_EVENT } from "@/lib/skin";
import { DEFAULT_SURFACE_RECIPES } from "./presets";
import type {
  SurfaceFamilyId,
  SurfaceGrammarConfig,
  SurfaceRecipe,
} from "./types";

interface SurfaceGrammarContextValue {
  isPreview: boolean;
  config: SurfaceGrammarConfig | null;
}

const SurfaceGrammarContext = createContext<SurfaceGrammarContextValue | null>(null);

export function SurfaceGrammarProvider({
  children,
  forcedConfig,
  forcedPreview,
}: {
  children: ReactNode;
  forcedConfig?: SurfaceGrammarConfig;
  forcedPreview?: boolean;
}) {
  const searchStr = useRouterState({ select: (s) => s.location?.searchStr ?? "" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isUrlPreview =
    isSkinPreviewActive(searchStr) ||
    (typeof window !== "undefined" && isSkinPreviewActive(window.location.search));
  const isPreview = forcedPreview !== undefined ? forcedPreview : (mounted ? isUrlPreview : false);

  const [storedConfig, setStoredConfig] = useState<SurfaceGrammarConfig | null>(() => {
    if (forcedConfig) return forcedConfig;
    if (typeof window === "undefined") return null;
    const skin = readPreviewSkin();
    return skin.surfaceGrammar ?? null;
  });

  useEffect(() => {
    if (forcedConfig) {
      setStoredConfig(forcedConfig);
      return;
    }

    const updateFromStorage = () => {
      const skin = readPreviewSkin();
      setStoredConfig(skin.surfaceGrammar ?? null);
    };

    updateFromStorage();

    const onUpdate = () => updateFromStorage();
    window.addEventListener(SKIN_PREVIEW_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);

    return () => {
      window.removeEventListener(SKIN_PREVIEW_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [forcedConfig]);

  const value: SurfaceGrammarContextValue = {
    isPreview,
    config: forcedConfig ?? storedConfig,
  };

  return (
    <SurfaceGrammarContext.Provider value={value}>
      {children}
    </SurfaceGrammarContext.Provider>
  );
}

/**
 * Accesses active surface recipe for a family.
 * Returns `active: true` ONLY when preview is active AND surface grammar is enabled.
 */
export function useSurfaceRecipe(family: SurfaceFamilyId): {
  active: boolean;
  recipe: SurfaceRecipe;
} {
  const ctx = useContext(SurfaceGrammarContext);

  // If outside provider, check URL directly
  let isPreview = ctx ? ctx.isPreview : false;
  let grammarConfig = ctx ? ctx.config : null;

  if (!ctx && typeof window !== "undefined") {
    isPreview = isSkinPreviewActive();
    if (isPreview) {
      const skin = readPreviewSkin();
      grammarConfig = skin.surfaceGrammar ?? null;
    }
  }

  const enabled = isPreview && (grammarConfig ? Boolean(grammarConfig.enabled) : true);
  const recipe =
    enabled && grammarConfig?.families?.[family]
      ? grammarConfig.families[family]
      : DEFAULT_SURFACE_RECIPES[family];

  return { active: enabled, recipe };
}
