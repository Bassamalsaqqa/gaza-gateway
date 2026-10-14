import { useEffect, useRef, useState, useMemo, useCallback, lazy, Suspense, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { CinematicEngine } from "./cinematic-types";
import { CINEMATIC_MANIFEST, type CinematicPhase } from "@/lib/media/cinematic-manifest";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FutureCinematicSectionProps {
  forcedEngine?: ("mp4" | "canvas" | "static") | undefined;
  hero?: ReactNode;
  skipTarget?: string;
}

/**
 * MP4 is the owner-selected renderer. Canvas remains a development comparison.
 */
const LazyVideoScrub = lazy(() => import("./video-scrub-renderer").then((m) => ({ default: m.VideoScrubRenderer })));

const LazyFrameSequence = import.meta.env.DEV
  ? lazy(() => import("./frame-sequence-renderer").then((m) => ({ default: m.FrameSequenceRenderer })))
  : null;

/**
 * Gaza Gateway — Future Airport Cinematic Section
 *
 * Implements:
 * - SSR/static poster & milestone fallback; MP4 enhancement after hydration
 * - Both A/B engines (MP4 and Canvas) dynamically imported in DEV only
 * - Dynamic site header measurement (72px baseline + ResizeObserver) with CSS variable sync
 * - Zero 260svh empty sticky track in static mode
 * - Full 16:9 contained geometry avoiding terminal canopy or tower cropping
 * - Restrained typography and design tokens without generic blues/purples/bg-black/text-white
 * - Semantic LTR numerals on technical identifiers
 * - Keyboard & visible skip targeting #future-chapters with preventDefault and tabindex=-1
 * - Mandatory 'future-concept-ai' truth disclosure
 * - Note on SSR/no-JS: TanStack Start server rendering supplies semantic initial content;
 *   baseline static fallback renders semantic poster and milestones in ordinary flow.
 */
export function FutureCinematicSection({ forcedEngine, hero, skipTarget = "future-chapters" }: FutureCinematicSectionProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  // Hydration & environment detection
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [lowMemory, setLowMemory] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return 64;
    return 72;
  });
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Owner chose MP4; environment/decoder failures retain the ordinary-flow fallback.
  const initialEngine: CinematicEngine = import.meta.env.DEV
    ? (forcedEngine === "canvas" ? "canvas" : forcedEngine === "static" ? "static" : "mp4")
    : "mp4";

  const [engine, setEngine] = useState<CinematicEngine>(initialEngine);
  const [seekActive, setSeekActive] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const trackRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Accessible skip navigation handler: prevents duplicate default jump, focuses #future-chapters
  const handleSkipToChapters = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const el = document.getElementById(skipTarget);
    if (el) {
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [skipTarget]);

  // Client hydration, media query detection, and live header observation
  useEffect(() => {
    setMounted(true);

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handleMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handleMotion);

    // Save-Data detection & subscription with change cleanup if supported
    let handleConnChange: (() => void) | null = null;
    let connObj: (EventTarget & { saveData?: boolean; removeEventListener?: (t: string, cb: () => void) => void }) | null = null;
    if ("connection" in navigator) {
      const conn = (navigator as Navigator & {
        connection?: EventTarget & {
          saveData?: boolean;
          addEventListener?: (type: string, listener: EventListener) => void;
          removeEventListener?: (type: string, listener: EventListener) => void;
        };
      }).connection;
      if (conn) {
        connObj = conn;
        setSaveData(Boolean(conn.saveData));
        handleConnChange = () => setSaveData(Boolean(conn.saveData));
        conn.addEventListener?.("change", handleConnChange);
      }
    }

    // Low device memory detection (<= 2GB RAM)
    if ("deviceMemory" in navigator) {
      const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      if (typeof dm === "number" && dm <= 2) {
        setLowMemory(true);
      }
    }

    // Measure live header height (72px desktop / 64px mobile baseline) and set CSS variable
    const measureHeader = () => {
      const headerEl = document.querySelector("header") || document.querySelector("[data-slot='site-header']");
      if (headerEl) {
        const h = headerEl.getBoundingClientRect().height;
        if (h > 0) {
          const roundedH = Math.round(h);
          setHeaderHeight(roundedH);
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--header-height", `${roundedH}px`);
          }
          return;
        }
      }
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      const fallbackH = isMobile ? 64 : 72;
      setHeaderHeight(fallbackH);
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--header-height", `${fallbackH}px`);
      }
    };
    measureHeader();

    const headerEl = document.querySelector("header") || document.querySelector("[data-slot='site-header']");
    let ro: ResizeObserver | null = null;
    if (headerEl && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measureHeader());
      ro.observe(headerEl);
    }
    window.addEventListener("resize", measureHeader);
    window.addEventListener("orientationchange", measureHeader);

    // In DEV, read search params for engine override
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryEngine = params.get("engine");
      if (queryEngine === "canvas" || queryEngine === "mp4" || queryEngine === "static") {
        setEngine(queryEngine);
      }
    }

    return () => {
      mql.removeEventListener("change", handleMotion);
      if (connObj && handleConnChange) {
        connObj.removeEventListener?.("change", handleConnChange);
      }
      ro?.disconnect();
      window.removeEventListener("resize", measureHeader);
      window.removeEventListener("orientationchange", measureHeader);
    };
  }, []);

  // Determine if static mode applies
  const isStaticMode =
    !mounted ||
    engine === "static" ||
    reducedMotion ||
    saveData ||
    lowMemory ||
    Boolean(playbackError);

  // Viewport proximity observation on actual rendered interactive stage (not entire 260svh track)
  useEffect(() => {
    if (isStaticMode) {
      setIsNearViewport(false);
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      setIsNearViewport(false);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsNearViewport(Boolean(entry?.isIntersecting));
      },
      { rootMargin: "100px 0px 100px 0px" },
    );

    observer.observe(stage);
    return () => observer.disconnect();
  }, [isStaticMode, engine]);

  // Natural scroll tracking (RAF coalesced, no scroll lock, recomputes on resize/orientation)
  useEffect(() => {
    if (isStaticMode) return;

    let rafId: number | null = null;

    const handleScrollOrResize = () => {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const track = trackRef.current;
        if (!track) return;

        const rect = track.getBoundingClientRect();
        const trackHeight = rect.height;
        const viewportHeight = window.innerHeight;

        const distanceScrolled = headerHeight - rect.top;
        const maxScrollableDistance = trackHeight - (viewportHeight - headerHeight);

        if (maxScrollableDistance <= 0) {
          setScrollProgress(0);
          return;
        }

        const normalized = Math.max(0, Math.min(1, distanceScrolled / maxScrollableDistance));
        setScrollProgress(normalized);
      });
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("orientationchange", handleScrollOrResize);
    handleScrollOrResize();

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("orientationchange", handleScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isStaticMode, headerHeight]);

  // Derive active story phase based on current scroll progress
  const activePhase: CinematicPhase = useMemo(() => {
    const phases = CINEMATIC_MANIFEST.phases;
    const fallback = phases[0]!;
    for (const phase of phases) {
      if (scrollProgress >= phase.progressStart && scrollProgress <= phase.progressEnd) {
        return phase;
      }
    }
    return phases[phases.length - 1] ?? fallback;
  }, [scrollProgress]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Static Presentation (No-JS and Accessibility Fallback)
  // ─────────────────────────────────────────────────────────────────────────────
  if (isStaticMode) {
    return (
      <section
        aria-label={isAr ? "معرض التصور المستقبلي للمطار" : "Future Airport Concept Visualizations"}
        className="border-y border-border/80 bg-ink py-12 text-ink-foreground"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {hero && <div className="mb-12">{hero}</div>}
          {/* Section Heading & AI Disclosure */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-xl font-bold tracking-tight text-ink-foreground sm:text-2xl">
              {isAr ? "تحولات الإضاءة من النهار إلى الليل" : "Daylight-to-Night Conceptual Study"}
            </h2>
            <p className="max-w-md text-xs text-ink-muted">
              {isAr ? CINEMATIC_MANIFEST.disclosure.ar : CINEMATIC_MANIFEST.disclosure.en}
            </p>
          </div>

          {/* Primary High-Quality Milestone Poster */}
          <div className="mt-6 aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-ink/90 shadow-md">
            <img
              src={CINEMATIC_MANIFEST.poster.src}
              alt={isAr ? CINEMATIC_MANIFEST.poster.altAr : CINEMATIC_MANIFEST.poster.altEn}
              width={CINEMATIC_MANIFEST.poster.width}
              height={CINEMATIC_MANIFEST.poster.height}
              loading="eager"
              fetchPriority="high"
              className="size-full object-contain"
            />
          </div>

          {/* Milestone Study Grid */}
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {(Object.values(CINEMATIC_MANIFEST.milestones)).map((milestone) => (
              <div
                key={milestone.key}
                className="overflow-hidden rounded-xl border border-border/60 bg-ink/80 shadow-xs"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-ink">
                  <img
                    src={milestone.src}
                    alt={isAr ? milestone.labelAr : milestone.labelEn}
                    width={milestone.width}
                    height={milestone.height}
                    loading="lazy"
                    className="size-full object-contain"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-ink-foreground">
                    {isAr ? milestone.labelAr : milestone.labelEn}
                  </h3>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    {isAr ? milestone.captionAr : milestone.captionEn}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Skip link target reference & DEV engine switcher */}
          <div className="mt-8 flex flex-col items-center gap-4">
            <a
              href={"#" + skipTarget}
              onClick={handleSkipToChapters}
              className="inline-flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink-foreground underline underline-offset-4"
            >
              <span>{isAr ? "المتابعة إلى الفصول المعمارية" : "Continue to architectural chapters"}</span>
              <ArrowDown className="size-3.5" aria-hidden="true" />
            </a>

          </div>
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Full-width Interactive Presentation (MP4; Canvas development comparison)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {hero && <div className="relative z-20 bg-ink px-4 py-6 text-ink-foreground lg:absolute lg:inset-x-0 lg:top-20 lg:bg-transparent lg:px-12 lg:py-0">{hero}</div>}
    <section
      ref={trackRef}
      aria-label={isAr ? "العرض البصري التفاعلي للمطار المستقبلي" : "Interactive Future Airport Film"}
      className="relative h-[260svh] bg-ink text-ink-foreground"
    >
      {/* Accessible keyboard skip link */}
      <a
        href={"#" + skipTarget}
        onClick={handleSkipToChapters}
        className="sr-only focus:not-sr-only focus:absolute focus:top-24 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {isAr ? "تخطي العرض المرئي إلى الفصول المعمارية" : "Skip cinematic sequence to architectural chapters"}
      </a>

      {/* Sticky Inner Cinematic Stage matching live header height */}
      <div
        ref={stageRef}
        style={{
          top: `${headerHeight}px`,
          height: `calc(100svh - ${headerHeight}px)`,
        }}
        className="sticky isolate overflow-hidden"
      >
        <div className="relative h-full w-full">
          {/* Top Bar: LTR Phase Numeral, Segmented Progress, and Skip Link */}
          <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-b from-ink/90 to-transparent px-4 py-5 text-xs text-ink-foreground sm:px-8 lg:px-12">
            <div className="flex items-center gap-2">
              <span dir="ltr" className="numeral font-semibold text-ink-foreground">
                {activePhase.numeral} / 04
              </span>
              <span className="text-ink-muted/80">
                — {isAr ? activePhase.titleAr : activePhase.titleEn}
              </span>
            </div>

            {/* Discreet Segmented Progress Indicator */}
            <div
              role="progressbar"
              aria-valuenow={Math.round(scrollProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={isAr ? "مستوى تقدم تسلسل الإضاءة" : "Lighting sequence progress"}
              className="flex items-center gap-1.5"
            >
              {CINEMATIC_MANIFEST.phases.map((p) => {
                const isCurrent = p.id === activePhase.id;
                const isPassed = scrollProgress > p.progressEnd;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      isCurrent
                        ? "w-8 bg-clay"
                        : isPassed
                          ? "w-4 bg-primary"
                          : "w-3 bg-border",
                    )}
                  />
                );
              })}
            </div>

            {/* Skip anchor link - clearly visible on mobile & desktop */}
            <a
              href={"#" + skipTarget}
              onClick={handleSkipToChapters}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-sand hover:text-sand-deep transition-colors focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span>{hero ? (isAr ? "تخطي إلى الحجز" : "Skip to booking") : (isAr ? "تخطي إلى الفصول" : "Skip to chapters")}</span>
              <ArrowDown className="size-3" aria-hidden="true" />
            </a>
          </div>

          {/* Full-width scene; mobile preserves the source composition. */}
          <div className="absolute inset-0 z-0 overflow-hidden bg-ink">
            {hero && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 hidden bg-gradient-to-r from-ink/85 via-ink/30 to-transparent lg:block rtl:bg-gradient-to-l" />}
            <Suspense
              fallback={
                <img
                  src={CINEMATIC_MANIFEST.poster.src}
                  alt={isAr ? CINEMATIC_MANIFEST.poster.altAr : CINEMATIC_MANIFEST.poster.altEn}
                  width={CINEMATIC_MANIFEST.poster.width}
                  height={CINEMATIC_MANIFEST.poster.height}
                  className="size-full object-contain"
                />
              }
            >
              {engine === "mp4" && LazyVideoScrub && (
                <LazyVideoScrub
                  progress={scrollProgress}
                  isNearViewport={isNearViewport}
                  posterSrc={CINEMATIC_MANIFEST.poster.src}
                  onSeekStateChange={setSeekActive}
                  onError={(err) => setPlaybackError(err)}
                />
              )}
              {engine === "canvas" && LazyFrameSequence && (
                <LazyFrameSequence
                  progress={scrollProgress}
                  isNearViewport={isNearViewport}
                  posterSrc={CINEMATIC_MANIFEST.poster.src}
                  onSeekStateChange={setSeekActive}
                  onError={(err) => setPlaybackError(err)}
                />
              )}
            </Suspense>

            {/* Subdued seek activity indicator */}
            {seekActive && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] text-ink-foreground/80 border border-border/60 backdrop-blur-sm"
              >
                {isAr ? "مزامنة الإطارات..." : "Syncing..."}
              </div>
            )}
          </div>

          {/* Bottom Narrative Caption & AI Concept Disclosure */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 bg-gradient-to-t from-ink/95 via-ink/70 to-transparent px-4 pb-5 pt-10 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-12">
            <div className="max-w-xl">
              <p className="text-xs text-ink-muted sm:text-sm leading-relaxed">
                {isAr ? activePhase.descriptionAr : activePhase.descriptionEn}
              </p>
            </div>

            {/* Mandatory Truth Policy Disclosure */}
            <p className="text-[11px] text-ink-muted/80 max-w-sm sm:text-end">
              {isAr ? CINEMATIC_MANIFEST.disclosure.ar : CINEMATIC_MANIFEST.disclosure.en}
            </p>
          </div>

        </div>
      </div>
    </section>
    </div>
  );
}
