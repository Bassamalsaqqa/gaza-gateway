/**
 * Gaza Gateway — Appearance Studio Toolbar
 *
 * Provides responsive controls for page/scenario selection, independent EN/AR locale,
 * device viewport widths (1440, 1280, 768, 390, 320, fill), Fit vs 100% scaling,
 * Inspect vs Browse mode, Draft vs Baseline comparison, reload, and new tab.
 */

import {
  ExternalLink,
  Laptop,
  Maximize2,
  Minimize2,
  MousePointer,
  Navigation,
  RefreshCw,
  Smartphone,
  SplitSquareVertical,
  Tablet,
} from "lucide-react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  STUDIO_SCENARIOS,
  getScenariosForPage,
  type StudioPageId,
} from "@/lib/studio-scenarios";
import { getTargetMeta, type TargetId } from "@/design/surfaces/targets";

export type ViewportPreset =
  | "desktop-wide"
  | "desktop"
  | "tablet"
  | "mobile-lg"
  | "mobile-sm"
  | "fill";

export const VIEWPORT_WIDTHS: Record<ViewportPreset, number | null> = {
  "desktop-wide": 1440,
  desktop: 1280,
  tablet: 768,
  "mobile-lg": 390,
  "mobile-sm": 320,
  fill: null,
};

export interface StudioToolbarProps {
  page: StudioPageId;
  onPageChange: (page: StudioPageId) => void;
  scenarioId: string;
  onScenarioChange: (scenarioId: string) => void;
  locale: "en" | "ar";
  onLocaleChange: (locale: "en" | "ar") => void;
  viewport: ViewportPreset;
  onViewportChange: (viewport: ViewportPreset) => void;
  fitScale: boolean;
  onToggleFitScale: () => void;
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  baselineMode: boolean;
  onToggleBaselineMode: () => void;
  hoveredTargetId: TargetId | null;
  onReload: () => void;
  previewUrl: string;
}

