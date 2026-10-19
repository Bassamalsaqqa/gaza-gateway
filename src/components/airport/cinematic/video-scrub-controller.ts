/**
 * Gaza Gateway — Single Decoder Video Scrub Controller
 *
 * Imperative lifecycle manager for a single video decoder.
 * Enforces one latest target, bounded seeking, exact-frame poster barrier,
 * requestVideoFrameCallback synchronization, and ONE bounded timeout recovery.
 */

export const SEEK_INTERVAL_MS = 36;
export const LOAD_TIMEOUT_MS = 5000;
export const SEEK_TIMEOUT_MS = 1500;
// One 24fps frame plus the existing seek deadband accommodates frame quantization.
export const PRESENTED_FRAME_TOLERANCE_SECONDS = 0.075;

export interface VideoScrubLifecycleOptions {
  videoSrc: string;
  getProgress: () => number;
  onReady?: (() => void) | undefined;
  onError?: ((error: string) => void) | undefined;
  onSeekStateChange?: ((seeking: boolean) => void) | undefined;
  seekIntervalMs?: number | undefined;
  loadTimeoutMs?: number | undefined;
  seekTimeoutMs?: number | undefined;
  frameToleranceSeconds?: number | undefined;
}

export interface VideoScrubController {
  notifyProgress: () => void;
  dispose: () => void;
  getState: () => {
    readonly isDecoded: boolean;
    readonly isPending: boolean;
    readonly isSeeking: boolean;
    readonly presentedTime: number | undefined;
    readonly seekRecoveryAttempted: boolean;
    readonly loadRecoveryAttempted: boolean;
  };
}

/**
 * Attaches the single-decoder video scrub lifecycle to an HTMLVideoElement.
 */
