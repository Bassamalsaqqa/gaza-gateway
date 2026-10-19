import { useEffect, useRef, useState } from "react";
import type { CinematicRendererProps } from "./cinematic-types";
import { CINEMATIC_MANIFEST } from "@/lib/media/cinematic-manifest";
import { cn } from "@/lib/utils";
import {
  CinematicPoster,
  resolveCinematicVideoSrc,
  useCinematicSourceMode,
} from "./cinematic-poster";

import { attachVideoScrubLifecycle } from "./video-scrub-controller";

interface InnerVideoScrubProps {
  videoSrc: string;
  progress: number;
  isNearViewport: boolean;
  onReady?: (() => void) | undefined;
  onError?: ((error: string) => void) | undefined;
  onSeekStateChange?: ((seeking: boolean) => void) | undefined;
  ready: boolean;
}

/**
 * Keyed single-decoder video scrub engine.
 * Ensures complete teardown and resource release of previous decoders before new ones initialize.
 */
function InnerVideoScrub({
  videoSrc,
  progress,
  isNearViewport,
  onReady,
  onError,
  onSeekStateChange,
  ready,
}: InnerVideoScrubProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latest = useRef({ progress, onReady, onError, onSeekStateChange });
  latest.current = { progress, onReady, onError, onSeekStateChange };
  const queue = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isNearViewport) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    const controller = attachVideoScrubLifecycle(video, {
      videoSrc,
      getProgress: () => latest.current.progress,
      onReady: () => latest.current.onReady?.(),
      onError: (err) => latest.current.onError?.(err),
      onSeekStateChange: (seeking) => latest.current.onSeekStateChange?.(seeking),
    });

    queue.current = () => controller.notifyProgress();

    return () => {
      queue.current = null;
      controller.dispose();
    };
  }, [isNearViewport, videoSrc]);

  useEffect(() => {
    queue.current?.();
  }, [progress]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      preload="none"
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        "size-full object-cover object-center select-none",
        ready ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * DEV comparison & background video scrub renderer.
 * One latest target, one decoder lifecycle, bounded seeking.
 * Manages responsive crop source selection and ensures zero stale frame reveals.
 */
export function VideoScrubRenderer({
  progress,
  isNearViewport,
  onReady,
  onError,
  onSeekStateChange,
  posterSrc = CINEMATIC_MANIFEST.poster.src,
  className,
}: CinematicRendererProps) {
  const detectedMode = useCinematicSourceMode();
  const activeVideoSrc = resolveCinematicVideoSrc(CINEMATIC_MANIFEST, detectedMode);

  const [readySource, setReadySource] = useState<string | null>(null);

  // Synchronous ready-source identity gating: only ready if activeVideoSrc matches decoded source
  const ready = isNearViewport && readySource === activeVideoSrc;

  // Invalidate ready state synchronously whenever active source changes or viewport presence drops
  const [prevTracked, setPrevTracked] = useState({ activeVideoSrc, isNearViewport });
  if (
    prevTracked.activeVideoSrc !== activeVideoSrc ||
    prevTracked.isNearViewport !== isNearViewport
  ) {
    setPrevTracked({ activeVideoSrc, isNearViewport });
    if (!isNearViewport || prevTracked.activeVideoSrc !== activeVideoSrc) {
      setReadySource(null);
    }
  }

  const handleReady = () => {
    setReadySource(activeVideoSrc);
    onReady?.();
  };

  return (
    <div className={cn("relative size-full overflow-hidden bg-ink", className)}>
      <CinematicPoster
        posterSrc={posterSrc}
        className={cn(
          "absolute inset-0 size-full pointer-events-none",
          ready ? "opacity-0" : "opacity-100",
        )}
        imgClassName={ready ? "opacity-0" : "opacity-100"}
      />
      {isNearViewport && (
        <InnerVideoScrub
          key={activeVideoSrc}
          videoSrc={activeVideoSrc}
          progress={progress}
          isNearViewport={isNearViewport}
          onReady={handleReady}
          onError={onError}
          onSeekStateChange={onSeekStateChange}
          ready={ready}
        />
      )}
    </div>
  );
}
