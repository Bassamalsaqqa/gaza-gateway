/**
 * Gaza Gateway — Surface Grammar Reusable Primitives
 *
 * Authored structural primitives implementing the Gaza Surface Grammar:
 * - GazaSurface: Base container managing material tone, logical Gaza Rail, radius & elevation
 * - SurfaceRail: Dedicated structural rail element
 * - SurfaceIndex: Compact technical index pill/flag
 * - SurfaceLedger: Tabular data/pricing ledger rows with LTR isolation
 * - SurfaceRule: Subtle hairline divider rule
 * - SurfaceMedia: Truth-classified media container with focal cropping and caption
 * - SurfaceDatum: Aeronautical route datum axis
 */

import {
  forwardRef,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowRight, Plane } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PIE_FACTORY_DEFINITION } from "@/design/patterns/pie-factory";
import { useSurfaceRecipe } from "./context";
import { GAZA_LATTICE_DEFINITION, RUNWAY_DATUM_DEFINITION, createMotifDataUri } from "./motifs";
import {
  ACCENT_RAIL_CLASSES,
  ACCENT_TEXT_CLASSES,
  resolveSurfaceClasses,
} from "./tokens";
import type {
  PatternIntensity,
  PatternPlacement,
  PatternScale,
  SurfaceAccent,
  SurfaceFamilyId,
  SurfaceRecipe,
  SurfaceTone,
  TruthClass,
} from "./types";
import type { TargetId } from "./runtime-targets";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GazaSurface (Base Container)
// ─────────────────────────────────────────────────────────────────────────────

export interface GazaSurfaceProps extends HTMLAttributes<HTMLElement> {
  family: SurfaceFamilyId;
  target?: TargetId | undefined;
  recipe?: SurfaceRecipe | undefined;
  selected?: boolean | undefined;
  forceGrammar?: boolean | undefined;
  as?: ElementType | undefined;
  baselineClassName?: string | undefined;
  children?: ReactNode;
}

export const GazaSurface = forwardRef<HTMLElement, GazaSurfaceProps>(
  (
    {
      family,
      target,
      recipe: customRecipe,
      selected = false,
      forceGrammar = false,
      as: Component = "div",
      baselineClassName,
      className,
      style,
      children,
      ...rest
    },
    ref,
  ) => {
    const { active, recipe: contextRecipe } = useSurfaceRecipe(family, target);
    const useGrammar = forceGrammar || active;
    const recipe = customRecipe ?? contextRecipe;

    // Baseline mode: if grammar is inactive, render standard accessible baseline
    if (!useGrammar) {
      return (
        <Component
          ref={ref as unknown as React.Ref<HTMLDivElement>}
          data-surface-target={target}
          className={
            baselineClassName !== undefined
              ? baselineClassName
              : cn(
                  "relative block w-full rounded-xl border border-border bg-card text-card-foreground text-start transition-colors",
                  selected && "border-primary ring-2 ring-primary/30",
                  className,
                )
          }
          style={style}
          {...rest}
        >
          {children}
        </Component>
      );
    }

    // Surface Grammar Mode: apply resolved tone, rail, radius, elevation
    const surfaceClasses = resolveSurfaceClasses(recipe, selected, className);
    const patternStyle = getPatternStyle(
      recipe.pattern,
      recipe.patternPlacement,
      recipe.tone,
      recipe.patternIntensity,
      recipe.patternScale,
    );

    return (
      <Component
        ref={ref as unknown as React.Ref<HTMLDivElement>}
        data-surface-target={target}
        data-surface-family={family}
        data-surface-frame={recipe.frame}
        data-surface-tone={recipe.tone}
        data-surface-selected={selected ? "true" : undefined}
        className={surfaceClasses}
        style={{ ...patternStyle, ...style }}
        {...rest}
      >
        {/* Optional Local Pattern Overlay based on Placement */}
        {recipe.patternPlacement !== "none" &&
        recipe.pattern !== "none" &&
        recipe.patternIntensity !== "off" ? (
          <SurfacePatternOverlay
            pattern={recipe.pattern}
            placement={recipe.patternPlacement}
            tone={recipe.tone}
            intensity={recipe.patternIntensity}
            scale={recipe.patternScale}
          />
        ) : null}

        {/* Inner Content */}
        {children}
      </Component>
    );
  },
);

GazaSurface.displayName = "GazaSurface";

function getPatternDefinition(pattern: string) {
  if (pattern === "gza-lattice") return GAZA_LATTICE_DEFINITION;
  if (pattern === "runway-datum") return RUNWAY_DATUM_DEFINITION;
  if (pattern === "pie-factory") return PIE_FACTORY_DEFINITION;
  return null;
}

