import { useEffect, useRef, useState } from "react";
import type { CinematicRendererProps } from "./cinematic-types";
import { CINEMATIC_MANIFEST } from "@/lib/media/cinematic-manifest";
import { cn } from "@/lib/utils";

const SEEK_INTERVAL_MS = 36;
const LOAD_TIMEOUT_MS = 5000;
const SEEK_TIMEOUT_MS = 1500;
// One 24fps frame plus the existing seek deadband accommodates frame quantization.
const PRESENTED_FRAME_TOLERANCE_SECONDS = 0.075;

/** DEV comparison: one latest target, one decoder lifecycle, bounded seeking. */
export function VideoScrubRenderer({
  progress, isNearViewport, onReady, onError, onSeekStateChange, posterSrc, className,
}: CinematicRendererProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latest = useRef({ progress, onReady, onError, onSeekStateChange });
  latest.current = { progress, onReady, onError, onSeekStateChange };
  const queue = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!isNearViewport) return;
    const video = videoRef.current;
    if (!video) return;
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
      decoded = true; clearTimeout(loadDeadline); setReady(true); latest.current.onReady?.();
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
    // Restore source on every setup, including React effect replay. No source
    // children are owned by React and changed imperatively during teardown.
    video.src = window.matchMedia("(min-width: 1024px)").matches
      ? CINEMATIC_MANIFEST.derivatives.desktop720p.src
      : CINEMATIC_MANIFEST.derivatives.standard540p.src;
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
  }, [isNearViewport]);
  useEffect(() => { queue.current?.(); }, [progress]);
  return (
    <div className={cn("relative size-full overflow-hidden bg-ink", className)}>
      <img src={posterSrc} alt="" aria-hidden="true" width={960} height={540}
        className={cn("absolute inset-0 size-full object-contain", ready ? "opacity-0" : "opacity-100")} />
      {isNearViewport && <video ref={videoRef} muted playsInline preload="none" tabIndex={-1} aria-hidden="true"
        className={cn("size-full object-contain lg:object-cover select-none", ready ? "opacity-100" : "opacity-0")} />}
    </div>
  );
}
