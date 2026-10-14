/**
 * Gaza Gateway — Bounded Frame Scheduler
 *
 * Implements a single bounded, deduplicating, prioritized frame fetch and decode
 * scheduler for the canvas-based WebP frame sequence renderer.
 *
 * Invariants & Guarantees:
 * - Concurrency bound: strictly max 4 physical fetch/decode operations in flight simultaneously.
 * - Deduplication: concurrent requests for the same frame share the active promise.
 * - Prioritized queue: current target frame is Priority 1, directional window Priority 2, anchors Priority 3.
 * - Lifecycle epoch & token identity: prevents race conditions across reset() and avoids stale draws/caching.
 * - Physical in-flight counting: activeCount tracks physical promises until settlement; old finally blocks
 *   cannot delete new requests or desynchronize activeCount.
 * - Window fetch cancellation: aborts obsolete directional window fetches when target changes.
 * - Explicit bitmap disposal: LRU eviction, post-disposal resolutions, and stale epoch decodes call `ImageBitmap.close()`.
 * - Strictly rejects all non-image/webp MIME types.
 * - Target fallback timeout: fires if target is delayed; cancelled on draw, reset, or dispose.
 * - Permanent disposal: once disposed, scheduler cannot be restarted.
 * - Pure dependency injection: testable in headless node environments without browser DOM.
 */

export interface FrameSchedulerOptions {
  frameCount: number;
  maxConcurrency?: number;
  maxCache?: number;
  targetTimeoutMs?: number;
  fetchFn?: (url: string, signal: AbortSignal) => Promise<Response>;
  createBitmapFn?: (blob: Blob) => Promise<ImageBitmap>;
  getUrlFn?: (index: number) => string;
  onDraw?: (bitmap: ImageBitmap, index: number, generation: number) => void;
  onFallback?: (targetIndex: number) => void;
}

interface QueuedRequest {
  index: number;
  priority: number; // 1 = target, 2 = directional window, 3 = anchor
  generation: number;
  isWindowFetch: boolean;
}

interface InFlightEntry {
  token: number;
  epoch: number;
  index: number;
  isWindowFetch: boolean;
  controller: AbortController;
  promise: Promise<ImageBitmap | null>;
}

export class FrameScheduler {
  public readonly frameCount: number;
  public readonly maxConcurrency: number;
  public readonly maxCache: number;
  public readonly targetTimeoutMs: number;

  private fetchFn: (url: string, signal: AbortSignal) => Promise<Response>;
  private createBitmapFn: (blob: Blob) => Promise<ImageBitmap>;
  private getUrlFn: (index: number) => string;
  private onDraw?: ((bitmap: ImageBitmap, index: number, generation: number) => void) | undefined;
  private onFallback?: ((targetIndex: number) => void) | undefined;

  private activeCount = 0; // Physical in-flight count
  private queue: QueuedRequest[] = [];
  private inFlightMap = new Map<number, InFlightEntry>();
  private bitmapCache = new Map<number, ImageBitmap>();
  private failedIndices = new Set<number>();

  private epoch = 1; // Lifecycle epoch incremented on reset()
  private nextToken = 0; // Per-request token identity
  private disposalCount = 0; // Instrumentation for closed bitmaps

