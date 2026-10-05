/**
 * Gaza Gateway — Repository Storage & Migrations (`gza.repo.v1`)
 *
 * Implements safe, versioned local persistence for canonical repositories:
 * - Versioned schema (`schemaVersion: 1`).
 * - Hydration & SSR-safe (zero window/localStorage access at module import or on server).
 * - Pure, idempotent migration from legacy `gza.store.v1` and `gza.admin.v1`.
 * - Rollback-safe preservation of legacy keys (keeps draft, account, travelers, staff session intact).
 * - Corrupt-safe parsing with graceful fallback.
 * - Multi-tab synchronization via `window.addEventListener("storage", ...)`.
 */

import { normalizeBooking, type Booking } from "../domain/booking.ts";
import { INITIAL_BOOKING_SEEDS } from "../domain/booking-seeds.ts";
import { sanitizeFlightOverride, type FlightOverride } from "../domain/flight.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";

export const REPO_STORAGE_KEY = "gza.repo.v1";
export const REPO_SCHEMA_VERSION = 1;

export const LEGACY_STORE_KEY = "gza.store.v1";
export const LEGACY_ADMIN_KEY = "gza.admin.v1";

export interface RepoStorageV1 {
  schemaVersion: 1;
  bookings: Booking[];
  flightOverrides: Record<string, FlightOverride>;
}

export class StorageCommitError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageCommitError";
    this.cause = cause;
  }
}

export function getStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) return customStorage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    // SecurityError: storage blocked by browser policy (cross-origin iframe, strict privacy mode)
    return null;
  }
}

export function isBrowser(): boolean {
  return getStorage() !== null;
}

/**
 * Pure, idempotent migration from legacy storage keys.
 * Leaves legacy keys completely intact.
 */
export function migrateFromLegacyStores(
  storeRaw: string | null,
  adminRaw: string | null,
): RepoStorageV1 {
  const migratedBookings: Booking[] = [];
  const seenRefs = new Set<string>();

  // 1. Read legacy bookings from gza.store.v1
  if (storeRaw) {
    try {
      const parsed = JSON.parse(storeRaw);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.bookings)) {
        for (const rawB of parsed.bookings) {
          const norm = normalizeBooking(rawB);
          if (norm && !seenRefs.has(norm.ref.toUpperCase())) {
            seenRefs.add(norm.ref.toUpperCase());
            migratedBookings.push(norm);
          }
        }
      }
    } catch {
      /* ignore corrupted legacy state */
    }
  }

  // 2. Add deterministic initial seeds for any demo refs not yet present
  for (const seed of INITIAL_BOOKING_SEEDS) {
    if (!seenRefs.has(seed.ref.toUpperCase())) {
      seenRefs.add(seed.ref.toUpperCase());
      migratedBookings.push(seed);
    }
  }

  // 3. Read legacy flight overrides from gza.admin.v1
  const migratedOverrides: Record<string, FlightOverride> = {};
  if (adminRaw) {
    try {
      const parsed = JSON.parse(adminRaw);
      if (parsed && typeof parsed === "object" && parsed.overrides && typeof parsed.overrides === "object") {
        for (const [flightId, rawOverride] of Object.entries(parsed.overrides)) {
          if (typeof flightId === "string" && flightId) {
            const clean = sanitizeFlightOverride(rawOverride);
            if (clean) {
              migratedOverrides[flightId] = clean;
            }
          }
        }
      }
    } catch {
      /* ignore corrupted legacy state */
    }
  }

  return {
    schemaVersion: 1,
    bookings: migratedBookings,
    flightOverrides: migratedOverrides,
  };
}

/**
 * Loads the current repository state from localStorage, performing idempotent
 * migration from legacy keys on first run, and safely handling corruption.
 */
