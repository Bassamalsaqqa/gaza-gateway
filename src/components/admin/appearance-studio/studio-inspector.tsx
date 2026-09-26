/**
 * Gaza Gateway — Appearance Studio Inspector
 *
 * Responsive parameter inspector for Appearance Studio.
 * Allows editing semantic variables for canvases, six surface families,
 * and individual component overrides.
 *
 * Features:
 * - Direct object editing with breadcrumb navigation and component inheritance display.
 * - Secondary "Advanced: Target Navigator" for jumping between targets by technical ID.
 * - Family inheritance vs Component override clear status:
 *   "Use family settings", "Customize this component", "Reset to family".
 * - Fully accessible Radix RadioGroup for Frame, Tone, Accent, Radius, Elevation,
 *   Motif, Placement, Intensity, Scale, Media treatment, and Overlay.
 * - Versioned "Export appearance configuration" (gza.appearance.v1) action (download + copy).
 * - Zero competing grammar-off checkbox in primary authoring (delegated cleanly to Draft/Baseline preview mode).
 */

import { useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Sliders,
  Sparkles,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  IntensityLevel,
  PatternId,
  ScaleLevel,
} from "@/design/patterns/pattern-types";
import { canonicalPatternId } from "@/design/patterns/pattern-types";
import {
  PUBLIC_CANDIDATE_PATTERNS,
  SAND_CANDIDATE_PATTERNS,
} from "@/design/patterns/pattern-meta";
import {
  CANVAS_TARGET_IDS,
  FAMILY_TARGET_IDS,
  COMPONENT_TARGET_IDS,
  getTargetMeta,
  getTargetFamily,
  resolveTargetRecipe,
  type TargetId,
  type AllowedControls,
  type TargetMeta,
} from "@/design/surfaces/targets";
import {
  FAMILY_ALLOWLISTS,
} from "@/design/surfaces/allowlists";
import { DEFAULT_SURFACE_RECIPES } from "@/design/surfaces/presets";
import type {
  PatternPlacement,
  SurfaceAccent,
  SurfaceElevation,
  SurfaceFamilyId,
  SurfaceFrame,
  SurfaceRadius,
  SurfaceRecipe,
  SurfaceTone,
} from "@/design/surfaces/types";
import {
  DEFAULT_SITE_SKIN,
  sanitizeSiteSkinConfig,
  type SiteSkinConfig,
  type SurfaceSkinConfig,
} from "@/lib/skin";
import { StudioMediaPanel } from "./studio-media-panel";

export interface StudioInspectorProps {
  skin: SiteSkinConfig;
  selectedTargetId: TargetId;
  onSelectTarget: (id: TargetId) => void;
  onUpdateSkin: (updater: (prev: SiteSkinConfig) => SiteSkinConfig) => void;
  onResetTarget: (id: TargetId) => void;
  onResetAll: () => void;
}

const INTENSITIES: readonly IntensityLevel[] = [
  "off",
  "very-subtle",
  "subtle",
  "present",
];

const SCALES: readonly ScaleLevel[] = ["small", "standard", "large"];

export interface AppearanceExportV1 {
  version: "gza.appearance.v1";
  exportedAt: string;
  skin: SiteSkinConfig;
}

