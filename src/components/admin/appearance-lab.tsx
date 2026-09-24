import { useId, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  ExternalLink,
  RotateCcw,
  Sparkles,
  LayoutGrid,
  Layers,
  FlaskConical,
  Columns2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { btnClass } from "@/components/kit";
import { AdminPanel } from "./admin-kit";
import {
  DEFAULT_SITE_SKIN,
  clearDomSkinOverrides,
  clearPreviewSkin,
  isSkinPreviewActive,
  readPreviewSkin,
  writePreviewSkin,
  type SiteSkinConfig,
  type SurfaceSkinConfig,
} from "@/lib/skin";
import { applySkinToDom } from "@/lib/skin-preview";
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
import {
  SURFACE_FAMILY_IDS,
  DEFAULT_SURFACE_RECIPES,
  FAMILY_ALLOWLISTS,
  type SurfaceAccent,
  type SurfaceElevation,
  type SurfaceFamilyId,
  type SurfaceFrame,
  type PatternPlacement,
  type SurfaceRadius,
  type SurfaceRecipe,
  type SurfaceTone,
  type SurfaceGrammarConfig,
  GazaSurface,
  SurfaceIndex,
} from "@/design/surfaces";
import {
  FlightOptionSpecimen,
  FareOptionSpecimen,
  TripSummarySpecimen,
  PassengerFormSpecimen,
  GuidePlateSpecimen,
  EditorialCardSpecimen,
  ReviewDossierSpecimen,
} from "./surface-lab-specimens";
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

type SubTab = "canvas" | "surfaces" | "lab";

export function AppearanceLab() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isPreview = isSkinPreviewActive(searchStr);

  const [activeTab, setActiveTab] = useState<SubTab>("surfaces");
  const [skin, setSkin] = useState<SiteSkinConfig>(() => readPreviewSkin());
  const [labMode, setLabMode] = useState<"baseline" | "grammar" | "compare">("compare");

  const grammarConfig: SurfaceGrammarConfig =
    skin.surfaceGrammar ?? { enabled: false, families: DEFAULT_SURFACE_RECIPES };

  const updateSurface = (key: SurfaceKey, changes: Partial<SurfaceSkinConfig>) => {
    setSkin((prev) => {
      const next: SiteSkinConfig = {
        ...prev,
        [key]: { ...prev[key], ...changes },
      };
      writePreviewSkin(next);
      if (isPreview) {
        applySkinToDom(next);
      }
      return next;
    });
  };

  const updateGrammarConfig = (changes: Partial<SurfaceGrammarConfig>) => {
    setSkin((prev) => {
      const currentGrammar = prev.surfaceGrammar ?? {
        enabled: false,
        families: DEFAULT_SURFACE_RECIPES,
      };
      const nextGrammar: SurfaceGrammarConfig = {
        ...currentGrammar,
        ...changes,
      };
      const next: SiteSkinConfig = {
        ...prev,
        surfaceGrammar: nextGrammar,
      };
      writePreviewSkin(next);
      return next;
    });
  };

  const updateFamilyRecipe = (family: SurfaceFamilyId, changes: Partial<SurfaceRecipe>) => {
    setSkin((prev) => {
      const currentGrammar = prev.surfaceGrammar ?? {
        enabled: false,
        families: DEFAULT_SURFACE_RECIPES,
      };
      const currentRecipe = currentGrammar.families[family] ?? DEFAULT_SURFACE_RECIPES[family];
      const nextRecipe: SurfaceRecipe = {
        ...currentRecipe,
        ...changes,
      };
      const nextGrammar: SurfaceGrammarConfig = {
        ...currentGrammar,
        families: {
          ...currentGrammar.families,
          [family]: nextRecipe,
        },
      };
      const next: SiteSkinConfig = {
        ...prev,
        surfaceGrammar: nextGrammar,
      };
      writePreviewSkin(next);
      return next;
    });
  };

  const handleResetFamily = (family: SurfaceFamilyId) => {
    updateFamilyRecipe(family, { ...DEFAULT_SURFACE_RECIPES[family] });
  };

  const handleResetSection = (key: SurfaceKey) => {
    setSkin((prev) => {
      const next: SiteSkinConfig = {
        ...prev,
        [key]: { ...DEFAULT_SITE_SKIN[key] },
      };
      writePreviewSkin(next);
      if (isPreview) {
        applySkinToDom(next);
      }
      return next;
    });
  };

  const handleResetAll = () => {
    clearPreviewSkin();
    setSkin({ ...DEFAULT_SITE_SKIN });
    if (isPreview) {
      clearDomSkinOverrides();
    }
  };

  // Preview URLs preserving locale with ?skinPreview=1
  const homeHref = isAr ? "/ar?skinPreview=1" : "/?skinPreview=1";
  const bookHref = isAr ? "/ar/book?skinPreview=1" : "/book?skinPreview=1";
  const travelHref = isAr ? "/ar/travel?skinPreview=1" : "/travel?skinPreview=1";
  const futureHref = isAr ? "/ar/airport/future?skinPreview=1" : "/airport/future?skinPreview=1";

  return (
    <div className="space-y-6">
      {/* Required Visible Notice Banner */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
      >
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="font-medium leading-relaxed">{t("a2.skin.banner")}</p>
      </div>

      {/* Sub-Tabs: Canvas Skin vs Surface Grammar vs Surface Lab */}
      <div className="flex border-b border-border/80">
        <nav className="flex space-x-1 rtl:space-x-reverse" aria-label="Appearance Areas">
          <button
            type="button"
            onClick={() => setActiveTab("surfaces")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === "surfaces"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="size-4" />
            <span>{t("a2.skin.tabs.surfaces")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("canvas")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === "canvas"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
            <span>{t("a2.skin.tabs.canvas")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("lab")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === "lab"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FlaskConical className="size-4" />
            <span>{t("a2.skin.tabs.lab")}</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: CANVAS SKIN (Existing) */}
      {activeTab === "canvas" ? (
        <div className="space-y-6">
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
        </div>
      ) : null}

      {/* TAB 2: SURFACE GRAMMAR (New) */}
      {activeTab === "surfaces" ? (
        <div className="space-y-6">
          {/* Master Surface Grammar Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {t("a2.skin.sg.enablePreview")}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("a2.skin.sg.enableHint")}
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={grammarConfig.enabled}
                onChange={(e) => updateGrammarConfig({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* 6 Semantic Surface Families */}
          <div className="space-y-6">
            {SURFACE_FAMILY_IDS.map((familyId) => {
              const recipe = grammarConfig.families[familyId] ?? DEFAULT_SURFACE_RECIPES[familyId];

              return (
                <SurfaceFamilyCard
                  key={familyId}
                  family={familyId}
                  recipe={recipe}
                  onChange={(changes) => updateFamilyRecipe(familyId, changes)}
                  onReset={() => handleResetFamily(familyId)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {/* TAB 3: LIVE SURFACE LAB */}
      {activeTab === "lab" ? (
        <div className="space-y-6">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {t("a2.skin.lab.title")}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("a2.skin.lab.sub")}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setLabMode("baseline")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  labMode === "baseline"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("a2.skin.lab.mode.baseline")}
              </button>

              <button
                type="button"
                onClick={() => setLabMode("grammar")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  labMode === "grammar"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("a2.skin.lab.mode.grammar")}
              </button>

              <button
                type="button"
                onClick={() => setLabMode("compare")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  labMode === "compare"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Columns2 className="size-3.5" />
                <span>{t("a2.skin.lab.mode.compare")}</span>
              </button>
            </div>
          </div>

          {/* Specimens rendering */}
          {labMode === "compare" ? (
            <div className="space-y-10">
              {/* Column labels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-muted-foreground/60" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("a2.skin.lab.mode.baseline")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-brand" />
                  <span className="text-xs font-bold uppercase tracking-wider text-brand">
                    {t("a2.skin.lab.mode.grammar")}
                  </span>
                </div>
              </div>

              {/* 1. Flight Option */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <FlightOptionSpecimen forceGrammar={false} />
                <FlightOptionSpecimen forceGrammar={true} recipe={grammarConfig.families.operational} />
              </div>

              {/* 2. Fare Option */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <FareOptionSpecimen forceGrammar={false} />
                <FareOptionSpecimen forceGrammar={true} recipe={grammarConfig.families.fare} />
              </div>

              {/* 3. Trip Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <TripSummarySpecimen forceGrammar={false} />
                <TripSummarySpecimen forceGrammar={true} recipe={grammarConfig.families.dossier} />
              </div>

              {/* 4. Passenger Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <PassengerFormSpecimen forceGrammar={false} />
                <PassengerFormSpecimen forceGrammar={true} recipe={grammarConfig.families["form-sheet"]} />
              </div>

              {/* 5. Guide Plate */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <GuidePlateSpecimen forceGrammar={false} />
                <GuidePlateSpecimen forceGrammar={true} recipe={grammarConfig.families.guide} />
              </div>

              {/* 6. Editorial Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <EditorialCardSpecimen forceGrammar={false} />
                <EditorialCardSpecimen forceGrammar={true} recipe={grammarConfig.families.editorial} />
              </div>

              {/* 7. Review Dossier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <ReviewDossierSpecimen forceGrammar={false} />
                <ReviewDossierSpecimen forceGrammar={true} recipe={grammarConfig.families.dossier} />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <FlightOptionSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.operational}
              />
              <FareOptionSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.fare}
              />
              <TripSummarySpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.dossier}
              />
              <PassengerFormSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families["form-sheet"]}
              />
              <GuidePlateSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.guide}
              />
              <EditorialCardSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.editorial}
              />
              <ReviewDossierSpecimen
                forceGrammar={labMode === "grammar"}
                recipe={grammarConfig.families.dossier}
              />
            </div>
          )}
        </div>
      ) : null}

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
            href={bookHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass("secondary", "sm", "flex items-center gap-1.5")}
          >
            <span>{isAr ? "معاينة الحجز" : "Preview Book"}</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
          <a
            href={travelHref}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass("secondary", "sm", "flex items-center gap-1.5")}
          >
            <span>{isAr ? "معاينة السفر" : "Preview Travel"}</span>
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
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface Family Configuration Card
// ─────────────────────────────────────────────────────────────────────────────

function SurfaceFamilyCard({
  family,
  recipe,
  onChange,
  onReset,
}: {
  family: SurfaceFamilyId;
  recipe: SurfaceRecipe;
  onChange: (changes: Partial<SurfaceRecipe>) => void;
  onReset: () => void;
}) {
  const { t, lang } = useI18n();
  const allowlist = FAMILY_ALLOWLISTS[family];

  return (
    <AdminPanel
      title={t(`a2.skin.sg.family.${family}`)}
      action={
        <button
          type="button"
          onClick={onReset}
          className={btnClass(
            "ghost",
            "sm",
            "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground",
          )}
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          <span>{t("a2.skin.sg.resetFamily")}</span>
        </button>
      }
      bodyClassName="space-y-5 p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Frame Selector */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.frame")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.frames.map((frame) => (
              <button
                key={frame}
                type="button"
                onClick={() => onChange({ frame })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.frame === frame
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.frame.${frame}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Tone Selector */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.tone")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.tones.map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => onChange({ tone })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.tone === tone
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.tone.${tone}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Accent Selector */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.accent")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.accents.map((accent) => (
              <button
                key={accent}
                type="button"
                onClick={() => onChange({ accent })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.accent === accent
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.accent.${accent}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Radius Selector */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.radius")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.radii.map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => onChange({ radius })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.radius === radius
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.radius.${radius}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Elevation Selector */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.elevation")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.elevations.map((elevation) => (
              <button
                key={elevation}
                type="button"
                onClick={() => onChange({ elevation })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.elevation === elevation
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.elevation.${elevation}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Pattern Placement */}
        <div className="space-y-1.5">
          <label className="type-label text-muted-foreground">
            {t("a2.skin.sg.placement")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allowlist.patternPlacements.map((placement) => (
              <button
                key={placement}
                type="button"
                onClick={() => onChange({ patternPlacement: placement })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  recipe.patternPlacement === placement
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t(`a2.skin.sg.placement.${placement}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pattern Motif selection if placement != none */}
      {recipe.patternPlacement !== "none" ? (
        <div className="space-y-4 pt-3 border-t border-border/60">
          <div>
            <label className="type-label text-muted-foreground mb-2 block">
              {t("a2.skin.pattern")}
            </label>
            <div className="flex flex-wrap gap-2">
              {(["none", "gza-lattice", "runway-datum", "pie-factory"] as const).map((patId) => (
                <button
                  key={patId}
                  type="button"
                  onClick={() => onChange({ pattern: patId })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    recipe.pattern === patId
                      ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`a2.skin.pattern.${patId}`)}
                </button>
              ))}
            </div>
          </div>

          {recipe.pattern !== "none" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Pattern Intensity */}
              <div className="space-y-1.5">
                <label className="type-label text-muted-foreground">
                  {t("a2.skin.intensity")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(["off", "very-subtle", "subtle", "present"] as const).map((intensity) => (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => onChange({ patternIntensity: intensity })}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        recipe.patternIntensity === intensity
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      {t(`a2.skin.intensity.${intensity}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pattern Scale */}
              <div className="space-y-1.5">
                <label className="type-label text-muted-foreground">
                  {t("a2.skin.scale")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(["small", "standard", "large"] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => onChange({ patternScale: scale })}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        recipe.patternScale === scale
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      {t(`a2.skin.scale.${scale}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Live Preview Specimen of this specific recipe */}
      <div className="mt-4 pt-4 border-t border-border/60">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
          {lang === "ar" ? "معاينة حية للقالب المحدد" : "Live Recipe Specimen"}
        </span>
        <GazaSurface
          family={family}
          recipe={recipe}
          forceGrammar={true}
          className="p-4"
        >
          <div className="flex items-center justify-between">
            <SurfaceIndex
              code={family.toUpperCase().slice(0, 4)}
              label={t(`a2.skin.sg.family.${family}`)}
              accent={recipe.accent}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {recipe.tone} · {recipe.frame}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {lang === "ar"
              ? "هذا نموذج مصغر يوضح استجابة السطح لاختيارات الإطار والخامة والارتفاع ونمط الزخرفة."
              : "Preview showing resolved frame, tone, elevation, accent, and pattern placement."}
          </p>
        </GazaSurface>
      </div>
    </AdminPanel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Skin Section Card (Preserved from visual system A)
// ─────────────────────────────────────────────────────────────────────────────

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
