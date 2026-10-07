/**
 * Gaza Gateway — Passenger Storage Coordinator & Migration (`gza.passenger.v1`)
 *
 * Implements authoritative local persistence for passenger account and saved travelers:
 * - Versioned schema (`schemaVersion: 1`).
 * - SSR/Hydration safe (no module-level localStorage access).
 * - Authoritative canonical passenger storage key (`gza.passenger.v1`).
 * - One-way migration from legacy `gza.store.v1` only when canonical key is absent.
 * - Anti-resurrection guarantee: present empty/malformed passenger key is authoritative.
 * - Transactional mutation with rollback and `StorageCommitError` on persistence failure.
 * - Multi-tab synchronization via storage events.
 * - Complete isolation in Studio preview / in-memory mode.
 */

import {
  sanitizePassengerAccount,
  sanitizePassengerStorage,
  sanitizeTravelers,
  type PassengerAccount,
  type PassengerStorageV1,
  type Traveler,
} from "./domain.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";

export type { PassengerStorageV1 };
export const PASSENGER_STORAGE_KEY = "gza.passenger.v1";

export const PASSENGER_SCHEMA_VERSION = 1;
export const LEGACY_STORE_KEY = "gza.store.v1";

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
    return null;
  }
}

export const PASSENGER_LOCK_NAME = "gza:lock:passenger";

export interface PassengerCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  initialData?: PassengerStorageV1 | undefined;
  storage?: Storage | null | undefined;
  locks?: LockManager | undefined;
}

/**
 * Pure migration function from legacy store data.
 * Reads legacy account and travelers ONLY when canonical passenger storage is null.
 * Leaves legacy key completely untouched.
 */
export function migratePassengerFromLegacy(
  legacyStoreRaw: string | null,
): PassengerStorageV1 {
  if (!legacyStoreRaw || typeof legacyStoreRaw !== "string") {
    return {
      schemaVersion: 1,
      account: null,
      travelers: [],
    };
  }

  try {
    const parsed = JSON.parse(legacyStoreRaw) as Record<string, unknown>;
    const account = sanitizePassengerAccount(parsed["account"]);
    const travelers = sanitizeTravelers(parsed["travelers"]);

    return {
      schemaVersion: 1,
      account,
      travelers,
    };
  } catch {
    return {
      schemaVersion: 1,
      account: null,
      travelers: [],
    };
  }
}

/**
 * Authoritative coordinator for canonical passenger storage (`gza.passenger.v1`).
 */
export class PassengerStorageCoordinator {
  private state: PassengerStorageV1;
  private readonly storage: Storage | null;
  private readonly inMemoryOnly: boolean;
  private readonly locks?: LockManager | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private cleanupStorageListener: (() => void) | null = null;

  constructor(options?: PassengerCoordinatorOptions) {
    const isStudio = isStudioPreviewActive();
    this.inMemoryOnly = Boolean(options?.inMemoryOnly || isStudio);
    this.storage = this.inMemoryOnly ? null : getStorage(options?.storage);
    this.locks =
      options?.locks ??
      (typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined);

    if (options?.initialData) {
      this.state = sanitizePassengerStorage(options.initialData);
    } else {
      this.state = this.loadInitialState();
    }

    this.setupStorageListener();
  }

  /**
   * Initializes state on startup.
   * If `gza.passenger.v1` key exists in storage (even if empty or invalid), it is authoritative.
   * Only if the key is completely absent (`getItem === null`) does it migrate from `gza.store.v1`.
   */
  private loadInitialState(): PassengerStorageV1 {
    if (!this.storage || this.inMemoryOnly) {
      return { schemaVersion: 1, account: null, travelers: [] };
    }

    try {
      const canonicalRaw = this.storage.getItem(PASSENGER_STORAGE_KEY);

      if (canonicalRaw !== null) {
        // Canonical key is present. Parse and sanitize directly.
        // It is strictly authoritative: NEVER read or resurrect from legacy store!
        try {
          const parsed = JSON.parse(canonicalRaw);
          return sanitizePassengerStorage(parsed);
        } catch {
          // Corrupt JSON in canonical store -> authoritative fallback to empty state
          return { schemaVersion: 1, account: null, travelers: [] };
        }
      }

      // Canonical key is absent (`canonicalRaw === null`). Perform one-time migration.
      const legacyRaw = this.storage.getItem(LEGACY_STORE_KEY);
      const migrated = migratePassengerFromLegacy(legacyRaw);

      // Persist migrated canonical state if anything was migrated, or initialize key
      try {
        this.storage.setItem(PASSENGER_STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        /* storage may be quota-blocked or read-only; in-memory adoption still functions */
      }

      return migrated;
    } catch {
      return { schemaVersion: 1, account: null, travelers: [] };
    }
  }

  private setupStorageListener(): void {
    if (this.inMemoryOnly || typeof window === "undefined") return;

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== PASSENGER_STORAGE_KEY) return;

      if (!this.storage) return;

      try {
        const raw = this.storage.getItem(PASSENGER_STORAGE_KEY);
        if (raw) {
          const next = sanitizePassengerStorage(JSON.parse(raw));
          this.state = next;
          this.notifySubscribers();
        } else {
          this.state = { schemaVersion: 1, account: null, travelers: [] };
          this.notifySubscribers();
        }
      } catch {
        /* ignore parsing failures from foreign tabs */
      }
    };