function getPatternConfig(
  pattern: string,
  tone: SurfaceTone = "paper",
  intensity: PatternIntensity = "subtle",
  scale: PatternScale = "standard",
) {
  const def = getPatternDefinition(pattern);
  if (!def || intensity === "off" || pattern === "none") return null;

  const isDarkTone = tone === "ink" || tone === "olive";
  const color = isDarkTone ? "#FAF6EE" : "#073724";

  // Bounded intensity opacity
  const opacityMap: Record<PatternIntensity, number> = {
    off: 0,
    "very-subtle": isDarkTone ? 0.04 : 0.03,
    subtle: isDarkTone ? 0.08 : 0.06,
    present: isDarkTone ? 0.15 : 0.11,
  };
  const opacity = opacityMap[intensity];

  // Bounded scale sizing
  const scaleMultiplierMap: Record<PatternScale, number> = {
    small: 0.6,
    standard: 1.0,
    large: 1.5,
  };
  const scaleMultiplier = scaleMultiplierMap[scale];

  const width = Math.round(def.width * scaleMultiplier);
  const height = Math.round(def.height * scaleMultiplier);
  const size = `${width}px ${height}px`;
  const uri = createMotifDataUri(def, color, opacity);

  return { uri, size };
}

function getPatternStyle(
  pattern: string,
  placement: PatternPlacement,
  tone: SurfaceTone = "paper",
  intensity: PatternIntensity = "subtle",
  scale: PatternScale = "standard",
): CSSProperties {
  if (pattern === "none" || placement !== "watermark" || intensity === "off") return {};
  const cfg = getPatternConfig(pattern, tone, intensity, scale);
  if (!cfg) return {};

  return {
    backgroundImage: cfg.uri,
    backgroundRepeat: "repeat",
    backgroundSize: cfg.size,
  };
}