export function StudioInspector({
  skin,
  selectedTargetId,
  onSelectTarget,
  onUpdateSkin,
  onResetTarget,
  onResetAll,
}: StudioInspectorProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const [activeTab, setActiveTab] = useState<"surfaces" | "media">("surfaces");
  const [showTargetNavigator, setShowTargetNavigator] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const meta = getTargetMeta(selectedTargetId);
  const grammarConfig = skin.surfaceGrammar ?? {
    enabled: true,
    families: DEFAULT_SURFACE_RECIPES,
    targetOverrides: {},
  };

  const isCanvasTarget = meta.kind === "canvas";
  const familyId = meta.familyId ?? "operational";
  const familyMeta = getTargetMeta(`family.${familyId}` as TargetId);
  const allowlist = FAMILY_ALLOWLISTS[familyId];

  // Component inheritance check
  const isComponent = meta.kind === "component";
  const componentOverride = grammarConfig.targetOverrides?.[selectedTargetId];
  const isCustomized = Boolean(
    isComponent && componentOverride !== undefined,
  );

  // Resolve active recipe for selected target
  const currentRecipe: SurfaceRecipe = isCanvasTarget
    ? DEFAULT_SURFACE_RECIPES.operational
    : resolveTargetRecipe(selectedTargetId, grammarConfig);

  // Update canvas config
  const handleUpdateCanvas = (changes: Partial<SurfaceSkinConfig>) => {
    onUpdateSkin((prev) => {
      if (selectedTargetId === "canvas.public") {
        return { ...prev, publicCanvas: { ...prev.publicCanvas, ...changes } };
      }
      if (selectedTargetId === "canvas.sand") {
        return { ...prev, sandSection: { ...prev.sandSection, ...changes } };
      }
      return prev;
    });
  };

  // Update recipe for family or component target
  const handleUpdateRecipe = (patch: Partial<SurfaceRecipe>) => {
    onUpdateSkin((prev) => {
      const prevGrammar = prev.surfaceGrammar ?? {
        enabled: true,
        families: DEFAULT_SURFACE_RECIPES,
        targetOverrides: {},
      };

      if (meta.kind === "family") {
        // Direct family recipe update
        const updatedFamilyRecipe = {
          ...(prevGrammar.families[familyId] ?? DEFAULT_SURFACE_RECIPES[familyId]),
          ...patch,
        };
        return {
          ...prev,
          surfaceGrammar: {
            ...prevGrammar,
            families: {
              ...prevGrammar.families,
              [familyId]: updatedFamilyRecipe,
            },
          },
        };
      }

      // Component target override update
      const prevOverrides = prevGrammar.targetOverrides ?? {};
      const currentOverride = prevOverrides[selectedTargetId] ?? {};
      const updatedOverride = { ...currentOverride, ...patch };

      return {
        ...prev,
        surfaceGrammar: {
          ...prevGrammar,
          targetOverrides: {
            ...prevOverrides,
            [selectedTargetId]: updatedOverride,
          },
        },
      };
    });
  };

  // Customize this component (starts an explicit override initialized with an empty delta)
  const handleCustomizeComponent = () => {
    onUpdateSkin((prev) => {
      const prevGrammar = prev.surfaceGrammar ?? {
        enabled: true,
        families: DEFAULT_SURFACE_RECIPES,
        targetOverrides: {},
      };
      const prevOverrides = prevGrammar.targetOverrides ?? {};
      return {
        ...prev,
        surfaceGrammar: {
          ...prevGrammar,
          targetOverrides: {
            ...prevOverrides,
            [selectedTargetId]: {},
          },
        },
      };
    });
  };

  // Reset component to family settings (removes override from config)
  const handleResetToFamily = () => {
    onUpdateSkin((prev) => {
      const prevGrammar = prev.surfaceGrammar ?? {
        enabled: true,
        families: DEFAULT_SURFACE_RECIPES,
        targetOverrides: {},
      };
      const nextOverrides = { ...(prevGrammar.targetOverrides ?? {}) };
      delete nextOverrides[selectedTargetId];
      return {
        ...prev,
        surfaceGrammar: {
          ...prevGrammar,
          targetOverrides: nextOverrides,
        },
      };
    });
  };

  // Export Appearance Configuration (gza.appearance.v1)
  const handleExportConfig = () => {
    const cleanSkin = sanitizeSiteSkinConfig(skin);
    const exportData: AppearanceExportV1 = {
      version: "gza.appearance.v1",
      exportedAt: new Date().toISOString(),
      skin: cleanSkin,
    };
    const jsonStr = JSON.stringify(exportData, null, 2);

    // Copy to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(jsonStr);
    }

    // Trigger download
    if (typeof document !== "undefined") {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gza-appearance-v1-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setExportFeedback(isAr ? "تم التصدير والنسخ" : "Exported & copied to clipboard");
    setTimeout(() => setExportFeedback(null), 3500);
  };

  // Canvas candidate patterns
  const canvasConfig =
    selectedTargetId === "canvas.sand"
      ? skin.sandSection
      : skin.publicCanvas;

  const canvasCandidates =
    selectedTargetId === "canvas.sand"
      ? SAND_CANDIDATE_PATTERNS
      : PUBLIC_CANDIDATE_PATTERNS;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
      {/* Target Header, Breadcrumbs & Inheritance Status */}
      <div className="space-y-2 border-b border-border/70 pb-3">
        {/* Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <span>{isAr ? "استوديو المظهر" : "Studio"}</span>
          <ChevronRight className="size-3 rtl:rotate-180" />
          <span>
            {meta.kind === "canvas"
              ? isAr
                ? "خلفيات الموقع"
                : "Canvases"
              : meta.kind === "family"
                ? isAr
                  ? "فئات الأسطح"
                  : "Families"
                : isAr
                  ? "عناصر الواجهة"
                  : "Components"}
          </span>
          <ChevronRight className="size-3 rtl:rotate-180" />
          <span className="font-bold text-foreground">
            {isAr ? meta.nameAr : meta.nameEn}
          </span>
        </div>

        {/* Target Title & Code Badge */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>{isAr ? meta.nameAr : meta.nameEn}</span>
              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {selectedTargetId}
              </span>
            </h3>
          </div>

          {/* Quick Target Reset */}
          <button
            type="button"
            onClick={() => onResetTarget(selectedTargetId)}
            title={isAr ? "إعادة ضبط هذا العنصر فقط" : "Reset target to defaults"}
            className="flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            <span className="hidden sm:inline">{isAr ? "ضبط" : "Reset"}</span>
          </button>
        </div>

        {/* Component Inheritance vs Customized Component State */}
        {isComponent ? (
          <div className="rounded-lg border border-border/80 bg-secondary/30 p-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  isCustomized ? "bg-amber-600 dark:bg-amber-400" : "bg-primary",
                )}
              />
              <span className="font-medium">
                {isCustomized
                  ? isAr
                    ? "تخصيص مستقل لهذا العنصر (Override)"
                    : "Customized component override"
                  : isAr
                    ? `موروث من ${familyMeta.nameAr}`
                    : `Inheriting from ${familyMeta.nameEn}`}
              </span>
            </div>

            {isCustomized ? (
              <button
                type="button"
                onClick={handleResetToFamily}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-secondary"
              >
                {isAr ? "العودة لإعدادات الفئة" : "Use family settings"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCustomizeComponent}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                {isAr ? "تخصيص هذا العنصر" : "Customize this component"}
              </button>
            )}
          </div>
        ) : null}

        {/* Secondary Control: Advanced Target Navigator Collapsible */}
        <div className="rounded-md border border-border/60 bg-background/50">
          <button
            type="button"
            onClick={() => setShowTargetNavigator((prev) => !prev)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showTargetNavigator}
          >
            <span className="flex items-center gap-1.5">
              <Sliders className="size-3" />
              <span>{isAr ? "متقدم: دليل العناصر (Target Navigator)" : "Advanced: Target Navigator"}</span>
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200",
                showTargetNavigator && "rotate-180",
              )}
            />
          </button>

          {showTargetNavigator ? (
            <div className="p-2 border-t border-border/60 space-y-2">
              <label htmlFor="studio-target-select" className="sr-only">
                {isAr ? "اختر العنصر المستهدف" : "Select target surface"}
              </label>
              <select
                id="studio-target-select"
                value={selectedTargetId}
                onChange={(e) => onSelectTarget(e.target.value as TargetId)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-primary"
              >
                <optgroup label={isAr ? "خلفيات الموقع العامة" : "Global Canvases"}>
                  {CANVAS_TARGET_IDS.map((id) => (
                    <option key={id} value={id}>
                      {isAr ? getTargetMeta(id).nameAr : getTargetMeta(id).nameEn}
                    </option>
                  ))}
                </optgroup>

                <optgroup label={isAr ? "فئات الأسطح الستة" : "Surface Families"}>
                  {FAMILY_TARGET_IDS.map((id) => (
                    <option key={id} value={id}>
                      {isAr ? getTargetMeta(id).nameAr : getTargetMeta(id).nameEn}
                    </option>
                  ))}
                </optgroup>

                <optgroup label={isAr ? "عناصر الشاشات التفاعلية" : "Configurable Components"}>
                  {COMPONENT_TARGET_IDS.map((id) => (
                    <option key={id} value={id}>
                      {isAr ? getTargetMeta(id).nameAr : getTargetMeta(id).nameEn}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {isAr ? meta.descriptionAr : meta.descriptionEn}
        </p>
      </div>

      {/* Sub-tabs: Surfaces vs Media (only when media is allowed) */}
      {meta.mediaAllowed ? (
        <div className="flex border-b border-border/80">
          <button
            type="button"
            data-testid="inspector-tab-surfaces"
            onClick={() => setActiveTab("surfaces")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-semibold transition-colors",
              activeTab === "surfaces"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="size-3.5" />
            <span>{isAr ? "الخصائص والأسطح" : "Surface Grammar"}</span>
          </button>

          <button
            type="button"
            data-testid="inspector-tab-media"
            onClick={() => setActiveTab("media")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-semibold transition-colors",
              activeTab === "media"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <ImageIcon className="size-3.5" />
            <span>{isAr ? "الوسائط والصور" : "Media & Artwork"}</span>
          </button>
        </div>
      ) : null}

      {/* MEDIA TAB CONTENT */}
      {meta.mediaAllowed && activeTab === "media" ? (
        <StudioMediaPanel
          targetId={selectedTargetId}
          recipe={currentRecipe}
          onChange={handleUpdateRecipe}
          onReset={() => handleUpdateRecipe({ mediaTreatment: undefined })}
        />
      ) : isCanvasTarget ? (
        /* CANVAS CONTROLS */
        <div className="space-y-4">
          {/* Pattern Selection */}
          <div className="space-y-1.5">
            <span id="canvas-pattern-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              {isAr ? "النقش الهندسي" : "Pattern Motif"}
            </span>
            <RadioGroupPrimitive.Root
              value={canvasConfig.pattern}
              onValueChange={(val) => handleUpdateCanvas({ pattern: val as PatternId })}
              dir={isAr ? "rtl" : "ltr"}
              aria-labelledby="canvas-pattern-label"
              className="grid grid-cols-2 gap-1.5"
            >
              {canvasCandidates.map((pid) => (
                <RadioGroupPrimitive.Item
                  key={pid}
                  value={pid}
                  className={cn(
                    "flex items-center justify-between rounded-md border p-2 text-xs font-medium capitalize transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-primary",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold data-[state=checked]:shadow-xs",
                    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                  )}
                >
                  <span>{pid.replace("-", " ")}</span>
                  <RadioGroupPrimitive.Indicator asChild>
                    <span className="size-1.5 rounded-full bg-primary-foreground" />
                  </RadioGroupPrimitive.Indicator>
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>
          </div>

          {/* Intensity Selection */}
          <div className="space-y-1.5">
            <span id="canvas-intensity-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              {isAr ? "كثافة النقش (Intensity)" : "Pattern Intensity"}
            </span>
            <RadioGroupPrimitive.Root
              value={canvasConfig.intensity}
              onValueChange={(val) => handleUpdateCanvas({ intensity: val as IntensityLevel })}
              dir={isAr ? "rtl" : "ltr"}
              aria-labelledby="canvas-intensity-label"
              className="grid grid-cols-4 gap-1"
            >
              {INTENSITIES.map((lvl) => (
                <RadioGroupPrimitive.Item
                  key={lvl}
                  value={lvl}
                  className={cn(
                    "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors text-center cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-primary",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                  )}
                >
                  {lvl.replace("-", " ")}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>
          </div>

          {/* Scale Selection */}
          <div className="space-y-1.5">
            <span id="canvas-scale-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              {isAr ? "مقياس النقش (Scale)" : "Pattern Scale"}
            </span>
            <RadioGroupPrimitive.Root
              value={canvasConfig.scale}
              onValueChange={(val) => handleUpdateCanvas({ scale: val as ScaleLevel })}
              dir={isAr ? "rtl" : "ltr"}
              aria-labelledby="canvas-scale-label"
              className="grid grid-cols-3 gap-1"
            >
              {SCALES.map((scale) => (
                <RadioGroupPrimitive.Item
                  key={scale}
                  value={scale}
                  className={cn(
                    "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors text-center cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-primary",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                  )}
                >
                  {scale}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>
          </div>
        </div>
      ) : (
        /* FAMILY & COMPONENT SURFACE GRAMMAR CONTROLS */
        <div className="space-y-4">
          {/* Structural Frame */}
          {meta.allowedControls.frame ? (
            <div className="space-y-1.5">
              <span id="surface-frame-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "إطار الهيكل (Frame)" : "Structural Frame"}
              </span>
              <RadioGroupPrimitive.Root
                value={currentRecipe.frame}
                onValueChange={(val) => handleUpdateRecipe({ frame: val as SurfaceFrame })}
                dir={isAr ? "rtl" : "ltr"}
                aria-labelledby="surface-frame-label"
                className="flex flex-wrap gap-1"
              >
                {allowlist.frames.map((frame) => (
                  <RadioGroupPrimitive.Item
                    key={frame}
                    value={frame}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                      "focus-visible:outline-2 focus-visible:outline-primary",
                      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                      "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                    )}
                  >
                    {frame}
                  </RadioGroupPrimitive.Item>
                ))}
              </RadioGroupPrimitive.Root>
            </div>
          ) : null}

          {/* Material Tone */}
          {meta.allowedControls.tone ? (
            <div className="space-y-1.5">
              <span id="surface-tone-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "لون المادة (Tone)" : "Material Tone (100% Opaque)"}
              </span>
              <RadioGroupPrimitive.Root
                value={currentRecipe.tone}
                onValueChange={(val) => handleUpdateRecipe({ tone: val as SurfaceTone })}
                dir={isAr ? "rtl" : "ltr"}
                aria-labelledby="surface-tone-label"
                className="flex flex-wrap gap-1"
              >
                {allowlist.tones.map((tone) => (
                  <RadioGroupPrimitive.Item
                    key={tone}
                    value={tone}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                      "focus-visible:outline-2 focus-visible:outline-primary",
                      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                      "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                    )}
                  >
                    {tone}
                  </RadioGroupPrimitive.Item>
                ))}
              </RadioGroupPrimitive.Root>
            </div>
          ) : null}

          {/* Accent Token */}
          {meta.allowedControls.accent ? (
            <div className="space-y-1.5">
              <span id="surface-accent-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "شريط التمييز (Accent)" : "Accent Token"}
              </span>
              <RadioGroupPrimitive.Root
                value={currentRecipe.accent}
                onValueChange={(val) => handleUpdateRecipe({ accent: val as SurfaceAccent })}
                dir={isAr ? "rtl" : "ltr"}
                aria-labelledby="surface-accent-label"
                className="flex flex-wrap gap-1"
              >
                {allowlist.accents.map((accent) => (
                  <RadioGroupPrimitive.Item
                    key={accent}
                    value={accent}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                      "focus-visible:outline-2 focus-visible:outline-primary",
                      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                      "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                    )}
                  >
                    {accent}
                  </RadioGroupPrimitive.Item>
                ))}
              </RadioGroupPrimitive.Root>
            </div>
          ) : null}

          {/* Corner Radius & Elevation Row */}
          <div className="grid grid-cols-2 gap-3">
            {meta.allowedControls.radius ? (
              <div className="space-y-1.5">
                <span id="surface-radius-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  {isAr ? "استدارة الحواف" : "Corner Radius"}
                </span>
                <RadioGroupPrimitive.Root
                  value={currentRecipe.radius}
                  onValueChange={(val) => handleUpdateRecipe({ radius: val as SurfaceRadius })}
                  dir={isAr ? "rtl" : "ltr"}
                  aria-labelledby="surface-radius-label"
                  className="flex flex-wrap gap-1"
                >
                  {allowlist.radii.map((radius) => (
                    <RadioGroupPrimitive.Item
                      key={radius}
                      value={radius}
                      className={cn(
                        "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                        "focus-visible:outline-2 focus-visible:outline-primary",
                        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                        "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                      )}
                    >
                      {radius}
                    </RadioGroupPrimitive.Item>
                  ))}
                </RadioGroupPrimitive.Root>
              </div>
            ) : null}

            {meta.allowedControls.elevation ? (
              <div className="space-y-1.5">
                <span id="surface-elevation-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  {isAr ? "الظل والبروز" : "Elevation"}
                </span>
                <RadioGroupPrimitive.Root
                  value={currentRecipe.elevation}
                  onValueChange={(val) => handleUpdateRecipe({ elevation: val as SurfaceElevation })}
                  dir={isAr ? "rtl" : "ltr"}
                  aria-labelledby="surface-elevation-label"
                  className="flex flex-wrap gap-1"
                >
                  {allowlist.elevations.map((elevation) => (
                    <RadioGroupPrimitive.Item
                      key={elevation}
                      value={elevation}
                      className={cn(
                        "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                        "focus-visible:outline-2 focus-visible:outline-primary",
                        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                        "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                      )}
                    >
                      {elevation}
                    </RadioGroupPrimitive.Item>
                  ))}
                </RadioGroupPrimitive.Root>
              </div>
            ) : null}
          </div>

          {/* Pattern Motif & Placement Controls */}
          {meta.allowedControls.pattern ? (
            <div className="space-y-3 rounded-lg border border-border/80 bg-secondary/20 p-3">
              <div className="space-y-1.5">
                <span id="surface-motif-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  {isAr ? "نقش الهوية (Gaza Motifs)" : "Surface Motif"}
                </span>
                <RadioGroupPrimitive.Root
                  value={currentRecipe.pattern}
                  onValueChange={(val) => handleUpdateRecipe({ pattern: val as PatternId })}
                  dir={isAr ? "rtl" : "ltr"}
                  aria-labelledby="surface-motif-label"
                  className="grid grid-cols-2 gap-1.5"
                >
                  {(["none", "gza-lattice", "runway-datum", "pie-factory"] as const).map((pid) => (
                    <RadioGroupPrimitive.Item
                      key={pid}
                      value={pid}
                      className={cn(
                        "flex items-center justify-between rounded-md border p-1.5 text-xs font-medium capitalize transition-colors cursor-pointer",
                        "focus-visible:outline-2 focus-visible:outline-primary",
                        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                        "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                      )}
                    >
                      <span>{pid.replace("-", " ")}</span>
                      <RadioGroupPrimitive.Indicator asChild>
                        <span className="size-1.5 rounded-full bg-primary-foreground" />
                      </RadioGroupPrimitive.Indicator>
                    </RadioGroupPrimitive.Item>
                  ))}
                </RadioGroupPrimitive.Root>
              </div>

              {currentRecipe.pattern !== "none" ? (
                <>
                  {/* Pattern Placement */}
                  <div className="space-y-1.5">
                    <span id="surface-placement-label" className="text-[11px] font-bold text-muted-foreground block">
                      {isAr ? "موضع النقش" : "Placement"}
                    </span>
                    <RadioGroupPrimitive.Root
                      value={currentRecipe.patternPlacement}
                      onValueChange={(val) => handleUpdateRecipe({ patternPlacement: val as PatternPlacement })}
                      dir={isAr ? "rtl" : "ltr"}
                      aria-labelledby="surface-placement-label"
                      className="flex flex-wrap gap-1"
                    >
                      {(["none", "rail", "header", "corner", "watermark"] as const)
                        .filter((p) => allowlist.patternPlacements.includes(p))
                        .map((placement) => (
                          <RadioGroupPrimitive.Item
                            key={placement}
                            value={placement}
                            className={cn(
                              "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer",
                              "focus-visible:outline-2 focus-visible:outline-primary",
                              "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                              "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                            )}
                          >
                            {placement}
                          </RadioGroupPrimitive.Item>
                        ))}
                    </RadioGroupPrimitive.Root>
                  </div>

                  {/* Pattern Intensity & Scale */}
                  <div className="space-y-2">
                    <div>
                      <span id="surface-intensity-label" className="text-[11px] font-bold text-muted-foreground block mb-1">
                        {isAr ? "الكثافة (Intensity)" : "Intensity"}
                      </span>
                      <RadioGroupPrimitive.Root
                        value={currentRecipe.patternIntensity ?? "subtle"}
                        onValueChange={(val) => handleUpdateRecipe({ patternIntensity: val as IntensityLevel })}
                        dir={isAr ? "rtl" : "ltr"}
                        aria-labelledby="surface-intensity-label"
                        className="grid grid-cols-4 gap-1"
                      >
                        {INTENSITIES.map((lvl) => (
                          <RadioGroupPrimitive.Item
                            key={lvl}
                            value={lvl}
                            className={cn(
                              "rounded border px-1.5 py-1 text-xs font-medium capitalize transition-colors text-center cursor-pointer",
                              "focus-visible:outline-2 focus-visible:outline-primary",
                              "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                              "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                            )}
                          >
                            {lvl.replace("-", " ")}
                          </RadioGroupPrimitive.Item>
                        ))}
                      </RadioGroupPrimitive.Root>
                    </div>

                    <div>
                      <span id="surface-scale-label" className="text-[11px] font-bold text-muted-foreground block mb-1">
                        {isAr ? "المقياس (Scale)" : "Scale"}
                      </span>
                      <RadioGroupPrimitive.Root
                        value={currentRecipe.patternScale ?? "standard"}
                        onValueChange={(val) => handleUpdateRecipe({ patternScale: val as ScaleLevel })}
                        dir={isAr ? "rtl" : "ltr"}
                        aria-labelledby="surface-scale-label"
                        className="grid grid-cols-3 gap-1"
                      >
                        {SCALES.map((s) => (
                          <RadioGroupPrimitive.Item
                            key={s}
                            value={s}
                            className={cn(
                              "rounded border px-1.5 py-1 text-xs font-medium capitalize transition-colors text-center cursor-pointer",
                              "focus-visible:outline-2 focus-visible:outline-primary",
                              "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                              "data-[state=unchecked]:border-border data-[state=unchecked]:bg-background data-[state=unchecked]:text-foreground data-[state=unchecked]:hover:bg-secondary/60",
                            )}
                          >
                            {s}
                          </RadioGroupPrimitive.Item>
                        ))}
                      </RadioGroupPrimitive.Root>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Footer Actions: Versioned Export and Reset All */}
      <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3 text-xs">
        {exportFeedback ? (
          <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
            <Check className="size-3.5" />
            <span>{exportFeedback}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="export-appearance-config-btn"
            onClick={handleExportConfig}
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Download className="size-3.5" />
            <span>{isAr ? "تصدير إعدادات المظهر" : "Export appearance configuration"}</span>
          </button>

          <button
            type="button"
            onClick={onResetAll}
            className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            <span>{isAr ? "إعادة ضبط الكل" : "Reset All"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