export function StudioToolbar({
  page,
  onPageChange,
  scenarioId,
  onScenarioChange,
  locale,
  onLocaleChange,
  viewport,
  onViewportChange,
  fitScale,
  onToggleFitScale,
  inspectMode,
  onToggleInspectMode,
  baselineMode,
  onToggleBaselineMode,
  hoveredTargetId,
  onReload,
  previewUrl,
}: StudioToolbarProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";

  const availableScenarios = getScenariosForPage(page);
  const hoveredMeta = hoveredTargetId ? getTargetMeta(hoveredTargetId) : null;

  return (
    <div
      data-testid="studio-toolbar"
      className="flex flex-col gap-2 rounded-t-xl border border-b-0 border-border bg-card p-3 shadow-xs"
    >
      {/* Top Status & Context Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2 text-xs">
        {/* Banner: Stored in browser notice */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-brand animate-pulse" />
          <span className="font-medium text-foreground">
            {isAr
              ? "معاينة مسودة · مخزنة في هذا المتصفح · غير منشورة"
              : "Draft preview · Stored in this browser · Not published"}
          </span>
        </div>

        {/* Hovered Target Pill */}
        {hoveredMeta ? (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] text-primary transition-all">
            <span className="size-1.5 rounded-full bg-primary" />
            <span>{isAr ? hoveredMeta.nameAr : hoveredMeta.nameEn}</span>
            <span className="text-muted-foreground">({hoveredMeta.id})</span>
          </div>
        ) : (
          <div className="hidden sm:block text-[11px] text-muted-foreground">
            {inspectMode
              ? isAr
                ? "انقر على أي عنصر لفحص خصائصه"
                : "Hover and click any component to inspect"
              : isAr
                ? "وضع التصفح نشط"
                : "Browse simulation active"}
          </div>
        )}
      </div>

      {/* Main Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left / Start: Page and Scenario Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Page Selector */}
          <div className="flex items-center gap-1">
            <label htmlFor="studio-page-select" className="sr-only">
              {isAr ? "الصفحة" : "Page"}
            </label>
            <select
              id="studio-page-select"
              value={page}
              onChange={(e) => onPageChange(e.target.value as StudioPageId)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="home">{isAr ? "الرئيسية" : "Home (/)"}</option>
              <option value="book">{isAr ? "حجز رحلة" : "Booking (/book)"}</option>
              <option value="travel">{isAr ? "دليل السفر" : "Travel (/travel)"}</option>
              <option value="airport">{isAr ? "المطار والتاريخ" : "Airport (/airport)"}</option>
            </select>
          </div>

          {/* Scenario Selector */}
          <div className="flex items-center gap-1">
            <label htmlFor="studio-scenario-select" className="sr-only">
              {isAr ? "السيناريو" : "Scenario"}
            </label>
            <select
              id="studio-scenario-select"
              value={scenarioId}
              onChange={(e) => onScenarioChange(e.target.value)}
              className="h-8 max-w-[210px] rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-primary"
            >
              {availableScenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {isAr ? sc.titleAr : sc.titleEn}
                </option>
              ))}
            </select>
          </div>

          {/* Locale Toggle for Preview Frame */}
          <div className="inline-flex rounded-md border border-input bg-secondary/40 p-0.5">
            <button
              type="button"
              onClick={() => onLocaleChange("en")}
              aria-label="Preview English (LTR)"
              className={cn(
                "rounded px-2 py-1 text-xs font-semibold transition-colors",
                locale === "en"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onLocaleChange("ar")}
              aria-label="Preview Arabic (RTL)"
              className={cn(
                "rounded px-2 py-1 text-xs font-semibold transition-colors",
                locale === "ar"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              عربي
            </button>
          </div>
        </div>

        {/* Center / Right: Viewport, Zoom, Mode, and Preview Control Groups */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Group 1: Viewport */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? "أبعاد العرض" : "Viewport"}
            </span>
            <RadioGroupPrimitive.Root
              dir={isAr ? "rtl" : "ltr"}
              value={viewport}
              onValueChange={(val) => onViewportChange(val as ViewportPreset)}
              aria-label={isAr ? "أبعاد العرض" : "Viewport"}
              className="inline-flex items-center rounded-md border border-input bg-secondary/40 p-0.5"
            >
              <RadioGroupPrimitive.Item
                value="desktop-wide"
                title="1440px — Wide Desktop"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "desktop-wide"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Laptop className="size-3.5" />
                <span className="hidden xl:inline">1440</span>
              </RadioGroupPrimitive.Item>

              <RadioGroupPrimitive.Item
                value="desktop"
                title="1280px — Standard Desktop"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "desktop"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Laptop className="size-3.5" />
                <span className="hidden xl:inline">1280</span>
              </RadioGroupPrimitive.Item>

              <RadioGroupPrimitive.Item
                value="tablet"
                title="768px — Tablet"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "tablet"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Tablet className="size-3.5" />
                <span className="hidden xl:inline">768</span>
              </RadioGroupPrimitive.Item>

              <RadioGroupPrimitive.Item
                value="mobile-lg"
                title="390px — Mobile"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "mobile-lg"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Smartphone className="size-3.5" />
                <span className="hidden xl:inline">390</span>
              </RadioGroupPrimitive.Item>

              <RadioGroupPrimitive.Item
                value="mobile-sm"
                title="320px — Compact Mobile"
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "mobile-sm"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Smartphone className="size-3.5" />
                <span className="hidden xl:inline">320</span>
              </RadioGroupPrimitive.Item>

              <RadioGroupPrimitive.Item
                value="fill"
                title={isAr ? "عرض تلقائي 100%" : "Auto / 100% Fluid Width"}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  viewport === "fill"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Maximize2 className="size-3.5" />
                <span className="hidden xl:inline">{isAr ? "تلقائي" : "Auto"}</span>
              </RadioGroupPrimitive.Item>
            </RadioGroupPrimitive.Root>
          </div>

          {/* Group 2: Zoom [Fit | 100%] */}
          {viewport !== "fill" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isAr ? "التقريب" : "Zoom"}
              </span>
              <RadioGroupPrimitive.Root
                dir={isAr ? "rtl" : "ltr"}
                value={fitScale ? "fit" : "100"}
                onValueChange={(val) => {
                  if (val === "fit" && !fitScale) onToggleFitScale();
                  if (val === "100" && fitScale) onToggleFitScale();
                }}
                aria-label={isAr ? "نسبة التقريب" : "Zoom Scaling"}
                className="inline-flex items-center rounded-md border border-input bg-secondary/40 p-0.5"
              >
                <RadioGroupPrimitive.Item
                  value="fit"
                  title={isAr ? "ملاءمة أبعاد الشاشة" : "Scale to fit container"}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                    fitScale
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Minimize2 className="size-3" />
                  <span>{isAr ? "ملاءمة" : "Fit"}</span>
                </RadioGroupPrimitive.Item>
                <RadioGroupPrimitive.Item
                  value="100"
                  title={isAr ? "الحجم الطبيعي 100%" : "100% unscaled"}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                    !fitScale
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Maximize2 className="size-3" />
                  <span>100%</span>
                </RadioGroupPrimitive.Item>
              </RadioGroupPrimitive.Root>
            </div>
          ) : null}

          {/* Group 3: Mode [Inspect | Browse] */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? "النمط" : "Mode"}
            </span>
            <RadioGroupPrimitive.Root
              dir={isAr ? "rtl" : "ltr"}
              value={inspectMode ? "inspect" : "browse"}
              onValueChange={(val) => {
                if (val === "inspect" && !inspectMode) onToggleInspectMode();
                if (val === "browse" && inspectMode) onToggleInspectMode();
              }}
              aria-label={isAr ? "نمط الاستوديو" : "Studio Mode"}
              data-testid="toggle-inspect-mode"
              className="inline-flex items-center rounded-md border border-input bg-secondary/40 p-0.5"
            >
              <RadioGroupPrimitive.Item
                value="inspect"
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  inspectMode
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  isAr
                    ? "فحص العناصر: انقر لتحديد العنصر"
                    : "Inspect Mode: click to select surface"
                }
              >
                <MousePointer className={cn("size-3.5", inspectMode && "animate-bounce")} />
                <span>{isAr ? "فحص" : "Inspect"}</span>
              </RadioGroupPrimitive.Item>
              <RadioGroupPrimitive.Item
                value="browse"
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  !inspectMode
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  isAr
                    ? "تصفح: تفاعل مع الروابط بحرية"
                    : "Browse Mode: interact freely"
                }
              >
                <Navigation className="size-3.5" />
                <span>{isAr ? "تصفح" : "Browse"}</span>
              </RadioGroupPrimitive.Item>
            </RadioGroupPrimitive.Root>
          </div>

          {/* Group 4: Preview [Draft | Baseline] */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? "المعاينة" : "Preview"}
            </span>
            <RadioGroupPrimitive.Root
              dir={isAr ? "rtl" : "ltr"}
              value={baselineMode ? "baseline" : "draft"}
              onValueChange={(val) => {
                if (val === "draft" && baselineMode) onToggleBaselineMode();
                if (val === "baseline" && !baselineMode) onToggleBaselineMode();
              }}
              aria-label={isAr ? "مقارنة المعاينة" : "Preview Comparison"}
              data-testid="toggle-baseline-mode"
              className="inline-flex items-center rounded-md border border-input bg-secondary/40 p-0.5"
            >
              <RadioGroupPrimitive.Item
                value="draft"
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  !baselineMode
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  isAr
                    ? "معاينة المسودة (Draft) مع التخصيصات"
                    : "Viewing draft surface grammar customizations"
                }
              >
                <SplitSquareVertical className="size-3.5" />
                <span>{isAr ? "المسودة" : "Draft"}</span>
              </RadioGroupPrimitive.Item>
              <RadioGroupPrimitive.Item
                value="baseline"
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  baselineMode
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-600/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  isAr
                    ? "معاينة الأصل (Baseline) بدون تخصيصات"
                    : "Viewing baseline production styles"
                }
              >
                <span>{isAr ? "الأصل" : "Baseline"}</span>
              </RadioGroupPrimitive.Item>
            </RadioGroupPrimitive.Root>
          </div>

          {/* Quick Actions: Reload & External Link */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onReload}
              aria-label={isAr ? "إعادة تحميل المعاينة" : "Reload preview"}
              className="flex size-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={isAr ? "فتح في نافذة جديدة" : "Open preview in new tab"}
              className="flex size-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