export function loadRepoStorage(customStorage?: Storage | null): RepoStorageV1 {
  if (isStudioPreviewActive()) {
    return {
      schemaVersion: 1,
      bookings: [...INITIAL_BOOKING_SEEDS],
      flightOverrides: {},
    };
  }

  const storage = getStorage(customStorage);
  if (!storage) {
    return {
      schemaVersion: 1,
      bookings: [...INITIAL_BOOKING_SEEDS],
      flightOverrides: {},
    };
  }

  try {
    const raw = storage.getItem(REPO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.schemaVersion === 1 &&
        Array.isArray(parsed.bookings) &&
        parsed.flightOverrides &&
        typeof parsed.flightOverrides === "object"
      ) {
        const bookings: Booking[] = [];
        const seenRefs = new Set<string>();

        for (const rawB of parsed.bookings) {
          const norm = normalizeBooking(rawB);
          if (norm && !seenRefs.has(norm.ref.toUpperCase())) {
            seenRefs.add(norm.ref.toUpperCase());
            bookings.push(norm);
          }
        }

        const flightOverrides: Record<string, FlightOverride> = {};
        for (const [id, ov] of Object.entries(parsed.flightOverrides)) {
          if (typeof id === "string" && id) {
            const clean = sanitizeFlightOverride(ov);
            if (clean) flightOverrides[id] = clean;
          }
        }

        return {
          schemaVersion: 1,
          bookings,
          flightOverrides,
        };
      }
    }
  } catch {
    /* Corrupted repository storage — proceed to recover */
  }

  // If no repository state exists or it was corrupted, run one-time idempotent migration
  let storeRaw: string | null = null;
  let adminRaw: string | null = null;
  try {
    storeRaw = storage.getItem(LEGACY_STORE_KEY);
    adminRaw = storage.getItem(LEGACY_ADMIN_KEY);
  } catch {
    /* ignore storage access error */
  }

  const migrated = migrateFromLegacyStores(storeRaw, adminRaw);
  try {
    storage.setItem(REPO_STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    /* ignore storage write error on initial migration */
  }

  return migrated;
}

/**
 * Persists repository state to localStorage.
 * Throws StorageCommitError if storage quota is exceeded or write fails.
 */
