/**
 * Gaza Gateway — Cinematic Engine Contracts & Common Lifecycle Types
 *
 * Defines the common lifecycle boundary for both Seekable MP4 and Bounded Canvas/WebP
 * rendering engines, ensuring identical fallback and accessibility semantics.
 */

import type {
  CinematicPhase,
  CinematicManifest,
} from "@/lib/media/cinematic-manifest";

export type CinematicEngine = "mp4" | "canvas" | "static";

export type CinematicSourceMode = "desktop" | "mobile-portrait" | "mobile-landscape";

export const CINEMATIC_BREAKPOINTS = {
  desktop: "(min-width: 1024px)",
  // Wider portrait tablets use the wide crop: a phone crop would cut off the tower vertically.
  mobilePortrait: "(max-width: 639px) and (orientation: portrait)",
  mobileLandscape: "(max-width: 1023px) and (orientation: landscape), (min-width: 640px) and (max-width: 1023px)",
} as const;

/**
 * Pure helper to determine cinematic source mode based on media query matches.
 */
export function resolveCinematicSourceMode(
  matchesDesktop: boolean,
  matchesPortrait: boolean,
): CinematicSourceMode {
  if (matchesDesktop) {
    return "desktop";
  }
  if (matchesPortrait) {
    return "mobile-portrait";
  }
  return "mobile-landscape";
}

/**
 * Reads current window matchMedia status. Safe for SSR.
 */
export function resolveCurrentCinematicSourceMode(): CinematicSourceMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "desktop";
  }
  const isDesktop = window.matchMedia(CINEMATIC_BREAKPOINTS.desktop).matches;
  const isPortrait = window.matchMedia(CINEMATIC_BREAKPOINTS.mobilePortrait).matches;
  return resolveCinematicSourceMode(isDesktop, isPortrait);
}

/**
 * Resolves active video source URL for given mode with clean fallbacks.
 */
export function resolveCinematicVideoSrc(
  manifest: CinematicManifest,
  mode: CinematicSourceMode,
): string {
  if (mode === "mobile-portrait") {
    return manifest.mobilePortrait.video.src;
  }
  if (mode === "mobile-landscape") {
    return manifest.mobileLandscape.video.src;
  }
  return manifest.derivatives.desktop720p.src;
}

export interface CinematicRendererProps {
  /** Normalized scroll progress from 0.0 (day) to 1.0 (night) */
  progress: number;
  /** True when the section is near or in the viewport */
  isNearViewport: boolean;
  /** True when user prefers reduced motion or data saver */
  reducedMotion?: boolean | undefined;
  /** Callback when first frame / metadata is ready */
  onReady?: (() => void) | undefined;
  /** Callback when playback engine encounters an unrecoverable error */
  onError?: ((error: string) => void) | undefined;
  /** Callback indicating whether an asynchronous seek is currently in flight */
  onSeekStateChange?: ((seeking: boolean) => void) | undefined;
  /** Current active phase based on progress */
  activePhase?: CinematicPhase | undefined;
  /** URL for static SSR fallback poster */
  posterSrc: string;
  /** Additional class names for layout */
  className?: string | undefined;
}

export interface CinematicRendererHandle {
  /** Force teardown / resource release */
  dispose: () => void;
  /** Current ready status */
  isReady: boolean;
}