  private currentGeneration = 0;
  private currentTargetIndex = 0;
  private lastDrawnIndex = -1;
  private lastDrawnGeneration = -1;
  private isDisposed = false;
  private targetTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: FrameSchedulerOptions) {
    this.frameCount = Math.max(1, Math.floor(Number.isFinite(options.frameCount) ? options.frameCount : 1));
    this.maxConcurrency = Math.max(
      1,
      Math.min(4, Math.floor(Number.isFinite(options.maxConcurrency) ? options.maxConcurrency! : 4)),
    );
    this.maxCache = Math.max(1, Math.min(12, Math.floor(Number.isFinite(options.maxCache) ? options.maxCache! : 12)));
    this.targetTimeoutMs = Math.max(
      1,
      Math.floor(Number.isFinite(options.targetTimeoutMs) ? options.targetTimeoutMs! : 2500),
    );

    this.fetchFn =
      options.fetchFn ??
      ((url, signal) => (typeof fetch !== "undefined" ? fetch(url, { signal }) : Promise.reject(new Error("No fetch"))));
    this.createBitmapFn =
      options.createBitmapFn ??
      ((blob) =>
        typeof createImageBitmap !== "undefined"
          ? createImageBitmap(blob)
          : Promise.reject(new Error("No createImageBitmap")));
    this.getUrlFn =
      options.getUrlFn ??
      ((idx) => {
        const num = String(idx + 1).padStart(3, "0");
        return `/scratch/experiments/frames-960/frame_${num}.webp`;
      });
    this.onDraw = options.onDraw;
    this.onFallback = options.onFallback;
  }

  // Instrumentation getters
  public getCacheSize(): number {
    return this.bitmapCache.size;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getGeneration(): number {
    return this.currentGeneration;
  }

  public getEpoch(): number {
    return this.epoch;
  }

  public getDisposalCount(): number {
    return this.disposalCount;
  }

  public hasBitmap(index: number): boolean {
    return this.bitmapCache.has(index);
  }

  public isInFlight(index: number): boolean {
    return this.inFlightMap.has(index);
  }

  public isSchedulerDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Safely closes an ImageBitmap and increments disposal count.
   */
  private safeClose(bitmap: ImageBitmap): void {
    try {
      bitmap.close();
      this.disposalCount++;
    } catch {
      // Ignore if already closed
    }
  }

  /**
   * Sets target scroll progress (0.0 to 1.0) and triggers prioritized scheduling.
   * Target index uses Math.floor(progress * (frameCount - 1)).
   */
  public setTarget(progress: number): number {
    if (this.isDisposed) return this.currentTargetIndex;

    const num = typeof progress === "number" && Number.isFinite(progress) ? progress : 0;
    const clamped = Math.max(0, Math.min(1, num));
    const targetIndex = Math.min(this.frameCount - 1, Math.max(0, Math.floor(clamped * (this.frameCount - 1))));
    const direction = targetIndex >= this.currentTargetIndex ? 1 : -1;

    this.currentTargetIndex = targetIndex;
    this.currentGeneration++;
    const gen = this.currentGeneration;

    // Clear any previous target timeout
    if (this.targetTimeoutTimer) {
      clearTimeout(this.targetTimeoutTimer);
      this.targetTimeoutTimer = null;
    }

    // Check if target is already in cache
    if (this.bitmapCache.has(targetIndex)) {
      const bitmap = this.bitmapCache.get(targetIndex)!;
      // Refresh LRU order (delete and re-insert)
      this.bitmapCache.delete(targetIndex);
      this.bitmapCache.set(targetIndex, bitmap);
      this.lastDrawnIndex = targetIndex;
      this.lastDrawnGeneration = gen;
      if (this.onDraw) {
        this.onDraw(bitmap, targetIndex, gen);
      }
    } else if (this.failedIndices.has(targetIndex)) {
      if (this.onFallback) {
        this.onFallback(targetIndex);
      }
    } else {
      // Start fallback timeout if target is not immediately available
      this.targetTimeoutTimer = setTimeout(() => {
        if (!this.isDisposed && this.currentGeneration === gen && this.lastDrawnIndex !== targetIndex) {
          if (this.onFallback) this.onFallback(targetIndex);
        }
      }, this.targetTimeoutMs);
    }

    // Compute needed frames for new target, directional window, and anchors
    const windowSize = 4;
    const neededIndices = new Set<number>();
    neededIndices.add(targetIndex);

    const windowIndices: number[] = [];
    for (let step = 1; step <= windowSize; step++) {
      const nextIdx = targetIndex + step * direction;
      if (nextIdx >= 0 && nextIdx < this.frameCount) {
        neededIndices.add(nextIdx);
        windowIndices.push(nextIdx);
      }
    }

    const anchors = [
      0,
      Math.floor((this.frameCount - 1) * 0.25),
      Math.floor((this.frameCount - 1) * 0.5),
      Math.floor((this.frameCount - 1) * 0.75),
      this.frameCount - 1,
    ];
    for (const anchor of anchors) {
      neededIndices.add(anchor);
    }

    // Abort obsolete directional window fetches that are no longer in the needed set
    for (const [inFlightIndex, entry] of this.inFlightMap.entries()) {
      if (entry.isWindowFetch && !neededIndices.has(inFlightIndex)) {
        entry.controller.abort();
      }
    }

    // Re-prioritize queue: clear unstarted queue and build fresh prioritized list
    this.queue = [];

    // Priority 1: Target frame
    if (!this.bitmapCache.has(targetIndex) && !this.failedIndices.has(targetIndex)) {
      this.queue.push({ index: targetIndex, priority: 1, generation: gen, isWindowFetch: false });
    }

    // Priority 2: Directional window (4 frames ahead in scroll direction)
    for (const nextIdx of windowIndices) {
      if (!this.bitmapCache.has(nextIdx) && !this.failedIndices.has(nextIdx)) {
        this.queue.push({ index: nextIdx, priority: 2, generation: gen, isWindowFetch: true });
      }
    }

    // Priority 3: Strategic anchors (0%, 25%, 50%, 75%, 100%)
    for (const anchor of anchors) {
      if (anchor !== targetIndex && !this.bitmapCache.has(anchor) && !this.failedIndices.has(anchor)) {
        if (!this.queue.some((q) => q.index === anchor)) {
          this.queue.push({ index: anchor, priority: 3, generation: gen, isWindowFetch: false });
        }
      }
    }

    this.drainQueue();
    return targetIndex;
  }

  /**
   * Drains the queue respecting maxConcurrency.
   */
  private drainQueue(): void {
    if (this.isDisposed) return;

    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      // Sort queue by priority ascending (1 = target, 2 = window, 3 = anchor), then latest generation
      this.queue.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : b.generation - a.generation));
      const req = this.queue.shift();
      if (!req) break;

      // Skip if already in cache or marked failed in this epoch
      if (this.bitmapCache.has(req.index) || this.failedIndices.has(req.index)) continue;

      // Skip if already in flight in current epoch (deduplication)
      if (this.inFlightMap.has(req.index)) continue;

      this.fetchAndDecode(req.index, req.isWindowFetch);
    }
  }

  /**
   * Fetches, validates, and decodes a single frame with deduplication.
   */
  private async fetchAndDecode(index: number, isWindowFetch: boolean): Promise<void> {
    if (this.isDisposed) return;
    if (this.inFlightMap.has(index)) return;

    const token = ++this.nextToken;
    const epoch = this.epoch;
    const controller = new AbortController();

    this.activeCount++;

    const fetchPromise = (async (): Promise<ImageBitmap | null> => {
      try {
        const url = this.getUrlFn(index);
        const res = await this.fetchFn(url, controller.signal);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const rawMime = res.headers.get("content-type") || "";
        const mime = rawMime.toLowerCase().split(";")[0]?.trim();
        if (mime !== "image/webp") {
          throw new Error(`Rejecting non-image/webp MIME: ${rawMime}`);
        }

        const blob = await res.blob();
        if (controller.signal.aborted) return null;

        const bitmap = await this.createBitmapFn(blob);
        if (controller.signal.aborted) {
          this.safeClose(bitmap);
          return null;
        }

        return bitmap;
      } catch {
        return null;
      }
    })();

    const entry: InFlightEntry = {
      token,
      epoch,
      index,
      isWindowFetch,
      controller,
      promise: fetchPromise,
    };

    this.inFlightMap.set(index, entry);

    try {
      const bitmap = await fetchPromise;
      if (bitmap) {
        this.handleDecodedBitmap(bitmap, index, epoch);
      } else if (
        !controller.signal.aborted &&
        epoch === this.epoch &&
        !this.isDisposed
      ) {
        this.failedIndices.add(index);
        if (index === this.currentTargetIndex && this.lastDrawnIndex !== index) {
          if (this.targetTimeoutTimer) {
            clearTimeout(this.targetTimeoutTimer);
            this.targetTimeoutTimer = null;
          }
          if (this.onFallback) {
            this.onFallback(index);
          }
        }
      }
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      // Remove from inFlightMap ONLY if this entry's token still owns the slot
      if (this.inFlightMap.get(index)?.token === token) {
        this.inFlightMap.delete(index);
      }
      this.drainQueue();
    }
  }

  /**
   * Stores bitmap in LRU cache and invokes onDraw if index matches current target.
   * Draws target and updates lastDrawnIndex before pruning so that with maxCache = 1,
   * the newly drawn target is protected from eviction during pruneLru().
   */
  private handleDecodedBitmap(bitmap: ImageBitmap, index: number, epoch: number): void {
    // 1. If disposed or from an older epoch: immediately close and do not cache or draw
    if (this.isDisposed || epoch !== this.epoch) {
      this.safeClose(bitmap);
      return;
    }

    // 2. Draw management:
    // Only latest target draws; draw and update lastDrawnIndex BEFORE cache insertion/pruning so
    // that with maxCache = 1 the newly drawn target is protected from eviction during pruneLru().
    if (index === this.currentTargetIndex && this.lastDrawnGeneration !== this.currentGeneration) {
      this.lastDrawnIndex = index;
      this.lastDrawnGeneration = this.currentGeneration;
      if (this.targetTimeoutTimer) {
        clearTimeout(this.targetTimeoutTimer);
        this.targetTimeoutTimer = null;
      }
      if (this.onDraw) {
        this.onDraw(bitmap, index, this.currentGeneration);
      }
    }

    // 3. Cache management: store in LRU cache and prune
    if (this.bitmapCache.has(index)) {
      const existing = this.bitmapCache.get(index)!;
      if (existing !== bitmap) {
        this.safeClose(existing);
      }
      this.bitmapCache.delete(index);
    }
    this.bitmapCache.set(index, bitmap);
    this.pruneLru();
  }

  /**
   * Evicts oldest entries beyond maxCache and explicitly calls .close().
   * Protects the currently drawn frame from eviction while drawn.
   */
  private pruneLru(): void {
    while (this.bitmapCache.size > this.maxCache) {
      let keyToEvict: number | undefined;
      for (const key of this.bitmapCache.keys()) {
        if (key !== this.lastDrawnIndex) {
          keyToEvict = key;
          break;
        }
      }

      if (keyToEvict === undefined) {
        keyToEvict = this.bitmapCache.keys().next().value;
      }

      if (keyToEvict === undefined) break;

      const oldestBitmap = this.bitmapCache.get(keyToEvict);
      this.bitmapCache.delete(keyToEvict);
      if (oldestBitmap) {
        this.safeClose(oldestBitmap);
      }
    }
  }

  /**
   * Resets scheduler state for offscreen teardown or reentry without destroying instance.
   * Increments lifecycle epoch and aborts active fetches.
   * Keeps physical in-flight count intact until promises settle naturally.
   */
  public reset(): void {
    if (this.isDisposed) return;

    this.epoch++;

    for (const entry of this.inFlightMap.values()) {
      entry.controller.abort();
    }
    this.inFlightMap.clear();
    this.queue = [];
    this.failedIndices.clear();

    if (this.targetTimeoutTimer) {
      clearTimeout(this.targetTimeoutTimer);
      this.targetTimeoutTimer = null;
    }

    for (const bitmap of this.bitmapCache.values()) {
      this.safeClose(bitmap);
    }
    this.bitmapCache.clear();
    this.lastDrawnIndex = -1;
    this.lastDrawnGeneration = -1;
  }

  /**
   * Permanently disposes the scheduler. Closes all bitmaps and rejects late resolutions.
   * Cannot be restarted.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.reset();
    this.isDisposed = true;
  }
}
