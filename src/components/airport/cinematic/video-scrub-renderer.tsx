import { useEffect, useRef, useState } from "react";
import type { CinematicRendererProps } from "./cinematic-types";
import { CINEMATIC_MANIFEST } from "@/lib/media/cinematic-manifest";
import { cn } from "@/lib/utils";
import {
  CinematicPoster,
  resolveCinematicVideoSrc,
  useCinematicSourceMode,
} from "./cinematic-poster";

const SEEK_INTERVAL_MS = 36;
const LOAD_TIMEOUT_MS = 5000;
const SEEK_TIMEOUT_MS = 1500;
// One 24fps frame plus the existing seek deadband accommodates frame quantization.
const PRESENTED_FRAME_TOLERANCE_SECONDS = 0.075;

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
    let active = true, decoded = false, pending = true, lastSeek = -Infinity;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let frameCallback: number | undefined;
    let presentedTime: number | undefined;
    const supportsFrameCallbacks = typeof video.requestVideoFrameCallback === "function";
    const targetTime = () => Math.max(0, Math.min(video.duration - 0.05, latest.current.progress * video.duration));
    const fail = () => {
      if (!active) return;
      active = false;
      clearTimeout(retry); clearTimeout(deadline); clearTimeout(loadDeadline);
      latest.current.onSeekStateChange?.(false);
      latest.current.onError?.("The video could not be decoded in time.");
    };
    const flush = () => {
      if (!active || !pending || video.readyState < 1 || !Number.isFinite(video.duration)) return;
      if (video.seeking) return; // Existing seek deadline bounds native decoder waits.
      const target = targetTime();
      if (Math.abs(video.currentTime - target) < 0.03) {
        pending = false; latest.current.onSeekStateChange?.(false); return;
      }
      const remaining = SEEK_INTERVAL_MS - (performance.now() - lastSeek);
      if (remaining > 0) { clearTimeout(retry); retry = setTimeout(flush, remaining); return; }
      pending = false; lastSeek = performance.now();
      latest.current.onSeekStateChange?.(true);
      clearTimeout(deadline); deadline = setTimeout(fail, SEEK_TIMEOUT_MS);
      try { video.currentTime = target; } catch { fail(); }
    };
    const markDecoded = () => {
      if (!active || decoded || pending || video.seeking || video.readyState < 2 || !Number.isFinite(video.duration)) return;
      const target = targetTime();
      if (Math.abs(video.currentTime - target) >= 0.03) return;
      if (supportsFrameCallbacks && (presentedTime === undefined || Math.abs(presentedTime - target) > PRESENTED_FRAME_TOLERANCE_SECONDS)) return;
      decoded = true; clearTimeout(loadDeadline); latest.current.onReady?.();
      if (frameCallback !== undefined) { video.cancelVideoFrameCallback(frameCallback); frameCallback = undefined; }
    };
    const awaitPresentedFrame = () => {
      if (!active || decoded || !supportsFrameCallbacks || frameCallback !== undefined) return;
      frameCallback = video.requestVideoFrameCallback((_now, metadata) => {
        frameCallback = undefined;
        if (!active) return;
        presentedTime = metadata.mediaTime;
        markDecoded();
        awaitPresentedFrame();
      });
    };
    const loadedData = () => {
      flush();
      // Without frame callbacks, ready data after the latest seek is the best
      // available decoder signal; loadeddata alone never bypasses the seek gate.
      if (!supportsFrameCallbacks) markDecoded();
    };
    const metadata = () => { pending = true; flush(); };
    const seeked = () => {
      if (!active) return;
      clearTimeout(deadline); latest.current.onSeekStateChange?.(false); flush(); markDecoded();
    };
    queue.current = () => { pending = true; flush(); markDecoded(); };
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("loadeddata", loadedData);
    video.addEventListener("seeked", seeked);
    video.addEventListener("error", fail);
    const loadDeadline = setTimeout(fail, LOAD_TIMEOUT_MS);

    video.src = videoSrc;
    video.load();
    awaitPresentedFrame();

    return () => {
      active = false; queue.current = null;
      clearTimeout(retry); clearTimeout(deadline); clearTimeout(loadDeadline);
      if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("loadeddata", loadedData);
      video.removeEventListener("seeked", seeked);
      video.removeEventListener("error", fail);
      video.pause(); video.removeAttribute("src"); video.load();
      latest.current.onSeekStateChange?.(false);
    };
  }, [isNearViewport, videoSrc]);

  useEffect(() => { queue.current?.(); }, [progress]);

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
