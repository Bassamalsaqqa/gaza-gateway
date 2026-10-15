import { useEffect, useState } from "react";
import { CINEMATIC_MANIFEST, type CinematicManifest } from "@/lib/media/cinematic-manifest";
import {
  CINEMATIC_BREAKPOINTS,
  resolveCinematicSourceMode,
  resolveCurrentCinematicSourceMode,
  resolveCinematicVideoSrc,
  type CinematicSourceMode,
} from "./cinematic-types";
import { cn } from "@/lib/utils";

export {
  CINEMATIC_BREAKPOINTS,
  resolveCinematicSourceMode,
  resolveCurrentCinematicSourceMode,
  resolveCinematicVideoSrc,
};

/**
 * Reactive hook that listens ONLY to meaningful breakpoint and orientation changes.
 * Height changes from dynamic mobile browser chrome (URL bar expand/collapse) do NOT trigger updates.
 */
export function useCinematicSourceMode(overrideMode?: CinematicSourceMode | undefined): CinematicSourceMode {
  const [sourceMode, setSourceMode] = useState<CinematicSourceMode>(() =>
    overrideMode ?? resolveCurrentCinematicSourceMode(),
  );

  useEffect(() => {
    if (overrideMode) {
      setSourceMode(overrideMode);
      return undefined;
    }
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mqlDesktop = window.matchMedia(CINEMATIC_BREAKPOINTS.desktop);
    const mqlPortrait = window.matchMedia(CINEMATIC_BREAKPOINTS.mobilePortrait);

    const updateMode = () => {
      const next = resolveCinematicSourceMode(mqlDesktop.matches, mqlPortrait.matches);
      setSourceMode((prev) => (prev !== next ? next : prev));
    };

    updateMode();

    if (typeof mqlDesktop.addEventListener === "function") {
      mqlDesktop.addEventListener("change", updateMode);
      mqlPortrait.addEventListener("change", updateMode);
      return () => {
        mqlDesktop.removeEventListener("change", updateMode);
        mqlPortrait.removeEventListener("change", updateMode);
      };
    } else if (typeof mqlDesktop.addListener === "function") {
      mqlDesktop.addListener(updateMode);
      mqlPortrait.addListener(updateMode);
      return () => {
        mqlDesktop.removeListener(updateMode);
        mqlPortrait.removeListener(updateMode);
      };
    }

    return undefined;
  }, [overrideMode]);

  return overrideMode ?? sourceMode;
}

export interface CinematicPosterProps {
  className?: string | undefined;
  imgClassName?: string | undefined;
  alt?: string | undefined;
  loading?: ("eager" | "lazy") | undefined;
  fetchPriority?: ("high" | "low" | "auto") | undefined;
  posterSrc?: string | undefined;
  manifest?: CinematicManifest | undefined;
}

/**
 * Shared picture-based poster component.
 * Renders matching media queries for portrait and landscape so mobile devices
 * never download the desktop 16:9 poster on SSR/initial load.
 * All states enforce object-cover object-center without stretching or letterbox bars.
 */
export function CinematicPoster({
  className,
  imgClassName,
  alt = "",
  loading = "eager",
  fetchPriority,
  posterSrc,
  manifest = CINEMATIC_MANIFEST,
}: CinematicPosterProps) {
  const desktopPoster = manifest.poster;
  const portraitPoster = manifest.mobilePortrait.poster;
  const landscapePoster = manifest.mobileLandscape.poster;

  return (
    <picture
      className={cn("block size-full overflow-hidden", className)}
      aria-hidden="true"
    >
      <source
        media={CINEMATIC_BREAKPOINTS.mobilePortrait}
        srcSet={portraitPoster.src}
        width={portraitPoster.width}
        height={portraitPoster.height}
      />
      <source
        media={CINEMATIC_BREAKPOINTS.mobileLandscape}
        srcSet={landscapePoster.src}
        width={landscapePoster.width}
        height={landscapePoster.height}
      />
      <img
        src={posterSrc ?? desktopPoster.src}
        alt={alt}
        aria-hidden="true"
        width={desktopPoster.width}
        height={desktopPoster.height}
        loading={loading}
        fetchPriority={fetchPriority}
        className={cn("size-full object-cover object-center", imgClassName)}
      />
    </picture>
  );
}
