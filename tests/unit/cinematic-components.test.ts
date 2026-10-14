import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FrameScheduler } from "../../src/components/airport/cinematic/frame-scheduler.ts";

class MockImageBitmap {
  public closed = false;
  public width = 960;
  public height = 540;
  constructor(width = 960, height = 540) {
    this.width = width;
    this.height = height;
  }
  close() {
    this.closed = true;
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Cinematic Components & Bounded FrameScheduler Architecture", () => {
  test("scheduler enforces max concurrency <= 4 and deduplicates concurrent requests for the same frame", async (t) => {
    let activePhysical = 0;
    let maxObservedConcurrency = 0;
    const fetchCallsForIndex = new Map<number, number>();
    const pending: Deferred<void>[] = [];

    const mockFetch = async (url: string, signal: AbortSignal): Promise<Response> => {
      activePhysical++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, activePhysical);
      const match = url.match(/frame_(\d+)\.webp/);
      const idx = match ? parseInt(match[1]!, 10) - 1 : 0;
      fetchCallsForIndex.set(idx, (fetchCallsForIndex.get(idx) || 0) + 1);

      const request = createDeferred<void>();
      pending.push(request);
      await request.promise;
      activePhysical--;
      if (signal.aborted) throw new Error("Aborted");

      return new Response(new Blob(["mock-image"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      return new MockImageBitmap() as unknown as ImageBitmap;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      maxConcurrency: 4,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
    });
    t.after(() => scheduler.dispose());

    // Rapidly change targets to generate a large burst of requests with overlaps
    scheduler.setTarget(0.1); // frame 9
    scheduler.setTarget(0.1); // duplicate target
    scheduler.setTarget(0.5); // frame 47
    scheduler.setTarget(0.9); // frame 85

    assert.equal(fetchCallsForIndex.get(9), 1, "Duplicate target must share the physical request");
    // Release controlled waves; no assumption about wall-clock timer ordering.
    for (let wave = 0; wave < 30 && scheduler.getActiveCount() > 0; wave++) {
      pending.splice(0).forEach(request => request.resolve(undefined));
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    assert.ok(maxObservedConcurrency <= 4, `Observed concurrency ${maxObservedConcurrency} exceeded max 4`);
    assert.equal(scheduler.getActiveCount(), 0, "All active fetches must settle");
    assert.equal(activePhysical, 0, "All physical fetches must settle");
  });

  test("scheduler draws only latest target when reversing direction and handles in-flight dedup", async () => {
    const drawnIndices: number[] = [];
    const drawnGenerations: number[] = [];

    const deferreds = new Map<number, Deferred<Response>>();
    const getDeferred = (idx: number): Deferred<Response> => {
      if (!deferreds.has(idx)) {
        deferreds.set(idx, createDeferred<Response>());
      }
      return deferreds.get(idx)!;
    };

    const mockFetch = async (url: string, signal: AbortSignal): Promise<Response> => {
      const match = url.match(/frame_(\d+)\.webp/);
      const idx = match ? parseInt(match[1]!, 10) - 1 : 0;
      const d = getDeferred(idx);
      signal.addEventListener("abort", () => {
        d.reject(new Error("Aborted"));
      });
      return d.promise;
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      return new MockImageBitmap() as unknown as ImageBitmap;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
      onDraw: (_bitmap, index, gen) => {
        drawnIndices.push(index);
        drawnGenerations.push(gen);
      },
    });

    // Target frame 10 (Gen 1)
    scheduler.setTarget(10 / 95);
    const gen1 = scheduler.getGeneration();

    // Immediately reverse to frame 0 (Gen 2)
    scheduler.setTarget(0);
    const gen2 = scheduler.getGeneration();

    // Resolve frame 10 first
    getDeferred(10).resolve(
      new Response(new Blob(["frame-10"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    // Frame 10 must NOT have been drawn because it's no longer the target
    assert.ok(!drawnIndices.includes(10), "Stale target frame 10 must not be drawn");
    assert.ok(!drawnGenerations.includes(gen1), "Stale generation 1 must not be drawn");

    // Resolve frame 0
    getDeferred(0).resolve(
      new Response(new Blob(["frame-0"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    // Frame 0 must be drawn for Gen 2
    assert.ok(drawnIndices.includes(0), "Latest target frame 0 must be drawn");
    assert.ok(drawnGenerations.includes(gen2), "Latest generation 2 must be drawn");

    scheduler.dispose();
  });

  test("shared in-flight dedup draws current target even when request generation was older", async () => {
    const drawnIndices: number[] = [];
    const drawnGenerations: number[] = [];

    const deferred5 = createDeferred<Response>();

    const mockFetch = async (url: string): Promise<Response> => {
      if (url.includes("frame_006.webp")) {
        // Frame index 5
        return deferred5.promise;
      }
      return new Response(new Blob(["img"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      return new MockImageBitmap() as unknown as ImageBitmap;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
      onDraw: (_bmp, index, gen) => {
        drawnIndices.push(index);
        drawnGenerations.push(gen);
      },
    });

    // Start target 4: directional window fetches 5, 6, 7, 8 in Gen 1
    scheduler.setTarget(4 / 95);
    assert.equal(scheduler.isInFlight(5), true, "Frame 5 is in-flight as window fetch at Gen 1");

    // Scroll to target 5 at Gen 2
    scheduler.setTarget(5 / 95);
    const gen2 = scheduler.getGeneration();

    // Now resolve frame 5
    deferred5.resolve(
      new Response(new Blob(["frame-5"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );

    await new Promise((r) => setTimeout(r, 30));

    assert.ok(drawnIndices.includes(5), "Target frame 5 must be drawn even though fetch started at Gen 1");
    assert.ok(drawnGenerations.includes(gen2), "Must draw with current generation 2");

    scheduler.dispose();
  });

  test("scheduler reset increments epoch and ensures late old decode is closed and never cached or drawn", async () => {
    const decodeStarted = createDeferred<void>();
    const decodeDeferred = createDeferred<ImageBitmap>();
    const createdBitmap = new MockImageBitmap();
    let drawn = false;

    const mockFetch = async (): Promise<Response> => {
      return new Response(new Blob(["data"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      decodeStarted.resolve();
      return decodeDeferred.promise;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
      onDraw: () => {
        drawn = true;
      },
    });

    scheduler.setTarget(10 / 95);
    await decodeStarted.promise;
    const initialEpoch = scheduler.getEpoch();

    // Reset while decode is in flight
    scheduler.reset();
    assert.equal(scheduler.getEpoch(), initialEpoch + 1, "Reset must increment epoch");

    // Now let decode complete
    decodeDeferred.resolve(createdBitmap as unknown as ImageBitmap);

    await new Promise((r) => setTimeout(r, 30));

    assert.equal(createdBitmap.closed, true, "Late old decode bitmap must be immediately closed");
    assert.equal(scheduler.hasBitmap(10), false, "Stale bitmap must not be cached");
    assert.equal(scheduler.getCacheSize(), 0, "Cache must be empty");
    assert.equal(drawn, false, "Stale bitmap must not be drawn");

    scheduler.dispose();
  });

  test("old request finally cannot delete inFlightMap entry or desynchronize active count of new request", async () => {
    const fetchDeferred1 = createDeferred<Response>();
    const fetchDeferred2 = createDeferred<Response>();
    let fetchCount = 0;

    const mockFetch = async (_url: string, _signal: AbortSignal): Promise<Response> => {
      fetchCount++;
      if (fetchCount === 1) {
        return fetchDeferred1.promise;
      }
      return fetchDeferred2.promise;
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      return new MockImageBitmap() as unknown as ImageBitmap;
    };

    // Use single-frame (frameCount: 1) to isolate exactly 1 physical request without directional window or anchors
    const scheduler = new FrameScheduler({
      frameCount: 1,
      maxConcurrency: 4,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
    });

    // Request target frame 0 in Epoch 1
    scheduler.setTarget(0);
    assert.equal(scheduler.getActiveCount(), 1, "Active count must be 1 during initial request");
    assert.equal(scheduler.isInFlight(0), true, "Frame 0 must be in flight in epoch 1");

    // Reset scheduler while fetch 1 is still alive
    scheduler.reset();
    assert.equal(scheduler.getActiveCount(), 1, "Physical in-flight count must remain 1 after reset while promise is alive");

    // Start request for frame 0 in Epoch 2
    scheduler.setTarget(0);
    assert.equal(scheduler.getActiveCount(), 2, "Active count must reflect both physical requests");
    assert.equal(scheduler.isInFlight(0), true, "Frame 0 must be in flight in epoch 2");

    // Now resolve old fetch 1
    fetchDeferred1.resolve(
      new Response(new Blob(["old"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );

    // Give microtasks time to run old finally
    await new Promise((r) => setTimeout(r, 20));

    // Old finally must NOT have deleted new request's inFlight entry or decremented below new request's count
    assert.equal(scheduler.getActiveCount(), 1, "Active count must still be 1 for the new request");
    assert.equal(scheduler.isInFlight(0), true, "Frame 0 inFlight entry for epoch 2 must not be deleted by epoch 1 finally");

    // Resolve new fetch 2
    fetchDeferred2.resolve(
      new Response(new Blob(["new"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(scheduler.getActiveCount(), 0, "Active count must settle to 0");
    assert.equal(scheduler.isInFlight(0), false, "Frame 0 is no longer in flight");
    assert.equal(scheduler.hasBitmap(0), true, "New request decoded bitmap must be cached");

    scheduler.dispose();
  });

  test("scheduler disposal aborts in-flight requests, closes late bitmaps, and prevents restart", async () => {
    const decodeStarted = createDeferred<void>();
    const decodeDeferred = createDeferred<ImageBitmap>();
    const createdBitmap = new MockImageBitmap();

    const mockFetch = async (): Promise<Response> => {
      return new Response(new Blob(["data"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const mockCreateBitmap = async (): Promise<ImageBitmap> => {
      decodeStarted.resolve();
      return decodeDeferred.promise;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
    });

    scheduler.setTarget(10 / 95);
    await decodeStarted.promise;
    scheduler.dispose();

    assert.equal(scheduler.isSchedulerDisposed(), true, "Scheduler must report disposed");

    // Attempting to restart or set target after dispose must be no-op
    scheduler.setTarget(0.5);
    scheduler.reset();

    // Complete late decode
    decodeDeferred.resolve(createdBitmap as unknown as ImageBitmap);

    await new Promise((r) => setTimeout(r, 30));

    assert.equal(createdBitmap.closed, true, "Late bitmap must be closed upon disposal");
    assert.equal(scheduler.getCacheSize(), 0, "Cache size must be 0 after disposal");
  });

  test("scheduler enforces LRU eviction bounding cache and closes evicted bitmaps while preserving drawn frame", async () => {
    const bitmaps = new Map<number, MockImageBitmap>();

    const mockFetch = async (): Promise<Response> => {
      return new Response(new Blob(["data"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      maxCache: 5,
      fetchFn: mockFetch,
      createBitmapFn: async () => {
        const bmp = new MockImageBitmap();
        bitmaps.set(bitmaps.size, bmp);
        return bmp as unknown as ImageBitmap;
      },
    });

    // Populate cache with multiple frames
    for (let i = 0; i < 8; i++) {
      scheduler.setTarget(i / 95);
      await new Promise((r) => setTimeout(r, 20));
    }

    assert.ok(scheduler.getCacheSize() <= 5, `Cache size ${scheduler.getCacheSize()} must be <= maxCache (5)`);

    let closedCount = 0;
    for (const bmp of bitmaps.values()) {
      if (bmp.closed) closedCount++;
    }
    assert.equal(closedCount, scheduler.getDisposalCount(), "Disposal count must match number of closed bitmaps");
    assert.ok(closedCount > 0, "Oldest bitmaps beyond maxCache must have been closed");

    scheduler.dispose();
  });

  test("scheduler with maxCache 1 draws open bitmap on target transition and evicts previous target bitmap", async () => {
    const bitmapsByIndex = new Map<number, MockImageBitmap>();
    const drawnBitmaps: ImageBitmap[] = [];
    const drawnIndices: number[] = [];

    const mockFetch = async (url: string): Promise<Response> => {
      const match = url.match(/frame_(\d+)\.webp/);
      const idx = match ? parseInt(match[1]!, 10) - 1 : 0;
      return new Response(new Blob([String(idx)]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const mockCreateBitmap = async (blob: Blob): Promise<ImageBitmap> => {
      const text = await blob.text();
      const idx = parseInt(text, 10);
      const bmp = new MockImageBitmap();
      bitmapsByIndex.set(idx, bmp);
      return bmp as unknown as ImageBitmap;
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      maxCache: 1,
      fetchFn: mockFetch,
      createBitmapFn: mockCreateBitmap,
      onDraw: (bitmap, index) => {
        // Assert bitmap is NOT closed when onDraw is called
        assert.equal((bitmap as unknown as MockImageBitmap).closed, false, `Bitmap for frame ${index} must be open when drawn`);
        drawnBitmaps.push(bitmap);
        drawnIndices.push(index);
      },
    });

    // 1. Target frame 0 and wait for it to draw
    scheduler.setTarget(0);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(drawnIndices.length, 1);
    assert.equal(drawnIndices[0], 0);
    const bmp0 = bitmapsByIndex.get(0)!;
    assert.ok(bmp0, "Bitmap for frame 0 must exist");
    assert.equal(bmp0.closed, false, "Frame 0 bitmap must be open after drawing");
    assert.equal(scheduler.getCacheSize(), 1, "Cache size must be 1");
    assert.equal(scheduler.hasBitmap(0), true, "Frame 0 must be in cache");

    // 2. Target frame 10 and wait for transition to draw
    scheduler.setTarget(10 / 95);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(drawnIndices.length, 2);
    assert.equal(drawnIndices[1], 10);
    const bmp10 = bitmapsByIndex.get(10)!;
    assert.ok(bmp10, "Bitmap for frame 10 must exist");
    assert.equal(bmp10.closed, false, "Frame 10 bitmap must be open after drawing");

    // Frame 0 must now be evicted and closed because maxCache is 1
    assert.equal(bmp0.closed, true, "Frame 0 bitmap must be closed upon LRU eviction");
    assert.equal(scheduler.getCacheSize(), 1, "Cache size must remain 1");
    assert.equal(scheduler.hasBitmap(10), true, "Frame 10 must be in cache");
    assert.equal(scheduler.hasBitmap(0), false, "Frame 0 must be evicted from cache");

    scheduler.dispose();
  });

  test("scheduler triggers immediate bounded fallback on target fetch failure and avoids re-fetching failed target", async () => {
    let fallbackTarget: number | null = null;
    let fetchAttempts = 0;

    const failingFetch = async (): Promise<Response> => {
      fetchAttempts++;
      return new Response(new Blob(["not found"]), {
        status: 404,
        headers: { "content-type": "image/webp" },
      });
    };

    const scheduler = new FrameScheduler({
      frameCount: 96,
      targetTimeoutMs: 2000, // Large timeout: fallback must trigger promptly without waiting 2000ms
      fetchFn: failingFetch,
      onFallback: (target) => {
        fallbackTarget = target;
      },
    });

    scheduler.setTarget(25 / 95);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(fallbackTarget, 25, "onFallback must be called promptly on target fetch failure");
    const initialAttempts = fetchAttempts;

    // Setting same target again must not trigger endless infinite re-fetches
    scheduler.setTarget(25 / 95);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(fetchAttempts, initialAttempts, "Failed target must not be pointlessly re-fetched in same epoch");

    scheduler.dispose();
  });

  test("scheduler rejects all non-image/webp MIME types (HTML, PNG, JSON)", async () => {
    const mimeTypesToTest = ["text/html", "image/png", "application/json", "text/plain", "image/jpeg"];

    for (const badMime of mimeTypesToTest) {
      const mockFetch = async (): Promise<Response> => {
        return new Response(new Blob(["bad content"]), {
          status: 200,
          headers: { "content-type": badMime },
        });
      };

      let createBitmapCalled = false;
      const mockCreateBitmap = async (): Promise<ImageBitmap> => {
        createBitmapCalled = true;
        return new MockImageBitmap() as unknown as ImageBitmap;
      };

      let drawn = false;
      const scheduler = new FrameScheduler({
        frameCount: 96,
        fetchFn: mockFetch,
        createBitmapFn: mockCreateBitmap,
        onDraw: () => {
          drawn = true;
        },
      });

      scheduler.setTarget(10 / 95);
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(createBitmapCalled, false, `createBitmap must not be called for MIME ${badMime}`);
      assert.equal(scheduler.hasBitmap(10), false, `Frame must not be cached for MIME ${badMime}`);
      assert.equal(drawn, false, `Frame must not be drawn for MIME ${badMime}`);

      scheduler.dispose();
    }
  });

  test("scheduler target timeout triggers onFallback and cancels on draw, reset, or dispose", async () => {
    let fallbackTarget: number | null = null;

    // 1. Timeout triggers when fetch never resolves
    const hangingFetch = async (): Promise<Response> => {
      return new Promise<Response>(() => {}); // never resolves
    };

    const scheduler1 = new FrameScheduler({
      frameCount: 96,
      targetTimeoutMs: 30,
      fetchFn: hangingFetch,
      onFallback: (target) => {
        fallbackTarget = target;
      },
    });

    scheduler1.setTarget(25 / 95);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(fallbackTarget, 25, "onFallback must be called with target index on timeout");
    scheduler1.dispose();

    // 2. Timeout does NOT trigger if target draws before timeout
    fallbackTarget = null;
    const fastFetch = async (): Promise<Response> => {
      return new Response(new Blob(["fast"]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    };

    const scheduler2 = new FrameScheduler({
      frameCount: 96,
      targetTimeoutMs: 100,
      fetchFn: fastFetch,
      createBitmapFn: async () => new MockImageBitmap() as unknown as ImageBitmap,
      onFallback: (target) => {
        fallbackTarget = target;
      },
    });

    scheduler2.setTarget(25 / 95);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fallbackTarget, null, "onFallback must not be called when frame draws before timeout");
    scheduler2.dispose();

    // 3. Reset cancels timeout timer
    fallbackTarget = null;
    const scheduler3 = new FrameScheduler({
      frameCount: 96,
      targetTimeoutMs: 50,
      fetchFn: hangingFetch,
      onFallback: (target) => {
        fallbackTarget = target;
      },
    });

    scheduler3.setTarget(25 / 95);
    scheduler3.reset();
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(fallbackTarget, null, "onFallback must not be called if reset before timeout");
    scheduler3.dispose();
  });

  test("target index and options are strictly bounded and clamped", () => {
    const scheduler = new FrameScheduler({
      frameCount: 96,
      maxConcurrency: 10, // Must clamp to <= 4
      maxCache: 50, // Must clamp to <= 12
      targetTimeoutMs: -10, // Must clamp to >= 1
    });

    assert.equal(scheduler.maxConcurrency, 4, "maxConcurrency must be clamped to 4");
    assert.equal(scheduler.maxCache, 12, "maxCache must be clamped to 12");
    assert.ok(scheduler.targetTimeoutMs >= 1, "targetTimeoutMs must be >= 1");

    assert.equal(scheduler.setTarget(0.0), 0);
    assert.equal(scheduler.setTarget(0.5), 47);
    assert.equal(scheduler.setTarget(1.0), 95);

    // Negative and overshoot clamping
    assert.equal(scheduler.setTarget(-0.5), 0);
    assert.equal(scheduler.setTarget(1.5), 95);
    assert.equal(scheduler.setTarget(NaN), 0);

    scheduler.dispose();
  });
});

describe("Home Continuous Cinematic & Scroll Mapping Architecture", () => {
  test("computeHomeCinematicProgress accurately maps top, bottom, and intermediate scroll", async () => {
    const { computeHomeCinematicProgress } = await import(
      "../../src/components/airport/cinematic/cinematic-scroll.ts"
    );

    const viewportHeight = 800;
    const documentHeight = 4000;
    const maxScroll = documentHeight - viewportHeight; // 3200

    // Exact top (Hero)
    assert.equal(computeHomeCinematicProgress(0, documentHeight, viewportHeight), 0);

    // Exact bottom (Footer end)
    assert.equal(computeHomeCinematicProgress(maxScroll, documentHeight, viewportHeight), 1);

    // Quarter, Half, Three-quarters
    assert.equal(computeHomeCinematicProgress(800, documentHeight, viewportHeight), 0.25);
    assert.equal(computeHomeCinematicProgress(1600, documentHeight, viewportHeight), 0.5);
    assert.equal(computeHomeCinematicProgress(2400, documentHeight, viewportHeight), 0.75);

    // Negative bounce (iOS overscroll) clamped to 0
    assert.equal(computeHomeCinematicProgress(-150, documentHeight, viewportHeight), 0);

    // Bottom overshoot clamped to 1
    assert.equal(computeHomeCinematicProgress(4000, documentHeight, viewportHeight), 1);

    // Non-scrollable page (scrollHeight <= innerHeight) safely returns 0
    assert.equal(computeHomeCinematicProgress(0, 600, 800), 0);
    assert.equal(computeHomeCinematicProgress(100, 800, 800), 0);
  });

  test("getActiveCinematicPhase resolves chronological 4-phase sequence", async () => {
    const { getActiveCinematicPhase } = await import(
      "../../src/components/airport/cinematic/cinematic-scroll.ts"
    );

    // Phase 1: Daylight (0.0 to ~0.28)
    const p1 = getActiveCinematicPhase(0.0);
    assert.equal(p1.id, "daylight");
    assert.equal(p1.numeral, "01");

    // Phase 2: Sunset (~0.28 to ~0.55)
    const p2 = getActiveCinematicPhase(0.35);
    assert.equal(p2.id, "sunset");
    assert.equal(p2.numeral, "02");

    // Phase 3: Twilight (~0.55 to ~0.80)
    const p3 = getActiveCinematicPhase(0.65);
    assert.equal(p3.id, "twilight");
    assert.equal(p3.numeral, "03");

    // Phase 4: Night (~0.80 to 1.0)
    const p4 = getActiveCinematicPhase(0.95);
    assert.equal(p4.id, "night");
    assert.equal(p4.numeral, "04");

    // Boundary at exactly 1.0
    const pEnd = getActiveCinematicPhase(1.0);
    assert.equal(pEnd.id, "night");

    // Negative progress fallback
    const pNeg = getActiveCinematicPhase(-0.5);
    assert.equal(pNeg.id, "daylight");
  });
});
