import { useEffect, useState, lazy, Suspense } from "react";
import { CINEMATIC_MANIFEST } from "../../../lib/media/cinematic-manifest.ts";
import { cn } from "@/lib/utils";
import { computeHomeCinematicProgress } from "./cinematic-scroll.ts";
import { CinematicPoster } from "./cinematic-poster.tsx";

/**
 * Lazy loaded MP4 scrub renderer: loaded only on client-visible Home.
 * Reuses the imperative, single-decoder VideoScrubRenderer with 36ms seek coalescing.
 */
const LazyVideoScrub = lazy(() =>
  import("./video-scrub-renderer").then((m) => ({ default: m.VideoScrubRenderer })),
);

export interface HomeCinematicBackdropProps {
  className?: string;
}

/**
 * Gaza Gateway — Homepage Continuous Cinematic Backdrop
 *
 * Provides a continuous viewport-filling cinematic background behind the entire homepage.
 * All editorial sections, cards, and consoles float above it in z-10 with open visual space.
 *
 * Invariants:
 * - Distributed across the FULL native document scroll (0.0 at top hero, 1.0 at footer end).
 * - Progress lives in this isolated component; does NOT cause the homepage tree to re-render.
 * - Passive RAF-coalesced scroll listener.
 * - ResizeObserver recomputes bounds when lazy images load, forms expand, or content mutates.
 * - Initial document.visibilityState synced; turning reduce-motion on/off while hidden never loads.
 * - On visibility restore, latest fullpage progress is recomputed; zero decoder when hidden.
 * - Decorative media never captures clicks or adds screen-reader announcements.
 */
export function HomeCinematicBackdrop({ className }: HomeCinematicBackdropProps) {
  // Hydration & environment capability detection
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [lowMemory, setLowMemory] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Synced actual document.visibilityState (handles background tabs cleanly)
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  // Isolated scroll progress state: does NOT trigger re-renders of outer Home content
  const [progress, setProgress] = useState(0);

  // Independent document visibility listener (runs in both static and dynamic mode)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === "visible");
    };
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Preference and hardware capability listeners
  useEffect(() => {
    setMounted(true);

    // Reduced motion preference
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handleMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handleMotion);

    // Network Save-Data detection & subscription
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

    return () => {
      mql.removeEventListener("change", handleMotion);
      if (connObj && handleConnChange) {
        connObj.removeEventListener?.("change", handleConnChange);
      }
    };
  }, []);

  // Determine if static poster mode applies
  const isStaticMode =
    !mounted ||
    reducedMotion ||
    saveData ||
    lowMemory ||
    Boolean(playbackError);

  // Continuous Document Scroll Tracking & Dynamic Resize Observation
  useEffect(() => {
    if (isStaticMode || !isVisible) return;

    let rafId: number | null = null;

    const measureAndSync = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (typeof document === "undefined" || typeof window === "undefined") return;
        const doc = document.scrollingElement || document.documentElement;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const next = computeHomeCinematicProgress(scrollY, doc.scrollHeight, window.innerHeight);
        setProgress(next);
      });
    };

    // Passive scroll listener
    window.addEventListener("scroll", measureAndSync, { passive: true });
    window.addEventListener("resize", measureAndSync);
    window.addEventListener("orientationchange", measureAndSync);

    // ResizeObserver tracks lazy images, CMS updates, expandable tables, and footer layout shifts
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && document.documentElement) {
      ro = new ResizeObserver(() => measureAndSync());
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }

    // Restore latest fullpage progress immediately when tab becomes visible
    measureAndSync();

    return () => {
      window.removeEventListener("scroll", measureAndSync);
      window.removeEventListener("resize", measureAndSync);
      window.removeEventListener("orientationchange", measureAndSync);
      ro?.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isStaticMode, isVisible]);

  const posterSrc = CINEMATIC_MANIFEST.poster.src;

  return (
    <div
      data-slot="home-cinematic-backdrop"
      className={cn(
        "fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-ink",
        className,
      )}
      aria-hidden="true"
    >
      {/* Visual media layer: static poster or scrubable MP4 video */}
      <div className="relative size-full overflow-hidden">
        {isStaticMode ? (
          <CinematicPoster
            loading="eager"
            fetchPriority="high"
            className="size-full"
          />
        ) : (
          <Suspense
            fallback={
              <CinematicPoster
                loading="eager"
                fetchPriority="high"
                className="size-full"
              />
            }
          >
            <LazyVideoScrub
              progress={progress}
              isNearViewport={isVisible}
              posterSrc={posterSrc}
              onError={(err) => setPlaybackError(err)}
              className="size-full"
            />
          </Suspense>
        )}
      </div>

      {/* Atmospheric Vignette Gradients (blends header, footer, and edges smoothly) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32 sm:h-48 bg-gradient-to-b from-ink/90 via-ink/40 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 sm:h-64 bg-gradient-to-t from-ink/95 via-ink/50 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, color-mix(in srgb, var(--ink) 75%, transparent) 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-ink/20"
        aria-hidden="true"
      />
    </div>
  );
}