export function attachVideoScrubLifecycle(
  video: HTMLVideoElement,
  options: VideoScrubLifecycleOptions,
): VideoScrubController {
  const seekIntervalMs = options.seekIntervalMs ?? SEEK_INTERVAL_MS;
  const loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  const seekTimeoutMs = options.seekTimeoutMs ?? SEEK_TIMEOUT_MS;
  const frameToleranceSeconds = options.frameToleranceSeconds ?? PRESENTED_FRAME_TOLERANCE_SECONDS;

  let active = true;
  let decoded = false;
  let pending = true;
  let lastSeek = -Infinity;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let loadDeadline: ReturnType<typeof setTimeout> | undefined;
  let frameCallback: number | undefined;
  let presentedTime: number | undefined;
  let seekRecoveryAttempted = false;
  let loadRecoveryAttempted = false;

  const supportsFrameCallbacks = typeof video.requestVideoFrameCallback === "function";

  const targetTime = () =>
    Math.max(0, Math.min(video.duration - 0.05, options.getProgress() * video.duration));

  const fail = (errorReason = "The video could not be decoded in time.") => {
    if (!active) return;
    active = false;
    clearTimeout(retry);
    clearTimeout(deadline);
    clearTimeout(loadDeadline);
    if (frameCallback !== undefined && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(frameCallback);
      frameCallback = undefined;
    }
    options.onSeekStateChange?.(false);
    options.onError?.(errorReason);
  };

  const markDecoded = () => {
    if (
      !active ||
      decoded ||
      pending ||
      video.seeking ||
      video.readyState < 2 ||
      !Number.isFinite(video.duration)
    ) {
      return;
    }
    const target = targetTime();
    if (Math.abs(video.currentTime - target) >= 0.03) return;
    if (
      supportsFrameCallbacks &&
      (presentedTime === undefined || Math.abs(presentedTime - target) > frameToleranceSeconds)
    ) {
      return;
    }
    decoded = true;
    clearTimeout(loadDeadline);
    options.onReady?.();
    if (frameCallback !== undefined && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(frameCallback);
      frameCallback = undefined;
    }
  };

  const awaitPresentedFrame = () => {
    if (!active || decoded || !supportsFrameCallbacks || frameCallback !== undefined) return;
    frameCallback = video.requestVideoFrameCallback((_now, metadata) => {
      frameCallback = undefined;
      if (!active) return;
      presentedTime = metadata.mediaTime;
      markDecoded();
      if (!decoded) {
        awaitPresentedFrame();
      }
    });
  };

  const handleSeekTimeout = () => {
    if (!active) return;
    // Attempt ONE bounded seek recovery before terminal failure
    if (!seekRecoveryAttempted) {
      seekRecoveryAttempted = true;
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        fail("The video seek could not be completed in time.");
      }, seekTimeoutMs);
      if (!video.seeking) {
        try {
          video.currentTime = targetTime();
        } catch {
          fail("The video could not seek.");
        }
      }
      return;
    }
    fail("The video seek could not be completed in time.");
  };

  const flush = () => {
    if (!active || !pending || video.readyState < 1 || !Number.isFinite(video.duration)) return;
    if (video.seeking) return; // Existing seek deadline bounds native decoder waits.

    const target = targetTime();
    if (Math.abs(video.currentTime - target) < 0.03) {
      pending = false;
      options.onSeekStateChange?.(false);
      markDecoded();
      return;
    }

    const remaining = seekIntervalMs - (performance.now() - lastSeek);
    if (remaining > 0) {
      clearTimeout(retry);
      retry = setTimeout(flush, remaining);
      return;
    }

    pending = false;
    lastSeek = performance.now();
    seekRecoveryAttempted = false;
    options.onSeekStateChange?.(true);
    clearTimeout(deadline);
    deadline = setTimeout(handleSeekTimeout, seekTimeoutMs);
    try {
      video.currentTime = target;
    } catch {
      fail("The video could not seek.");
    }
  };

  const handleLoadTimeout = () => {
    if (!active || decoded) return;
    // Attempt ONE bounded load recovery before terminal failure
    if (!loadRecoveryAttempted) {
      loadRecoveryAttempted = true;
      clearTimeout(loadDeadline);
      loadDeadline = setTimeout(() => {
        fail("The video could not be decoded in time.");
      }, loadTimeoutMs);
      // Keep an in-flight cold HTTP Range request alive during the grace period.
      // Calling load() here aborts it and can make a slow, healthy source fail twice.
      flush();
      markDecoded();
      return;
    }
    fail("The video could not be decoded in time.");
  };

  const loadedData = () => {
    flush();
    markDecoded();
  };

  const metadata = () => {
    pending = true;
    flush();
  };

  const seeked = () => {
    if (!active) return;
    seekRecoveryAttempted = false;
    clearTimeout(deadline);
    options.onSeekStateChange?.(false);
    flush();
    markDecoded();
  };

  const handleMediaError = () => {
    if (!active) return;
    const mediaErr = video.error;
    const msg = mediaErr
      ? `Video playback failed (code ${mediaErr.code}).`
      : "The video could not be decoded.";
    fail(msg);
  };

  video.addEventListener("loadedmetadata", metadata);
  video.addEventListener("loadeddata", loadedData);
  video.addEventListener("seeked", seeked);
  video.addEventListener("error", handleMediaError);
  loadDeadline = setTimeout(handleLoadTimeout, loadTimeoutMs);

  video.src = options.videoSrc;
  video.load();
  awaitPresentedFrame();

  return {
    notifyProgress: () => {
      if (!active) return;
      pending = true;
      flush();
      markDecoded();
    },
    dispose: () => {
      active = false;
      clearTimeout(retry);
      clearTimeout(deadline);
      clearTimeout(loadDeadline);
      if (frameCallback !== undefined && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameCallback);
        frameCallback = undefined;
      }
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("loadeddata", loadedData);
      video.removeEventListener("seeked", seeked);
      video.removeEventListener("error", handleMediaError);
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignored during teardown
      }
      options.onSeekStateChange?.(false);
    },
    getState: () => ({
      isDecoded: decoded,
      isPending: pending,
      isSeeking: Boolean(video.seeking),
      presentedTime,
      seekRecoveryAttempted,
      loadRecoveryAttempted,
    }),
  };
}