    window.addEventListener("storage", handleStorageEvent);
    this.cleanupStorageListener = () => {
      window.removeEventListener("storage", handleStorageEvent);
    };
  }

  public getState(): PassengerStorageV1 {
    return structuredClone(this.state);
  }

  public getAccount(): PassengerAccount | null {
    return this.state.account ? { ...this.state.account } : null;
  }

  public getTravelers(): Traveler[] {
    return this.state.travelers.map((t) => ({ ...t }));
  }

  /**
   * Transactional mutation helper:
   * 1. Clones state into a candidate.
   * 2. Runs the mutator on candidate.
   * 3. Attempts to persist candidate to storage.
   * 4. If save fails, throws `StorageCommitError` and leaves current state unchanged.
   * 5. If save succeeds, adopts candidate into `this.state` and notifies subscribers.
   */
  public async mutate<T>(
    mutator: (candidate: PassengerStorageV1) => T,
    options?: { requireCanonical?: boolean },
  ): Promise<T> {
    const commit = (): T => {
      let current = this.state;
      if (!this.inMemoryOnly) {
        if (!this.storage) {
          if (options?.requireCanonical) {
            throw new StorageCommitError(
              "Cannot save passenger state: storage is unavailable or disabled.",
            );
          }
        } else {
          try {
            const canonicalRaw = this.storage.getItem(PASSENGER_STORAGE_KEY);
            if (canonicalRaw !== null) {
              current = sanitizePassengerStorage(JSON.parse(canonicalRaw));
            } else {
              current = { schemaVersion: 1, account: null, travelers: [] };
            }
          } catch (err) {
            if (options?.requireCanonical) {
              throw new StorageCommitError(
                "Cannot reread canonical passenger state: storage is unavailable or corrupt.",
                err,
              );
            }
            // Fall back to current memory state
          }
        }
      }

      const candidate = structuredClone(current);
      const result = mutator(candidate);

      // Sanitize candidate before persisting
      const sanitizedCandidate = sanitizePassengerStorage(candidate);

      // No-op check: if structurally unchanged, skip writing and notifying
      if (JSON.stringify(sanitizedCandidate) === JSON.stringify(current)) {
        this.state = current;
        return structuredClone(result);
      }

      if (!this.inMemoryOnly) {
        if (!this.storage) {
          throw new StorageCommitError(
            "Cannot save passenger state: storage is unavailable or disabled.",
          );
        }

        try {
          this.storage.setItem(PASSENGER_STORAGE_KEY, JSON.stringify(sanitizedCandidate));
        } catch (err) {
          throw new StorageCommitError(
            `Failed to commit passenger changes to storage: ${err instanceof Error ? err.message : String(err)}`,
            err,
          );
        }
      }

      // Success: adopt candidate into memory and notify subscribers
      this.state = sanitizedCandidate;
      this.notifySubscribers();
      return structuredClone(result);
    };

    const run = async (): Promise<T> => {
      if (this.inMemoryOnly || !this.locks) {
        return commit();
      }
      return this.locks.request(PASSENGER_LOCK_NAME, async () => {
        return commit();
      });
    };

    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  /** Read the exact account under the passenger command lock; never migrate or write. */
  public async withAccountIdentity<T>(expectedEmail: string, command: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const execute = async (): Promise<T> => {
        let current = this.state;
        if (!this.inMemoryOnly) {
          if (!this.storage) throw new StorageCommitError("Passenger storage is unavailable.");
          try {
            const raw = this.storage.getItem(PASSENGER_STORAGE_KEY);
            current = raw === null
              ? { schemaVersion: 1, account: null, travelers: [] }
              : sanitizePassengerStorage(JSON.parse(raw));
          } catch (cause) {
            throw new StorageCommitError("Canonical passenger state is unavailable or corrupt.", cause);
          }
        }
        const expected = expectedEmail.trim().toLowerCase();
        if (!expected || current.account?.email.trim().toLowerCase() !== expected) {
          throw new StorageCommitError("The target account is no longer the canonical account.");
        }
        return command();
      };
      if (this.inMemoryOnly || !this.locks) return execute();
      return this.locks.request(PASSENGER_LOCK_NAME, execute);
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifySubscribers(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("PassengerStorageCoordinator subscriber error:", err);
      }
    }
  }

  public dispose(): void {
    if (this.cleanupStorageListener) {
      this.cleanupStorageListener();
      this.cleanupStorageListener = null;
    }
    this.listeners.clear();
  }
}