export function saveRepoStorage(data: RepoStorageV1, customStorage?: Storage | null): void {
  if (isStudioPreviewActive()) return;
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError(
      "Persistent storage is unavailable. Changes cannot be saved.",
    );
  }
  try {
    storage.setItem(REPO_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    throw new StorageCommitError(
      `Failed to persist repository state to storage: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/** Aliases for explicit semantic naming */
export { loadRepoStorage as loadRepositoriesFromStorage, saveRepoStorage as saveRepositoriesToStorage };

/**
 * Listens for cross-tab storage changes to keep multi-tab state in sync.
 */
export function subscribeToStorage(
  listener: (data: RepoStorageV1) => void,
  customStorage?: Storage | null,
): () => void {
  if (typeof window === "undefined" || !window.addEventListener) return () => {};

  const handler = (event: StorageEvent) => {
    if (event.key === REPO_STORAGE_KEY) {
      const refreshed = loadRepoStorage(customStorage);
      listener(refreshed);
    }
  };

  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("storage", handler);
  };
}

export interface StorageCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  initialData?: RepoStorageV1 | undefined;
  storage?: Storage | null | undefined;
}

/**
 * Deep clones RepoStorageV1 to isolate candidate state during transactional mutations.
 */
function cloneRepoStorage(source: RepoStorageV1): RepoStorageV1 {
  if (typeof structuredClone === "function") {
    return structuredClone(source);
  }
  return {
    schemaVersion: 1,
    bookings: source.bookings.map((b) => ({
      ...b,
      passengers: b.passengers.map((p) => ({ ...p })),
      seats: { ...b.seats },
      extras: { ...b.extras, pax: b.extras?.pax?.map((px) => ({ ...px })) ?? [] },
      contact: { ...b.contact },
      checkedIn: {
        out: [...(b.checkedIn?.out ?? [])],
        in: [...(b.checkedIn?.in ?? [])],
      },
    })),
    flightOverrides: Object.fromEntries(
      Object.entries(source.flightOverrides).map(([k, v]) => [k, { ...v }]),
    ),
  };
}

/**
 * Coherent shared state coordinator and transactional boundary.
 *
 * Ensures BookingRepository and FlightRepository operate over a single,
 * synchronized state tree without mutual cache overwrites, while fully
 * supporting in-memory isolation for Studio previews and transactional rollback
 * on storage commit failure.
 */
export class RepoStorageCoordinator {
  private state: RepoStorageV1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inMemoryOnly: boolean;
  private readonly customStorage?: Storage | null | undefined;
  private listeners: Set<() => void> = new Set();
  private unsubscribeStorage: (() => void) | null = null;

  constructor(options?: StorageCoordinatorOptions) {
    this.inMemoryOnly = Boolean(options?.inMemoryOnly) || isStudioPreviewActive();
    this.customStorage = options?.storage;

    if (this.inMemoryOnly) {
      this.state = options?.initialData ?? {
        schemaVersion: 1,
        bookings: [...INITIAL_BOOKING_SEEDS],
        flightOverrides: {},
      };
    } else {
      this.state = options?.initialData ?? loadRepoStorage(this.customStorage);
      this.unsubscribeStorage = subscribeToStorage((refreshed) => {
        this.state = refreshed;
        this.notifyListeners();
      }, this.customStorage);
    }
  }

  public isInMemory(): boolean {
    return this.inMemoryOnly || isStudioPreviewActive();
  }

  public getState(): RepoStorageV1 {
    return this.state;
  }

  /**
   * Performs an atomic transactional mutation against the shared state.
   *
   * Transaction order:
   * 1. If in-memory (Studio or explicit), applies mutator directly, notifies, and returns.
   * 2. If persistent:
   *    a. Reloads latest storage snapshot into a fresh copy (`tentative`).
   *    b. Executes mutator against tentative state to produce next candidate state.
   *    c. Attempts commit via `saveRepoStorage(tentative)`.
   *    d. If storage commit fails (e.g. QuotaExceededError or storage disabled):
   *       - Rolls back: `this.state` remains 100% UNTOUCHED.
   *       - Listeners are NOT notified.
   *       - Re-throws `StorageCommitError` so caller knows write was not persisted.
   *    e. If storage commit succeeds:
   *       - Adopts `this.state = tentative`.
   *       - Notifies listeners.
   *       - Returns mutator result.
   */
  public mutate<T>(mutator: (state: RepoStorageV1) => T): T {
    return this.conditionalMutate((state) => ({
      commit: true,
      result: mutator(state),
    }));
  }

  /**
   * Performs a bounded conditional transactional mutation against the freshest storage snapshot.
   *
   * When `commit` is false:
   * - Zero storage writes are performed.
   * - Zero subscriber notifications are dispatched.
   * - `this.state` remains untouched in memory.
   * - The mutator's `result` is returned directly.
   *
   * When `commit` is true:
   * - Commits the tentative state to storage (in persistent mode).
   * - Adopts `this.state = tentative`.
   * - Dispatches subscriber notifications.
   * - Transactional rollback on storage failure is preserved.
   */
  public conditionalMutate<T>(
    mutator: (state: RepoStorageV1) => { commit: boolean; result: T },
  ): T {
    if (this.isInMemory()) {
      const tentative = cloneRepoStorage(this.state);
      const { commit, result } = mutator(tentative);
      if (!commit) {
        return result;
      }
      this.state = tentative;
      this.notifyListeners();
      return result;
    }

    const fresh = loadRepoStorage(this.customStorage);
    const tentative = cloneRepoStorage(fresh);

    const { commit, result } = mutator(tentative);

    if (!commit) {
      return result;
    }

    // Commit to persistent storage BEFORE adopting in-memory state or notifying
    saveRepoStorage(tentative, this.customStorage);

    // Transaction committed successfully: publish to memory and subscribers
    this.state = tentative;
    this.notifyListeners();
    return result;
  }

  /** All production writers share an origin-wide lock and reread inside it. */
  public conditionalMutateAsync<T>(
    mutator: (state: RepoStorageV1) => { commit: boolean; result: T },
  ): Promise<T> {
    const run = async () => {
      if (this.isInMemory()) return this.conditionalMutate(mutator);
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      if (!locks) {
        if (typeof window === "undefined") return this.conditionalMutate(mutator);
        throw new StorageCommitError("Repository write coordination unavailable.");
      }
      return locks.request(REPO_STORAGE_KEY, { signal: AbortSignal.timeout(5000) },
        () => this.conditionalMutate(mutator));
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => {});
    return pending;
  }

  public mutateAsync<T>(mutator: (state: RepoStorageV1) => T): Promise<T> {
    return this.conditionalMutateAsync(state => ({ commit: true, result: mutator(state) }));
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("RepoStorageCoordinator listener error:", err);
      }
    }
  }

  public destroy(): void {
    if (this.unsubscribeStorage) {
      this.unsubscribeStorage();
      this.unsubscribeStorage = null;
    }
    this.listeners.clear();
  }
}