function SurfacePatternOverlay({
  pattern,
  placement,
  tone,
  intensity = "subtle",
  scale = "standard",
}: {
  pattern: string;
  placement: PatternPlacement;
  tone: SurfaceTone;
  intensity?: PatternIntensity | undefined;
  scale?: PatternScale | undefined;
}) {
  if (placement === "none" || placement === "watermark" || intensity === "off") return null;
  const cfg = getPatternConfig(pattern, tone, intensity, scale);
  if (!cfg) return null;

  const placementClasses = {
    none: "hidden",
    rail: "absolute inset-y-0 start-0 w-3.5 sm:w-4.5 pointer-events-none print:hidden forced-colors:hidden overflow-hidden",
    header: "absolute inset-x-0 top-0 h-10 sm:h-12 pointer-events-none print:hidden forced-colors:hidden [mask-image:linear-gradient(to_bottom,black,transparent)]",
    corner: "absolute top-0 end-0 size-24 sm:size-28 pointer-events-none print:hidden forced-colors:hidden [mask-image:radial-gradient(circle_at_top_right,black,transparent_70%)] rtl:[mask-image:radial-gradient(circle_at_top_left,black,transparent_70%)]",
    watermark: "hidden", // handled directly on container style
  }[placement];

  return (
    <div
      aria-hidden="true"
      data-surface-pattern={pattern}
      className={placementClasses}
      style={{
        backgroundImage: cfg.uri,
        backgroundRepeat: "repeat",
        backgroundSize: cfg.size,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SurfaceRail (Structural Edge)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceRail({
  accent = "brand",
  width = "standard",
  className,
}: {
  accent?: SurfaceAccent;
  width?: "compact" | "standard" | "wide";
  className?: string;
}) {
  const widthClass = {
    compact: "w-1",
    standard: "w-1.5",
    wide: "w-2.5",
  }[width];

  const colorClass = {
    none: "bg-border",
    brand: "bg-brand",
    clay: "bg-clay",
    brass: "bg-[#C7A46A]",
  }[accent];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 start-0 shrink-0 pointer-events-none",
        widthClass,
        colorClass,
        className,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SurfaceIndex (Compact Technical Indicator)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceIndex({
  label,
  code,
  accent = "none",
  className,
}: {
  label?: string;
  code?: string;
  accent?: SurfaceAccent;
  className?: string;
}) {
  const accentClass = ACCENT_TEXT_CLASSES[accent];

  return (
    <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", className)}>
      {code ? (
        <span
          className="code-id inline-block rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-bold text-foreground"
          dir="ltr"
        >
          {code}
        </span>
      ) : null}
      {label ? <span className={cn("uppercase tracking-wider text-[11px]", accentClass)}>{label}</span> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SurfaceLedger (Tabular Accounting & Pricing)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceLedger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("space-y-2 text-sm", className)}>{children}</dl>;
}

export function SurfaceLedgerRow({
  label,
  value,
  secondary,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt className="text-muted-foreground flex flex-col">
        <span>{label}</span>
        {secondary ? <span className="text-xs opacity-75">{secondary}</span> : null}
      </dt>
      <dd className="font-semibold text-foreground text-end" dir="ltr">
        {value}
      </dd>
    </div>
  );
}

export function SurfaceLedgerTotal({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between border-t border-border/80 pt-3 text-base font-bold",
        className,
      )}
    >
      <span className="text-foreground">{label}</span>
      <span className="text-2xl font-bold text-foreground" dir="ltr">
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SurfaceRule (Hairline Divider)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceRule({ className }: { className?: string }) {
  return <hr className={cn("my-4 border-0 border-t border-border/60", className)} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SurfaceMedia (Truth-Classified Media Frame)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceMedia({
  children,
  caption,
  provenance,
  truthClass,
  illustrativeLabel,
  aspect = "16:10",
  className,
  overlay,
  focalX,
  focalY,
  contextKind,
  treatment = "side",
}: {
  children: ReactNode;
  caption?: string | undefined;
  provenance?: string | undefined;
  truthClass?: TruthClass | undefined;
  illustrativeLabel?: string | undefined;
  aspect?: ("16:10" | "16:9" | "4:3" | "3:2" | "1:1" | "auto") | undefined;
  className?: string | undefined;
  overlay?: ("none" | "subtle" | "dark" | "gradient") | undefined;
  focalX?: number | undefined;
  focalY?: number | undefined;
  contextKind?: ("documentary" | "editorial-future" | "guide") | undefined;
  treatment?: ("cover" | "top" | "side" | "watermark" | "none") | undefined;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  // Treatment 'none' completely hides/omits media rendering
  if (treatment === "none") {
    return null;
  }

  // Runtime boundary check: AI concepts are strictly rejected in documentary contexts.
  // Never silently re-label AI imagery as documentary.
  if (contextKind === "documentary" && truthClass === "future-concept-ai") {
    return null;
  }

  const defaultIllustrativeLabel = isAr
    ? "دراسة تصورية · توضيحي"
    : "Concept Study · Illustrative";
  const badgeText = illustrativeLabel ?? defaultIllustrativeLabel;

  const aspectClass =
    treatment === "cover" || treatment === "watermark" || aspect === "auto"
      ? "size-full min-h-full"
      : {
          "16:10": "aspect-[16/10]",
          "16:9": "aspect-video",
          "4:3": "aspect-[4/3]",
          "3:2": "aspect-[3/2]",
          "1:1": "aspect-square",
        }[aspect];

  const overlayClass = {
    none: "",
    subtle: "bg-black/20",
    dark: "bg-black/60",
    gradient: "bg-gradient-to-t from-black/80 via-black/30 to-transparent",
  }[overlay ?? "none"];

  const treatmentClass = {
    cover: "relative w-full h-full",
    top: "w-full overflow-hidden",
    side: "relative size-full",
    watermark: "absolute inset-0 size-full pointer-events-none opacity-20 -z-10",
    none: "hidden",
  }[treatment ?? "side"];

  const showIllustrativeBadge = truthClass === "future-concept-ai";
  const showBrandBadge = truthClass === "brand-mark";

  return (
    <figure
      data-treatment={treatment ?? "side"}
      className={cn("overflow-hidden rounded-xl border border-border bg-ink", treatmentClass, className)}
    >
      <div className={cn("relative w-full overflow-hidden bg-ink", aspectClass)}>
        {children}
        {overlayClass ? (
          <div
            data-testid="media-overlay"
            className={cn("absolute inset-0 pointer-events-none z-10", overlayClass)}
            aria-hidden="true"
          />
        ) : null}
        {showIllustrativeBadge ? (
          <span
            data-testid="truth-disclosure-badge"
            className="absolute bottom-2.5 start-3 z-20 rounded bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-ink-muted uppercase tracking-wider backdrop-blur-xs"
          >
            {badgeText}
          </span>
        ) : showBrandBadge ? (
          <span
            data-testid="truth-disclosure-badge"
            className="absolute bottom-2.5 start-3 z-20 rounded bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-ink-muted uppercase tracking-wider backdrop-blur-xs"
          >
            {isAr ? "شعار وهوية معتمدة" : "Official Brand Asset"}
          </span>
        ) : null}
      </div>
      {caption || provenance ? (
        <figcaption className="p-3 text-xs leading-relaxed text-muted-foreground border-t border-border/60 bg-card">
          {caption ? <p className="text-foreground font-medium">{caption}</p> : null}
          {provenance ? <p className="mt-0.5 font-mono text-[10px] opacity-75">{provenance}</p> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SurfaceDatum (Aeronautical Route Datum Axis)
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceDatum({
  originCode,
  destinationCode,
  duration,
  className,
}: {
  originCode: string;
  destinationCode: string;
  duration?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-1 text-muted-foreground", className)}
      aria-hidden="true"
    >
      {duration ? <span className="numeral text-xs">{duration}</span> : null}
      <div className="flex w-20 items-center gap-1 sm:w-28">
        <span className="h-px flex-1 bg-border/80" />
        <Plane className="size-3.5 text-brand rtl:-scale-x-100" />
        <span className="h-px flex-1 bg-border/80" />
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono">
        <span dir="ltr">{originCode}</span>
        <ArrowRight className="size-3 rtl:rotate-180" />
        <span dir="ltr">{destinationCode}</span>
      </div>
    </div>
  );
}
