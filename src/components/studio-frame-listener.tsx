/**
 * Gaza Gateway — Appearance Studio Preview Frame Listener
 *
 * Runs inside the preview iframe when `studioPreview=1` is active.
 * Manages parent<->iframe synchronization, Inspect Mode highlighting,
 * target selection, keyboard accessibility, and safe simulation isolation.
 *
 * Inactive and zero-overhead on standard visitor URLs.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  isStudioPreviewActive,
  isBaselinePreviewActive,
} from "@/lib/studio-preview";
import {
  isValidStudioOrigin,
  parseParentMessage,
  STUDIO_PROTOCOL_VERSION,
  type FrameToParentMessage,
} from "@/lib/studio-protocol";
import {
  applySkinVarsToDom,
  clearDomSkinOverrides,
  DEFAULT_SKIN_CSS_VARS,
  DEFAULT_SITE_SKIN,
  SKIN_PREVIEW_EVENT,
  type SiteSkinConfig,
} from "@/lib/skin";
import { isTargetId, type TargetId } from "@/design/surfaces/targets";

function applyPreviewSkin(config: SiteSkinConfig) {
  import("@/lib/skin-preview").then(({ applySkinToDom }) => {
    applySkinToDom(config);
  });
}

const HOVER_OUTLINE_STYLE = "outline: 2px dashed oklch(0.42 0.085 158 / 0.85); outline-offset: 3px; cursor: crosshair;";
const SELECTED_OUTLINE_STYLE = "outline: 3px solid oklch(0.42 0.085 158); outline-offset: 4px; box-shadow: 0 0 0 6px oklch(0.42 0.085 158 / 0.25);";

export function StudioFrameListener() {
  const searchStr = useRouterState({ select: (s) => s.location?.searchStr ?? "" });
  const pathname = useRouterState({ select: (s) => s.location?.pathname ?? "" });
  const isStudio = isStudioPreviewActive(searchStr);

  const [inspectMode, setInspectMode] = useState(false);
  const [baselineMode, setBaselineMode] = useState(() => isBaselinePreviewActive(searchStr));
  const [selectedTarget, setSelectedTarget] = useState<TargetId | null>(null);
  const hoveredElRef = useRef<HTMLElement | null>(null);
  const selectedElRef = useRef<HTMLElement | null>(null);

  const postToParent = useCallback((msg: FrameToParentMessage) => {
    if (typeof window === "undefined" || window.parent === window) return;
    try {
      window.parent.postMessage(msg, window.location.origin);
    } catch {
      /* frame detached or cross-origin restricted */
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Discover available surface targets in current DOM
  // ───────────────────────────────────────────────────────────────────────────
  const discoverTargets = useCallback((): TargetId[] => {
    if (typeof document === "undefined") return [];
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-surface-target]"));
    const targets: TargetId[] = [];
    for (const el of elements) {
      const id = el.getAttribute("data-surface-target");
      if (isTargetId(id) && !targets.includes(id)) {
        targets.push(id);
      }
    }
    return targets;
  }, []);

  const baselineModeRef = useRef(baselineMode);
  baselineModeRef.current = baselineMode;
  const hasBroadcastReadyRef = useRef(false);

  // ───────────────────────────────────────────────────────────────────────────
  // One-time initial frame ready broadcast on mount
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio || hasBroadcastReadyRef.current) return;
    hasBroadcastReadyRef.current = true;
    const available = discoverTargets();
    postToParent({
      type: "GZA_STUDIO_FRAME_READY",
      version: STUDIO_PROTOCOL_VERSION,
      path: window.location.pathname + window.location.search,
      locale: window.location.pathname.startsWith("/ar") ? "ar" : "en",
      availableTargets: available,
    });
  }, [isStudio, discoverTargets, postToParent]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle Parent postMessage protocol
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio) return;

    const handleMessage = (event: MessageEvent) => {
      if (!isValidStudioOrigin(event)) return;
      if (event.source !== window.parent) return;

      const parsed = parseParentMessage(event.data);
      if (!parsed) return;

      switch (parsed.type) {
        case "GZA_STUDIO_PARENT_INIT": {
          setInspectMode(parsed.inspectMode);
          setBaselineMode(parsed.baselineMode);
          if (parsed.selectedTargetId) {
            setSelectedTarget(parsed.selectedTargetId);
          }

          if (parsed.baselineMode) {
            clearDomSkinOverrides();
            window.dispatchEvent(
              new CustomEvent(SKIN_PREVIEW_EVENT, {
                detail: { ...DEFAULT_SITE_SKIN, surfaceGrammar: { enabled: false, families: {} } },
              }),
            );
          } else {
            applyPreviewSkin(parsed.config);
            window.dispatchEvent(new CustomEvent(SKIN_PREVIEW_EVENT, { detail: parsed.config }));
          }
          break;
        }

        case "GZA_STUDIO_CONFIG_SYNC": {
          if (!baselineModeRef.current) {
            applyPreviewSkin(parsed.config);
            window.dispatchEvent(new CustomEvent(SKIN_PREVIEW_EVENT, { detail: parsed.config }));
          }
          break;
        }

        case "GZA_STUDIO_INSPECT_MODE": {
          setInspectMode(parsed.inspectMode);
          setBaselineMode(parsed.baselineMode);
          if (parsed.baselineMode) {
            clearDomSkinOverrides();
            window.dispatchEvent(
              new CustomEvent(SKIN_PREVIEW_EVENT, {
                detail: { ...DEFAULT_SITE_SKIN, surfaceGrammar: { enabled: false, families: {} } },
              }),
            );
          }
          break;
        }

        case "GZA_STUDIO_SELECT_TARGET_CMD": {
          setSelectedTarget(parsed.targetId);
          if (parsed.targetId) {
            const el = document.querySelector<HTMLElement>(
              `[data-surface-target="${parsed.targetId}"]`,
            );
            if (el && parsed.scrollIntoView) {
              el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }
          break;
        }

        case "GZA_STUDIO_NAVIGATE_SCENARIO": {
          if (parsed.path && parsed.path !== window.location.pathname + window.location.search) {
            window.location.href = parsed.path;
          }
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isStudio]);

  // ───────────────────────────────────────────────────────────────────────────
  // Notify parent on route changes
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio) return;
    postToParent({
      type: "GZA_STUDIO_ROUTE_CHANGED",
      version: STUDIO_PROTOCOL_VERSION,
      path: pathname + (window.location.search || ""),
      locale: pathname.startsWith("/ar") ? "ar" : "en",
    });
  }, [isStudio, pathname, postToParent]);

  // ───────────────────────────────────────────────────────────────────────────
  // Simulation boundary: prevent escaping Studio isolation or navigating parent
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio) return;

    if (typeof window !== "undefined") {
      (window as unknown as { __GZA_STUDIO_ISOLATED__?: boolean }).__GZA_STUDIO_ISOLATED__ = true;
    }

    const handleDocumentClick = (e: MouseEvent) => {
      if (inspectMode) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Prevent parent navigation
      if (anchor.target && anchor.target !== "_self") {
        anchor.target = "_self";
      }

      // Internal navigation: preserve studioPreview=1 and baseline=1
      if (
        href.startsWith("/") ||
        href.startsWith(window.location.origin) ||
        (!href.startsWith("http://") &&
          !href.startsWith("https://") &&
          !href.startsWith("mailto:") &&
          !href.startsWith("tel:"))
      ) {
        if (href.startsWith("#")) return;

        try {
          const url = new URL(href, window.location.origin);
          if (!url.searchParams.has("studioPreview")) {
            url.searchParams.set("studioPreview", "1");
            if (baselineMode) {
              url.searchParams.set("baseline", "1");
            }
            e.preventDefault();
            e.stopPropagation();
            window.location.href = url.pathname + url.search + url.hash;
          }
        } catch {
          // ignore
        }
      } else {
        // External link: prevent escaping studio preview frame
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isStudio, baselineMode, inspectMode]);

  // ───────────────────────────────────────────────────────────────────────────
  // Inspect Mode: Hover outline & Click Interception
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio) return;

    if (!inspectMode) {
      // Clear hover outlines
      if (hoveredElRef.current) {
        hoveredElRef.current.style.cssText = hoveredElRef.current.getAttribute("data-studio-orig-style") || "";
        hoveredElRef.current = null;
      }
      return;
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLElement>("[data-surface-target]");
      if (target && target !== hoveredElRef.current) {
        if (hoveredElRef.current && hoveredElRef.current !== selectedElRef.current) {
          hoveredElRef.current.style.cssText = hoveredElRef.current.getAttribute("data-studio-orig-style") || "";
        }
        hoveredElRef.current = target;
        if (!target.hasAttribute("data-studio-orig-style")) {
          target.setAttribute("data-studio-orig-style", target.getAttribute("style") || "");
        }
        if (target !== selectedElRef.current) {
          const orig = target.getAttribute("data-studio-orig-style") || "";
          target.style.cssText = (orig ? orig + "; " : "") + HOVER_OUTLINE_STYLE;
        }

        const id = target.getAttribute("data-surface-target");
        if (isTargetId(id)) {
          postToParent({
            type: "GZA_STUDIO_TARGET_HOVERED",
            version: STUDIO_PROTOCOL_VERSION,
            targetId: id,
          });
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = (e.relatedTarget as HTMLElement)?.closest<HTMLElement>("[data-surface-target]");
      if (!related && hoveredElRef.current) {
        if (hoveredElRef.current !== selectedElRef.current) {
          hoveredElRef.current.style.cssText = hoveredElRef.current.getAttribute("data-studio-orig-style") || "";
        }
        hoveredElRef.current = null;
        postToParent({
          type: "GZA_STUDIO_TARGET_HOVERED",
          version: STUDIO_PROTOCOL_VERSION,
          targetId: null,
        });
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLElement>("[data-surface-target]");
      if (target) {
        e.preventDefault();
        e.stopPropagation();

        const id = target.getAttribute("data-surface-target");
        if (isTargetId(id)) {
          setSelectedTarget(id);
          postToParent({
            type: "GZA_STUDIO_TARGET_SELECTED",
            version: STUDIO_PROTOCOL_VERSION,
            targetId: id,
          });
        }
      }
    };

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        const target = (e.target as HTMLElement)?.closest<HTMLElement>("[data-surface-target]");
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          const id = target.getAttribute("data-surface-target");
          if (isTargetId(id)) {
            setSelectedTarget(id);
            postToParent({
              type: "GZA_STUDIO_TARGET_SELECTED",
              version: STUDIO_PROTOCOL_VERSION,
              targetId: id,
            });
          }
        }
      }
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClickCapture, true);
    document.addEventListener("keydown", handleKeyDownCapture, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, [isStudio, inspectMode, postToParent]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update Selected Element Outline
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudio) return;

    if (selectedElRef.current) {
      selectedElRef.current.style.cssText = selectedElRef.current.getAttribute("data-studio-orig-style") || "";
      selectedElRef.current = null;
    }

    if (selectedTarget) {
      const el = document.querySelector<HTMLElement>(`[data-surface-target="${selectedTarget}"]`);
      if (el) {
        if (!el.hasAttribute("data-studio-orig-style")) {
          el.setAttribute("data-studio-orig-style", el.getAttribute("style") || "");
        }
        const orig = el.getAttribute("data-studio-orig-style") || "";
        el.style.cssText = (orig ? orig + "; " : "") + SELECTED_OUTLINE_STYLE;
        selectedElRef.current = el;
      }
    }
  }, [isStudio, selectedTarget]);

  return null;
}
