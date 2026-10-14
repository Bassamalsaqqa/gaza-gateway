import { useEffect, useRef, useState, useCallback } from "react";
import type { CinematicRendererProps } from "./cinematic-types";
import { CINEMATIC_MANIFEST } from "@/lib/media/cinematic-manifest";
import { FrameScheduler } from "./frame-scheduler";
import { cn } from "@/lib/utils";

const FRAME_COUNT = CINEMATIC_MANIFEST.experimentalFrameSequence.frameCount;
const DPR_MAX = 2.0;

/**
 * Resolves DEV experimental frame URL.
 * Uses root-relative scratch path during development to test frames without
 * bundling or staging them into public distribution.
 */
function getExperimentalFrameUrl(index: number): string {
  const frameNum = String(Math.max(1, Math.min(FRAME_COUNT, index + 1))).padStart(3, "0");
  return `/scratch/experiments/frames-960/frame_${frameNum}.webp`;
}

/**
 * Gaza Gateway — Bounded Canvas / WebP Frame Sequence Engine (DEV Prototype)
 *
 * Implements:
 * - Single bounded deduplicating FrameScheduler (max 4 in-flight, prioritized queue)
 * - Deterministic reverse seeking and zero blank frames (preserves last good bitmap)
 * - Strict 8–16 ImageBitmap LRU cache with explicit `.close()` calls on eviction
 * - MIME validation (rejects HTML SPA shell fallback)
 * - DPR clamped to 2.0 to prevent GPU memory bloat
 * - 16:9 aspect-contain letterboxing
 * - Offscreen teardown and full bitmap disposal
 */
export function FrameSequenceRenderer({
  progress,
  isNearViewport,
  onReady,
  onError,
  posterSrc,
  className,
}: CinematicRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [hasError, setHasError] = useState(false);
  const hasRenderedFrameRef = useRef(false);
  const lastBitmapRef = useRef<ImageBitmap | null>(null);

  // Stable callback refs
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Single FrameScheduler instance
  const schedulerRef = useRef<FrameScheduler | null>(null);

  /**
   * Draws a given ImageBitmap to the canvas respecting DPR and 16:9 contain geometry.
   */
  const drawBitmapToCanvas = useCallback((bitmap: ImageBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const rect = canvas.getBoundingClientRect();
    const targetWidth = Math.floor(rect.width * dpr);
    const targetHeight = Math.floor(rect.height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    // Letterbox aspect contain calculation (16:9)
    const imgAspect = bitmap.width / bitmap.height;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > imgAspect) {
      drawWidth = Math.floor(canvas.height * imgAspect);
      offsetX = Math.floor((canvas.width - drawWidth) / 2);
    } else {
      drawHeight = Math.floor(canvas.width / imgAspect);
      offsetY = Math.floor((canvas.height - drawHeight) / 2);
    }

    // Ink CSS token (getComputedStyle backgroundColor actual bg-ink), not hardcoded hex
    let inkBg = "transparent";
    if (typeof window !== "undefined") {
      const container = canvas.parentElement || canvas;
      const computed = window.getComputedStyle(container).backgroundColor;
      if (computed && computed !== "rgba(0, 0, 0, 0)" && computed !== "transparent") {
        inkBg = computed;
      }
    }
    ctx.fillStyle = inkBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
    return true;
  }, []);

  // Initialize scheduler once
  useEffect(() => {
    const scheduler = new FrameScheduler({
      frameCount: FRAME_COUNT,
      maxConcurrency: 4,
      maxCache: 12,
      targetTimeoutMs: 2500,
      getUrlFn: getExperimentalFrameUrl,
      onDraw: (bitmap) => {
        lastBitmapRef.current = bitmap;
        try {
          if (!drawBitmapToCanvas(bitmap)) throw new Error("Canvas rendering is unavailable.");
        } catch {
          onErrorRef.current?.("Canvas rendering is unavailable.");
          return;
        }
        if (!hasRenderedFrameRef.current) {
          hasRenderedFrameRef.current = true;
          setHasRenderedFrame(true);
          onReadyRef.current?.();
        }
      },
      onFallback: () => {
        // Direct callback without nested setState updater side-effects; once on initial readiness failure
        if (!hasRenderedFrameRef.current) {
          setHasError(true);
          onErrorRef.current?.("Timed out waiting for initial frame bitmap");
        }
      },
    });

    schedulerRef.current = scheduler;

    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
      lastBitmapRef.current = null;
    };
  }, [drawBitmapToCanvas]);

  // Handle offscreen teardown ONLY on transition (not on every scroll progress change)
  const prevNearViewportRef = useRef(isNearViewport);
  useEffect(() => {
    const wasNear = prevNearViewportRef.current;
    prevNearViewportRef.current = isNearViewport;
    const scheduler = schedulerRef.current;
    if (!scheduler) return;

    if (!isNearViewport && wasNear) {
      // Offscreen transition: cancel in-flight, close bitmaps to reclaim GPU memory
      scheduler.reset();
      lastBitmapRef.current = null;
      hasRenderedFrameRef.current = false;
      setHasRenderedFrame(false);
    }
  }, [isNearViewport]);

  // Consolidated single effect for setting target when near viewport
  useEffect(() => {
    if (!isNearViewport || hasError) return;
    schedulerRef.current?.setTarget(progress);
  }, [progress, isNearViewport, hasError]);

  // Resized canvas: immediately redraw current target frame bitmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      if (!isNearViewport || hasError) return;
      if (lastBitmapRef.current) {
        try {
          drawBitmapToCanvas(lastBitmapRef.current);
          return;
        } catch {
          // Bitmap may have been closed on eviction
        }
      }
      schedulerRef.current?.setTarget(progress);
    });

    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawBitmapToCanvas, isNearViewport, hasError, progress]);

  return (
    <div className={cn("relative size-full overflow-hidden bg-ink", className)}>
      {/* Underlying fallback poster — hidden ONLY after first real canvas frame is drawn */}
      <img
        src={posterSrc}
        alt=""
        aria-hidden="true"
        width={960}
        height={540}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300",
          hasRenderedFrame && !hasError ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
      />

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          "size-full select-none transition-opacity duration-300",
          hasRenderedFrame && !hasError ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
