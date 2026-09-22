import { useId, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { btnClass } from "@/components/kit";
import { AdminPanel } from "./admin-kit";
import {
  DEFAULT_SITE_SKIN,
  applySkinToDom,
  clearDomSkinOverrides,
  clearPreviewSkin,
  isSkinPreviewActive,
  readPreviewSkin,
  writePreviewSkin,
  type SiteSkinConfig,
  type SurfaceSkinConfig,
} from "@/lib/skin";
import {
  ADMIN_CANDIDATE_PATTERNS,
  INTENSITY_VALUES,
  PUBLIC_CANDIDATE_PATTERNS,
  SAND_CANDIDATE_PATTERNS,
  SCALE_VALUES,
  resolveSurfaceCss,
  type SurfaceRole,
} from "@/design/patterns/pattern-presets";
import type {
  CanonicalPatternId,
  IntensityLevel,
  ScaleLevel,
} from "@/design/patterns/pattern-types";
import { cn } from "@/lib/utils";

const INTENSITY_OPTIONS: readonly IntensityLevel[] = [
  "off",
  "very-subtle",
  "subtle",
  "present",
];

const SCALE_OPTIONS: readonly ScaleLevel[] = ["small", "standard", "large"];

type SurfaceKey = "publicCanvas" | "sandSection" | "adminCanvas";

interface SurfaceSectionMeta {
  key: SurfaceKey;
  role: SurfaceRole;
  titleKey: string;
  candidates: readonly CanonicalPatternId[];
}

const SURFACES: readonly SurfaceSectionMeta[] = [
  {
    key: "publicCanvas",
    role: "public",
    titleKey: "a2.skin.surface.public",
    candidates: PUBLIC_CANDIDATE_PATTERNS,
  },
  {
    key: "sandSection",
    role: "sand",
    titleKey: "a2.skin.surface.sand",
    candidates: SAND_CANDIDATE_PATTERNS,
  },
  {
    key: "adminCanvas",
    role: "admin",
    titleKey: "a2.skin.surface.admin",
    candidates: ADMIN_CANDIDATE_PATTERNS,
  },
];

export function AppearanceLab() {
  const { t, lang } = useI18n();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isPreview = isSkinPreviewActive(searchStr);

  const [skin, setSkin] = useState<SiteSkinConfig>(() => readPreviewSkin());

  const updateSurface = (key: SurfaceKey, changes: Partial<SurfaceSkinConfig>) => {
    setSkin((prev) => {
      const next: SiteSkinConfig = {
        ...prev,
        [key]: { ...prev[key], ...changes },
      };
      writePreviewSkin(next);
      // Strictly isolated: only update the current document DOM if preview mode is active
      if (isPreview) {
        applySkinToDom(next);
      }
      return next;
    });
  };

  const handleResetSection = (key: SurfaceKey) => {
    setSkin((prev) => {
      const next: SiteSkinConfig = {
        ...prev,
        [key]: { ...DEFAULT_SITE_SKIN[key] },
      };
      writePreviewSkin(next);
      // Strictly isolated: only update the current document DOM if preview mode is active
      if (isPreview) {
        applySkinToDom(next);
      }
      return next;
    });
  };

  const handleResetAll = () => {
    clearPreviewSkin();
    setSkin({ ...DEFAULT_SITE_SKIN });
    // Strictly isolated: only update the current document DOM if preview mode is active
    if (isPreview) {
      clearDomSkinOverrides();
    }
  };

  // Preview URLs preserving locale with ?skinPreview=1
  const homeHref = lang === "ar" ? "/ar?skinPreview=1" : "/?skinPreview=1";
  const futureHref = lang === "ar" ? "/ar/airport/future?skinPreview=1" : "/airport/future?skinPreview=1";
  const adminHref = lang === "ar" ? "/ar/admin?skinPreview=1" : "/admin?skinPreview=1";

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
      >
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="font-medium leading-relaxed">{t("a2.skin.banner")}</p>
      </div>

      {/* Surface sections */}
      {SURFACES.map((section) => {
        const currentConfig = skin[section.key];
        const defaultConfig = DEFAULT_SITE_SKIN[section.key];
        const isModified =
          currentConfig.pattern !== defaultConfig.pattern ||
          currentConfig.intensity !== defaultConfig.intensity ||
          currentConfig.scale !== defaultConfig.scale;

        return (
          <SurfaceSectionCard
            key={section.key}
            meta={section}
            config={currentConfig}
            isModified={isModified}
            onChange={(changes) => updateSurface(section.key, changes)}
            onReset={() => handleResetSection(section.key)}
          />
        );
      })}

      {/* Footer Actions (No Save or Publish) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <button
          type="button"
          onClick={handleResetAll}
          className={btnClass("outline", "sm", "flex items-center gap-1.5")}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          <span>{t("a2.skin.resetAll")}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={homeHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass("secondary", "sm", "flex items-center gap-1.5")}
          >
            <span>{t("a2.skin.previewHome")}</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
          <a
            href={futureHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass("secondary", "sm", "flex items-center gap-1.5")}
          >
            <span>{t("a2.skin.previewFuture")}</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
          <a
            href={adminHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass("primary", "sm", "flex items-center gap-1.5")}
          >
            <span>{t("a2.skin.previewAdmin")}</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function SurfaceSectionCard({
  meta,
  config,
  isModified,
  onChange,
  onReset,
}: {
  meta: SurfaceSectionMeta;
  config: SurfaceSkinConfig;
  isModified: boolean;
  onChange: (changes: Partial<SurfaceSkinConfig>) => void;
  onReset: () => void;
}) {
  const { t, lang } = useI18n();
  const patternGroupId = useId();
  const intensityGroupId = useId();
  const scaleGroupId = useId();

  return (
    <AdminPanel
      title={t(meta.titleKey)}
      action={
        <button
          type="button"
          onClick={onReset}
          disabled={!isModified}
          aria-disabled={!isModified}
          className={btnClass(
            "ghost",
            "sm",
            cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground",
              !isModified && "pointer-events-none opacity-40",
            ),
          )}
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          <span>{t("a2.skin.resetSection")}</span>
        </button>
      }
      bodyClassName="space-y-5 p-4 sm:p-5"
    >
      {/* Pattern Thumbnails Radio Group with Radix Roving Tabindex Semantics */}
      <fieldset className="space-y-2">
        <legend id={patternGroupId} className="type-label text-muted-foreground">
          {t("a2.skin.pattern")}
        </legend>
        <RadioGroupPrimitive.Root
          value={config.pattern}
          onValueChange={(val) => onChange({ pattern: val as CanonicalPatternId })}
          dir={lang === "ar" ? "rtl" : "ltr"}
          aria-labelledby={patternGroupId}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          {meta.candidates.map((patId) => {
            const isSelected = config.pattern === patId;
            const previewCss = resolveSurfaceCss(meta.role, patId, "present", "standard");

            return (
              <RadioGroupPrimitive.Item
                key={patId}
                value={patId}
                id={`${patternGroupId}-${patId}`}
                aria-label={t(`a2.skin.pattern.${patId}`)}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-lg border p-2 text-start transition-all cursor-pointer select-none",
                  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-2 data-[state=checked]:ring-primary",
                  "data-[state=unchecked]:border-border data-[state=unchecked]:bg-card hover:data-[state=unchecked]:border-foreground/30 hover:data-[state=unchecked]:bg-secondary/40",
                )}
              >
                <div
                  className="h-14 w-full rounded border border-border/60 transition-transform group-hover:scale-[1.02]"
                  style={{
                    backgroundColor: previewCss.backgroundColor,
                    backgroundImage: previewCss.backgroundImage,
                    backgroundSize: previewCss.backgroundSize ?? "auto",
                  }}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "w-full truncate text-center text-xs",
                    isSelected ? "font-bold text-foreground" : "font-medium text-muted-foreground",
                  )}
                >
                  {t(`a2.skin.pattern.${patId}`)}
                </span>
              </RadioGroupPrimitive.Item>
            );
          })}
        </RadioGroupPrimitive.Root>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Intensity Selector with Radix Roving Tabindex Semantics */}
        <fieldset className="space-y-2">
          <legend id={intensityGroupId} className="type-label text-muted-foreground">
            {t("a2.skin.intensity")}
          </legend>
          <RadioGroupPrimitive.Root
            value={config.intensity}
            onValueChange={(val) => onChange({ intensity: val as IntensityLevel })}
            dir={lang === "ar" ? "rtl" : "ltr"}
            aria-labelledby={intensityGroupId}
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
          >
            {INTENSITY_OPTIONS.map((level) => {
              const val = INTENSITY_VALUES[meta.role][level];
              const pct = `${(val * 100).toFixed(val < 0.01 && val > 0 ? 1 : val === 0 ? 0 : 1)}%`;

              return (
                <RadioGroupPrimitive.Item
                  key={level}
                  value={level}
                  id={`${intensityGroupId}-${level}`}
                  aria-label={`${t(`a2.skin.intensity.${level}`)} (${pct})`}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border px-2.5 py-1.5 text-center transition-all cursor-pointer select-none",
                    "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-card data-[state=unchecked]:text-muted-foreground hover:data-[state=unchecked]:border-foreground/30 hover:data-[state=unchecked]:text-foreground",
                  )}
                >
                  <span className="text-xs">{t(`a2.skin.intensity.${level}`)}</span>
                  <span className="code-id text-[10px] opacity-80">{pct}</span>
                </RadioGroupPrimitive.Item>
              );
            })}
          </RadioGroupPrimitive.Root>
        </fieldset>

        {/* Scale Selector with Radix Roving Tabindex Semantics */}
        <fieldset className="space-y-2">
          <legend id={scaleGroupId} className="type-label text-muted-foreground">
            {t("a2.skin.scale")}
          </legend>
          <RadioGroupPrimitive.Root
            value={config.scale}
            onValueChange={(val) => onChange({ scale: val as ScaleLevel })}
            dir={lang === "ar" ? "rtl" : "ltr"}
            aria-labelledby={scaleGroupId}
            className="grid grid-cols-3 gap-1.5"
          >
            {SCALE_OPTIONS.map((scale) => {
              const multiplier = `${SCALE_VALUES[scale]}×`;

              return (
                <RadioGroupPrimitive.Item
                  key={scale}
                  value={scale}
                  id={`${scaleGroupId}-${scale}`}
                  aria-label={`${t(`a2.skin.scale.${scale}`)} (${multiplier})`}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border px-2.5 py-1.5 text-center transition-all cursor-pointer select-none",
                    "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-semibold",
                    "data-[state=unchecked]:border-border data-[state=unchecked]:bg-card data-[state=unchecked]:text-muted-foreground hover:data-[state=unchecked]:border-foreground/30 hover:data-[state=unchecked]:text-foreground",
                  )}
                >
                  <span className="text-xs">{t(`a2.skin.scale.${scale}`)}</span>
                  <span className="code-id text-[10px] opacity-80">{multiplier}</span>
                </RadioGroupPrimitive.Item>
              );
            })}
          </RadioGroupPrimitive.Root>
        </fieldset>
      </div>
    </AdminPanel>
  );
}
