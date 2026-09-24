/**
 * Gaza Gateway — Appearance Studio Inspector
 *
 * Inspector panel driving target selection, breadcrumbs, and governed controls:
 * - Frame, Tone, Accent, Radius, Elevation, Pattern, Placement, Intensity, Scale
 * - Enforces family allowlists, semantic tokens, and Radix/native keyboard accessibility.
 * - Supports targeted component overrides alongside family and canvas defaults.
 */

import { useState } from "react";
import {
  ChevronRight,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  SURFACE_ACCENTS,
  SURFACE_ELEVATIONS,
  SURFACE_FRAMES,
  SURFACE_RADII,
  SURFACE_TONES,
  type PatternPlacement,
  type SurfaceAccent,
  type SurfaceElevation,
  type SurfaceFamilyId,
  type SurfaceFrame,
  type SurfaceRadius,
  type SurfaceRecipe,
  type SurfaceTone,
  type SurfaceGrammarConfig,
} from "@/design/surfaces/types";
import { FAMILY_ALLOWLISTS } from "@/design/surfaces/allowlists";
import { DEFAULT_SURFACE_RECIPES } from "@/design/surfaces/presets";
import {
  CANVAS_TARGET_IDS,
  COMPONENT_TARGET_IDS,
  FAMILY_TARGET_IDS,
  getTargetMeta,
  resolveTargetRecipe,
  type TargetId,
} from "@/design/surfaces/targets";
import type {
  CanonicalPatternId,
  IntensityLevel,
  ScaleLevel,
} from "@/design/patterns/pattern-types";
import {
  PUBLIC_CANDIDATE_PATTERNS,
  SAND_CANDIDATE_PATTERNS,
  ADMIN_CANDIDATE_PATTERNS,
  type SiteSkinConfig,
  type SurfaceSkinConfig,
  DEFAULT_SITE_SKIN,
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

  const meta = getTargetMeta(selectedTargetId);
  const grammarConfig = skin.surfaceGrammar ?? {
    enabled: true,
    families: DEFAULT_SURFACE_RECIPES,
    targetOverrides: {},
  };

  const isCanvasTarget = meta.kind === "canvas";
  const familyId = meta.familyId ?? "operational";
  const allowlist = FAMILY_ALLOWLISTS[familyId];

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
      if (selectedTargetId === "canvas.admin") {
        return { ...prev, adminCanvas: { ...prev.adminCanvas, ...changes } };
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

  // Canvas candidate patterns
  const canvasConfig =
    selectedTargetId === "canvas.sand"
      ? skin.sandSection
      : selectedTargetId === "canvas.admin"
        ? skin.adminCanvas
        : skin.publicCanvas;

  const canvasCandidates =
    selectedTargetId === "canvas.sand"
      ? SAND_CANDIDATE_PATTERNS
      : selectedTargetId === "canvas.admin"
        ? ADMIN_CANDIDATE_PATTERNS
        : PUBLIC_CANDIDATE_PATTERNS;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
      {/* Target Selector Header & Breadcrumbs */}
      <div className="space-y-2 border-b border-border/70 pb-3">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
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

        {/* Target Select Dropdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <label htmlFor="studio-target-select" className="sr-only">
              {isAr ? "العنصر المستهدف" : "Target Surface"}
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

          {/* Reset Target Button */}
          <button
            type="button"
            onClick={() => onResetTarget(selectedTargetId)}
            title={isAr ? "إعادة ضبط هذا العنصر فقط" : "Reset target to defaults"}
            className="flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            <span className="hidden sm:inline">{isAr ? "ضبط" : "Reset"}</span>
          </button>
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
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isAr ? "النقش الهندسي" : "Pattern Motif"}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {canvasCandidates.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => handleUpdateCanvas({ pattern: pid })}
                  className={cn(
                    "flex items-center justify-between rounded-md border p-2 text-xs font-medium capitalize transition-colors",
                    canvasConfig.pattern === pid
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border bg-background text-foreground hover:bg-secondary/60",
                  )}
                >
                  <span>{pid.replace("-", " ")}</span>
                  {canvasConfig.pattern === pid ? <span className="size-1.5 rounded-full bg-white" /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* Intensity Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isAr ? "كثافة النقش (Intensity)" : "Pattern Intensity"}
            </label>
            <div className="grid grid-cols-4 gap-1">
              {INTENSITIES.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => handleUpdateCanvas({ intensity: lvl })}
                  className={cn(
                    "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                    canvasConfig.intensity === lvl
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : "border-border bg-background text-foreground hover:bg-secondary/60",
                  )}
                >
                  {lvl.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Scale Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isAr ? "مقياس النقش (Scale)" : "Pattern Scale"}
            </label>
            <div className="grid grid-cols-3 gap-1">
              {SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => handleUpdateCanvas({ scale })}
                  className={cn(
                    "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                    canvasConfig.scale === scale
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : "border-border bg-background text-foreground hover:bg-secondary/60",
                  )}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* FAMILY & COMPONENT SURFACE GRAMMAR CONTROLS */
        <div className="space-y-4">
          {/* Structural Frame */}
          {meta.allowedControls.frame ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isAr ? "إطار الهيكل (Frame)" : "Structural Frame"}
              </label>
              <div className="flex flex-wrap gap-1">
                {SURFACE_FRAMES.filter((f) => allowlist.frames.includes(f)).map((frame) => (
                  <button
                    key={frame}
                    type="button"
                    onClick={() => handleUpdateRecipe({ frame })}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      currentRecipe.frame === frame
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {frame}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Material Tone */}
          {meta.allowedControls.tone ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isAr ? "لون المادة (Tone)" : "Material Tone (100% Opaque)"}
              </label>
              <div className="flex flex-wrap gap-1">
                {SURFACE_TONES.filter((t) => allowlist.tones.includes(t)).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => handleUpdateRecipe({ tone })}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      currentRecipe.tone === tone
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Accent Token */}
          {meta.allowedControls.accent ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isAr ? "شريط التمييز (Accent)" : "Accent Token"}
              </label>
              <div className="flex flex-wrap gap-1">
                {SURFACE_ACCENTS.filter((a) => allowlist.accents.includes(a)).map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    onClick={() => handleUpdateRecipe({ accent })}
                    className={cn(
                      "rounded border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      currentRecipe.accent === accent
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {accent}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Corner Radius & Elevation Row */}
          <div className="grid grid-cols-2 gap-3">
            {meta.allowedControls.radius ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "استدارة الحواف" : "Corner Radius"}
                </label>
                <div className="flex flex-wrap gap-1">
                  {SURFACE_RADII.filter((r) => allowlist.radii.includes(r)).map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => handleUpdateRecipe({ radius })}
                      className={cn(
                        "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                        currentRecipe.radius === radius
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-background text-foreground hover:bg-secondary/60",
                      )}
                    >
                      {radius}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {meta.allowedControls.elevation ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "مستوى الظل" : "Elevation"}
                </label>
                <div className="flex flex-wrap gap-1">
                  {SURFACE_ELEVATIONS.filter((e) => allowlist.elevations.includes(e)).map((elevation) => (
                    <button
                      key={elevation}
                      type="button"
                      onClick={() => handleUpdateRecipe({ elevation })}
                      className={cn(
                        "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                        currentRecipe.elevation === elevation
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-background text-foreground hover:bg-secondary/60",
                      )}
                    >
                      {elevation}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Pattern Motif & Placement */}
          {meta.allowedControls.pattern ? (
            <div className="space-y-3 rounded-lg border border-border bg-sand/30 p-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "نقش السطح" : "Surface Motif"}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["none", "gza-lattice", "runway-datum", "pie-factory"] as const).map((motif) => (
                    <button
                      key={motif}
                      type="button"
                      onClick={() => handleUpdateRecipe({ pattern: motif })}
                      className={cn(
                        "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                        currentRecipe.pattern === motif
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-background text-foreground hover:bg-secondary/60",
                      )}
                    >
                      {motif.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {currentRecipe.pattern !== "none" ? (
                <>
                  {/* Pattern Placement */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {isAr ? "موضع النقش" : "Placement"}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {(["none", "rail", "header", "corner", "watermark"] as const)
                        .filter((p) => allowlist.patternPlacements.includes(p))
                        .map((placement) => (
                          <button
                            key={placement}
                            type="button"
                            onClick={() => handleUpdateRecipe({ patternPlacement: placement })}
                            className={cn(
                              "rounded border px-2 py-1 text-xs font-medium capitalize transition-colors",
                              currentRecipe.patternPlacement === placement
                                ? "border-primary bg-primary text-primary-foreground font-semibold"
                                : "border-border bg-background text-foreground hover:bg-secondary/60",
                            )}
                          >
                            {placement}
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Pattern Intensity & Scale */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-muted-foreground">
                        {isAr ? "الكثافة" : "Intensity"}
                      </label>
                      <select
                        value={currentRecipe.patternIntensity ?? "subtle"}
                        onChange={(e) =>
                          handleUpdateRecipe({
                            patternIntensity: e.target.value as IntensityLevel,
                          })
                        }
                        className="mt-1 h-7 w-full rounded border border-input bg-background px-2 text-xs"
                      >
                        {INTENSITIES.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-muted-foreground">
                        {isAr ? "المقياس" : "Scale"}
                      </label>
                      <select
                        value={currentRecipe.patternScale ?? "standard"}
                        onChange={(e) =>
                          handleUpdateRecipe({
                            patternScale: e.target.value as ScaleLevel,
                          })
                        }
                        className="mt-1 h-7 w-full rounded border border-input bg-background px-2 text-xs"
                      >
                        {SCALES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Footer Actions: Master toggle and Reset All */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={grammarConfig.enabled}
            onChange={(e) =>
              onUpdateSkin((prev) => ({
                ...prev,
                surfaceGrammar: {
                  ...(prev.surfaceGrammar ?? { families: DEFAULT_SURFACE_RECIPES }),
                  enabled: e.target.checked,
                },
              }))
            }
            className="rounded border-input text-primary focus:ring-primary size-4"
          />
          <span className="font-semibold text-foreground">
            {isAr ? "تفعيل أسطح غزة (Surface Grammar)" : "Enable Surface Grammar"}
          </span>
        </label>

        <button
          type="button"
          onClick={onResetAll}
          className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3" />
          <span>{isAr ? "إعادة ضبط الكل" : "Reset All"}</span>
        </button>
      </div>
    </div>
  );
}
