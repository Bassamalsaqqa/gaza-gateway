/**
 * Gaza Gateway — Cinematic Engine Contracts & Common Lifecycle Types
 *
 * Defines the common lifecycle boundary for both Seekable MP4 and Bounded Canvas/WebP
 * rendering engines, ensuring identical fallback and accessibility semantics.
 */

import type { CinematicPhase } from "@/lib/media/cinematic-manifest";

export type CinematicEngine = "mp4" | "canvas" | "static";

export interface CinematicRendererProps {
  /** Normalized scroll progress from 0.0 (day) to 1.0 (night) */
  progress: number;
  /** True when the section is near or in the viewport */
  isNearViewport: boolean;
  /** True when user prefers reduced motion or data saver */
  reducedMotion?: boolean;
  /** Callback when first frame / metadata is ready */
  onReady?: () => void;
  /** Callback when playback engine encounters an unrecoverable error */
  onError?: (error: string) => void;
  /** Callback indicating whether an asynchronous seek is currently in flight */
  onSeekStateChange?: (seeking: boolean) => void;
  /** Current active phase based on progress */
  activePhase?: CinematicPhase;
  /** URL for static SSR fallback poster */
  posterSrc: string;
  /** Additional class names for layout */
  className?: string;
}

export interface CinematicRendererHandle {
  /** Force teardown / resource release */
  dispose: () => void;
  /** Current ready status */
  isReady: boolean;
}
