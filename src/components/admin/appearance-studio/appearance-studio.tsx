/**
 * Gaza Gateway — Appearance Studio Workspace
 *
 * Full-featured responsive editor + persistent real-route preview workspace.
 * Features:
 * - Wide screens: ~420px sticky inspector + remaining sticky preview pane.
 * - Medium & small screens: cleanly adapted tabs to avoid crushing controls or preview.
 * - Real same-origin iframe with true CSS media-query viewport widths (1440, 1280, 768, 390, 320, fill).
 * - Fit vs 100% scale mode.
 * - Inspect vs Browse modes with hover highlighting and click selection.
 * - Draft vs Baseline comparison on identical scenarios and viewports.
 * - Parent<->iframe typed postMessage synchronization.
 * - Retains Design System Specimens as a dedicated sub-view.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Columns2,
  ExternalLink,
  Eye,
  FlaskConical,
  Layers,
  LayoutGrid,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  clearDomSkinOverrides,
  clearPreviewSkin,
  DEFAULT_SITE_SKIN,
  readPreviewSkin,
  writePreviewSkin,
  type SiteSkinConfig,
} from "@/lib/skin";
import { applySkinToDom } from "@/lib/skin-preview";
import {
  ALL_TARGET_IDS,
  DEFAULT_SURFACE_RECIPES,
  isTargetId,
  type TargetId,
  type SurfaceFamilyId,
} from "@/design/surfaces";
import { getTargetMeta } from "@/design/surfaces/targets";
import {
  isValidStudioOrigin,
  parseFrameMessage,
  STUDIO_PROTOCOL_VERSION,
  type ParentToFrameMessage,
} from "@/lib/studio-protocol";
import {
  findScenarioForPath,
  getScenarioById,
  getScenariosForPage,
  STUDIO_SCENARIOS,
  type StudioPageId,
  type StudioScenario,
} from "@/lib/studio-scenarios";
import {
  StudioToolbar,
  VIEWPORT_WIDTHS,
  type ViewportPreset,
} from "./studio-toolbar";
import { StudioInspector } from "./studio-inspector";
import { StudioSpecimensTab } from "./studio-specimens-tab";

export function AppearanceStudio() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";

  // Top-level View Mode: Studio Workspace vs Design System Specimens
  const [activeView, setActiveView] = useState<"studio" | "specimens">("studio");

  // Mobile Workspace View: Inspector vs Preview tab
  const [mobileTab, setMobileTab] = useState<"inspector" | "preview">("preview");

  // Skin & Surface Grammar Configuration
  const [skin, setSkin] = useState<SiteSkinConfig>(() => readPreviewSkin());

  // Target Selection & Inspect State
  const [selectedTargetId, setSelectedTargetId] = useState<TargetId>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const scId = params.get("scenario");
      if (scId) {
        const sc = getScenarioById(scId);
        if (sc && sc.associatedTargetIds && sc.associatedTargetIds.length > 0) {
          const first = sc.associatedTargetIds[0];
          if (first && isTargetId(first)) return first;
        }
      }
    }
    return "canvas.public";
  });
  const [hoveredTargetId, setHoveredTargetId] = useState<TargetId | null>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [baselineMode, setBaselineMode] = useState(false);

  // Viewport and Scale Configuration
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [fitScale, setFitScale] = useState(true);
  const [containerWidth, setContainerWidth] = useState(1280);

  // Route, Scenario, and Independent Preview Locale
  const [previewLocale, setPreviewLocale] = useState<"en" | "ar">("en");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sc = params.get("scenario");
      if (sc && getScenarioById(sc)) return sc;
    }
    return "home.default";
  });
  const [selectedPage, setSelectedPage] = useState<StudioPageId>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sc = params.get("scenario");
      const found = sc ? getScenarioById(sc) : null;
      if (found) return found.pageId;
    }
    return "home";
  });

  const handleScenarioChange = useCallback((scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    const sc = getScenarioById(scenarioId);
    if (sc && sc.associatedTargetIds && sc.associatedTargetIds.length > 0) {
      const first = sc.associatedTargetIds[0];
      if (first && isTargetId(first)) {
        setSelectedTargetId(first);
      }
    }
  }, []);

  // Iframe Reference and Communication
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Measure container width for Fit scaling
  useEffect(() => {
    if (!previewContainerRef.current) return;
    const updateWidth = () => {
      if (previewContainerRef.current) {
        setContainerWidth(previewContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(previewContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Post typed message to iframe
  const postToFrame = useCallback((msg: ParentToFrameMessage) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(msg, window.location.origin);
    } catch {
      /* frame detached or cross-origin */
    }
  }, []);

  // Compute active iframe path (stable across baseline/inspect mode toggles)
  const currentScenario = getScenarioById(selectedScenarioId) ?? (STUDIO_SCENARIOS[0] as StudioScenario);
  const basePath = previewLocale === "ar" ? currentScenario.pathAr : currentScenario.pathEn;
  const iframeSrc = basePath;

  // ───────────────────────────────────────────────────────────────────────────
  // Handle Parent <-> Frame Message Protocol
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isValidStudioOrigin(event)) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      const parsed = parseFrameMessage(event.data);
      if (!parsed) return;

      switch (parsed.type) {
        case "GZA_STUDIO_FRAME_READY": {
          setIframeLoaded(true);
          // Send handshake back to frame
          postToFrame({
            type: "GZA_STUDIO_PARENT_INIT",
            version: STUDIO_PROTOCOL_VERSION,
            config: skin,
            inspectMode,
            baselineMode,
            selectedTargetId,
          });
          break;
        }

        case "GZA_STUDIO_TARGET_HOVERED": {
          setHoveredTargetId(parsed.targetId);
          break;
        }

        case "GZA_STUDIO_TARGET_SELECTED": {
          setSelectedTargetId(parsed.targetId);
          // On mobile, auto-switch to inspector so user sees controls
          if (window.innerWidth < 1024) {
            setMobileTab("inspector");
          }
          break;
        }

        case "GZA_STUDIO_ROUTE_CHANGED": {
          // Detect matching scenario for internal link navigation
          const match = findScenarioForPath(parsed.path);
          if (match && match.id !== selectedScenarioId) {
            setSelectedScenarioId(match.id);
            setSelectedPage(match.pageId);
          }
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [skin, inspectMode, baselineMode, selectedTargetId, selectedScenarioId, postToFrame]);

  // ───────────────────────────────────────────────────────────────────────────
  // Update Skin and Sync to Iframe
  // ───────────────────────────────────────────────────────────────────────────
  const handleUpdateSkin = useCallback(
    (updater: (prev: SiteSkinConfig) => SiteSkinConfig) => {
      setSkin((prev) => {
        const next = updater(prev);
        writePreviewSkin(next);
        postToFrame({
          type: "GZA_STUDIO_CONFIG_SYNC",
          version: STUDIO_PROTOCOL_VERSION,
          config: next,
        });
        return next;
      });
    },
    [postToFrame],
  );

  // Reset single target
  const handleResetTarget = useCallback(
    (targetId: TargetId) => {
      const meta = getTargetMeta(targetId);

      if (meta.kind === "canvas") {
        handleUpdateSkin((prev) => {
          if (targetId === "canvas.public") {
            return { ...prev, publicCanvas: { ...DEFAULT_SITE_SKIN.publicCanvas } };
          }
          if (targetId === "canvas.sand") {
            return { ...prev, sandSection: { ...DEFAULT_SITE_SKIN.sandSection } };
          }
          return prev;
        });
        return;
      }

      if (meta.kind === "family" && meta.familyId) {
        const famId: SurfaceFamilyId = meta.familyId;
        handleUpdateSkin((prev) => {
          const prevGrammar = prev.surfaceGrammar ?? {
            enabled: true,
            families: DEFAULT_SURFACE_RECIPES,
            targetOverrides: {},
          };
          return {
            ...prev,
            surfaceGrammar: {
              ...prevGrammar,
              families: {
                ...prevGrammar.families,
                [famId]: { ...DEFAULT_SURFACE_RECIPES[famId] },
              },
            },
          };
        });
        return;
      }

      // Reset component override
      handleUpdateSkin((prev) => {
        const prevGrammar = prev.surfaceGrammar ?? {
          enabled: true,
          families: DEFAULT_SURFACE_RECIPES,
          targetOverrides: {},
        };
        const prevOverrides = { ...(prevGrammar.targetOverrides ?? {}) };
        delete prevOverrides[targetId];
        return {
          ...prev,
          surfaceGrammar: {
            ...prevGrammar,
            targetOverrides: prevOverrides,
          },
        };
      });
    },
    [handleUpdateSkin],
  );

  // Reset all to default
  const handleResetAll = useCallback(() => {
    clearPreviewSkin();
    const cleanSkin = { ...DEFAULT_SITE_SKIN };
    setSkin(cleanSkin);
    postToFrame({
      type: "GZA_STUDIO_CONFIG_SYNC",
      version: STUDIO_PROTOCOL_VERSION,
      config: cleanSkin,
    });
  }, [postToFrame]);

  // Handle target selection from inspector
  const handleSelectTarget = useCallback(
    (targetId: TargetId) => {
      setSelectedTargetId(targetId);
      postToFrame({
        type: "GZA_STUDIO_SELECT_TARGET_CMD",
        version: STUDIO_PROTOCOL_VERSION,
        targetId,
        scrollIntoView: true,
      });

      // Suggest switching route if target belongs to a different route
      const meta = getTargetMeta(targetId);
      if (meta.scenarioId && meta.scenarioId !== selectedScenarioId) {
        const targetScenario = getScenarioById(meta.scenarioId);
        if (targetScenario) {
          setSelectedScenarioId(targetScenario.id);
          setSelectedPage(targetScenario.pageId);
        }
      }
    },
    [selectedScenarioId, postToFrame],
  );

  // Toggle Inspect Mode
  const handleToggleInspectMode = useCallback(() => {
    setInspectMode((prev) => {
      const next = !prev;
      postToFrame({
        type: "GZA_STUDIO_INSPECT_MODE",
        version: STUDIO_PROTOCOL_VERSION,
        inspectMode: next,
        baselineMode,
      });
      return next;
    });
  }, [baselineMode, postToFrame]);

  // Toggle Baseline Comparison Mode
  const handleToggleBaselineMode = useCallback(() => {
    setBaselineMode((prev) => {
      const next = !prev;
      postToFrame({
        type: "GZA_STUDIO_INSPECT_MODE",
        version: STUDIO_PROTOCOL_VERSION,
        inspectMode,
        baselineMode: next,
      });
      if (!next) {
        postToFrame({
          type: "GZA_STUDIO_CONFIG_SYNC",
          version: STUDIO_PROTOCOL_VERSION,
          config: skin,
        });
      }
      return next;
    });
  }, [inspectMode, skin, postToFrame]);

  // Handle Page Change
  const handlePageChange = useCallback((page: StudioPageId) => {
    setSelectedPage(page);
    const scenarios = getScenariosForPage(page);
    const firstScenario = scenarios[0];
    if (firstScenario) {
      setSelectedScenarioId(firstScenario.id);
    }
  }, []);

  // Reload iframe
  const handleReload = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  }, [iframeSrc]);

  // Calculate true iframe dimensions and scale factor
  const targetWidth = VIEWPORT_WIDTHS[viewport];
  const isFixedViewport = targetWidth !== null;
  const effectiveWidth = isFixedViewport ? targetWidth : containerWidth;

  const scale =
    fitScale && isFixedViewport && containerWidth > 0 && containerWidth < targetWidth
      ? Math.max(0.25, Math.min(1, containerWidth / targetWidth))
      : 1;

  const iframeHeight = 880;

  return (
    <div className="space-y-4">
      {/* Top Header & Secondary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">
            {isAr ? "استوديو المظهر التفاعلي" : "Appearance Studio"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Secondary Design QA / Specimens Affordance */}
          <button
            type="button"
            onClick={() => setActiveView(activeView === "studio" ? "specimens" : "studio")}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
              activeView === "specimens"
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <FlaskConical className="size-3.5" />
            <span>
              {activeView === "specimens"
                ? isAr
                  ? "العودة للاستوديو"
                  : "Back to Studio"
                : isAr
                  ? "فحص النماذج (Design QA)"
                  : "Design QA (Specimens)"}
            </span>
          </button>

          {/* Mobile View Toggle Switcher (< lg) */}
          {activeView === "studio" ? (
            <div className="flex lg:hidden items-center rounded-md border border-input bg-secondary/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMobileTab("inspector")}
              className={cn(
                "rounded px-3 py-1 font-semibold transition-colors",
                mobileTab === "inspector"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isAr ? "المفتش والخصائص" : "Inspector"}
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              className={cn(
                "rounded px-3 py-1 font-semibold transition-colors",
                mobileTab === "preview"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isAr ? "المعاينة الحية" : "Live Preview"}
            </button>
          </div>
        ) : null}
      </div>
    </div>

      {/* VIEW 1: APPEARANCE STUDIO (Main Layout) */}
      {activeView === "studio" ? (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Left Pane: Inspector (~420px sticky) */}
          <aside
            className={cn(
              "w-full lg:w-[420px] lg:shrink-0 lg:sticky lg:top-4",
              mobileTab === "preview" && "hidden lg:block",
            )}
          >
            <StudioInspector
              skin={skin}
              selectedTargetId={selectedTargetId}
              onSelectTarget={handleSelectTarget}
              onUpdateSkin={handleUpdateSkin}
              onResetTarget={handleResetTarget}
              onResetAll={handleResetAll}
            />
          </aside>

          {/* Right Pane: Persistent Real-Route Iframe Preview */}
          <main
            ref={previewContainerRef}
            className={cn(
              "flex-1 min-w-0 flex flex-col w-full",
              mobileTab === "inspector" && "hidden lg:flex",
            )}
          >
            {/* Studio Toolbar */}
            <StudioToolbar
              page={selectedPage}
              onPageChange={handlePageChange}
              scenarioId={selectedScenarioId}
              onScenarioChange={handleScenarioChange}
              locale={previewLocale}
              onLocaleChange={setPreviewLocale}
              viewport={viewport}
              onViewportChange={setViewport}
              fitScale={fitScale}
              onToggleFitScale={() => setFitScale((prev) => !prev)}
              inspectMode={inspectMode}
              onToggleInspectMode={handleToggleInspectMode}
              baselineMode={baselineMode}
              onToggleBaselineMode={handleToggleBaselineMode}
              hoveredTargetId={hoveredTargetId}
              onReload={handleReload}
              previewUrl={iframeSrc}
            />

            {/* Iframe Viewport Container */}
            <div
              className={cn(
                "relative w-full rounded-b-xl border border-t-0 border-border bg-muted/40 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-start",
                !fitScale && "overflow-x-auto",
              )}
              style={{
                minHeight: "720px",
                height: isFixedViewport && scale < 1 ? `${iframeHeight * scale + 48}px` : "auto",
              }}
            >
              {/* Scaled/Fit Frame Wrapper */}
              <div
                style={{
                  width: isFixedViewport ? `${targetWidth}px` : "100%",
                  transform: scale < 1 ? `scale(${scale})` : undefined,
                  transformOrigin: "top center",
                }}
                className="transition-transform duration-150"
              >
                <div className="relative rounded-lg border border-border/80 bg-background shadow-lg overflow-hidden">
                  <iframe
                    ref={iframeRef}
                    key={iframeSrc}
                    src={iframeSrc}
                    title="Appearance Studio Real-Route Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    className="w-full bg-background"
                    style={{
                      height: `${iframeHeight}px`,
                      width: isFixedViewport ? `${targetWidth}px` : "100%",
                    }}
                    onLoad={() => {
                      setIframeLoaded(true);
                      postToFrame({
                        type: "GZA_STUDIO_PARENT_INIT",
                        version: STUDIO_PROTOCOL_VERSION,
                        config: skin,
                        inspectMode,
                        baselineMode,
                        selectedTargetId,
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
      ) : null}

      {/* VIEW 2: DESIGN SYSTEM SPECIMENS (Retained Live Comparison Archetypes) */}
      {activeView === "specimens" ? (
        <StudioSpecimensTab grammarConfig={skin.surfaceGrammar ?? { enabled: true, families: DEFAULT_SURFACE_RECIPES }} />
      ) : null}
    </div>
  );
}
